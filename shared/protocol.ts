/**
 * Protocole client ↔ serveur.
 *
 * Un seul fichier de vérité, importé des deux côtés. Grâce au moteur
 * déterministe, il n'y a AUCUNE scène sur le fil : une manche entière tient
 * dans `{ idx, startAt, deadline }` — le reste se reconstruit localement
 * depuis la graine. Un input tient dans quelques octets.
 *
 * Toutes les dates sont sur l'HORLOGE SERVEUR. Le client la reconstruit par
 * ping (voir net/clock.ts) et ne fait jamais autorité sur le temps.
 */

export const PROTOCOL_VERSION = 1;

/** Tolérance réseau : un input reçu jusqu'à 120 ms après l'échéance est
 * accepté si son horodatage client est dans la fenêtre. Un joueur à 80 ms de
 * latence ne doit pas être structurellement désavantagé. */
export const INPUT_TOLERANCE_MS = 120;

/**
 * Plancher absolu d'une manche. En dessous, ce n'est plus un jeu de réflexes,
 * c'est une loterie : ~700 ms suffisent à un humain pour lire et cliquer.
 *
 * Conséquence assumée : en fin de match, les réglages hôte 0.8 et 0.65
 * convergent vers cette même valeur. Le plancher prime sur le réglage.
 */
export const MIN_ROUND_MS = 700;

/**
 * Plafond d'une manche. Le solo a été recalibré de 2400 à 1500 ms parce que
 * l'ouverture lente produisait de l'ennui mesuré — mais en multijoueur
 * l'attente n'est pas vide : on voit les autres se figer, on lit le chat.
 * 2400 ms reste donc tenable ici, et rien ne doit aller au-delà : l'empilement
 * réglage × tension ne réintroduira pas le défaut par la bande.
 */
export const MAX_ROUND_MS = 2400;

/** Pause normale (rien de dramatique). */
export const INTERLUDE_MS = 1100;
/** Vie perdue, pas d'élimination — kill-cam courte. */
export const INTERLUDE_LIFE_MS = 2400;
/** Élimination (lives → 0) — arrêt complet. */
export const INTERLUDE_ELIM_MS = 4200;
/** Duel (≤2 vivants) : apnée, aucune kill-cam. */
export const INTERLUDE_DUEL_MS = 500;
/**
 * Pause AVANT une manche de rotation, pour annoncer la nouvelle règle.
 *
 * Mesuré en soirée de test : environ deux tiers des pertes de vies venaient de
 * rotations que les joueurs n'avaient pas vues. La règle changeait par une
 * ligne de texte en haut à gauche, en pleine vision périphérique, pendant
 * qu'ils balayaient la grille — donc ils mouraient sans savoir que leur
 * contrainte avait changé.
 *
 * On ne peut pas l'annoncer PENDANT la manche : elle est jouée. On allonge donc
 * l'interlude qui la précède, comme on le fait déjà pour une élimination, et
 * on y affiche la nouvelle règle en plein cadre.
 */
export const INTERLUDE_ROTATION_MS = 3400;

/**
 * Fenêtre élargie sur la PREMIÈRE manche après une rotation.
 *
 * Lire un nom de règle ne suffit pas : il faut l'appliquer. La première manche
 * sous une contrainte neuve demande le même effort conscient qu'un débutant, et
 * elle tombait à la vitesse du moment — souvent au plancher, en duel.
 */
export const ROTATION_GRACE_FACTOR = 1.5;

/**
 * Compte à rebours avant la première manche — et seul temps de lecture de la
 * règle unique.
 *
 * Trois secondes, c'était le compte à rebours d'origine, posé avant que le
 * panneau plein cadre n'y affiche la règle et son explication. Playtest du
 * 28/08/2026, rapporté par plusieurs joueurs : « il faudrait pouvoir lire la
 * règle avant » — alors qu'elle EST affichée. Trois secondes suffisent à voir
 * qu'il y a du texte, pas à lire une phrase de quinze mots, la comprendre, et
 * se préparer.
 *
 * Quatre secondes et demie : le temps de lire deux fois. C'est aussi la seule
 * chose qu'un joueur fait pendant ce compte à rebours — il n'y a rien d'autre
 * à l'écran. La rotation en cours de match, elle, garde ses 3400 ms : la règle
 * y est déjà connue, on n'en découvre que l'attribution.
 */
