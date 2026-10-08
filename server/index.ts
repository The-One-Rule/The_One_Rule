/**
 * Serveur de salons — Node + ws.
 *
 * Rôles, et rien d'autre :
 *   · tenir les salons (code à 4 lettres, lien partageable)
 *   · faire AUTORITÉ sur le temps : chaque manche a un startAt et une
 *     deadline sur l'horloge serveur, les clients s'y calent par ping
 *   · juger les inputs via MatchLogic et diffuser les verdicts
 *
 * Tout ce qui est jeu (scènes, règles, pièges) vit dans le moteur partagé :
 * le serveur ne transmet jamais une scène, seulement des graines, des index
 * et des dates.
 *
 * Lancement : npm run server   (PORT=8787 par défaut)
 *
 * Exploitation : sonde `GET /health` pour l'hébergeur, et `ALLOWED_ORIGINS`
 * (liste séparée par des virgules) pour la liste blanche des origines.
 */

import { choisitTable, echeanceDepart, RAPIDE_MIN } from "./rapide";
import { adresseDe, EchecsParAdresse, REFUS_AVANT_COUPURE, SEAU_CAPACITE, SEAU_PAR_SECONDE, Seau } from "./debit";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import { MatchLogic, MULTI_RULES } from "./match";
import { MatchCoop, type ClicCoop, type ClotureCharge } from "./coop";
import {
  fautSignalerActe,
  IMPOSTEUR_MAX_ASIS,
  peutLancerImposteur,
} from "../src/engine/imposteur";
import type { IssueVote } from "../src/engine/imposteur";
import { COOP_MAX_ASIS, COOP_RASSEMBLEMENT_MS, borneCurseur, peutLancerCoop } from "../src/engine/coop";
import { originAllowed, parseOrigins } from "./origin";
import { verifieJeton } from "./jeton";
import { cleanEnv } from "../src/env";
import {
  COUNTDOWN_MS,
  CURSOR_COOLDOWN_MS,
  DEFAULT_SETTINGS,
  EMPTY_STATS,
  EMOTE_COOLDOWN_MS,
  EMOTE_COUNT,
  CHAT_COOLDOWN_MS,
  CHAT_MAX_LEN,
  INPUT_TOLERANCE_MS,
  INTERLUDE_MS,
  INTERLUDE_ROTATION_MS,
  MAX_PLAYERS,
  MAX_ROUNDS,
  PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  decodeClient,
  encode,
  sanitizeSettings,
} from "../shared/protocol";
import type { Glyph, PlayerPublic, RoundOutcome, ServerMsg } from "../shared/protocol";
import { carteValide, PHOTO_MAX, photoValide } from "../shared/profil";
import { CONSIGNES_VERSION } from "../src/engine/instructions";
import { windowMs } from "../src/engine/difficulty";
import { glyphFor, glyphFromIndex, PATTERN_COUNT } from "../src/net/glyph";

const PORT = Number(process.env.PORT) || 8787;
/** Écart minimal entre deux changements de photo d'un même joueur. */
const PROFIL_PHOTO_COOLDOWN_MS = 1500;
/** L'observation de l'imposteur se clôt seule au bout de ce délai. */
const OBSERVATION_MAX_MS = 90_000;
const ALLOWED_ORIGINS = parseOrigins(process.env.ALLOWED_ORIGINS);
const PRODUCTION = process.env.NODE_ENV === "production";
/**
 * Secret de signature des jetons de compte, partagé avec les fonctions edge.
 *
 * Absent = ce serveur ne reconnaît aucun compte, et tout le monde joue
 * anonymement. C'est un déploiement valable, pas une panne — et c'est
 * l'état dans lequel tourne le développement local.
 *
 * ⚠️ `fly secrets set` REDÉMARRE la machine, donc tue les salons en cours.
 * À poser quand personne ne joue, et revérifier `fly scale count 1` juste
 * après (voir CLAUDE.md §10).
 */
const AUTH_SECRET = cleanEnv(process.env.TOR_AUTH_SECRET) ?? "";
const STARTED_AT = Date.now();

/**
 * Identifiant de PROCESSUS, tiré au démarrage.
 *
 * Les salons vivent en mémoire : deux instances = deux jeux de salons
 * disjoints, et le joueur routé sur la mauvaise ne trouvera jamais le code de
 * son ami. C'est arrivé en production — Fly provisionne deux machines par
 * défaut pour la haute disponibilité, et `min_machines_running = 1` est un
 * minimum, pas un plafond.
 *
 * La panne est invisible depuis le jeu : chacun voit un serveur qui répond,
 * et « SALON INTROUVABLE » ressemble à une faute de frappe sur le code. Ce
 * champ la rend décidable en une commande (scripts/check-salons.mjs).
 */
const INSTANCE = Math.random().toString(36).slice(2, 10);

/* ------------------------------------------------------------------ *
 * État
 * ------------------------------------------------------------------ */

interface Client {
  id: string;
  name: string;
  ws: WebSocket;
  room: Room | null;
  alive: boolean; // heartbeat
  glyph: Glyph;
  watching: string | null;
  lastEmoteAt: number;
  lastChatAt: number;
  /** Dernier curseur coop accepté — plafond 20 Hz, comme les emotes. */
  lastCursorAt: number;
  /** Identifiant local stable du joueur — sert à retrouver son siège. */
  key: string;
  /** Armé à la coupure : abandonne le siège si personne ne le réclame. */
  graceTimer: ReturnType<typeof setTimeout> | null;
  /** Se déclare en première partie — annoncé publiquement, voir startMatch. */
  rookie: boolean;
  /**
   * Cet appareil peut-il jouer une consigne au clavier ?
   *
   * Faux par défaut, et jamais déduit : c'est le client qui l'annonce, parce
   * que lui seul sait. Un client d'une version antérieure ne l'envoie pas et
   * compte donc pour « non » — la table retombe alors sur le tirage tactile,
   * qui est exactement ce qu'il sait reconstruire.
   */
  clavier: boolean;
  /**
   * La version du jeu de consignes que ce client sait reconstruire. 1 par
   * défaut — le catalogue d'origine —, bornée par celle du serveur.
   */
  consignes: number;
  /** Il comprend `remplace` (voir le `hello`) — absent vaut non. */
  reprise: boolean;
  /**
   * Identifiant de compte TOR, si le `hello` portait un jeton valide.
   *
   * `null` couvre tout le reste sans le distinguer : pas de jeton, jeton
   * périmé, signature fausse, serveur déployé sans secret. Le joueur joue,
   * et RIEN dans le salon ne le distingue d'un joueur connecté — pas de
   * badge, pas de couleur, pas d'ordre différent. C'est la règle du social à
   * une seule vitesse, et elle est plus facile à tenir maintenant qu'à
   * défaire plus tard.
   *
   * Ce champ n'est lu par aucun chemin de jeu. Il existe pour que le lot D
   * puisse un jour vérifier ce que `rookie` se contente aujourd'hui de
   * déclarer.
   */
  compte: string | null;
  /** Adresse du joueur (`fly-client-ip` derrière Fly) : voir `debit.ts`. */
  adresse: string;
  /** Tous messages confondus : voir `debit.ts`. */
  seau: Seau;
  /** Messages refusés d'affilée par le seau. */
  refus: number;
  /** Carte de visite et photo (`shared/profil.ts`). Absent vaut non. */
  carte?: string;
  photo?: string;
  /** Instant du dernier changement de photo accepté (limite de fréquence). */
  photoAt: number;
}

