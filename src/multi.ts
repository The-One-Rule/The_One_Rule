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
  RECONNECT_GRACE_MS,
  ROTATION_CHOICES,
  SPEED_CHOICES,
} from "../shared/protocol";
import type { Action, OneRule, Outcome, Round, RoundProgress } from "./engine/types";
import { buildMultiRound, draftShared, poolMulti } from "./engine/multiround";
import { windowMs } from "./engine/difficulty";
import { resolveAction } from "./engine/resolve";
import { ruleById } from "./engine/rules";
import * as P from "./game/progress";
import { jetonPourSalon } from "./compte";
import { signeAffiche } from "./compte/revendication";
import { track } from "./analytics";
import { cleanEnv } from "./env";
import { NetClient } from "./net/client";
import { GLYPH_COUNT, glyphFor, glyphSvg, glyphVariant } from "./net/glyph";
import type { Hud } from "./render/hud";
import { livesDots } from "./render/hud";
import { fillOptions } from "./render/option";
import { plateClasses } from "./render/plate";
import type { PlateFlash } from "./render/plate";
import { seatClasses, seatStatus } from "./render/seat";
import { musicApi, sfx, unlock } from "./audio";
/*
 * Importee sous un autre nom : `multi.ts` a deja plusieurs `t` locaux — un
 * minuteur, une ligne de titre, un horodatage. Un import nomme `t` les
 * masquerait, et TypeScript le signale au mieux, l'accepte au pire.
 */
import {
  briefDeRegle,
  emotes,
  nomDeRegle,
  nomVitesse,
  nomVitesseEntier,
  statutSiege,
  traduisMotif,
  t as tr,
} from "./i18n";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/**
 * Combien d'émotes, et rien d'autre.
 *
 * Les LIBELLÉS vivent dans `i18n` : le fil ne transporte que l'index, donc
 * chacun lit le sien dans sa langue et deux joueurs qui appuient sur le même
 * bouton s'envoient bien la même chose.
 */
const EMOTE_COUNT = 6;

/**
 * Cet appareil peut-il jouer une consigne au clavier ?
 *
 * Même détection que `TOUCH_ONLY` dans main.ts, prise à l'envers. Elle est
 * DÉCLARÉE au serveur et jamais devinée par lui : un salon n'ouvre le pool
 * clavier que si tous ses sièges l'annoncent, et un « peut-être » y coûterait
 * une vie à quelqu'un qui ne peut pas taper. En cas de doute, c'est non.
 */
const CLAVIER_ICI =
  typeof matchMedia === "undefined" ||
  !matchMedia("(hover: none) and (pointer: coarse)").matches;

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


export type MultiApi = {
  available: boolean;
  exitToMenu: () => void;
  openFromInvite: (code: string) => void;
  isPlayingMulti: () => boolean;
  /** Manche locale courante (pour hit-test), sans effet de bord HUD. */
  peekRound: () => Round | null;
  /** Index de la manche en cours — lu par la couche d'ambiance. */
  roundIndex: () => number;
  trySendMultiAction: (action: Action) => MultiFeel;
  /** Met à jour HUD / compte à rebours ; retourne l'état de dessin ou null. */
  syncFrame: () => MultiDraw | null;
  /** Consomme les effets scène en attente (appelé par main après syncFrame). */
  takeFx: () => MultiFx | null;
  /** Vrai uniquement quand un salon est rejoint — Enter ouvre alors le chat. */
  chatAvailable: () => boolean;
  focusChat: () => void;
  blurChat: () => void;
  /** Synchronise le déploiement du chat (écran ouvert vs manche). */
  onScreen: (id: string | null) => void;
  /**
   * La langue vient de changer : tout ce que ce module a écrit est périmé.
   *
   * Les écrans du multi ne se repeignent pas tout seuls — le salon attend un
   * message du serveur, les émotes sont posées une fois pour toutes au
   * chargement. Sans ce rappel, changer de langue depuis le salon laissait six
   * boutons français au milieu d'une page anglaise.
   */
  onLangue: () => void;
  /**
   * Ouvre l'écran NOM ET SIGNE depuis ailleurs que le multijoueur.
   *
   * Rapporté par Pierre : « impossible de changer nom après connexion ». Le nom
   * n'était saisissable QUE sur le chemin du multijoueur — donc un joueur solo
   * n'en avait aucun, et personne ne pouvait revenir sur le sien.
   *
   * On réutilise cet écran-là plutôt que d'en bâtir un second dans COMPTE :
   * deux champs de nom finiraient par diverger, et c'est déjà ici que vivent la
   * grille des signes et la contrainte de longueur.
   *
   * `revenir` dit où ramener le joueur, par CONTINUER comme par RETOUR. C'est
   * une FONCTION et non un nom d'écran : le multi ne connaît que les siens, et
   * lui apprendre à en nommer d'autres l'attacherait à l'application.
   */
  ouvreIdentite: (revenir: () => void) => void;
  /**
   * Le nom vient d'être validé — quel que soit l'écran d'où l'on venait.
   *
   * C'était le vrai défaut : l'écran d'identité n'écrivait que la sauvegarde
   * locale et ne parlait jamais au compte. Un joueur connecté se renommait donc
   * pour lui seul, et le classement continuait d'afficher l'ancien nom — ou
   * rien du tout.
   */
  onIdentite: (cb: (nom: string, glyphe: number) => void) => void;
};

