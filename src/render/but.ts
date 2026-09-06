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
 * D'où vient le chiffre affiché. L'écran en fait une étiquette, jamais l'inverse.
 */
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

export interface VueBut {
  /**
   * Le record à battre, et de quelle épreuve il vient.
   *
   * `null` veut dire : personne n'a encore posé de chiffre aujourd'hui, et
   * l'écran a choisi de ne pas en emprunter un ailleurs.
   */
  cible: { score: number; source: SourceRecord } | null;
  /** Le chiffre du joueur, quand il en a un. */
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

export function vueBut(record: number, recordDuJour: number | null): VueButSure;
export function vueBut(
  record: number,
  recordDuJour: number | null,
  repli: "entrainement",
): VueButSure;
export function vueBut(record: number, recordDuJour: number | null, repli: "aucun"): VueBut;
/**
 * @param record le chiffre du joueur, DANS LA MÊME ÉPREUVE que la cible
 * @param recordDuJour le premier du classement du jour, `null` s'il se tait
 * @param repli ce que l'écran fait quand le classement se tait
 */
export function vueBut(
  record: number,
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

  return {
    cible,
    sien: record > 0 ? record : null,
    depasse: cible !== null && record > 0 && record >= cible.score,
  };
}

/* ------------------------------------------------------------------ *
 * CE QUE L'ACCUEIL MET EN HAUT — le chapo, ou le chiffre
 * ------------------------------------------------------------------ */

/** Le bloc de droite (ou du dessous), quand il y en a un. */
export type BlocAccueil = "objectif" | "invitation" | "rien";

export interface VueAccueil {
  /** La phrase qui dit ce QU'EST le jeu. */
  chapo: boolean;
  bloc: BlocAccueil;
}

/**
 * ⚠️ **LE CHAPO NE DOIT PAS CÉDER LA PLACE À UN BLOC QUI N'A RIEN À DIRE.**
 *
 * Relevé en arrivant sur le site avec un `localStorage` vide, à 375 x 812 —
 * c'est-à-dire dans l'état exact des 74 % de visiteurs qui repartent sans
 * lancer une partie, médiane 6 secondes. Le texte INTÉGRAL de la page était :
 *
 *     THE ONE RULE · PERSONNE N'A ENCORE JOUÉ · Sois le premier ·
 *     TENTER LA RUN DU JOUR · SOLO · MULTI · …
 *
 * **Nulle part il n'était dit ce qu'on fait dans ce jeu.** La phrase existait
 * pourtant, écrite et traduite — « Une règle unique. Les consignes changent.
 * Parfois, obéir est la faute. » — mais elle portait `hidden` sous 900 px,
 * chassée par la carte d'objectif.
 *
 * L'arbitrage d'origine était juste sur le fond : 135 px de budget mesurés, et
 * l'accueil tient au pixel près sur un téléphone. Il était faux dans son SENS.
 * Le bloc qui chasse l'explication n'avait rien à dire à la personne qui a
 * besoin de l'explication — pour un nouveau venu, il affichait l'état VIDE du
 * classement, c'est-à-dire « personne ne joue à ce jeu ». C'est la pire phrase
 * d'arrivée possible pour un jeu dont l'accroche est sociale.
 *
 * ⚠️ Et ce n'est pas un cas rare : sans Supabase ni fournisseur OAuth,
 * `classementDuJour` rend `null` pour tout le monde et tous les jours. L'état
 * majoritaire du site supprimait donc la seule phrase qui le vend.
 *
 * **L'invitation garde sa place pour qui connaît déjà le jeu.** « Sois le
 * premier » est une vraie accroche quand on sait qu'un classement quotidien
 * existe ; c'est un constat de désert quand on l'ignore. La même phrase change
 * de sens selon le lecteur, et c'est le seul endroit du dépôt où ça se produit.
 *
 * @param cible   y a-t-il un chiffre à battre aujourd'hui ?
 * @param connait le joueur a-t-il déjà rencontré le jeu (carnet non vide, ou
 *                tutoriel fait) ? Un nouveau venu ne sait pas ce qu'est un
 *                classement du jour.
 * @param large   au-dessus de 900 px, il y a la place pour les deux.
 */
export function vueAccueil(cible: boolean, connait: boolean, large: boolean): VueAccueil {
  // En large, les deux tiennent : la colonne de gauche mesurait 260 px pour
  // 573 à droite, elle était VIDE. Aucune raison de choisir.
  if (large) return { chapo: true, bloc: cible ? "objectif" : "invitation" };
  // Un chiffre à battre vaut mieux qu'une définition : celui qui revient sait
  // déjà ce qu'est le jeu, il vient chercher sa cible.
  if (cible) return { chapo: false, bloc: "objectif" };
  // Sans chiffre : au nouveau venu on explique, à l'habitué on propose.
  return connait ? { chapo: false, bloc: "invitation" } : { chapo: true, bloc: "rien" };
}