interface Room {
  code: string;
  clients: Map<string, Client>;
  hostId: string;
  match: MatchLogic | null;
  /** Chemin SÉPARÉ : `MatchLogic.input` fige le siège, le coop ne le peut pas. */
  coop: MatchCoop | null;
  settings: import("../shared/protocol").RoomSettings;
  /** départ de la manche courante, horloge serveur */
  roundStartAt: number;
  roundDeadline: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** Un timeout par entité en cours de rassemblement — distinct du timer de vague. */
  chargeTimers: Map<number, ReturnType<typeof setTimeout>>;
  /**
   * Dernière position de curseur par siège. DÉCORATIF.
   * Jamais lu par inputCoop, entityOf, ni aucun judge.
   */
  cursorPos: Map<string, { x: number; y: number }>;
  roundOpen: boolean;
  /** Table de PARTIE RAPIDE : elle part et repart seule (`server/rapide.ts`). */
  public: boolean;
  /** L'échéance du départ automatique, heure serveur. */
  autoAt: number | null;
  autoTimer: ReturnType<typeof setTimeout> | null;
  /** Une diffusion de l'état est déjà prévue (regroupement des `profil`). */
  etatPrevu: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, Room>();

/**
 * Tous les clients connectés, y compris ceux qui ne sont dans aucun salon.
 *
 * Le battement de cœur parcourait `rooms`, donc une socket restée au menu
 * n'était jamais sondée ni fermée : une connexion morte silencieusement y
 * vivait indéfiniment, et le descripteur avec elle.
 */
const clients = new Set<Client>();
const now = (): number => Date.now();

/**
 * Enveloppe un gestionnaire d'événement pour qu'une exception n'emporte pas
 * le processus.
 *
 * `decodeClient` ne valide que la présence d'un `t` : tout le reste du message
 * est casté sans preuve. Un `{"t":"input","round":0}` sans `action` suffisait
 * donc à lever un TypeError dans le gestionnaire `message`, et une exception
 * non capturée dans un écouteur Node termine le processus — c'est-à-dire tous
 * les salons de l'instance, depuis une seule socket et un seul message.
 *
 * Chaque `case` valide ce qu'il lit ; ceci est la ceinture qui couvre aussi
 * ceux qu'on ajoutera demain sans y penser.
 */
/** Exceptions rattrapées depuis le démarrage : `/health` les expose. */
let erreursRattrapees = 0;

const guarded =
  <A extends unknown[]>(fn: (...a: A) => void, ou = "message") =>
  (...a: A): void => {
    try {
      fn(...a);
    } catch (err) {
      erreursRattrapees++;
      console.error(`${ou}_error ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    }
  };

/*
 * ⚠️ LES MINUTERIES AUSSI, et c'était le trou.
 *
 * `guarded` ne couvrait que les MESSAGES. Or tout le déroulement d'un match
 * tourne sur des minuteries — ouverture et clôture des manches, sursis de
 * reconnexion, départ automatique d'une table publique — et une exception
 * dans l'une d'elles n'a aucun appelant pour la rattraper : le processus
 * meurt, et avec lui TOUS les salons de l'instance. Côté joueurs, c'est
 * exactement « ça déconnecte tout seul », puis « impossible de créer un
 * salon pendant plusieurs secondes » le temps que Fly relance la machine.
 * `plusTard` est `setTimeout` avec la même ceinture.
 */
const plusTard = (fn: () => void, ms: number, ou = "minuterie"): ReturnType<typeof setTimeout> =>
  setTimeout(guarded(fn, ou), ms);

/*
 * Le dernier filet, pour ce qu'on n'aura pas pensé à envelopper. Pour un
 * serveur de jeu en mémoire, continuer en ayant peut-être abîmé UN salon vaut
 * mieux que mourir en les perdant TOUS. L'erreur est journalisée et comptée :
 * `/health` la montre, elle ne passe pas inaperçue.
 */
process.on("uncaughtException", (err) => {
  erreursRattrapees++;
  console.error(`crash_evite ${err.stack ?? String(err)}`);
});
process.on("unhandledRejection", (err) => {
  erreursRattrapees++;
  console.error(`crash_evite ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans I/L/O/0/1 : un code se dicte à voix haute
function newCode(): string {
  for (let tries = 0; tries < 50; tries++) {
    let c = "";
    for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error("plus de codes disponibles");
}

const uid = (): string => Math.random().toString(36).slice(2, 10);

/* ------------------------------------------------------------------ *
 * Diffusion
 * ------------------------------------------------------------------ */

function send(c: Client, msg: ServerMsg): void {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(encode(msg));
}

function broadcast(room: Room, msg: ServerMsg): void {
  const raw = encode(msg);
  for (const c of room.clients.values()) {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(raw);
  }
}

/**
 * LES PHOTOS DU SALON, à qui vient d'y entrer — et la sienne aux autres.
 *
 * À part de `roomState`, qui repart à chaque changement d'état : une photo ne
 * voyage qu'à l'arrivée et au changement, jamais à chaque manche.
 */
function envoiePhotos(room: Room, arrivant: Client): void {
  const toutes: Record<string, string> = {};
  for (const c of room.clients.values()) if (c.photo) toutes[c.id] = c.photo;
  if (Object.keys(toutes).length) send(arrivant, { t: "photos", photos: toutes });
  if (arrivant.photo) {
    const msg: ServerMsg = { t: "photos", photos: { [arrivant.id]: arrivant.photo } };
    for (const c of room.clients.values()) if (c !== arrivant) send(c, msg);
  }
}

function parseGlyph(raw: unknown, fallbackId: string): Glyph {
  const g = raw as Glyph | undefined;
  if (
    g &&
    (g.shape === "carre" || g.shape === "rond" || g.shape === "triangle") &&
    Number.isInteger(g.color) &&
    g.color >= 0 &&
    g.color < 8 &&
    Number.isInteger(g.pattern) &&
    g.pattern >= 0 &&
    g.pattern < PATTERN_COUNT
  ) {
    return { shape: g.shape, color: g.color, pattern: g.pattern };
  }
  return glyphFor(fallbackId);
}

function enPartie(room: Room): boolean {
  return room.match !== null || room.coop !== null;
}

function publicPlayers(room: Room): PlayerPublic[] {
  const idx = room.match
    ? Math.max(0, room.match.roundIdx)
    : room.coop
      ? Math.max(0, room.coop.roundIdx)
      : 0;
  const rules = room.match
    ? room.match.reglesPubliques(idx)
    : room.coop
      ? room.coop.reglesPubliques()
      : null;
  const ordre = [...room.clients.keys()];
  return [...room.clients.values()].map((c) => {
    const seat =
      room.match?.seats.find((s) => s.id === c.id) ??
      room.coop?.seats.find((s) => s.id === c.id);
    const rang = ordre.indexOf(c.id);
    const spectateurLobby =
      !enPartie(room) &&
      ((room.settings.mode === "imposteur" && rang >= 8) ||
        (room.settings.mode === "coop" && rang >= COOP_MAX_ASIS));
    return {
      id: c.id,
      name: c.name,
      ruleId: rules?.[c.id] ?? "",
      /*
       * Sans siège PENDANT un match, on n'a pas de vies : on ne joue pas.
       *
       * La valeur retombait sur le réglage du salon, donc un spectateur arrivé
       * en cours de partie affichait trois vies pleines — et le classement de
       * fin, qui trie par vies décroissantes, le plaçait PREMIER avec zéro
       * manche jouée. Rapporté en soirée : « il est automatiquement considéré
       * comme étant en position de gagner ».
       *
       * Hors match, le réglage reste la bonne réponse : c'est ce qu'on aura en
       * commençant.
       */
      lives: seat ? seat.lives : enPartie(room) ? 0 : room.settings.lives,
      score: seat?.score ?? 0,
      host: c.id === room.hostId,
      spectator: (enPartie(room) && !seat) || spectateurLobby,
      connected: c.ws.readyState === WebSocket.OPEN,
      glyph: c.glyph,
      // Hors match, on montre son intention ; en match, ce que le siège porte
      // réellement — sinon un joueur pourrait s'annoncer débutant après coup.
      rookie: seat ? seat.rookie : c.rookie,
      // L'équipe n'existe que pendant un match en duo : hors match, personne
      // n'est encore apparié, et prétendre le contraire afficherait des paires
      // qui bougeraient au lancement.
      team: room.match?.duo && seat && "team" in seat ? seat.team : undefined,
      carte: c.carte,
      // Un joueur au-delà de INPUT_TOLERANCE_MS de latence voit ses temps
      // gonflés : le serveur refuse d'horodater plus de 120 ms dans le passé
      // (anti-triche). La médiane limite le bruit sans corriger ce biais —
      // on ne le corrige pas avec une valeur client.
      stats:
        room.match?.statsOf(c.id) ??
        room.coop?.statsOf(c.id) ?? { ...EMPTY_STATS },
    };
  });
}

const roomState = (room: Room): ServerMsg => ({
  t: "room",
  code: room.code,
  players: publicPlayers(room),
  inMatch: enPartie(room),
  settings: room.settings,
  // Absent sur une table privée : le message reste octet pour octet celui
  // qu'un client ancien connaît.
  ...(room.public ? { public: true, autoAt: room.autoAt } : {}),
});

/**
 * Le départ automatique d'une table publique. Appelé à chaque changement
 * d'effectif et à chaque fin de match ; ne fait rien sur une table privée.
 * ⚠️ Appeler AVANT de diffuser `roomState`, qui porte l'échéance.
 */
function planifieDepart(room: Room, apresMatch = false): void {
  if (!room.public) return;
  const annule = (): void => {
    if (room.autoTimer) clearTimeout(room.autoTimer);
    room.autoTimer = null;
    room.autoAt = null;
  };
  if (enPartie(room)) {
    annule();
    return;
  }
  const e = echeanceDepart({
    assis: idsAssis(room).length,
    maintenant: now(),
    echeance: apresMatch ? null : room.autoAt,
    apresMatch,
  });
  if (e === null) {
    annule();
    return;
  }
  if (e === room.autoAt && room.autoTimer) return;
  annule();
  room.autoAt = e;
  room.autoTimer = plusTard(() => {
    room.autoTimer = null;
    room.autoAt = null;
    // La table a pu se vider, partir ou disparaître entre-temps.
    if (rooms.get(room.code) !== room || enPartie(room)) return;
    if (idsAssis(room).length < RAPIDE_MIN) {
      broadcast(room, roomState(room));
      return;
    }
    startMatch(room);
  }, Math.max(0, e - now()));
}

function nouveauSalon(client: Client, publique: boolean): Room {
  const room: Room = {
    code: newCode(),
    clients: new Map([[client.id, client]]),
    hostId: client.id,
    match: null,
    coop: null,
    settings: { ...DEFAULT_SETTINGS },
    roundStartAt: 0,
    roundDeadline: 0,
    timer: null,
    chargeTimers: new Map(),
    cursorPos: new Map(),
    roundOpen: false,
    public: publique,
    autoAt: null,
    autoTimer: null,
    etatPrevu: null,
  };
  rooms.set(room.code, room);
  client.room = room;
  return room;
}

/* ------------------------------------------------------------------ *
 * Déroulement d'un match
 * ------------------------------------------------------------------ */

function idsAssis(room: Room): string[] {
  const ids = [...room.clients.keys()];
  if (room.settings.mode === "imposteur") return ids.slice(0, IMPOSTEUR_MAX_ASIS);
  if (room.settings.mode === "coop") return ids.slice(0, COOP_MAX_ASIS);
  return ids;
}

function chuchoteRole(room: Room): void {
  const m = room.match;
  if (!m?.imposteur || !m.imposteurId) return;
  const cible = room.clients.get(m.imposteurId);
  if (cible) send(cible, { t: "role", imposteur: true });
}

function startMatch(room: Room): void {
  // Un départ, automatique ou non, éteint l'échéance d'une table publique.
  if (room.autoTimer) clearTimeout(room.autoTimer);
  room.autoTimer = null;
  room.autoAt = null;
  if (room.settings.mode === "coop") {
    startMatchCoop(room);
    return;
  }
  const ids = idsAssis(room);
  const seed = (Math.random() * 2 ** 31) | 0;
  /*
   * Accueil du débutant. Le serveur n'a aucune mémoire entre les salons : il
   * ne peut donc pas VÉRIFIER qu'un joueur est nouveau, seulement le croire.
   * La garantie contre l'abus n'est pas technique, elle est sociale — le
   * statut s'affiche sur la plaque, tout le salon le voit. Entre amis, ça
   * suffit ; et le jour où un classement comptera, il ne passera pas par ici.
   */
  const rookies = new Set(
    ids.filter((id) => room.clients.get(id)?.rookie).map((id) => id),
  );
  /*
   * Le pool clavier n'est ouvert que si TOUT LE MONDE l'a annoncé.
   *
   * `every` sur une liste vide vaut `true` — sans effectif il n'y a pas de
   * match, donc le cas est théorique, mais la garde reste écrite : un pool
   * élargi par accident donnerait à un téléphone une consigne qu'il ne peut
   * pas jouer, ce qui est la pire chose qu'un jeu de réflexes puisse faire.
   *
   * Un client d'une version antérieure n'envoie pas ce champ : il compte donc
   * pour « pas de clavier », et la table retombe sur le tirage tactile —
   * exactement ce que cet ancien client sait reconstruire.
   */
  const clavier =
    ids.length > 0 && ids.every((id) => room.clients.get(id)?.clavier === true);
  /*
   * Le jeu de consignes : le plus ANCIEN de la table, et jamais plus récent
   * que celui du serveur. Un seul siège d'une version antérieure fait
   * retomber tout le salon sur ce qu'il sait reconstruire — la scène doit
   * rester commune, exactement comme pour `clavier`.
   */
  const consignes = Math.min(
    CONSIGNES_VERSION,
    ...ids.map((id) => room.clients.get(id)?.consignes ?? 1),
  );
  room.match = new MatchLogic(
    seed,
    ids,
    room.settings,
    rookies,
    clavier,
    room.settings.duo,
    consignes,
  );

  const rules = room.match.reglesPubliques(0);

  /*
   * État du salon AVANT match_start, et l'ordre compte.
   *
   * `publicPlayers` lit les vies dans les sièges ; tant que le match n'existait
   * pas, il retombait sur le réglage du salon. Les clients gardaient donc les
   * vies de réglage pendant tout le compte à rebours, et ne les corrigeaient
   * qu'au premier verdict — un débutant affichait 3 vies au lieu de 4 devant
   * tout le monde. `beginMatch` lit cette liste : elle doit arriver d'abord.
   */
  broadcast(room, roomState(room));

  const firstRoundAt = now() + COUNTDOWN_MS;
  broadcast(room, {
    t: "match_start",
    seed,
    rules,
    firstRoundAt,
    settings: room.settings,
    clavier: room.match.clavier,
    consignes: room.match.consignes,
  });
  chuchoteRole(room);

  room.timer = plusTard(() => openRound(room), COUNTDOWN_MS);
}

function startMatchCoop(room: Room): void {
  const ids = idsAssis(room);
  const seed = (Math.random() * 2 ** 31) | 0;
  room.coop = new MatchCoop(seed, ids);
  room.cursorPos.clear();
  const rules = room.coop.reglesPubliques();
  broadcast(room, roomState(room));
  const firstRoundAt = now() + COUNTDOWN_MS;
  broadcast(room, {
    t: "match_start",
    seed,
    rules,
    firstRoundAt,
    settings: room.settings,
    // La scène coop n'utilise pas le pool de consignes. Absent du client
    // ancien. On envoie false : c'est le défaut, et ça ne change rien.
    clavier: false,
  });
  room.timer = plusTard(() => openVagueCoop(room), COUNTDOWN_MS);
}

function diffuserCurseurs(room: Room): void {
  const coop = room.coop;
  if (!coop) return;
  const pos: Record<string, { x: number; y: number }> = {};
  let n = 0;
  for (const [id, p] of room.cursorPos) {
    if (!coop.estActif(id)) continue;
    pos[id] = p;
    n += 1;
    if (n >= COOP_MAX_ASIS) break;
  }
  broadcast(room, { t: "cursors", at: now(), pos });
}

function clearChargeTimers(room: Room): void {
  for (const t of room.chargeTimers.values()) clearTimeout(t);
  room.chargeTimers.clear();
}

function planifierClotureCharge(room: Room, i: number, expireElapsedMs: number): void {
  const prev = room.chargeTimers.get(i);
  if (prev) clearTimeout(prev);
  const delay = Math.max(0, room.roundStartAt + expireElapsedMs - now());
  room.chargeTimers.set(
    i,
    plusTard(() => {
      room.chargeTimers.delete(i);
      const coop = room.coop;
      if (!coop || !room.roundOpen) return;
      const elapsed = now() - room.roundStartAt;
      appliquerClotureCoop(room, coop.cloreCharge(i, elapsed));
    }, delay),
  );
}

function appliquerClicCoop(room: Room, r: ClicCoop): void {
  const coop = room.coop;
  if (!coop) return;
  if (r.kind === "charge") {
    broadcast(room, {
      t: "charge",
      i: r.i,
      n: r.n,
      need: r.need,
      idx: coop.roundIdx,
    });
    if (r.n === 1) planifierClotureCharge(room, r.i, r.debutMs + COOP_RASSEMBLEMENT_MS);
    return;
  }
  if (r.kind === "pris") {
    const t = room.chargeTimers.get(r.i);
    if (t) {
      clearTimeout(t);
      room.chargeTimers.delete(r.i);
    }
  }
  broadcast(room, {
    t: "coop_clic",
    idx: coop.roundIdx,
    i: r.i,
    pris: r.kind === "pris",
    score: r.score,
    vies: r.vies,
  });
  if (r.vies <= 0 || (r.kind === "pris" && coop.toutPris())) {
    if (room.timer) clearTimeout(room.timer);
    closeVagueCoop(room);
  }
}

function appliquerClotureCoop(room: Room, r: ClotureCharge | null): void {
  const coop = room.coop;
  if (!coop || !r) return;
  if (r.kind === "rate") {
    broadcast(room, { t: "charge", i: r.i, n: 0, need: r.need, idx: coop.roundIdx });
    return;
  }
  appliquerClicCoop(room, r);
}

function openVagueCoop(room: Room): void {
  const coop = room.coop;
  if (!coop) return;
  clearChargeTimers(room);
  const { idx, durationMs } = coop.openVague();
  room.roundStartAt = now();
  room.roundDeadline = room.roundStartAt + durationMs;
  room.roundOpen = true;
  broadcast(room, {
    t: "round",
    idx,
    startAt: room.roundStartAt,
    deadline: room.roundDeadline,
    consumed: [],
  });
  room.timer = plusTard(() => closeVagueCoop(room), durationMs + INPUT_TOLERANCE_MS + 15);
}

function closeVagueCoop(room: Room): void {
  const coop = room.coop;
  if (!coop || !room.roundOpen) return;
  room.roundOpen = false;
  clearChargeTimers(room);
  const { matchOver, tenu } = coop.closeVague();
  const score = coop.score;
  const out: Record<string, RoundOutcome> = {};
  for (const s of coop.seats) out[s.id] = { kind: "idle" };
  const nextRoundAt = matchOver ? null : now() + INTERLUDE_MS;
  broadcast(room, {
    t: "verdict",
    idx: coop.roundIdx,
    outcomes: out,
    players: publicPlayers(room),
    nextRoundAt,
  });
  if (matchOver) {
    broadcast(room, {
      t: "match_end",
      winnerId: null,
      players: publicPlayers(room),
      score,
      tenu,
    });
    room.coop = null;
    room.cursorPos.clear();
    planifieDepart(room, true);
    broadcast(room, roomState(room));
    return;
  }
  room.timer = plusTard(() => openVagueCoop(room), INTERLUDE_MS);
}

function openRound(room: Room): void {
  const match = room.match;
  if (!match) return;

  const { idx, durationMs, tirage } = match.openRound();
  room.roundStartAt = now();
  room.roundDeadline = room.roundStartAt + durationMs;
  room.roundOpen = true;

  const msg: ServerMsg = {
    t: "round",
    idx,
    startAt: room.roundStartAt,
    deadline: room.roundDeadline,
  };
  // Absent vaut 0 : un salon qui ne retire rien envoie le message d'hier.
  if (tirage) msg.tirage = tirage;
  if (match.rotationJustHappened(idx)) {
    msg.rules = match.reglesPubliques(idx);
  }
  broadcast(room, msg);

  // La manche se clôt à l'échéance PLUS la tolérance réseau : un input parti
  // dans la fenêtre mais arrivé 100 ms en retard doit encore compter.
  room.timer = plusTard(() => closeRound(room), durationMs + INPUT_TOLERANCE_MS + 15);
}

function closeRound(room: Room): void {
  const match = room.match;
  if (!match || !room.roundOpen) return;
  room.roundOpen = false;

  const { outcomes, matchOver, winnerId, interludeMs } = match.closeRound();
  const out: Record<string, RoundOutcome> = {};
  for (const [id, o] of outcomes) out[id] = o;

  const reachedCap = match.roundIdx + 1 >= MAX_ROUNDS;
  const over = matchOver || reachedCap;

  /*
   * Une rotation s'annonce AVANT, dans une pause faite pour ça.
   *
   * Deux tiers des pertes de vies venaient de rotations non vues : la règle
   * changeait par une ligne en haut à gauche, pendant que le joueur balayait
   * la grille. On ne peut pas l'annoncer en pleine manche — elle est jouée —
   * donc on allonge l'interlude qui la précède et on y joint les nouvelles
   * règles, pour que le client les montre en plein cadre.
   *
   * Le maximum et non le remplacement : une élimination reste plus longue
   * qu'une rotation, et cumuler les deux ne doit pas raccourcir la pause.
   */
  const prochaineIdx = match.roundIdx + 1;
  const rotation = !over && match.rotationJustHappened(prochaineIdx);
  const base = interludeMs > 0 ? interludeMs : INTERLUDE_MS;
  const pause = rotation ? Math.max(base, INTERLUDE_ROTATION_MS) : base;
  const nextRoundAt = over ? null : now() + pause;

  const verdict: ServerMsg = {
    t: "verdict",
    idx: match.roundIdx,
    outcomes: out,
    players: publicPlayers(room),
    nextRoundAt,
  };
  if (rotation) {
    verdict.nextRules = match.reglesPubliques(prochaineIdx);
  }
  broadcast(room, verdict);

  if (over && match.imposteur) {
    /*
     * Personne n'est désigné. Les preuves se ferment, l'observation s'ouvre.
     * Pas de `match_end` : cet écran nommerait un vainqueur. Le match RESTE
     * : le client ne reprend pas tout seul (décision n°9), c'est `observe`
     * qui ouvre le temps. Un client ancien ignore les deux messages.
     */
    broadcast(room, { t: "journal", tours: match.journalPublic() });
    broadcast(room, { t: "observe" });
    /*
     * Une borne : le vote se clôt avec les voix posées si personne ne l'a
     * fait avant (audit C3). Sans elle, un seul votant silencieux bloquait le
     * salon pour toujours.
     */
    room.timer = plusTard(() => {
      if (room.match !== match) return;
      const issue = match.clotureSansAttendre([...room.clients.keys()], true);
      if (issue) clotureVote(room, issue);
    }, OBSERVATION_MAX_MS);
    return;
  }

  if (over) {
    broadcast(room, {
      t: "match_end",
      winnerId: reachedCap && !matchOver ? match.winner() : winnerId,
      players: publicPlayers(room),
    });
    room.match = null;
    planifieDepart(room, true);
    broadcast(room, roomState(room));
    return;
  }
  room.timer = plusTard(() => openRound(room), pause);
}

/**
 * Un seul vote, puis l'écran de fin EXISTANT.
 *
 * `vote_result` nomme l'imposteur : les preuves sont fermées, ce n'est
 * plus une fuite. `match_end` suit tout de suite — pas un cinquième
 * écran, pas un setTimeout de reprise (décision n°9).
 */
function clotureVote(room: Room, issue: IssueVote): void {
  const match = room.match;
  if (!match || !match.imposteurId) return;
  const imposteurId = match.imposteurId;
  // La borne de l'observation n'a plus rien à clore.
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  broadcast(room, {
    t: "vote_result",
    accuseId: issue.accuseId,
    imposteurId,
    vainqueur: issue.vainqueur,
  });
  broadcast(room, {
    t: "match_end",
    winnerId: issue.vainqueur === "imposteur" ? imposteurId : null,
    players: publicPlayers(room),
  });
  room.match = null;
  planifieDepart(room, true);
  broadcast(room, roomState(room));
}

/* ------------------------------------------------------------------ *
 * Connexions
 * ------------------------------------------------------------------ */

/**
 * Serveur HTTP porteur.
 *
 * On ne laisse pas `ws` ouvrir le port lui-même : un `WebSocketServer` créé
 * avec `port` répond 400 à toute requête non-upgrade. La sonde de l'hébergeur
 * échouerait donc en boucle, et la machine serait redémarrée sans fin sans
 * qu'on comprenne pourquoi — le multijoueur, lui, marcherait très bien.
 */
const httpServer = createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0];
  if (path !== "/health") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  let players = 0;
  for (const room of rooms.values()) players += room.clients.size;
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(
    JSON.stringify({
      ok: true,
      instance: INSTANCE,
      rooms: rooms.size,
      players,
      uptime: Math.round((Date.now() - STARTED_AT) / 1000),
      // De quoi diagnostiquer sans accès à la machine : quand elle a démarré
      // (un redémarrage récent = une panne ou un déploiement), ce qu'elle
      // consomme, quelle image tourne, et combien d'exceptions ont été
      // rattrapées au lieu de la tuer.
      demarre: new Date(STARTED_AT).toISOString(),
      memoireMo: Math.round(process.memoryUsage().rss / 1048576),
      connexions: clients.size,
      image: process.env.FLY_IMAGE_REF ?? null,
      erreurs: erreursRattrapees,
    }),
  );
});

/** Les échecs de `join` par adresse : voir `debit.ts`. */
const echecsJoin = new EchecsParAdresse();

/**
 * L'état du salon, regroupé : au plus une diffusion toutes les
 * `REGROUPEMENT_ETAT_MS` par salon. Un `profil` rediffusait l'état complet
 * (2,7 Ko × neuf) à CHAQUE message ; le seau le borne à 40/s par socket, ce
 * qui laissait encore 1 Mo/s par salon pour un seul client qui alterne sa
 * carte. Le dernier choix gagne toujours : la diffusion lit l'état à son
 * heure, pas à celle de la demande.
 */
const REGROUPEMENT_ETAT_MS = 150;
function diffuseEtatBientot(room: Room): void {
  if (room.etatPrevu) return;
  room.etatPrevu = plusTard(() => {
    room.etatPrevu = null;
    if (rooms.get(room.code) === room) broadcast(room, roomState(room));
  }, REGROUPEMENT_ETAT_MS, "etat");
}

const wss = new WebSocketServer({
  server: httpServer,
  // Le refus se fait à la poignée de main, pas après : une socket acceptée
  // puis fermée a déjà consommé un identifiant et déclenché la logique de
  // salon. Ici, la connexion n'existe simplement jamais.
  // Le type de `verifyClient` est une union de signatures, que TypeScript ne
  // sait pas propager à un paramètre déstructuré : on l'annote donc à la main,
  // au plus étroit de ce qu'on lit.
  verifyClient: ({ origin }: { origin: string }) =>
    originAllowed(origin, ALLOWED_ORIGINS, PRODUCTION),
  // Le plus gros message légitime est le `profil` portant une photo : au plus
  // `PHOTO_MAX` caractères, plus son enveloppe. Le défaut de `ws` est de
  // 100 Mo — de quoi bloquer la boucle d'événements dans JSON.parse, et donc
  // figer tous les salons à la fois, depuis une seule connexion.
  //
  // ⚠️ Il valait 4096, taillé sur un chat de 140 caractères. Une photo de
  // téléphone réduite pèse 4 à 8 Ko : `ws` aurait FERMÉ la socket du joueur
  // (code 1009) au moment où il choisit sa photo — une coupure sans message,
  // pas un refus. L'e2e envoie une photo de 13 Ko pour le garder.
  maxPayload: PHOTO_MAX + 1024,
});

wss.on("connection", (ws, req) => {
  const client: Client = {
    id: uid(),
    name: "ANONYME",
    ws,
    room: null,
    alive: true,
    glyph: glyphFor(""),
    watching: null,
    lastEmoteAt: 0,
    lastChatAt: 0,
    photoAt: 0,
    lastCursorAt: 0,
    key: "",
    graceTimer: null,
    rookie: false,
    clavier: false,
    consignes: 1,
    reprise: false,
    compte: null,
    adresse: adresseDe(req.headers, req.socket.remoteAddress),
    seau: new Seau(SEAU_CAPACITE, SEAU_PAR_SECONDE, Date.now()),
    refus: 0,
  };
  client.glyph = glyphFor(client.id);

  clients.add(client);
  ws.on("pong", () => (client.alive = true));
  /*
   * ⚠️ SANS CET ÉCOUTEUR, UN SEUL CLIENT FAIT TOMBER TOUS LES SALONS.
   *
   * `ws` émet `error` sur toute trame qu'il refuse — plus grosse que
   * `maxPayload`, UTF-8 invalide, opcode inconnu. Un `EventEmitter` sans
   * écouteur d'`error` LÈVE, et rien ne rattrape l'exception : le processus
   * meurt, et avec lui chaque partie en mémoire. Découvert en portant une
   * photo sur le fil ; l'e2e envoie désormais une trame trop grosse et exige
   * que le serveur réponde encore. La socket fautive se ferme d'elle-même
   * (`ws` s'en charge), et `close` fait le ménage habituel.
   */
  ws.on("error", (e) => {
    console.warn(`socket ${client.id} : ${e.message}`);
  });

  ws.on("message", guarded((raw: RawData) => {
    // Le seau AVANT le décodage : un message en trop ne doit rien coûter.
    if (!client.seau.prend(Date.now())) {
      client.refus += 1;
      if (client.refus === REFUS_AVANT_COUPURE) ws.close(1008, "debit");
      return;
    }
    client.refus = 0;
    const msg = decodeClient(raw.toString());
    if (!msg) return;

    switch (msg.t) {
      case "hello": {
        if (msg.v !== PROTOCOL_VERSION) {
          send(client, { t: "error", code: "bad_version" });
          ws.close();
          return;
        }
        client.name = String(msg.name ?? "").slice(0, 14).toUpperCase() || "ANONYME";
        client.key = String(msg.key ?? "").slice(0, 32);
        client.rookie = msg.rookie === true;
        // `=== true` et non une coercition : absent doit valoir NON.
        client.clavier = msg.clavier === true;
        // Absent, douteux ou inconnu vaut 1 ; plus récent que le serveur est
        // ramené au sien — il ne sait juger que ce qu'il connaît.
        client.consignes =
          Number.isInteger(msg.consignes) && (msg.consignes as number) >= 1
            ? Math.min(msg.consignes as number, CONSIGNES_VERSION)
            : 1;
        client.glyph = parseGlyph(msg.glyph, client.id);
        client.reprise = msg.reprise === true;

        /*
         * Le compte, s'il y en a un.
         *
         * SYNCHRONE, et c'est la raison d'être de `server/jeton.ts` : chez la
         * plupart des clients, `create` ou `join` arrive dans le même paquet
         * TCP que ce `hello`. Une vérification asynchrone ferait entrer le
         * joueur dans le salon sous son identité anonyme, et son nom
         * changerait sous les yeux des autres une milliseconde plus tard.
         *
         * Tout échec — pas de jeton, périmé, signature fausse, serveur sans
         * secret — laisse `compte` à `null` et n'envoie AUCUNE erreur : le
         * joueur joue. Un message d'erreur ici bloquerait un chemin d'entrée
         * pour une couche qui n'est pas censée en être un.
         *
         * Le pseudo et le glyphe du jeton font alors autorité sur ceux
         * annoncés dans le `hello`. C'est ce qui règle l'usurpation de nom à
         * l'intérieur d'un salon : un nom vérifié ne se recopie pas.
         */
        const revendications = verifieJeton(msg.tok, AUTH_SECRET);
        if (revendications) {
          client.compte = revendications.sub;
          if (revendications.psd) client.name = revendications.psd;
          client.glyph = glyphFromIndex(revendications.gly);
        }

        send(client, { t: "welcome", id: client.id });
        return;
      }

      /* La synchro d'horloge : le client estime offset = serverNow − (aller+retour)/2.
         C'est tout ce dont il a besoin pour caler ses fenêtres sur les nôtres. */
      case "ping":
        send(client, { t: "pong", sent: msg.sent, serverNow: now() });
        return;

      /*
       * LE PROFIL — carte de visite et photo. Tout ce qui ne passe pas la
       * validation PARTAGÉE (`shared/profil.ts`) est simplement oublié : aucun
       * message d'erreur, un profil n'est pas un chemin d'entrée.
       */
      case "profil": {
        const carte = carteValide(msg.carte);
        const t = Date.now();
        /*
         * Une photo se relaie à tout le salon : 14 Ko fois neuf. Personne ne
         * change de photo deux fois en une seconde et demie (il faut rouvrir le
         * sélecteur de fichiers), donc un changement plus rapproché est un
         * script — on garde l'ancienne. La CARTE, elle, reste libre : quelques
         * octets, et on la choisit en cliquant de l'une à l'autre.
         */
        const photoDemandee = photoValide(msg.photo);
        const photo =
          photoDemandee !== client.photo && t - client.photoAt < PROFIL_PHOTO_COOLDOWN_MS
            ? client.photo
            : photoDemandee;
        const photoAvant = client.photo;
        // Rien n'a changé : rien à relayer.
        if (carte === client.carte && photo === photoAvant) return;
        if (photo !== photoAvant) client.photoAt = t;
        client.carte = carte;
        client.photo = photo;
        const room = client.room;
        if (room) {
          diffuseEtatBientot(room);
          if (photo !== photoAvant) {
            broadcast(room, { t: "photos", photos: { [client.id]: photo ?? "" } });
          }
        }
        return;
      }

      case "create": {
        leaveRoom(client);
        const room = nouveauSalon(client, false);
        broadcast(room, roomState(room));
        envoiePhotos(room, client);
        return;
      }

      /*
       * PARTIE RAPIDE — voir `server/rapide.ts`. Une table publique qui
       * attend, sinon une en cours (on y regarde jusqu'au match suivant),
       * sinon une neuve. L'entrée elle-même est EXACTEMENT celle de `join` :
       * reprise de siège, spectateur en cours de match, photos.
       */
      case "quick": {
        if (client.room?.public) {
          send(client, roomState(client.room));
          return;
        }
        leaveRoom(client);
        const code = choisitTable(
          [...rooms.values()]
            .filter((r) => r.public)
            .map((r) => ({ code: r.code, joueurs: r.clients.size, enPartie: enPartie(r) })),
          MAX_PLAYERS,
        );
        const table = code ? rooms.get(code) : undefined;
        if (table) {
          rejoindre(client, table);
          return;
        }
        const room = nouveauSalon(client, true);
        broadcast(room, roomState(room));
        envoiePhotos(room, client);
        return;
      }

      case "join": {
        /*
         * Au-delà de `ECHECS_JOIN_MAX` codes inconnus par minute, la même
         * réponse part SANS regarder la table : celui qui balaie les codes
         * n'apprend plus rien. Voir `debit.ts`.
         */
        const t = Date.now();
        const code = String(msg.code ?? "").toUpperCase();
        /*
         * Un code MAL FORMÉ ne désigne aucun salon : il ne révèle rien, donc
         * il ne compte pas comme un essai. Seuls les codes qui POURRAIENT
         * exister usent le crédit de l'adresse — sinon une faute de frappe
         * hostile (le corpus de l'e2e, un client bricolé) bloquerait le vrai
         * code tapé juste après par quelqu'un du même réseau.
         */
        const bienForme = code.length === 4 && [...code].every((ch) => CODE_ALPHABET.includes(ch));
        if (!bienForme || echecsJoin.bloquee(client.adresse, t)) {
          send(client, { t: "error", code: "room_unknown" });
          return;
        }
        const room = rooms.get(code);
        if (!room) {
          echecsJoin.note(client.adresse, t);
          send(client, { t: "error", code: "room_unknown" });
          return;
        }
        rejoindre(client, room);
        return;
      }

      case "start": {
        const room = client.room;
        // Une table publique part SEULE : personne n'y est l'hôte de personne.
        if (!room || room.public) return;
        if (client.id !== room.hostId) {
          send(client, { t: "error", code: "not_host" });
          return;
        }
        if (enPartie(room)) {
          send(client, { t: "error", code: "in_match" });
          return;
        }
        if (room.settings.mode === "imposteur") {
          if (!peutLancerImposteur(idsAssis(room).length)) {
            send(client, { t: "error", code: "need_players" });
            return;
          }
        }
        if (room.settings.mode === "coop") {
          if (!peutLancerCoop(idsAssis(room).length)) {
            send(client, { t: "error", code: "need_players" });
            return;
          }
        }
        if (room.clients.size < 1) return;
        startMatch(room);
        return;
      }

      case "settings": {
        const room = client.room;
        // Les réglages d'une table publique sont ceux par défaut, pour tous.
        if (!room || room.public) return;
        if (client.id !== room.hostId) {
          send(client, { t: "error", code: "not_host" });
          return;
        }
        if (enPartie(room)) {
          send(client, { t: "error", code: "in_match" });
          return;
        }
        room.settings = sanitizeSettings({ ...room.settings, ...msg.settings });
        broadcast(room, roomState(room));
        return;
      }

      /* Regarder quelqu'un ne coûte RIEN au serveur : la scène étant
         déterministe, le spectateur la reconstruit lui-même. On ne fait
         qu'enregistrer son choix pour l'afficher aux autres. */
      case "watch": {
        // Borné : un identifiant fait 8 caractères, et cette valeur est
        // retenue par connexion. Sans borne, chaque client pourrait faire
        // stocker au serveur près de 4 Ko à volonté.
        client.watching = String(msg.playerId ?? "").slice(0, 16) || null;
        return;
      }

      case "input": {
        const room = client.room;
        if (!room || !room.roundOpen) return;

        if (room.coop) {
          const coop = room.coop;
          if (msg.round !== coop.roundIdx) return;
          const floorC = Math.max(room.roundStartAt, now() - INPUT_TOLERANCE_MS);
          const atC = Math.min(Math.max(Number(msg.at) || 0, floorC), room.roundDeadline);
          const elapsedC = atC - room.roundStartAt;
          const aC = msg.action as Partial<{ k: string; i: unknown }> | undefined;
          if (!aC || aC.k !== "c") return;
          const iC = aC.i === null || aC.i === undefined ? null : Number(aC.i);
          if (iC !== null && !Number.isInteger(iC)) return;
          const entC = coop.entityOf(client.id, iC);
          const r = coop.inputCoop(
            client.id,
            msg.round,
            {
              kind: "click",
              ent: entC,
              x: entC ? entC.x : Number.NaN,
              y: entC ? entC.y : Number.NaN,
            },
            elapsedC,
          );
          if (!r) return;
          appliquerClicCoop(room, r);
          return;
        }

        const match = room.match;
        if (!match) return;
        if (msg.round !== match.roundIdx) return;

        /*
         * La date de l'input est bornée par ce que le serveur peut vérifier :
         * jamais avant le départ de la manche, jamais après l'échéance, et
         * jamais plus tôt que « maintenant moins la tolérance ». Le client
         * horodate pour compenser SA latence ; la borne empêche d'horodater
         * dans le passé pour gagner du temps de réaction.
         */
        const floor = Math.max(room.roundStartAt, now() - INPUT_TOLERANCE_MS);
        const at = Math.min(Math.max(Number(msg.at) || 0, floor), room.roundDeadline);
        const elapsed = at - room.roundStartAt;

        // Rien de ce qui suit n'est garanti par `decodeClient` : il ne vérifie
        // que la présence d'un `t`. Un `action` absent levait ici même.
        const a = msg.action as Partial<{ k: string; i: unknown; key: unknown }> | undefined;
        if (!a || (a.k !== "c" && a.k !== "k" && a.k !== "r" && a.k !== "l")) return;

        // `ents[i]` avec un i non entier peut remonter une propriété héritée
        // (« __proto__ » renvoie un objet, que `?? null` ne rattrape pas).
        // On n'accepte donc qu'un index entier, ou null pour « rien cliqué ».
        const i = a.i === null || a.i === undefined ? null : Number(a.i);
        if (i !== null && !Number.isInteger(i)) return;

        // Une touche est un caractère ou un nom de touche court. Sans borne,
        // `maxPayload` autoriserait une chaîne de 4 Ko dans chaque input.
        const key = String(a.key ?? "").slice(0, 16);

        /*
         * La position du clic vient de l'ENTITÉ, reconstruite par le serveur.
         *
         * Elle valait `x: 0` en dur, parce que le fil ne transporte qu'un index
         * — décision volontaire de l'anti-triche : le serveur ne doit rien
         * croire du client, et il n'a aucune idée de sa résolution.
         *
         * Mais une règle JUGE sur cette position. LE GAUCHER interdit la
         * première colonne (`a.x < 200`), donc avec x = 0 elle déclarait une
         * infraction à CHAQUE clic, où qu'on clique. Constaté en soirée de
         * test : « dès qu'un joueur l'obtient, il est assuré de perdre ». Le
         * solo n'était pas touché — main.ts, lui, envoie les vraies
         * coordonnées de champ.
         *
         * Le serveur a l'information : il reconstruit la scène, donc il connaît
         * `ent.x`. On juge là-dessus — autorité conservée, sans rien demander
         * au client.
         *
         * Clic dans le vide : on ne sait pas où, et prétendre « en (0,0) »
         * ferait mentir la règle. NaN ne satisfait aucune comparaison, donc
         * aucune règle de zone ne se déclenche et le verdict honnête —
         * « TU AS CLIQUÉ DANS LE VIDE » — reprend la main.
         */
        const ent = a.k === "c" || a.k === "l" ? match.entityOf(client.id, i) : null;
        // Le LEVER (MAINTENIR, GLISSER) se reconstruit comme le clic : depuis
        // l'entité, jamais depuis un point que le client annoncerait.
        const action =
          a.k === "c" || a.k === "l"
            ? {
                kind: a.k === "c" ? ("click" as const) : ("lift" as const),
                ent,
                x: ent ? ent.x : Number.NaN,
                y: ent ? ent.y : Number.NaN,
              }
            : a.k === "k"
              ? { kind: "key" as const, key }
              : { kind: "release" as const, key };

        const vierge = match.encoreSansGeste(client.id);
        match.input(client.id, msg.round, action, elapsed);
        if (fautSignalerActe(match.imposteur, vierge, match.encoreSansGeste(client.id))) {
          broadcast(room, { t: "acted", idx: match.roundIdx, playerId: client.id });
        }

        // Tous les vivants ont conclu → on n'attend pas l'échéance pour rien.
        const allDone = match.alive.every((s) => {
          const st = matchState(match, s.id);
          return st === null || st.outcome !== null;
        });
        if (allDone && room.timer) {
          clearTimeout(room.timer);
          closeRound(room);
        }
        return;
      }

      case "vote": {
        const room = client.room;
        const match = room?.match;
        if (!room || !match) return;
        const accuseId = String(msg.playerId ?? "").slice(0, 16);
        if (!accuseId) return;
        const r = match.poserVote(client.id, accuseId);
        if (r.ignore || !r.issue) return;
        clotureVote(room, r.issue);
        return;
      }

      case "cursor": {
        const room = client.room;
        const coop = room?.coop;
        if (!room || !coop) return;
        if (!coop.estActif(client.id)) return;
        const t = now();
        if (t - client.lastCursorAt < CURSOR_COOLDOWN_MS) return;
        const p = borneCurseur(msg.x, msg.y);
        if (!p) return;
        client.lastCursorAt = t;
        room.cursorPos.set(client.id, p);
        diffuserCurseurs(room);
        return;
      }

      case "emote": {
        const room = client.room;
        if (!room) return;
        // `decodeClient` ne fait que du JSON : tout ce qui vient du fil se valide ici.
        const k = Number(msg.k);
        if (!Number.isInteger(k) || k < 0 || k >= EMOTE_COUNT) return;
        const t = now();
        if (t - client.lastEmoteAt < EMOTE_COOLDOWN_MS) return;
        client.lastEmoteAt = t;
        broadcast(room, { t: "emote", playerId: client.id, k });
        return;
      }

      case "chat": {
        const room = client.room;
        if (!room) return;
        const text = String(msg.text ?? "")
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0000-\u001F\u007F]/g, " ")
          .trim()
          .slice(0, CHAT_MAX_LEN);
        if (!text) return;
        const t = now();
        if (t - client.lastChatAt < CHAT_COOLDOWN_MS) return;
        client.lastChatAt = t;
        broadcast(room, { t: "chat", playerId: client.id, name: client.name, text });
        return;
      }

      case "kick": {
        const room = client.room;
        // Sur une table publique, le premier arrivé n'a aucun droit sur les
        // suivants : une expulsion y serait un abus, pas une modération.
        if (!room || room.public) return;
        if (client.id !== room.hostId) {
          send(client, { t: "error", code: "not_host" });
          return;
        }
        // Les identifiants sont attribués par connexion : une liste de bannis
        // serait vide de sens — l'exclu revient avec un nouvel id s'il a gardé
        // le code. L'exclusion sort de la pièce, elle ne ferme pas la porte.
        // Sans comptes, la seule protection réelle est la sourdine locale.
        const victim = room.clients.get(String(msg.playerId ?? ""));
        if (!victim || victim.id === client.id) return;
        send(victim, { t: "error", code: "kicked" });
        leaveRoom(victim);
        victim.ws.close();
        return;
      }

      case "leave":
        leaveRoom(client);
        return;
    }
  }));

  ws.on("close", guarded(() => {
    clients.delete(client);

    /*
     * Coupure pendant un match : on GARDE le siège au lieu de déclarer forfait.
     *
     * Sans ça, une bascule d'application sur téléphone élimine définitivement —
     * et c'est le comportement normal d'un navigateur mobile, pas un incident
     * rare. Le joueur absent continue de perdre des vies par timeout, donc il
     * ne gagne rien à disparaître ; il peut simplement revenir.
     *
     * Un `leave` explicite ne passe pas par ici : partir reste immédiat.
     */
    const room = client.room;
    const seatVivant =
      (!!room?.match && room.match.seats.some((s) => s.id === client.id && !s.eliminated)) ||
      (!!room?.coop && room.coop.seats.some((s) => s.id === client.id));
    if (room && seatVivant && client.key) {
      // Absent : plus aucune manche ne lui est ouverte, donc plus de vie
      // perdue par timeout. Sans ça le sursis ne servait à rien — il était
      // éliminé bien avant d'avoir pu revenir.
      room.match?.setAway(client.id, true);
      room.coop?.setAway(client.id, true);
      if (room.coop && room.cursorPos.delete(client.id)) diffuserCurseurs(room);
      client.graceTimer = plusTard(() => {
        client.graceTimer = null;
        leaveRoom(client);
      }, RECONNECT_GRACE_MS);
      broadcast(room, roomState(room)); // les plaques montrent « déconnecté »
      return;
    }
    leaveRoom(client);
  }, "fermeture"));
});

