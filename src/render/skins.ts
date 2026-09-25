/**
 * LES STYLES DE PIÈCES — ce que la boutique vend, et le style maison.
 *
 * ⚠️ UN STYLE NE CHANGE QUE LE DESSIN. La couleur reste celle que la consigne
 * NOMME, la forme celle que la règle interdit, et la géométrie de clic ne
 * passe pas par ici (`SceneRenderer.hit` lit `e.x`, `e.y`, `e.r`). Deux
 * joueurs aux styles différents voient la même manche et sont jugés pareil.
 *
 * Chaque style fournit aussi son TERRAIN : un néon sur fond crème ne brille
 * pas, une craie a besoin de son tableau.
 */
import type { ColorId, ShapeId } from "../engine/types";
import type { SkinId } from "../game/boutique";
import { decalage } from "./orientation";
import type { Orientation } from "./orientation";

/**
 * La palette de jeu — INCHANGÉE au chiffre près. Elle a été calibrée pour les
 * trois daltonismes (ΔE minimal 40, voir `render/scene.ts`) et le mode motifs
 * calcule son encre dessus : la retoucher pour le fond clair aurait défait ce
 * travail. Le style maison est désormais CLAIR, et c'est le contour d'encre
 * épais qui fait le contraste que la teinte seule ne ferait pas sur du crème
 * (l'ambre surtout).
 */
export const TEINTES: Record<ColorId, string> = {
  garance: "#F74058",
  azur: "#237EF6",
  jade: "#40F7C0",
  ambre: "#F5B214",
};

/** L'encre du style maison — celle des contours et des ombres. */
export const ENCRE = "#241B3A";

export interface Terrain {
  sol: string;
  /** Couleur de la trame décorative. */
  trame: string;
  /** Forme de la trame. */
  motif: "points" | "grille" | "rayures" | "damier" | "craie";
  /** Le terrain est-il clair ? Décide de l'encre du cadre de temps. */
  clair: boolean;
}

export const TERRAINS: Record<SkinId, Terrain> = {
  sticker: { sol: "#FFF4E0", trame: "rgba(36,27,58,0.10)", motif: "points", clair: true },
  neon: { sol: "#0E0A22", trame: "rgba(255,70,200,0.10)", motif: "grille", clair: false },
  bonbon: { sol: "#FFE8F2", trame: "rgba(255,120,170,0.16)", motif: "rayures", clair: true },
  pixel: { sol: "#1D2240", trame: "rgba(120,140,255,0.10)", motif: "damier", clair: false },
  craie: { sol: "#22392E", trame: "rgba(255,255,255,0.05)", motif: "craie", clair: false },
};

/**
 * LE TERRAIN DE NUIT — le style maison seulement.
 *
 * Le mode SOMBRE ne touche pas aux styles achetés : Néon, Pixel et Craie ont
 * déjà leur nuit, Bonbon est un choix délibéré de rose. Seul le style maison
 * est clair PAR DÉFAUT, et un rectangle crème de 1000 × 420 au milieu d'une
 * page noire, c'est une lampe braquée sur le joueur. Les pièces gardent leurs
 * teintes au chiffre près et leur contour d'encre : sur ce sol, c'est le
 * contour qui disparaît dans le fond et la TEINTE qui porte, ce qui est
 * exactement ce que la calibration daltonienne suppose.
 */
export const TERRAIN_NUIT: Terrain = {
  sol: "#221A33",
  trame: "rgba(241,232,216,0.09)",
  motif: "points",
  clair: false,
};

/** Le terrain à peindre, selon le style ET le thème de la page. */
export const terrainDe = (skin: SkinId, sombre: boolean): Terrain =>
  sombre && skin === "sticker" ? TERRAIN_NUIT : TERRAINS[skin];

