/**
 * LA DIFFICULTÉ DES CONSIGNES — carte du kanban « Difficulté : des niveaux qui
 * jouent sur autre chose que la vitesse ». La raison donnée par l'équipe :
 * « certaines consignes sont plus dures que d'autres ».
 *
 * Un réglage d'hôte du salon : DOUCES, TOUTES (le défaut, et l'absence), ou
 * CORSÉES. Il ne change NI la fenêtre NI le catalogue : il choisit, parmi les
 * tirages que le serveur essaie déjà pour éviter deux pièges d'affilée
 * (`tirageSansDoublePiege`), le premier dont la consigne est de la bonne
 * classe. Le client reçoit le numéro de tirage dans `round` et reconstruit
 * la même manche : rien de neuf sur le fil, rien sur quoi diverger (n°3).
 *
 * ⚠️ « Jamais deux pièges d'affilée » reste PRIORITAIRE sur la classe : la
 * difficulté est une préférence, la directive du 01/10 une règle.
 *
 * ⚠️ Les classes sont une décision de CONCEPTION, pas une mesure : la collecte
 * ne trace pas encore la mort par consigne. Une consigne est CORSÉE si elle
 * demande une négation, un croisement de deux critères, une comparaison
 * fine, une suite de gestes ou une mémoire — sinon DOUCE. À remesurer le jour
 * où `report.mjs` saura ventiler les morts par consigne.
 *
 * PUR.
 */

export type Difficulte = "douce" | "normale" | "corsee";

/** L'index que porte le réglage du salon (`RoomSettings.difficulte`). */
export const DIFFICULTES: readonly Difficulte[] = ["douce", "normale", "corsee"];

/**
 * Les consignes CORSÉES. Toutes les autres sont DOUCES : lire, viser, un
 * geste (« CLIQUE LE ROUGE », « LA PLUS GROSSE », « LE PLUS À GAUCHE »,
 * « CELUI QUI BOUGE », « TAPE A », une flèche).
 */
export const CONSIGNES_CORSEES: ReadonlySet<string> = new Set([
  "compound", // le carré rouge : deux critères croisés, leurres sur chacun
  "notColor", // celui qui n'est PAS rouge
  "notShape",
  "avoidColor", // partout SAUF sur du rouge
  "odd", // l'intrus : comparer chaque pièce au groupe
  "smallestOfColor", // le plus petit rouge : trier sous un filtre
  "clickTwo", // rouge PUIS bleu : une suite
  "typeShown", // recopier une lettre affichée
  "typeFirstLetter", // l'initiale de la couleur : traduire
  "doubleTap", // deux fois
  "tiens", // tenir jusqu'au vert
  "glisse", // prendre et poser
]);

export const estCorsee = (instructionId: string): boolean => CONSIGNES_CORSEES.has(instructionId);

/** Le réglage lu sur le fil : un index de `DIFFICULTES`. Absent ou douteux vaut TOUTES. */
export function difficulteDuReglage(v: unknown): Difficulte {
  return typeof v === "number" && Number.isInteger(v) ? (DIFFICULTES[v] ?? "normale") : "normale";
}

/**
 * La préférence de tirage d'une difficulté, ou `undefined` pour TOUTES — et
 * c'est ce `undefined` qui garantit qu'un salon par défaut tire EXACTEMENT les
 * manches d'hier (testé).
 */
export function prefereConsigne(d: Difficulte): ((instructionId: string) => boolean) | undefined {
  if (d === "douce") return (id) => !estCorsee(id);
  if (d === "corsee") return estCorsee;
  return undefined;
}
