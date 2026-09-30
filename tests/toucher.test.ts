/**
 * LES GROS DOIGTS — `render/toucher.ts`.
 *
 * DENTS : remettre `rayonAffiche` à `r` fait tomber le test du diamètre à
 * l'écran ; retirer la marge en pixels fait tomber celui du pouce ; départager par
 * le bord au lieu du centre fait tomber celui de la petite voisine.
 */
import { describe, expect, it } from "vitest";
import { GROSSI_TACTILE, MARGE_DOIGT_PX, RAYON_MAX, pieceTouchee, rayonAffiche } from "../src/render/toucher";
import { RADIUS, FIELD_H } from "../src/engine/types";
import type { Entity } from "../src/engine/types";

const ECHELLE_TEL = 0.557; // terrain debout mesuré à 375 × 812
const HIT = 1.22;

function piece(idx: number, x: number, y: number, r: number): Entity {
  return { idx, x, y, ox: x, oy: y, r, shape: "rond", color: "rouge", size: "M", phase: 0, moving: false } as unknown as Entity;
}

describe("le dessin grossit au doigt", () => {
  it("une petite pièce passe d'environ 34 px à plus de 40 px à l'écran", () => {
    expect(2 * RADIUS.S * ECHELLE_TEL).toBeLessThan(35);
    expect(2 * rayonAffiche(RADIUS.S, GROSSI_TACTILE) * ECHELLE_TEL).toBeGreaterThan(40);
  });

  it("à la souris, rien ne change", () => {
    for (const r of Object.values(RADIUS)) expect(rayonAffiche(r, 1)).toBe(r);
  });

  it("la plus grande pièce tient encore dans sa cellule (140 debout)", () => {
    const cellule = FIELD_H / 3;
    const l = rayonAffiche(RADIUS.L, GROSSI_TACTILE);
    expect(l).toBeLessThanOrEqual(RAYON_MAX);
    // centre au plus à 1 unité du milieu de sa cellule (freeY du tirage)
    expect(cellule / 2 + 1 + l).toBeLessThan(cellule);
  });

  it("les tailles restent dans le même ordre", () => {
    const [s, m, l] = [RADIUS.S, RADIUS.M, RADIUS.L].map((r) => rayonAffiche(r, GROSSI_TACTILE));
    expect(s).toBeLessThan(m!);
    expect(m).toBeLessThan(l!);
  });
});

describe("le toucher suit le doigt", () => {
  const o = { grossi: GROSSI_TACTILE, margeChamp: MARGE_DOIGT_PX / ECHELLE_TEL, hit: HIT };

  it("un pouce posé 10 px À CÔTÉ d'une petite pièce la touche encore", () => {
    const p = piece(0, 500, 200, RADIUS.S);
    const bord = rayonAffiche(RADIUS.S, GROSSI_TACTILE);
    const dx = bord + 10 / ECHELLE_TEL;
    expect(pieceTouchee([p], 500 + dx, 200, o)).toBe(p);
    // …et l'ancien hit-test la ratait.
    expect(pieceTouchee([p], 500 + dx, 200, { grossi: 1, margeChamp: 0, hit: HIT })).toBeNull();
  });

  it("le vide reste le vide au-delà de la marge", () => {
    const p = piece(0, 500, 200, RADIUS.S);
    expect(pieceTouchee([p], 500 + 200, 200, o)).toBeNull();
  });

  it("entre une grande et une petite voisine, la grande ne vole pas l'appui", () => {
    const grande = piece(0, 300, 200, RADIUS.L);
    const petite = piece(1, 440, 200, RADIUS.S);
    // dans la marge des deux, plus près du bord de la grande, du centre de la petite
    const x = 384;
    expect(x - 300 - rayonAffiche(RADIUS.L, GROSSI_TACTILE)).toBeLessThan(440 - rayonAffiche(RADIUS.S, GROSSI_TACTILE) - x);
    expect(pieceTouchee([grande, petite], x, 200, o)).toBe(petite);
  });

  it("à la souris, la zone reste exactement l'ancienne (r × 1,22)", () => {
    const p = piece(0, 500, 200, RADIUS.M);
    const souris = { grossi: 1, margeChamp: 0, hit: HIT };
    expect(pieceTouchee([p], 500 + RADIUS.M * HIT - 0.5, 200, souris)).toBe(p);
    expect(pieceTouchee([p], 500 + RADIUS.M * HIT + 0.5, 200, souris)).toBeNull();
  });
});
