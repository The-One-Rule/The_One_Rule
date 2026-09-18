/**
 * LES FLAMMES — le plaisir d'aller plus loin, en pixels.
 *
 * Retour du jury Ystart : « rendre le fait d'aller plus loin plus
 * satisfaisant … comme les flammes sur Snap, mais qui entourent l'écran, des
 * flammes violettes, blanches et noires en pixel art, la chaleur des couleurs
 * qui augmente ». Et la maquette de Pierre : le feu naît autour du terrain,
 * puis, plus on avance, il monte jusqu'à passer par-dessus la barre du haut.
 *
 * ⚠️ **CE N'EST PLUS UN FEU CALCULÉ, CE SONT DES SPRITES.** La première version
 * dessinait un feu de DOOM — une grille d'intensités qui se propage. Elle
 * marchait, mais elle avait l'air d'un dégradé animé : trois réglages
 * successifs (foyers intermittents, vent vers le centre, force plafonnée) n'ont
 * jamais fait qu'approcher une flamme. Pierre a fourni un pack d'assets et la
 * consigne de s'en servir : c'est une VRAIE flamme pixel, dessinée à la main,
 * 24 images. On la dessine, on ne la simule plus — moins de code, moins de
 * calcul par image, et ça ressemble enfin à du feu.
 *
 * Planche : OVERBURN Asset Pack, par Overboy (série violette). Licence : usage
 * commercial et modification permis, redistribution du pack interdite. Le
 * crédit n'est pas exigé — il est écrit ici parce que c'est la moindre des
 * choses, et parce que la prochaine personne qui lira ce fichier doit savoir
 * d'où vient l'image et ce qu'elle a le droit d'en faire.
 *
 * Ce module ne dit que OÙ poser les flammes et QUELLE image montrer. Il est
 * pur ; le dessin (la planche, le canvas, le découpage) vit dans `main.ts`.
 *
 * TROIS GARDE-FOUS, dans l'ordre où ils comptent :
 *
 * 1. ⚠️ **LE FEU NE COUVRE JAMAIS CE QU'IL FAUT LIRE.** Aucune flamme ne prend
 *    racine DANS le terrain, et le dessin est en plus DÉCOUPÉ à ses bords : une
 *    flamme qui déborderait est rognée au pixel. Elles vivent dans les marges,
 *    comme le halo de la couche `#heat`.
 * 2. ⚠️ **IL NE RÉVÈLE RIEN (n°5).** L'ardeur suit l'AVANCÉE de la partie,
 *    jamais la manche en cours : une manche piégée brûle comme une autre. La
 *    rafale d'un piège déjoué n'arrive qu'APRÈS le verdict.
 * 3. Rien n'est tiré au sort à l'exécution : chaque flamme tient sa taille et
 *    son battement de son INDICE. Deux images successives donnent donc le même
 *    feu, et un test peut le décrire.
 */

/** La planche : 6 colonnes × 4 rangées d'images de 48 × 48. */
export const PLANCHE = { fichier: "/fx/flamme.png", colonnes: 6, rangees: 4, image: 48 } as const;

/**
 * ⚠️ LA FLAMME N'OCCUPE PAS SON IMAGE, et son pied n'est pas en bas.
 *
 * Mesuré en parcourant les pixels opaques de la planche : dans chaque image de
 * 48 × 48, le dessin tient dans x 17-29 et y 6-27 — 13 px de large sur 22 de
 * haut, dans la MOITIÉ HAUTE. Dessiner l'image entière ancrée en bas donnait
 * donc des flammes deux fois trop petites, flottant au-dessus de leur pied.
 * On ne dessine que cette boîte (avec un pixel de marge), et c'est ELLE qu'on
 * met à l'échelle demandée.
 */
export const BOITE = { x: 16, y: 5, w: 15, h: 23 } as const;

/** Nombre d'images de la boucle. */
export const IMAGES = PLANCHE.colonnes * PLANCHE.rangees;

/** Durée d'une image : 24 images à ~14 par seconde, soit une boucle de 1,7 s. */
export const IMAGE_MS = 70;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Cote = "bas" | "gauche" | "droite" | "haut";

export interface Braise {
  /** Le PIED de la flamme, en pixels CSS dans le canvas. */
  x: number;
  y: number;
  /** Hauteur dessinée ; la largeur suit le carré de la planche. */
  h: number;
  /** Décalage d'image : deux flammes voisines ne battent jamais ensemble. */
  phase: number;
  /** Vitesse relative du battement. */
  vitesse: number;
  cote: Cote;
}

