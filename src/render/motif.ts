/**
 * Le second canal : un motif par couleur.
 *
 * La couleur n'est pas décorative dans ce jeu, c'est un AXE DE JEU au même
 * rang que la forme. LE SANG interdit de cliquer sur du rouge ; les consignes
 * ciblent une couleur ; et les leurres « partagent la forme OU la couleur,
 * jamais les deux » — donc si deux couleurs deviennent indistinctes, un leurre
 * qui partage la couleur devient AMBIGU, pas seulement difficile.
 *
 * La palette a DÉJÀ été travaillée pour ça : `scene.ts` documente un ΔE
 * minimal porté de 22 à 40 en deutéranopie, au-dessus du seuil de 25 sous
 * lequel deux pièces sont indiscernables. Ce n'est donc pas un rattrapage,
 * c'est l'étape d'après — 40, c'est distinguable en s'appliquant, et une
 * manche se lit en 200 ms.
 *
 * Un motif, lui, ne dépend d'aucune perception de teinte : il fonctionne en
 * deutéranopie complète, en achromatopsie, et sur un écran mal réglé. Garance
 * et jade restent la paire à traiter en priorité — c'est la collision
 * rouge-vert, environ 6 % des hommes, et ce sont exactement les deux couleurs
 * qui portent LE SANG et le couple vie/mort.
 *
 * Les motifs sont donc choisis pour se distinguer AU SEIN de chaque paire qui
 * se confond, pas seulement les uns des autres :
 *
 *     garance  hachures montantes   ┃ points contre hachures : la paire
 *     jade     points               ┃ rouge-vert, la plus fréquente
 *     azur     barres horizontales  ┃ barres contre hachures : la paire
 *     ambre    hachures descendantes┃ bleu-jaune
 *
 * La hachure est déjà le vocabulaire de l'identité — le bandeau de règle et le
 * logo en portent. Le second canal parle donc la langue du jeu au lieu d'y
 * ajouter la sienne.
 *
 * Ce module ne dessine rien : il décrit. Le rendu vit dans `scene.ts`, qui en
 * fabrique des `CanvasPattern` mis en cache. C'est la même séparation que
 * `layout.ts` — la décision est pure et testable, le tracé ne l'est pas.
 */
import type { ColorId } from "../engine/types";

export type MotifKind = "hachures" | "points" | "barres";

export interface Motif {
  kind: MotifKind;
  /**
   * Orientation des traits, en degrés, sens horaire depuis l'horizontale.
   * Sans effet sur `points`.
   */
  angle: number;
}

export const MOTIFS: Record<ColorId, Motif> = {
  garance: { kind: "hachures", angle: -45 },
  jade: { kind: "points", angle: 0 },
  azur: { kind: "barres", angle: 0 },
  ambre: { kind: "hachures", angle: 45 },
};

/**
 * Deux motifs se distinguent-ils ?
 *
 * Deux hachures ne se distinguent que si leur angle diffère assez pour se voir
 * en 200 ms — c'est le temps de lecture d'une manche, pas celui d'un examen.
 * Le seuil est à 30° : en dessous, deux trames obliques se ressemblent au
 * premier coup d'œil, et le second canal ne sert plus à rien.
 */
/**
 * Les deux encres possibles pour une trame : on creuse, ou on éclaire.
 *
 * Une seule ne suffit pas. Mesuré en simulation de deutéranopie, avec l'encre
 * sombre partout : ambre 33, garance 28, jade 16 — mais azur 12,7 seulement.
 * Azur est la teinte la plus sombre du lot, une encre sombre n'a pas de marge
 * pour l'assombrir encore.
 */
export interface Encre {
  rgb: readonly [number, number, number];
  alpha: number;
}

export const ENCRE_SOMBRE: Encre = { rgb: [10, 14, 22], alpha: 0.42 };
export const ENCRE_CLAIRE: Encre = { rgb: [239, 234, 224], alpha: 0.4 };

const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Clarté PERÇUE en deutéranopie — le cas pour lequel ce mode existe.
 *
 * C'est la nuance qui m'a fait choisir la mauvaise encre au premier essai.
 * La garance a une clarté de 105 en vision normale : « sombre », donc encre
 * claire. Mais un deutéranope la perçoit à 181, c'est-à-dire CLAIRE — et
 * l'encre claire n'y creusait plus qu'un écart de 22 là où l'encre sombre en
 * creusait 76. Décider sur la clarté de la vision normale, c'est optimiser
 * pour l'œil que ce mode ne sert pas.
 */
export function clarteDeuteranope(rgb: readonly number[]): number {
  const [r = 0, g = 0, b = 0] = rgb;
  return lum(0.625 * r + 0.375 * g, 0.7 * r + 0.3 * g, 0.3 * g + 0.7 * b);
}

const melange = (c: readonly number[], encre: Encre): number[] =>
  c.map((v, i) => v * (1 - encre.alpha) + encre.rgb[i]! * encre.alpha);

/**
 * L'encre qui creuse le plus l'écart sur cette teinte, une fois perçue.
 *
 * On ne devine pas : on calcule les deux et on garde la meilleure. Quatre
 * couleurs, deux encres — la table pourrait être écrite à la main, mais elle
 * deviendrait fausse en silence au premier ajustement de palette.
 */
export function encrePour(rgb: readonly number[]): Encre {
  const base = clarteDeuteranope(rgb);
  const ecart = (e: Encre) => Math.abs(clarteDeuteranope(melange(rgb, e)) - base);
  return ecart(ENCRE_CLAIRE) > ecart(ENCRE_SOMBRE) ? ENCRE_CLAIRE : ENCRE_SOMBRE;
}

export function distincts(a: Motif, b: Motif): boolean {
  if (a.kind !== b.kind) return true;
  if (a.kind === "points") return false;
  const d = Math.abs(((a.angle - b.angle) % 180) + 180) % 180;
  return Math.min(d, 180 - d) >= 30;
}
