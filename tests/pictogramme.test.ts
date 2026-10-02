/**
 * LA CONSIGNE DESSINÉE — `render/pictogramme.ts`.
 *
 * DENTS : retirer une des trois gardes (mensonge, encre, éclair) fait tomber
 * le test de la règle correspondante.
 */
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/engine/rng";
import { ONE_RULES } from "../src/engine/rules";
import { INSTRUCTIONS_SOLO } from "../src/engine/instructions";
import { buildRound } from "../src/engine/round";
import { pictogramme } from "../src/render/pictogramme";

const regle = (id: string) => ONE_RULES.find((r) => r.id === id)!;

/** Des manches réelles sous une règle, sur plusieurs graines. */
function manches(id: string, n = 300) {
  const out = [];
  for (let g = 1; out.length < n; g++) {
    const rng = mulberry32(g);
    for (let lvl = 0; lvl < 30; lvl++) out.push(buildRound(rng, lvl, regle(id), INSTRUCTIONS_SOLO));
  }
  return out;
}

describe("la consigne dessinée", () => {
  it("dessine la pièce que la consigne écrite désigne", () => {
    expect(pictogramme({ phrase: { cle: "clicFormeCouleur", forme: "carre", couleur: "azur" } })).toEqual({
      geste: "clic",
      pieces: [{ forme: "carre", couleur: "azur" }],
    });
    expect(pictogramme({ phrase: { cle: "glisseCouleur", couleur: "ambre", couleur2: "azur" } })?.pieces.length).toBe(2);
    expect(pictogramme({ phrase: { cle: "tiensCouleur", couleur: "ambre" } })?.geste).toBe("tiens");
    expect(pictogramme({ phrase: { cle: "deuxFoisForme", forme: "rond" } })?.geste).toBe("double");
  });

  it("se tait sur ce qu'un dessin dirait mal : négations, intrus, lettres", () => {
    for (const cle of ["clicPasCouleur", "clicPasForme", "clicSauf", "clicIntrus", "tapeLettre", "clic"]) {
      expect(pictogramme({ phrase: { cle, couleur: "garance", forme: "rond" } }), cle).toBeNull();
    }
  });

  it("dessine la majorité des manches ordinaires", () => {
    const ms = manches("sang");
    const dessinees = ms.filter((r) => pictogramme(r) !== null).length;
    expect(dessinees / ms.length).toBeGreaterThan(0.3);
  });

  it("⚠️ LE MENTEUR : jamais de dessin — il dénoncerait le mensonge", () => {
    for (const r of manches("menteur")) if (r.falseText !== undefined) expect(pictogramme(r)).toBeNull();
  });

  it("⚠️ LE DALTONIEN : jamais de dessin — il trancherait le mot contre l'encre", () => {
    const ms = manches("daltonien").filter((r) => r.inkColor !== undefined);
    expect(ms.length).toBeGreaterThan(0);
    for (const r of ms) expect(pictogramme(r)).toBeNull();
  });

  it("⚠️ L'ÉCLAIR : jamais de dessin — il resterait quand la consigne s'efface", () => {
    for (const r of manches("eclair")) expect(pictogramme(r)).toBeNull();
  });
});
