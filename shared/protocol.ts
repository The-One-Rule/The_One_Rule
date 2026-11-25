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
 * Plafond d'une manche.
 *
 * ⚠️ **REMONTÉ DE 2400 À 4000 AVEC LA COURBE SOLO, ET IL LE FALLAIT.** La
 * courbe de `windowMs` ouvre désormais à 4000 ms au lieu de 1500 (directive de
 * Pierre : « diminue vraiment la vitesse en général … 0,7 minimum tout mode
 * confondu »). Laisser le plafond à 2400 aurait ÉCRASÉ toute la première moitié
 * d'un match contre lui.
 *
 * Et ce n'était pas qu'une question de rythme : **deux mécaniques devenaient
 * inertes**, toutes deux attrapées par `tests/multi.test.ts`.
 *
 *   · la GRÂCE DE ROTATION (× 1,5) ne se voyait plus — la manche qui suit un
 *     changement de règle doit respirer, or elle butait au même plafond que la
 *     précédente : 2400 contre 2400 ;
 *   · L'ACCÉLÉRATION (× 0,7 sur la fenêtre personnelle) ne se voyait plus non
 *     plus, pour la même raison. Une règle inerte est un avantage gratuit et
 *     invisible — c'est la décision n°1, et elle a déjà coûté trois bugs.
 *
 * L'argument d'origine tient toujours, il change seulement d'échelle : en
 * multijoueur l'attente n'est pas vide — on voit les autres se figer, on lit le
 * chat. Et la tension resserre vite : mesurée, la manche dure 4000 ms à
 * l'ouverture, 2750 à la dixième, 1869 à la vingtième et 700 au-delà de la
 * soixantième.
 *
 * ⚠️ **LE FRONT ET LES SALONS DOIVENT ÊTRE DÉPLOYÉS ENSEMBLE.** C'est la dette
 * du §9, et ce changement la rend aiguë : `windowMs` sert au client à
 * reconstruire les scènes et au serveur à borner les manches. Un client resté
 * sur le bundle de la veille lirait des fenêtres qui ne sont plus celles que le
 * serveur applique.
 */
export const MAX_ROUND_MS = 4000;

/**
 * Pause apres une manche ORDINAIRE — personne n'est mort.
 *
 * ⚠️ ELLE ETAIT A 1100, ET C'ETAIT DU TEMPS MORT PUR.
 *
 * RAPPORTE : « dans le multijoueur il y a un delai avant chaque manche, c'est
 * desagreable ». Verifie dans le client : il ne montre quelque chose que
 * `si pauseMs > 1800` — kill-cam et panneau de mort — ou en duel a
 * `pauseMs <= 800`. Entre les deux, c'est-a-dire exactement a 1100, l'ecran
 * n'affiche RIEN. Le joueur attendait 1,1 s devant une scene vide, apres
 * chaque manche ou personne n'etait tombe, soit la grande majorite d'entre
 * elles.
 *
 * 700, pour trois raisons qui tiennent ensemble : c'est sous le seuil de 800
 * du client, donc le silence est voulu et non subi ; les plaques suffisent a
 * dire ce qui vient de se passer, exactement comme en duel ; et c'est la
 * valeur de `MIN_ROUND_MS`, que ce depot tient deja pour le plus court delai
 * qu'un humain enregistre.
 *
 * Les pauses qui PORTENT quelque chose ne bougent pas : une vie perdue garde
 * ses 2400, une elimination ses 4200, une rotation ses 3400. Elles ne sont pas
 * du temps mort, elles sont le spectacle.
 */
export const INTERLUDE_MS = 700;
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

/**
 * Curseurs coop : 20 Hz par siège. Même doctrine que les emotes — le
 * surplus est du silence, pas une erreur. Le serveur RELAYE, il ne juge pas.
 */
export const CURSOR_COOLDOWN_MS = 50;

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
  /**
   * Morts causees par SA PROPRE regle unique — la moitie non copiable du jeu.
   *
   * ⚠️ AJOUTER CE CHAMP N'INCREMENTE PAS `PROTOCOL_VERSION`, meme doctrine que
   * `tok` : la version est comparee par egalite stricte et un increment
   * deconnecterait au deploiement tous les onglets ouverts. Un client anterieur
   * ignore simplement le champ, et `EMPTY_STATS` le pose a zero.
   */
  rulebreaks: number;
}