export const COUNTDOWN_MS = 4500;
/** Rotation des règles entre joueurs (défaut salon). */
export const ROTATION_EVERY = 8;
export const START_LIVES = 3;
export const MAX_ROUNDS = 60;
/**
 * Plafond dur : le pool multijoueur compte 11 règles (12 moins LA MAIN
 * GAUCHE, injouable en rotation). À 10 joueurs, chacun garde une règle
 * distincte avec une marge de un. Au-delà, deux joueurs partageraient la
 * même contrainte et la rotation perdrait son sens.
 */
export const MAX_PLAYERS = 10;

/** Nombre de réactions. Les libellés sont une affaire d'interface : le fil
 *  ne transporte qu'un index. */
export const EMOTE_COUNT = 6;
/** Une réaction par joueur et par 1,5 s. Sans compte ni modération possible,
 *  la seule défense contre le déluge est le débit. */
export const EMOTE_COOLDOWN_MS = 1500;

/** Un message tient en une ligne lisible d'un coup d'œil. Au-delà, ce n'est
 *  plus du salon, c'est du forum. */
export const CHAT_MAX_LEN = 140;
/** Environ trois messages par deux secondes, même politique que les emotes :
 *  on ignore en silence, on ne répond jamais « trop vite ». */
export const CHAT_COOLDOWN_MS = 700;

/** Trois mesures minimum avant d'afficher une réaction. En dessous, ce n'est
 *  pas une statistique, c'est une anecdote. */
export const STATS_MIN_SAMPLES = 3;

export interface PlayerStats {
  /** Médiane des temps de première réaction sur les manches RÉUSSIES, en ms.
   *  null tant qu'on a moins de STATS_MIN_SAMPLES mesures. */
  reaction: number | null;
  /** Pièges déjoués — la seule mécanique qui distingue vraiment le jeu. */
  traps: number;
  streak: number;
  bestStreak: number;
}

export const EMPTY_STATS: PlayerStats = { reaction: null, traps: 0, streak: 0, bestStreak: 0 };

/**
 * Réglages décidés par l'hôte, jamais par joueur.
 *
 * Un réglage individuel de vitesse casserait la simultanéité — or c'est elle
 * qui fait le spectacle : on voit l'autre se figer PENDANT qu'on joue.
 */
export interface RoomSettings {
  speed: number;
  lives: number;
  rotationEvery: number;
  /**
   * DUO : les joueurs sont appariés deux à deux et partagent une réserve.
   *
   * Un réglage de salon et non de joueur — on ne choisit pas d'être en duo
   * tout seul. Fixé au lancement : le mode d'un match ne change pas en cours
   * de route, sinon des vies apparaîtraient ou disparaîtraient sous les yeux
   * des joueurs.
   */
  duo: boolean;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  speed: 1,
  lives: 3,
  rotationEvery: 8,
  duo: false,
};
/**
 * Vitesses de salon, du plus lent au plus vif.
 *
 * 1.7 « DÉCOUVERTE » a été ajouté après un test réel : même en « LENT », la
 * fenêtre tombe à 1261 ms à la manche 20 et 976 ms à la manche 30, alors qu'un
 * débutant a besoin de 1000 à 1300 ms tant que la vérification de sa règle
 * unique n'est pas devenue réflexe. « LENT » ne supprimait pas le mur, il le
 * déplaçait de dix manches.
 *
 * Les premières manches ne changent pas : elles sont déjà au plafond
 * `MAX_ROUND_MS`. Le réglage n'agit donc que là où le mur se trouve.
 */
export const SPEED_CHOICES = [1.7, 1.3, 1, 0.8, 0.65] as const;
export const LIVES_CHOICES = [1, 3, 5] as const;
export const ROTATION_CHOICES = [4, 8, 16, 999] as const;

