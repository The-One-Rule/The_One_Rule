/**
 * LA MONTÉE — `render/tension.ts`.
 *
 * Ce que ce fichier défend :
 *   · rien ne bat pendant l'échauffement (une tension sans enjeu apprend à
 *     l'ignorer) ;
 *   · la montée est MONOTONE : une manche de plus ne détend jamais ;
 *   · le cœur s'accélère d'un palier à l'autre, et encore en zone critique ;
 *   · le battement a deux temps et un repos.
 */
import { describe, expect, it } from "vitest";
import { eclatBattement, palierTension, periodeCoeur, SEUILS_TENSION } from "../src/render/tension";

describe("les paliers", () => {
  it("rien ne bat pendant l'échauffement", () => {
    for (let m = 0; m < 3; m++) {
      const p = palierTension(m, 3);
      expect(p.n).toBe(0);
      expect(periodeCoeur(p, false)).toBe(0);
      expect(p.voile).toBe(0);
    }
    expect(palierTension(3, 3).n).toBe(1);
  });

  it("la montée est monotone, manche par manche", () => {
    let avant = palierTension(0, 3);
    for (let m = 1; m < 200; m++) {
      const p = palierTension(m, 3);
      expect(p.n, `manche ${m}`).toBeGreaterThanOrEqual(avant.n);
      expect(p.voile).toBeGreaterThanOrEqual(avant.voile);
      expect(p.coeur).toBeGreaterThanOrEqual(avant.coeur);
      if (avant.battementMs && p.battementMs) expect(p.battementMs).toBeLessThanOrEqual(avant.battementMs);
      avant = p;
    }
    expect(avant.n).toBe(4);
  });

  it("chaque seuil ouvre exactement un palier", () => {
    for (let i = 1; i < SEUILS_TENSION.length; i++) {
      const s = SEUILS_TENSION[i]!;
      expect(palierTension(3 + s - 1, 3).n).toBe(i);
      expect(palierTension(3 + s, 3).n).toBe(i + 1);
    }
  });

  it("le voile ne couvre jamais plus qu'un tiers d'opacité", () => {
    // Il se peint sur le pourtour du terrain : au-delà, il se lirait comme
    // une page qui change de couleur, pas comme une pression.
    for (let m = 0; m < 300; m++) expect(palierTension(m, 0).voile).toBeLessThanOrEqual(0.33);
  });
});

describe("le cœur", () => {
  it("s'emballe en zone critique", () => {
    const p = palierTension(40, 3);
    expect(periodeCoeur(p, true)).toBeLessThan(periodeCoeur(p, false));
  });

  it("bat en deux temps, puis se tait", () => {
    const T = 1000;
    expect(eclatBattement(0, T)).toBe(1);
    expect(eclatBattement(200, T)).toBeCloseTo(0.6, 5);
    expect(eclatBattement(500, T)).toBe(0);
    expect(eclatBattement(900, T)).toBe(0);
    // la période suivante recommence
    expect(eclatBattement(T, T)).toBe(1);
    expect(eclatBattement(100, 0)).toBe(0);
  });
});
