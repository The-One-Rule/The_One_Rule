import { describe, expect, it } from "vitest";
import { colorHex } from "../src/render/scene";
import { COLOR_IDS } from "../src/engine/types";

/* ------------------------------------------------------------------ *
 * Garde-fou de palette.
 *
 * Les couleurs de jeu portent de l'information : la consigne NOMME la
 * couleur, donc un joueur qui confond deux pièces n'a aucun moyen de
 * compenser. Ce test empêche qu'une future passe esthétique ne les
 * désature à nouveau — c'est exactement ce que faisait le document
 * d'identité, qui les affaiblissait pour laisser l'accent dominer.
 * ------------------------------------------------------------------ */

type RGB = [number, number, number];

const hex2rgb = (h: string): RGB => {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as RGB;
};
const srgb2lin = (c: number): number => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const lin2srgb = (c: number): number => {
  const x = Math.min(1, Math.max(0, c));
  return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
};

/** Matrices de simulation de dyschromatopsie (Viénot / Brettel, en RVB linéaire). */
const VISION: Record<string, number[][]> = {
  normale: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protanopie: [
    [0.1121, 0.8853, -0.0005],
    [0.1127, 0.8897, -0.0001],
    [0.0045, 0.0085, 1.0],
  ],
  deuteranopie: [
    [0.292, 0.7054, -0.0003],
    [0.2934, 0.7089, 0.0],
    [-0.0209, 0.0824, 1.0],
  ],
  tritanopie: [
    [1.0, 0.1499, -0.15],
    [0.0, 0.8055, 0.1945],
    [0.0, 0.5, 0.5],
  ],
};

const simulate = (rgb: RGB, kind: string): RGB => {
  const l = rgb.map(srgb2lin);
  const m = VISION[kind]!;
  return [0, 1, 2].map((i) => lin2srgb(m[i]!.reduce((s, v, j) => s + v * l[j]!, 0))) as RGB;
};

const toLab = (rgb: RGB): RGB => {
  const [r, g, b] = rgb.map(srgb2lin) as RGB;
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const deltaE = (a: RGB, b: RGB): number => {
  const [la, lb] = [toLab(a), toLab(b)];
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
};

const relLum = (rgb: RGB): number => {
  const [r, g, b] = rgb.map(srgb2lin) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const GROUND = hex2rgb("#161826");

describe("palette de jeu", () => {
  const pieces = COLOR_IDS.map((c) => hex2rgb(colorHex(c)));

  it("garde deux pièces distinguables, y compris en dyschromatopsie", () => {
    const report: string[] = [];
    for (const kind of Object.keys(VISION)) {
      const sim = pieces.map((p) => simulate(p, kind));
      let worst = Infinity;
      let pair = "";
      for (let i = 0; i < sim.length; i++)
        for (let j = i + 1; j < sim.length; j++) {
          const d = deltaE(sim[i]!, sim[j]!);
          if (d < worst) {
            worst = d;
            pair = `${COLOR_IDS[i]}/${COLOR_IDS[j]}`;
          }
        }
      report.push(`  ${kind.padEnd(13)} ΔE min ${worst.toFixed(1).padStart(5)}  (${pair})`);
      // 25 = seuil de confusion. On exige une vraie marge, pas la limite.
      expect(worst, `${kind} : ${pair} trop proches`).toBeGreaterThan(35);
    }
    console.log("\nSéparation des pièces :\n" + report.join("\n"));
  });

  it("garde chaque pièce lisible sur le sol nuit", () => {
    for (const c of COLOR_IDS) {
      const rgb = hex2rgb(colorHex(c));
      const ratio = (relLum(rgb) + 0.05) / (relLum(GROUND) + 0.05);
      expect(ratio, `${c} trop sombre sur le fond`).toBeGreaterThan(4.5);
    }
  });

  it("tient l'accent de la règle unique à l'écart des pièces", () => {
    // L'accent ne touche jamais une pièce, mais il ne doit pas non plus se
    // lire comme une cinquième couleur de jeu au coin de l'œil.
    const accent = hex2rgb("#9184D9");
    for (const c of COLOR_IDS) {
      const d = deltaE(simulate(accent, "deuteranopie"), simulate(hex2rgb(colorHex(c)), "deuteranopie"));
      expect(d, `accent confondable avec ${c}`).toBeGreaterThan(25);
    }
  });
});