export function sanitizeSettings(raw: unknown): RoomSettings {
  const r = (raw ?? {}) as Partial<RoomSettings>;
  const pick = <T extends number>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  return {
    speed: pick(r.speed, SPEED_CHOICES, 1),
    lives: pick(r.lives, LIVES_CHOICES, 3),
    rotationEvery: pick(r.rotationEvery, ROTATION_CHOICES, 8),
    // `=== true` : un réglage absent ou douteux vaut NON. Basculer un salon en
    // duo par accident diviserait les réserves sans que personne ne l'ait
    // demandé.
    duo: r.duo === true,
  };
}

/** Signature visuelle d'un joueur, dérivée de son identifiant local. */
export interface Glyph {
  shape: "carre" | "rond" | "triangle";
  color: number;
  pattern: number;
}

/* ------------------------------------------------------------------ *
 * Données publiques
 * ------------------------------------------------------------------ */

export interface PlayerPublic {
  id: string;
  name: string;
  ruleId: string;
  lives: number;
  score: number;
  /** hôte du salon : seul lui peut lancer */
  host: boolean;
  /** mort ou arrivé en cours de match : regarde sans jouer */
  spectator: boolean;
  connected: boolean;
  glyph: Glyph;
  /** Première partie : porte une vie de plus, et tout le salon le voit. */
  rookie: boolean;
  /**
   * DUO : l'équipe à laquelle ce joueur appartient.
   *
   * Absent hors duo. Les vies transportées restent celles du JOUEUR, et les
   * deux partenaires affichent donc le même nombre — c'est exactement ce
   * qu'on veut leur faire lire. Ce champ ne sert qu'à les rapprocher à
   * l'écran ; le serveur reste seul juge de la réserve.
   */
  team?: number;
  stats: PlayerStats;
}

export type RoundOutcome =
  | { kind: "survive"; trap: boolean }
  | { kind: "death"; reason: string }
  | { kind: "idle" }; // spectateur ou déjà éliminé

/* ------------------------------------------------------------------ *
 * Client → serveur
 * ------------------------------------------------------------------ */

/**
 * Délai pendant lequel un siège est gardé après une coupure.
 *
 * Les identifiants étaient attribués par connexion : une micro-coupure
 * éliminait donc définitivement, et se reconnecter donnait une identité neuve,
 * donc un siège de spectateur. Sur mobile — bascule d'application, tunnel,
 * changement de cellule — c'est le cas NORMAL, pas le cas rare.
 *
 * 25 s couvre une coupure réelle sans immobiliser un salon : le joueur absent
 * continue de perdre des vies par timeout pendant ce temps, il ne gagne rien
 * à partir.
 */
export const RECONNECT_GRACE_MS = 25_000;

/**
 * Vie supplémentaire pour une première partie.
 *
 * Un nouveau invité par un ami meurt en trois manches devant cinq personnes,
 * et ne revient pas. La vie de plus ne le fait pas gagner — elle lui laisse le
 * temps de comprendre que la règle unique existe.
 *
 * Le statut est ANNONCÉ sur la plaque, et ce n'est pas décoratif : le serveur
 * ne peut pas vérifier qu'un joueur est nouveau (il n'a aucune mémoire entre
 * les salons), donc la seule garantie contre l'abus est que tout le monde le
 * voie. Entre amis, c'est amplement suffisant ; et le jour où le classement
 * comptera vraiment, ce mode-là n'en fera pas partie.
 */
export const ROOKIE_BONUS_LIVES = 1;

