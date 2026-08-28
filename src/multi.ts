/**
 * Interface du mode multijoueur — salon + boucle de match cliente.
 * Aucune scène sur le fil : reconstruction locale via buildMultiRound.
 */

import type { Glyph, PlayerPublic, RoomSettings, RoundOutcome, ServerMsg } from "../shared/protocol";
import {
  CHAT_MAX_LEN,
  DEFAULT_SETTINGS,
  EMPTY_STATS,
  EMOTE_COOLDOWN_MS,
  LIVES_CHOICES,
  MAX_PLAYERS,
  ROTATION_CHOICES,
  SPEED_CHOICES,
} from "../shared/protocol";
import type { Action, OneRule, Outcome, Round, RoundProgress } from "./engine/types";
import { buildMultiRound } from "./engine/multiround";
import { windowMs } from "./engine/difficulty";
import { resolveAction } from "./engine/resolve";
import { ruleById } from "./engine/rules";
import * as P from "./game/progress";
import { track } from "./analytics";
import { cleanEnv } from "./env";
import { NetClient } from "./net/client";
import { glyphFor, glyphSvg, glyphVariant } from "./net/glyph";
import type { Hud } from "./render/hud";
import { livesDots } from "./render/hud";
import { musicApi, sfx, unlock } from "./audio";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Libellés d'interface uniquement — le fil ne transporte que l'index. */
const EMOTE_LABELS = ["SALUT", "BRAVO", "HA !", "AÏE", "VU VENIR", "NON…"] as const;

export type MultiScreen = "multi-id" | "multi-join" | "multi-lobby" | "multi-end";

export type ShowFn = (id: MultiScreen | "home" | null) => void;

export type MultiFeel = { consumed: false } | { consumed: true; feel?: Outcome };

export type MultiDraw = {
  round: Round | null;
  rule: OneRule | null;
  ratio?: number;
  reveal: boolean;
};

/** Effets scène consommés une fois par main (gerbe / flash / kick). */
export type MultiFx = {
  burstScreen?: boolean;
  flashViolet?: boolean;
  kick?: number;
};

export type PlateFlash = "ok" | "trap" | "dead" | "idle";

export type MultiApi = {
  available: boolean;
  exitToMenu: () => void;
  openFromInvite: (code: string) => void;
  isPlayingMulti: () => boolean;
  /** Manche locale courante (pour hit-test), sans effet de bord HUD. */
  peekRound: () => Round | null;
  trySendMultiAction: (action: Action) => MultiFeel;
  /** Met à jour HUD / compte à rebours ; retourne l'état de dessin ou null. */
  syncFrame: () => MultiDraw | null;
  /** Consomme les effets scène en attente (appelé par main après syncFrame). */
  takeFx: () => MultiFx | null;
  /** Flash UI d'une plaque (délègue à renderPlates). */
  flashPlate: (playerId: string, kind?: PlateFlash) => void;
  /** Vrai uniquement quand un salon est rejoint — Enter ouvre alors le chat. */
  chatAvailable: () => boolean;
  focusChat: () => void;
  blurChat: () => void;
  /** Synchronise le déploiement du chat (écran ouvert vs manche). */
  onScreen: (id: string | null) => void;
};

