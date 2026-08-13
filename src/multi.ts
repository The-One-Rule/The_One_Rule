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
  ROTATION_CHOICES,
  SPEED_CHOICES,
} from "../shared/protocol";
import type { Action, OneRule, Outcome, Round, RoundProgress } from "./engine/types";
import { buildMultiRound } from "./engine/multiround";
import { resolveAction } from "./engine/resolve";
import { ruleById } from "./engine/rules";
import * as P from "./game/progress";
import { NetClient } from "./net/client";
import { glyphFor, glyphSvg } from "./net/glyph";
import type { Hud } from "./render/hud";
import { livesDots } from "./render/hud";
import { musicApi, sfx, unlock } from "./audio";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Libellés d'interface uniquement — le fil ne transporte que l'index. */
const EMOTE_LABELS = ["SALUT", "BRAVO", "HA !", "AÏE", "VU VENIR", "NON…"] as const;

export type MultiScreen = "multi-join" | "multi-lobby" | "multi-end";

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
  /** Overlay tempo : kill-cam ou duel. */
  drama: "off" | "killcam" | "duel";
  /** Scène du mort (kill-cam) — révélation post-mortem. */
  camRound: Round | null;
  camRule: OneRule | null;
  /** Relancer la musique après cut() d'élimination. */
  musicNeedsRestart: boolean;
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

function ensurePseudo(): string | null {
  const s = P.load();
  if (s.ranked.name) return s.ranked.name;
  const asked = prompt("Ton pseudo (14 caractères max) :", "")?.trim();
  if (!asked) return null;
  const name = asked.slice(0, 14).toUpperCase();
  P.mutate((st) => {
    st.ranked.name = name;
  });
  return name;
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

  renderSettings(settings, !!me?.host, inMatch);
}