/** Accès lecture à l'état d'un joueur — évite d'exposer la Map privée. */
function matchState(match: MatchLogic, id: string): { outcome: RoundOutcome | null } | null {
  return (match as unknown as { states: Map<string, { outcome: RoundOutcome | null }> }).states.get(id) ?? null;
}

/**
 * Entrer dans un salon — le chemin commun de `join` et de `quick`.
 * Reprise de siège, arrivée en spectateur, photos : tout est ici, une fois.
 */
function rejoindre(client: Client, room: Room): void {
  /*
   * Reprise de siège. Un joueur coupé reste dans le salon, socket
   * fermée, pendant RECONNECT_GRACE_MS. S'il revient avec la même clé
   * locale, il REPREND son identifiant — donc son siège, ses vies et
   * son score — au lieu d'entrer en spectateur avec une identité neuve.
   *
   * Deux onglets du même navigateur partagent la clé : le plus récent
   * prend la place, l'ancien est prévenu et ne la reprend pas tout seul
   * (voir `remplace` plus bas).
   */
  /*
   * Déjà dans ce salon : rejoindre à nouveau ne doit RIEN casser.
   *
   * Sans ce garde, le chemin normal passait par leaveRoom(), donc par
   * forfeit() : cliquer REJOINDRE en étant encore connecté s'éliminait
   * soi-même — et à deux joueurs, ça terminait le match pour tout le
   * monde. Rejoindre là où l'on est déjà est une demande d'état, pas un
   * départ.
   */
  if (client.room === room) {
    send(client, roomState(room));
    return;
  }

  // AVANT toute reprise d'identifiant : leaveRoom retire l'entrée sous
  // la clé `client.id`, donc il doit tourner tant que celle-ci vaut
  // encore l'ancienne. L'appeler après laisserait une entrée morte dans
  // le salon précédent, introuvable et jamais nettoyée.
  leaveRoom(client);

  /*
   * ⚠️ LA CLÉ SUFFIT, même si l'ancienne socket paraît encore OUVERTE.
   *
   * La reprise exigeait une socket déjà fermée côté serveur. Or une coupure
   * réseau « à moitié ouverte » (le téléphone passe du Wi-Fi à la 4G) ne se
   * voit qu'au battement de cœur, 15 à 30 s plus tard, alors que le client
   * revient en moins d'une seconde. Il entrait donc comme un INCONNU,
   * spectateur, et son siège tombait en forfait 25 s après la fermeture
   * enfin constatée : la décision n°4 trahie par le cas le plus courant sur
   * téléphone (audit C1).
   *
   * La connexion la plus récente gagne. L'ancienne est prévenue (`remplace`)
   * puis fermée ; le client ne tente pas de revenir après ce message, donc
   * deux onglets du même navigateur ne se renvoient pas le siège en boucle.
   */
  const fantome = client.key
    ? [...room.clients.values()].find(
        // Une socket ouverte ne se remplace que chez un client qui saura
        // céder sans revenir : sinon deux vieux onglets se battraient.
        (c) => c.key === client.key && (c.ws.readyState !== WebSocket.OPEN || c.reprise),
      )
    : undefined;
  if (fantome) {
    if (fantome.ws.readyState === WebSocket.OPEN) {
      send(fantome, { t: "error", code: "remplace" });
      fantome.ws.close(4001, "remplace");
    }
    if (fantome.graceTimer) clearTimeout(fantome.graceTimer);
    fantome.graceTimer = null;
    fantome.room = null;
    room.clients.delete(fantome.id);
    client.id = fantome.id;
    // De retour : le siège rejoue dès la manche suivante (classique)
    // ou dans la vague en cours (coop — une coupure n'est pas une défaite).
    room.match?.setAway(client.id, false);
    room.coop?.setAway(client.id, false);
    // L'identifiant vient de changer : le client doit le réapprendre,
    // sinon il ne se reconnaît pas dans les verdicts ni sur les plaques.
    send(client, { t: "welcome", id: client.id });
  } else if (room.clients.size >= MAX_PLAYERS) {
    send(client, { t: "error", code: "room_full" });
    return;
  }
  room.clients.set(client.id, client);
  client.room = room;
  // Une arrivée peut rapprocher le départ d'une table publique (jamais le
  // repousser) : l'échéance part dans le `roomState` juste en dessous.
  planifieDepart(room);
  // Arrivée en cours de match : spectateur jusqu'à la manche d'après —
  // c'est le modèle BombParty, on ne bloque jamais la porte.
  broadcast(room, roomState(room));
  envoiePhotos(room, client);

  /*
   * Arrivée en cours de match : renvoyer de quoi se reconstruire.
   *
   * Le client détruit tout son état de match quand il est coupé, et ne le
   * rebâtit que sur `match_start`. Sans ce renvoi, `beginRound()` sort
   * immédiatement.
   *
   * Envoyé à TOUT arrivant, pas seulement à qui reprend un siège :
   *   · celui qui revient d'une coupure récupérait sa place mais restait
   *     bloqué au salon jusqu'à la fin de la partie ;
   *   · et un vrai SPECTATEUR — quelqu'un qui rejoint pendant qu'on joue —
   *     n'obtenait rien du tout. Toute l'interface de spectateur existe
   *     (barre de cibles, pied « JE REGARDE X », reconstruction locale de
   *     la scène) mais elle est conditionnée à un état de match qu'il ne
   *     recevait jamais. Il attendait devant un salon figé.
   *
   * Envoyé APRÈS roomState : beginMatch lit les vies et le statut dans la
   * liste de joueurs qu'il vient de recevoir.
   */
  const m = room.match;
  if (m) {
    send(client, {
      t: "match_start",
      seed: m.seed,
      rules: m.reglesPubliques(Math.max(0, m.roundIdx)),
      // La manche en cours ne lui est pas ouverte : il reprend à la
      // suivante, et le message `round` fixera les vraies dates.
      firstRoundAt: now(),
      settings: room.settings,
      // Le mode du match EN COURS, pas celui qu'on recalculerait avec
      // l'arrivant : il est spectateur, il n'a pas voix au tirage, et
      // il doit reconstruire exactement ce que les autres voient.
      clavier: m.clavier,
      consignes: m.consignes,
    });
    if (m.imposteur && m.imposteurId === client.id) {
      send(client, { t: "role", imposteur: true });
    }
    if (m.enObservation()) {
      send(client, { t: "journal", tours: m.journalPublic() });
      send(client, { t: "observe" });
    }
  }
  const coop = room.coop;
  if (coop) {
    send(client, {
      t: "match_start",
      seed: coop.seed,
      rules: coop.reglesPubliques(),
      firstRoundAt: now(),
      settings: room.settings,
      clavier: false,
    });
    if (room.roundOpen) {
      send(client, {
        t: "round",
        idx: coop.roundIdx,
        startAt: room.roundStartAt,
        deadline: room.roundDeadline,
        consumed: [...coop.consumed],
      });
    }
  }
  return;
}

