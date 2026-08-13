/**
 * Classement.
 *
 * Deux corrections au Elo scolaire, imposées par la nature du jeu :
 *
 *  1. LA MARGE COMPTE. Le jeu a une variance énorme — un piège raté à la
 *     quatrième manche et c'est fini. Gagner 31 à 4 n'est pas gagner 19 à 18.
 *     Sans pondération, le classement paraît aléatoire, et il l'est un peu.
 *
 *  2. PLANCHER PAR DIVISION. On ne redescend pas d'une division déjà atteinte.
 *     C'est ce qui empêche d'abandonner après trois défaites, et ça ne coûte
 *     rien à l'intégrité du haut de classement.
 */

export interface Division {
  id: string;
  name: string;
  floor: number;
}

/** Le plancher d'une division est aussi le seuil pour y entrer. */
export const DIVISIONS: Division[] = [
  { id: "bois", name: "BOIS", floor: 0 },
  { id: "bronze", name: "BRONZE", floor: 900 },
  { id: "argent", name: "ARGENT", floor: 1100 },
  { id: "or", name: "OR", floor: 1300 },
  { id: "platine", name: "PLATINE", floor: 1500 },
  { id: "obsidienne", name: "OBSIDIENNE", floor: 1750 },
];

export const START_RATING = 1000;

export function divisionOf(rating: number): Division {
  let d = DIVISIONS[0]!;
  for (const x of DIVISIONS) if (rating >= x.floor) d = x;
  return d;
}

/** Un joueur neuf bouge vite, un joueur installé bouge lentement. */
export function kFactor(games: number, rating: number): number {
  if (games < 10) return 60;
  if (games < 30) return 40;
  return rating >= 1500 ? 20 : 28;
}

export const expectedScore = (a: number, b: number): number =>
  1 / (1 + Math.pow(10, (b - a) / 400));

/**
 * Poids de la marge, borné entre 0,5 et 1,5.
 *
 * Une victoire d'un cheveu vaut la moitié d'une victoire écrasante. Le
 * logarithme évite qu'un score de 60 contre 2 ne fasse exploser le classement.
 */
export function marginWeight(mine: number, theirs: number): number {
  const diff = Math.abs(mine - theirs);
  const base = Math.max(4, (mine + theirs) / 2);
  return Math.min(1.5, Math.max(0.5, 0.55 + Math.log1p(diff / base) * 0.95));
}

export interface MatchResult {
  rating: number;
  games: number;
  /** meilleure division jamais atteinte : sert de plancher */
  peakFloor: number;
  myScore: number;
  theirScore: number;
  theirRating: number;
}

export interface RatingChange {
  rating: number;
  delta: number;
  division: Division;
  promoted: boolean;
  floored: boolean;
  peakFloor: number;
}

export function applyMatch(r: MatchResult): RatingChange {
  const before = divisionOf(r.rating);
  const outcome = r.myScore > r.theirScore ? 1 : r.myScore === r.theirScore ? 0.5 : 0;
  const exp = expectedScore(r.rating, r.theirRating);
  const w = outcome === 0.5 ? 1 : marginWeight(r.myScore, r.theirScore);

  const raw = r.rating + kFactor(r.games, r.rating) * w * (outcome - exp);

  // le plancher ne s'applique qu'à la baisse, et jamais au-delà d'un palier
  const floor = Math.max(0, r.peakFloor);
  const rating = Math.round(Math.max(floor, raw));
  const after = divisionOf(rating);

  return {
    rating,
    delta: rating - r.rating,
    division: after,
    promoted: after.floor > before.floor,
    floored: raw < floor,
    peakFloor: Math.max(floor, after.floor),
  };
}

/**
 * Fenêtre d'appariement.
 *
 * Elle s'élargit avec l'attente : mieux vaut un adversaire imparfait qu'une
 * file vide. À 25 secondes, on accepte n'importe qui — un joueur qui attend
 * est un joueur qui ferme l'onglet.
 */
export function searchWindow(waitedMs: number): number {
  return Math.min(1200, 90 + (waitedMs / 1000) * 90);
}