/** Un hasard déterministe tiré d'un nombre : même indice, même flamme. */
function melange(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Les seuils d'apparition, côté par côté.
 *
 * Le feu prend par le BAS — c'est là qu'un feu prend — puis remonte les côtés,
 * et ne passe par-dessus le terrain qu'à la fin. C'est la maquette : « plus on
 * avance, elles prennent même le haut ».
 */
export const SEUIL: Record<Cote, number> = { bas: 0.05, gauche: 0.22, droite: 0.22, haut: 0.7 };

/**
 * Où poser les flammes pour une ardeur donnée.
 *
 * `canvas` est la taille du calque, `champ` le rectangle du terrain DANS ce
 * calque. Tout est en pixels CSS.
 */
export function braisesPour(
  canvas: { w: number; h: number },
  champ: Rect,
  ardeur: number,
  /**
   * Le SOCLE : la ligne d'où monte le feu du bas. C'est le haut du pied de
   * l'écran, pas le bas du calque — sinon les flammes du bas se dessinent
   * derrière le pied, donc nulle part. Absent, on prend le bas du calque.
   */
  socle = canvas.h,
): Braise[] {
  const a = Math.min(1, Math.max(0, ardeur));
  if (a <= SEUIL.bas) return [];

  const braises: Braise[] = [];
  const bas = champ.y + champ.h;
  const droite = champ.x + champ.w;
  const hauteur = (k: number): number => 30 + 74 * a * (0.72 + 0.56 * k);
  /** Deux flammes au réveil, une bonne dizaine au sommet. */
  const combien = (longueur: number): number =>
    Math.max(2, Math.round((longueur / 160) * (1 + 1.6 * a)));

  const poser = (cote: Cote, n: number, place: (t: number) => { x: number; y: number }): void => {
    if (a < SEUIL[cote]) return;
    for (let i = 0; i < n; i++) {
      // Réparties sur toute la longueur, décalées pour ne jamais s'aligner.
      const t = (i + 0.5 + (melange(i * 3.7 + SEUIL[cote] * 100) - 0.5) * 0.6) / n;
      const p = place(Math.min(1, Math.max(0, t)));
      braises.push({
        x: p.x,
        y: p.y,
        h: hauteur(melange(i * 9.1 + SEUIL[cote] * 31)),
        phase: Math.floor(melange(i * 5.3 + SEUIL[cote] * 17) * IMAGES),
        vitesse: 0.75 + melange(i * 2.9 + SEUIL[cote] * 13) * 0.55,
        cote,
      });
    }
  };

  // LE BAS : elles montent du pied de l'écran vers le terrain.
  poser("bas", combien(canvas.w), (t) => ({ x: t * canvas.w, y: socle }));
  // LES CÔTÉS : elles montent dans les gouttières, le long du terrain.
  poser("gauche", combien(champ.h), (t) => ({ x: champ.x * 0.5, y: bas - t * champ.h * 0.92 }));
  poser("droite", combien(champ.h), (t) => ({
    x: droite + (canvas.w - droite) * 0.5,
    y: bas - t * champ.h * 0.92,
  }));
  // LE HAUT : elles prennent le bord supérieur du terrain et le dépassent.
  poser("haut", combien(champ.w), (t) => ({ x: champ.x + t * champ.w, y: champ.y }));
  return braises;
}

/**
 * L'ardeur d'une partie solo : l'avancée, rien d'autre.
 *
 * Nulle pendant l'échauffement — on n'a encore rien fait — puis elle monte
 * jusqu'à la manche 30, où le feu a tout pris. 30 et pas 40 : le score médian
 * est 12 et le p75 20 (572 runs), donc un joueur ordinaire doit VOIR le feu
 * monter, pas seulement en entendre parler.
 */
export function ardeurDe(niveau: number, echauffement: number): number {
  if (niveau < echauffement) return 0;
  return Math.min(1, (niveau - echauffement + 1) / (30 - echauffement));
}

/** L'image de la planche à dessiner, pour une flamme et un instant donnés. */
export function imageDe(b: Braise, now: number): { sx: number; sy: number } {
  const i = (Math.floor((now / IMAGE_MS) * b.vitesse) + b.phase) % IMAGES;
  const col = i % PLANCHE.colonnes;
  const ligne = Math.floor(i / PLANCHE.colonnes);
  return { sx: col * PLANCHE.image, sy: ligne * PLANCHE.image };
}
