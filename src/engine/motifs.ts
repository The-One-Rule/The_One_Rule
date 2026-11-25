/**
 * LES MOTIFS DE MORT — le français canonique, et sa clé.
 *
 * Ces phrases sont ce que le joueur lit AU MOMENT où il perd : le tampon, le
 * bandeau de manche, le panneau de la kill-cam. Elles naissaient en clair dans
 * `resolve.ts` et dans les `judge` des règles, c'est-à-dire dans le moteur PUR
 * — qui ne connaît ni DOM, ni horloge, ni langue. Un anglophone lisait donc
 * « TU AS CLIQUÉ SUR DU ROUGE » au moment précis où il avait besoin de
 * comprendre pourquoi il venait de mourir.
 *
 * Même remède que les consignes (`Phrase`) et que les briefs : le moteur garde
 * le français CANONIQUE, l'affichage recompose. Ici la clé de recomposition
 * est la phrase française elle-même — c'est elle qui voyage sur le fil, dans
 * `verdict.reason`, et la traduire à l'affichage n'y change rien. Le protocole
 * n'a donc pas à bouger, ni le serveur de salons à connaître les langues.
 *
 * Ce qui donne ses DENTS à la table de traduction, c'est que les phrases sont
 * ici et nulle part ailleurs : `MotifId` est un type, donc une table
 * `Record<MotifId, string>` ne compile pas s'il en manque une. Écrire un
 * nouveau motif en clair dans une règle contournerait ce filet —
 * `tests/motifs.test.ts` le refuse.
 */
export const MOTIFS = {
  /* --- l'horloge --- */
  temps: "LE TEMPS EST ÉCOULÉ",
  sequence: "SÉQUENCE INACHEVÉE",

  /* --- le piège, et sa version sans piège --- */
  piegeRate: "LA CONSIGNE VIOLAIT LA RÈGLE UNIQUE — IL FALLAIT NE RIEN FAIRE",
  rienFaire: "IL FALLAIT NE RIEN FAIRE",

  /* --- la mauvaise réponse --- */
  fallaitTaper: "IL FALLAIT TAPER, PAS CLIQUER",
  fallaitCliquer: "IL FALLAIT CLIQUER, PAS TAPER",
  mauvaiseTouche: "MAUVAISE TOUCHE",
  couleurInterdite: "TU AS CLIQUÉ LA COULEUR INTERDITE",
  leVide: "TU AS CLIQUÉ DANS LE VIDE",
  mauvaiseForme: "MAUVAISE FORME",
  mauvaiseCible: "MAUVAISE CIBLE",
  lacheTot: "TU AS LÂCHÉ TROP TÔT",
  lacheAilleurs: "TU L'AS LÂCHÉ AU MAUVAIS ENDROIT",
  fallaitGlisser: "IL FALLAIT GLISSER, PAS CLIQUER",

  /* --- les règles uniques : une par interdit --- */
  rouge: "TU AS CLIQUÉ SUR DU ROUGE",
  bleu: "TU AS CLIQUÉ SUR DU BLEU",
  rond: "TU AS CLIQUÉ UN ROND",
  solitaire: "TU AS CLIQUÉ UNE COULEUR UNIQUE",
  angle: "TU AS CLIQUÉ DANS UN ANGLE",
  triangle: "TU AS CLIQUÉ UN TRIANGLE",
  voyelle: "TU AS TAPÉ UNE VOYELLE",
  plusGrosse: "TU AS CLIQUÉ LA PLUS GROSSE FORME",
  zoneInterdite: "TU AS CLIQUÉ DANS LA ZONE INTERDITE",
  tropTot: "TU AS AGI TROP TÔT",
  espace: "TU AS RELÂCHÉ ESPACE",
  rancune: "TU AS CLIQUÉ TA RANCUNE",
  immobile: "TU AS CLIQUÉ UNE FORME QUI BOUGE",
  voisin: "TU AS CLIQUÉ UNE VOISINE DU ROUGE",
  foule: "TU AS CLIQUÉ LA COULEUR LA PLUS NOMBREUSE",
  miroir: "LE MIROIR : C'ÉTAIT DE L'AUTRE CÔTÉ",
  insoumis: "TU AS OBÉI À UNE CONSIGNE EN ROUGE",
  gong: "LE GONG A SONNÉ — IL FALLAIT NE RIEN FAIRE",

  /* --- le départ : posé par le serveur, jamais par le moteur --- */
  parti: "PARTI",
} as const;

export type MotifId = keyof typeof MOTIFS;

/**
 * LES MOTIFS QUI DISENT « TU AS ENFREINT TA PROPRE RÈGLE ».
 *
 * C'est la moitié non copiable du jeu : mourir sur sa règle unique n'est pas
 * la même faute que rater une cible ou laisser filer le temps. Le titre TÊTE
 * BRÛLÉE du salon les compte, et `report.mjs` en fait déjà une colonne.
 *
 * ⚠️ Ce sont les PHRASES et non les identifiants : c'est la phrase française
 * canonique qui voyage dans `verdict.reason`, et le serveur de salons ne
 * connaît pas les langues. Les traduire ici casserait le compte au premier
 * joueur anglophone.
 *
 * `piegeRate` en fait partie, et c'est le cœur : la consigne demandait ce que
 * la règle interdit, et le joueur a obéi.
 */
export const MOTIFS_REGLE: readonly string[] = [
  MOTIFS.piegeRate,
  MOTIFS.rouge,
  MOTIFS.bleu,
  MOTIFS.rond,
  MOTIFS.solitaire,
  MOTIFS.angle,
  MOTIFS.triangle,
  MOTIFS.voyelle,
  MOTIFS.plusGrosse,
  MOTIFS.zoneInterdite,
  MOTIFS.tropTot,
  MOTIFS.espace,
  MOTIFS.rancune,
  MOTIFS.immobile,
  MOTIFS.voisin,
  MOTIFS.foule,
  MOTIFS.miroir,
  MOTIFS.insoumis,
  MOTIFS.gong,
];

/** Toutes les phrases, pour éprouver une table de traduction d'un coup. */
export const MOTIFS_FR: readonly string[] = Object.values(MOTIFS);
