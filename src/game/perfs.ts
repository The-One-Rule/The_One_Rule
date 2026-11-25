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

import { cleComparaison } from "../../shared/compte.js";
import { VERSION_CONTENU } from "../engine/version.js";

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
export const cleEscalade = (cameleon = false): string =>
  cleComparaison({
    mode: "escalade",
    // LE CAMÉLÉON a SON record : tenir quatre règles l'une après l'autre
    // n'est pas tenir quatre règles à la fois. Absent du régime sinon, donc
    // la clé de LA PILE ne bouge pas d'un caractère.
    regime: cameleon ? { cameleon: 1 } : {},
    versionContenu: VERSION_CONTENU,
  });

/*
 * ⚠️ IL Y AVAIT ICI UN `clePour(mode, opts)`, ET IL EST SUPPRIME.
 *
 * Personne ne l'appelait : les trois clés se fabriquent chacune sur son site
 * d'usage, où le mode est connu statiquement — un répartiteur n'y ajoutait
 * rien. C'est le troisième code mort de la semaine qui ressemblait à une
 * fonctionnalité livrée, après `changeIdentite` et `inscritRecord`.
 *
 * Et celui-là portait une MINE : `cleDuJour(opts.jour ?? 0)`. Le jour par
 * défaut à zéro, c'est-à-dire le 1er janvier 2026 — exactement la famille de
 * défaut qui vient de faire servir un classement vide par `api/perf.ts`.
 * Le jour qui suivait où quelqu'un l'aurait rebranché sans passer `jour`, la
 * performance serait partie sous la clé d'un autre jour, en silence, et une
 * clé de comparabilité fausse ne se rattrape pas après coup.
 */

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
