/**
 * LA PREUVE DE LA MORT — `render/preuve.ts`.
 */
import { describe, expect, it } from "vitest";
import { miniatureSvg, preuveDeMort } from "../src/render/preuve";
import type { Entity } from "../src/engine/types";

const p = (x: number, y: number, r = 40): Pick<Entity, "x" | "y" | "r" | "shape" | "color"> => ({
  x,
  y,
  r,
  shape: "rond",
  color: "garance",
});
const ents = [p(100, 100), p(500, 200), p(900, 300)] as Entity[];
const sans = { temps: false, regle: false };

describe("la preuve de la mort", () => {
  it("entoure la pièce VISÉE, la plus proche de l'appui", () => {
    const pr = preuveDeMort({ ents, trap: false }, { x: 510, y: 205, frais: true }, sans);
    expect(pr.touchee).toBe(1);
    expect(pr.vide).toBeNull();
  });

  it("un appui dans le vide est marqué là où il est tombé", () => {
    const pr = preuveDeMort({ ents, trap: false }, { x: 300, y: 380, frais: true }, sans);
    expect(pr.touchee).toBeNull();
    expect(pr.vide).toEqual({ x: 300, y: 380 });
  });

  it("⚠️ un appui ANCIEN n'entoure rien — il viendrait d'une autre manche", () => {
    const pr = preuveDeMort({ ents, trap: false }, { x: 500, y: 200, frais: false }, sans);
    expect(pr.touchee).toBeNull();
    expect(pr.vide).toBeNull();
  });

  it("mort au temps : rien d'entouré, et « plus vite »", () => {
    const pr = preuveDeMort({ ents, trap: false }, { x: 500, y: 200, frais: true }, { temps: true, regle: false });
    expect(pr.touchee).toBeNull();
    expect(pr.fallait).toBe("plusVite");
  });

  it("un piège : il fallait ne rien faire — le piège est révélé APRÈS la mort (n°5)", () => {
    expect(preuveDeMort({ ents, trap: true }, null, { temps: false, regle: true }).fallait).toBe("rien");
    expect(preuveDeMort({ ents, trap: false }, null, { temps: false, regle: true }).fallait).toBe("sansTaRegle");
  });

  it("la miniature suit la vue donnée : debout, elle est en portrait", () => {
    const debout = { w: 250, h: 590, k: 0.59, ou: (x: number, y: number) => ({ x: y * 0.59, y: x * 0.59 }) };
    const svg = miniatureSvg(ents, { touchee: 1, vide: null }, () => "#f00", debout);
    expect(svg).toContain('viewBox="0 0 250 590"');
    // la pièce 1 (500, 200) passe en (118, 295)
    expect(svg).toContain('cx="118" cy="295"');
  });
});
