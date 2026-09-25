/**
 * CE QUE L'ÉCRAN DE FIN PROPOSE — et ce qu'il doit taire.
 *
 * L'écran affichait **cinq boutons en toutes circonstances** — REJOUER,
 * PARTAGER, CARTE À PARTAGER, DÉFIER UN AMI, MENU — dont seuls deux
 * changeaient d'état.
 *
 * ⚠️ **SIXIÈME MODULE DE PRIORITÉ PURE** du dépôt, après `plate`, `seat`,
 * `jour`, `but` et `exploit`. Quatre conditions s'excluent — classé, duel,
 * run du jour épuisé, run ordinaire — et une exclusion écrite en ternaires
 * dans le rendu se lit juste et se comporte faux.
 *
 * Un niveau du parcours n'arrive jamais ici : il a son propre écran de fin.
 */

/** L'action principale de l'écran. Un identifiant, jamais une phrase. */
export type ActionFin =
  | "rejouer"
  | "revanche"
  | "matchSuivant"
  | "demain";

export interface VueActionsFin {
  /** Ce que fait, et ce que dit, le bouton principal. */
  principale: ActionFin;
  /** Vrai quand il n'y a plus rien à relancer — il reste visible, et il explique. */
  bloquee: boolean;
  /** PARTAGER et CARTE À PARTAGER. */
  partage: boolean;
  /** DÉFIER UN AMI. */
  duel: boolean;
}

export interface EtatFin {
  mode: "daily" | "training" | "escalade" | "ranked";
  /** Ce run rejouait la partie de quelqu'un. */
  duel: boolean;
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
      partage: false,
      duel: false,
    };
  }

  // 2. Un duel se rejoue à l'identique — c'est la seule façon de comparer. Le
  //    partage reste (on a un score à raconter) ; DÉFIER, non : on y est déjà.
  if (e.duel) {
    return { principale: "revanche", bloquee: false, partage: true, duel: false };
  }

  // 3. Le run du jour, une fois ses trois essais consommés. Le bouton reste
  //    VISIBLE et bloqué plutôt que de disparaître : un bouton qui s'efface se
  //    lit comme une panne, un bouton qui dit « reviens demain » est une règle.
  if (e.mode === "daily" && e.essaisRestants <= 0) {
    return { principale: "demain", bloquee: true, partage: true, duel: e.duelPossible };
  }

  return {
    principale: "rejouer",
    bloquee: false,
   
    partage: true,
    duel: e.duelPossible,
  };
}
