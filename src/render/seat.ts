/**
 * Une tuile de joueur, dans le salon.
 *
 * Pure et à part pour la même raison que `plate.ts` : elle porte une PRIORITÉ,
 * et une priorité écrite en `if` successifs est exactement le genre de code
 * qui se lit juste et se comporte faux. Le salon affichait auparavant quatre
 * champs concaténés (« HÔTE · SPECT. · HORS LIGNE · ♥3 »), ce qui évitait la
 * question en la posant toutes à la fois — au prix d'une ligne que personne
 * ne lit.
 *
 * Une tuile ne dit qu'UNE chose sous le nom, et l'ordre ci-dessous est l'ordre
 * de ce qui compte pour quelqu'un qui regarde le salon :
 *
 *   1. hors ligne — il ne jouera pas, rien d'autre n'a d'importance ;
 *   2. spectateur — il est là, mais il ne joue pas cette partie ;
 *   3. en match   — ce qui bouge : ses vies et son score ;
 *   4. hôte       — c'est lui qui lance, on le cherche du regard ;
 *   5. débutant   — il a une vie de plus, et le salon doit le savoir ;
 *   6. prêt       — le cas ordinaire, délibérément fade : dans un salon où
 *                   tout le monde est prêt, ce sont les exceptions qu'on lit.
 */
export interface SeatState {
  connected: boolean;
  spectator: boolean;
  host: boolean;
  rookie: boolean;
  lives: number;
  score: number;
  /** Une partie est en cours : les vies et le score priment sur les rôles. */
  inMatch: boolean;
  /** C'est moi. */
  isMe: boolean;
}

export function seatStatus(s: SeatState): string {
  if (!s.connected) return "HORS LIGNE";
  if (s.spectator) return "SPECTATEUR";
  if (s.inMatch) return `${s.lives} VIE${s.lives > 1 ? "S" : ""} · ${s.score} MANCHES`;
  if (s.host) return "HÔTE";
  if (s.rookie) return "1RE PARTIE · +1 VIE";
  return "PRÊT";
}

/**
 * Les classes de la tuile.
 *
 * Elles se CUMULENT, contrairement au statut : être l'hôte et être moi sont
 * deux faits simultanés, et l'écran doit dire les deux. `is-rookie` ne teinte
 * la mention que hors match — pendant une partie, la mention porte les vies,
 * et l'accent y désignerait la mauvaise information.
 */
export function seatClasses(s: SeatState): string[] {
  const classes = ["seat"];
  if (s.host) classes.push("is-host");
  if (s.isMe) classes.push("is-me");
  if (s.rookie && !s.inMatch) classes.push("is-rookie");
  if (!s.connected) classes.push("is-off");
  return classes;
}
