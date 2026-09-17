/**
 * LE TERRAIN DEBOUT — la géométrie du champ sur un téléphone tenu droit.
 *
 * Pur et testé, pour la même raison que `layout.ts` : c'est la conversion qui
 * décide où tombe un doigt, et une erreur ici ne se voit pas — elle fait
 * cliquer la pièce d'à côté.
 *
 * LE CONSTAT, mesuré à 375 × 812. Le champ est un paysage de 1000 × 420 posé
 * dans un canvas de 373 × 710 : il y tenait en 325 × 137 px, soit 17 % de la
 * surface, avec 287 px de vide au-dessus et en dessous. Une pièce de rayon 40
 * y faisait 13 px. Le jeu le plus rapide du téléphone se jouait sur une
 * bande.
 *
 * LA RÉPONSE. On TRANSPOSE le repère : l'axe x du champ court vers le bas de
 * l'écran, l'axe y vers la droite. Le même champ de 1000 × 420 remplit la
 * hauteur au lieu de la largeur — 241 × 574 px, pièces 1,77 fois plus grandes.
 *
 * ⚠️ **LE MOTEUR N'EN SAIT RIEN.** Positions, zones, collisions, verdicts
 * restent dans le repère logique : c'est une transformation d'AFFICHAGE, de
 * la même famille que la secousse. Le serveur, `verifyRun` et les autres
 * joueurs d'un salon jugent exactement ce qu'ils jugeaient (n°3). Deux
 * joueurs, l'un debout l'autre couché, voient la même scène tournée.
 *
 * Pourquoi une TRANSPOSITION et pas une rotation : elle est sa propre inverse
 * (x ↔ y), donc la conversion clic → champ est la même formule que champ →
 * écran, et l'ordre des pièces se lit dans le sens de la lecture — ce qui
 * était « le plus à gauche » devient « le plus en haut », jamais « le plus en
 * bas ». Une rotation aurait inversé un des deux axes, et avec lui le sens de
 * LE GAUCHER.
 */

import { FIELD_H, FIELD_W } from "../engine/types";

export type Orientation = "paysage" | "portrait";

/**
 * Gouttière réservée au cadre de temps, de chaque côté du champ.
 *
 * Une forme L mobile peut atteindre x ≈ −12 dans le repère du champ (jitter
 * de cellule 31, puis MOVE_AMP_X = 22, moins le rayon 59) : les pièces
 * débordent du champ. Sans marge réservée, un liseré épais recouvrirait une
 * cible cliquable.
 *
 * Exportée parce que la mise en page en dépend : main.ts doit pouvoir calculer
 * la même géométrie que le renderer pour décider où placer les plaques. Deux
 * copies de ce nombre divergeraient au premier réglage — c'est pourquoi elle
 * vit ICI, à côté du seul calcul qui la consomme.
 */
export const FIELD_GUTTER = 24;
const GOUTTIERE = FIELD_GUTTER;

/**
 * La bande laissée à la CONSIGNE au-dessus du terrain debout.
 *
 * Sur téléphone tenu droit, `#head` est replié à hauteur nulle et la consigne
 * se peint par-dessus le haut du canvas (voir la feuille, `@media (max-width:
 * 680px) and (orientation: portrait)`). En paysage le champ laissait 287 px
 * libres au-dessus ; debout, il monte jusqu'en haut — il faut donc lui
 * réserver sa place.
 *
 * ⚠️ UNE CONSTANTE, PAS UNE MESURE DE LA CONSIGNE. La consigne change à chaque
 * manche : caler le terrain sur sa hauteur le ferait bouger d'une manche à
 * l'autre, et la taille du champ est du gameplay (n°10). Mesuré à 375 px avec
 * la plus longue du pool tactile, « CLIQUE CELUI QUI N'EST PAS UN TRIANGLE »
 * (deux lignes à 34 px, plus « 1 GESTE ») : elle finit à 102 px. 112 laisse
 * 10 px d'air.
 */
export const RESERVE_CONSIGNE = 112;

/**
 * La bande laissée aux PLAQUES et aux émotes sous le terrain debout, en
 * multijoueur.
 *
 * Mesuré à 375 × 812, salon lancé : `#liveHud` occupe 144 px au-dessus du
 * pied (une rangée de plaques, puis les émotes). Couché, il tombait dans les
 * 287 px de vide sous le terrain ; debout, il recouvrait le bas du champ —
 * une pièce cachée sous une plaque ne se clique pas.
 *
 * ⚠️ Constante pour toute la partie, comme la bande de la consigne : un
 * terrain qui se recalerait sur le nombre de plaques bougerait quand un
 * joueur part. Les plaques restent donc sur UNE rangée qui défile (feuille,
 * même media query).
 */
