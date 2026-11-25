/**
 * Contrats du moteur.
 *
 * Règle structurante : ce dossier est PUR.
 * Aucun import DOM, aucun Date.now(), aucun Math.random().
 * Tout ce qui varie entre deux exécutions arrive en paramètre (Rng, timestamps).
 * Conséquence : le moteur est testable en Node et rejouable à l'identique
 * côté serveur — c'est ce qui rendra la validation anti-triche possible.
 */

export type Rng = () => number;

export type ColorId = "garance" | "azur" | "jade" | "ambre";
export type ShapeId = "carre" | "rond" | "triangle";
export type SizeId = "S" | "M" | "L";

export const COLOR_IDS: ColorId[] = ["garance", "azur", "jade", "ambre"];
export const SHAPE_IDS: ShapeId[] = ["carre", "rond", "triangle"];
/**
 * Trois marches, rapport constant de 0,71 (diamètres 60 / 84 / 118).
 * L'écart doit se juger d'un coup d'œil : LE COLOSSE se joue sur la seule
 * comparaison de taille.
 */
export const RADIUS: Record<SizeId, number> = { S: 30, M: 42, L: 59 };

/** Repère logique de la scène. Le rendu s'y adapte, la logique n'en sort jamais. */
export const FIELD_W = 1000;
export const FIELD_H = 420;

export interface EntitySpec {
  shape: ShapeId;
  color: ColorId;
  size: SizeId;
  moving: boolean;
}

export interface Entity extends EntitySpec {
  idx: number;
  r: number;
  /** origine (position au repos) */
  ox: number;
  oy: number;
  /** position courante, animée par le renderer pour les formes mobiles */
  x: number;
  y: number;
  phase: number;
}

/* ------------------------------------------------------------------ *
 * Ce que la consigne demande.
 *
 * `Want` est la forme AUTEUR : ce qu'écrit celui qui crée une consigne.
 * Elle est ensuite compilée en `Step[]` par round.ts, ce qui unifie la
 * résolution (une action simple, une séquence, ou une action à répéter
 * suivent exactement le même chemin).
 * ------------------------------------------------------------------ */

export type Want =
  | { kind: "click"; idx: number }
  | { kind: "clickAny" }
  | { kind: "clickAnyExcept"; color: ColorId }
  | {
      kind: "key";
      key: string;
      /**
       * Une SECONDE touche acceptee, identique pour tout le monde.
       *
       * « TAPE L'INITIALE DE LA COULEUR » juge la premiere lettre du nom
       * FRANCAIS : V pour VERT, J pour JAUNE. Un anglophone tape G et Y, et
       * echoue une manche sur deux — la traduction rendait la consigne
       * injouable au lieu de la rendre lisible.
       *
       * Les trois issues possibles etaient : exclure la consigne du pool
       * anglais (mais le run du jour ne serait plus identique pour tout le
       * monde, decision n°11), faire dependre le jugement de la langue (mais
       * client et serveur divergeraient — le seul defaut tenu pour fatal), ou
       * accepter les DEUX lettres pour tous. C'est la troisieme : elle est
       * deterministe, identique des deux cotes puisque `resolve` est partage,
       * et elle ne scinde rien.
       *
       * ⚠️ Elle a un cout assume : sur VERT et JAUNE, deux lettres passent au
       * lieu d'une. ROUGE et BLEU sont inchanges (R et B dans les deux
       * langues). La consigne devient donc marginalement plus indulgente sur
       * la moitie des couleurs, pour tout le monde.
       */
      keyAlt?: string;
    }
  | { kind: "sequence"; idxs: number[] }
  /** MAINTENIR : appuyer sur la pièce et ne lever qu'après `HOLD_MS`. */
  | { kind: "hold"; idx: number }
  /** GLISSER : appuyer sur `from`, lever sur `to`. */
  | { kind: "drag"; from: number; to: number }
  | { kind: "none" };

