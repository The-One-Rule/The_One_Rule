/**
 * Le calendrier de reprise couvre le sursis serveur — ni moins, ni plus.
 * Voir `src/net/reprise.ts` : il en couvrait 1,6 s sur 25.
 */
import { describe, expect, it } from "vitest";
import { ATTENTES_REPRISE_MS, ESSAIS_REPRISE, FENETRE_REPRISE_MS, MARGE_SURSIS_MS } from "../src/net/reprise";
import { RECONNECT_GRACE_MS } from "../shared/protocol";

describe("le calendrier de reprise", () => {
  it("couvre l'essentiel du sursis : une coupure de dix secondes se rattrape", () => {
    expect(FENETRE_REPRISE_MS).toBeGreaterThanOrEqual(RECONNECT_GRACE_MS * 0.6);
  });

  it("finit AVANT le sursis, avec de quoi faire un dernier essai", () => {
    expect(MARGE_SURSIS_MS).toBeGreaterThanOrEqual(2000);
  });

  it("rapproché au début, jamais plus serré ensuite", () => {
    expect(ATTENTES_REPRISE_MS[0]).toBeLessThanOrEqual(1000);
    for (let i = 1; i < ATTENTES_REPRISE_MS.length; i++) {
      expect(ATTENTES_REPRISE_MS[i]!).toBeGreaterThanOrEqual(ATTENTES_REPRISE_MS[i - 1]!);
    }
  });

  it("le panneau annonce le bon nombre d'essais", () => {
    expect(ESSAIS_REPRISE).toBe(ATTENTES_REPRISE_MS.length + 1);
  });
});
