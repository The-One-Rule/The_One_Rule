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
 * LE PAYSAGE SERRÉ — un téléphone couché, ou toute fenêtre trop basse.
 *
 * ⚠️ CE N'EST PAS UNE VARIANTE DE CONFORT, C'EST UN TERRAIN QUI N'EXISTAIT
 * PLUS. Mesuré en partie, téléphone couché :
 *
 * | fenêtre | bandeau | consigne | pied | scène | CHAMP |
 * |---|---|---|---|---|---|
 * | 667 × 375 | 48 | 105 | 54 | 168 | 343 × 144 |
 * | 667 × 375, consigne sur 2 lignes | 48 | **139** | 54 | 134 | **262 × 110** |
 * | 812 × 375 | **74** | 106 | 54 | 141 | 278 × 117 |
 *
 * Deux défauts, pas un. Le HUD mange 207 à 247 px sur 375 — la moitié de
 * l'écran — et il n'a pas de hauteur FIXE : une consigne qui passe à deux
 * lignes rétrécit le champ de 24 % EN PLEINE PARTIE. Or la taille du champ
 * EST du gameplay (n°10), et rien ne doit se décider sur une grandeur que la
 * décision modifie (n°2). Le second défaut vaut aussi couché sur un bureau :
 * à 1280 × 800, une consigne à glyphe (« TAPE LA LETTRE AFFICHÉE ») fait
 * passer `#head` de 106 à 174 px, donc le champ de 1232 × 517 à 1128 × 474.
 *
 * LA RÉPONSE est celle du terrain debout : le bandeau, la consigne et le pied
 * QUITTENT LE FLUX et se peignent dans deux bandes de hauteur CONSTANTE, en
 * haut et en bas du canvas. Le champ ne bouge plus d'une manche à l'autre, et
 * il récupère ce que le HUD lui prenait.
 *
 * ⚠️ LE MÊME CRITÈRE QUE LA FEUILLE, au pixel :
 * `@media (orientation: landscape) and (max-height: 500px)`. En CSS, « paysage »
 * veut dire largeur STRICTEMENT supérieure à la hauteur — c'est la frontière
 * exacte avec `orientationPour`, qui rend « portrait » dès que la hauteur
 * égale la largeur. Les deux domaines ne se chevauchent donc jamais.
 *
 * 500 et pas 680 : ce qui manque ici est de la HAUTEUR. Un téléphone couché
 * plafonne vers 430 px (iPhone Pro Max), une tablette couchée en fait 768 et
 * n'a besoin de rien. Une fenêtre de bureau écrasée à 400 px de haut souffre
 * exactement du même mal et reçoit le même remède, ce qui est voulu.
 */
export const PAYSAGE_SERRE_H = 500;

export function paysageSerre(largeurFenetre: number, hauteurFenetre: number): boolean {
  return largeurFenetre > hauteurFenetre && hauteurFenetre <= PAYSAGE_SERRE_H;
}

/**
 * La bande du HAUT en paysage serré : bandeau, consigne, sous-ligne, temps.
 *
 * 20 px de bandeau (nom de la règle + vies), 26 px de consigne, 11 px de
 * sous-ligne, 1 + 4 px de barre de temps.
 *
 * ⚠️ RIEN N'Y EST CALÉ SUR LE CONTENU. Une consigne plus longue que prévu
 * déborde dans le letterbox au lieu de pousser le terrain, et un glyphe de
 * consigne clavier garde la même boîte que les autres : c'est une CONSTANTE,
 * comme `RESERVE_CONSIGNE` debout, et c'est ce qui fait que le champ ne change
 * plus de taille d'une manche à l'autre.
 *
 * ⚠️ 20 px pour le bandeau tient parce que le nom de la règle y passe à 13 px
 * PAR SON IDENTIFIANT (`#bandRule`) : une règle de classe perd contre le
 * `font-size: 21px` posé plus haut dans la feuille, et le nom se faisait
 * couper en deux.
 */
export const RESERVE_CONSIGNE_COUCHE = 62;

/**
 * La bande du BAS en paysage serré : le pied, sur une seule ligne.
 *
 * Elle coûte, et le chiffre est écrit : à 812 × 375 le champ passe de
 * 679 × 285 (sans pied) à 674 × 283. Sept dixièmes de pour cent pour garder le
 * score, le record et le mode — dont l'annonce « RECORD DÉPASSÉ », qui n'a pas
 * d'autre endroit où vivre pendant une partie.
 */
export const RESERVE_PIED_COUCHE = 30;

/**
 * La bande basse d'un SALON couché : plaques, émotes ET pied.
 *
 * ⚠️ ELLE REMPLACE `RESERVE_HUD_MULTI`, elle ne s'y ajoute pas. Mesuré à
 * 667 × 375, match lancé : `#liveHud` faisait 144 px — plaques 110, émotes 60 —
 * pour une bande plafonnée au tiers du canvas, soit 125 : **49 px de terrain
 * passaient sous les plaques**. Couché, les émotes se posent donc à côté des
 * plaques au lieu d'occuper leur propre rangée, et la plaque perd le nom de
 * règle de l'adversaire. Le calque retombe à 94 px, plus 30 de pied.
 *
 * Elle vaut moins que `RESERVE_HUD_MULTI` (180) parce que le calque est plus
 * court, pas parce qu'on serre les dents : un chiffre trop petit ramènerait
 * exactement le bug qu'il existe pour fermer.
 */
export const RESERVE_HUD_MULTI_COUCHE = 124;

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
function bande(cssH: number, reserve: number): number {
  return Math.max(GOUTTIERE, Math.min(reserve, cssH / 3));
}

export function cadrePour(
  cssW: number,
  cssH: number,
  orientation: Orientation,
  /** Bande basse réservée : plaques d'un salon, aide du tutoriel, pied couché. */
  reserveBas = 0,
  /**
   * Bande HAUTE réservée, en paysage serré seulement : le HUD y quitte le flux
   * et se peint dans le canvas (`RESERVE_CONSIGNE_COUCHE`).
   *
   * ⚠️ Debout, elle est ignorée : la consigne y a déjà sa bande, et c'est
   * `RESERVE_CONSIGNE`. Deux réserves hautes pour une seule consigne
   * s'additionneraient en silence.
   */
  reserveHaut = 0,
): Cadre {
  if (orientation === "portrait") {
    const bas = bande(cssH, reserveBas);
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
  const bas = bande(cssH, reserveBas);
  /*
   * ⚠️ LA BANDE HAUTE A UN PLANCHER, et c'est la gouttière : `bande` rend 24
   * même pour une réserve nulle. Sans réserve, le cadrage est donc EXACTEMENT
   * celui d'avant — c'est ce qui garantit que le bureau et la tablette ne
   * bougent pas d'un pixel.
   */
  const haut = bande(cssH, reserveHaut);
  const usableW = Math.max(1, cssW - GOUTTIERE * 2);
  const usableH = Math.max(1, cssH - haut - bas);
  const scale = Math.min(usableW / FIELD_W, usableH / FIELD_H);
  return {
    orientation,
    scale,
    offX: (cssW - FIELD_W * scale) / 2,
    // Centré ENTRE les deux bandes, jamais dans tout le canvas.
    offY: haut + (cssH - haut - bas - FIELD_H * scale) / 2,
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