export type Step =
  | { kind: "click"; idx: number }
  /**
   * Un appui TENU sur `idx`, validé au lever après `ms`.
   *
   * L'appui est un `click` comme un autre — il arrive sur le fil et devant
   * les règles exactement comme aujourd'hui — et c'est le LEVER (`lift`) qui
   * conclut. Deux actions, jugées chacune à son instant, des deux côtés.
   */
  | { kind: "hold"; idx: number; ms: number }
  /** Le lever d'un glisser : il doit tomber sur `idx`. */
  | { kind: "drop"; idx: number }
  | { kind: "clickAny" }
  | { kind: "clickAnyExcept"; color: ColorId }
  | {
      kind: "key";
      key: string;
      /**
       * Une SECONDE touche acceptee, identique pour tout le monde.
       *
       * « TAPE L'INITIALE DE LA COULEUR » juge la premiere lettre du nom
       * FRANCAIS : V pour VERT, J pour JAUNE. Un anglophone tape G et Y, et
       * echoue une manche sur deux — la traduction rendait la consigne
       * injouable au lieu de la rendre lisible.
       *
       * Les trois issues possibles etaient : exclure la consigne du pool
       * anglais (mais le run du jour ne serait plus identique pour tout le
       * monde, decision n°11), faire dependre le jugement de la langue (mais
       * client et serveur divergeraient — le seul defaut tenu pour fatal), ou
       * accepter les DEUX lettres pour tous. C'est la troisieme : elle est
       * deterministe, identique des deux cotes puisque `resolve` est partage,
       * et elle ne scinde rien.
       *
       * ⚠️ Elle a un cout assume : sur VERT et JAUNE, deux lettres passent au
       * lieu d'une. ROUGE et BLEU sont inchanges (R et B dans les deux
       * langues). La consigne devient donc marginalement plus indulgente sur
       * la moitie des couleurs, pour tout le monde.
       */
      keyAlt?: string;
    };

export type Action =
  | { kind: "click"; ent: Entity | null; x: number; y: number }
  | {
      kind: "key";
      key: string;
      /**
       * Une SECONDE touche acceptee, identique pour tout le monde.
       *
       * « TAPE L'INITIALE DE LA COULEUR » juge la premiere lettre du nom
       * FRANCAIS : V pour VERT, J pour JAUNE. Un anglophone tape G et Y, et
       * echoue une manche sur deux — la traduction rendait la consigne
       * injouable au lieu de la rendre lisible.
       *
       * Les trois issues possibles etaient : exclure la consigne du pool
       * anglais (mais le run du jour ne serait plus identique pour tout le
       * monde, decision n°11), faire dependre le jugement de la langue (mais
       * client et serveur divergeraient — le seul defaut tenu pour fatal), ou
       * accepter les DEUX lettres pour tous. C'est la troisieme : elle est
       * deterministe, identique des deux cotes puisque `resolve` est partage,
       * et elle ne scinde rien.
       *
       * ⚠️ Elle a un cout assume : sur VERT et JAUNE, deux lettres passent au
       * lieu d'une. ROUGE et BLEU sont inchanges (R et B dans les deux
       * langues). La consigne devient donc marginalement plus indulgente sur
       * la moitie des couleurs, pour tout le monde.
       */
      keyAlt?: string;
    }
  | { kind: "release"; key: string }
  /**
   * Le doigt (ou le bouton) se LÈVE. N'est une réponse que pour MAINTENIR et
   * GLISSER ; partout ailleurs il est ignoré, comme un relâchement de touche.
   */
  | { kind: "lift"; ent: Entity | null; x: number; y: number };

/**
 * La consigne, sous forme STRUCTUREE.
 *
 * Le moteur n'ecrit pas une phrase, il decrit ce qu'il demande : un verbe et
 * ses operandes. C'est l'affichage qui compose la phrase, donc dans la langue
 * du joueur.
 *
 * Pourquoi ca ne pouvait pas rester une chaine : la consigne change toutes les
 * deux secondes et la fenetre de decision fait 760 a 1500 ms. Un anglophone
 * qui passait par la traduction automatique du navigateur recevait le texte
 * APRES une bonne partie de sa fenetre — a chaque manche. Rapporte par trois
 * playtesters sur trois. Ce n'est pas un probleme de vitesse, c'est une
 * incompatibilite de structure : Chrome retraduit les noeuds mutes de facon
 * asynchrone, et ce noeud-ci mute a chaque manche.
 *
 * ⚠️ `text` RESTE le francais canonique. LE MENTEUR compare des textes pour
 * emprunter une phrase plausible a une autre consigne, et plusieurs tests s'y
 * adossent. `tests/consignes.test.ts` exige que composer `phrase` en francais
 * redonne EXACTEMENT `text` : une seule verite, verifiee, deux ecritures.
 */
export interface Phrase {
  cle: string;
  couleur?: ColorId;
  couleur2?: ColorId;
  forme?: ShapeId;
  lettre?: string;
}

