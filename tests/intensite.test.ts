/**
 * L'INTENSITÉ GAGNÉE — ce que ce fichier défend :
 *   · un débutant (palier 0, pas de série) ne voit AUCUN des effets forts ;
 *   · l'intensité est GAGNÉE : à palier égal, la série la fait monter, une
 *     faute la fait retomber sans la ramener à zéro ;
 *   · chaque effet est monotone — plus d'intensité ne donne jamais moins ;
 *   · la rupture est déterministe (des fissures qui changent d'image en image
 *     clignotent) et s'éteint à `RUPTURE_MS`.
 */
import { describe, expect, it } from "vitest";
import { effets, fissures, intensite, rupture, RUPTURE_MS, SERIE_PLEINE } from "../src/render/intensite";

describe("l'intensité", () => {
  it("un débutant ne voit rien d'autre qu'une gerbe", () => {
    const f = effets(intensite(0, 0));
    expect(f.onde).toBe(0);
    expect(f.poing).toBe(0);
    expect(f.serieVisible).toBe(false);
    expect(f.trainees).toBe(0);
    expect(f.etincelles).toBe(0);
    expect(f.pouls).toBe(0);
    expect(f.cascade).toBe(0);
    expect(f.gerbe).toBeGreaterThan(0);
  });

  it("se GAGNE : à palier égal, la série la fait monter", () => {
    for (let p = 0; p <= 4; p++) {
      expect(intensite(p, 10)).toBeGreaterThan(intensite(p, 0));
      expect(intensite(p, SERIE_PLEINE)).toBeGreaterThan(intensite(p, 10));
    }
  });

  it("une faute retombe sur la part du palier, pas à zéro", () => {
    expect(intensite(4, 0)).toBeGreaterThan(0);
    expect(intensite(4, 0)).toBeLessThan(intensite(4, 8));
  });

  it("le sommet n'est atteint qu'avec les deux", () => {
    expect(intensite(4, SERIE_PLEINE)).toBe(1);
    expect(intensite(4, 0)).toBeLessThan(0.5);
    expect(intensite(0, SERIE_PLEINE)).toBeLessThan(0.7);
  });

  it("chaque effet est monotone", () => {
    let avant = effets(0);
    for (let k = 1; k <= 100; k++) {
      const f = effets(k / 100);
      for (const cle of ["gerbe", "vitesse", "onde", "poing", "trainees", "etincelles", "cadre", "pouls", "cascade"] as const) {
        expect(f[cle], `${cle} à ${k}`).toBeGreaterThanOrEqual(avant[cle]);
      }
      avant = f;
    }
  });

  it("⚠️ le coup de poing reste sous 1,2 % : le dessin ne s'écarte jamais de la cible", () => {
    // Le hit-test ne voit pas le poing ; à 1,2 %, une pièce au bord du champ
    // se déplace de 6 unités, sous la marge de 22 % du hit-test (HIT 1.22).
    expect(effets(1).poing).toBeLessThanOrEqual(0.012);
  });
});

describe("la rupture", () => {
  it("un éclair court, puis le terrain éteint et fendu", () => {
    expect(rupture(0, 0.5).eclair).toBeGreaterThan(0.5);
    expect(rupture(200, 0.5).eclair).toBe(0);
    expect(rupture(400, 0.5).voile).toBeGreaterThan(0.4);
    expect(rupture(400, 0.5).fissure).toBe(1);
    expect(rupture(RUPTURE_MS, 1)).toEqual({ eclair: 0, voile: 0, fissure: 0 });
  });

  it("un joueur lancé meurt plus fort", () => {
    expect(rupture(300, 1).voile).toBeGreaterThan(rupture(300, 0).voile);
  });

  it("les fissures sont déterministes", () => {
    expect(fissures(42)).toEqual(fissures(42));
    expect(fissures(42)).not.toEqual(fissures(43));
    expect(fissures(7).every((r) => r[0]![0] === 0 && r[0]![1] === 0)).toBe(true);
  });
});
