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

import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import { MatchLogic, MULTI_RULES } from "./match";
import { originAllowed, parseOrigins } from "./origin";
import {
  COUNTDOWN_MS,
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
import { windowMs } from "../src/engine/difficulty";
import { glyphFor, PATTERN_COUNT } from "../src/net/glyph";

const PORT = Number(process.env.PORT) || 8787;
const ALLOWED_ORIGINS = parseOrigins(process.env.ALLOWED_ORIGINS);
const PRODUCTION = process.env.NODE_ENV === "production";
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
}

interface Room {
  code: string;
  clients: Map<string, Client>;
  hostId: string;
  match: MatchLogic | null;
  settings: import("../shared/protocol").RoomSettings;
  /** départ de la manche courante, horloge serveur */
  roundStartAt: number;
  roundDeadline: number;
  timer: ReturnType<typeof setTimeout> | null;
  roundOpen: boolean;
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
const guarded =
  <A extends unknown[]>(fn: (...a: A) => void) =>
  (...a: A): void => {
    try {
      fn(...a);
    } catch (err) {
      console.error(`message_error ${String(err)}`);
    }
  };

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

function publicPlayers(room: Room): PlayerPublic[] {
  const rules = room.match ? room.match.rulesAt(Math.max(0, room.match.roundIdx)) : null;
  return [...room.clients.values()].map((c) => {
    const seat = room.match?.seats.find((s) => s.id === c.id);
    return {
      id: c.id,
      name: c.name,
      ruleId: rules?.get(c.id)?.id ?? "",
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
      lives: seat ? seat.lives : room.match ? 0 : room.settings.lives,
      score: seat?.score ?? 0,
      host: c.id === room.hostId,
      spectator: room.match !== null && !seat,
      connected: c.ws.readyState === WebSocket.OPEN,
      glyph: c.glyph,
      // Hors match, on montre son intention ; en match, ce que le siège porte
      // réellement — sinon un joueur pourrait s'annoncer débutant après coup.
      rookie: seat ? seat.rookie : c.rookie,
      // L'équipe n'existe que pendant un match en duo : hors match, personne
      // n'est encore apparié, et prétendre le contraire afficherait des paires
      // qui bougeraient au lancement.
      team: room.match?.duo && seat ? seat.team : undefined,
      // Un joueur au-delà de INPUT_TOLERANCE_MS de latence voit ses temps
      // gonflés : le serveur refuse d'horodater plus de 120 ms dans le passé
      // (anti-triche). La médiane limite le bruit sans corriger ce biais —
      // on ne le corrige pas avec une valeur client.
      stats: room.match?.statsOf(c.id) ?? { ...EMPTY_STATS },
    };
  });
}

const roomState = (room: Room): ServerMsg => ({
  t: "room",
  code: room.code,
  players: publicPlayers(room),
  inMatch: room.match !== null,
  settings: room.settings,
});

/* ------------------------------------------------------------------ *
 * Déroulement d'un match
 * ------------------------------------------------------------------ */

function startMatch(room: Room): void {
  const ids = [...room.clients.keys()];
  const seed = (Math.random() * 2 ** 31) | 0;
  /*
   * Accueil du débutant. Le serveur n'a aucune mémoire entre les salons : il
   * ne peut donc pas VÉRIFIER qu'un joueur est nouveau, seulement le croire.
   * La garantie contre l'abus n'est pas technique, elle est sociale — le
   * statut s'affiche sur la plaque, tout le salon le voit. Entre amis, ça
   * suffit ; et le jour où un classement comptera, il ne passera pas par ici.
   */
  const rookies = new Set(
    [...room.clients.values()].filter((c) => c.rookie).map((c) => c.id),
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
    ids.length > 0 && [...room.clients.values()].every((c) => c.clavier === true);
  room.match = new MatchLogic(seed, ids, room.settings, rookies, clavier, room.settings.duo);

  const rules: Record<string, string> = {};
  for (const [id, rule] of room.match.rulesAt(0)) rules[id] = rule.id;

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
  });