export const RESERVE_HUD_MULTI = 150;

/**
 * Le téléphone est-il tenu debout ?
 *
 * ⚠️ LE MÊME CRITÈRE QUE LA FEUILLE DE STYLE, au pixel : c'est elle qui replie
 * la consigne par-dessus le canvas. Si les deux divergeaient, on aurait soit
 * un terrain debout sous une consigne dans le flux (bande perdue), soit un
 * terrain couché sous une consigne qui le recouvre.
 *
 * ⚠️ Et il se décide sur la FENÊTRE, jamais sur le canvas : la taille du canvas
 * dépend de la mise en page, qui dépend de l'orientation. Décider sur une
 * grandeur que la décision modifie, c'est la boucle de la décision n°2.
 */
export function orientationPour(largeurFenetre: number, hauteurFenetre: number): Orientation {
  return largeurFenetre <= 680 && hauteurFenetre >= largeurFenetre ? "portrait" : "paysage";
}

export interface Cadre {
  orientation: Orientation;
  /** Pixels CSS par unité de champ. */
  scale: number;
  /** Coin haut-gauche du champ, en pixels CSS dans le canvas. */
  offX: number;
  offY: number;
}

/** Le letterbox du champ dans un canvas de `cssW × cssH`. */
export function cadrePour(
  cssW: number,
  cssH: number,
  orientation: Orientation,
  /** Bande basse réservée (multijoueur debout). Ignorée couché. */
  reserveBas = 0,
): Cadre {
  if (orientation === "portrait") {
    const bas = Math.max(GOUTTIERE, reserveBas);
    const usableW = Math.max(1, cssW - GOUTTIERE * 2);
    const usableH = Math.max(1, cssH - RESERVE_CONSIGNE - bas);
    const scale = Math.min(usableW / FIELD_H, usableH / FIELD_W);
    return {
      orientation,
      scale,
      offX: (cssW - FIELD_H * scale) / 2,
      // Centré dans ce qui reste ENTRE la consigne et la bande basse.
      offY: RESERVE_CONSIGNE + (cssH - RESERVE_CONSIGNE - bas - FIELD_W * scale) / 2,
    };
  }
  const usableW = Math.max(1, cssW - GOUTTIERE * 2);
  const usableH = Math.max(1, cssH - GOUTTIERE * 2);
  const scale = Math.min(usableW / FIELD_W, usableH / FIELD_H);
  return {
    orientation,
    scale,
    offX: (cssW - FIELD_W * scale) / 2,
    offY: (cssH - FIELD_H * scale) / 2,
  };
}

/** Point du champ → pixels CSS dans le canvas. */
export function versEcran(c: Cadre, fx: number, fy: number): { x: number; y: number } {
  if (c.orientation === "portrait") return { x: c.offX + fy * c.scale, y: c.offY + fx * c.scale };
  return { x: c.offX + fx * c.scale, y: c.offY + fy * c.scale };
}

/** Pixels CSS dans le canvas → point du champ. L'inverse exact de `versEcran`. */
export function versChamp(c: Cadre, sx: number, sy: number): { x: number; y: number } {
  if (c.orientation === "portrait") return { x: (sy - c.offY) / c.scale, y: (sx - c.offX) / c.scale };
  return { x: (sx - c.offX) / c.scale, y: (sy - c.offY) / c.scale };
}

/** Le rectangle À L'ÉCRAN du champ, en pixels CSS dans le canvas. */
export function rectEcran(c: Cadre): { x: number; y: number; w: number; h: number } {
  const debout = c.orientation === "portrait";
  return {
    x: c.offX,
    y: c.offY,
    w: (debout ? FIELD_H : FIELD_W) * c.scale,
    h: (debout ? FIELD_W : FIELD_H) * c.scale,
  };
}

/**
 * Un décalage « dans le sens de l'écran » exprimé dans le repère du champ.
 *
 * Les formes se dessinent dans le repère du champ, or un triangle doit
 * pointer vers le HAUT DE L'ÉCRAN et une ombre tomber vers le BAS DE
 * L'ÉCRAN, quel que soit le sens du terrain. Debout, « vers le bas de
 * l'écran » est +x du champ : on échange les deux composantes.
 */
export function decalage(o: Orientation, dxEcran: number, dyEcran: number): [number, number] {
  return o === "portrait" ? [dyEcran, dxEcran] : [dxEcran, dyEcran];
}
