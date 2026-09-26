/**
 * LA MONTÉE — ce que le joueur SENT de l'avancée de la partie.
 *
 * Demandé par Pierre : « trouve un moyen de ressentir vraiment la tension qui
 * monte au fur et à mesure du jeu ». Deux constats avant d'écrire une ligne :
 *
 * - la couche `--heat` peignait son halo en `--ink`. Depuis l'identité
 *   STICKER, `--ink` VAUT LE SABLE DU FOND : le halo était du sable sur du
 *   sable, invisible sur toutes les parties depuis la refonte ;
 * - tout ce qui restait visible — le cadre de temps, son battement — réagit
 *   à la MANCHE en cours, pas à la PARTIE. La manche 3 et la manche 40
 *   commençaient pareil. Rien ne disait « ça monte ».
 *
 * D'où des PALIERS de pression, décidés sur la manche seule. Chacun a un
 * cœur (un battement, audible et visible, dont le tempo s'accélère) et un
 * voile qui assombrit le POURTOUR du terrain, jamais le terrain (n°5, n°10).
 * Un palier franchi se marque une fois : un sursaut, pas un texte — la
 * manche suivante se lit déjà.
 *
 * PUR : aucune horloge, aucun DOM. Le jeu n'en dépend à aucun moment.
 */

export interface Palier {
  /** 0 = échauffement (rien ne bat), 4 = le plus haut. */
  n: 0 | 1 | 2 | 3 | 4;
  /** Période du cœur, en ms. `0` = pas de cœur. */
  battementMs: number;
  /** Opacité du voile au repos, sur le pourtour du terrain. */
  voile: number;
  /** Volume relatif du cœur, 0 → 1. */
  coeur: number;
}

/**
 * Les seuils, en manches APRÈS l'échauffement.
 *
 * Mesuré sur 572 runs (§8) : médiane 12, p75 20, record 201. Le palier 2
 * arrive donc avant la médiane, le 3 au troisième quartile, le 4 chez ceux
 * qui vont loin — chacun rencontre au moins une marche, et la dernière se
 * mérite.
 */
export const SEUILS_TENSION = [0, 7, 15, 25] as const;

const PALIERS: readonly Palier[] = [
  { n: 0, battementMs: 0, voile: 0, coeur: 0 },
  { n: 1, battementMs: 1000, voile: 0.08, coeur: 0.35 },
  { n: 2, battementMs: 820, voile: 0.14, coeur: 0.55 },
  { n: 3, battementMs: 660, voile: 0.22, coeur: 0.75 },
  { n: 4, battementMs: 520, voile: 0.3, coeur: 1 },
];

/**
 * Le palier d'une manche.
 *
 * `grace` : les manches d'échauffement, où rien ne bat — l'erreur n'y coûte
 * rien, et une tension sans enjeu apprendrait à l'ignorer.
 */
export function palierTension(manche: number, grace: number): Palier {
  const apres = manche - grace;
  if (apres < 0) return PALIERS[0]!;
  let n = 1;
  for (let i = 1; i < SEUILS_TENSION.length; i++) if (apres >= SEUILS_TENSION[i]!) n = i + 1;
  return PALIERS[n]!;
}

/**
 * La période du cœur à cet instant.
 *
 * Dans le dernier quart de la fenêtre (`critique`), il s'emballe : la période
 * baisse de 30 %. C'est le seul endroit où la MANCHE module la PARTIE.
 */
export function periodeCoeur(p: Palier, critique: boolean): number {
  if (!p.battementMs) return 0;
  return Math.round(p.battementMs * (critique ? 0.7 : 1));
}

/**
 * L'éclat d'un battement, 0 → 1, à `t` ms du dernier.
 *
 * Deux temps, comme un cœur : « poum-poum », le second plus faible. Le reste
 * de la période est au repos — c'est le silence entre deux qui fait entendre
 * l'accélération.
 */
export function eclatBattement(t: number, periode: number): number {
  if (periode <= 0 || t < 0) return 0;
  const p = (t % periode) / periode;
  const coup = (at: number, force: number, largeur: number): number => {
    const d = p - at;
    return d >= 0 && d < largeur ? force * (1 - d / largeur) : 0;
  };
  return Math.max(coup(0, 1, 0.16), coup(0.2, 0.6, 0.14));
}