  room.timer = setTimeout(() => openRound(room), COUNTDOWN_MS);
}

function openRound(room: Room): void {
  const match = room.match;
  if (!match) return;

  const { idx, durationMs } = match.openRound();
  room.roundStartAt = now();
  room.roundDeadline = room.roundStartAt + durationMs;
  room.roundOpen = true;

  const msg: ServerMsg = {
    t: "round",
    idx,
    startAt: room.roundStartAt,
    deadline: room.roundDeadline,
  };
  if (match.rotationJustHappened(idx)) {
    const rules: Record<string, string> = {};
    for (const [id, rule] of match.rulesAt(idx)) rules[id] = rule.id;
    msg.rules = rules;
  }
  broadcast(room, msg);

  // La manche se clôt à l'échéance PLUS la tolérance réseau : un input parti
  // dans la fenêtre mais arrivé 100 ms en retard doit encore compter.
  room.timer = setTimeout(() => closeRound(room), durationMs + INPUT_TOLERANCE_MS + 15);
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
    const suivantes: Record<string, string> = {};
    for (const [id, rule] of match.rulesAt(prochaineIdx)) suivantes[id] = rule.id;
    verdict.nextRules = suivantes;
  }
  broadcast(room, verdict);

  if (over) {
    broadcast(room, {
      t: "match_end",
      winnerId: reachedCap && !matchOver ? match.winner() : winnerId,
      players: publicPlayers(room),
    });
    room.match = null;
    broadcast(room, roomState(room));
    return;
  }
  room.timer = setTimeout(() => openRound(room), pause);
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
    }),
  );
});

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
  // Le plus gros message légitime est un chat de 140 caractères : quelques
  // centaines d'octets. Le défaut de `ws` est de 100 Mo — de quoi bloquer la
  // boucle d'événements dans JSON.parse, et donc figer tous les salons à la
  // fois, depuis une seule connexion.
  maxPayload: 4096,
});

