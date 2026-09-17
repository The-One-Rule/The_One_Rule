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
 * l'autre, et la taille du champ est du gameplay (n°10).
 *
 * ⚠️ ELLE COMPTE LA BARRE DE TEMPS, ET C'EST UN DÉFAUT PAYÉ. La première
 * version ne mesurait que la consigne et sa sous-ligne — 102 px, d'où 112.
 * Mais `#timer` est DANS `#head`, sous elles : avec la plus longue consigne du
 * pool tactile sur deux lignes (« CLIQUE CELUI QUI N'EST PAS UN TRIANGLE »),
 * la barre de temps descendait à 124 px et se posait sur le terrain. Mesuré à
 * 375 × 812, en partie : barre à 165-172 pour un champ qui commence à 160.
 * 128 laisse 4 px d'air, et le terrain ne perd que 20 px de haut.
 */
export const RESERVE_CONSIGNE = 128;

/**
 * La bande laissée aux PLAQUES et aux émotes sous le terrain, en multijoueur.
 *
 * ⚠️ ELLE VAUT DANS LES DEUX SENS, ET C'EST UN BUG RAPPORTÉ PAR PIERRE : « le
 * canvas est traversé par les glyphes des joueurs ». Mesuré à 1280 × 800, un
 * salon lancé : `#liveHud` occupe 177 px (une rangée de plaques, puis les
 * émotes) et le terrain descend à 721 — donc 152 px de terrain, avec ses
 * pièces, SOUS les plaques. La première version de cette réserve ne valait
 * qu'en portrait ; couché, le champ remplit presque tout le canvas et il n'y
 * a aucun vide où poser le HUD.
 *
 * ⚠️ Constante pour toute la partie : un terrain qui se recalerait sur le
 * nombre de plaques bougerait quand un joueur part. Les plaques tiennent donc
 * sur UNE rangée qui défile (feuille), quelle que soit la largeur.
 *
 * ⚠️ Elle ne s'applique JAMAIS en colonnes (`has-gutters`) : là, les plaques
 * vivent dans les gouttières latérales et ne touchent pas le champ.
 */
export const RESERVE_HUD_MULTI = 180;

/**
 * La bande laissée à la ligne d'aide du TUTORIEL, même défaut, même remède.
 *
 * Mesuré à 1280 × 800 : le calque d'aide couvre 616-746 pour un terrain qui
 * finit à 721. Il est plus court que le HUD d'un salon, donc il a sa propre
 * mesure — réserver 180 px pour 130 volerait 50 px de terrain à un joueur qui
 * découvre le jeu.
 */
export const RESERVE_AIDE_TUTO = 140;

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
/**
 * ⚠️ LA BANDE BASSE NE PEUT PAS ÉCRASER LE TERRAIN.
 *
 * Mesuré en la posant sans borne : sur un canvas de 235 px de haut (une fenêtre
 * courte, ou l'instant où la mise en page change), 180 px de réserve laissaient
 * un champ de 31 px. Un terrain illisible est pire qu'un HUD qui le touche.
 * Elle ne prend donc jamais plus du tiers du canvas.
 */
function bandeBasse(cssH: number, reserveBas: number): number {
  return Math.max(GOUTTIERE, Math.min(reserveBas, cssH / 3));
}

export function cadrePour(
  cssW: number,
  cssH: number,
  orientation: Orientation,
  /** Bande basse réservée : plaques d'un salon, aide du tutoriel. */
  reserveBas = 0,
): Cadre {
  if (orientation === "portrait") {
    const bas = bandeBasse(cssH, reserveBas);
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
  /*
   * ⚠️ COUCHÉ AUSSI, la bande basse compte. Elle était ignorée ici, et le
   * résultat était le bug des « glyphes qui traversent le canvas » : à
   * 1280 × 800 le champ finit à 721 et les plaques occupent 569-746.
   */
  const bas = bandeBasse(cssH, reserveBas);
  const usableW = Math.max(1, cssW - GOUTTIERE * 2);
  const usableH = Math.max(1, cssH - GOUTTIERE - bas);
  const scale = Math.min(usableW / FIELD_W, usableH / FIELD_H);
  return {
    orientation,
    scale,
    offX: (cssW - FIELD_W * scale) / 2,
    // Centré entre le haut du canvas et la bande basse, pas dans tout le canvas.
    offY: GOUTTIERE + (cssH - GOUTTIERE - bas - FIELD_H * scale) / 2,
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
