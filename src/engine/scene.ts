import { FIELD_H, FIELD_W, RADIUS } from "./types.js";
import type { Entity, EntitySpec, Rng, SizeId } from "./types.js";
import { rInt } from "./rng.js";

const COLS = 5;
const ROWS = 3;
const CELL_W = FIELD_W / COLS;
const CELL_H = FIELD_H / ROWS;
/** marge intérieure de cellule : garantit qu'aucune forme ne déborde ni ne se touche */
const PAD = 10;

export const MAX_ENTITIES = COLS * ROWS;

/** Taille pondérée : la plupart des formes sont moyennes, quelques-unes tranchent. */
export function rollSize(rng: Rng): SizeId {
  const x = rng();
  return x < 0.7 ? "M" : x < 0.86 ? "L" : "S";
}

/**
 * Effectif d'une scène « à remplissage », selon le niveau.
 *
 * Cinq formes au départ, onze vers le niveau 30, plafonné par la grille de
 * quinze cellules. Une consigne dont l'effectif fait partie de l'énoncé
 * n'appelle PAS cette fonction — voir instructions/index.ts.
 *
 * Un seul tirage consommé, comme le `rInt` qu'elle remplace : la forme de la
 * suite aléatoire reste comparable d'une version à l'autre.
 */
export function fillCount(rng: Rng, level: number, min: number): number {
  const grown = min + Math.min(6, Math.floor(level / 5));
  return Math.min(MAX_ENTITIES, grown + rInt(rng, 2));
}

/**
 * Place les formes sur une grille 5×3, une par cellule au maximum,
 * avec un jitter borné pour que rien ne sorte de sa cellule.
 * Deux formes ne peuvent donc jamais se chevaucher.
 */
export function place(rng: Rng, specs: EntitySpec[]): Entity[] {
  if (specs.length > MAX_ENTITIES) throw new Error(`trop de formes : ${specs.length}`);

  const cells: Array<[number, number]> = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push([c, r]);

  // sélection sans biais des cellules occupées
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }

  return specs.map((s, i) => {
    const [c, r] = cells[i]!;
    const rad = RADIUS[s.size];
    const freeX = Math.max(0, CELL_W / 2 - rad - PAD);
    const freeY = Math.max(0, CELL_H / 2 - rad - PAD);
    const x = CELL_W * (c + 0.5) + (rng() * 2 - 1) * freeX;
    const y = CELL_H * (r + 0.5) + (rng() * 2 - 1) * freeY;
    return {
      ...s,
      idx: i,
      r: rad,
      ox: x,
      oy: y,
      x,
      y,
      phase: rng() * Math.PI * 2,
    };
  });
}

/** Amplitude du va-et-vient des formes mobiles — bornée pour rester dans la cellule. */
export const MOVE_AMP_X = 22;
export const MOVE_AMP_Y = 10;