wss.on("connection", (ws) => {
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
    key: "",
    graceTimer: null,
    rookie: false,
    clavier: false,
  };
  client.glyph = glyphFor(client.id);

  clients.add(client);
  ws.on("pong", () => (client.alive = true));

  ws.on("message", guarded((raw: RawData) => {
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
        client.glyph = parseGlyph(msg.glyph, client.id);
        send(client, { t: "welcome", id: client.id });
        return;
      }

      /* La synchro d'horloge : le client estime offset = serverNow − (aller+retour)/2.
         C'est tout ce dont il a besoin pour caler ses fenêtres sur les nôtres. */
      case "ping":
        send(client, { t: "pong", sent: msg.sent, serverNow: now() });
        return;

      case "create": {
        leaveRoom(client);
        const room: Room = {
          code: newCode(),
          clients: new Map([[client.id, client]]),
          hostId: client.id,
          match: null,
          settings: { ...DEFAULT_SETTINGS },
          roundStartAt: 0,
          roundDeadline: 0,
          timer: null,
          roundOpen: false,
        };
        rooms.set(room.code, room);
        client.room = room;
        broadcast(room, roomState(room));
        return;
      }

      case "join": {
        const room = rooms.get(String(msg.code ?? "").toUpperCase());
        if (!room) {
          send(client, { t: "error", code: "room_unknown" });
          return;
        }
        /*
         * Reprise de siège. Un joueur coupé reste dans le salon, socket
         * fermée, pendant RECONNECT_GRACE_MS. S'il revient avec la même clé
         * locale, il REPREND son identifiant — donc son siège, ses vies et
         * son score — au lieu d'entrer en spectateur avec une identité neuve.
         *
         * On n'accepte la reprise que si l'ancienne socket est effectivement
         * fermée : sinon deux onglets du même navigateur, qui partagent la
         * clé, se voleraient mutuellement leur place.
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

        const fantome = client.key
          ? [...room.clients.values()].find(
              (c) => c.key === client.key && c.ws.readyState !== WebSocket.OPEN,
            )
          : undefined;
        if (fantome) {
          if (fantome.graceTimer) clearTimeout(fantome.graceTimer);
          fantome.graceTimer = null;
          fantome.room = null;
          room.clients.delete(fantome.id);
          client.id = fantome.id;
          // De retour : le siège rejoue dès la manche suivante.
          room.match?.setAway(client.id, false);
          // L'identifiant vient de changer : le client doit le réapprendre,
          // sinon il ne se reconnaît pas dans les verdicts ni sur les plaques.
          send(client, { t: "welcome", id: client.id });
        } else if (room.clients.size >= MAX_PLAYERS) {
          send(client, { t: "error", code: "room_full" });
          return;
        }
        room.clients.set(client.id, client);
        client.room = room;
        // Arrivée en cours de match : spectateur jusqu'à la manche d'après —
        // c'est le modèle BombParty, on ne bloque jamais la porte.
        broadcast(room, roomState(room));

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
          const rules: Record<string, string> = {};
          for (const [id, rule] of m.rulesAt(Math.max(0, m.roundIdx))) rules[id] = rule.id;
          send(client, {
            t: "match_start",
            seed: m.seed,
            rules,
            // La manche en cours ne lui est pas ouverte : il reprend à la
            // suivante, et le message `round` fixera les vraies dates.
            firstRoundAt: now(),
            settings: room.settings,
            // Le mode du match EN COURS, pas celui qu'on recalculerait avec
            // l'arrivant : il est spectateur, il n'a pas voix au tirage, et
            // il doit reconstruire exactement ce que les autres voient.
            clavier: m.clavier,
          });
        }
        return;
      }

      case "start": {
        const room = client.room;
        if (!room) return;
        if (client.id !== room.hostId) {
          send(client, { t: "error", code: "not_host" });
          return;
        }
        if (room.match) {
          send(client, { t: "error", code: "in_match" });
          return;
        }
        if (room.clients.size < 1) return;
        startMatch(room);
        return;
      }

      case "settings": {
        const room = client.room;
        if (!room) return;
        if (client.id !== room.hostId) {
          send(client, { t: "error", code: "not_host" });
          return;
        }
        if (room.match) {
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
        const match = room?.match;
        if (!room || !match || !room.roundOpen) return;
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
        if (!a || (a.k !== "c" && a.k !== "k" && a.k !== "r")) return;

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
        const ent = a.k === "c" ? match.entityOf(client.id, i) : null;
        const action =
          a.k === "c"
            ? {
                kind: "click" as const,
                ent,
                x: ent ? ent.x : Number.NaN,
                y: ent ? ent.y : Number.NaN,
              }
            : a.k === "k"
              ? { kind: "key" as const, key }
              : { kind: "release" as const, key };

        match.input(client.id, msg.round, action, elapsed);

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
        if (!room) return;
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

  ws.on("close", () => {
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
      !!room?.match && room.match.seats.some((s) => s.id === client.id && !s.eliminated);
    if (room && seatVivant && client.key) {
      // Absent : plus aucune manche ne lui est ouverte, donc plus de vie
      // perdue par timeout. Sans ça le sursis ne servait à rien — il était
      // éliminé bien avant d'avoir pu revenir.
      room.match?.setAway(client.id, true);
      client.graceTimer = setTimeout(() => {
        client.graceTimer = null;
        leaveRoom(client);
      }, RECONNECT_GRACE_MS);
      broadcast(room, roomState(room)); // les plaques montrent « déconnecté »
      return;
    }
    leaveRoom(client);
  });
});

/** Accès lecture à l'état d'un joueur — évite d'exposer la Map privée. */
function matchState(match: MatchLogic, id: string): { outcome: RoundOutcome | null } | null {
  return (match as unknown as { states: Map<string, { outcome: RoundOutcome | null }> }).states.get(id) ?? null;
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

  if (room.clients.size === 0) {
    if (room.timer) clearTimeout(room.timer);
    rooms.delete(room.code);
    return;
  }
  if (client.id === room.hostId) {
    room.hostId = [...room.clients.keys()][0]!;
  }
  broadcast(room, roomState(room));
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