export const EMPTY_STATS: PlayerStats = {
  reaction: null,
  traps: 0,
  streak: 0,
  bestStreak: 0,
  rulebreaks: 0,
};

/**
 * Réglages décidés par l'hôte, jamais par joueur.
 *
 * Un réglage individuel de vitesse casserait la simultanéité — or c'est elle
 * qui fait le spectacle : on voit l'autre se figer PENDANT qu'on joue.
 */
export type ModeSalon = "classique" | "duo" | "imposteur" | "coop";

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
  /**
   * Mode du salon. FACULTATIF : absent vaut « classique ».
   *
   * ⚠️ AJOUTER CE CHAMP N'INCRÉMENTE PAS `PROTOCOL_VERSION`. Un client
   * ancien n'envoie que `duo` ; `sanitizeSettings` en déduit alors `duo`.
   */
  mode?: ModeSalon;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  speed: 1,
  lives: 3,
  rotationEvery: 8,
  duo: false,
  // `mode` est omis : absent = classique. Un client ancien qui n'envoie
  // que `{ duo: true }` ne se heurte pas à un mode déjà posé.
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

export function lireMode(r: Partial<RoomSettings>): ModeSalon {
  if (
    r.mode === "classique" ||
    r.mode === "duo" ||
    r.mode === "imposteur" ||
    r.mode === "coop"
  ) {
    return r.mode;
  }
  // Absent, undefined, valeur inconnue : un client ancien n'envoie que `duo`.
  if (r.duo === true) return "duo";
  return "classique";
}

