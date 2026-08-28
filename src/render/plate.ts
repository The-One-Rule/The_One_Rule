/**
 * Classes d'une plaque de joueur, en multijoueur.
 *
 * Extraite et rendue PURE parce qu'elle portait un vrai bug, invisible à la
 * lecture : les états étaient composés en `else if`, donc le statut de
 * débutant — durable, décoratif — écrasait le VERDICT de la manche. Une
 * personne qui jouait sa première partie ne voyait jamais sa plaque passer au
 * vert quand elle réussissait, et le salon non plus.
 *
 * Deux familles cohabitent, et il faut qu'elles cohabitent :
 *   · ce que le joueur EST (moi, éliminé, débutant) — durable ;
 *   · ce qu'il vient de FAIRE (ok, piège déjoué, mort, absent) — la manche.
 *
 * Le verdict prime à l'écran : la feuille lui donne une spécificité
 * supérieure, pour que la règle ne dépende pas de l'ordre des déclarations.
 */
export type PlateFlash = "ok" | "trap" | "dead" | "idle";

export interface PlateState {
  isMe: boolean;
  /** Vies restantes — 0 ou moins vaut éliminé. */
  lives: number;
  rookie: boolean;
  /** Verdict de la manche en cours d'affichage, s'il y en a un. */
  pulse: PlateFlash | null;
  /** Une manche est en cours (par opposition à une pause ou un compte à rebours). */
  inRound: boolean;
}

export function plateClasses(s: PlateState): string[] {
  const classes = ["plate"];
  if (s.isMe) classes.push("plate--me");
  if (s.lives <= 0) classes.push("plate--out");
  /*
   * Le statut de débutant est PUBLIC, et c'est tout l'intérêt : il change le
   * regard des autres sur ses erreurs, et c'est la seule chose qui empêche
   * d'en abuser puisque le serveur ne peut pas le vérifier. Il s'ajoute donc
   * au verdict, il ne le remplace pas.
   */
  if (s.rookie) classes.push("plate--rookie");
  if (s.pulse) classes.push(`plate--${s.pulse}`);
  // `--live` ne dit rien de plus qu'« il joue » : inutile dès qu'un verdict
  // est affiché, et inutile aussi sur une plaque qui porte déjà un liseré.
  else if (s.inRound && !s.rookie && s.lives > 0) classes.push("plate--live");
  return classes;
}
