/**
 * L'OBJECTIF DE L'ACCUEIL — ce qu'on donne à battre, avant de jouer.
 *
 * Demandé par Pierre : « le record doit devenir une motivation naturelle à
 * lancer une partie », et « uniquement des données réelles ».
 *
 * ⚠️ **UN SCORE SANS SON MODE EST UN CHIFFRE FAUX**, et c'est la contrainte qui
 * façonne tout ce module. Le run du jour et l'entraînement ne sont pas la même
 * épreuve : même graine et même règle pour tout le monde d'un côté, règle
 * choisie et allure réglable de l'autre. C'est exactement ce que la clé de
 * comparabilité sépare côté serveur, et l'écran ne doit pas défaire ce que le
 * stockage protège. Le mode est donc TOUJOURS affiché à côté du chiffre.
 *
 * ⚠️ **DEUX SOURCES, ET ELLES N'ONT PAS LA MÊME VALEUR.**
 *
 * Le record du RUN DU JOUR vient du classement : il est vérifié par le serveur
 * (`verifyRun` a rejoué le journal), il est VIVANT — il change chaque jour — et
 * il est bien plus atteignable qu'un record de tous les temps. C'est la bonne
 * source, et c'est celle qu'on préfère quand elle répond.
 *
 * Le meilleur connu en ENTRAÎNEMENT est une mesure GELÉE, relevée à la main sur
 * un export d'analytique. Il reste vrai — un joueur a réellement fait ce score,
 * ce jour-là, dans ce mode — mais il ne bougera pas tout seul le jour où
 * quelqu'un le battra. Il sert de repli quand le classement se tait : sans
 * comptes configurés, réseau coupé, ou personne qui n'a encore joué aujourd'hui.
 */

/**
 * Le meilleur score connu en ENTRAÎNEMENT.
 *
 * ⚠️ Ce n'est PAS un record de run du jour, et il ne doit jamais être étiqueté
 * comme tel : il a été fait à une allure d'entraînement, sur une règle choisie.
 * La table `performance` ne contient que des runs du jour vérifiés, donc son
 * maximum n'est pas celui-ci et ne le sera jamais. Quand une route saura servir
 * les records d'entraînement, c'est cette constante qui disparaît.
 */
export const MEILLEUR_CONNU = { score: 201, jour: 245 } as const;

/** D'où vient le chiffre affiché. L'écran en fait une étiquette, jamais l'inverse. */
export type SourceRecord = "jour" | "entrainement";

export interface VueBut {
  /** Le record à battre, et de quelle épreuve il vient. */
  cible: { score: number; source: SourceRecord };
  /** Le chiffre du joueur, quand il en a un. */
  sien: number | null;
  /**
   * Le joueur a-t-il DÉPASSÉ la cible ? Lui opposer un record qu'il bat serait
   * absurde, et lui mentir sur son propre exploit le serait davantage.
   */
  depasse: boolean;
}

/**
 * @param record le meilleur du joueur À SON ALLURE (voir `recordDeSonAllure`)
 * @param recordDuJour le premier du classement du jour, `null` s'il se tait
 */
export function vueBut(record: number, recordDuJour: number | null): VueBut {
  /*
   * Le run du jour l'emporte dès qu'il existe.
   *
   * Il est vérifié, vivant, et bien plus atteignable qu'un record de tous les
   * temps : la médiane du PREMIER run d'un joueur est de 4 manches, et lui
   * opposer 201 ne dit pas « essaie de me battre », ça dit « tu ne seras jamais
   * bon à ce jeu ». Le score du jour, lui, est à sa portée.
   */
  const cible =
    recordDuJour !== null && recordDuJour > 0
      ? { score: recordDuJour, source: "jour" as const }
      : { score: MEILLEUR_CONNU.score, source: "entrainement" as const };

  return {
    cible,
    sien: record > 0 ? record : null,
    depasse: record > 0 && record >= cible.score,
  };
}
