/**
 * CE QUE L'ÉCRAN DE FIN PROPOSE — et ce qu'il doit taire.
 *
 * ⚠️ **RAPPORTÉ EN PLAYTEST** : « les boutons sont mal répartis et certains
 * buguent vraiment, le bouton rejouer qui n'amène pas exactement à l'escalier
 * par exemple, ou littéralement pas de bouton niveau suivant ».
 *
 * Les deux moitiés sont vraies, et la seconde explique la première. L'écran
 * affichait **cinq boutons en toutes circonstances** — REJOUER, PARTAGER, CARTE
 * À PARTAGER, DÉFIER UN AMI, MENU — dont seuls deux changeaient d'état. Après
 * un palier d'escalier, quatre d'entre eux n'avaient aucun sens, et le
 * cinquième portait un mot faux : « REJOUER » lançait en réalité le palier
 * SUIVANT.
 *
 * ⚠️ **SIXIÈME MODULE DE PRIORITÉ PURE** du dépôt, après `plate`, `seat`,
 * `jour`, `but` et `exploit`. Cinq conditions s'excluent — classé, duel,
 * palier, run du jour épuisé, run ordinaire — et une exclusion à cinq branches
 * écrite en ternaires dans le rendu se lit juste et se comporte faux. Quatre
 * des cinq précédentes ont été extraites APRÈS un bug.
 *
 * ⚠️ **POURQUOI LE PARTAGE ET LE DÉFI DISPARAISSENT APRÈS UN PALIER**, et ce
 * n'est pas une question d'encombrement :
 *
 *   · un score de palier est PLAFONNÉ par construction — « 15 / 15 » est la
 *     cible qu'on a fixée au joueur, pas une performance. La partager ne dit
 *     rien à personne ;
 *   · et surtout, un DÉFI rejoue une graine avec une règle, jamais une
 *     configuration de palier : `lanceRun` ignore explicitement le palier dès
 *     que `challenge` est posé. Le bouton proposerait donc à un ami une partie
 *     qui n'est PAS celle qu'on vient de jouer. Un aperçu qui contredit ce
 *     qu'il annonce est la famille de défauts que ce dépôt tient pour fatale.
 */

/** L'action principale de l'écran. Un identifiant, jamais une phrase. */
export type ActionFin =
  | "suivant"
  | "reprendre"
  | "rejouer"
  | "revanche"
  | "matchSuivant"
  | "demain";

export interface VueActionsFin {
  /** Ce que fait, et ce que dit, le bouton principal. */
  principale: ActionFin;
  /** Vrai quand il n'y a plus rien à relancer — il reste visible, et il explique. */
  bloquee: boolean;
  /** Le retour à la montée. N'existe qu'après un palier. */
  escalier: boolean;
  /** PARTAGER et CARTE À PARTAGER. */
  partage: boolean;
  /** DÉFIER UN AMI. */
  duel: boolean;
}

export interface EtatFin {
  mode: "daily" | "training" | "escalade" | "ranked";
  /** Ce run rejouait la partie de quelqu'un. */
  duel: boolean;
  /** Ce run était un palier de l'escalier. */
  surPalier: boolean;
  /** Le palier a-t-il été franchi ? Sans objet hors palier. */
  palierFranchi: boolean;
  /** Reste-t-il un palier au-dessus ? Faux au sommet. */
  palierSuivant: boolean;
  /** Essais restants au run du jour. Sans objet ailleurs. */
  essaisRestants: number;
  /** Le run a-t-il produit assez de temps de passage pour lancer un défi ? */
  duelPossible: boolean;
}

export function actionsDeFin(e: EtatFin): VueActionsFin {
  /*
   * L'ordre EST la priorité, et chaque cran écarte le suivant pour une raison
   * qui lui est propre — pas pour faire de la place.
   */

  // 1. Le classé enchaîne : nouvelle graine, nouvel adversaire, jamais deux
  //    fois le même match. Rien d'autre ne s'y propose.
  if (e.mode === "ranked") {
    return {
      principale: "matchSuivant",
      bloquee: false,
      escalier: false,
      partage: false,
      duel: false,
    };
  }

  // 2. Un duel se rejoue à l'identique — c'est la seule façon de comparer. Le
  //    partage reste (on a un score à raconter) ; DÉFIER, non : on y est déjà.
  if (e.duel) {
    return { principale: "revanche", bloquee: false, escalier: false, partage: true, duel: false };
  }

  // 3. Un palier. Le mot du bouton dit ce qui va VRAIMENT se passer, et le
  //    retour à la montée existe enfin.
  if (e.surPalier) {
    const principale = e.palierFranchi && e.palierSuivant ? "suivant" : "reprendre";
    return {
      principale,
      // Au sommet, « reprendre » relance le dernier palier : jamais bloqué,
      // parce qu'un exercice se refait autant qu'on veut.
      bloquee: false,
      escalier: true,
      partage: false,
      duel: false,
    };
  }

  // 4. Le run du jour, une fois ses trois essais consommés. Le bouton reste
  //    VISIBLE et bloqué plutôt que de disparaître : un bouton qui s'efface se
  //    lit comme une panne, un bouton qui dit « reviens demain » est une règle.
  if (e.mode === "daily" && e.essaisRestants <= 0) {
    return { principale: "demain", bloquee: true, escalier: false, partage: true, duel: e.duelPossible };
  }

  return {
    principale: "rejouer",
    bloquee: false,
    escalier: false,
    partage: true,
    duel: e.duelPossible,
  };
}
