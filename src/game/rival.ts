/**
 * LE RIVAL DU JOUR — se comparer PENDANT qu'on joue, pas après.
 *
 * Demandé par Pierre : « les gens adorent se comparer ». Tout ce qu'on leur
 * a proposé de DIFFÉRÉ est mort : partage à 0 % sur trois relevés, duel par
 * lien jamais utilisé. La comparaison doit donc arriver là où le joueur est
 * déjà, sur son écran, au moment où elle compte : pendant le run du jour,
 * qui est la même épreuve pour tout le monde (n°11).
 *
 * Deux sources, et une seule loi : **on ne se compare qu'à du REJOUÉ**
 * (n°14). Les scores des amis et la répartition anonyme viennent de la table
 * `performance`, où rien n'entre sans `verifyRun`. Le score du joueur, lui,
 * est son run EN COURS : il se mesure à des faits, il n'en publie aucun.
 *
 * - **Les amis** : le prochain à dépasser est le plus FAIBLE de ceux qui sont
 *   encore devant. On les passe un par un, comme des barreaux. C'est ce qui
 *   rend la comparaison vivante : chaque dépassement est un événement du run,
 *   pas une ligne d'un tableau lu après.
 * - **Sans ami** (ou devant tous) : la répartition du jour, en paliers
 *   nommés — TOP 50 %, 25 %, 10 %, 1 %. Un pourcentage qui bouge à chaque
 *   manche ne se lit pas en 200 ms ; un palier franchi se lit.
 *
 * PUR : ni réseau, ni DOM, ni horloge.
 */

/** Quelqu'un à dépasser : son nom affiché et son score vérifié du jour. */
export interface Adversaire {
  nom: string;
  valeur: number;
}

/** Sous ce nombre de joueurs, un pourcentage ne veut rien dire : on se tait. */
export const JOUEURS_MIN = 10;

/** Les paliers anonymes, du plus facile au plus dur. */
export const PALIERS_TOP = [50, 25, 10, 1] as const;

/** Un nom d'ami tient dans la case du pied : au-delà, il se coupe. */
export const NOM_MAX = 10;

export function nomCourt(pseudo: string): string {
  const p = pseudo.trim().toUpperCase();
  return p.length > NOM_MAX ? `${p.slice(0, NOM_MAX - 1)}…` : p || "?";
}

/**
 * Les amis qui ont un score VÉRIFIÉ aujourd'hui, du plus faible au plus fort.
 * Soi n'en fait pas partie : on se bat contre son propre record ailleurs.
 */
export function adversaires(
  lignes: readonly { pseudo: string; moi: boolean; aujourdhui: { valeur: number } | null }[],
): Adversaire[] {
  return lignes
    .filter((l) => !l.moi && l.aujourdhui && l.aujourdhui.valeur > 0)
    .map((l) => ({ nom: nomCourt(l.pseudo), valeur: l.aujourdhui!.valeur }))
    .sort((a, b) => a.valeur - b.valeur || a.nom.localeCompare(b.nom));
}

/**
 * Le prochain à dépasser : le plus faible de ceux qu'on n'a PAS encore
 * dépassés. À égalité on n'a pas dépassé — il faut une manche de plus.
 */
export function prochainRival(advs: readonly Adversaire[], score: number): Adversaire | null {
  return advs.find((a) => a.valeur >= score) ?? null;
}

/** Ceux qu'on vient de dépasser en passant de `avant` à `apres`. */
export function depasses(advs: readonly Adversaire[], avant: number, apres: number): Adversaire[] {
  return advs.filter((a) => a.valeur >= avant && a.valeur < apres);
}

/** Manches qui manquent pour DÉPASSER (et non égaler) un score. */
export function manquePour(valeur: number, score: number): number {
  return Math.max(0, valeur + 1 - score);
}

/**
 * La part des joueurs du jour que ce score DÉPASSE strictement, 0 → 100.
 * `scores` : les scores vérifiés du jour, dans n'importe quel ordre.
 * `null` sous `JOUEURS_MIN` joueurs.
 */
export function partDepassee(scores: readonly number[], score: number): number | null {
  if (scores.length < JOUEURS_MIN) return null;
  const dessous = scores.filter((v) => v < score).length;
  return Math.floor((dessous * 100) / scores.length);
}

/**
 * Le score à dépasser pour entrer dans le TOP `pct` % : il faut faire mieux
 * que `100 − pct` % des joueurs. Rend le plus petit score qui y suffit.
 */
export function seuilTop(scores: readonly number[], pct: number): number {
  const tries = [...scores].sort((a, b) => a - b);
  const vise = 100 - pct;
  // Le plus petit s tel que partDepassee(s) >= vise. Les candidats utiles
  // sont les scores existants + 1 (dépasser strictement).
  for (const v of [0, ...tries.map((x) => x + 1)]) {
    const dessous = tries.filter((x) => x < v).length;
    if ((dessous * 100) / tries.length >= vise) return v;
  }
  return (tries[tries.length - 1] ?? 0) + 1;
}

/** Le prochain palier anonyme à franchir, ou `null` (trop peu de joueurs, ou au sommet). */
export function prochainPalier(
  scores: readonly number[],
  score: number,
): { top: number; valeur: number } | null {
  if (scores.length < JOUEURS_MIN) return null;
  for (const top of PALIERS_TOP) {
    const valeur = seuilTop(scores, top);
    if (score < valeur) return { top, valeur };
  }
  return null;
}

/**
 * La CIBLE du pied pendant le run : un ami d'abord (un nom se bat mieux qu'un
 * pourcentage), puis le palier anonyme, sinon rien — le pied retombe alors
 * sur « SUR 40 ».
 */
export type Cible =
  | { kind: "ami"; nom: string; valeur: number }
  | { kind: "top"; top: number; valeur: number }
  | null;

export function cibleDuPied(advs: readonly Adversaire[], scores: readonly number[], score: number): Cible {
  const r = prochainRival(advs, score);
  if (r) return { kind: "ami", nom: r.nom, valeur: r.valeur };
  const p = prochainPalier(scores, score);
  // Le pied montre le score À ATTEINDRE ; `valeur` d'un ami est son score, on
  // le montre tel quel (« LÉA · 14 ») et on le dépasse à 15.
  return p ? { kind: "top", top: p.top, valeur: p.valeur } : null;
}

/**
 * Ce que la carte de mort dit du rival. Un identifiant, jamais une phrase.
 *
 * Priorité : un DÉPASSEMENT fait pendant ce run d'abord (c'est un exploit, il
 * se raconte), puis un ami qu'on a presque eu, puis le rang anonyme.
 */
export type LigneRival =
  | { kind: "depasse"; noms: string[] }
  | { kind: "presque"; nom: string; manque: number }
  | { kind: "part"; part: number }
  | null;

export function ligneRival(
  advs: readonly Adversaire[],
  scores: readonly number[],
  depart: number,
  score: number,
  presque: (manque: number, valeur: number) => boolean,
): LigneRival {
  const passes = depasses(advs, depart, score);
  if (passes.length) return { kind: "depasse", noms: passes.map((a) => a.nom).reverse() };
  const r = prochainRival(advs, score);
  if (r) {
    const manque = manquePour(r.valeur, score);
    if (presque(manque, r.valeur)) return { kind: "presque", nom: r.nom, manque };
  }
  const part = partDepassee(scores, score);
  return part !== null && part > 0 ? { kind: "part", part } : null;
}
