/**
 * LE QR DU SALON — `render/qr.ts`. Pas de décodeur ici : on vérifie ce qui
 * fait qu'un téléphone le lit — la taille d'une version QR, les trois motifs
 * de repérage aux coins, et la zone de silence.
 */
import { describe, expect, it } from "vitest";
import { matriceQr, qrSvg, ZONE_SILENCE } from "../src/render/qr";

const URL = "https://www.theonerule.party/#j=KZMB";

describe("le QR du salon", () => {
  const m = matriceQr(URL);

  it("a la taille d'une version QR (17 + 4v modules)", () => {
    expect((m.length - 17) % 4).toBe(0);
    expect(m.length).toBeGreaterThanOrEqual(21);
    for (const l of m) expect(l.length).toBe(m.length);
  });

  it("porte ses trois motifs de repérage", () => {
    const n = m.length;
    const repere = (r0: number, c0: number) => {
      for (let i = 0; i < 7; i++) {
        // le cadre extérieur 7 × 7 est plein
        expect(m[r0]![c0 + i]).toBe(true);
        expect(m[r0 + 6]![c0 + i]).toBe(true);
        expect(m[r0 + i]![c0]).toBe(true);
        expect(m[r0 + i]![c0 + 6]).toBe(true);
      }
      // l'anneau intérieur est vide, le cœur 3 × 3 plein
      expect(m[r0 + 1]![c0 + 1]).toBe(false);
      expect(m[r0 + 3]![c0 + 3]).toBe(true);
    };
    repere(0, 0);
    repere(0, n - 7);
    repere(n - 7, 0);
  });

  it("garde sa zone de silence de quatre modules", () => {
    expect(ZONE_SILENCE).toBe(4);
    const svg = qrSvg(URL);
    const t = m.length + 8;
    expect(svg).toContain(`viewBox="0 0 ${t} ${t}"`);
    // aucun module ne commence dans la marge
    for (const x of svg.matchAll(/M(\d+) (\d+)h/g)) {
      expect(+x[1]!).toBeGreaterThanOrEqual(4);
      expect(+x[2]!).toBeGreaterThanOrEqual(4);
    }
  });

  it("deux codes différents donnent deux QR différents", () => {
    expect(qrSvg(URL)).not.toBe(qrSvg(URL.replace("KZMB", "KZMQ")));
  });
});
