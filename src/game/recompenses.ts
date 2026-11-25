/**
 * LES RÉCOMPENSES EN PIÈCES — les quatre cartes du kanban (25/11/2026).
 *
 *   · « Pièces : en gagner aussi en multijoueur »
 *   · « Pièces : selon le classement final de la partie » (1er 50, 2e 25)
 *   · « Pièces : 0,25 par manche jouée »
 *   · « Pièces : bonus de combo (multiplicateur) »
 *
 * Avant elles, les pièces ne se gagnaient qu'en SOLO : quêtes (10 à 20) et
 * parcours (10 par étoile NEUVE, 50 par chapitre bouclé). Elles n'achètent que
 * des styles de pièces (150 à 600, `boutique.ts`) : un chapitre parfait paie le
 * premier style. Tout ce qui suit est calé sur ces chiffres.
 *
 * ⚠️ DEUX GARDE-FOUS, et ils ne viennent pas des cartes :
 *
 * 1. **Un plafond par jour sur les pièces de PARTIE** (classement + manches),
 *    `PLAFOND_PARTIES_JOUR`. Une partie rapide part dès deux joueurs : deux
 *    onglets du même joueur suffiraient à « gagner » 50 pièces à la minute, et
 *    toute la boutique tomberait dans l'après-midi. Le parcours et les quêtes
 *    n'y entrent pas — ils sont finis par construction.
 * 2. **Les quarts de pièce se gardent en reliquat** (`quarts`, 0 à 3) : le
 *    compteur de pièces est un entier, et un HUD qui afficherait « 12,75 » se
 *    lirait comme un bug.
 *
 * Les pièces restent sur l'APPAREIL (`st.coins`) et c'est le client qui se les
 * crédite à la fin d'un match : ça se triche à la console. Sans conséquence
 * tant qu'elles n'achètent que du cosmétique — et elles ne touchent aucun
 * classement (§6 n°14).
 *
 * PUR : aucun DOM, aucune horloge (le jour est passé en paramètre).
 */

/** Pièces selon la place finale d'un match classique — l'exemple de l'équipe, plus un 3e. */
export const PIECES_RANG: readonly number[] = [50, 25, 10];

/** Une manche jouée vaut un quart de pièce (« 0,25 par manche jouée »). */
export const QUARTS_PAR_MANCHE = 1;

/** Plafond quotidien des pièces de PARTIE (classement + manches). Ni parcours ni quêtes. */
export const PLAFOND_PARTIES_JOUR = 150;

/**
 * Les pièces d'une place finale.
 *
 * Un rang se COMPTE (`render/rangs.ts`) : des ex æquo partagent leur rang, donc
 * leur récompense. Rien sous deux joueurs classés — un match sans adversaire
 * n'a pas de classement.
 */
export function piecesDeRang(rang: number, classes: number): number {
  if (classes < 2 || !Number.isInteger(rang) || rang < 1) return 0;
  return PIECES_RANG[rang - 1] ?? 0;
}

/**
 * Le multiplicateur du COMBO : le nombre de niveaux du parcours franchis
 * d'affilée SANS PERDRE DE VIE, celui-ci compris.
 *
 *   combo 0 ou 1 → ×1 · 2 → ×1,25 · 3 → ×1,5 · 4 → ×1,75 · 5 et plus → ×2
 *
 * Plafonné à ×2 : sans plafond, le combo déciderait seul de l'économie.
 */
export function multiplicateurCombo(combo: number): number {
  if (!(combo >= 2)) return 1;
  return Math.min(2, 1 + 0.25 * (Math.floor(combo) - 1));
}

/**
 * Le combo APRÈS un niveau du parcours.
 *
 * Il monte d'un cran quand le niveau est franchi avec toutes ses vies, et
 * retombe à zéro sur un niveau raté ou franchi en perdant une vie.
 */
export const comboApres = (avant: number, franchi: boolean, viesPerdues: number): number =>
  franchi && viesPerdues === 0 ? Math.max(0, Math.floor(avant)) + 1 : 0;

/** Ce qu'un niveau rapporte avec son combo : ses pièces × le multiplicateur, arrondi. */
export const piecesAvecCombo = (pieces: number, combo: number): number =>
  Math.round(pieces * multiplicateurCombo(combo));

/** L'état des gains de partie sur l'appareil. */
export interface Bourse {
  /** Quarts de pièce en attente (0 à 3). */
  quarts: number;
  /** Le jour du compteur `gagnes`. */
  jour: number;
  /** Pièces de partie déjà gagnées ce jour-là. */
  gagnes: number;
}

export const BOURSE_VIDE: Bourse = { quarts: 0, jour: -1, gagnes: 0 };

/**
 * Crédite des gains de PARTIE : des pièces entières et des quarts.
 *
 * Rend les pièces entières à ajouter au solde, et la bourse d'après. Le
 * plafond du jour s'applique au total ; ce qui le dépasse est perdu, pas
 * reporté — un report serait un plafond qui ne plafonne rien.
 */
export function crediteParties(
  b: Bourse,
  jour: number,
  pieces: number,
  quarts: number,
): { bourse: Bourse; pieces: number; plafonne: boolean } {
  const gagnes = b.jour === jour ? b.gagnes : 0;
  const totalQuarts = Math.max(0, Math.floor(b.quarts)) + Math.max(0, Math.floor(quarts));
  const brut = Math.max(0, Math.floor(pieces)) + Math.floor(totalQuarts / 4);
  const reste = Math.max(0, PLAFOND_PARTIES_JOUR - gagnes);
  const accorde = Math.min(brut, reste);
  return {
    bourse: { quarts: totalQuarts % 4, jour, gagnes: gagnes + accorde },
    pieces: accorde,
    plafonne: accorde < brut,
  };
}

/** Les manches qu'un run SOLO a jouées : celles tenues, plus la fatale s'il y en a une. */
export const manchesJoueesSolo = (score: number, mort: boolean): number =>
  Math.max(0, Math.floor(score)) + (mort ? 1 : 0);
