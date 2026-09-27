/**
 * L'INTENSITÉ — ce que la partie a GAGNÉ le droit de montrer.
 *
 * Rapporté par Pierre après une soirée entre amis : « le gameplay est encore
 * trop statique … le potentiel de TOR c'est justement "MERDE ÇA VA TROP
 * VITE" … pas partout tout le temps, mais l'intensité doit être GAGNÉE ».
 *
 * Deux sources, toutes deux déjà là, aucune donnée neuve :
 * - le PALIER de la partie (`render/tension.ts`, 0 → 4) : on est loin ;
 * - la SÉRIE en cours : combien de manches tenues d'affilée depuis la
 *   dernière faute. C'est elle qui rend l'intensité GAGNÉE — une faute la
 *   fait retomber, donc le feu d'artifice se mérite et se perd.
 *
 * Tout ce qui en découle est du DESSIN : particules, ondes, traînées, cadre,
 * pulsation des pièces. Rien ne touche `e.x`, `e.y`, `e.r` ni le temps d'une
 * manche : le hit-test et le verdict sont exactement ceux d'avant
 * (décision n°3), et `VERSION_CONTENU` ne bouge pas.
 *
 * PUR : ni horloge, ni DOM. Chaque effet lit un chiffre d'ici, et le test
 * vérifie qu'un débutant ne voit rien de ce qu'un joueur lancé voit.
 */

/** Série au-delà de laquelle elle ne fait plus monter l'intensité. */
export const SERIE_PLEINE = 24;

/**
 * L'intensité, 0 → 1.
 *
 * La série pèse plus que le palier : le palier vient tout seul avec le
 * temps, la série se gagne. Une faute (série 0) garde la part du palier —
 * le fond reste tendu, c'est l'euphorie qui retombe.
 */
export function intensite(palier: number, serie: number): number {
  const p = Math.max(0, Math.min(4, palier)) / 4;
  const s = Math.max(0, Math.min(SERIE_PLEINE, serie)) / SERIE_PLEINE;
  return Math.round((p * 0.4 + s * 0.6) * 1000) / 1000;
}

/** Les réglages d'effet dérivés d'une intensité. Tous nuls au repos. */
export interface Effets {
  /** Particules d'une réussite. */
  gerbe: number;
  /** Vitesse de la gerbe. */
  vitesse: number;
  /** Onde de choc autour de la pièce touchée : 0 = aucune. */
  onde: number;
  /** « Coup de poing » du terrain à la réussite, en fraction d'échelle. */
  poing: number;
  /** La série s'affiche au point du clic (« ×12 »). */
  serieVisible: boolean;
  /** Traînées de vitesse autour du terrain, 0 → 1. */
  trainees: number;
  /** Étincelles aux deux têtes du cadre de temps, par seconde. */
  etincelles: number;
  /** Épaisseur du cadre de temps, en px. */
  cadre: number;
  /** Les pièces battent avec le cœur, en fraction d'échelle. */
  pouls: number;
  /** Les pièces d'une manche naissent l'une après l'autre, en ms d'écart. */
  cascade: number;
}

export function effets(i: number): Effets {
  const k = Math.max(0, Math.min(1, i));
  return {
    gerbe: Math.round(8 + k * 22),
    vitesse: Math.round(170 + k * 190),
    onde: k >= 0.15 ? 0.6 + k * 0.8 : 0,
    poing: k >= 0.35 ? 0.004 + (k - 0.35) * 0.012 : 0,
    serieVisible: k >= 0.3,
    trainees: k >= 0.25 ? Math.min(1, (k - 0.25) / 0.6) : 0,
    etincelles: k >= 0.45 ? Math.round(10 + (k - 0.45) * 60) : 0,
    cadre: 4 + Math.round(k * 4),
    pouls: k >= 0.2 ? 0.015 + k * 0.035 : 0,
    cascade: k >= 0.5 ? Math.round(12 + (k - 0.5) * 36) : 0,
  };
}

/**
 * LA RUPTURE — la mort doit casser quelque chose.
 *
 * `t` : ms depuis la mort. Rend l'état de chaque couche : un éclair blanc
 * très court, puis le terrain qui s'éteint, et des fissures qui courent du
 * point de la faute. Un joueur lancé meurt plus fort qu'un débutant — il
 * avait plus à perdre, et c'est ce qui doit se sentir.
 */
export interface Rupture {
  eclair: number;
  voile: number;
  fissure: number;
}

export const RUPTURE_MS = 900;

export function rupture(t: number, i: number): Rupture {
  if (t < 0 || t >= RUPTURE_MS) return { eclair: 0, voile: 0, fissure: 0 };
  const force = 0.7 + Math.max(0, Math.min(1, i)) * 0.3;
  const eclair = t < 110 ? (1 - t / 110) * 0.85 * force : 0;
  const voile = Math.min(1, t / 160) * 0.62 * force;
  const fissure = Math.min(1, Math.max(0, (t - 40) / 260));
  return { eclair, voile, fissure };
}

/**
 * Les rayons d'une fissure, DÉTERMINISTES : une mort qui clignote parce que
 * ses fissures se redessinent au hasard à chaque image se lit comme un bug.
 * Rend des segments (en unités du champ, relatifs au point de la faute).
 */
export function fissures(graine: number, n = 7, longueur = 260): Array<Array<[number, number]>> {
  const alea = (k: number): number => {
    const s = Math.sin(graine * 91.7 + k * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  };
  const rayons: Array<Array<[number, number]>> = [];
  for (let r = 0; r < n; r++) {
    const a0 = (Math.PI * 2 * r) / n + (alea(r) - 0.5) * 0.7;
    const pts: Array<[number, number]> = [[0, 0]];
    let x = 0;
    let y = 0;
    let a = a0;
    const pas = 5;
    const lg = longueur * (0.55 + alea(r + 50) * 0.6);
    for (let k = 1; k <= pas; k++) {
      a += (alea(r * 10 + k) - 0.5) * 0.9;
      x += (Math.cos(a) * lg) / pas;
      y += (Math.sin(a) * lg) / pas;
      pts.push([Math.round(x), Math.round(y)]);
    }
    rayons.push(pts);
  }
  return rayons;
}