type MatchState = {
  seed: number;
  rules: Record<string, string>;
  /** Le salon joue au clavier : le pool de consignes s'élargit. Voir `poolMulti`. */
  clavier: boolean;
  phase: "countdown" | "round" | "frozen";
  firstRoundAt: number;
  /** Dernière seconde affichée au décompte — pour ne battre qu'aux secondes. */
  countSec: number;
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

/**
 * Le signe du joueur.
 *
 * Connecté, il appartient au COMPTE et suit donc d'un appareil à l'autre —
 * c'est le sens d'un signe, être ce à quoi les autres vous reconnaissent.
 * Anonyme, on retombe sur la variante dérivée de l'identifiant local, qui est
 * exactement le comportement d'avant.
 */
function myGlyph(): Glyph {
  return signeAffiche(P.load());
}

/**
 * Une SORTIE : un mot, et le geste qu'il déclenche.
 *
 * Une erreur qui ne propose rien laisse le joueur devant un mur rouge. Chaque
 * message nomme donc ses issues — et seulement celles qui répondent VRAIMENT à
 * lui : « SALON COMPLET » ne se répare pas en retapant le code.
 */
interface Sortie {
  readonly quoi: string;
  readonly fait: () => void;
}

function setJoinErr(msg: string | null, sorties: readonly Sortie[] = []): void {
  const el = $("multiJoinErr");
  const actes = $("multiJoinSorties");
  actes.innerHTML = "";
  if (!msg) {
    el.textContent = "";
    el.classList.add("hidden");
    actes.classList.add("hidden");
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
  for (const s of sorties) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn--ghost btn--sortie";
    b.textContent = s.quoi;
    b.addEventListener("click", () => {
      sfx.ui();
      s.fait();
    });
    actes.appendChild(b);
  }
  actes.classList.toggle("hidden", sorties.length === 0);
}

/** RETAPER : on vide le champ et on y remet le curseur. Le geste, pas le mot. */
function sortieRetaper(): Sortie {
  return {
    quoi: tr("sortieRetaper"),
    fait: () => {
      const champ = $<HTMLInputElement>("multiCode");
      champ.value = "";
      champ.focus();
      setJoinErr(null);
    },
  };
}

/* Quatre segments dans une demi-colonne : le « × » ne survit pas, et il ne
   manque pas — l'intitulé ROTATION est juste au-dessus. Le sens complet
   (« toutes les N manches ») reste dans l'`aria-label`.

   Le seul libellé qui soit un MOT plutôt qu'un nombre passe par `i18n` ; les
   vitesses, abrégées et doublées d'un mot entier, y vivent en entier
   (`nomVitesse`). */
const ROTATION_LABEL: Record<number, string> = { 4: "4", 8: "8", 16: "16" };

/*
 * La manche TEMOIN sur laquelle la phrase de vitesse chiffre son ecart.
 *
 * 20 et pas 0 : a la manche 0 la fenetre est encore large et les cinq
 * vitesses se ressemblent. 20 est deja dans le regime ou le choix se sent,
 * et c'est un score que la plupart des salons atteignent.
 */
const MANCHE_TEMOIN = 20;

/*
 * Combien de fois on retente avant de rendre la main.
 *
 * Hissé en constante parce que le panneau de coupure l'ANNONCE (« ESSAI 2 SUR
 * 3 ») : un chiffre écrit deux fois — une dans la boucle, une dans le texte —
 * finit par diverger, et le symptôme serait un compteur qui ment au moment le
 * plus inquiétant de la partie.
 */
const ESSAIS_REPRISE = 3;

function playerGlyph(p: PlayerPublic) {
  return p.glyph ?? glyphFor(p.id);
}

/**
 * Le code du salon, une case par caractère.
 *
 * `textContent` sur le conteneur détruirait les cases — c'est le piège déjà
 * payé sur les cartes de l'accueil. On reconstruit donc les enfants, et on
 * garde toujours quatre cases : un code court laisse des cases vides plutôt
 * qu'une rangée qui change de largeur à chaque rendu.
 */
function setRoomCode(code: string): void {
  const box = $("multiLobbyCode");
  const chars = (code || "").padEnd(4, " ").slice(0, 4).split("");
  if (box.dataset.code === code) return;
  box.dataset.code = code;
  box.innerHTML = "";
  for (const c of chars) {
    const cell = document.createElement("span");
    cell.className = "roomcode__char";
    cell.textContent = c.trim() || "—";
    box.appendChild(cell);
  }
}

/** L'état d'un siège, tel que `render/seat.ts` l'attend. */
function seatState(p: PlayerPublic, inMatch: boolean, myId: string) {
  return {
    connected: p.connected,
    spectator: p.spectator,
    host: p.host,
    rookie: !!p.rookie,
    lives: p.lives,
    score: p.score,
    inMatch,
    isMe: p.id === myId,
  };
}

/**
 * Les identifiants vus au dernier rendu du salon, pour reperer les ARRIVEES.
 *
 * `null` tant qu'on n'a rien vu : le premier rendu ne marque personne, sinon
 * entrer dans un salon de six annoncerait six arrivees. Remis a `null` en
 * quittant, pour que le salon suivant reparte de zero.
 */
let connusDuSalon: Set<string> | null = null;

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
  setRoomCode(code);
  const list = $("multiPlayers");
  list.innerHTML = "";
  const me = players.find((p) => p.id === myId);
  $<HTMLButtonElement>("btnMultiStart").classList.toggle("hidden", !me?.host || inMatch);

  /*
   * Un joueur = une tuile, pas une ligne de tableau.
   *
   * En lignes, le salon avait l'air d'une facture : quatre colonnes dont trois
   * ne disent rien avant le lancement — la règle n'est pas encore tirée (elle
   * s'affichait « — »), et les vies sont les mêmes pour tout le monde. Une
   * tuile ne porte que ce qui distingue : le signe, le nom, et la seule
   * mention qui s'applique.
   */
  /*
   * QUI VIENT D'ARRIVER.
   *
   * On attend quelqu'un, et rien ne disait qu'il etait la : la liste se
   * repeignait, un nom de plus, sans que l'oeil sache lequel. C'est le seul
   * evenement du salon avant le lancement, et c'est celui qu'on guette.
   *
   * ⚠️ La marque est TRANSITOIRE et ne survit pas au repeint suivant : c'est
   * un evenement, pas un etat. Et le premier rendu n'en pose aucune — sinon
   * entrer dans un salon de six annoncerait six arrivees d'un coup.
   */
  const ici = new Set(players.map((p) => p.id));
  const neufs = connusDuSalon === null
    ? new Set<string>()
    : new Set([...ici].filter((id) => !connusDuSalon!.has(id)));
  connusDuSalon = ici;

  for (const p of players) {
    const etat = seatState(p, inMatch, myId);
    const seat = document.createElement("div");
    seat.className = seatClasses(etat).join(" ") + (neufs.has(p.id) ? " is-entre" : "");
    seat.innerHTML =
      `<span class="seat__glyph"></span>` +
      `<span class="seat__id">` +
      `<span class="seat__name"></span>` +
      `<span class="seat__status"></span>` +
      `</span>`;
    seat.querySelector(".seat__glyph")!.innerHTML = glyphSvg(playerGlyph(p), 18);
    seat.querySelector<HTMLElement>(".seat__name")!.textContent = p.name;
    seat.querySelector<HTMLElement>(".seat__status")!.textContent = statutSiege(seatStatus(etat));
    if (p.id !== myId) {
      const acts = document.createElement("div");
      acts.className = "seat__acts";
      const muteBtn = document.createElement("button");
      muteBtn.type = "button";
      muteBtn.className = "seat__act" + (muted.has(p.id) ? " is-on" : "");
      muteBtn.title = muted.has(p.id) ? tr("reactiverMessages") : tr("couperMessages");
      muteBtn.setAttribute("aria-label", (muted.has(p.id) ? tr("ariaReactiver") : tr("ariaCouper"))(p.name));
      muteBtn.textContent = muted.has(p.id) ? tr("muet") : tr("sourdine");
      muteBtn.addEventListener("click", () => onToggleMute(p.id));
      acts.appendChild(muteBtn);
      if (me?.host) {
        const kickBtn = document.createElement("button");
        kickBtn.type = "button";
        kickBtn.className = "seat__act seat__act--kick";
        kickBtn.setAttribute("aria-label", tr("ariaExclure")(p.name));
        kickBtn.textContent = tr("exclure");
        kickBtn.addEventListener("click", () => onKick(p.id));
        acts.appendChild(kickBtn);
      }
      seat.appendChild(acts);
    }
    list.appendChild(seat);
  }

  /*
   * UN EMPLACEMENT LIBRE, et un seul.
   *
   * La colonne des joueurs s'arretait sur le dernier arrive : rien ne disait
   * qu'il restait de la place, alors que c'est la seule chose qu'on regarde en
   * attendant. Une rangee pointillee le dit sans chiffrer — dix cases vides
   * pour deux joueurs donneraient l'impression d'un salon desert.
   *
   * Elle disparait pendant le match : a ce moment-la, la place restante ne
   * change plus rien pour personne.
   */
  if (!inMatch && players.length < MAX_PLAYERS) {
    const libre = document.createElement("div");
    libre.className = "seat seat--libre";
    libre.setAttribute("aria-hidden", "true");
    libre.innerHTML = `<span class="seat__glyph">+</span><span class="seat__id"><span class="seat__name"></span></span>`;
    libre.querySelector<HTMLElement>(".seat__name")!.textContent = tr("salonPlaceLibre");
    list.appendChild(libre);
  }

  /*
   * État vide du salon.
   *
   * Seul dans un salon, l'écran affichait « EN ATTENTE » et un bouton LANCER
   * en évidence : il proposait de démarrer une partie multijoueur à un joueur,
   * et reléguait au second plan la seule action qui a du sens — inviter.
   * L'écran doit dire ce qu'il faut faire, pas seulement ce qui se passe.
   */
  /*
   * L'écran suit l'effectif.
   *
   * Un salon de deux ou trois est le cas ordinaire — c'est ainsi qu'on
   * commence — et c'est justement là que la colonne des joueurs se réduisait à
   * trois lignes perdues dans 860 px de hauteur. En dessous de cinq, les
   * lignes respirent ; au-delà, la densité redevient le bon choix.
   */
  document
    .querySelector(".room")
    ?.classList.toggle("is-few", players.length > 0 && players.length < 5);

  const seul = players.length <= 1;
  $("multiLobbyTitle").textContent = seul ? tr("inviteQuelquun") : tr("enAttente");
  // L'effectif est chiffré à côté du titre : c'est la question qu'on se pose
  // en regardant cet écran, et elle a une réponse exacte.
  $("multiLobbyCount").textContent = tr("salonJoueurs")(players.length, MAX_PLAYERS);
  $("multiInviteHint").textContent = seul ? tr("salonSeulHint") : "";
  $("multiInviteHint").classList.toggle("hidden", !seul);
  // Seul dans un salon, la seule action qui a du sens est d'inviter.
  $("btnMultiInvite").classList.toggle("btn--primary", seul);

  renderSettings(settings, !!me?.host, inMatch);
}

