/**
 * Les flammes : ce qui doit rester vrai quoi qu'il arrive au dessin.
 *
 * Le rendu se juge à l'œil ; ces propriétés-là, non. Un feu qui déborde sur le
 * terrain cache une pièce, un feu qui s'allume sur une manche piégée révèle le
 * piège (n°5) — et aucun des deux ne se voit sur une capture prise au hasard.
 */
import { describe, expect, it } from "vitest";
import {
  FEU_MAX,
  ardeurDe,
  couleur,
  eteint,
  foyersPour,
  nouvelleGrille,
  pasDeFeu,
  poseInterdits,
} from "../src/render/flammes";
import type { Grille } from "../src/render/flammes";

/** Un hasard déterministe : xorshift sur 16 bits. */
function hasardDe(graine: number): () => number {
  let s = graine || 1;
  return () => {
    s ^= s << 7;
    s ^= s >> 9;
    s ^= s << 8;
    return s & 0xffff;
  };
}

/** Une scène type téléphone debout : 94 × 190 cases, terrain au milieu. */
function scene(): { g: Grille; socle: number; haut: number; terrain: { x0: number; y0: number; x1: number; y1: number } } {
  const g = nouvelleGrille(94, 190);
  const terrain = { x0: 16, y0: 40, x1: 78, y1: 178 };
  const socle = 184;
  poseInterdits(g, [terrain, { x0: 0, y0: socle + 1, x1: 94, y1: 190 }]);
  return { g, socle, haut: terrain.y0, terrain };
}

const chauffe = (s: ReturnType<typeof scene>, ardeur: number, pas: number, graine = 7): void => {
  const h = hasardDe(graine);
  for (let i = 0; i < pas; i++) pasDeFeu(s.g, foyersPour(ardeur, s.socle, s.haut), ardeur, h);
};

describe("le feu ne couvre jamais ce qu'il faut lire", () => {
  it("⚠️ aucune case du terrain ne s'allume, même à pleine ardeur", () => {
    const s = scene();
    chauffe(s, 1, 200);
    const { g, terrain } = s;
    let allumees = 0;
    for (let y = terrain.y0; y < terrain.y1; y++)
      for (let x = terrain.x0; x < terrain.x1; x++) if (g.feu[y * g.w + x]) allumees++;
    expect(allumees).toBe(0);
    // Les dents : le feu brûle bel et bien AUTOUR.
    expect(eteint(g)).toBe(false);
  });
});

describe("il suit l'avancée", () => {
  it("rien pendant l'échauffement, tout à la manche 30, jamais en arrière", () => {
    expect(ardeurDe(0, 3)).toBe(0);
    expect(ardeurDe(2, 3)).toBe(0);
    expect(ardeurDe(30, 3)).toBe(1);
    expect(ardeurDe(90, 3)).toBe(1);
    let avant = 0;
    for (let n = 0; n < 40; n++) {
      const a = ardeurDe(n, 3);
      expect(a).toBeGreaterThanOrEqual(avant);
      avant = a;
    }
  });

  it("à froid il ne prend pas ; éteint, il retombe à zéro", () => {
    const s = scene();
    chauffe(s, 0, 60);
    expect(eteint(s.g)).toBe(true);
    chauffe(s, 1, 80);
    expect(eteint(s.g)).toBe(false);
    chauffe(s, 0, 120);
    expect(eteint(s.g)).toBe(true);
  });

  it("plus on avance, plus il monte le long des bords", () => {
    const plusHaute = (ardeur: number): number => {
      const s = scene();
      chauffe(s, ardeur, 150);
      for (let y = 0; y < s.g.h; y++) if (s.g.feu[y * s.g.w] || s.g.feu[y * s.g.w + s.g.w - 1]) return y;
      return s.g.h;
    };
    const tiede = plusHaute(0.2);
    const chaud = plusHaute(1);
    expect(chaud).toBeLessThan(tiede);
    // à pleine ardeur, il passe au-dessus du haut du terrain
    expect(chaud).toBeLessThan(40);
  });

  it("le linteau — le feu par-dessus la barre — n'arrive qu'au-delà de 0,7", () => {
    expect(foyersPour(0.69, 184, 40)?.linteau).toBeNull();
    expect(foyersPour(0.7, 184, 40)?.linteau).toBe(38);
    expect(foyersPour(0.02, 184, 40)).toBeNull();
  });
});

describe("la palette", () => {
  it("transparente à zéro, blanche au sommet, et le blanc pousse vers le clair", () => {
    expect(couleur(0, 1)[3]).toBe(0);
    expect(couleur(FEU_MAX, 0)).toEqual([239, 234, 224, 255]);
    const tiede = couleur(12, 0);
    const eclat = couleur(12, 1);
    expect(eclat[0] + eclat[1] + eclat[2]).toBeGreaterThan(tiede[0] + tiede[1] + tiede[2]);
  });
});
