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

/**
 * Médiane de tous les runs, gelée sur le relevé de 572 runs (jours 238-245).
 * L'écran de fin s'en sert pour situer le score, pas pour le juger.
 */
export const MEDIANE_CONNUE = 12;

/** D'où vient le chiffre affiché. L'écran en fait une étiquette, jamais l'inverse. */
export type SourceRecord = "jour" | "entrainement";

/**
 * Ce qu'un écran fait quand le classement du jour se tait.
 *
 * Les deux écrans qui montrent une cible n'ont pas le même besoin, et c'est
 * pour ça que le repli est un PARAMÈTRE plutôt qu'une règle du module :
 *
 * · `"entrainement"` — LE MUR DES RECORDS. Un mur qui n'affiche aucun record
 *   n'est plus un mur. Le meilleur connu en entraînement y est légitime parce
 *   que l'écran l'étiquette comme tel, et qu'il n'y prétend jamais être un run
 *   du jour.
 *
 * · `"aucun"` — L'ACCUEIL. La carte y parle du RUN DU JOUR et de rien d'autre.
 *   Y glisser un record d'entraînement mettrait deux épreuves sous le même
 *   chiffre, ce que tout ce module existe pour interdire. Sans cible, l'écran
 *   dit qu'il n'y en a pas encore — et c'est une invitation, pas un trou.
 */
export type Repli = "entrainement" | "aucun";

/**
 * Les deux chiffres du joueur, un par EPREUVE.
 *
 * ⚠️ C'EST LA CORRECTION D'UN VRAI DEFAUT, et il touchait le mur des records.
 *
 * `vueBut` recevait UN seul nombre, et l'appelant devait deviner lequel. Le
 * mur passait `recordDeSonAllure` — le record d'ENTRAINEMENT — pendant que la
 * cible, elle, venait du classement du JOUR des que celui-ci repondait. On
 * comparait donc un record fait a une allure choisie sur une regle choisie au
 * meilleur du jour, ou tout le monde joue la meme graine et la meme regle :
 * « il te manque 170 manches » ne voulait rien dire.
 *
 * En prenant les DEUX, le module choisit celui qui correspond a la cible qu'il
 * vient lui-meme d'elire. L'appelant ne peut plus se tromper — c'est la seule
 * facon de rendre l'invariant structurel plutot que de compter dessus.
 */
export interface SiennesDuJoueur {
  /** Son score au RUN DU JOUR d'aujourd'hui, `null` s'il n'a pas joue. */
  jour: number | null;
  /** Son record en ENTRAINEMENT, a son allure. `0` s'il n'en a pas. */
  entrainement: number;
}

export interface VueBut {
  /**
   * Le record à battre, et de quelle épreuve il vient.
   *
   * `null` veut dire : personne n'a encore posé de chiffre aujourd'hui, et
   * l'écran a choisi de ne pas en emprunter un ailleurs.
   */
  cible: { score: number; source: SourceRecord } | null;
  /**
   * Le chiffre du joueur DANS L'EPREUVE DE LA CIBLE, quand il en a un.
   *
   * Jamais celui de l'autre epreuve : un score sans son mode est un chiffre
   * faux, et deux chiffres de deux epreuves cote a cote le sont deux fois.
   */
  sien: number | null;
  /**
   * Le joueur a-t-il DÉPASSÉ la cible ? Lui opposer un record qu'il bat serait
   * absurde, et lui mentir sur son propre exploit le serait davantage.
   *
   * Toujours `false` sans cible : on ne dépasse pas ce qui n'existe pas.
   */
  depasse: boolean;
}

/**
 * Une vue dont la cible est GARANTIE — celle du repli « entrainement ».
 *
 * Le type dit ce que le code sait : avec ce repli, `MEILLEUR_CONNU` prend
 * toujours le relais, donc la cible ne peut pas manquer. Sans ces surcharges,
 * le mur des records devrait écrire une garde `if (!cible) return` qui ne
 * s'exécuterait jamais — du code mort qui ressemble à une fonctionnalité, et
 * ce dépôt en a déjà payé deux cette semaine.
 */
export type VueButSure = VueBut & { cible: NonNullable<VueBut["cible"]> };

export function vueBut(siennes: SiennesDuJoueur, recordDuJour: number | null): VueButSure;
export function vueBut(
  siennes: SiennesDuJoueur,
  recordDuJour: number | null,
  repli: "entrainement",
): VueButSure;
export function vueBut(
  siennes: SiennesDuJoueur,
  recordDuJour: number | null,
  repli: "aucun",
): VueBut;
/**
 * @param siennes ses deux chiffres — le module prend celui de la bonne épreuve
 * @param recordDuJour le premier du classement du jour, `null` s'il se tait
 * @param repli ce que l'écran fait quand le classement se tait
 */
export function vueBut(
  siennes: SiennesDuJoueur,
  recordDuJour: number | null,
  repli: Repli = "entrainement",
): VueBut {
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
      : repli === "entrainement"
        ? { score: MEILLEUR_CONNU.score, source: "entrainement" as const }
        : null;

  // Le chiffre du joueur SUIT la cible : c'est tout l'objet de ce module.
  const brut =
    cible === null ? null : cible.source === "jour" ? siennes.jour : siennes.entrainement;
  const sien = brut !== null && brut > 0 ? brut : null;

  return {
    cible,
    sien,
    depasse: cible !== null && sien !== null && sien >= cible.score,
  };
}
