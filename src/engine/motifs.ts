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

  /* --- le départ : posé par le serveur, jamais par le moteur --- */
  parti: "PARTI",
} as const;

export type MotifId = keyof typeof MOTIFS;

/** Toutes les phrases, pour éprouver une table de traduction d'un coup. */
export const MOTIFS_FR: readonly string[] = Object.values(MOTIFS);