/** Le chemin d'une forme, centré en (x, y), de rayon r. Le triangle pointe vers le HAUT DE L'ÉCRAN. */
export function cheminForme(
  ctx: CanvasRenderingContext2D,
  shape: ShapeId,
  x: number,
  y: number,
  r: number,
  o: Orientation,
  arrondi = 0,
): void {
  ctx.beginPath();
  if (shape === "rond") {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else if (shape === "carre") {
    const c = r * 0.88;
    if (arrondi > 0 && typeof ctx.roundRect === "function") ctx.roundRect(x - c, y - c, c * 2, c * 2, r * arrondi);
    else ctx.rect(x - c, y - c, c * 2, c * 2);
  } else {
    const [ax, ay] = decalage(o, 0, -r);
    const [bx, by] = decalage(o, r * 0.92, r * 0.72);
    const [cx, cy] = decalage(o, -r * 0.92, r * 0.72);
    if (arrondi > 0) {
      // Coins adoucis : on coupe chaque sommet par un arc.
      const pts: [number, number][] = [
        [x + ax, y + ay],
        [x + bx, y + by],
        [x + cx, y + cy],
      ];
      const rr = r * arrondi * 0.9;
      const m = (p: [number, number], q: [number, number]): [number, number] => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const start = m(pts[2]!, pts[0]!);
      ctx.moveTo(start[0], start[1]);
      for (let k = 0; k < 3; k++) {
        const p = pts[k]!;
        const q = pts[(k + 1) % 3]!;
        ctx.arcTo(p[0], p[1], q[0], q[1], rr);
      }
      ctx.closePath();
    } else {
      ctx.moveTo(x + ax, y + ay);
      ctx.lineTo(x + bx, y + by);
      ctx.lineTo(x + cx, y + cy);
      ctx.closePath();
    }
  }
}

/** Le point (px, py) est-il DANS la forme ? Sert au style pixel. */
function dedans(shape: ShapeId, dx: number, dy: number, r: number, o: Orientation): boolean {
  if (shape === "rond") return dx * dx + dy * dy <= r * r;
  if (shape === "carre") return Math.abs(dx) <= r * 0.88 && Math.abs(dy) <= r * 0.88;
  // Triangle : repère écran (le haut de l'écran est -y en paysage).
  const [ex, ey] = o === "portrait" ? [dy, dx] : [dx, dy];
  if (ey < -r || ey > r * 0.72) return false;
  const t = (ey + r) / (r * 1.72);
  return Math.abs(ex) <= r * 0.92 * t;
}

/** Hachage déterministe d'une pièce — le tremblé de la craie ne doit pas bouger d'image en image. */
const bruit = (seed: number, k: number): number => {
  const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

export interface PieceADessiner {
  shape: ShapeId;
  color: ColorId;
  x: number;
  y: number;
  /** Rayon DESSINÉ (naissance, respiration comprises). */
  r: number;
  /** Rayon logique, pour l'épaisseur des traits. */
  r0: number;
  phase: number;
}

/**
 * Dessine UNE pièce dans le style demandé.
 *
 * `trame` est le motif du mode daltonien : il se pose SUR la teinte, quel que
 * soit le style, sinon acheter un style retirerait le second canal.
 */
export function dessinePiece(
  ctx: CanvasRenderingContext2D,
  p: PieceADessiner,
  skin: SkinId,
  o: Orientation,
  trame: CanvasPattern | null,
  t: number,
): void {
  const teinte = TEINTES[p.color];
  const { shape, x, y, r } = p;
  const trait = Math.max(3, p.r0 * 0.13);

  const poseTrame = (arrondi = 0): void => {
    if (!trame) return;
    ctx.fillStyle = trame;
    cheminForme(ctx, shape, x, y, r, o, arrondi);
    ctx.fill();
  };

  if (skin === "neon") {
    // Un tube : trait coloré épais, halo, cœur translucide.
    ctx.save();
    ctx.shadowColor = teinte;
    ctx.shadowBlur = p.r0 * 0.55;
    ctx.fillStyle = teinte + "2E";
    cheminForme(ctx, shape, x, y, r * 0.92, o, 0.18);
    ctx.fill();
    ctx.lineWidth = trait * 1.25;
    ctx.strokeStyle = teinte;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = trait * 0.4;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();
    ctx.restore();
    poseTrame(0.18);
    return;
  }

  if (skin === "bonbon") {
    ctx.save();
    const [odx, ody] = decalage(o, 0, p.r0 * 0.12);
    ctx.fillStyle = "rgba(160,40,90,0.22)";
    cheminForme(ctx, shape, x + odx, y + ody, r, o, 0.35);
    ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
    g.addColorStop(0, "#FFFFFF");
    g.addColorStop(0.25, teinte);
    g.addColorStop(1, teinte);
    ctx.fillStyle = g;
    cheminForme(ctx, shape, x, y, r, o, 0.35);
    ctx.fill();
    poseTrame(0.35);
    ctx.lineWidth = trait * 0.7;
    ctx.strokeStyle = "#FFFFFF";
    cheminForme(ctx, shape, x, y, r, o, 0.35);
    ctx.stroke();
    // Le reflet : une virgule blanche en haut à gauche.
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y - r * 0.38, r * 0.2, r * 0.1, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (skin === "pixel") {
    const pas = Math.max(4, r / 4.5);
    const n = Math.ceil(r / pas) + 1;
    ctx.save();
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const dx = (i + 0.5) * pas;
        const dy = (j + 0.5) * pas;
        if (!dedans(shape, dx, dy, r, o)) continue;
        // Bord : encre ; intérieur : teinte, avec une rangée claire en haut.
        const bord =
          !dedans(shape, dx + pas, dy, r, o) ||
          !dedans(shape, dx - pas, dy, r, o) ||
          !dedans(shape, dx, dy + pas, r, o) ||
          !dedans(shape, dx, dy - pas, r, o);
        const haut = !dedans(shape, dx, dy - pas * 2, r, o);
        ctx.fillStyle = bord ? "#0B0D1E" : haut ? "rgba(255,255,255,0.55)" : teinte;
        ctx.fillRect(x + dx - pas / 2, y + dy - pas / 2, pas + 0.5, pas + 0.5);
        if (haut && !bord) {
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = teinte;
          ctx.fillRect(x + dx - pas / 2, y + dy - pas / 2, pas + 0.5, pas + 0.5);
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.restore();
    poseTrame();
    return;
  }

  if (skin === "craie") {
    ctx.save();
    // Remplissage en hachures de craie, dans la forme.
    cheminForme(ctx, shape, x, y, r, o);
    ctx.clip();
    ctx.fillStyle = teinte + "40";
    ctx.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
    ctx.strokeStyle = teinte;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = Math.max(1.5, p.r0 * 0.07);
    for (let k = -r * 1.4; k < r * 1.4; k += p.r0 * 0.2) {
      const j = (bruit(p.phase, k) - 0.5) * p.r0 * 0.12;
      ctx.beginPath();
      ctx.moveTo(x + k - r, y + r + j);
      ctx.lineTo(x + k + r, y - r - j);
      ctx.stroke();
    }
    ctx.restore();
    poseTrame();
    // Le contour, repassé deux fois avec un léger tremblé.
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let passe = 0; passe < 2; passe++) {
      const jx = (bruit(p.phase, passe + 1) - 0.5) * p.r0 * 0.08;
      const jy = (bruit(p.phase, passe + 7) - 0.5) * p.r0 * 0.08;
      ctx.strokeStyle = passe === 0 ? "rgba(255,255,255,0.85)" : teinte;
      ctx.lineWidth = passe === 0 ? trait * 0.7 : trait * 0.45;
      cheminForme(ctx, shape, x + jx, y + jy, r * (1 - passe * 0.04), o);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // STICKER — le style maison : ombre d'encre franche, aplat, contour épais,
  // et un éclat de lumière. Pas de flou : une ombre nette dit le même volume
  // pour dix fois moins de calcul.
  const [odx, ody] = decalage(o, p.r0 * 0.1, p.r0 * 0.16);
  ctx.fillStyle = ENCRE;
  cheminForme(ctx, shape, x + odx, y + ody, r, o, 0.22);
  ctx.fill();
  ctx.fillStyle = teinte;
  cheminForme(ctx, shape, x, y, r, o, 0.22);
  ctx.fill();
  poseTrame(0.22);
  ctx.lineWidth = trait;
  ctx.lineJoin = "round";
  ctx.strokeStyle = ENCRE;
  cheminForme(ctx, shape, x, y, r, o, 0.22);
  ctx.stroke();
  // L'éclat : un petit arc blanc en haut à gauche, à l'intérieur de la forme.
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineCap = "round";
  ctx.lineWidth = trait * 0.7;
  ctx.beginPath();
  const cx = x + (shape === "triangle" ? 0 : -r * 0.1);
  const cy = y + (shape === "triangle" ? r * 0.12 : -r * 0.05);
  const rr = shape === "triangle" ? r * 0.38 : r * 0.55;
  ctx.arc(cx, cy, rr, Math.PI * 1.08, Math.PI * 1.42);
  ctx.stroke();
  ctx.restore();
  void t;
}

/** Peint le terrain d'un style sur un rectangle (unités du champ). */
export function dessineTerrain(
  ctx: CanvasRenderingContext2D,
  skin: SkinId,
  w: number,
  h: number,
  sombre = false,
): void {
  const T = terrainDe(skin, sombre);
  ctx.fillStyle = T.sol;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = T.trame;
  ctx.strokeStyle = T.trame;
  if (T.motif === "points") {
    const pas = 50;
    for (let x = pas; x < w; x += pas) for (let y = pas; y < h; y += pas) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (T.motif === "grille") {
    ctx.lineWidth = 1.5;
    for (let x = 40; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 40; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else if (T.motif === "rayures") {
    ctx.lineWidth = 14;
    for (let k = -h; k < w + h; k += 60) {
      ctx.beginPath();
      ctx.moveTo(k, h);
      ctx.lineTo(k + h, 0);
      ctx.stroke();
    }
  } else if (T.motif === "damier") {
    const pas = 50;
    for (let x = 0; x < w; x += pas) for (let y = 0; y < h; y += pas) {
      if (((x + y) / pas) % 2 === 0) ctx.fillRect(x, y, pas, pas);
    }
  } else {
    // La craie : quelques traces effacées, toujours les mêmes.
    ctx.lineWidth = 26;
    ctx.lineCap = "round";
    for (let k = 0; k < 7; k++) {
      const x0 = bruit(3, k) * w;
      const y0 = bruit(5, k) * h;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + 120 + bruit(7, k) * 160, y0 + (bruit(9, k) - 0.5) * 40);
      ctx.stroke();
    }
  }
}

/**
 * L'aperçu d'un style pour la boutique : quatre pièces, une de chaque teinte,
 * sur leur terrain. Un canvas à part — jamais celui du jeu.
 */
export function dessineApercu(canvas: HTMLCanvasElement, skin: SkinId): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
  const W = 240;
  const H = 120;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dessineTerrain(ctx, skin, W, H);
  const pieces: [ShapeId, ColorId, number, number][] = [
    ["carre", "garance", 42, 62],
    ["rond", "azur", 100, 52],
    ["triangle", "ambre", 158, 66],
    ["rond", "jade", 208, 54],
  ];
  for (const [shape, color, x, y] of pieces) {
    dessinePiece(ctx, { shape, color, x, y, r: 22, r0: 22, phase: x }, skin, "paysage", null, 0);
  }
}
