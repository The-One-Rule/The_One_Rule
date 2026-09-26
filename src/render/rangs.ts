/**
 * LE CLASSEMENT D'UNE FIN DE MATCH — une seule fonction, pour tout l'écran.
 *
 * Vu en jouant un match à trois jusqu'au bout : titre « ÉGALITÉ », et pourtant
 * « 1er », « 2e », « 3e » sur trois joueurs à 60 manches et quatre vies chacun,
 * plus « TU FINIS 1er SUR 3 » sous le titre. Deux défauts réunis :
 *
 * - le rang était la POSITION dans un tri, donc un ex æquo recevait un rang au
 *   hasard de l'ordre d'arrivée ;
 * - la ligne de rang et le podium triaient chacun de leur côté, l'un avec le
 *   vainqueur du serveur, l'autre sans — deux jugements sur un même écran.
 *
 * Un rang se COMPTE : 1 + le nombre de joueurs strictement devant. Le
 * vainqueur désigné par le serveur passe devant tous ; ensuite les vies, puis
 * les manches. Les spectateurs ne sont pas classés.
 *
 * PUR : aucun DOM, aucune langue.
 */
export interface Classable {
  id: string;
  lives: number;
  score: number;
  spectator?: boolean;
}

/** Vrai si `a` finit strictement devant `b`. */
function devant(a: Classable, b: Classable, winnerId: string | null): boolean {
  const va = Number(a.id === winnerId);
  const vb = Number(b.id === winnerId);
  if (va !== vb) return va > vb;
  if (a.lives !== b.lives) return a.lives > b.lives;
  return a.score > b.score;
}

export interface Rang<T> {
  joueur: T;
  /** 1 pour le premier ; des ex æquo PARTAGENT leur rang. */
  rang: number;
  /** Vrai si au moins un autre joueur a le même rang. */
  exAequo: boolean;
}

/** Les joueurs classés, dans l'ordre d'affichage. */
export function classeMatch<T extends Classable>(joueurs: readonly T[], winnerId: string | null): Rang<T>[] {
  const classes = joueurs.filter((p) => !p.spectator);
  const rangs = classes.map((p) => ({
    joueur: p,
    rang: 1 + classes.filter((q) => q !== p && devant(q, p, winnerId)).length,
    exAequo: false,
  }));
  for (const r of rangs) r.exAequo = rangs.some((x) => x !== r && x.rang === r.rang);
  // Tri stable : l'ordre d'arrivée départage l'AFFICHAGE, jamais le rang.
  return rangs.sort((a, b) => a.rang - b.rang);
}