export type ClientMsg =
  /** `key` est un identifiant local stable : c'est lui qui permet de
   *  retrouver son siège après une coupure. Absent = joueur éphémère. */
  /**
   * `clavier` : cet appareil peut-il jouer une consigne au clavier ?
   *
   * ABSENT VAUT NON, et ce défaut est structurant. Le serveur n'ouvre le pool
   * clavier que si TOUS les sièges l'annoncent ; un client d'une version
   * antérieure ne connaît pas ce champ, ne l'envoie donc pas, et la table
   * retombe sur le tirage tactile — c'est-à-dire exactement ce que cet ancien
   * client sait reconstruire. Sans ce défaut, il calculerait une manche que le
   * serveur ne juge pas, et l'aperçu contredirait le verdict : le seul défaut
   * tenu pour fatal.
   */
  | {
      t: "hello";
      v: number;
      name: string;
      glyph?: Glyph;
      key?: string;
      rookie?: boolean;
      clavier?: boolean;
    }
  | { t: "create" }
  | { t: "join"; code: string }
  | { t: "leave" }
  | { t: "start" } // hôte uniquement
  | { t: "settings"; settings: Partial<RoomSettings> } // hôte uniquement
  /** Le spectateur choisit l'écran qu'il regarde. Aucune donnée
   *  supplémentaire n'est transmise : la scène étant déterministe, il la
   *  reconstruit lui-même avec la règle du joueur observé. */
  | { t: "watch"; playerId: string }
  | { t: "emote"; k: number }
  | { t: "chat"; text: string }
  | { t: "kick"; playerId: string }
  | { t: "ping"; sent: number }
  | {
      t: "input";
      round: number;
      /** horodatage CLIENT projeté sur l'horloge serveur */
      at: number;
      action:
        | { k: "c"; i: number | null }
        | { k: "k"; key: string }
        | { k: "r"; key: string };
    };

/* ------------------------------------------------------------------ *
 * Serveur → client
 * ------------------------------------------------------------------ */

export type ServerMsg =
  | { t: "welcome"; id: string }
  | { t: "pong"; sent: number; serverNow: number }
  | { t: "error"; code: "room_full" | "room_unknown" | "bad_version" | "not_host" | "in_match" | "kicked"; detail?: string }
  | { t: "room"; code: string; players: PlayerPublic[]; inMatch: boolean; settings: RoomSettings }
  | {
      t: "match_start";
      seed: number;
      /** attribution initiale des règles, par joueur */
      rules: Record<string, string>;
      firstRoundAt: number;
      settings: RoomSettings;
      /**
       * Le pool CLAVIER est-il ouvert pour ce match ?
       *
       * Vrai seulement si tous les sièges ont annoncé un clavier. Fixé une
       * fois pour toutes au lancement, jamais recalculé en cours de match :
       * quelqu'un qui arrive après le départ devient spectateur, donc
       * l'effectif assis ne bouge plus, donc le tirage ne peut pas changer
       * sous les pieds des joueurs.
       *
       * Le client le REÇOIT, il ne le déduit pas de la liste des joueurs. Une
       * déduction locale divergerait le temps qu'un départ se propage, et une
       * divergence sur le tirage, c'est un aperçu qui contredit le verdict.
       */
      clavier: boolean;
    }
  | {
      t: "round";
      idx: number;
      startAt: number;
      deadline: number;
      /** présent uniquement quand la rotation vient d'avoir lieu */
      rules?: Record<string, string>;
    }
  | {
      t: "verdict";
      idx: number;
      outcomes: Record<string, RoundOutcome>;
      players: PlayerPublic[];
      nextRoundAt: number | null;
      /**
       * Attribution des règles de la manche SUIVANTE, présente uniquement
       * quand une rotation s'y produit.
       *
       * Envoyée avec le verdict et non avec la manche : il faut pouvoir
       * annoncer le changement PENDANT la pause, avant que le joueur ait à
       * jouer sous une contrainte qu'il ne connaît pas encore.
       */
      nextRules?: Record<string, string>;
    }
  | {
      t: "match_end";
      winnerId: string | null;
      players: PlayerPublic[];
    }
  | { t: "emote"; playerId: string; k: number }
  | { t: "chat"; playerId: string; name: string; text: string };

export const encode = (m: ClientMsg | ServerMsg): string => JSON.stringify(m);

export function decodeClient(raw: unknown): ClientMsg | null {
  try {
    const m = JSON.parse(String(raw)) as ClientMsg;
    return typeof m === "object" && m !== null && typeof m.t === "string" ? m : null;
  } catch {
    return null;
  }
}

export function decodeServer(raw: unknown): ServerMsg | null {
  try {
    const m = JSON.parse(String(raw)) as ServerMsg;
    return typeof m === "object" && m !== null && typeof m.t === "string" ? m : null;
  } catch {
    return null;
  }
}