function leaveRoom(client: Client): void {
  const room = client.room;
  if (!room) return;
  // Un siège en sursis qu'on abandonne pour de bon : le compteur ne doit pas
  // survivre au départ, sinon il rappellera leaveRoom sur un client qui n'est
  // plus nulle part.
  if (client.graceTimer) {
    clearTimeout(client.graceTimer);
    client.graceTimer = null;
  }
  room.clients.delete(client.id);
  client.room = null;

  if (room.match) room.match.forfeit(client.id);
  if (room.coop) room.coop.forfeit(client.id);
  const curseurParti = room.cursorPos.delete(client.id);

  if (room.clients.size === 0) {
    if (room.timer) clearTimeout(room.timer);
    if (room.autoTimer) clearTimeout(room.autoTimer);
    clearChargeTimers(room);
    rooms.delete(room.code);
    return;
  }
  if (client.id === room.hostId) {
    room.hostId = [...room.clients.keys()][0]!;
  }
  // Un votant qui part : ceux qui restent ont peut-être déjà tous voté.
  // `clotureVote` diffuse la fin et l'état du salon lui-même.
  const issue = room.match?.clotureSansAttendre([...room.clients.keys()]) ?? null;
  if (issue) {
    clotureVote(room, issue);
    return;
  }
  planifieDepart(room);
  broadcast(room, roomState(room));
  if (room.coop && curseurParti) diffuserCurseurs(room);
}

