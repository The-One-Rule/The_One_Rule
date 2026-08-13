/**
 * Signature visuelle d'un joueur.
 *
 * Volontairement PAS un téléversement d'image. Sans compte, sans modération
 * et sans moyen de bannir qui que ce soit, laisser n'importe qui envoyer une
 * image dans un salon partagé finit toujours de la même façon — et ça
 * retomberait sur toi et sur ta communauté.
 *
 * À la place, chaque joueur reçoit un signe unique dérivé de son identifiant
 * local : une combinaison forme × couleur × motif tirée du vocabulaire visuel
 * du jeu lui-même. Reconnaissable, impossible à détourner, et cohérent avec
 * la direction signalétique — là où une photo de profil jurerait.
 *
 * 3 formes × 8 couleurs × 6 motifs = 144 signes distincts, largement assez
 * pour qu'un salon de dix n'ait aucune collision visible.
 */

import { hashStr } from "../engine/rng";
import type { Glyph } from "../../shared/protocol";

/** Teintes de signature — distinctes de la palette JOUABLE, qui porte la
 *  mécanique et ne doit jamais être confondue avec de la décoration. */
export const GLYPH_COLORS = [
  "#9184D9",
  "#CFC9F2",
  "#7FB0E8",
  "#E8A0C4",
  "#8FD9C4",
  "#E8C98F",
  "#B8B8C8",
  "#A88FD9",
] as const;

const SHAPES = ["carre", "rond", "triangle"] as const;
export const PATTERN_COUNT = 6;

/** Dérive un signe stable depuis un identifiant. Même id = même signe, partout. */
export function glyphFor(id: string): Glyph {
  const h = hashStr(id || "anon");
  return {
    shape: SHAPES[h % SHAPES.length]!,
    color: Math.floor(h / 3) % GLYPH_COLORS.length,
    pattern: Math.floor(h / 24) % PATTERN_COUNT,
  };
}

/** Variante n° `n` du même identifiant — permet d'en proposer plusieurs au choix. */
export function glyphVariant(id: string, n: number): Glyph {
  return glyphFor(`${id}#${n}`);
}

export const glyphHex = (g: Glyph): string =>
  GLYPH_COLORS[g.color % GLYPH_COLORS.length] ?? GLYPH_COLORS[0];

/**
 * Rendu SVG inline du signe. Retourne une chaîne : l'appelant l'insère où il
 * veut (plaque de joueur, salon, écran de fin) sans dépendance.
 */
export function glyphSvg(g: Glyph, size = 22): string {
  const c = glyphHex(g);
  const id = `p${g.pattern}${g.color}`;
  // Les motifs servent de second canal : deux joueurs de teinte voisine
  // restent distinguables, y compris en vision des couleurs atypique.
  const patterns = [
    "",
    `<pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="rgba(0,0,0,.35)"/></pattern>`,
    `<pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="4" fill="rgba(0,0,0,.35)"/></pattern>`,
    `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.2" fill="rgba(0,0,0,.35)"/></pattern>`,
    `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6 L6 0" stroke="rgba(0,0,0,.35)" stroke-width="2"/></pattern>`,
    `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0 L6 6" stroke="rgba(0,0,0,.35)" stroke-width="2"/></pattern>`,
  ];
  const overlay = g.pattern > 0 ? `<defs>${patterns[g.pattern]}</defs>` : "";
  const fillPattern = g.pattern > 0 ? `url(#${id})` : "none";

  const body =
    g.shape === "rond"
      ? `<circle cx="12" cy="12" r="9" fill="{F}"/>`
      : g.shape === "carre"
        ? `<rect x="3.5" y="3.5" width="17" height="17" fill="{F}"/>`
        : `<path d="M12 2.5 L21 20 L3 20 Z" fill="{F}"/>`;

  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${overlay}` +
    body.replace("{F}", c) +
    (g.pattern > 0 ? body.replace("{F}", fillPattern) : "") +
    `</svg>`
  );
}