type MatchState = {
  seed: number;
  rules: Record<string, string>;
  phase: "countdown" | "round" | "frozen";
  firstRoundAt: number;
  idx: number;
  startAt: number;
  deadline: number;
  round: Round | null;
  rule: OneRule | null;
  progress: RoundProgress;
  /** Entrées locales coupées jusqu'au prochain "round" (verdict ou anticipé terminal). */
  localDone: boolean;
  preview: Outcome | null;
  authority: RoundOutcome | null;
  /** Horloge serveur : fin d'affichage du bandeau rotation. */
  rotationUntil: number;
  lives: number;
  score: number;
  spectator: boolean;
  players: PlayerPublic[];
  /** Joueur dont on reconstruit la scène (soi ou cible watch). */
  watchingId: string | null;
  maxLives: number;
  /** Date serveur de reprise (verdict) — null si fin de match. */
  nextRoundAt: number | null;
  /** Pause mesurée à la réception du verdict (ms). */
  pauseMs: number;
  /** Une seule annonce DUEL par match. */
  duelAnnounced: boolean;
  /** Overlay tempo : révélation de règle, kill-cam ou duel. */
  drama: "off" | "rule" | "killcam" | "duel";
  /** Scène du mort (kill-cam) — révélation post-mortem. */
  camRound: Round | null;
  camRule: OneRule | null;
  /** Relancer la musique après cut() d'élimination. */
  musicNeedsRestart: boolean;
  /** Règle qui prend effet à la manche suivante, à annoncer pendant la pause. */
  rotationRule: OneRule | null;
  /**
   * Rapport entre MA fenêtre et celle diffusée à tout le salon.
   *
   * L'échéance envoyée par le serveur vaut pour la manche partagée, mais une
   * règle peut raccourcir la fenêtre personnelle — L'ACCÉLÉRATION retranche
   * 30 %. Sans ce facteur, la barre montrait du temps restant alors que le
   * serveur avait déjà fermé la fenêtre : le joueur respectait la consigne et
   * rien ne se validait.
   */
  spanFactor: number;
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Lit un code d'invitation `#j=XXXX`, puis le retire de la barre d'adresse. */
export function readInvite(): string | null {
  if (typeof location === "undefined") return null;
  const m = /[#&]j=([A-Za-z0-9]+)/i.exec(location.hash);
  if (!m) return null;
  const code = m[1]!.toUpperCase().slice(0, 4);
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch {
    /* environnement sans history */
  }
  return code.length === 4 ? code : null;
}

function inviteUrl(code: string): string {
  const base = typeof location !== "undefined" ? location.origin + location.pathname : "";
  return `${base}#j=${code}`;
}

/**
 * Nom enregistré, ou null.
 *
 * Ne demande plus rien : la saisie passe par l'écran d'identité. Un `prompt()`
 * natif ouvrait une boîte système au milieu du jeu — hors identité visuelle,
 * bloquante, et sur téléphone elle recouvre l'écran sans prévenir. C'était la
 * toute première chose que rencontrait un joueur invité par un ami.
 */
function savedName(): string | null {
  return P.load().ranked.name || null;
}

/** Nombre de signes proposés au choix. Assez pour choisir, pas pour hésiter. */
const GLYPH_CHOICES = 8;

/** Le signe du joueur : la variante qu'il a retenue de son identifiant local. */
function myGlyph(): Glyph {
  const s = P.load();
  return glyphVariant(s.anonId, s.multi.glyph);
}

function setJoinErr(msg: string | null): void {
  const el = $("multiJoinErr");
  if (!msg) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
}

const SPEED_LABEL: Record<number, string> = {
  1.7: "DÉCOUVERTE",
  1.3: "LENT",
  1: "NORMAL",
  0.8: "VITE",
  0.65: "ÉCLAIR",
};
const ROTATION_LABEL: Record<number, string> = {
  4: "×4",
  8: "×8",
  16: "×16",
  999: "JAMAIS",
};

function playerGlyph(p: PlayerPublic) {
  return p.glyph ?? glyphFor(p.id);
}

function renderLobby(
  code: string,
  players: PlayerPublic[],
  myId: string,
  settings: RoomSettings,
  inMatch: boolean,
  muted: Set<string>,
  onToggleMute: (playerId: string) => void,
  onKick: (playerId: string) => void,
): void {
  $("multiLobbyCode").textContent = code;
  const list = $("multiPlayers");
  list.innerHTML = "";
  const me = players.find((p) => p.id === myId);
  $<HTMLButtonElement>("btnMultiStart").classList.toggle("hidden", !me?.host || inMatch);

  for (const p of players) {
    const row = document.createElement("div");
    row.className =
      "lobbyrow" +
      (p.host ? " is-host" : "") +
      (!p.connected ? " is-off" : "");
    const ruleName = ruleById(p.ruleId)?.name ?? (p.ruleId || "—");
    row.innerHTML =
      `<span class="lobbyrow__name">` +
      `<span class="lobbyrow__glyph"></span>` +
      `<span class="lobbyrow__name-text"></span>` +
      `</span>` +
      `<span class="lobbyrow__rule"></span>` +
      `<span class="lobbyrow__meta"></span>`;
    row.querySelector(".lobbyrow__glyph")!.innerHTML = glyphSvg(playerGlyph(p), 16);
    row.querySelector<HTMLElement>(".lobbyrow__name-text")!.textContent = p.name;
    row.querySelector<HTMLElement>(".lobbyrow__rule")!.textContent = ruleName;
    const meta: string[] = [];
    if (p.host) meta.push("HÔTE");
    if (p.spectator) meta.push("SPECT.");
    if (!p.connected) meta.push("HORS LIGNE");
    meta.push(`♥${p.lives}`);
    row.querySelector<HTMLElement>(".lobbyrow__meta")!.textContent = meta.join(" · ");
    if (p.id !== myId) {
      const acts = document.createElement("div");
      acts.className = "lobbyrow__acts";
      const muteBtn = document.createElement("button");
      muteBtn.type = "button";
      muteBtn.className = "chip" + (muted.has(p.id) ? " is-on" : "");
      muteBtn.textContent = "SOURDINE";
      muteBtn.addEventListener("click", () => onToggleMute(p.id));
      acts.appendChild(muteBtn);
      if (me?.host) {
        const kickBtn = document.createElement("button");
        kickBtn.type = "button";
        kickBtn.className = "chip";
        kickBtn.textContent = "EXCLURE";
        kickBtn.addEventListener("click", () => onKick(p.id));
        acts.appendChild(kickBtn);
      }
      row.appendChild(acts);
    }
    list.appendChild(row);
  }

  /*
   * État vide du salon.
   *
   * Seul dans un salon, l'écran affichait « EN ATTENTE » et un bouton LANCER
   * en évidence : il proposait de démarrer une partie multijoueur à un joueur,
   * et reléguait au second plan la seule action qui a du sens — inviter.
   * L'écran doit dire ce qu'il faut faire, pas seulement ce qui se passe.
   */
  const seul = players.length <= 1;
  $("multiLobbyTitle").textContent = seul ? "INVITE QUELQU'UN" : "EN ATTENTE";
  $("multiInviteHint").textContent = seul
    ? "ENVOIE LE LIEN — LA PARTIE SE LANCE DÈS QUE QUELQU'UN ARRIVE"
    : `${players.length} JOUEURS · LIEN D'INVITATION EN UN CLIC`;
  $("btnMultiInvite").classList.toggle("btn--primary", seul);
  $("btnMultiStart").classList.toggle("btn--primary", !seul);

  renderSettings(settings, !!me?.host, inMatch);
}

function renderSettings(settings: RoomSettings, isHost: boolean, locked: boolean): void {
  const box = $("multiSettings");
  box.classList.toggle("is-guest", !isHost);
  // Dire qui décide, plutôt que de laisser un invité cliquer sans effet et
  // conclure que l'interface est cassée.
  $("settingsHint").textContent = locked
    ? "RÉGLAGES VERROUILLÉS PENDANT UN MATCH"
    : isHost
      ? "TU DÉCIDES POUR TOUT LE SALON · TOUCHE UNE OPTION POUR LA CHANGER"
      : "SEUL CELUI QUI A CRÉÉ LE SALON PEUT CHANGER CES RÉGLAGES";
  box.classList.toggle("is-locked", locked);

  const fill = (
    id: string,
    choices: readonly number[],
    current: number,
    labelOf: (n: number) => string,
  ): void => {
    const el = $(id);
    el.innerHTML = "";
    for (const v of choices) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (v === current ? " is-on" : "");
      chip.dataset.value = String(v);
      chip.textContent = labelOf(v);
      chip.disabled = locked || !isHost;
      el.appendChild(chip);
    }
  };

  fill("optSpeed", SPEED_CHOICES, settings.speed, (n) => SPEED_LABEL[n] ?? String(n));
  fill("optLives", LIVES_CHOICES, settings.lives, (n) => String(n));
  fill(
    "optRotation",
    ROTATION_CHOICES,
    settings.rotationEvery,
    (n) => ROTATION_LABEL[n] ?? String(n),
  );
}

function toWire(
  action: Action,
): { k: "c"; i: number | null } | { k: "k"; key: string } | { k: "r"; key: string } {
  if (action.kind === "click") return { k: "c", i: action.ent?.idx ?? null };
  if (action.kind === "key") return { k: "k", key: action.key };
  return { k: "r", key: action.key };
}

/**
 * L'action TELLE QUE LE SERVEUR LA VERRA.
 *
 * Le fil ne transporte qu'un index de pièce : le serveur reconstruit donc la
 * position à partir de l'entité, pas du point cliqué. Si le client prévisualise
 * avec les coordonnées du clic, les deux peuvent diverger — cliquer le bord
 * droit d'une pièce centrée juste dans la zone interdite de LE GAUCHER donnerait
 * un aperçu « tenu » suivi d'un verdict « infraction ».
 *
 * Un aperçu qui contredit le verdict, c'est exactement « le jeu triche » : le
 * seul risque que le projet considère comme fatal. On juge donc localement sur
 * la même chose que le serveur.
 */
function vueServeur(action: Action): Action {
  if (action.kind !== "click") return action;
  return action.ent
    ? { ...action, x: action.ent.x, y: action.ent.y }
    : { ...action, x: Number.NaN, y: Number.NaN };
}

function previewLabel(o: Outcome): string {
  if (o.kind === "survive") return o.trap ? "PIÈGE DÉJOUÉ…" : "TENU…";
  if (o.kind === "death") return o.reason;
  return "";
}

/** Le libellé du tampon se déduit de la raison — jamais d'un contexte
 *  d'appel, sinon le grand élément finit par contredire le petit. */
function stampForReason(reason: string): string {
  const r = reason.toUpperCase();
  if (r.includes("TEMPS") || r.includes("ÉCOUL")) return "TROP LENT";
  if (r.includes("RÈGLE") || r.includes("INTERDIT")) return "INFRACTION";
  return "RATÉ";
}

function stampFor(o: RoundOutcome): string {
  if (o.kind !== "death") return "RATÉ";
  return stampForReason(o.reason);
}

function outcomeFlash(o: RoundOutcome): PlateFlash {
  if (o.kind === "survive") return o.trap ? "trap" : "ok";
  if (o.kind === "death") return "dead";
  return "idle";
}

/** Conserve l'ordre d'arrivée : mises à jour in-place, nouveaux en fin. */
function mergePlayers(prev: PlayerPublic[], next: PlayerPublic[]): PlayerPublic[] {
  const map = new Map(next.map((p) => [p.id, p]));
  const ordered: PlayerPublic[] = [];
  for (const p of prev) {
    const cur = map.get(p.id);
    if (cur) {
      ordered.push(cur);
      map.delete(p.id);
    }
  }
  for (const p of next) {
    if (map.has(p.id)) ordered.push(p);
  }
  return ordered;
}

export function initMulti(show: ShowFn, hud: Hud): MultiApi {
  // Même nettoyage que pour le collecteur : une URL avec un BOM devant donne
  // une socket qui ne s'ouvre jamais, sans message lisible.
  const wsUrl = cleanEnv(import.meta.env.VITE_WS_URL as string | undefined);
  const btnMulti = $<HTMLButtonElement>("btnMulti");
  const platesEl = $("plates");
  const platesL = $("platesL");
  const platesR = $("platesR");
  const emotesEl = $("emotes");
  const chatEl = $("chat");
  const chatLog = $("chatLog");
  const chatForm = $("chatForm") as HTMLFormElement;
  const chatInput = $<HTMLInputElement>("chatInput");
  chatInput.maxLength = CHAT_MAX_LEN;
  /** Où le chat retourne quand il n'est ancré nulle part : la couche flottante. */
  const chatFloat = chatEl.parentElement!;
  const chatSlot = $("chatSlot");

  const TOUCH_ONLY =
    typeof matchMedia !== "undefined" &&
    matchMedia("(hover: none) and (pointer: coarse)").matches;

  /* Le seuil des deux colonnes, tenu par la feuille de style (`--wide`). */
  const wideScreen = typeof matchMedia !== "undefined" ? matchMedia("(min-width: 900px)") : null;

  type ChatLine = { playerId: string; name: string; text: string; glyph: Glyph };
  const chatLines: ChatLine[] = [];
  /** Sourdine locale — jamais envoyée, jamais persistée. */
  const muted = new Set<string>();
  let chatFadeTimer: ReturnType<typeof setTimeout> | null = null;
  let uiScreen: string | null = "home";

  function clearPlateCols(): void {
    platesL.innerHTML = "";
    platesR.innerHTML = "";
  }

  const noop: MultiApi = {
    available: false,
    exitToMenu: () => {},
    openFromInvite: () => {},
    isPlayingMulti: () => false,
    peekRound: () => null,
    trySendMultiAction: () => ({ consumed: false }),
    syncFrame: () => null,
    takeFx: () => null,
    flashPlate: () => {},
    chatAvailable: () => false,
    focusChat: () => {},
    blurChat: () => {},
    onScreen: () => {},
  };

  if (!wsUrl) {
    btnMulti.classList.add("hidden");
    return noop;
  }
  const url: string = wsUrl;

  let net: NetClient | null = null;
  let roomCode = "";
  let connecting = false;
  /** Le serveur a-t-il expliqué lui-même l'échec de la tentative en cours ? */
  let errFromServer = false;
  /**
   * Dernier salon fréquenté, CONSERVÉ à travers les coupures.
   *
   * `roomCode` est remis à zéro dès qu'on quitte l'écran de jeu ; il ne peut
   * donc pas servir à revenir. Celui-ci n'est effacé que sur un départ
   * volontaire — quitter, être exclu, revenir au menu.
   */
  let lastRoomCode = "";
  let rejoining = false;
  let unsub: (() => void) | null = null;
  let match: MatchState | null = null;
  /** Dernière liste salon — ordre stable pour les plaques. */
  let lastPlayers: PlayerPublic[] = [];
  let roomSettings: RoomSettings = { ...DEFAULT_SETTINGS };
  let lobbyInMatch = false;
  const watchBar = $("watchBar");
  const watchTargets = $("watchTargets");
  /** Flashes de verdict (ok/trap/dead/idle) jusqu'à expiration ou prochaine manche. */
  const platePulse = new Map<string, PlateFlash>();
  const pulseTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const emoteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let lastEmoteSentAt = 0;
  let emoteCooldownTimer: ReturnType<typeof setTimeout> | null = null;
  /** Empêche le "room" post-match d'écraser l'écran FIN. */
  let endScreenOpen = false;
  const dramaEl = $("drama");
  const dramaEyebrow = $("dramaEyebrow");
  const dramaNames = $("dramaNames");
  const dramaRule = $("dramaRule");
  const dramaReason = $("dramaReason");
  const dramaExtra = $("dramaExtra");
  const timerEl = $("timer");
  let pendingFx: MultiFx | null = null;

  function queueFx(fx: MultiFx): void {
    pendingFx = { ...pendingFx, ...fx };
  }

  function takeFx(): MultiFx | null {
    const fx = pendingFx;
    pendingFx = null;
    return fx;
  }

  function hideDrama(): void {
    dramaEl.classList.add("hidden");
    dramaEl.classList.remove(
      "drama--kill",
      "drama--elim",
      "drama--duel",
      "drama--rule",
      "drama--rotation",
    );
    dramaEl.setAttribute("aria-hidden", "true");
    dramaEyebrow.textContent = "";
    dramaNames.textContent = "";
    dramaRule.textContent = "";
    dramaReason.textContent = "";
    dramaExtra.textContent = "";
    timerEl.classList.remove("is-recharge");
    if (match) {
      match.drama = "off";
      match.camRound = null;
      match.camRule = null;
    }
  }

  function showKillCam(
    victims: { player: PlayerPublic; reason: string; eliminated: boolean }[],
    focusRule: OneRule,
    focusRound: Round,
    elim: boolean,
    aliveCount: number,
  ): void {
    if (!match) return;
    match.drama = "killcam";
    match.camRound = focusRound;
    match.camRule = focusRule;
    dramaEl.classList.remove("hidden", "drama--duel");
    dramaEl.classList.add("drama--kill");
    dramaEl.classList.toggle("drama--elim", elim);
    dramaEl.setAttribute("aria-hidden", "false");
    dramaEyebrow.textContent = elim ? "ÉLIMINÉ" : "";
    dramaNames.textContent = victims.map((v) => v.player.name).join(" · ");
    dramaRule.textContent = focusRule.name;
    const primary = victims[0]!;
    dramaReason.textContent = primary.reason.toUpperCase();
    dramaExtra.textContent =
      elim && aliveCount > 0 ? `ILS NE SONT PLUS QUE ${aliveCount}` : "";
    timerEl.classList.add("is-recharge");
    /*
     * Le tampon ne s'abat que sur MA mort.
     *
     * Il tombait aussi quand quelqu'un d'autre mourait : un « INFRACTION »
     * plein écran chez un joueur qui, lui, venait de réussir sa manche.
     * Rapporté en soirée — « lorsqu'un joueur meurt, l'information s'affiche
     * pour tout le monde », et les notifications se superposaient.
     *
     * La kill-cam, elle, reste collective : c'est le spectacle, et elle NOMME
     * le mort. Le tampon, lui, est un verdict personnel.
     */
    const meVictim = victims.find((v) => v.player.id === net?.myId);
    if (meVictim) hud.showStamp(stampForReason(meVictim.reason));
    else hud.hideStamp();
  }

  /**
   * Révélation de la règle unique, en plein cadre, pendant le compte à rebours.
   *
   * La règle unique EST le jeu : un joueur qui ne l'a pas lue joue en aveugle.
   * En solo elle a un écran entier ; en multijoueur elle n'était qu'une ligne
   * dans le bandeau du haut, posée en même temps que dix autres choses — donc
   * personne ne la lisait, et on découvrait sa contrainte en mourant.
   *
   * Le compte à rebours dure trois secondes pendant lesquelles le centre est
   * libre et le jeu ne demande rien. C'est le même principe que la kill-cam :
   * pendant la pause, le centre fait le spectacle. On réutilise donc le même
   * panneau — pas un mécanisme de plus à entretenir.
   */
  function showRuleReveal(rule: OneRule, rotation = false): void {
    if (!match) return;
    match.drama = "rule";
    match.camRound = null;
    match.camRule = null;
    dramaEl.classList.remove("hidden", "drama--kill", "drama--elim", "drama--duel");
    dramaEl.classList.add("drama--rule");
    dramaEl.classList.toggle("drama--rotation", rotation);
    dramaEl.setAttribute("aria-hidden", "false");
    dramaEyebrow.textContent = rotation ? "TA RÈGLE CHANGE" : "TA RÈGLE UNIQUE";
    dramaNames.textContent = rule.name;
    // Le brief EN CLAIR, pas seulement le nom : « LE DALTONIEN » ne dit rien
    // à qui ne l'a jamais rencontré, et c'est justement le cas d'un invité.
    dramaReason.textContent = rule.brief;
    dramaRule.textContent = "";
    dramaExtra.textContent = "";
    timerEl.classList.remove("is-recharge");
    hud.hideStamp();
  }

  function showDuel(a: PlayerPublic, b: PlayerPublic): void {
    if (!match) return;
    match.drama = "duel";
    match.camRound = null;
    match.camRule = null;
    dramaEl.classList.remove("hidden", "drama--kill", "drama--elim");
    dramaEl.classList.add("drama--duel");
    dramaEl.setAttribute("aria-hidden", "false");
    dramaEyebrow.textContent = "DUEL";
    dramaNames.textContent = `${a.name}  ·  ${b.name}`;
    dramaRule.textContent = "";
    dramaReason.textContent = "";
    dramaExtra.textContent = "";
    timerEl.classList.remove("is-recharge");
    hud.hideStamp();
  }

  function syncFooter(): void {
    if (!match || !net) return;
    const tid = viewTargetId();
    const shown = tid === net.myId ? null : match.players.find((p) => p.id === tid);
    if (isSpectating() && shown) {
      hud.setFooterLives(shown.score, Math.max(0, shown.lives), match.maxLives, "SPECTATEUR");
      const rotating = match.rotationUntil > 0 && net.clock.now() < match.rotationUntil;
      if (!rotating) hud.setMeta(`JE REGARDE ${shown.name}`);
      return;
    }
    hud.setFooterLives(match.score, Math.max(0, match.lives), match.maxLives, "MULTI");
  }

  function setPlatesVisible(on: boolean): void {
    platesEl.classList.toggle("hidden", !on);
    emotesEl.classList.toggle("hidden", !on);
    if (!on) watchBar.classList.add("hidden");
  }

  function isSpectating(): boolean {
    return !!match && (match.lives <= 0 || match.spectator);
  }

  function viewTargetId(): string {
    if (!match || !net) return "";
    if (!isSpectating()) return net.myId;
    if (match.watchingId && match.players.some((p) => p.id === match!.watchingId && p.lives > 0)) {
      return match.watchingId;
    }
    const alive = match.players.find((p) => p.lives > 0 && p.id !== net!.myId);
    return alive?.id ?? net.myId;
  }

  function rebuildViewRound(): void {
    if (!match || !net || match.idx < 0) return;
    const viewId = viewTargetId();
    const rid = match.rules[viewId] ?? match.rules[net.myId];
    const rule = rid ? ruleById(rid) : match.rule;
    if (!rule) {
      /*
       * Aucune règle résoluble. Le cas concret est un décalage de versions :
       * le front (Vercel) et le serveur de salons (Fly) se déploient
       * séparément, donc le serveur peut nommer une règle que ce bundle ne
       * connaît pas. PROTOCOL_VERSION protège le protocole, pas la table des
       * règles.
       *
       * Sortir en `return` laissait `match.round` sur la manche PRÉCÉDENTE,
       * alors que beginRound a déjà avancé match.idx : le joueur voyait et
       * cliquait la scène N−1 pendant que le serveur jugeait la N. Verdicts
       * incompréhensibles, et aucune erreur nulle part.
       *
       * Un champ vide est un mauvais moment ; une scène fausse est un mensonge.
       */
      match.round = null;
      return;
    }
    match.rule = rule;
    match.round = buildMultiRound(match.seed, match.idx, rule);
    hud.setRule(rule);
  }

  function renderWatchBar(): void {
    if (!match || !net || !isSpectating()) {
      watchBar.classList.add("hidden");
      watchTargets.innerHTML = "";
      return;
    }
    watchBar.classList.remove("hidden");
    watchTargets.innerHTML = "";
    const current = viewTargetId();
    for (const p of match.players) {
      if (p.lives <= 0 && p.id !== current) continue;
      /*
       * On ne se propose jamais soi-même comme cible.
       *
       * Le filtre ne visait que le joueur ÉLIMINÉ (`lives <= 0`) — mais un
       * spectateur arrivé en cours de partie n'a pas de siège, donc pas de
       * vies décomptées : il se retrouvait dans sa propre liste de cibles,
       * proposé de se regarder lui-même alors qu'il ne joue pas. C'est
       * `isSpectating()` qui décide, pas le nombre de vies.
       */
      if (p.id === net.myId) continue;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (p.id === current ? " is-on" : "");
      chip.dataset.id = p.id;
      chip.innerHTML = `<span class="lobbyrow__glyph"></span><span></span>`;
      chip.querySelector(".lobbyrow__glyph")!.innerHTML = glyphSvg(playerGlyph(p), 14);
      chip.querySelector("span:last-child")!.textContent = p.name;
      watchTargets.appendChild(chip);
    }
  }

  function setWatch(playerId: string): void {
    if (!match || !net || !isSpectating()) return;
    match.watchingId = playerId;
    net.watch(playerId);
    rebuildViewRound();
    renderWatchBar();
    sfx.ui();
  }

  function clearPulseTimers(): void {
    for (const t of pulseTimers.values()) clearTimeout(t);
    pulseTimers.clear();
  }

  function clearEmoteTimers(): void {
    for (const t of emoteTimers.values()) clearTimeout(t);
    emoteTimers.clear();
  }

  function screenOpen(): boolean {
    return uiScreen !== null;
  }

  /**
   * Le chat n'existe PAS pendant une manche.
   *
   * Il était disponible en permanence, replié par-dessus l'aire de jeu.
   * Constaté en soirée : il ne s'affichait que partiellement, mangeait une
   * partie de l'écran, les messages n'apparaissaient qu'en envoyant des « . »,
   * et on ne pouvait pas les faire défiler. Un canal de discussion à moitié
   * fonctionnel pendant une fenêtre d'une seconde et demie ne rend service à
   * personne — il gêne.
   *
   * Il ne vit donc plus que là où un écran est ouvert : salon d'attente et fin
   * de match. Les messages reçus pendant la partie ne sont pas perdus, ils
   * s'affichent à la reprise.
   *
   * Conséquence heureuse : le piège du clavier disparaît. `Entrée` ne peut plus
   * détourner les touches de jeu, puisqu'il n'y a rien à ouvrir en manche.
   */
  function chatAvailable(): boolean {
    return !!roomCode && !!net?.connected && screenOpen();
  }

  function chatExpanded(): boolean {
    return screenOpen() || document.activeElement === chatInput;
  }

  function clearChatFade(): void {
    if (chatFadeTimer) {
      clearTimeout(chatFadeTimer);
      chatFadeTimer = null;
    }
  }

  /**
   * Le chat rejoint la colonne du salon, ou reprend sa place flottante.
   *
   * Uniquement là où le salon a DEUX colonnes. En une seule, la colonne de
   * droite passe sous les réglages et les boutons : le chat se retrouverait à
   * 930 px du haut sur un 375×667, alors que la couche flottante le garde à
   * portée de pouce sans rien coûter. L'ancrage est un gain d'écran large.
   *
   * Un déplacement de nœud perd le focus : on le rend, sinon quelqu'un qui
   * tape au moment où le salon se peint voit son curseur disparaître.
   */
  function dockChat(): void {
    const ancrable = uiScreen === "multi-lobby" && (wideScreen?.matches ?? false);
    const cible = ancrable ? chatSlot : chatFloat;
    if (chatEl.parentElement === cible) return;
    const avaitLeFocus = document.activeElement === chatInput;
    cible.appendChild(chatEl);
    chatEl.classList.toggle("chat--docked", cible === chatSlot);
    if (avaitLeFocus) chatInput.focus();
  }

  function renderChatLog(): void {
    const expanded = chatExpanded();
    // Ancré, le chat a une colonne entière : il garde l'historique du salon
    // plutôt que les huit dernières lignes d'une couche qui se replie.
    const garde = chatEl.classList.contains("chat--docked") ? 40 : expanded ? 8 : 3;
    const visible = chatLines.slice(-garde);
    chatLog.innerHTML = "";
    for (const line of visible) {
      const row = document.createElement("div");
      row.className = "chat__line";
      row.innerHTML =
        `<span class="lobbyrow__glyph"></span>` +
        `<span class="chat__name"></span>` +
        `<span class="chat__text"></span>`;
      row.querySelector(".lobbyrow__glyph")!.innerHTML = glyphSvg(line.glyph, 14);
      row.querySelector<HTMLElement>(".chat__name")!.textContent = line.name;
      row.querySelector<HTMLElement>(".chat__text")!.textContent = line.text;
      chatLog.appendChild(row);
    }
    // Le dernier message reste visible : la colonne défile, pas le lecteur.
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function syncChatChrome(): void {
    dockChat();
    if (!chatAvailable()) {
      chatEl.classList.add("hidden");
      chatEl.classList.remove("is-collapsed");
      clearChatFade();
      return;
    }
    chatEl.classList.remove("hidden");
    const expanded = chatExpanded();
    chatEl.classList.toggle("is-collapsed", !expanded);
    renderChatLog();
    if (expanded) {
      clearChatFade();
    } else {
      clearChatFade();
      chatFadeTimer = setTimeout(() => {
        chatFadeTimer = null;
        if (!chatExpanded()) chatLog.innerHTML = "";
      }, 6000);
    }
  }

  function clearChat(): void {
    chatLines.length = 0;
    clearChatFade();
    chatLog.innerHTML = "";
    chatInput.value = "";
    chatEl.classList.add("hidden");
    chatEl.classList.remove("is-collapsed");
  }

  function focusChat(): void {
    if (!chatAvailable()) return;
    // Sur tactile, aucune saisie pendant une manche : le clavier logiciel
    // sur une fenêtre de 800 ms éliminerait le joueur pour un « bravo ».
    if (TOUCH_ONLY && !screenOpen()) return;
    chatEl.classList.remove("hidden", "is-collapsed");
    chatInput.focus();
    syncChatChrome();
  }

  function blurChat(): void {
    chatInput.blur();
    syncChatChrome();
  }

  function onScreen(id: string | null): void {
    uiScreen = id;
    syncChatChrome();
  }

  function paintLobby(): void {
    if (!roomCode) return;
    renderLobby(
      roomCode,
      lastPlayers,
      net?.myId ?? "",
      roomSettings,
      lobbyInMatch,
      muted,
      (playerId) => {
        if (muted.has(playerId)) muted.delete(playerId);
        else muted.add(playerId);
        paintLobby();
      },
      (playerId) => {
        net?.kick(playerId);
      },
    );
  }

  function showEmote(playerId: string, k: number): void {
    if (muted.has(playerId)) return;
    const plate = platesEl.querySelector<HTMLElement>(`[data-id="${playerId}"]`);
    if (!plate) return;
    let bubble = plate.querySelector<HTMLElement>(".plate__emote");
    if (!bubble) {
      bubble = document.createElement("span");
      bubble.className = "plate__emote";
      plate.appendChild(bubble);
    }
    bubble.textContent = EMOTE_LABELS[k] ?? "";
    // Même relance d'animation que hud.showStamp : deux réactions coup sur coup
    // doivent se voir toutes les deux.
    bubble.classList.remove("is-on");
    void bubble.offsetWidth;
    bubble.classList.add("is-on");
    const prev = emoteTimers.get(playerId);
    if (prev) clearTimeout(prev);
    emoteTimers.set(
      playerId,
      setTimeout(() => {
        bubble!.classList.remove("is-on");
        emoteTimers.delete(playerId);
      }, 900),
    );
  }

  function setEmoteButtonsEnabled(on: boolean): void {
    for (const btn of Array.from(emotesEl.querySelectorAll<HTMLButtonElement>("button.chip"))) {
      btn.disabled = !on;
    }
  }

  function populateEmotes(): void {
    emotesEl.innerHTML = "";
    EMOTE_LABELS.forEach((label, k) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.k = String(k);
      btn.textContent = label;
      btn.setAttribute("aria-label", label);
      emotesEl.appendChild(btn);
    });
  }

  function schedulePulseClear(playerId: string, kind: PlateFlash, ms: number): void {
    const prev = pulseTimers.get(playerId);
    if (prev) clearTimeout(prev);
    pulseTimers.set(
      playerId,
      setTimeout(() => {
        pulseTimers.delete(playerId);
        if (platePulse.get(playerId) === kind) {
          platePulse.delete(playerId);
          renderPlates();
        }
      }, ms),
    );
  }

  function swapRuleText(el: HTMLElement, next: string): void {
    if (el.textContent === next) return;
    const reduced =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.textContent = next;
      el.classList.remove("is-fading");
      return;
    }
    el.classList.add("is-fading");
    const done = (ev: TransitionEvent): void => {
      if (ev.propertyName !== "opacity") return;
      el.removeEventListener("transitionend", done);
      el.textContent = next;
      el.classList.remove("is-fading");
    };
    el.addEventListener("transitionend", done);
  }

  function renderPlates(): void {
    if (!match || !net) {
      clearPlateCols();
      setPlatesVisible(false);
      return;
    }
    setPlatesVisible(true);
    const myId = net.myId;
    // Compact aussi sur petit écran, quel que soit l'effectif : à deux plaques
    // par rangée sur un téléphone, six joueurs mangeaient déjà un tiers de la
    // hauteur. Le signe passe à 24 px, comme à effectif nombreux.
    const compact = match.players.length > 6 || window.innerWidth <= 720;
    platesEl.classList.toggle("plates--compact", compact);
    const existing = new Map<string, HTMLElement>();
    for (const col of [platesL, platesR]) {
      for (const child of Array.from(col.children)) {
        if (child instanceof HTMLElement && child.dataset.id) {
          existing.set(child.dataset.id, child);
        }
      }
    }

    const leftCount = Math.ceil(match.players.length / 2);
    const leftFrag = document.createDocumentFragment();
    const rightFrag = document.createDocumentFragment();

    match.players.forEach((p, i) => {
      const ruleId = match!.rules[p.id] ?? p.ruleId;
      const ruleName = ruleById(ruleId)?.name ?? ruleId;
      let el = existing.get(p.id);
      if (!el) {
        el = document.createElement("div");
        el.dataset.id = p.id;
        el.innerHTML =
          `<span class="plate__head">` +
          `<span class="plate__glyph"></span>` +
          `<span class="plate__name"></span>` +
          `</span>` +
          `<span class="plate__rule"><span class="plate__rule-text"></span></span>` +
          `<span class="plate__row">` +
          `<span class="plate__lives"></span>` +
          `<span class="plate__react plate__score"></span>` +
          `<span class="plate__streak"></span>` +
          `<span class="plate__score plate__pts"></span>` +
          `</span>`;
      } else {
        existing.delete(p.id);
      }

      const pulse = platePulse.get(p.id);
      const classes = ["plate"];
      if (p.id === myId) classes.push("plate--me");
      if (p.lives <= 0) classes.push("plate--out");
      // Le statut de débutant est PUBLIC, et c'est tout l'intérêt : il change
      // le regard des autres sur ses erreurs, et c'est la seule chose qui
      // empêche d'en abuser puisque le serveur ne peut pas le vérifier.
      if (p.rookie) classes.push("plate--rookie");
      else if (pulse) classes.push(`plate--${pulse}`);
      else if (match!.phase === "round") classes.push("plate--live");
      el.className = classes.join(" ");

      el.querySelector(".plate__glyph")!.innerHTML = glyphSvg(
        playerGlyph(p),
        compact ? 24 : 40,
      );
      el.querySelector<HTMLElement>(".plate__name")!.textContent = p.name;
      const ruleText = el.querySelector<HTMLElement>(".plate__rule-text")!;
      if (compact) el.title = ruleName;
      else el.removeAttribute("title");
      swapRuleText(ruleText, ruleName);
      el.querySelector<HTMLElement>(".plate__lives")!.innerHTML = livesDots(
        Math.max(0, p.lives),
        match!.maxLives,
      );
      const stats = p.stats ?? EMPTY_STATS;
      const reactEl = el.querySelector<HTMLElement>(".plate__react");
      if (reactEl) {
        reactEl.textContent = compact ? "" : stats.reaction != null ? `${stats.reaction} ms` : "—";
      }
      const streakEl = el.querySelector<HTMLElement>(".plate__streak");
      if (streakEl) {
        if (stats.streak >= 3) {
          streakEl.textContent = `×${stats.streak}`;
          streakEl.classList.add("is-on");
        } else {
          streakEl.textContent = "";
          streakEl.classList.remove("is-on");
        }
      }
      const pts = el.querySelector<HTMLElement>(".plate__pts") ?? el.querySelector<HTMLElement>(".plate__score:last-child");
      if (pts) pts.textContent = String(p.score);
      (i < leftCount ? leftFrag : rightFrag).appendChild(el);
    });

    clearPlateCols();
    platesL.appendChild(leftFrag);
    platesR.appendChild(rightFrag);
    renderWatchBar();
  }

  function flashPlate(playerId: string, kind: PlateFlash = "dead"): void {
    platePulse.set(playerId, kind);
    renderPlates();
    if (kind === "ok" || kind === "trap") schedulePulseClear(playerId, kind, 800);
    if (kind === "dead") {
      // Relance la secousse CSS si la classe était déjà là
      const el = platesEl.querySelector<HTMLElement>(`[data-id="${playerId}"]`);
      if (el) {
        el.classList.remove("plate--dead");
        void el.offsetWidth;
        el.classList.add("plate--dead");
      }
    }
  }

  function applyPlayers(players: PlayerPublic[]): void {
    lastPlayers = mergePlayers(lastPlayers, players);
    if (!match || !net) return;
    match.players = lastPlayers;
    const me = lastPlayers.find((p) => p.id === net!.myId);
    if (me) {
      match.lives = me.lives;
      match.score = me.score;
      match.spectator = me.spectator;
    }
    if (isSpectating() && (!match.watchingId || !lastPlayers.some((p) => p.id === match!.watchingId && p.lives > 0))) {
      const alive = lastPlayers.find((p) => p.lives > 0 && p.id !== net!.myId);
      match.watchingId = alive?.id ?? null;
      if (match.watchingId) net.watch(match.watchingId);
    }
    renderPlates();
  }

  function clearMatch(): void {
    hideDrama();
    match = null;
    lobbyInMatch = false;
    platePulse.clear();
    clearPulseTimers();
    clearEmoteTimers();
    setPlatesVisible(false);
    clearPlateCols();
    watchBar.classList.add("hidden");
    $("head").classList.remove("is-preview");
    hud.hideStamp();
    hud.clearRound();
    hud.setRule(null);
    hud.setMeta("");
  }

  function beginMatch(msg: Extract<ServerMsg, { t: "match_start" }>): void {
    if (!net) return;
    /*
     * Un SPECTATEUR n'a pas de règle à lui — il n'a pas de siège.
     *
     * Sortir ici le privait de tout état de match, donc de la barre de cibles,
     * du pied « JE REGARDE X » et de la scène : il restait devant un salon figé
     * jusqu'à la fin de la partie. On reconstruit donc sa vue à partir de la
     * règle du joueur qu'il va observer — c'est exactement ce que fait
     * `rebuildViewRound()` ensuite, et ça ne coûte rien au serveur puisque la
     * scène est déterministe.
     */
    const cible = lastPlayers.find((p) => p.lives > 0 && p.id !== net!.myId);
    const ruleId = msg.rules[net.myId] ?? (cible ? msg.rules[cible.id] : undefined);
    const rule = ruleId ? ruleById(ruleId) : undefined;
    // Plus personne d'observable : il n'y a vraiment rien à montrer.
    if (!rule) return;

    endScreenOpen = false;
    roomSettings = msg.settings ?? roomSettings;
    lobbyInMatch = true;
    hideDrama();

    // Aligne les ruleId publiques sur l'attribution du match
    lastPlayers = lastPlayers.map((p) => ({
      ...p,
      ruleId: msg.rules[p.id] ?? p.ruleId,
    }));

    const me = lastPlayers.find((p) => p.id === net!.myId);
    const spectating = !!me?.spectator || (me?.lives ?? roomSettings.lives) <= 0;
    const firstAlive = lastPlayers.find((p) => p.lives > 0 && p.id !== net!.myId);

    match = {
      seed: msg.seed,
      rules: { ...msg.rules },
      phase: "countdown",
      firstRoundAt: msg.firstRoundAt,
      idx: -1,
      startAt: 0,
      deadline: 0,
      round: null,
      rule,
      progress: { step: 0 },
      localDone: true,
      preview: null,
      authority: null,
      rotationUntil: 0,
      lives: me?.lives ?? roomSettings.lives,
      score: me?.score ?? 0,
      spectator: !!me?.spectator,
      players: lastPlayers.slice(),
      watchingId: spectating ? (firstAlive?.id ?? null) : null,
      // Un débutant porte une vie de plus : borner au réglage du salon
      // afficherait 4 points dans une jauge qui n'en prévoit que 3. L'état du
      // salon arrive maintenant AVANT match_start, donc ces vies sont réelles.
      maxLives: Math.max(roomSettings.lives, ...lastPlayers.map((p) => p.lives), 1),
      nextRoundAt: null,
      pauseMs: 0,
      duelAnnounced: false,
      drama: "off",
      camRound: null,
      camRule: null,
      musicNeedsRestart: false,
      rotationRule: null,
      spanFactor: 1,
    };

    if (match.watchingId) net.watch(match.watchingId);

    platePulse.clear();
    clearPulseTimers();
    unlock();
    hud.hideStamp();
    hud.clearRound();
    hud.setRule(rule);
    syncFooter();
    hud.setMeta("");
    $("head").classList.remove("is-preview");
    musicApi.start();
    musicApi.lobby();
    show(null);
    renderPlates();
  }

  function beginRound(msg: Extract<ServerMsg, { t: "round" }>): void {
    if (!match || !net) return;

    hideDrama();
    if (match.musicNeedsRestart) {
      musicApi.start();
      match.musicNeedsRestart = false;
    }
    // Le sting n'annonce quelque chose que s'il s'est passé quelque chose.
    // Après un interlude banal, ce ne serait qu'un métronome de plus.
    if (match.pauseMs > 1800) sfx.resumeSting();

    if (msg.rules) {
      match.rules = { ...msg.rules };
      match.rotationUntil = net.clock.now() + 1500;
    }

    match.idx = msg.idx;
    musicApi.level(msg.idx);
    match.startAt = msg.startAt;
    match.deadline = msg.deadline;
    match.progress = { step: 0 };
    match.localDone = false;
    match.preview = null;
    match.authority = null;
    match.phase = "round";
    match.nextRoundAt = null;
    match.pauseMs = 0;
    // L'annonce a fait son office : la règle est désormais en vigueur.
    match.rotationRule = null;
    platePulse.clear();
    clearPulseTimers();
    hud.hideStamp();
    $("head").classList.remove("is-preview");
    rebuildViewRound();
    // La règle a pu raccourcir la fenêtre personnelle : la barre doit le dire,
    // sinon elle promet du temps que le serveur ne donne pas.
    const base = windowMs(match.idx);
    match.spanFactor = match.round && base > 0 ? match.round.durationMs / base : 1;
    renderPlates();
    syncFooter();
  }

  function applyVerdict(msg: Extract<ServerMsg, { t: "verdict" }>): void {
    if (!match || !net) return;
    match.phase = "frozen";
    match.localDone = true;
    match.preview = null;
    $("head").classList.remove("is-preview");
    applyPlayers(msg.players);

    const mine = msg.outcomes[net.myId];
    match.authority = mine ?? null;
    const myDeathSfx = mine?.kind === "death";

    if (mine?.kind === "survive") {
      if (mine.trap) {
        sfx.trapAvoided();
        queueFx({ burstScreen: true, flashViolet: true, kick: 0.45 });
      } else sfx.success(match.score);
    } else if (mine?.kind === "death") {
      sfx.fail();
      hud.showStamp(stampFor(mine));
    }

    platePulse.clear();
    clearPulseTimers();
    for (const [id, o] of Object.entries(msg.outcomes)) {
      const kind = outcomeFlash(o);
      platePulse.set(id, kind);
      if (kind === "ok" || kind === "trap") schedulePulseClear(id, kind, 800);
    }
    renderPlates();
    syncFooter();

    /*
     * Rotation annoncée PENDANT la pause, en plein cadre.
     *
     * Elle arrivait avec la manche suivante, donc pendant qu'il fallait jouer,
     * et se réduisait à un changement de texte en haut à gauche. Deux tiers
     * des pertes de vies venaient de là. Le serveur allonge maintenant
     * l'interlude et joint les règles à venir : on a le temps de lire.
     */
    if (msg.nextRules && net) {
      match.rules = { ...msg.nextRules };
      const mienne = ruleById(msg.nextRules[net.myId] ?? "");
      // On MÉMORISE, on n'affiche pas encore : une kill-cam peut occuper le
      // centre. syncFrame passera de l'une à l'autre au bon moment.
      match.rotationRule = mienne && !isSpectating() ? mienne : null;
    }

    // Pas d'interlude UI si le match se termine (nextRoundAt null).
    if (msg.nextRoundAt == null) {
      match.nextRoundAt = null;
      match.pauseMs = 0;
      return;
    }

    const pauseMs = Math.max(0, msg.nextRoundAt - net.clock.now());
    match.nextRoundAt = msg.nextRoundAt;
    match.pauseMs = pauseMs;

    const alive = match.players.filter((p) => p.lives > 0);
    const victims = Object.entries(msg.outcomes)
      .filter(([, o]) => o.kind === "death")
      .map(([id, o]) => {
        const player = match!.players.find((p) => p.id === id);
        if (!player || o.kind !== "death") return null;
        return {
          player,
          reason: o.reason,
          eliminated: player.lives <= 0,
        };
      })
      .filter((v): v is { player: PlayerPublic; reason: string; eliminated: boolean } => !!v)
      .sort((a, b) => Number(b.eliminated) - Number(a.eliminated));

    if (pauseMs > 1800 && victims.length > 0) {
      const focus = victims[0]!;
      const rid = match.rules[focus.player.id] ?? focus.player.ruleId;
      const focusRule = ruleById(rid);
      if (focusRule) {
        const focusRound = buildMultiRound(match.seed, match.idx, focusRule);
        const elim = pauseMs > 3500;
        showKillCam(victims, focusRule, focusRound, elim, alive.length);
        if (elim) {
          musicApi.cut();
          match.musicNeedsRestart = true;
          sfx.elimImpact();
        } else {
          musicApi.lobby();
          if (!myDeathSfx) sfx.fail();
        }
      }
      return;
    }

    if (pauseMs <= 800 && alive.length === 2 && !match.duelAnnounced) {
      match.duelAnnounced = true;
      showDuel(alive[0]!, alive[1]!);
      sfx.win();
    }
  }

  function renderTitles(players: PlayerPublic[]): void {
    const box = $("multiTitles");
    box.innerHTML = "";
    const withStats = players.map((p) => ({ p, s: p.stats ?? EMPTY_STATS }));

    type Title = { label: string; value: string; player: PlayerPublic };
    const titles: Title[] = [];

    let reflex: (typeof withStats)[number] | null = null;
    for (const row of withStats) {
      if (row.s.reaction == null) continue;
      if (!reflex || row.s.reaction < reflex.s.reaction!) reflex = row;
    }
    if (reflex) {
      titles.push({
        label: "RÉFLEXE DU MATCH",
        value: `${reflex.s.reaction} ms`,
        player: reflex.p,
      });
    }

    let flair: (typeof withStats)[number] | null = null;
    for (const row of withStats) {
      if (row.s.traps < 1) continue;
      if (!flair || row.s.traps > flair.s.traps) flair = row;
    }
    if (flair) {
      titles.push({
        label: "FLAIR",
        value: String(flair.s.traps),
        player: flair.p,
      });
    }

    let serie: (typeof withStats)[number] | null = null;
    for (const row of withStats) {
      if (row.s.bestStreak < 3) continue;
      if (!serie || row.s.bestStreak > serie.s.bestStreak) serie = row;
    }
    if (serie) {
      titles.push({
        label: "SÉRIE",
        value: `×${serie.s.bestStreak}`,
        player: serie.p,
      });
    }

    // Sans titre à décerner, le classement reprend toute la largeur : une
    // colonne vide en face de lui se lit comme un contenu qui n'a pas chargé.
    $("multi-end").classList.toggle("is-solo", titles.length === 0);
    if (titles.length === 0) {
      box.classList.add("hidden");
      return;
    }
    box.classList.remove("hidden");
    for (const t of titles) {
      const row = document.createElement("div");
      row.className = "titles__row";
      row.innerHTML =
        `<span class="titles__label"></span>` +
        `<span class="titles__value"></span>` +
        `<span class="titles__who">` +
        `<span class="lobbyrow__glyph"></span>` +
        `<span class="titles__name"></span>` +
        `</span>`;
      row.querySelector<HTMLElement>(".titles__label")!.textContent = t.label;
      row.querySelector<HTMLElement>(".titles__value")!.textContent = t.value;
      row.querySelector(".lobbyrow__glyph")!.innerHTML = glyphSvg(playerGlyph(t.player), 16);
      row.querySelector<HTMLElement>(".titles__name")!.textContent = t.player.name;
      box.appendChild(row);
    }
  }

  function renderPodium(players: PlayerPublic[]): void {
    /*
     * Le classement doit se lire d'un coup d'œil.
     *
     * Il affichait « ♥3 · 12 » sans dire ce qu'était 12, sans numéro de rang,
     * et marquait « EN VIE » des joueurs alors que le match était fini.
     * Rapporté en soirée : « peu clair, certaines informations ne sont pas
     * suffisamment explicites ».
     *
     * Trois corrections : un rang chiffré, des vies en points comme partout
     * ailleurs dans le jeu, et une unité écrite sur le score.
     */
    /*
     * Les spectateurs ne sont pas classés — ils n'ont pas joué.
     *
     * Ils étaient triés avec les autres, et comme le tri se fait sur les vies,
     * quelqu'un arrivé en cours de partie se retrouvait en tête du classement
     * sans avoir joué une seule manche. Ils apparaissent désormais à part, en
     * fin de liste, sans rang.
     */
    const joueurs = players.filter((p) => !p.spectator);
    const spectateurs = players.filter((p) => p.spectator);
    const sorted = [...joueurs].sort((a, b) => b.lives - a.lives || b.score - a.score);
    const maxLives = Math.max(roomSettings.lives, ...joueurs.map((p) => p.lives), 1);
    const list = $("multiPodium");
    list.innerHTML = "";
    sorted.forEach((p, rang) => {
      const row = document.createElement("div");
      const isWinner = rang === 0 && p.lives > 0;
      row.className =
        "lobbyrow" +
        (p.id === net?.myId ? " is-host" : "") +
        (isWinner ? " is-winner" : "") +
        (p.lives <= 0 ? " is-off" : "");
      row.innerHTML =
        `<span class="lobbyrow__name">` +
        `<span class="lobbyrow__rank"></span>` +
        `<span class="lobbyrow__glyph"></span>` +
        `<span class="lobbyrow__name-text"></span>` +
        `</span>` +
        `<span class="lobbyrow__rule"></span>` +
        `<span class="lobbyrow__status"></span>` +
        `<span class="lobbyrow__meta"></span>`;
      row.querySelector<HTMLElement>(".lobbyrow__rank")!.textContent = `${rang + 1}`;
      row.querySelector(".lobbyrow__glyph")!.innerHTML = glyphSvg(playerGlyph(p), 16);
      row.querySelector<HTMLElement>(".lobbyrow__name-text")!.textContent = p.name;
      /*
       * La règle qu'il portait en tombant.
       *
       * Le classement disait le rang et le score, jamais sous quelle contrainte
       * chacun avait joué — alors que c'est la seule chose qui distingue deux
       * joueurs du même salon, et qu'elle change à chaque rotation. La colonne
       * dit donc la même chose ici que dans le salon, et le statut a la sienne.
       */
      row.querySelector<HTMLElement>(".lobbyrow__rule")!.textContent =
        ruleById(p.ruleId)?.name ?? (p.ruleId || "—");
      row.querySelector<HTMLElement>(".lobbyrow__status")!.textContent = isWinner
        ? "VAINQUEUR"
        : p.lives <= 0
          ? "ÉLIMINÉ"
          : `${rang + 1}ᵉ`;
      // Vies en points, comme sur les plaques et au pied : une seule grammaire
      // visuelle pour une même information.
      // `livesDots` rend des <i> NUS : sans le conteneur `.lifedots`, la CSS
      // ne les atteint pas et les points restent invisibles.
      row.querySelector<HTMLElement>(".lobbyrow__meta")!.innerHTML =
        `<span class="lifedots">${livesDots(Math.max(0, p.lives), maxLives)}</span>` +
        `<span class="lobbyrow__rounds">${p.score} MANCHES</span>`;
      list.appendChild(row);
    });

    for (const p of spectateurs) {
      const row = document.createElement("div");
      row.className = "lobbyrow is-off" + (p.id === net?.myId ? " is-host" : "");
      row.innerHTML =
        `<span class="lobbyrow__name">` +
        `<span class="lobbyrow__rank">—</span>` +
        `<span class="lobbyrow__glyph"></span>` +
        `<span class="lobbyrow__name-text"></span>` +
        `</span>` +
        `<span class="lobbyrow__rule"></span>` +
        `<span class="lobbyrow__status">SPECTATEUR</span>` +
        `<span class="lobbyrow__meta"><span class="lobbyrow__rounds">A REGARDÉ</span></span>`;
      row.querySelector(".lobbyrow__glyph")!.innerHTML = glyphSvg(playerGlyph(p), 16);
      row.querySelector<HTMLElement>(".lobbyrow__name-text")!.textContent = p.name;
      list.appendChild(row);
    }
  }

  function endMatch(msg: Extract<ServerMsg, { t: "match_end" }>): void {
    if (!net) return;

    // Une partie terminée, quel qu'en soit le résultat : on n'est plus
    // nouveau. Compté à la FIN et non au lancement, pour qu'un salon quitté
    // pendant le compte à rebours ne consomme pas l'accueil.
    P.mutate((st) => {
      st.multi.matches++;
    });

    hideDrama();
    musicApi.stop();
    lastPlayers = mergePlayers(lastPlayers, msg.players);
    clearMatch();
    endScreenOpen = true;

    const title = $("multiEndTitle");
    if (msg.winnerId === null) {
      title.textContent = "ÉGALITÉ";
      title.classList.remove("is-win");
    } else {
      const winner =
        lastPlayers.find((p) => p.id === msg.winnerId) ??
        msg.players.find((p) => p.id === msg.winnerId);
      title.textContent = winner?.name ?? "FIN DU MATCH";
      title.classList.toggle("is-win", msg.winnerId === net.myId);
    }

    renderTitles(msg.players);
    renderPodium(msg.players);
    $("multiEndInviteHint").textContent = "LIEN D'INVITATION · UN CLIC POUR COPIER";

    if (msg.winnerId === net.myId) sfx.win();
    show("multi-end");
  }

  async function copyInvite(hintId: string): Promise<void> {
    if (!roomCode) return;
    const link = inviteUrl(roomCode);
    try {
      await navigator.clipboard.writeText(link);
      // Compté seulement si le presse-papiers a effectivement pris. La branche
      // de repli affiche le lien en clair : l'utilisateur peut le recopier à la
      // main, mais on ne saura jamais s'il l'a fait — mieux vaut sous-compter
      // l'envoi que gonfler le haut d'un entonnoir dont on lit le bas.
      track("invite_sent", { players: lastPlayers.length });
      $(hintId).textContent = "LIEN COPIÉ";
    } catch {
      $(hintId).textContent = link;
    }
  }

  const onMsg = (msg: ServerMsg): void => {
    if (msg.t === "room") {
      roomCode = msg.code;
      lastRoomCode = msg.code;
      roomSettings = msg.settings ?? roomSettings;
      lobbyInMatch = msg.inMatch;
      lastPlayers = mergePlayers(lastPlayers, msg.players);
      if (match) {
        applyPlayers(msg.players);
        return;
      }
      if (endScreenOpen) {
        paintLobby();
        return;
      }
      setJoinErr(null);
      paintLobby();
      show("multi-lobby");
      return;
    }
    if (msg.t === "match_start") {
      beginMatch(msg);
      return;
    }
    if (msg.t === "round") {
      beginRound(msg);
      return;
    }
    if (msg.t === "verdict") {
      applyVerdict(msg);
      return;
    }
    if (msg.t === "match_end") {
      endMatch(msg);
      return;
    }
    if (msg.t === "emote") {
      showEmote(msg.playerId, msg.k);
      return;
    }
    if (msg.t === "chat") {
      if (muted.has(msg.playerId)) return;
      const p = lastPlayers.find((x) => x.id === msg.playerId);
      chatLines.push({
        playerId: msg.playerId,
        name: msg.name,
        text: msg.text,
        glyph: p ? playerGlyph(p) : glyphFor(msg.playerId),
      });
      if (chatLines.length > 40) chatLines.splice(0, chatLines.length - 40);
      syncChatChrome();
      return;
    }
    if (msg.t === "error") {
      // Le serveur vient de dire précisément ce qui n'allait pas : le rattrapage
      // générique de ensureConnected() ne doit pas écraser ce message.
      errFromServer = true;
      if (msg.code === "room_unknown") {
        const coupe = msg.detail === "déconnecté";
        /*
         * Coupure : on ne démonte RIEN et on tente de revenir seul.
         *
         * Renvoyer tout de suite à l'écran de saisie était vécu comme une
         * expulsion, alors que le siège est gardé côté serveur — et le joueur
         * perdait le temps du sursis à chercher son code. attemptRejoin rend
         * la main s'il échoue vraiment.
         */
        if (coupe && lastRoomCode) {
          void attemptRejoin();
          return;
        }
        setJoinErr(
          coupe
            ? "DÉCONNECTÉ — REJOINS POUR REPRENDRE TA PLACE"
            : "AUCUN SALON À CE CODE — VÉRIFIE LES 4 LETTRES, OU CRÉE LE TIEN",
        );
        if (roomCode) {
          roomCode = "";
          endScreenOpen = false;
          muted.clear();
          clearChat();
          clearMatch();
          show("multi-join");
        }
      } else if (msg.code === "room_full") {
        setJoinErr(`SALON COMPLET (${MAX_PLAYERS} JOUEURS) — CRÉE-EN UN AUTRE`);
      } else if (msg.code === "not_host") {
        setJoinErr("SEUL CELUI QUI A CRÉÉ LE SALON PEUT LANCER — DEMANDE-LUI");
      } else if (msg.code === "in_match") {
        setJoinErr("MATCH EN COURS — TU ENTRES À LA PROCHAINE PARTIE");
      } else if (msg.code === "bad_version") {
        // Cas typique d'un onglet resté ouvert sur l'ancien bundle après un
        // déploiement. Le geste qui répare est le rechargement : le dire.
        setJoinErr("VERSION INCOMPATIBLE — RECHARGE LA PAGE");
      } else if (msg.code === "kicked") {
        setJoinErr("TU AS ÉTÉ SORTI DU SALON — TU PEUX EN CRÉER UN À TOI");
        // Départ subi mais définitif : surtout ne pas revenir tout seul.
        lastRoomCode = "";
        roomCode = "";
        lastPlayers = [];
        endScreenOpen = false;
        muted.clear();
        clearEmoteTimers();
        clearChat();
        if (match) {
          musicApi.stop();
          clearMatch();
        } else {
          setPlatesVisible(false);
          clearPlateCols();
        }
        show("multi-join");
      }
    }
  };

  /*
   * Retour d'arrière-plan (mobile) : le navigateur a probablement tué la
   * socket pendant l'absence. Plutôt que de laisser l'utilisateur découvrir
   * des boutons morts, on constate l'état à l'instant où l'onglet revient et
   * on remet l'interface en position de départ, avec le message qui va bien.
   */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    // Le navigateur mobile a probablement tué la socket pendant l'absence.
    // On tente de reprendre la place plutôt que de renvoyer l'utilisateur à
    // l'écran de saisie : c'est exactement le cas que le sursis serveur existe
    // pour couvrir.
    if (net && !net.connected && lastRoomCode) void attemptRejoin();
  });

  /* ------------------------------------------------------------------ *
   * Identité
   * ------------------------------------------------------------------ */

  /**
   * Ce qu'on voulait faire avant que l'identité manque.
   *
   * Volontairement une fonction en attente plutôt qu'une promesse : une
   * promesse non résolue — écran quitté autrement que par les deux boutons —
   * laisserait `ensureConnected` bloqué et le bouton MULTIJOUEUR mort jusqu'au
   * rechargement. On a déjà payé ce bug une fois, on ne le réintroduit pas.
   */
  let apresIdentite: (() => void) | null = null;
  let glyphChoisi = P.load().multi.glyph;

  function renderGlyphPicker(): void {
    const hote = $("idGlyphs");
    hote.innerHTML = "";
    const anon = P.load().anonId;
    for (let n = 0; n < GLYPH_CHOICES; n++) {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "glyphpick__opt";
      opt.setAttribute("role", "radio");
      opt.setAttribute("aria-checked", String(n === glyphChoisi));
      opt.setAttribute("aria-label", `Signe ${n + 1} sur ${GLYPH_CHOICES}`);
      opt.innerHTML = glyphSvg(glyphVariant(anon, n), 30);
      opt.addEventListener("click", () => {
        glyphChoisi = n;
        sfx.ui();
        renderGlyphPicker();
      });
      hote.appendChild(opt);
    }
  }

  function openIdentity(): void {
    glyphChoisi = P.load().multi.glyph;
    $<HTMLInputElement>("idName").value = savedName() ?? "";
    $("idErr").classList.add("hidden");
    renderGlyphPicker();
    show("multi-id");
  }

  /**
   * Exige une identité avant d'agir. Retourne vrai si l'écran a été ouvert —
   * l'appelant s'arrête alors, et `suite` reprendra après CONTINUER.
   */
  function needIdentity(suite: () => void): boolean {
    if (savedName()) return false;
    apresIdentite = suite;
    openIdentity();
    return true;
  }

  /**
   * Revenir tout seul après une coupure.
   *
   * Sans ça, la moindre micro-coupure renvoyait à l'écran de saisie du code —
   * vécu comme une expulsion, alors que le siège est gardé côté serveur. On
   * retente donc en silence, et on ne rend la main à l'utilisateur que si ça
   * échoue vraiment.
   *
   * Trois essais espacés : le sursis serveur dure 25 s, il n'y a aucune raison
   * de marteler, et une boucle sans fin sur un serveur éteint serait pire que
   * le problème d'origine.
   */
  async function attemptRejoin(): Promise<void> {
    if (!lastRoomCode || rejoining) return;
    rejoining = true;
    setJoinErr(null);
    hud.setMeta("RECONNEXION…");
    try {
      for (let essai = 0; essai < 3; essai++) {
        const client = await ensureConnected();
        if (client) {
          client.joinRoom(lastRoomCode);
          return;
        }
        await new Promise((r) => setTimeout(r, 800));
      }
      // Échec : on rend la main, code déjà saisi pour que ce soit un geste.
      $<HTMLInputElement>("multiCode").value = lastRoomCode;
      syncJoinAccent();
      setJoinErr("CONNEXION PERDUE — REJOINS POUR REPRENDRE TA PLACE");
      setPlatesVisible(false);
      clearPlateCols();
      clearMatch();
      show("multi-join");
    } finally {
      rejoining = false;
      hud.setMeta("");
    }
  }

  async function ensureConnected(): Promise<NetClient | null> {
    if (net?.connected) return net;
    const name = savedName();
    if (!name) return null;
    if (connecting) return null;
    connecting = true;
    errFromServer = false;
    btnMulti.disabled = true;
    btnMulti.textContent = "CONNEXION…";
    try {
      // Un client déconnecté ne se réutilise pas : socket fermée, horloge et
      // identifiant périmés. On repart proprement d'une instance neuve —
      // c'est ce qui rend le retour d'arrière-plan mobile indolore.
      if (!net || !net.connected) {
        net?.close();
        net = new NetClient(url);
        unsub?.();
        unsub = net.on(onMsg);
      }
      // anonId est déjà l'identifiant local persistant du joueur. Le réutiliser
      // évite d'en inventer un second qui pourrait diverger — et c'est lui qui
      // permet de reprendre son siège après une coupure.
      await net.connect(name, myGlyph(), P.load().anonId, P.load().multi.matches === 0);
      return net;
    } catch {
      if (!errFromServer) {
        setJoinErr("SERVEUR INJOIGNABLE — VÉRIFIE TA CONNEXION, PUIS RÉESSAIE");
      }
      // Pendant une reprise automatique, c'est attemptRejoin qui décide s'il
      // faut rendre la main : basculer d'écran ici couperait la tentative en
      // cours et redonnerait la sensation d'expulsion qu'on veut supprimer.
      if (!rejoining) show("multi-join");
      return null;
    } finally {
      connecting = false;
      btnMulti.disabled = false;
      btnMulti.textContent = "MULTIJOUEUR";
    }
  }

  /**
   * L'accent suit l'intention en cours.
   *
   * Les deux panneaux sont à égalité tant que rien n'est saisi : CRÉER est
   * l'action qui ne demande rien, donc c'est elle qui porte l'accent. Dès que
   * le code est complet, c'est REJOINDRE qu'on veut — l'écran cesse de
   * proposer d'ouvrir un salon à quelqu'un qui vient d'en taper un.
   */
  function syncJoinAccent(): void {
    const pret = $<HTMLInputElement>("multiCode").value.trim().length === 4;
    $("btnMultiJoin").classList.toggle("btn--primary", pret);
    $("btnMultiCreate").classList.toggle("btn--primary", !pret);
  }

  async function openJoin(prefill?: string): Promise<void> {
    sfx.ui();
    setJoinErr(null);
    const codeInput = $<HTMLInputElement>("multiCode");
    if (prefill) codeInput.value = prefill;
    syncJoinAccent();
    const client = await ensureConnected();
    if (!client) return;
    show("multi-join");
    codeInput.focus();
  }

  function exitToMenu(): void {
    endScreenOpen = false;
    if (net?.connected) net.leave();
    // Partir est volontaire : la reprise automatique ne doit pas y ramener.
    lastRoomCode = "";
    roomCode = "";
    lastPlayers = [];
    muted.clear();
    clearEmoteTimers();
    clearChat();
    setJoinErr(null);
    if (match) {
      musicApi.stop();
      clearMatch();
    } else {
      setPlatesVisible(false);
      clearPlateCols();
    }
  }

  function isPlayingMulti(): boolean {
    return match !== null;
  }

  function peekRound(): Round | null {
    return match?.round ?? null;
  }

  function canAct(): boolean {
    return (
      !!match &&
      !!net &&
      match.phase === "round" &&
      !match.localDone &&
      match.lives > 0 &&
      !match.spectator &&
      !!match.round &&
      !!match.rule
    );
  }

  function trySendMultiAction(action: Action): MultiFeel {
    if (!match || !net) return { consumed: false };
    if (!canAct()) return { consumed: true };

    net.sendInput(match.idx, toWire(action));

    const elapsed = Math.max(0, net.clock.now() - match.startAt);
    const { outcome, progress } = resolveAction(
      match.round!,
      match.progress,
      vueServeur(action),
      elapsed,
      match.rule!.judge,
    );
    match.progress = progress;

    // Le pas intermédiaire remonte désormais : sans lui, main.ts n'avait rien à
    // afficher entre le premier et le dernier geste d'une séquence.
    if (outcome.kind === "pending") return { consumed: true, feel: outcome };

    match.preview = outcome;
    match.localDone = true;
    $("head").classList.add("is-preview");
    return { consumed: true, feel: outcome };
  }

  function syncFrame(): MultiDraw | null {
    if (!match || !net) return null;

    syncFooter();

    if (match.phase === "countdown") {
      musicApi.lobby();
      const left = net.clock.toLocal(match.firstRoundAt) - Date.now();
      const sec = Math.max(0, Math.ceil(left / 1000));
      /*
       * Panneau posé une seule fois ; seul le décompte se réécrit.
       *
       * Jamais pour un spectateur : la règle affichée serait celle d'un autre,
       * et l'annoncer « TA RÈGLE UNIQUE » serait un mensonge. Le pied lui dit
       * déjà qui il regarde.
       */
      if (match.drama !== "rule" && match.rule && !isSpectating()) {
        showRuleReveal(match.rule);
      }
      dramaExtra.textContent = sec > 0 ? `DÉPART · ${sec}` : "…";
      // Le décompte est dans le panneau : le répéter en méta ferait deux
      // endroits à surveiller pour une seule information.
      hud.setMeta("");
      hud.clearRound();
      return { round: null, rule: match.rule, reveal: false };
    }

    /*
     * L'annonce de rotation prend le centre à la fin de la pause.
     *
     * S'il y a eu une mort, la kill-cam parle d'abord — c'est le spectacle et
     * il est collectif. Mais le changement de règle est vital pour MOI, donc il
     * a le dernier mot : on bascule quand il reste assez de temps pour lire,
     * et immédiatement s'il n'y a aucune kill-cam à jouer.
     *
     * Piloté par la frame et non par un setTimeout, comme tout ce qui dépend du
     * tempo dans ce fichier.
     */
    if (match.rotationRule && match.drama !== "rule") {
      const restant =
        match.nextRoundAt != null ? net.clock.toLocal(match.nextRoundAt) - Date.now() : 0;
      if (match.drama !== "killcam" || restant <= 2200) {
        showRuleReveal(match.rotationRule, true);
        sfx.resumeSting();
      }
    }

    const rotating = match.rotationUntil > 0 && net.clock.now() < match.rotationUntil;
    if (rotating) {
      hud.setMeta(`LES RÈGLES TOURNENT · ${match.rule?.name ?? ""}`);
    } else if (match.preview) {
      hud.setMeta(previewLabel(match.preview));
    } else if (match.phase === "frozen" && match.authority) {
      const a = match.authority;
      if (a.kind === "survive") hud.setMeta(a.trap ? "PIÈGE DÉJOUÉ" : "TENU");
      else if (a.kind === "death") hud.setMeta(a.reason);
      else if (!(match.lives <= 0 || match.spectator)) hud.setMeta("SPECTATEUR");
      // spectateur : syncFooter a déjà posé JE REGARDE (sauf pendant rotation)
    } else if (match.lives <= 0 || match.spectator) {
      // syncFooter a déjà posé JE REGARDE
    } else {
      hud.setMeta("");
    }

    if (!match.round && match.drama !== "killcam") {
      return { round: null, rule: match.rule, reveal: false };
    }

    // Kill-cam : scène du mort + révélation + barre en recharge vers nextRoundAt.
    if (match.drama === "killcam" && match.camRound && match.camRule) {
      let ratio = 1;
      if (match.nextRoundAt != null && match.pauseMs > 0) {
        const left = Math.max(0, net.clock.toLocal(match.nextRoundAt) - Date.now());
        ratio = clamp01(left / Math.max(1, match.pauseMs));
      }
      /*
       * Le bandeau garde MA règle, toujours.
       *
       * Il affichait celle du mort pendant la kill-cam. Rapporté en soirée :
       * « lorsqu'un joueur meurt, sa règle s'affiche à la place de la règle du
       * joueur, ce qui crée de la confusion ». C'est exact — le bandeau est le
       * seul endroit stable où l'on vérifie sa propre contrainte, et le voir
       * changer sans raison fait douter de ce qu'on porte.
       *
       * Le panneau de kill-cam nomme déjà le mort ET sa règle : l'information
       * est là, à sa place, sans usurper celle du bandeau.
       */
      if (match.rule) hud.setRule(match.rule);
      hud.updateRound(match.camRound, match.camRound.durationMs, ratio);
      return {
        round: match.camRound,
        rule: match.camRule,
        ratio,
        reveal: true,
      };
    }

    // Fenêtre PERSONNELLE : l'échéance diffusée vaut pour la manche partagée,
    // le facteur porte la déformation de ma règle.
    const span = Math.max(1, (match.deadline - match.startAt) * match.spanFactor);
    const ratio = clamp01((net.clock.now() - match.startAt) / span);
    const elapsed = Math.max(0, net.clock.now() - match.startAt);

    if (match.phase === "round") {
      hud.updateRound(match.round!, elapsed, ratio);
    } else {
      hud.updateRound(match.round!, elapsed, 1);
    }

    const reveal =
      match.phase === "frozen" &&
      !!match.round!.trap &&
      match.authority?.kind === "death";

    return {
      round: match.round,
      rule: match.rule,
      ratio: match.phase === "frozen" ? 1 : ratio,
      reveal,
    };
  }

  $("btnIdOk").addEventListener("click", () => {
    const brut = $<HTMLInputElement>("idName").value.trim();
    if (!brut) {
      $("idErr").textContent = "IL FAUT UN NOM POUR QUE LES AUTRES TE VOIENT";
      $("idErr").classList.remove("hidden");
      $<HTMLInputElement>("idName").focus();
      return;
    }
    sfx.ui();
    const nom = brut.slice(0, 14).toUpperCase();
    P.mutate((st) => {
      st.ranked.name = nom;
      st.multi.glyph = glyphChoisi;
    });
    // Le signe part au serveur au prochain `hello` ; si la socket est déjà
    // ouverte, elle porte encore l'ancien — d'où la fermeture, qui force une
    // reconnexion propre plutôt qu'une identité qui diverge d'un écran à l'autre.
    if (net?.connected && !roomCode) {
      net.close();
      net = null;
    }
    const suite = apresIdentite;
    apresIdentite = null;
    if (suite) suite();
    else show("multi-join");
  });

  $("btnIdBack").addEventListener("click", () => {
    sfx.ui();
    apresIdentite = null;
    show(savedName() ? "multi-join" : "home");
  });

  $("multiLobbyCode").addEventListener("click", () => {
    if (!roomCode) return;
    sfx.ui();
    const hint = $("multiLobbyCodeHint");
    void navigator.clipboard
      .writeText(roomCode)
      .then(() => {
        hint.textContent = `CODE ${roomCode} COPIÉ`;
      })
      .catch(() => {
        // Presse-papiers refusé : le code reste lisible à l'écran, c'est
        // justement ce qu'on vient de rendre impossible à manquer.
        hint.textContent = "DICTE-LE : IL EST JUSTE AU-DESSUS";
      });
  });

  $("btnMultiIdentity").addEventListener("click", () => {
    sfx.ui();
    openIdentity();
  });

  btnMulti.addEventListener("click", () => {
    if (needIdentity(() => void openJoin())) return;
    void openJoin();
  });

  $("btnMultiCreate").addEventListener("click", () => {
    void (async () => {
      sfx.ui();
      setJoinErr(null);
      // Jamais d'envoi direct : sur mobile, le navigateur tue la socket dès
      // que l'app passe en arrière-plan. Un send() sur socket morte ne fait
      // RIEN, silencieusement — c'était le « je clique, pas de réponse ».
      const client = await ensureConnected();
      client?.createRoom();
    })();
  });

  $("btnMultiJoin").addEventListener("click", () => {
    void (async () => {
      sfx.ui();
      const code = $<HTMLInputElement>("multiCode").value.trim().toUpperCase();
      if (code.length !== 4) {
        setJoinErr("UN CODE DE SALON FAIT EXACTEMENT 4 LETTRES");
        return;
      }
      setJoinErr(null);
      const client = await ensureConnected();
      client?.joinRoom(code);
    })();
  });

  $("btnMultiJoinBack").addEventListener("click", () => {
    sfx.ui();
    exitToMenu();
    show("home");
  });

  $("btnMultiLeave").addEventListener("click", () => {
    sfx.ui();
    exitToMenu();
    show("home");
  });

  $("btnMultiStart").addEventListener("click", () => {
    sfx.ui();
    net?.startMatch();
  });

  $("btnMultiInvite").addEventListener("click", () => {
    sfx.ui();
    void copyInvite("multiInviteHint");
  });

  $("btnMultiEndInvite").addEventListener("click", () => {
    sfx.ui();
    void copyInvite("multiEndInviteHint");
  });

  $("btnMultiEndHome").addEventListener("click", () => {
    sfx.ui();
    exitToMenu();
    show("home");
  });

  $("btnMultiReplay").addEventListener("click", () => {
    sfx.ui();
    endScreenOpen = false;
    if (roomCode) {
      paintLobby();
      show("multi-lobby");
    } else {
      show("multi-join");
    }
  });

  $("multiSettings").addEventListener("click", (ev) => {
    const chip = (ev.target as HTMLElement).closest("button.chip") as HTMLButtonElement | null;
    if (!chip || chip.disabled || !net) return;
    const row = chip.closest(".settings__row") as HTMLElement | null;
    const key = row?.dataset.key as "speed" | "lives" | "rotationEvery" | undefined;
    if (!key) return;
    const value = Number(chip.dataset.value);
    if (!Number.isFinite(value)) return;
    const me = lastPlayers.find((p) => p.id === net!.myId);
    if (!me?.host || lobbyInMatch) return;
    sfx.ui();
    net.setSettings({ [key]: value });
  });

  watchTargets.addEventListener("click", (ev) => {
    const chip = (ev.target as HTMLElement).closest(".chip") as HTMLElement | null;
    const id = chip?.dataset.id;
    if (!id) return;
    setWatch(id);
  });

  populateEmotes();
  emotesEl.addEventListener("click", (ev) => {
    const chip = (ev.target as HTMLElement).closest("button.chip") as HTMLButtonElement | null;
    if (!chip || chip.disabled || !net) return;
    const k = Number(chip.dataset.k);
    if (!Number.isInteger(k) || k < 0 || k >= EMOTE_LABELS.length) return;
    const t = Date.now();
    if (t - lastEmoteSentAt < EMOTE_COOLDOWN_MS) return;
    lastEmoteSentAt = t;
    net.emote(k);
    sfx.ui();
    setEmoteButtonsEnabled(false);
    if (emoteCooldownTimer) clearTimeout(emoteCooldownTimer);
    emoteCooldownTimer = setTimeout(() => {
      emoteCooldownTimer = null;
      setEmoteButtonsEnabled(true);
    }, EMOTE_COOLDOWN_MS);
  });

  chatForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!net || !chatAvailable()) return;
    const text = chatInput.value;
    chatInput.value = "";
    if (!text.trim()) return;
    net.chat(text);
  });

  chatInput.addEventListener("focus", () => {
    syncChatChrome();
  });
  chatInput.addEventListener("blur", () => {
    // Laisser le navigateur retirer le focus avant de replier.
    queueMicrotask(() => syncChatChrome());
  });

  $<HTMLInputElement>("multiCode").addEventListener("input", (ev) => {
    const el = ev.target as HTMLInputElement;
    el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    syncJoinAccent();
  });

  // Une rotation d'écran fait franchir le seuil des deux colonnes : le chat
  // doit suivre, sinon il reste ancré dans une colonne qui n'existe plus.
  wideScreen?.addEventListener("change", () => syncChatChrome());

  $<HTMLInputElement>("multiCode").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      $("btnMultiJoin").click();
    }
  });

  return {
    available: true,
    exitToMenu,
    openFromInvite: (code: string) => {
      track("invite_opened", {});
      // Arrivée par un lien d'ami : c'est le cas où l'identité manque le plus
      // souvent, et celui où l'accueil compte le plus.
      if (needIdentity(() => void openJoin(code))) return;
      void openJoin(code);
    },
    isPlayingMulti,
    peekRound,
    trySendMultiAction,
    syncFrame,
    takeFx,
    flashPlate,
    chatAvailable,
    focusChat,
    blurChat,
    onScreen,
  };
}