function renderSettings(settings: RoomSettings, isHost: boolean, locked: boolean): void {
  const box = $("multiSettings");
  box.classList.toggle("is-guest", !isHost);
  $("settingsWho").textContent = isHost ? tr("reglagesHote") : tr("reglagesSalon");
  // Dire qui décide, plutôt que de laisser un invité cliquer sans effet et
  // conclure que l'interface est cassée.
  $("settingsHint").textContent = locked
    ? tr("reglagesVerrouilles")
    : isHost
      ? tr("reglagesTuDecides")
      : tr("reglagesInvite");
  box.classList.toggle("is-locked", locked);

  /*
   * Les trois réglages sont rangés du plus faible au plus fort, et leur jauge
   * suit ce rang : c'est ce qui rend « ×8 » ou « 1.3 » lisibles sans les
   * comprendre. `SPEED_CHOICES` descend (1.7 est la plus lente), donc on le
   * retourne — une jauge qui décroît de gauche à droite se lit à l'envers.
   */
  const fill = (
    id: string,
    choices: readonly number[],
    current: number,
    opts: {
      label: (n: number) => string;
      aria: (n: number) => string;
      icon: "bars" | "dots";
      /** Crans allumés pour cette valeur, à son rang `i` dans la liste. */
      level: (n: number, i: number) => number;
      steps: number;
    },
  ): void => {
    fillOptions(
      $(id),
      choices.map((v, i) => ({
        value: String(v),
        label: opts.label(v),
        level: opts.level(v, i),
        steps: opts.steps,
        icon: opts.icon,
        selected: v === current,
        disabled: locked || !isHost,
        aria: opts.aria(v),
        // Le salon est le seul groupe en barre segmentée : voir `compact`.
        compact: true,
      })),
    );
  };

  const vitesses = [...SPEED_CHOICES].sort((a, b) => b - a);
  /*
   * ⚠️ CE QUE LA VITESSE CHANGE, EN MILLISECONDES.
   *
   * Cinq mots dans une barre ne disent pas combien de temps on aura, et c'est
   * le defaut mesure en soiree : trois joueurs sur quatre ne savaient pas
   * regler la vitesse. La phrase est CALCULEE depuis `windowMs` a une manche
   * temoin — un chiffre ecrit a la main divergerait au premier changement de
   * courbe, en silence.
   *
   * NORMAL ne montre pas d'ecart : il EST la reference, donc « +0 MS » ne
   * voudrait rien dire. Il montre sa duree.
   */
  const base = windowMs(MANCHE_TEMOIN);
  const mien = Math.round(base * settings.speed);
  const nom = nomVitesseEntier(settings.speed).toUpperCase();
  $("speedQuoi").textContent =
    settings.speed === 1
      ? tr("vitesseQuoiRef")(nom, mien)
      : tr("vitesseQuoi")(nom, mien - Math.round(base));

  fill("optSpeed", vitesses, settings.speed, {
    label: (n) => nomVitesse(n),
    aria: (n) => tr("ariaVitesse")(nomVitesseEntier(n)),
    icon: "bars",
    level: (_n, i) => i + 1,
    steps: vitesses.length,
  });

  /*
   * Les vies se COMPTENT, elles ne s'échelonnent pas : des carrés, comme les
   * points de vie sur les plaques et au classement, et autant que la valeur —
   * pas son rang. Rangée par rang, l'option « 3 » n'affichait que deux points,
   * ce qui est faux au premier coup d'œil pour le seul réglage dont l'icône
   * peut dire exactement la valeur.
   */
  const maxVies = Math.max(...LIVES_CHOICES);
  fill("optLives", LIVES_CHOICES, settings.lives, {
    label: (n) => String(n),
    aria: (n) => tr("ariaVies")(n),
    icon: "dots",
    level: (n) => n,
    steps: maxVies,
  });

  /*
   * Plus la jauge est haute, plus les règles tournent souvent — et JAMAIS
   * n'allume RIEN. Un seul cran allumé pour « jamais » aurait dit « un peu ».
   */
  const rotations = [...ROTATION_CHOICES].sort((a, b) => b - a);
  fill("optRotation", rotations, settings.rotationEvery, {
    label: (n) => ROTATION_LABEL[n] ?? tr("optJamais"),
    aria: (n) => (n >= 999 ? tr("ariaRotationJamais") : tr("ariaRotation")(n)),
    icon: "bars",
    level: (_n, i) => i,
    steps: rotations.length - 1,
  });

  /*
   * ÉQUIPES : un choix binaire, donc deux boutons plutôt qu'une bascule.
   *
   * `fill` travaille sur des nombres — 0 et 1 font l'affaire, et le réglage
   * repart en booléen dans `onSetting`. Une bascule aurait été plus courte,
   * mais les trois autres réglages sont des barres segmentées : un composant
   * différent pour le quatrième se lirait comme un réglage d'une autre nature.
   */
  fill("optDuo", [0, 1], settings.duo ? 1 : 0, {
    label: (n) => (n === 1 ? tr("optDuos") : tr("optChacun")),
    aria: (n) => (n === 1 ? tr("ariaDuos") : tr("ariaChacun")),
    icon: "dots",
    level: (n) => n + 1,
    steps: 2,
  });
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
  if (o.kind === "survive") return o.trap ? `${tr("piegeDejoue")}…` : `${tr("tenu")}…`;
  if (o.kind === "death") return traduisMotif(o.reason);
  return "";
}

/**
 * Le libellé du tampon se déduit de la raison — jamais d'un contexte d'appel,
 * sinon le grand élément finit par contredire le petit.
 *
 * ⚠️ Le tri se fait sur le FRANÇAIS, parce que c'est le français qui voyage
 * sur le fil : le serveur envoie `verdict.reason` en clair et la traduction
 * n'a lieu qu'à l'affichage. Trier sur la phrase déjà traduite ferait tomber
 * tous les tampons anglais sur « MISSED », et le grand mot contredirait la
 * petite ligne — exactement ce que cette fonction existe pour empêcher.
 */
export function stampForReason(reason: string): string {
  const r = reason.toUpperCase();
  if (r.includes("TEMPS") || r.includes("ÉCOUL")) return tr("tamponLent");
  if (r.includes("RÈGLE") || r.includes("INTERDIT")) return tr("tamponInfraction");
  return tr("tamponRate");
}

