/**
 * CE QUE « MAÎTRISER UNE RÈGLE » VEUT DIRE.
 *
 * Pur et à part pour la même raison que `render/plate.ts` et `render/seat.ts` :
 * ce n'est pas un calcul, c'est une DÉCISION — et une décision écrite en `if`
 * successifs au milieu d'une fonction de rendu se lit juste et se comporte
 * faux. Ici elle décide de ce que l'entraînement récompense, donc de ce que
 * les joueurs vont s'entraîner à faire.
 *
 * ⚠️ LE PIÈGE VAUT PLUS QUE LES MANCHES, ET C'EST MESURÉ.
 *
 * Ouvrir le catalogue d'entraînement était le bon correctif : les règles vues
 * sont passées de 1 à 12. Mais il a eu un effet de bord que personne n'avait
 * prévu — les morts sur la RÈGLE UNIQUE, c'est-à-dire sur le piège, sont
 * tombées de 42,9 % à 4,1 %. La cause est mécanique : cinq règles sur douze
 * seulement portent `traps`.
 *
 * S'entraîner règle par règle pousse dans le même sens, et plus fort : une
 * règle piégeuse seule ne produit que ~11 % de manches piégeuses (mesuré,
 * palier 1 de l'escalade), et les sept règles sans piège en produisent ZÉRO.
 * Un joueur qui accumulerait des manches sur LE JUMEAU deviendrait meilleur à
 * la moitié COPIABLE de TOR — des réflexes sous contrainte — sans jamais
 * s'approcher de ce qui le distingue d'un jeu de réflexes ordinaire.
 *
 * D'où la condition en deux temps, qui tient en une phrase : il faut avoir
 * tenu, ET avoir déjoué un piège quand la règle sait en poser.
 */
import type { OneRule } from "../engine/types";
import type { RuleRecord } from "./progress";

/**
 * Le palier de manches. C'est un PREMIER CHIFFRE, pas une mesure.
 *
 * Rien ne le fonde encore : la session médiane du jour 3 était de 4 manches,
 * le run du jour en fait 40, et on n'a aucune distribution de scores en
 * entraînement — le mode existait à peine. 15 est choisi pour être atteignable
 * en une bonne partie à l'allure DÉCOUVERTE sans être une formalité.
 *
 * ⚠️ À REMESURER au premier playtest qui donne des scores d'entraînement. Si
 * la moitié des joueurs maîtrise tout le catalogue en une soirée, il est trop
 * bas ; si personne n'atteint rien, il est trop haut. Le chiffre est ici et
 * nulle part ailleurs, exprès.
 */
export const MANCHES_MAITRISE = 15;

/**
 * Cette règle est-elle maîtrisée ?
 *
 * `rec` absent = jamais rencontrée. Une règle jamais rencontrée n'est pas
 * « non maîtrisée », elle est VERROUILLÉE — c'est l'appelant qui distingue les
 * deux, parce que l'écran ne les montre pas pareil.
 */
export function estMaitrisee(regle: OneRule, rec: RuleRecord | undefined): boolean {
  if (!rec) return false;
  /*
   * ⚠️ UNE SEULE MAÎTRISE, ET C'EST LE BOSS DU CHAPITRE.
   *
   * Trois définitions coexistaient — ce seuil, l'échelle à six cases, le
   * palier 15 de l'escalier — et une carte pouvait être « maîtrisée » au
   * carnet, à 3/6 sur sa fiche et au palier 4 de sa montée. Le mot le plus
   * fort du jeu ne voulait plus rien dire.
   *
   * Le parcours tranche : battre le boss du chapitre, c'est maîtriser la
   * règle. Les deux anciennes voies restent reconnues pour ce qu'elles ont
   * DÉJÀ donné — personne ne perd une carte le jour du déploiement — mais le
   * seuil d'entraînement ne compte plus dès que la règle a été jouée au
   * parcours : on ne peut pas y contourner le boss.
   */
  if ((rec.etoiles?.[4] ?? 0) > 0) return true;
  if ((rec.escalier?.palier ?? 0) >= 15) return true;
  if (rec.etoiles) return false;
  if (rec.best < MANCHES_MAITRISE) return false;
  // Une règle qui ne piège pas ne peut pas exiger un piège déjoué : la barre
  // serait inatteignable pour sept règles sur douze.
  return !regle.traps || (rec.pieges ?? 0) >= 1;
}

/** Ce qui manque encore, pour l'afficher plutôt que de laisser deviner. */
export function resteAMaitriser(
  regle: OneRule,
  rec: RuleRecord | undefined,
): { manches: number; piege: boolean } {
  const best = rec?.best ?? 0;
  return {
    manches: Math.max(0, MANCHES_MAITRISE - best),
    piege: !!regle.traps && (rec?.pieges ?? 0) < 1,
  };
}
