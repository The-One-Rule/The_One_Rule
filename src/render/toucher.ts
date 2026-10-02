/**
 * LES GROS DOIGTS — pièces plus grandes et toucher plus large au téléphone.
 *
 * Rapporté par Pierre : « les gens avec des gros doigts ne peuvent pas jouer
 * tout simplement ». Mesuré à 375 × 812 : le terrain debout fait 234 × 558 px,
 * échelle 0,557 — une petite pièce (rayon 30) faisait 34 px de diamètre à
 * l'écran, et sa zone de clic 41. Un pouce en couvre 45 à 55. Le terrain est
 * borné par la HAUTEUR, donc l'agrandir ne se paie qu'en pièces.
 *
 * Deux leviers, et ils vont ENSEMBLE :
 *
 *   1. le DESSIN grossit (×1,2, plafonné à 66 unités : la plus grande pièce
 *      tient encore dans sa cellule de 140, sans mordre sur la voisine) ;
 *   2. le TOUCHER suit le dessin, plus une marge fixe EN PIXELS D'ÉCRAN — la
 *      taille d'un doigt ne dépend pas de l'échelle du terrain.
 *
 * ⚠️ RIEN DE CE QUI EST JUGÉ NE BOUGE. Le moteur, le serveur et `verifyRun` ne
 * voient qu'un INDEX de pièce (décision n°3) : choisir la pièce plus
 * généreusement est un geste d'affichage, pas une règle. `e.r` reste la
 * géométrie du tirage, `VERSION_CONTENU` ne la connaît pas ici.
 *
 * Pur : aucune dépendance au DOM, testé à part.
 */
import type { Entity } from "../engine/types";

/** Le grossissement du dessin sur un écran tactile. 1 = inchangé (souris). */
export const GROSSI_TACTILE = 1.2;

/**
 * Plafond du rayon DESSINÉ, en unités de terrain. Une cellule debout fait 140
 * de large ; la plus grande pièce (59) posée au centre ± 1 atteint 67 + 66 =
 * 137 < 140 : deux grandes voisines ne se touchent pas au repos.
 */
export const RAYON_MAX = 66;

/** Marge de toucher ajoutée au bord de la pièce, en pixels d'ÉCRAN. */
export const MARGE_DOIGT_PX = 12;

/** Le rayon tel qu'on le DESSINE — et tel qu'on le touche. */
export function rayonAffiche(r: number, grossi: number): number {
  if (grossi <= 1) return r;
  return Math.max(r, Math.min(r * grossi, RAYON_MAX));
}

/**
 * La pièce que désigne un appui en (x, y), unités de terrain.
 *
 * Une pièce est touchable jusqu'à `max(rayon × hit, rayon + marge)`. Quand
 * deux zones se recouvrent — la marge élargie le permet — gagne le CENTRE le
 * plus proche, comme avant : départager par le bord favoriserait la grande
 * pièce, qui volerait l'appui posé entre elle et une petite voisine. Et à la
 * souris le choix reste exactement celui d'avant.
 */
export function pieceTouchee(
  ents: readonly Entity[],
  x: number,
  y: number,
  o: { grossi: number; margeChamp: number; hit: number },
): Entity | null {
  let best: Entity | null = null;
  let bd = Infinity;
  for (const e of ents) {
    const ra = rayonAffiche(e.r, o.grossi);
    const d = Math.hypot(x - e.x, y - e.y);
    if (d > Math.max(ra * o.hit, ra + o.margeChamp)) continue;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}