function stampFor(o: RoundOutcome): string {
  if (o.kind !== "death") return tr("tamponRate");
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
  const feedEl = $("feed");
  const feedTimers = new Set<ReturnType<typeof setTimeout>>();
  const chatEl = $("chat");
  const chatLog = $("chatLog");
  const chatForm = $("chatForm") as HTMLFormElement;
  const chatInput = $<HTMLInputElement>("chatInput");
  chatInput.maxLength = CHAT_MAX_LEN;
  /** Où le chat retourne quand il n'est ancré nulle part : la couche flottante. */
  const chatFloat = chatEl.parentElement!;
  /** Bandes latérales, une par écran qui en porte une. */
  const chatDocks: Record<string, HTMLElement> = {
    "multi-lobby": $("chatSlot"),
    "multi-end": $("chatSlotEnd"),
  };

  const TOUCH_ONLY =
    typeof matchMedia !== "undefined" &&
    matchMedia("(hover: none) and (pointer: coarse)").matches;

  /*
   * Seuil d'ancrage de la bande de chat.
   *
   * Plus haut que le seuil des deux colonnes (900 px) : la bande prend jusqu'à
   * 380 px, et les deux colonnes du contenu doivent garder de quoi respirer à
   * côté. À 1200 px il reste 812 px pour elles, soit ~380 chacune. En dessous,
   * le chat redevient la barre du bas, qui ne prend de place à personne.
   */
  const wideScreen = typeof matchMedia !== "undefined" ? matchMedia("(min-width: 1200px)") : null;

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
    roundIndex: () => 0,
    trySendMultiAction: () => ({ consumed: false }),
    syncFrame: () => null,
    takeFx: () => null,
    chatAvailable: () => false,
    focusChat: () => {},
    blurChat: () => {},
    onScreen: () => {},
    onLangue: () => {},
    ouvreIdentite: () => {},
    onIdentite: () => {},
  };

  if (!wsUrl) {
    btnMulti.classList.add("hidden");
    return noop;
  }
  const url: string = wsUrl;

  let net: NetClient | null = null;
  /** Libellé d'état de la carte MULTIJOUEUR, le temps d'une connexion. */
  let etatMultiAvant = "";
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
  /**
   * Dernière manche pour laquelle l'illisibilité a déjà été signalée.
   *
   * `-1` ne peut désigner aucune manche (`match.idx` part de 0), donc l'état
   * neuf ne masque jamais le premier signalement.
   */
  let illisibleSignale = -1;
  /**
   * Comment on est entré dans le salon où l'on se trouve.
   *
   * Posée à l'appel, consommée à la première `room` reçue : c'est l'ARRIVÉE
   * qu'on veut compter, pas l'intention. Un code faux, un salon plein ou une
   * socket morte ne doivent pas gonfler le chiffre — sinon l'entonnoir dirait
   * que tout le monde entre, ce qui est exactement la question posée.
   *
   * ⚠️ La reprise après coupure ne la pose PAS : rejoindre son propre salon
   * après un métro n'est pas une entrée, et le compter ferait passer un réseau
   * instable pour de l'affluence.
   */
  let entreeSalon: "cree" | "rejoint" | null = null;
  /** Dernière liste salon — ordre stable pour les plaques. */
  let lastPlayers: PlayerPublic[] = [];
  let roomSettings: RoomSettings = { ...DEFAULT_SETTINGS };
  let lobbyInMatch = false;
  const watchBar = $("watchBar");
  const watchTargets = $("watchTargets");
  /** Flashes de verdict (ok/trap/dead/idle) jusqu'à expiration ou prochaine manche. */
  const platePulse = new Map<string, PlateFlash>();
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
      "drama--me",
      "drama--dead-me",
    );
    dramaEl.setAttribute("aria-hidden", "true");
    dramaEyebrow.textContent = "";
    dramaNames.textContent = "";
    dramaRule.textContent = "";
    dramaReason.textContent = "";
    dramaExtra.textContent = "";
    dramaExtra.classList.remove("is-tick");
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

    /*
     * UN seul panneau, jamais deux couches superposées.
     *
     * Le tampon plein cadre (« INFRACTION », 96 px, cadre incliné, z-index 9)
     * s'abattait PAR-DESSUS ce panneau (z-index 8) quand la victime, c'était
     * moi. Deux surfaces centrées l'une sur l'autre, disant la même chose, et
     * celle du dessus masquait le pseudo et la raison. Rapporté en playtest :
     * « on voit le pseudo du joueur et une autre pop-up juste au-dessus ».
     *
     * Le panneau porte donc seul l'information pendant une kill-cam, et il dit
     * à qui elle s'adresse. Le tampon reste pour les manches SANS kill-cam
     * (pauses courtes, duel), où il est la seule annonce à l'écran.
     */
    /*
     * `elim` dit qu'une élimination a eu lieu DANS LA MANCHE, pas qu'elle est
     * la mienne : il se déduit de la longueur de pause, qui vaut pour tout le
     * salon. Bâtir l'intitulé dessus annonçait « TU ES ÉLIMINÉ » à quelqu'un
     * qui venait seulement de perdre une vie pendant qu'un autre tombait. Le
     * texte se lit donc sur la victime en tête — c'est moi dès que je suis
     * dans la liste, le tri s'en charge — et sur SON élimination à elle.
     */
    const tete = victims[0]!;
    const victimeMoi = tete.player.id === net?.myId;
    const jeSuisElimine = victimeMoi && tete.eliminated;
    dramaEl.classList.toggle("drama--me", victimeMoi);
    dramaEl.classList.toggle("drama--dead-me", jeSuisElimine);
    dramaEyebrow.textContent = victimeMoi
      ? jeSuisElimine
        ? tr("tuEsElimine")
        : tr("tuPerdsUneVie")
      : elim
        ? tr("elimine")
        : tr("viePerdue");
    dramaNames.textContent = victims.map((v) => v.player.name).join(" · ");
    // « SOUS » : sans ce mot, un nom de règle posé entre un pseudo et une
    // raison de mort ne se lit pas comme une règle.
    dramaRule.textContent = tr("sousRegle")(nomDeRegle(focusRule.id, focusRule.name));
    const primary = victims[0]!;
    dramaReason.textContent = traduisMotif(primary.reason).toUpperCase();
    dramaExtra.textContent = elim && aliveCount > 0 ? tr("ilsNeSontPlusQue")(aliveCount) : "";
    timerEl.classList.add("is-recharge");
    hud.hideStamp();
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
    dramaEyebrow.textContent = rotation ? tr("regleChange") : tr("regleUnique");
    dramaNames.textContent = nomDeRegle(rule.id, rule.name);
    // Le brief EN CLAIR, pas seulement le nom : « LE DALTONIEN » ne dit rien
    // à qui ne l'a jamais rencontré, et c'est justement le cas d'un invité.
    dramaReason.textContent = briefDeRegle(rule.id, rule.brief);
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
    dramaEyebrow.textContent = tr("duel");
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
      hud.setFooterLives(shown.score, Math.max(0, shown.lives), match.maxLives, tr("piedSpectateur"));
      const rotating = match.rotationUntil > 0 && net.clock.now() < match.rotationUntil;
      if (!rotating) hud.setMeta(tr("jeRegarde")(shown.name));
      return;
    }
    hud.setFooterLives(match.score, Math.max(0, match.lives), match.maxLives, tr("piedMulti"));
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
    match.round = buildMultiRound(match.seed, match.idx, rule, poolMulti(match.clavier));
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

  /**
   * Une chute au fil des événements.
   *
   * N'invente aucune donnée : le nom et le motif viennent du verdict que le
   * serveur envoie déjà. Trois lignes au plus à l'écran — au-delà, la plus
   * ancienne s'efface : un fil qui s'allonge devient un mur de texte, et le
   * but est exactement l'inverse.
   */
  function pushFeed(nom: string, motif: string, elim: boolean, moi: boolean): void {
    const ligne = document.createElement("div");
    ligne.className =
      "feed__line" + (elim ? " is-elim" : "") + (moi ? " is-me" : "");
    const qui = document.createElement("span");
    qui.className = "feed__who";
    qui.textContent = nom;
    const pourquoi = document.createElement("span");
    pourquoi.className = "feed__why";
    pourquoi.textContent = elim ? tr("elimineSous")(motif) : motif;
    ligne.append(qui, pourquoi);
    feedEl.appendChild(ligne);
    while (feedEl.children.length > 3) feedEl.firstElementChild?.remove();

    const t = setTimeout(() => {
      ligne.classList.add("is-out");
      const t2 = setTimeout(() => {
        ligne.remove();
        feedTimers.delete(t2);
      }, 260);
      feedTimers.add(t2);
      feedTimers.delete(t);
    }, 2200);
    feedTimers.add(t);
  }

  function clearFeed(): void {
    for (const t of feedTimers) clearTimeout(t);
    feedTimers.clear();
    feedEl.innerHTML = "";
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
    const bande = uiScreen !== null ? chatDocks[uiScreen] : undefined;
    const cible = bande && (wideScreen?.matches ?? false) ? bande : chatFloat;
    if (chatEl.parentElement === cible) return;
    const avaitLeFocus = document.activeElement === chatInput;
    cible.appendChild(chatEl);
    chatEl.classList.toggle("chat--docked", cible !== chatFloat);
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

  /**
   * Réserve, sous le contenu, la place que le chat FLOTTANT lui prend.
   *
   * Mesuré sur un 375×667 : la couche recouvrait le bouton « 5 vies » du salon
   * — et comme elle reçoit les clics, le réglage devenait inatteignable. On ne
   * déplace pas le chat pour autant : sur téléphone, c'est justement d'être
   * toujours là qu'il tire son intérêt.
   *
   * Aucune boucle de décision : le chat est positionné par rapport à `#app`,
   * donc sa hauteur ne dépend pas de la marge qu'on vient de poser.
   */
  function reserveChatSpace(): void {
    const flottant =
      !chatEl.classList.contains("hidden") && !chatEl.classList.contains("chat--docked");
    const h = flottant ? Math.round(chatEl.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty("--chat-space", h ? `${h + 16}px` : "0px");
  }

  function syncChatChrome(): void {
    dockChat();
    if (!chatAvailable()) {
      chatEl.classList.add("hidden");
      chatEl.classList.remove("is-collapsed");
      clearChatFade();
      reserveChatSpace();
      return;
    }
    chatEl.classList.remove("hidden");
    const expanded = chatExpanded();
    chatEl.classList.toggle("is-collapsed", !expanded);
    renderChatLog();
    reserveChatSpace();
    if (expanded) {
      clearChatFade();
    } else {
      clearChatFade();
      chatFadeTimer = setTimeout(() => {
        chatFadeTimer = null;
        if (!chatExpanded()) {
          chatLog.innerHTML = "";
          reserveChatSpace();
        }
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

  function onLangue(): void {
    populateEmotes();
    // Le salon se repeint depuis le dernier état reçu, pas depuis le serveur :
    // changer de langue ne doit rien demander au réseau.
    paintLobby();
  }

  function paintLobby(): void {
    if (!roomCode) return;
    /*
     * « CHOISIR TON NOM » n'apparait que pour qui n'en a pas — donc pour qui
     * vient d'entrer par un lien. C'est le nommage deplace APRES l'entree :
     * la ou il ne fait plus attendre personne. Cache pendant une manche : on
     * ne se renomme pas au milieu d'un match, la reprise de siege passerait
     * par une reconnexion.
     */
    $("btnMultiNom").classList.toggle("hidden", !!savedName() || lobbyInMatch);
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
    bubble.textContent = emotes()[k] ?? "";
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
    emotes().forEach((label, k) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.k = String(k);
      btn.textContent = label;
      btn.setAttribute("aria-label", label);
      emotesEl.appendChild(btn);
    });
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
      const regle = ruleById(ruleId);
      const ruleName = regle ? nomDeRegle(regle.id, regle.name) : ruleId;
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

      /*
       * En duo, la plaque porte l'équipe.
       *
       * `is-equipe-N` colore le liseré : deux plaques du même liseré sont un
       * duo, et ça se voit sans lire. C'est indispensable — les partenaires
       * affichent le MÊME nombre de vies, et sans repère visuel un joueur
       * croirait à un bug plutôt qu'à une réserve commune.
       */
      const equipe = p.team;
      el.className =
        plateClasses({
          isMe: p.id === myId,
          lives: p.lives,
          rookie: !!p.rookie,
          pulse: platePulse.get(p.id) ?? null,
          inRound: match!.phase === "round",
        }).join(" ") + (equipe === undefined ? "" : ` is-equipe-${equipe % 5}`);

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
    clearEmoteTimers();
    clearFeed();
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

    /*
     * LE MATCH COMMENCE — le premier chiffre qui manquait.
     *
     * Posé après la garde du spectateur : celui qui n'a pas de siège ne lance
     * pas une partie, il en regarde une. Le compter ferait passer une table de
     * quatre pour une table de six.
     *
     * On note l'effectif et les réglages parce que c'est ce qui manque pour
     * lire les abandons : un salon de deux et un salon de dix ne se jouent pas
     * de la même façon, et l'équilibrage se règle par mode.
     */
    track("match_debut", {
      joueurs: lastPlayers.filter((p) => p.lives > 0).length,
      spectateur: !msg.rules[net.myId],
      duo: roomSettings?.duo ?? false,
      vitesse: roomSettings?.speed ?? null,
      vies: roomSettings?.lives ?? null,
    });

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
      // Reçu, jamais déduit de la liste des joueurs : une déduction locale
      // divergerait le temps qu'un départ se propage, et une divergence sur le
      // tirage donne un aperçu qui contredit le verdict. Absent = tactile,
      // c'est-à-dire ce qu'un serveur d'une version antérieure fait déjà.
      clavier: msg.clavier === true,
      phase: "countdown",
      firstRoundAt: msg.firstRoundAt,
      countSec: -1,
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
    hud.hideStamp();
    $("head").classList.remove("is-preview");
    rebuildViewRound();
    /*
     * La règle a pu raccourcir la fenêtre personnelle : la barre doit le dire,
     * sinon elle promet du temps que le serveur ne donne pas.
     *
     * ⚠️ LE DÉNOMINATEUR EST LA MANCHE COMMUNE, PAS `windowMs(idx)`.
     *
     * C'est `windowMs` qu'on lisait, c'est-à-dire la courbe NUE. Or la manche
     * commune vaut `windowForSteps` : elle ajoute 280 ms par geste
     * SUPPLÉMENTAIRE. Sur une consigne à deux gestes et sans déformation, le
     * rapport valait donc (fenêtre + 280) / fenêtre — soit 1,14 au lieu de 1, et
     * la barre du client promettait 14 % de temps que le serveur ne donnait pas.
     *
     * Un aperçu qui contredit le verdict est le seul défaut que ce dépôt tient
     * pour fatal (décision n°3). Le serveur, lui, rapporte bien la fenêtre
     * personnelle à la manche COMMUNE ; on lit donc la même chose que lui.
     */
    const commune = draftShared(match.seed, match.idx, poolMulti(match.clavier)).durationMs;
    match.spanFactor = match.round && commune > 0 ? match.round.durationMs / commune : 1;
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
      // Le tampon est posé plus bas, une fois qu'on sait si un panneau va
      // occuper le centre : le poser ici le faisait clignoter sous la kill-cam.
    }

    /*
     * Le verdict reste affiché jusqu'à la manche suivante — pas 800 ms.
     *
     * Il s'effaçait sur minuterie, alors que la pause dure 1100 ms au calme,
     * 2400 après une vie perdue et 4200 après une élimination : pendant une
     * kill-cam, on regardait donc des plaques neutres pendant plus de trois
     * secondes, au moment précis où l'on veut voir qui a tenu. Le message
     * `round` remet déjà le compteur à zéro : c'est lui qui efface, comme
     * partout ailleurs, plutôt qu'un `setTimeout` qui devine.
     */
    platePulse.clear();
    for (const [id, o] of Object.entries(msg.outcomes)) {
      platePulse.set(id, outcomeFlash(o));
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
      /*
       * MOI d'abord, puis les éliminés.
       *
       * Tout le panneau se règle sur `victims[0]` : la raison affichée, la
       * règle nommée, et la scène rejouée derrière. Trié sur la seule
       * élimination, il m'annonçait « TU PERDS UNE VIE » au-dessus du motif de
       * quelqu'un d'autre — mesuré en salon à trois : « SOUS LA POINTE » alors
       * que je portais LE SANG. Quand je suis dans la liste, c'est ma mort que
       * l'écran doit expliquer ; le spectacle des autres passe après.
       */
      .sort((a, b) => {
        const moi = (v: { player: PlayerPublic }) => (v.player.id === net?.myId ? 1 : 0);
        return moi(b) - moi(a) || Number(b.eliminated) - Number(a.eliminated);
      });

    // Le fil, lui, ne dépend pas de la longueur de la pause : il annonce
    // CHAQUE chute, y compris celles qui n'ouvrent aucun panneau.
    for (const v of victims) {
      pushFeed(
        v.player.name,
        // Le motif arrive du serveur en français canonique : le fil est le
        // DERNIER endroit qui l'écrivait tel quel. Trouvé en jouant, pas en
        // relisant — le bandeau disait « YOU CLICKED EMPTY SPACE » pendant
        // que le fil, trois lignes plus bas, disait « TU AS CLIQUÉ DANS LE
        // VIDE » pour la même mort.
        traduisMotif(v.reason).toUpperCase(),
        v.eliminated,
        v.player.id === net.myId,
      );
    }

    /*
     * Une seule annonce plein cadre à la fois.
     *
     * Le tampon et le panneau sont deux surfaces centrées, opaques, de tailles
     * comparables. Quand les deux tombaient ensemble — c'est-à-dire chaque
     * fois que la victime était moi — le tampon recouvrait le panneau, donc le
     * pseudo et la raison. Le tampon ne sert donc plus que là où il est seul.
     */
    const duelPrevu = pauseMs <= 800 && alive.length === 2 && !match.duelAnnounced;

    if (pauseMs > 1800 && victims.length > 0) {
      const focus = victims[0]!;
      const rid = match.rules[focus.player.id] ?? focus.player.ruleId;
      const focusRule = ruleById(rid);
      if (!focusRule && mine?.kind === "death") hud.showStamp(stampFor(mine));
      if (focusRule) {
        // La kill-cam reconstruit la manche de la VICTIME : même graine, même
        // index, sa règle — et le même pool, sinon on lui montrerait un
        // tableau que personne n'a joué.
        const focusRound = buildMultiRound(
          match.seed,
          match.idx,
          focusRule,
          poolMulti(match.clavier),
        );
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

    if (duelPrevu) {
      match.duelAnnounced = true;
      showDuel(alive[0]!, alive[1]!);
      sfx.win();
      return;
    }

    // Aucun panneau ne prend le centre : le tampon est alors la seule annonce
    // de ma mort, et il la porte seul.
    if (mine?.kind === "death") hud.showStamp(stampFor(mine));
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
        label: tr("titreReflexe"),
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
        label: tr("titreFlair"),
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
        label: tr("titreSerie"),
        value: `×${serie.s.bestStreak}`,
        player: serie.p,
      });
    }


    /*
     * TÊTE BRÛLÉE — celui qui est mort le plus souvent sur SA PROPRE règle.
     *
     * C'est le seul titre qui célèbre une défaite, et c'est voulu : mourir sur
     * sa règle unique est la faute que le jeu existe pour produire. Elle se
     * raconte, elle se charrie, et elle dit exactement ce qui distingue TOR
     * d'un jeu de réflexes.
     *
     * ⚠️ Le compte vient du SERVEUR (`stats.rulebreaks`), pas du client. Deux
     * clients qui observent des fenêtres différentes — quelqu'un arrivé en
     * cours de match — décerneraient des titres différents sur le même écran.
     */
    let brulee: (typeof withStats)[number] | null = null;
    for (const row of withStats) {
      if (row.s.rulebreaks < 2) continue;
      if (!brulee || row.s.rulebreaks > brulee.s.rulebreaks) brulee = row;
    }
    if (brulee) {
      titles.push({
        label: tr("titreBrulee"),
        value: String(brulee.s.rulebreaks),
        player: brulee.p,
      });
    }

    /*
     * SURVIVANTE — première partie, et elle gagne.
     *
     * Le titre le plus rare et le plus social du salon : un nouveau invité par
     * un ami qui bat toute la table. Aucune donnée nouvelle — `rookie` est déjà
     * sur la plaque, et le vainqueur est celui qui a encore des vies.
     *
     * ⚠️ Il ne parait QUE si le vainqueur est un débutant. Le décerner au
     * meilleur débutant qui a perdu serait un lot de consolation, c'est-à-dire
     * exactement ce qu'un titre ne doit pas être.
     */
    const vainqueur = [...players]
      .filter((p) => !p.spectator && p.lives > 0)
      .sort((a, b) => b.lives - a.lives || b.score - a.score)[0];
    if (vainqueur?.rookie) {
      titles.push({
        label: tr("titreSurvivante"),
        value: tr("titrePremiereFois"),
        player: vainqueur,
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
        (() => {
          const r = ruleById(p.ruleId);
          return r ? nomDeRegle(r.id, r.name) : p.ruleId || "—";
        })();
      row.querySelector<HTMLElement>(".lobbyrow__status")!.textContent = isWinner
        ? tr("vainqueur")
        : p.lives <= 0
          ? tr("elimine")
          : tr("rangEme")(rang + 1);
      // Vies en points, comme sur les plaques et au pied : une seule grammaire
      // visuelle pour une même information.
      // `livesDots` rend des <i> NUS : sans le conteneur `.lifedots`, la CSS
      // ne les atteint pas et les points restent invisibles.
      row.querySelector<HTMLElement>(".lobbyrow__meta")!.innerHTML =
        `<span class="lifedots">${livesDots(Math.max(0, p.lives), maxLives)}</span>` +
        `<span class="lobbyrow__rounds">${tr("manchesN")(p.score)}</span>`;
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
        `<span class="lobbyrow__status">${tr("piedSpectateur")}</span>` +
        `<span class="lobbyrow__meta"><span class="lobbyrow__rounds">${tr("aRegarde")}</span></span>`;
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

    /*
     * LE MATCH SE TERMINE — et c'est ici que se lit l'abandon.
     *
     * `manches` dit combien de temps la table a tenu, `place` où l'on finit.
     * Un match qui s'arrête à la troisième manche et un match qui va au bout
     * racontent deux choses opposées, et rien ne les distinguait jusqu'ici.
     *
     * ⚠️ Lu AVANT `clearMatch()`, qui efface `match`.
     */
    const vivants = msg.players.filter((p) => p.lives > 0).length;
    /* Lu avant `clearMatch()`, et reutilise plus bas par la ligne de rang. */
    const manchesTenues = match?.idx ?? 0;
    track("match_fin", {
      manches: manchesTenues,
      joueurs: msg.players.length,
      gagne: msg.winnerId !== null && msg.winnerId === net.myId,
      survivants: vivants,
    });

    hideDrama();
    musicApi.stop();
    lastPlayers = mergePlayers(lastPlayers, msg.players);
    clearMatch();
    endScreenOpen = true;

    /*
     * Le résultat AVANT le nom.
     *
     * L'écran affichait le nom du vainqueur, et rien d'autre : celui qui
     * perdait lisait un pseudo — le sien s'il gagnait — sans qu'aucun mot ne
     * lui dise ce qui venait de se passer. C'est le dernier écran d'un match,
     * celui qu'on regarde ensemble : il doit trancher en un coup d'œil.
     */
    const title = $("multiEndTitle");
    const kicker = $("multiEndKicker");
    const ecran = $("multi-end");
    /*
     * LE CODE DU SALON RESTE SOUS LES YEUX — « MATCH TERMINÉ · 3PS8 ».
     *
     * C'est l'ecran ou l'on decide de rejouer ensemble, et le code y avait
     * disparu : pour le redonner a l'oral — la seule façon dont il circule
     * vraiment (playtest du jour 2) — il fallait quitter l'ecran de fin.
     * `roomCode` peut manquer sur un match rejoint par lien : la suite est
     * alors omise plutot qu'affichee vide.
     */
    const suffixeCode = roomCode ? ` · ${roomCode}` : "";
    const jeGagne = msg.winnerId !== null && msg.winnerId === net.myId;
    ecran.classList.toggle("is-victory", jeGagne);
    if (msg.winnerId === null) {
      kicker.textContent = tr("matchTermine") + suffixeCode;
      title.textContent = tr("egalite");
      title.classList.remove("is-win");
    } else {
      const winner =
        lastPlayers.find((p) => p.id === msg.winnerId) ??
        msg.players.find((p) => p.id === msg.winnerId);
      /*
       * LE VERBE PASSE DANS LE TITRE — « MARGOT GAGNE », pas « MARGOT ».
       *
       * Le correctif d'origine avait mis l'issue dans l'intitule parce que le
       * titre ne portait qu'un nom : celui qui perdait lisait un pseudo sans
       * qu'un mot lui dise ce qui venait de se passer. La maquette telephone
       * fait mieux avec le meme materiau — l'issue EST le titre, et l'intitule
       * redevient ce qu'il dit etre : ou l'on se trouve, et dans quel salon.
       * Le defaut d'origine reste corrige, et il se lit d'un coup d'oeil.
       */
      kicker.textContent = tr("matchTermine") + suffixeCode;
      const nom = winner?.name;
      title.textContent = jeGagne
        ? tr("tuAsGagne")
        : nom
          ? tr("finGagne")(nom)
          : tr("finDuMatch");
      title.classList.toggle("is-win", jeGagne);
    }

    /*
     * LA LIGNE DE RANG — la seule qui parle du joueur qui lit.
     *
     * Le classement se fait sur les vies puis le score, exactement comme le
     * podium juste en dessous : deux tris differents donneraient deux rangs
     * differents sur le meme ecran, et c'est le genre de contradiction qui fait
     * douter du verdict entier.
     *
     * Les SPECTATEURS ne comptent ni au numerateur ni au denominateur — « 2e
     * sur 6 » doit designer six joueurs, pas six connectes. Un spectateur, lui,
     * n'a pas de rang du tout : la ligne se tait.
     *
     * ⚠️ `match.idx` est lu ICI, avant `clearMatch()` — comme `match_fin`.
     */
    const rang = $("multiEndRang");
    const classes = msg.players
      .filter((p) => !p.spectator)
      .sort((a, b) => b.lives - a.lives || b.score - a.score);
    const maPlace = classes.findIndex((p) => p.id === net!.myId);
    rang.textContent =
      maPlace >= 0 ? tr("finTonRang")(maPlace + 1, classes.length, manchesTenues) : "";

    renderTitles(msg.players);
    renderPodium(msg.players);
    $("multiEndInviteHint").textContent = tr("lienInvitation");

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
      $(hintId).textContent = tr("lienCopie");
    } catch {
      $(hintId).textContent = link;
    }
  }

  const onMsg = (msg: ServerMsg): void => {
    if (msg.t === "room") {
      /*
       * L'ARRIVÉE dans un salon, comptée une fois et à l'endroit où elle est
       * certaine : le serveur vient de confirmer. Voir `entreeSalon`.
       */
      if (entreeSalon) {
        track(entreeSalon === "cree" ? "salon_cree" : "salon_rejoint", {
          joueurs: msg.players.length,
        });
        entreeSalon = null;
      }
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
        /*
         * ⚠️ CHAQUE ERREUR NOMME SES ISSUES, et seulement celles qui répondent
         * vraiment à elle. Un code inconnu se répare en le retapant — c'est le
         * 2 confondu avec le Z — ou en ouvrant le sien. Un salon complet, lui,
         * ne se répare pas en retapant : lui proposer serait un mensonge.
         */
        setJoinErr(
          coupe ? tr("errDeconnecte") : tr("errSalonInconnu"),
          coupe ? [] : [sortieRetaper(), sortieOuvrir()],
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
        setJoinErr(tr("errSalonComplet")(MAX_PLAYERS), [sortieOuvrir()]);
      } else if (msg.code === "not_host") {
        setJoinErr(tr("errPasHote"));
      } else if (msg.code === "in_match") {
        setJoinErr(tr("errEnMatch"));
      } else if (msg.code === "bad_version") {
        // Cas typique d'un onglet resté ouvert sur l'ancien bundle après un
        // déploiement. Le geste qui répare est le rechargement : le dire.
        setJoinErr(tr("errVersion"), [
          { quoi: tr("sortieRecharger"), fait: () => location.reload() },
        ]);
      } else if (msg.code === "kicked") {
        setJoinErr(tr("errExclu"), [sortieOuvrir()]);
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
    /*
     * ⚠️ LE COMPTE EST CALCULE, jamais ecrit.
     *
     * `GLYPH_COUNT` vaut 3 formes x 8 couleurs x 6 motifs, et `glyphIndex` est
     * une bijection testee sur les 144. Un nombre en dur ici divergerait au
     * premier signe ajoute, en silence — et il annoncerait un catalogue qui
     * n'existe pas.
     *
     * On annonce le CATALOGUE (144) et non les variantes offertes ici
     * (`GLYPH_CHOICES`) : ce sont deux nombres differents, et c'est le premier
     * qui dit ce que le signe vaut.
     */
    $("idChoisis").textContent = tr("signeChoisis")(GLYPH_COUNT);
    const hote = $("idGlyphs");
    hote.innerHTML = "";
    const anon = P.load().anonId;
    for (let n = 0; n < GLYPH_CHOICES; n++) {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "glyphpick__opt";
      opt.setAttribute("role", "radio");
      opt.setAttribute("aria-checked", String(n === glyphChoisi));
      opt.setAttribute("aria-label", tr("ariaSigne")(n + 1, GLYPH_CHOICES));
      opt.innerHTML = glyphSvg(glyphVariant(anon, n), 30);
      opt.addEventListener("click", () => {
        glyphChoisi = n;
        sfx.ui();
        renderGlyphPicker();
      });
      hote.appendChild(opt);
    }
  }

  /*
   * Où ramener le joueur après CONTINUER ou RETOUR.
   *
   * `null` = le comportement historique du multijoueur (vers `multi-join`, ou
   * le salon si l'on y était). Rempli quand on arrive d'ailleurs — aujourd'hui
   * l'écran COMPTE, où l'on vient se renommer.
   */
  let retourIdentite: (() => void) | null = null;
  let surIdentite: ((nom: string, glyphe: number) => void) | null = null;

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
  /**
   * LE PANNEAU DE COUPURE — décision n°4, rendue visible.
   *
   * « Une coupure n'est pas une défaite » était vrai dans le serveur et
   * invisible à l'écran : le joueur lisait « RECONNEXION… » en petit dans le
   * bandeau, la scène figée derrière. C'est exactement la sensation
   * d'expulsion que `attemptRejoin` existe pour supprimer.
   *
   * ⚠️ LE REBOURS EST DÉCORATIF, et c'est ce qui le rend honnête.
   *
   * Le sursis appartient au SERVEUR (`RECONNECT_GRACE_MS`), qui décide seul
   * quand la place est perdue. Ce compteur ne fait que MONTRER ce que le
   * serveur promet, il ne le décide pas — et il s'efface au message suivant,
   * jamais sur sa propre fin, exactement comme les états de manche (n°9).
   */
  let coupureDepuis = 0;
  let coupureTic: ReturnType<typeof setInterval> | null = null;

  function montreCoupure(essai: number): void {
    coupureDepuis = Date.now();
    $("coupure").classList.remove("hidden");
    peintCoupure(essai);
    if (coupureTic) clearInterval(coupureTic);
    coupureTic = setInterval(() => peintCoupure(essai), 250);
  }

  function peintCoupure(essai: number): void {
    const passe = Date.now() - coupureDepuis;
    const reste = Math.max(0, RECONNECT_GRACE_MS - passe);
    const part = Math.max(0, Math.min(1, reste / RECONNECT_GRACE_MS));
    $("coupureJauge").style.transform = `scaleX(${part.toFixed(3)})`;
    $("coupureEtat").textContent = tr("coupureEtat")(essai, ESSAIS_REPRISE, Math.ceil(reste / 1000));
  }

  function cacheCoupure(): void {
    if (coupureTic) clearInterval(coupureTic);
    coupureTic = null;
    $("coupure").classList.add("hidden");
  }

  async function attemptRejoin(): Promise<void> {
    if (!lastRoomCode || rejoining) return;
    rejoining = true;
    setJoinErr(null);
    hud.setMeta(tr("reconnexion"));
    montreCoupure(1);
    try {
      for (let essai = 0; essai < ESSAIS_REPRISE; essai++) {
        peintCoupure(essai + 1);
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
      setJoinErr(tr("errConnexionPerdue"), [sortieOuvrir()]);
      setPlatesVisible(false);
      clearPlateCols();
      clearMatch();
      show("multi-join");
    } finally {
      rejoining = false;
      hud.setMeta("");
      cacheCoupure();
    }
  }

  /**
   * « CONNEXION… » sur la carte MULTIJOUEUR, sans la détruire.
   *
   * Elle affichait cet état par `btnMulti.textContent = "CONNEXION…"`. Or
   * `btnMulti` n'est pas un bouton-libellé mais une CARTE : trois `<span>`
   * enfants — titre, description, état. Écrire son `textContent` les supprime
   * tous les trois, définitivement.
   *
   * Conséquences mesurées, et elles s'enchaînent :
   *   · la carte devient un texte brut sans classe, donc noir sur fond
   *     sombre — contraste 1,15:1, illisible ;
   *   · sa description et son état ne reviennent jamais ;
   *   · surtout, `#cardMultiState` n'existe plus dans le document, donc
   *     `renderHome()` lève « Cannot set properties of null » et s'interrompt.
   *     Tout ce qui suit dans cette fonction cesse d'être appliqué : accent de
   *     la carte suivante, mode classé, libellés SON et MUSIQUE.
   *
   * Il suffisait d'ouvrir le multijoueur une fois pour que l'accueil reste
   * cassé jusqu'au rechargement. L'état va donc là où il était prévu — dans
   * `.card__state` — et le titre n'est jamais touché.
   */
  function setCarteMultiOccupee(occupee: boolean): void {
    btnMulti.disabled = occupee;
    const etat = document.getElementById("cardMultiState");
    if (!etat) return;
    // L'état d'origine est mémorisé, jamais réécrit de mémoire : le libellé
    // exact appartient à `renderHome`, et le dupliquer ici garantirait qu'un
    // jour les deux ne diront plus la même chose.
    if (occupee) {
      etatMultiAvant = etat.textContent ?? "";
      etat.textContent = tr("connexion");
    } else {
      etat.textContent = etatMultiAvant;
    }
  }

  /**
   * `anonyme` : accepter d'entrer SANS nom.
   *
   * Le refus par defaut n'etait pas une regle du serveur — celui-ci assied
   * volontiers un ANONYME avec un signe derive — mais un verrou du client. Il
   * transformait un lien d'ami en peage : ecran d'identite, saisie clavier,
   * CONTINUER, et seulement ensuite le salon. Or c'est exactement le moment ou
   * l'ami attend, et exactement la promesse que le jeu affiche en tete de sa
   * documentation : « code/lien -> rejoindre -> jouer ».
   *
   * On garde le verrou pour l'entree DELIBEREE par la carte MULTIJOUEUR : qui
   * cree un salon en est l'hote, et son nom compte pour ceux qui arriveront.
   * On le leve pour le lien, ou le salon existe deja.
   */
  async function ensureConnected(
    opts: { anonyme?: boolean } = {},
  ): Promise<NetClient | null> {
    if (net?.connected) return net;
    const name = savedName();
    if (!name && !opts.anonyme) return null;
    if (connecting) return null;
    connecting = true;
    errFromServer = false;
    setCarteMultiOccupee(true);
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
      await net.connect(
        name ?? "",
        myGlyph(),
        P.load().anonId,
        P.load().multi.matches === 0,
        CLAVIER_ICI,
        // Facultatif : `undefined` fait entrer un joueur anonyme, et c'est un
        // état normal. Aucune attente, aucun contrôle préalable — le compte ne
        // doit rien ajouter au chemin « code/lien → rejoindre → jouer ».
        jetonPourSalon(),
      );
      return net;
    } catch {
      if (!errFromServer) {
        setJoinErr(tr("errInjoignable"));
      }
      // Pendant une reprise automatique, c'est attemptRejoin qui décide s'il
      // faut rendre la main : basculer d'écran ici couperait la tentative en
      // cours et redonnerait la sensation d'expulsion qu'on veut supprimer.
      if (!rejoining) show("multi-join");
      return null;
    } finally {
      connecting = false;
      setCarteMultiOccupee(false);
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
  /**
   * Les quatre cases suivent le champ, qui reste la seule source.
   *
   * ⚠️ Elles ne sont qu'un REFLET : le champ transparent au-dessus porte la
   * valeur, le collage et le clavier. Leur donner un état propre en ferait une
   * seconde vérité, et la seconde vérité finit toujours par diverger.
   *
   * La case ACTIVE est celle qu'on va remplir — c'est le curseur, que le champ
   * transparent ne montre pas. Elle ne s'allume que si le champ a le focus :
   * un curseur qui clignote sur un écran qu'on ne remplit pas est un appel à
   * ne rien faire.
   */
  function peintCases(): void {
    const champ = $<HTMLInputElement>("multiCode");
    const v = champ.value;
    const actif = document.activeElement === champ;
    const cases = Array.from($("codeInCases").children) as HTMLElement[];
    cases.forEach((c, i) => {
      c.textContent = v[i] ?? "";
      c.classList.toggle("is-plein", i < v.length);
      c.classList.toggle("is-actif", actif && i === Math.min(v.length, 3));
    });
  }

  function syncJoinAccent(): void {
    peintCases();
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

  /**
   * Se renommer sans quitter le salon.
   *
   * Le serveur ne lit le nom qu'au `hello` : il faut donc une socket neuve. On
   * s'appuie sur la reprise de siege deja en place — meme `key` locale, siege
   * garde 25 s cote serveur — qui rend l'aller-retour invisible aux autres.
   * C'est le meme chemin qu'une micro-coupure, et il est deja eprouve par
   * l'e2e.
   */
  async function reprendPlaceAvecNom(): Promise<void> {
    const code = roomCode || lastRoomCode;
    if (!code) {
      await openJoin();
      return;
    }
    net?.close();
    net = null;
    const client = await ensureConnected({ anonyme: true });
    if (!client) {
      setJoinErr(tr("errReconnexion"));
      await openJoin(code);
      return;
    }
    entreeSalon = "rejoint";
    client.joinRoom(code);
  }

  function exitToMenu(): void {
    endScreenOpen = false;
    if (net?.connected) net.leave();
    // Partir est volontaire : la reprise automatique ne doit pas y ramener.
    lastRoomCode = "";
    roomCode = "";
    lastPlayers = [];
    // Le salon suivant repart de zero : sans ca, entrer ailleurs marquerait
    // tout le monde comme « vient d'arriver ».
    connusDuSalon = null;
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

  function roundIndex(): number {
    return match?.idx ?? 0;
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

    /*
     * La garde de `canAct()` couvre déjà la manche absente — mais À DISTANCE,
     * et c'est précisément ce genre d'écart qui a produit le freeze quelques
     * lignes plus bas. Une garde locale coûte deux lignes et ne peut pas se
     * désynchroniser d'une condition qu'on ne relit pas.
     *
     * Rien n'est ENVOYÉ dans ce cas, et c'est délibéré : le joueur n'a pas de
     * scène sous les yeux, donc son geste ne désigne rien. Transmettre un
     * index de pièce tiré d'un plateau qu'il ne voit pas, c'est jouer à sa
     * place — et sous une règle piégeante, jouer à sa place le tue.
     *
     * Le geste est en revanche CONSOMMÉ : le rendre au navigateur ferait
     * défiler la page sur un appui d'ESPACE, par-dessus un écran déjà dégradé.
     * Le bandeau, lui, dit quoi faire — recharger.
     */
    if (!match.round || !match.rule) return { consumed: true };

    net.sendInput(match.idx, toWire(action));

    const elapsed = Math.max(0, net.clock.now() - match.startAt);
    const { outcome, progress } = resolveAction(
      match.round,
      match.progress,
      vueServeur(action),
      elapsed,
      match.rule.judge,
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
      /*
       * Le décompte est un ÉVÉNEMENT, pas une légende.
       *
       * Il s'écrivait « DÉPART · 3 » en 12 px sous le brief, réécrit à chaque
       * image. C'est le seul moment du jeu où tout le monde attend la même
       * chose au même instant : il bat maintenant en grand, une pulsation par
       * seconde, et on ne le réécrit qu'au changement de seconde — soit quatre
       * fois au lieu de deux cent soixante.
       */
      if (sec !== match.countSec) {
        match.countSec = sec;
        dramaExtra.textContent = sec > 0 ? String(sec) : "GO";
        dramaExtra.classList.remove("is-tick");
        void dramaExtra.offsetWidth;
        dramaExtra.classList.add("is-tick");
      }
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
      hud.setMeta(
        tr("reglesTournent")(match.rule ? nomDeRegle(match.rule.id, match.rule.name) : ""),
      );
    } else if (match.preview) {
      hud.setMeta(previewLabel(match.preview));
    } else if (match.phase === "frozen" && match.authority) {
      const a = match.authority;
      if (a.kind === "survive") hud.setMeta(a.trap ? tr("piegeDejoue") : tr("tenu"));
      else if (a.kind === "death") hud.setMeta(traduisMotif(a.reason));
      else if (!(match.lives <= 0 || match.spectator)) hud.setMeta(tr("piedSpectateur"));
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

    /*
     * ⚠️ LA MANCHE PEUT ÊTRE ABSENTE, ET CE N'EST PAS UNE ANOMALIE.
     *
     * `rebuildViewRound` pose délibérément `match.round = null` quand la règle
     * annoncée par le serveur ne se résout pas dans ce bundle — le cas concret
     * étant un décalage de versions, puisque le front (Vercel) et les salons
     * (Fly) se déploient séparément. Sa note le dit : « un champ vide est un
     * mauvais moment ; une scène fausse est un mensonge ».
     *
     * Sauf que le champ vide n'a jamais été écrit ici. Ces trois lignes
     * déréférençaient `match.round!` — un `!` qui affirme au compilateur ce que
     * le code d'à côté vient précisément d'infirmer. Résultat mesuré au
     * playtest : TypeError à CHAQUE image, donc plus aucun rendu, donc l'écran
     * gelé. C'est le « freeze » rapporté, et il est multiple parce qu'il
     * recommence à chaque manche dont la règle manque.
     *
     * Ce qui l'a déclenché : `ONE_RULES` est passée à seize règles (« REGLES :
     * quatre de plus »). Un client resté sur le bundle précédent — onglet
     * ouvert depuis la veille, page en cache — reçoit alors le nom d'une règle
     * qu'il ne connaît pas.
     *
     * La boucle de `main.ts` replanifie son `requestAnimationFrame` AVANT son
     * corps, donc elle ne meurt pas : elle tourne à vide, ce qui rend la panne
     * silencieuse dans les journaux et totale à l'écran. Le pire des deux.
     *
     * On honore donc le contrat que `MultiDraw` portait déjà et que le décompte
     * respecte : champ vide, et le match continue.
     */
    if (!match.round) {
      /*
       * Signalé UNE fois par manche, jamais par image.
       *
       * `syncFrame` tourne soixante fois par seconde : sans ce garde-fou, une
       * seule manche illisible noierait le collecteur et le rapport. C'est la
       * mesure d'une panne, donc elle doit rester rare par construction.
       */
      if (match.idx !== illisibleSignale) {
        illisibleSignale = match.idx;
        track("multi_manche_illisible", { idx: match.idx, regle: match.rules[net.myId] ?? null });
      }
      hud.clearRound();
      hud.setMeta(tr("multiRegleInconnue"));
      return { round: null, rule: match.rule, ratio, reveal: false };
    }

    if (match.phase === "round") {
      hud.updateRound(match.round, elapsed, ratio);
    } else {
      hud.updateRound(match.round, elapsed, 1);
    }

    const reveal =
      match.phase === "frozen" &&
      !!match.round.trap &&
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
      $("idErr").textContent = tr("ilFautUnNom");
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
    /*
     * On prévient l'extérieur AVANT de changer d'écran.
     *
     * C'est ici que le nom rejoint le COMPTE : sans ce rappel, l'écran
     * n'écrivait que la sauvegarde locale, et un joueur connecté se renommait
     * pour lui seul pendant que le classement gardait l'ancien nom.
     */
    surIdentite?.(nom, glyphChoisi);

    const revenir = retourIdentite;
    retourIdentite = null;
    if (revenir) {
      revenir();
      return;
    }
    const suite = apresIdentite;
    apresIdentite = null;
    if (suite) suite();
    else show("multi-join");
  });

  $("btnIdBack").addEventListener("click", () => {
    sfx.ui();
    apresIdentite = null;
    if (retourIdentite) {
      const revenir = retourIdentite;
      retourIdentite = null;
      revenir();
      return;
    }
    // On peut arriver ici DEPUIS le salon (bouton « choisir ton nom ») : y
    // renvoyer, sinon renoncer a se nommer ferait quitter la partie.
    if (roomCode) {
      paintLobby();
      show("multi-lobby");
      return;
    }
    show(savedName() ? "multi-join" : "home");
  });

  $("btnMultiCopyCode").addEventListener("click", () => {
    if (!roomCode) return;
    sfx.ui();
    const hint = $("multiLobbyCodeHint");
    void navigator.clipboard
      .writeText(roomCode)
      .then(() => {
        hint.textContent = tr("codeCopie")(roomCode);
      })
      .catch(() => {
        // Presse-papiers refusé : le code reste lisible à l'écran, c'est
        // justement ce qu'on vient de rendre impossible à manquer.
        hint.textContent = tr("dicteLeCode");
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

  /**
   * Ouvrir un salon dans un mode donne.
   *
   * DUO n'est pas un mecanisme separe : c'est le reglage de salon `duo`, pose
   * d'emblee au lieu d'etre cherche dans les reglages. Le mode existant reste
   * donc un cas particulier du nouveau — meme astuce que la pile d'une regle
   * pour l'escalade et l'equipe d'un joueur pour le duo lui-meme.
   *
   * Le reglage part JUSTE APRES la creation, sur la meme socket : les messages
   * y sont ordonnes, et le serveur nous reconnait comme hote puisque c'est
   * nous qui venons d'ouvrir. L'hote peut encore le changer dans le salon —
   * ouvrir en DUO est un depart, pas un verrou.
   */
  /** OUVRIR LE MIEN — la seule issue qui ne dépend de personne d'autre. */
  const sortieOuvrir = (): Sortie => ({
    quoi: tr("sortieOuvrir"),
    fait: () => void ouvreSalon(false),
  });

  async function ouvreSalon(duo: boolean): Promise<void> {
    sfx.ui();
    setJoinErr(null);
    // Jamais d'envoi direct : sur mobile, le navigateur tue la socket dès
    // que l'app passe en arrière-plan. Un send() sur socket morte ne fait
    // RIEN, silencieusement — c'était le « je clique, pas de réponse ».
    const client = await ensureConnected();
    if (!client) return;
    entreeSalon = "cree";
    client.createRoom();
    if (duo) client.setSettings({ duo: true });
  }

  $("btnMultiCreate").addEventListener("click", () => void ouvreSalon(false));
  $("btnMultiCreateDuo").addEventListener("click", () => void ouvreSalon(true));

  $("btnMultiJoin").addEventListener("click", () => {
    void (async () => {
      sfx.ui();
      const code = $<HTMLInputElement>("multiCode").value.trim().toUpperCase();
      if (code.length !== 4) {
        setJoinErr(tr("errCode4"));
        return;
      }
      setJoinErr(null);
      const client = await ensureConnected();
      entreeSalon = "rejoint";
      client?.joinRoom(code);
    })();
  });

  $("btnMultiJoinBack").addEventListener("click", () => {
    sfx.ui();
    exitToMenu();
    show("home");
  });

  $("btnMultiNom").addEventListener("click", () => {
    sfx.ui();
    apresIdentite = () => void reprendPlaceAvecNom();
    openIdentity();
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

  // Les deux copies rendent compte au MÊME endroit, sous les deux boutons :
  // un retour qui s'affiche loin du geste n'est pas vu.
  $("btnMultiInvite").addEventListener("click", () => {
    sfx.ui();
    void copyInvite("multiLobbyCodeHint");
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
    const chip = (ev.target as HTMLElement).closest("button.opt") as HTMLButtonElement | null;
    if (!chip || chip.disabled || !net) return;
    const row = chip.closest(".settings__row") as HTMLElement | null;
    const key = row?.dataset.key as "speed" | "lives" | "rotationEvery" | "duo" | undefined;
    if (!key) return;
    const value = Number(chip.dataset.value);
    if (!Number.isFinite(value)) return;
    const me = lastPlayers.find((p) => p.id === net!.myId);
    if (!me?.host || lobbyInMatch) return;
    sfx.ui();
    // `duo` voyage en booléen : le protocole le sanitise avec `=== true`, donc
    // un nombre y vaudrait « non » en silence.
    net.setSettings(key === "duo" ? { duo: value === 1 } : { [key]: value });
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
    if (!Number.isInteger(k) || k < 0 || k >= EMOTE_COUNT) return;
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

  // Le curseur des cases suit le focus, pas seulement la frappe.
  for (const quoi of ["focus", "blur", "click", "keyup"] as const) {
    $<HTMLInputElement>("multiCode").addEventListener(quoi, () => peintCases());
  }
  // Cliquer sur les cases, c'est cliquer dans le champ : elles sont
  // `pointer-events: none`, donc le clic tombe déjà sur lui — mais le
  // conteneur, lui, peut être touché sur ses marges.
  $("codeIn").addEventListener("click", () => $<HTMLInputElement>("multiCode").focus());

  return {
    available: true,
    exitToMenu,
    openFromInvite: (code: string) => {
      track("invite_opened", {});
      /*
       * ON ENTRE, PUIS ON SE NOMME.
       *
       * Ni ecran d'identite, ni ecran de saisie de code : le code est dans le
       * lien, et le nom peut attendre d'etre dans le salon. Mesure du parcours
       * precedent pour un joueur neuf — celui qui clique le lien d'un ami :
       * une saisie clavier et deux clics inseres entre le lien et la partie.
       *
       * Repli si la connexion echoue : l'ecran de saisie avec le code
       * pre-rempli, pour que le lien ne se perde pas dans une impasse.
       */
      void (async () => {
        const client = await ensureConnected({ anonyme: true });
        if (!client) {
          await openJoin(code);
          return;
        }
        setJoinErr(null);
        entreeSalon = "rejoint";
        client.joinRoom(code);
      })();
    },
    isPlayingMulti,
    peekRound,
    roundIndex,
    trySendMultiAction,
    syncFrame,
    takeFx,
    chatAvailable,
    focusChat,
    blurChat,
    onScreen,
    onLangue,
    ouvreIdentite: (revenir: () => void) => {
      retourIdentite = revenir;
      openIdentity();
    },
    onIdentite: (cb) => {
      surIdentite = cb;
    },
  };
}