/** Ce qu'une consigne produit. Volontairement minimal. */
export interface RoundDraft {
  text: string;
  /** La meme consigne, structuree — voir `Phrase`. */
  phrase?: Phrase;
  /** Sous-titre structure, meme principe. */
  sousPhrase?: string;
  sub?: string;
  /** grand symbole affiché à la place du texte (lettre à recopier, flèche…) */
  glyph?: string;
  specs: EntitySpec[];
  want: Want;
  /**
   * Consignes positionnelles ("le plus à gauche") : la position n'existe
   * qu'après le placement, donc la cible est résolue après coup.
   * Prend le pas sur `want` quand il est fourni.
   */
  wantFrom?: (ents: Entity[]) => Want;
  /** couleur nommée dans le texte — utilisée par LE DALTONIEN */
  colorWord?: ColorId;
}

export interface Instruction {
  id: string;
  /** niveau à partir duquel la consigne peut sortir */
  minLevel: number;
  /** pondération du tirage */
  weight: number;
  /**
   * Jouable au doigt seul.
   *
   * Une consigne clavier est strictement impossible sur téléphone : elle ne
   * doit jamais entrer dans le tirage tactile, sinon le joueur mobile perd
   * sur une manche qu'il ne pouvait pas gagner.
   */
  touch: boolean;
  gen(rng: Rng, level: number): RoundDraft;
}

/** Une manche assemblée, prête à jouer. */
export interface Round {
  instructionId: string;
  text: string;
  /** La consigne structuree, composee a l'affichage. Voir `Phrase`. */
  phrase?: Phrase;
  sousPhrase?: string;
  sub?: string;
  glyph?: string;
  colorWord?: ColorId;
  ents: Entity[];
  steps: Step[];
  /** true = la consigne d'origine violait la règle unique : ne rien faire */
  trap: boolean;
  /** ce qui était demandé avant la bascule en piège */
  originalWant?: Want;
  durationMs: number;

  /* --- déformations appliquées par la règle unique --- */
  /** texte mensonger affiché avant `revealAtMs` (LE MENTEUR) */
  falseText?: string;
  revealAtMs?: number;
  /** la consigne disparaît après ce délai (L'ÉCLAIR) */
  hideTextAtMs?: number;
  /** couleur d'affichage du mot de couleur, volontairement fausse (LE DALTONIEN) */
  inkColor?: ColorId;
  /**
   * La pièce que la consigne DÉSIGNE en toutes lettres, quand la règle veut
   * qu'on fasse autre chose (LE MIROIR, L'INSOUMIS). La toucher tue, avec le
   * motif de la règle et non un « mauvaise cible » anonyme.
   */
  leurre?: number;
  /** La touche que la consigne nomme, quand LE MIROIR en demande une autre. */
  leurreTouche?: string;
  /** L'INSOUMIS : la consigne est écrite en rouge, il faut faire le contraire. */
  insoumise?: true;
  /** LE GONG : un gong sonne à l'ouverture de la manche — ne rien faire. */
  gong?: true;
}

export interface JudgeContext {
  round: Round;
  elapsedMs: number;
}

/**
 * Une règle unique agit par trois leviers, cumulables :
 *  - forbids : ce round est-il un piège ? (la consigne violerait la règle)
 *  - judge   : cette action enfreint-elle la règle ? (motif de mort, ou null)
 *  - transform : déformation de la présentation ou de la difficulté
 */
/** Un rectangle interdit, en coordonnées de terrain. */
export interface ZoneRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface OneRule {
  id: string;
  name: string;
  brief: string;
  /** true si la règle peut piéger — sert à l'équilibrage et aux tests */
  traps: boolean;
  forbids(want: Want, ents: Entity[]): boolean;
  judge(action: Action, ctx: JudgeContext): string | null;
  transform?(round: Round, rng: Rng, level: number): Round;
  /** touche qui doit rester enfoncée toute la partie */
  watchRelease?: string;
  /**
   * Zones interdites à AFFICHER — une règle spatiale invisible serait injuste.
   *
   * Une LISTE de rectangles, et non plus une bande unique : LES ANGLES en
   * demande quatre. Purement décoratif — les `judge` décident sur la géométrie,
   * jamais sur ce champ — donc l'élargir ne peut rien changer à un verdict.
   */
  zone?: readonly ZoneRect[];
}

export type Outcome =
  | { kind: "pending" }
  | { kind: "survive"; trap: boolean }
  | { kind: "death"; cause: "macro" | "wrong" | "timeout"; reason: string };

/** Avancement dans les steps de la manche courante. */
export interface RoundProgress {
  step: number;
  /** MAINTENIR : l'instant de l'appui sur l'étape en cours, s'il a eu lieu. */
  holdAt?: number;
}