export function sanitizeSettings(raw: unknown): RoomSettings {
  const r = (raw ?? {}) as Partial<RoomSettings>;
  const pick = <T extends number>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  const mode = lireMode(r);
  return {
    speed: pick(r.speed, SPEED_CHOICES, 1),
    lives: pick(r.lives, LIVES_CHOICES, 3),
    rotationEvery: pick(r.rotationEvery, ROTATION_CHOICES, 8),
    mode,
    // Les modes ne se cumulent jamais : duo force le booléen à true, tout
    // le reste (classique, imposteur, coop) le force à false. Un client
    // ancien qui n'envoie que `{ duo: true }` reste en duo — `lireMode`
    // le déduit avant. `=== true` reste la doctrine pour un booléen orphelin.
    duo: mode === "duo",
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
  /**
   * LA CARTE DE VISITE — l'identifiant d'une règle gagnée, que le joueur a
   * choisie pour le représenter (`shared/profil.ts`). Absente chez un client
   * ancien ou chez qui n'en a pas choisi : on retombe sur le signe.
   *
   * La PHOTO ne voyage PAS ici : `PlayerPublic` repart vers tout le salon à
   * chaque changement d'état, et dix photos de plusieurs kilo-octets à chaque
   * manche pèseraient sur un téléphone. Elle a son message, `photos`, envoyé
   * une fois.
   */
  carte?: string;
  stats: PlayerStats;
}

export type RoundOutcome =
  | { kind: "survive"; trap: boolean }
  | { kind: "death"; reason: string }
  | { kind: "idle" }; // spectateur ou déjà éliminé

/**
 * Un siège, une manche, après coup.
 *
 * `aAgit` est le binaire AGI / RIEN. `outcome` porte le motif pour le
 * détail d'un siège, une fois les preuves fermées — pas pendant les
 * dix manches, pas en tampon plein cadre.
 *
 * Aucune coordonnée, aucune liste d'entités : la scène se reconstruit
 * (seed + idx + règle commune + pool).
 */
export type EntreeTour = {
  aAgit: boolean;
  outcome: RoundOutcome;
};

/** Une manche du journal imposteur. `idx` 0..9. Sièges seulement. */
export type TourJournal = {
  idx: number;
  sieges: Record<string, EntreeTour>;
};

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
  /**
   * `tok` : le jeton de compte, s'il y en a un.
   *
   * ⚠️ AJOUTER CE CHAMP NE DOIT PAS INCRÉMENTER `PROTOCOL_VERSION`.
   * `server/index.ts` compare la version par ÉGALITÉ STRICTE et ferme la
   * socket en cas d'écart : un incrément déconnecterait au déploiement tous
   * les onglets ouverts et tous les clients en cache, pour un champ
   * facultatif que les anciens clients n'ont aucun besoin de connaître.
   *
   * ABSENT VAUT ANONYME — exactement la doctrine de `clavier` ci-dessus, et
   * pour une raison plus forte encore : un jeton invalide, périmé ou
   * impossible à vérifier retombe lui aussi sur « anonyme, et on joue ». Le
   * compte est une couche AU-DESSUS de l'identité, jamais un préalable. Rien
   * dans un salon ne doit distinguer un siège avec compte d'un siège sans.
   */
  | {
      t: "hello";
      v: number;
      name: string;
      glyph?: Glyph;
      key?: string;
      rookie?: boolean;
      clavier?: boolean;
      tok?: string;
      /**
       * La version du jeu de consignes que ce client sait reconstruire
       * (`CONSIGNES_VERSION`). ABSENT VAUT 1 — le catalogue d'origine — pour
       * la même raison que `clavier` : un client ancien ne l'envoie pas, et
       * sa table retombe sur ce qu'il sait jouer.
       */
      consignes?: number;
      /**
       * Ce client comprend `remplace` et ne reprend PAS sa place tout seul
       * après l'avoir reçu. Absent vaut non : le serveur ne remplace alors
       * jamais une connexion encore ouverte, sinon deux vieux onglets du même
       * navigateur se renverraient le siège en boucle.
       */
      reprise?: boolean;
    }
  | { t: "create" }
  | { t: "join"; code: string }
  /**
   * PARTIE RAPIDE : une table publique, sans code (`server/rapide.ts`).
   *
   * ⚠️ AJOUTER CE MESSAGE N'INCRÉMENTE PAS `PROTOCOL_VERSION`. Un serveur
   * ancien n'a pas ce cas et l'ignore : le client ne reçoit alors aucun
   * `room`, et c'est à lui de dire, après quelques secondes, que la partie
   * rapide n'est pas encore disponible.
   */
  | { t: "quick" }
  | { t: "leave" }
  | { t: "start" } // hôte uniquement
  | { t: "settings"; settings: Partial<RoomSettings> } // hôte uniquement
  /** Le spectateur choisit l'écran qu'il regarde. Aucune donnée
   *  supplémentaire n'est transmise : la scène étant déterministe, il la
   *  reconstruit lui-même avec la règle du joueur observé. */
  | { t: "watch"; playerId: string }
  | { t: "emote"; k: number }
  /**
   * Position du pointeur, en coordonnées de CHAMP. FACULTATIF.
   *
   * ⚠️ AJOUTER CE MESSAGE N'INCRÉMENTE PAS `PROTOCOL_VERSION`. Un serveur
   * ancien ignore le cas. CE N'EST PAS un `t: "input"` : aucun verdict
   * ne s'en sert. Hors match, hors coop, ou siège away : ignoré.
   */
  | { t: "cursor"; x: number; y: number }
  | { t: "chat"; text: string }
  | { t: "kick"; playerId: string }
  | { t: "ping"; sent: number }
  /**
   * Le profil du joueur — carte de visite et photo. FACULTATIF, envoyé après
   * le `welcome` et à chaque changement. Un serveur ancien ignore le cas, et
   * un champ invalide est ignoré sans erreur (`shared/profil.ts`).
   * `PROTOCOL_VERSION` ne bouge pas : doctrine de `cursor` et de `tok`.
   */
  | { t: "profil"; carte?: string; photo?: string }
  /**
   * Une voix, pendant l'observation. FACULTATIF.
   *
   * ⚠️ AJOUTER CE MESSAGE N'INCRÉMENTE PAS `PROTOCOL_VERSION`. Un serveur
   * ancien ignore le cas. Une voix par siège, un second vote est ignoré
   * en silence — comme une emote hors débit.
   */
  | { t: "vote"; playerId: string }
  | {
      t: "input";
      round: number;
      /** horodatage CLIENT projeté sur l'horloge serveur */
      at: number;
      action:
        | { k: "c"; i: number | null }
        | { k: "k"; key: string }
        | { k: "r"; key: string }
        /**
         * Le LEVER du doigt, sur la pièce `i` (ou dans le vide). N'a de sens
         * que pour MAINTENIR et GLISSER, que seuls les salons en version de
         * consignes ≥ 3 tirent : un serveur ancien ne le recevra donc jamais
         * d'une manche qu'il ne sait pas juger. `PROTOCOL_VERSION` ne bouge pas.
         */
        | { k: "l"; i: number | null };
    };

/* ------------------------------------------------------------------ *
 * Serveur → client
 * ------------------------------------------------------------------ */

export type ServerMsg =
  | { t: "welcome"; id: string }
  /**
   * Les photos du salon, par identifiant de joueur. À l'arrivée, la carte
   * complète ; à un changement, la seule entrée qui bouge. Une chaîne VIDE
   * retire la photo. Un client ancien ignore le message.
   */
  | { t: "photos"; photos: Record<string, string> }
  | { t: "pong"; sent: number; serverNow: number }
  | {
      t: "error";
      code:
        | "room_full"
        | "room_unknown"
        | "bad_version"
        | "not_host"
        | "in_match"
        | "kicked"
        /**
         * Ce siège vient d'être repris par une connexion plus récente de la même
         * clé (un réseau qui change, un second onglet). Absent des clients
         * anciens, qui l'ignorent : leur socket se ferme quand même.
         */
        | "remplace"
        /** Imposteur [4, 8] ou coop [4, 6] : l'effectif assis n'y est pas. Absent des clients anciens. */
        | "need_players";
      detail?: string;
    }
  /**
   * Rôle privé — UNIQUEMENT à l'imposteur.
   *
   * Absent = villageois. Un client ancien ignore le message (branche default)
   * et joue donc le classique : la règle publique qu'il a reçue.
   */
  | { t: "role"; imposteur: true }
  /**
   * Premier geste d'un siège sur cette manche. FACULTATIF.
   *
   * ⚠️ AJOUTER CE MESSAGE N'INCRÉMENTE PAS `PROTOCOL_VERSION`. Un client
   * ancien n'a pas ce cas dans son switch : il l'ignore, et c'est le bon
   * défaut — absent = personne n'a encore agi à l'écran.
   *
   * Émis UNIQUEMENT en mode imposteur, au moment où `firstInputMs` passe
   * de null à un nombre — pas à chaque clic d'une séquence. Ne porte ni
   * reason, ni trap, ni coordonnées : juste que CE siège a agi, sur CETTE
   * manche. En classique / duo, on n'émet rien.
   */
  | { t: "acted"; idx: number; playerId: string }
  /**
   * Un clic coop a été jugé. FACULTATIF.
   *
   * ⚠️ AJOUTER CE MESSAGE N'INCRÉMENTE PAS `PROTOCOL_VERSION`. Un client
   * ancien ignore le cas, et c'est le bon défaut — absent = la vague
   * n'a pas encore bougé à l'écran.
   *
   * `pris: true` : l'entité est consumed, score +need. `pris: false` : le
   * cliqueur a enfreint SA règle, vie commune −1, l'entité RESTE.
   * Jamais de coordonnées : le client reconstruit l'entité par index.
   */
  | {
      t: "coop_clic";
      idx: number;
      i: number;
      pris: boolean;
      score: number;
      vies: number;
    }
  /**
   * Avancement décoratif d'un rassemblement. FACULTATIF.
   *
   * ⚠️ AJOUTER CE MESSAGE N'INCRÉMENTE PAS `PROTOCOL_VERSION`. Un client
   * ancien ignore le cas. N'entre JAMAIS dans un verdict : le serveur
   * clôt par `coop_clic` (pris) ou par `n: 0` (échec, pièce encore là).
   *
   * `idx` est facultatif au sens du protocole (absent = le client
   * applique quand même s'il n'a qu'une vague). On l'envoie pour
   * ignorer un retard d'une vague précédente.
   */
  | { t: "charge"; i: number; n: number; need: number; idx?: number }
  /**
   * Journal des dix manches. FACULTATIF. Une fois, à la fin.
   *
   * ⚠️ AJOUTER CE MESSAGE N'INCRÉMENTE PAS `PROTOCOL_VERSION`. Un client
   * ancien ignore le cas, et c'est le bon défaut. Ne pas l'inclure dans
   * chaque verdict : les preuves voyagent quand elles sont fermées.
   */
  | { t: "journal"; tours: TourJournal[] }
  /**
   * Ouvre le temps d'observation. FACULTATIF.
   *
   * Pas un setTimeout de reprise, pas de manche 11. Le client ne
   * reprend pas tout seul (décision n°9) : c'est ce message qui ouvre
   * la phase. Les scènes se commandent côté client (précédent / suivant)
   * — MatchLogic n'a pas d'horloge interne.
   */
  | { t: "observe" }
  /**
   * Issue du vote. FACULTATIF. Une fois, après l'unique tour.
   *
   * ⚠️ AJOUTER CE MESSAGE N'INCRÉMENTE PAS `PROTOCOL_VERSION`. Un client
   * ancien ignore le cas. `imposteurId` n'était jamais public avant : les
   * preuves sont fermées, le nommer ici est le dénouement, pas une fuite.
   */
  | {
      t: "vote_result";
      accuseId: string | null;
      imposteurId: string;
      vainqueur: "imposteur" | "village";
    }
  | {
      t: "room";
      code: string;
      players: PlayerPublic[];
      inMatch: boolean;
      settings: RoomSettings;
      /**
       * Table PUBLIQUE (partie rapide) : personne ne règle ni ne lance, elle
       * part toute seule. ABSENT VAUT NON — un serveur ancien n'en a pas.
       */
      public?: boolean;
      /** L'heure SERVEUR du départ automatique, `null` quand il manque du monde. */
      autoAt?: number | null;
    }
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
      /**
       * La version du jeu de consignes de ce match — le minimum du serveur et
       * de chaque siège. ABSENTE (serveur ancien) VAUT 1 : le client retombe
       * alors sur le catalogue que ce serveur sait juger.
       */
      consignes?: number;
    }
  | {
      t: "round";
      idx: number;
      startAt: number;
      deadline: number;
      /** présent uniquement quand la rotation vient d'avoir lieu */
      rules?: Record<string, string>;
      /**
       * Le tirage de la scène commune (`draftShared`), choisi par le serveur
       * pour que personne n'enchaîne deux pièges. FACULTATIF : absent = 0,
       * la manche d'hier. Seulement en consignes ≥ 4, donc seulement vers des
       * clients qui savent le lire.
       */
      tirage?: number;
      /**
       * Indices déjà consumed (mode coop). FACULTATIF.
       *
       * Absent = aucun. Un client ancien ignore le champ. Sert surtout
       * à qui reprend une vague en cours : sans ça il verrait un plateau
       * plein pendant que les autres voient un plateau entamé.
       */
      consumed?: number[];
    }
  | {
      t: "verdict";
      idx: number;
      outcomes: Record<string, RoundOutcome>;
      players: PlayerPublic[];
      nextRoundAt: number | null;
      /**
       * Attribution des règles de la manche SUIVANTE, présente uniquement
       * quand une rotation s'y produit — ou quand une RANCUNE change de
       * cible (`rancune:rond` → `rancune:carre`, consignes ≥ 5).
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
      /**
       * Coop : le score du groupe. FACULTATIF — absent hors coop, et
       * un client ancien l'ignore. N'INCRÉMENTE PAS PROTOCOL_VERSION.
       */
      score?: number;
      /**
       * Coop : le groupe a tenu les 12 vagues. Absent = KO ou pas coop.
       * `winnerId` reste null : il n'y a pas de vainqueur individuel,
       * et le client ne doit PAS lire ça comme une égalité.
       */
      tenu?: boolean;
    }
  | { t: "emote"; playerId: string; k: number }
  | { t: "chat"; playerId: string; name: string; text: string }
  /**
   * Instantané des curseurs coop. FACULTATIF.
   *
   * ⚠️ AJOUTER CE MESSAGE N'INCRÉMENTE PAS `PROTOCOL_VERSION`. Un client
   * ancien ignore le cas. `pos` est la table complète des sièges qui ont
   * envoyé une position (pas un delta) : un siège absent a quitté ou
   * est away. `at` est l'horloge serveur. N'entre JAMAIS dans un verdict.
   */
  | { t: "cursors"; at: number; pos: Record<string, { x: number; y: number }> };

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