/* Heartbeat : une connexion morte silencieusement ne doit pas geler un salon. */
const heartbeat = setInterval(() => {
  // Sur `clients`, pas sur `rooms` : une socket restée au menu n'était jamais
  // sondée, donc jamais fermée. Elle survivait à la coupure réseau du client
  // et gardait son descripteur pour toujours.
  for (const c of clients) {
    if (!c.alive) {
      clients.delete(c);
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, 15_000);

/**
 * Arrêt propre. L'hébergeur envoie SIGTERM, puis tue le processus au bout d'un
 * délai de grâce. Sans ce gestionnaire, les sockets meurent sans trame de
 * fermeture : le client met plusieurs secondes à s'en apercevoir, et le joueur
 * croit que le jeu a gelé.
 */
let closing = false;
function shutdown(): void {
  if (closing) return;
  closing = true;
  clearInterval(heartbeat);
  for (const room of rooms.values()) {
    if (room.timer) clearTimeout(room.timer);
    // Les sursis de reconnexion aussi : un timer encore armé retiendrait la
    // boucle d'événements et ferait dépasser le délai de grâce de l'hébergeur.
    for (const c of room.clients.values()) {
      if (c.graceTimer) clearTimeout(c.graceTimer);
    }
  }
  // 1001 « going away » : le code qu'un navigateur lit comme un départ du
  // serveur, et non comme une erreur de connexion.
  for (const ws of wss.clients) ws.close(1001, "shutdown");
  wss.close();
  httpServer.close(() => process.exit(0));
  // Filet : une socket récalcitrante ne doit pas nous faire dépasser le délai
  // de grâce, sinon l'hébergeur nous tue quand même et on n'a rien gagné.
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

httpServer.listen(PORT, () => {
  const origins =
    ALLOWED_ORIGINS.length > 0
      ? `origines autorisées : ${ALLOWED_ORIGINS.join(", ")}`
      : PRODUCTION
        ? "ATTENTION : ALLOWED_ORIGINS vide en production — toute connexion navigateur sera refusée"
        : "origines : toutes (hors production)";
  console.log(
    `THE ONE RULE — serveur de salons sur ws://localhost:${PORT} · sonde GET /health\n` +
      `${MULTI_RULES.length} règles en rotation · ${MAX_PLAYERS} joueurs max · fenêtre lvl0 ${windowMs(0)} ms\n` +
      origins,
  );
});
