/**
 * LA BOUTIQUE — les pièces achètent des styles, et rien d'autre.
 */
import { describe, expect, it } from "vitest";
import { achete, BOUTIQUE_VIERGE, litBoutique, porte, SKIN_DEFAUT, SKINS } from "../src/game/boutique";
import { normaliseSave } from "../src/game/progress";
import { PIECES_CHAPITRE, PIECES_PAR_ETOILE, NIVEAUX, ETOILES_MAX } from "../src/game/parcours";

describe("la boutique", () => {
  it("le style par défaut est offert et possédé d'office", () => {
    expect(SKINS[0]!.prix).toBe(0);
    expect(BOUTIQUE_VIERGE.possedes).toContain(SKIN_DEFAUT);
  });

  it("les prix montent, et le premier style payant tient dans UN chapitre parfait", () => {
    for (let k = 1; k < SKINS.length; k++) expect(SKINS[k]!.prix).toBeGreaterThan(SKINS[k - 1]!.prix);
    const chapitreParfait = NIVEAUX.length * ETOILES_MAX * PIECES_PAR_ETOILE + PIECES_CHAPITRE;
    expect(SKINS[1]!.prix).toBeLessThanOrEqual(chapitreParfait);
  });

  it("acheter débite, possède et PORTE aussitôt", () => {
    const r = achete(BOUTIQUE_VIERGE, 200, "neon");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pieces).toBe(50);
    expect(r.etat.possedes).toContain("neon");
    expect(r.etat.porte).toBe("neon");
  });

  it("refuse de vendre à crédit, et dit combien il manque", () => {
    const r = achete(BOUTIQUE_VIERGE, 100, "neon");
    expect(r).toEqual({ ok: false, raison: "pauvre", manque: 50 });
  });

  it("ne vend pas deux fois la même chose", () => {
    const r = achete({ possedes: ["sticker", "neon"], porte: "neon" }, 999, "neon");
    expect(r.ok).toBe(false);
  });

  it("on ne porte que ce qu'on possède", () => {
    expect(porte(BOUTIQUE_VIERGE, "craie").porte).toBe(SKIN_DEFAUT);
    expect(porte({ possedes: ["sticker", "craie"], porte: "sticker" }, "craie").porte).toBe("craie");
  });

  it("une sauvegarde bricolée retombe sur le défaut, sans rien perdre de valide", () => {
    expect(litBoutique(null)).toEqual(BOUTIQUE_VIERGE);
    expect(litBoutique({ possedes: ["neon", "licorne", "neon"], porte: "licorne" })).toEqual({
      possedes: ["sticker", "neon"],
      porte: "sticker",
    });
    expect(normaliseSave({ v: 1, boutique: { possedes: ["pixel"], porte: "pixel" } }).boutique).toEqual({
      possedes: ["sticker", "pixel"],
      porte: "pixel",
    });
  });
});
