/**
 * L'état des salons et le déroulement des manches.
 *
 * Extrait de server/index.ts sans changer le comportement : les fonctions
 * sont les mêmes, seul leur fichier a bougé. Le processus (HTTP, WebSocket,
 * arrêt) reste dans index.ts. Les messages sont branchés dans messages/.
 */
import { nouveauCode, nouvelId, identifiantInstance } from "./code";
import { echeanceDepart, RAPIDE_MIN } from "./rapide";
import { EchecsParAdresse, Seau } from "./debit";
import { WebSocket } from "ws";
import { MatchLogic } from "./match";
import { MatchCoop, type ClicCoop, type ClotureCharge } from "./coop";
import { IMPOSTEUR_MAX_ASIS } from "../src/engine/imposteur";
import type { IssueVote } from "../src/engine/imposteur";
import { COOP_MAX_ASIS, COOP_RASSEMBLEMENT_MS } from "../src/engine/coop";
import { cleanEnv } from "../src/env";
import {
  COUNTDOWN_MS,
  DEFAULT_SETTINGS,
  EMPTY_STATS,
  INPUT_TOLERANCE_MS,
  INTERLUDE_MS,
  INTERLUDE_ROTATION_MS,
  MAX_PLAYERS,
  MAX_ROUNDS,
  encode,
} from "../shared/protocol";
import type { Glyph, PlayerPublic, RoundOutcome, ServerMsg } from "../shared/protocol";
import { CONSIGNES_VERSION } from "../src/engine/instructions";
import { glyphFor, PATTERN_COUNT } from "../src/net/glyph";

export const PROFIL_PHOTO_COOLDOWN_MS = 1500;
export const OBSERVATION_MAX_MS = 90_000;
export const AUTH_SECRET = cleanEnv(process.env.TOR_AUTH_SECRET) ?? "";
export const STARTED_AT = Date.now();
export const INSTANCE = identifiantInstance();

export interface Client {
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

export interface Room {
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

export const rooms = new Map<string, Room>();

/**
 * Tous les clients connectés, y compris ceux qui ne sont dans aucun salon.
 *
 * Le battement de cœur parcourait `rooms`, donc une socket restée au menu
 * n'était jamais sondée ni fermée : une connexion morte silencieusement y
 * vivait indéfiniment, et le descripteur avec elle.
 */
export const clients = new Set<Client>();
export const now = (): number => Date.now();

/**
 * Enveloppe un gestionnaire d'événement pour qu'une exception n'emporte pas
 * le processus.
 *
 * `decodeClient` valide la forme : un message illisible est `null` et
 * n'arrive pas ici. Un `input` sans `action` levait autrefois dans ce
 * gestionnaire, et une exception non capturée tuait tous les salons.
 * Les bornes de jeu (hôte, manche, débit) restent dans chaque cas.
 * Ceci est la ceinture qui couvre aussi
 * ceux qu'on ajoutera demain sans y penser.
 */
/** Exceptions rattrapées depuis le démarrage : `/health` les expose. */
export let erreursRattrapees = 0;

export const guarded =
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
export const plusTard = (fn: () => void, ms: number, ou = "minuterie"): ReturnType<typeof setTimeout> =>
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

export const newCode = (): string => nouveauCode((c) => rooms.has(c));
export const uid = (): string => nouvelId();

/* ------------------------------------------------------------------ *
 * Diffusion
 * ------------------------------------------------------------------ */

export function send(c: Client, msg: ServerMsg): void {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(encode(msg));
}

export function broadcast(room: Room, msg: ServerMsg): void {
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
export function envoiePhotos(room: Room, arrivant: Client): void {
  const toutes: Record<string, string> = {};
  for (const c of room.clients.values()) if (c.photo) toutes[c.id] = c.photo;
  if (Object.keys(toutes).length) send(arrivant, { t: "photos", photos: toutes });
  if (arrivant.photo) {
    const msg: ServerMsg = { t: "photos", photos: { [arrivant.id]: arrivant.photo } };
    for (const c of room.clients.values()) if (c !== arrivant) send(c, msg);
  }
}

export function parseGlyph(raw: unknown, fallbackId: string): Glyph {
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

export function enPartie(room: Room): boolean {
  return room.match !== null || room.coop !== null;
}

export function publicPlayers(room: Room): PlayerPublic[] {
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

export const roomState = (room: Room): ServerMsg => ({
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
export function planifieDepart(room: Room, apresMatch = false): void {
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

export function nouveauSalon(client: Client, publique: boolean): Room {
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

export function idsAssis(room: Room): string[] {
  const ids = [...room.clients.keys()];
  if (room.settings.mode === "imposteur") return ids.slice(0, IMPOSTEUR_MAX_ASIS);
  if (room.settings.mode === "coop") return ids.slice(0, COOP_MAX_ASIS);
  return ids;
}

export function chuchoteRole(room: Room): void {
  const m = room.match;
  if (!m?.imposteur || !m.imposteurId) return;
  const cible = room.clients.get(m.imposteurId);
  if (cible) send(cible, { t: "role", imposteur: true });
}

export function startMatch(room: Room): void {
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

export function startMatchCoop(room: Room): void {
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

export function diffuserCurseurs(room: Room): void {
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

export function clearChargeTimers(room: Room): void {
  for (const t of room.chargeTimers.values()) clearTimeout(t);
  room.chargeTimers.clear();
}

export function planifierClotureCharge(room: Room, i: number, expireElapsedMs: number): void {
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

export function appliquerClicCoop(room: Room, r: ClicCoop): void {
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

export function appliquerClotureCoop(room: Room, r: ClotureCharge | null): void {
  const coop = room.coop;
  if (!coop || !r) return;
  if (r.kind === "rate") {
    broadcast(room, { t: "charge", i: r.i, n: 0, need: r.need, idx: coop.roundIdx });
    return;
  }
  appliquerClicCoop(room, r);
}

export function openVagueCoop(room: Room): void {
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

export function closeVagueCoop(room: Room): void {
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

export function openRound(room: Room): void {
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

export function closeRound(room: Room): void {
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
export function clotureVote(room: Room, issue: IssueVote): void {
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

/** Les échecs de `join` par adresse : voir `debit.ts`. */
export const echecsJoin = new EchecsParAdresse();

/**
 * L'état du salon, regroupé : au plus une diffusion toutes les
 * `REGROUPEMENT_ETAT_MS` par salon. Un `profil` rediffusait l'état complet
 * (2,7 Ko × neuf) à CHAQUE message ; le seau le borne à 40/s par socket, ce
 * qui laissait encore 1 Mo/s par salon pour un seul client qui alterne sa
 * carte. Le dernier choix gagne toujours : la diffusion lit l'état à son
 * heure, pas à celle de la demande.
 */
export const REGROUPEMENT_ETAT_MS = 150;
export function diffuseEtatBientot(room: Room): void {
  if (room.etatPrevu) return;
  room.etatPrevu = plusTard(() => {
    room.etatPrevu = null;
    if (rooms.get(room.code) === room) broadcast(room, roomState(room));
  }, REGROUPEMENT_ETAT_MS, "etat");
}

export function matchState(match: MatchLogic, id: string): { outcome: RoundOutcome | null } | null {
  return (match as unknown as { states: Map<string, { outcome: RoundOutcome | null }> }).states.get(id) ?? null;
}

/**
 * Entrer dans un salon — le chemin commun de `join` et de `quick`.
 * Reprise de siège, arrivée en spectateur, photos : tout est ici, une fois.
 */
export function rejoindre(client: Client, room: Room): void {
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

export function leaveRoom(client: Client): void {
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

