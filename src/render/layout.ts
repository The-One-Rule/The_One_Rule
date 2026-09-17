/**
 * Où vont les plaques joueurs : colonnes latérales, ou bandeau du bas.
 *
 * Pur, sans DOM — parce que la propriété qui compte ici n'est pas esthétique,
 * elle est mathématique, et elle se teste.
 *
 * LE PIÈGE. Les deux dispositions ne laissent pas la même place à la scène :
 * en bandeau les plaques sont dans le flux et lui prennent de la hauteur ; en
 * colonnes elles en sortent et la scène grandit. Or plus la scène est haute,
 * plus le champ est large (son rapport est fixe), donc plus la gouttière
 * latérale est ÉTROITE. Décider sur la gouttière courante, c'est donc mesurer
 * ce que la décision vient de changer : les deux états se répondent, la mise en
 * page oscille, le navigateur finit par abandonner des notifications de
 * redimensionnement, et la géométrie reste figée sur une valeur fausse.
 *
 * Constaté en production : pièces invisibles, puis plaques tantôt sur les
 * côtés tantôt en bas d'une manche à l'autre, sans logique visible.
 *
 * LA SORTIE. On ne décide jamais sur la gouttière courante, mais sur celle que
 * produirait TOUJOURS le mode colonnes — donc sur une grandeur identique dans
 * les deux états. La boucle n'est pas amortie, elle n'existe plus.
 */

import { cadrePour, rectEcran } from "./orientation";
import type { Orientation } from "./orientation";

/**
 * Sous cette largeur, une colonne rogne la plaque : `.plate` a min-width
 * 150 px et `.plates__col` ajoute 10 px de marge de chaque côté, le tout en
 * `overflow: hidden`. Le seuil sort de la CSS, il n'est pas choisi à l'estime.
 *
 * Relevé en même temps que la typographie des plaques : le nom de règle d'un
 * adversaire est passé de 9 à 12 px. Le dimensionnement est calé sur le PIRE
 * nom du pool multi, mesuré dans un navigateur — « L'ACCÉLÉRATION », 124 px —
 * et non sur celui qu'on croyait le plus long.
 *
 * **Si tu touches `.plate { min-width }`, touche ce nombre.**
 */
export const COLUMN_MIN = 176;

/**
 * Entrée en colonnes. Nettement au-dessus de COLUMN_MIN : la bande sépare les
 * deux décisions quand la fenêtre est traînée lentement. Elle n'est plus ce qui
 * garantit la terminaison — `stableGutter` s'en charge — seulement ce qui évite
 * de basculer sur un pixel.
 */
export const COLUMN_ENTER = 232;

/**
 * Gouttière latérale que produirait le mode colonnes.
 *
 * `stageHeightNoPlates` est la hauteur de scène AVEC les plaques hors du flux :
 * l'appelant la reconstitue en rajoutant la hauteur du bandeau quand il est
 * encore dans le flux. C'est ce qui rend le résultat indépendant de l'état.
 */
export function stableGutter(
  canvasW: number,
  stageHeightNoPlates: number,
  /**
   * ⚠️ Le terrain debout n'a pas la même gouttière : c'est la MÊME fonction
   * que le renderer (`cadrePour`) qui la calcule, jamais une copie de sa
   * formule. Absent vaut paysage — c'est ce que tous les tests d'hier
   * mesuraient.
   */
  orientation: Orientation = "paysage",
  reserveBas = 0,
): number {
  if (canvasW <= 48 || stageHeightNoPlates <= 48) return 0;
  const r = rectEcran(cadrePour(canvasW, stageHeightNoPlates, orientation, reserveBas));
  return Math.max(0, Math.round((canvasW - r.w) / 2));
}

/** Hystérésis : on entre haut, on sort bas. */
export function wantsColumns(gutter: number, current: boolean): boolean {
  return current ? gutter >= COLUMN_MIN : gutter >= COLUMN_ENTER;
}
