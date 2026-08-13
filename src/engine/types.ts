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
  | { kind: "key"; key: string }
  | { kind: "sequence"; idxs: number[] }
  | { kind: "none" };

export type Step =
  | { kind: "click"; idx: number }
  | { kind: "clickAny" }
  | { kind: "clickAnyExcept"; color: ColorId }
  | { kind: "key"; key: string };

export type Action =
  | { kind: "click"; ent: Entity | null; x: number; y: number }
  | { kind: "key"; key: string }
  | { kind: "release"; key: string };

/** Ce qu'une consigne produit. Volontairement minimal. */
export interface RoundDraft {
  text: string;
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
  /** bande interdite à afficher : une règle spatiale doit être visible pour être juste */
  zone?: { x0: number; x1: number };
}

export type Outcome =
  | { kind: "pending" }
  | { kind: "survive"; trap: boolean }
  | { kind: "death"; cause: "macro" | "wrong" | "timeout"; reason: string };

/** Avancement dans les steps de la manche courante. */
export interface RoundProgress {
  step: number;
}
