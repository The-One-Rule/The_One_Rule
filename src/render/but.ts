/**
 * L'OBJECTIF DE L'ACCUEIL — ce qu'on donne à battre, avant de jouer.
 *
 * Demandé par Pierre : « le record doit devenir une motivation naturelle à
 * lancer une partie ».
 *
 * ⚠️ **MONTRER 201 À UN DÉBUTANT NE MOTIVE PAS, ÇA ÉCRASE.** La médiane du
 * PREMIER run d'un joueur est de **4 manches**. Face à un record de 201, c'est
 * un facteur cinquante : ça ne dit pas « essaie de me battre », ça dit « tu ne
 * seras jamais bon à ce jeu ». Le record est le bon moteur pour quelqu'un qui
 * fait déjà quarante ; c'est un mur pour quelqu'un qui fait quatre.
 *
 * D'où la règle : **rien tant que le joueur n'a pas un chiffre à lui.** Le
 * meilleur connu n'apparaît qu'à CÔTÉ du sien, jamais à la place — un horizon,
 * pas un mur. Avant ça, l'accueil garde son chapo, qui dit ce qu'EST le jeu :
 * c'est ce dont un nouveau venu a besoin, et il n'a pas encore de relation avec
 * un score.
 *
 * ⚠️ **UN SCORE SANS SON MODE EST UN CHIFFRE FAUX.** Le 201 a été fait en
 * ENTRAÎNEMENT, à une allure donnée. Le poser nu à côté du bouton du run du
 * jour comparerait deux épreuves différentes — c'est exactement ce que la clé
 * de comparabilité empêche côté serveur, et l'écran ne doit pas défaire ce que
 * le stockage protège.
 *
 * Comme `plate.ts`, `seat.ts` et `jour.ts`, ce module est PUR et rend une
 * donnée, jamais une phrase : son test dit quelle branche a gagné, pas à quoi
 * ressemblait le français.
 */

/**
 * Le meilleur score connu, et d'où il vient.
 *
 * ⚠️ **C'est une mesure GELÉE, et c'est une dette assumée.** Aucune route ne
 * sert ce chiffre : il a été relevé à la main sur un export d'analytique. La
 * table `performance` ne contient que des runs du JOUR vérifiés, donc son
 * maximum n'est pas celui-ci et ne le sera jamais.
 *
 * Il reste vrai — un joueur a réellement fait ce score, ce jour-là, dans ce
 * mode — mais il ne bougera pas tout seul le jour où quelqu'un le battra.
 * Quand une route saura le servir, c'est cette constante qui disparaît.
 */
export const MEILLEUR_CONNU = { score: 201, mode: "entrainement", jour: 245 } as const;

export interface VueBut {
  /** Le chiffre du joueur, mis en avant. */
  valeur: number;
  /**
   * L'horizon montré À CÔTÉ du sien. `null` quand le joueur a DÉPASSÉ le
   * meilleur connu : lui opposer un record qu'il bat serait absurde, et lui
   * mentir sur son propre exploit le serait davantage.
   */
  horizon: { score: number; mode: string } | null;
}

/**
 * Ce que l'accueil annonce, ou `null` s'il n'a rien à annoncer.
 *
 * @param record le meilleur du joueur À SON ALLURE (voir `recordDeSonAllure`)
 */
export function vueBut(record: number): VueBut | null {
  if (record <= 0) return null;
  return {
    valeur: record,
    horizon:
      record >= MEILLEUR_CONNU.score
        ? null
        : { score: MEILLEUR_CONNU.score, mode: MEILLEUR_CONNU.mode },
  };
}