function renderSettings(settings: RoomSettings, isHost: boolean, locked: boolean): void {
  const box = $("multiSettings");
  box.classList.toggle("is-guest", !isHost);
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
  const wsUrl = import.meta.env.VITE_WS_URL as string | undefined;
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

  const TOUCH_ONLY =
    typeof matchMedia !== "undefined" &&
    matchMedia("(hover: none) and (pointer: coarse)").matches;

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
    dramaEl.classList.remove("drama--kill", "drama--elim", "drama--duel");
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
    const meVictim = victims.find((v) => v.player.id === net?.myId);
    hud.showStamp(stampForReason((meVictim ?? primary).reason));
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
    if (!rule) return;
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
      if (p.id === net.myId && match.lives <= 0) continue;
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

  function chatAvailable(): boolean {
    return !!roomCode && !!net?.connected;
  }

  function screenOpen(): boolean {
    return uiScreen !== null;
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

  function renderChatLog(): void {
    const expanded = chatExpanded();
    const visible = chatLines.slice(-(expanded ? 8 : 3));
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
  }

  function syncChatChrome(): void {
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
    for (const btn of emotesEl.querySelectorAll<HTMLButtonElement>("button.chip")) {
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
    const compact = match.players.length > 6;
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
    const ruleId = msg.rules[net.myId];
    const rule = ruleId ? ruleById(ruleId) : undefined;
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
      maxLives: roomSettings.lives,
      nextRoundAt: null,
      pauseMs: 0,
      duelAnnounced: false,
      drama: "off",
      camRound: null,
      camRule: null,
      musicNeedsRestart: false,
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
    platePulse.clear();
    clearPulseTimers();
    hud.hideStamp();
    $("head").classList.remove("is-preview");
    rebuildViewRound();
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
    const sorted = [...players].sort((a, b) => b.lives - a.lives || b.score - a.score);
    const list = $("multiPodium");
    list.innerHTML = "";
    for (const p of sorted) {
      const row = document.createElement("div");
      const isWinner = sorted[0] === p && p.lives > 0;
      row.className =
        "lobbyrow" +
        (p.id === net?.myId ? " is-host" : "") +
        (p.lives <= 0 ? " is-off" : "");
      row.innerHTML =
        `<span class="lobbyrow__name">` +
        `<span class="lobbyrow__glyph"></span>` +
        `<span class="lobbyrow__name-text"></span>` +
        `</span>` +
        `<span class="lobbyrow__rule"></span>` +
        `<span class="lobbyrow__meta"></span>`;
      row.querySelector(".lobbyrow__glyph")!.innerHTML = glyphSvg(playerGlyph(p), 16);
      row.querySelector<HTMLElement>(".lobbyrow__name-text")!.textContent = p.name;
      row.querySelector<HTMLElement>(".lobbyrow__rule")!.textContent = isWinner
        ? "VAINQUEUR"
        : p.lives <= 0
          ? "ÉLIMINÉ"
          : "EN VIE";
      row.querySelector<HTMLElement>(".lobbyrow__meta")!.textContent =
        `♥${p.lives} · ${p.score}`;
      list.appendChild(row);
    }
  }

  function endMatch(msg: Extract<ServerMsg, { t: "match_end" }>): void {
    if (!net) return;

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
      $(hintId).textContent = "LIEN COPIÉ";
    } catch {
      $(hintId).textContent = link;
    }
  }

  const onMsg = (msg: ServerMsg): void => {
    if (msg.t === "room") {
      roomCode = msg.code;
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
      if (msg.code === "room_unknown") {
        setJoinErr(msg.detail === "déconnecté" ? "DÉCONNECTÉ" : "SALON INTROUVABLE");
        if (roomCode) {
          roomCode = "";
          endScreenOpen = false;
          muted.clear();
          clearChat();
          clearMatch();
          show("multi-join");
        }
      } else if (msg.code === "room_full") {
        setJoinErr("SALON PLEIN");
      } else if (msg.code === "not_host") {
        setJoinErr("SEUL L'HÔTE PEUT LANCER");
      } else if (msg.code === "in_match") {
        setJoinErr("MATCH EN COURS");
      } else if (msg.code === "bad_version") {
        setJoinErr("VERSION INCOMPATIBLE");
      } else if (msg.code === "kicked") {
        setJoinErr("EXCLU DU SALON");
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

  async function ensureConnected(): Promise<NetClient | null> {
    if (net?.connected) return net;
    const name = ensurePseudo();
    if (!name) return null;
    if (connecting) return null;
    connecting = true;
    btnMulti.disabled = true;
    btnMulti.textContent = "CONNEXION…";
    try {
      if (!net) {
        net = new NetClient(url);
        unsub?.();
        unsub = net.on(onMsg);
      }
      await net.connect(name, glyphFor(name));
      return net;
    } catch {
      setJoinErr("CONNEXION IMPOSSIBLE");
      show("multi-join");
      return null;
    } finally {
      connecting = false;
      btnMulti.disabled = false;
      btnMulti.textContent = "MULTIJOUEUR";
    }
  }

  async function openJoin(prefill?: string): Promise<void> {
    sfx.ui();
    setJoinErr(null);
    const codeInput = $<HTMLInputElement>("multiCode");
    if (prefill) codeInput.value = prefill;
    const client = await ensureConnected();
    if (!client) return;
    show("multi-join");
    codeInput.focus();
  }

  function exitToMenu(): void {
    endScreenOpen = false;
    if (net?.connected) net.leave();
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
      action,
      elapsed,
      match.rule!.judge,
    );
    match.progress = progress;

    if (outcome.kind === "pending") return { consumed: true };

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
      hud.setMeta(sec > 0 ? `DÉPART · ${sec}` : "…");
      hud.clearRound();
      return { round: null, rule: match.rule, reveal: false };
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
      hud.setRule(match.camRule);
      hud.updateRound(match.camRound, match.camRound.durationMs, ratio);
      return {
        round: match.camRound,
        rule: match.camRule,
        ratio,
        reveal: true,
      };
    }

    const span = Math.max(1, match.deadline - match.startAt);
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

  btnMulti.addEventListener("click", () => {
    void openJoin();
  });

  $("btnMultiCreate").addEventListener("click", () => {
    sfx.ui();
    setJoinErr(null);
    net?.createRoom();
  });

  $("btnMultiJoin").addEventListener("click", () => {
    sfx.ui();
    const code = $<HTMLInputElement>("multiCode").value.trim().toUpperCase();
    if (code.length !== 4) {
      setJoinErr("CODE À 4 LETTRES");
      return;
    }
    setJoinErr(null);
    net?.joinRoom(code);
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
  });

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
