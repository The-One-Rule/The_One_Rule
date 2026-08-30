/**
 * Ce qu'est une performance, et sous quelle clé elle se range.
 *
 * Module PUR : pas de DOM, pas de réseau, pas d'horloge. Il tourne à
 * l'identique dans le navigateur et dans la fonction edge, ce qui est la
 * condition pour que les deux rangent un même run au même endroit — sans quoi
 * un record disparaîtrait au premier changement d'appareil, sans erreur et
 * sans que personne ne sache pourquoi.
 *
 * LA RÈGLE, héritée de `game/progress.ts` et généralisée : deux performances
 * ne se comparent qu'à CLÉ ÉGALE. Le commentaire d'origine ne parlait que de
 * `bestTraining` — « un record obtenu en DÉCOUVERTE ne se compare pas à un
 * record obtenu en RAPIDE » — mais la propriété vaut pour tout : une allure,
 * un nombre de vies, une règle ajoutée au catalogue changent ce qu'un chiffre
 * veut dire.
 *
 * Aucun classement n'est construit ici, et c'est délibéré : ce fichier pose
 * l'infrastructure qui en rendra un possible, rien de plus.
 */

import { cleComparaison } from "../../shared/compte";
import { VERSION_CONTENU } from "../engine/version";

/**
 * Les modes qui produisent une performance enregistrable.
 *
 * `multi` n'y est pas, et ce n'est pas un oubli : gagner à deux ne vaut pas
 * gagner à dix, les salons sont privés à code, donc deux amis produisent cent
 * victoires en une soirée. Le multijoueur mérite un historique personnel, pas
 * un rang — et surtout pas avant que des salons publics existent.
 */
export type ModePerf = "daily" | "training" | "escalade";

/** Le régime : la signature du réglage, ce qui rend deux runs comparables. */
export type Regime = Record<string, string | number | boolean>;

/**
 * Le run du jour : même graine et même règle pour tout le monde, donc le seul
 * mode dont deux résultats se comparent DIRECTEMENT. Le jour entre dans la
 * clé — c'est ce qui en fera un classement quotidien le jour venu, et c'est
 * aussi ce qui borne naturellement la triche : une soumission par compte et
 * par jour.
 */
export const cleDuJour = (jour: number): string =>
  cleComparaison({ mode: "daily", regime: {}, versionContenu: VERSION_CONTENU, jour });

/**
 * L'entraînement porte son allure. `PACE_DEFAULT` n'a rien de privilégié ici :
 * chaque allure a sa propre clé, donc son propre record, et aucune ne pollue
 * l'autre. C'est plus honnête que l'ancienne règle — qui n'inscrivait un
 * record qu'à l'allure de référence et jetait purement et simplement les
 * autres.
 */
export const cleEntrainement = (allure: number): string =>
  cleComparaison({
    mode: "training",
    regime: { pace: allure },
    versionContenu: VERSION_CONTENU,
  });

/**
 * L'escalade se mesure en RÈGLES TENUES, pas en manches.
 *
 * ⚠️ C'est un excellent axe de vantardise et un mauvais axe de classement :
 * le plafond est à quatre, donc au plus quatre valeurs distinctes et des
 * ex æquo massifs. `valeur2` porte le départage — les manches — et il faudra
 * l'utiliser le jour où quelqu'un voudra en tirer un rang.
 */
export const cleEscalade = (): string =>
  cleComparaison({ mode: "escalade", regime: {}, versionContenu: VERSION_CONTENU });

/** La clé d'une performance, quel que soit le mode. */
export function clePour(mode: ModePerf, opts: { allure?: number; jour?: number }): string {
  if (mode === "daily") return cleDuJour(opts.jour ?? 0);
  if (mode === "training") return cleEntrainement(opts.allure ?? 1);
  return cleEscalade();
}

/**
 * Une performance prête à être enregistrée.
 *
 * `valeur` est ce qui se compare, `valeur2` ce qui départage. Les deux sont
 * des entiers, et l'ordre est toujours « plus grand vaut mieux » sauf pour un
 * départage au TEMPS, où il s'inverse — d'où `valeur2Croissante`, qui dit
 * laquelle des deux lectures s'applique et évite qu'un futur classement
 * l'inverse en silence.
 */
export interface Performance {
  mode: ModePerf;
  cle: string;
  valeur: number;
  valeur2: number;
  valeur2Croissante: boolean;
  /** Le jour, pour un run à graine partagée. */
  jour?: number;
  graine: number;
  /** L'identifiant de la règle, ou de la première règle d'une pile. */
  regle: string;
}
