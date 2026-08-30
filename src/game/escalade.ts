/**
 * L'ESCALADE — combien de règles peux-tu tenir à la fois ?
 *
 * Une règle au départ. Tous les `PALIER` manches, une de plus s'ajoute, et
 * elles se tiennent TOUTES en même temps : une consigne devient un piège si
 * elle viole n'importe laquelle d'entre elles.
 *
 * Pourquoi ce mode plutôt qu'un autre : les morts sur la règle unique — donc
 * sur le piège, « le seul élément non copiable du jeu » — sont tombées à 4,1 %
 * au jour 3, parce que cinq règles sur douze seulement piègent. Empiler
 * multiplie les pièges sans écrire une seule règle nouvelle, et le catalogue
 * porte déjà de quoi faire.
 *
 * Le score change aussi de nature. « 18 manches » ne veut rien dire hors
 * contexte ; « j'ai tenu 3 règles » est un plafond, comparable et racontable.
 * Le taux de partage est à 0 %, et c'est peut-être ce qui lui manquait.
 *
 * MESURÉ — proportion de manches PIÉGEUSES, sur 400 manches par point :
 *
 *     catalogue actuel, moyenne des 12 règles     5,4 %
 *     escalade palier 1                          11,3 %   (5,8 % au pire)
 *     escalade palier 2                          23,4 %   (12,0 % au pire)
 *     escalade palier 3                          32,7 %   (25,0 % au pire)
 *     escalade palier 4                          39,4 %   (35,8 % au pire)
 *
 * Le palier 1 double déjà la moyenne, parce que la première règle piège
 * toujours (voir `pileEscalade`). Au palier 4, c'est sept fois.
 *
 * ⚠️ 39 % de manches piégeuses veut dire que quatre manches sur dix demandent
 * de NE RIEN FAIRE. C'est beaucoup, et ça peut basculer d'« exigeant » à
 * « passif » — le jeu deviendrait une épreuve d'inhibition plutôt que de
 * réflexe. Le plafond à 4 est un pari, pas une certitude : c'est la première
 * chose à regarder en soirée, et `PALIER_MAX` est le bouton pour le corriger.
 */
import { ONE_RULES } from "../engine/rules";
import { compatibleAvec } from "../engine/rules/combine";
import { rShuffle } from "../engine/rng";
import type { OneRule, Rng } from "../engine/types";

/** Manches entre deux paliers. Aligné sur la rotation du multi, qui est réglée. */
export const PALIER = 8;

/**
 * Plafond de règles tenues.
 *
 * Au-delà de quatre, le joueur ne sait plus POURQUOI il est mort : l'écran de
 * fin lui annonce un motif parmi quatre contraintes qu'il n'a pas eu le temps
 * de relire. Une mort incompréhensible se lit comme une injustice, et
 * l'injustice est le seul risque que ce projet tient pour fatal. Le plafond
 * n'est pas une limite technique, c'est une limite de lisibilité.
 */
export const PALIER_MAX = 4;

/** Combien de règles à cette manche : 1 au départ, +1 tous les PALIER. */
export const paliersA = (level: number): number =>
  Math.min(PALIER_MAX, 1 + Math.floor(Math.max(0, level) / PALIER));

/**
 * La pile de règles d'un run, tirée d'avance et en entier.
 *
 * Tirée d'un coup plutôt que palier par palier : le run doit être rejouable à
 * l'identique depuis sa seule graine — c'est ce qui permet à `verify.ts` de le
 * revalider côté serveur, et ce qui rendra un jour un classement possible.
 *
 * DEUX CONTRAINTES DE TIRAGE, et aucune n'est cosmétique :
 *
 *   · la PREMIÈRE règle piège. Sept règles sur douze ne piègent jamais ; si le
 *     run s'ouvre sur l'une d'elles, le mode démarre sans dents et le joueur
 *     ne rencontre sa première contrainte réelle qu'au deuxième palier, à la
 *     huitième manche. Or c'est précisément le défaut qu'on corrige.
 *   · chaque ajout doit être compatible avec TOUTE la pile — voir la liste
 *     mesurée dans `combine.ts`, où ÉCLAIR et LE MENTEUR se rendent
 *     mutuellement illisibles.
 *
 * `jouable` filtre en amont ce que l'appareil interdit (touche maintenue,
 * encre) : c'est le même arbitrage que `withoutHold`, appliqué avant le tirage
 * plutôt qu'après, parce qu'ici on ne remplace pas — on choisit.
 */
export function pileEscalade(
  rng: Rng,
  jouable: (r: OneRule) => boolean = () => true,
): OneRule[] {
  const dispo = ONE_RULES.filter(jouable);
  const pieges = rShuffle(rng, dispo.filter((r) => r.traps));
  const reste = rShuffle(rng, dispo.filter((r) => !r.traps));

  const pile: OneRule[] = [];
  if (pieges.length) pile.push(pieges[0]!);

  // On tente d'abord les autres piégeantes : plus la pile en contient, plus le
  // mode fait ce pour quoi il existe.
  for (const r of [...pieges.slice(1), ...reste]) {
    if (pile.length >= PALIER_MAX) break;
    if (compatibleAvec(pile, r)) pile.push(r);
  }
  return pile;
}

/** La pile effectivement tenue à cette manche. */
export const pileA = (pile: readonly OneRule[], level: number): OneRule[] =>
  pile.slice(0, Math.min(pile.length, paliersA(level)));

/** Manches restantes avant le prochain palier, ou null s'il n'y en a plus. */
export function avantPalier(pile: readonly OneRule[], level: number): number | null {
  if (paliersA(level) >= Math.min(pile.length, PALIER_MAX)) return null;
  return PALIER - (level % PALIER);
}
