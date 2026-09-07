/**
 * L'ESCALADE ET LE CARNET — la règle fantôme.
 *
 * ⚠️ **RAPPORTÉ EN PLAYTEST** : « dans l'escalade, lorsqu'il y a le récap, les
 * cartes qui s'affichent sont buguées à la fin ». C'était la moitié VISIBLE
 * d'un défaut plus large.
 *
 * En escalade, la règle en vigueur est la COMPOSÉE d'une pile, et
 * `combineRules` fabrique son identifiant en collant les autres avec des `+` :
 * « azur+pointe+voyelle+colosse ». L'écran allait donc chercher
 * `/cartes/azur+pointe+voyelle+colosse.png` — 404, un rectangle mort à la place
 * de l'illustration.
 *
 * ⚠️ **ET LA MOITIÉ INVISIBLE ÉTAIT PIRE.** Cet identifiant était écrit au
 * CARNET. Il créait une entrée fantôme : absente du catalogue, donc invisible
 * dans la collection, mais bien comptée partout où l'on compte des clés —
 * le nombre de règles rencontrées, la jauge du compte, le seuil « ce joueur
 * connaît le jeu » de l'accueil — et expédiée au compte, où elle occupait une
 * des 64 places que `api/moi.ts` accepte. Une seule partie d'escalade suffisait.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { combineRules } from "../src/engine/rules/combine";
import { ONE_RULES } from "../src/engine/rules";
import { pileEscalade } from "../src/engine/escalade";
import { mulberry32 } from "../src/engine/rng";

describe("l'identifiant d'une pile n'est pas une règle", () => {
  it("il est fabriqué, et il n'existe nulle part au catalogue", () => {
    /*
     * Le fait de départ, mesuré. Si `combineRules` cessait un jour de coller
     * les identifiants, ce test le dirait — et les gardes ci-dessous
     * deviendraient inutiles plutôt que fausses.
     */
    const a = ONE_RULES.find((r) => r.id === "sang")!;
    const b = ONE_RULES.find((r) => r.id === "pointe")!;
    const composee = combineRules([a, b]);
    expect(composee.id).toContain("+");
    expect(
      ONE_RULES.some((r) => r.id === composee.id),
      "une composée ne doit jamais ressembler à une règle du catalogue",
    ).toBe(false);
  });

  it("une pile d'UNE règle rend cette règle elle-même", () => {
    // C'est ce qui permet au mode ordinaire d'être un cas particulier de
    // l'escalade sans aucun branchement — et c'est aussi pourquoi le bug ne se
    // voyait qu'à partir du deuxième palier.
    const a = ONE_RULES.find((r) => r.id === "sang")!;
    expect(combineRules([a]).id).toBe("sang");
  });

  it("⚠️ toutes les piles tirées produisent des identifiants composés", () => {
    let composees = 0;
    for (let g = 1; g <= 60; g++) {
      const pile = pileEscalade(mulberry32(g), () => true);
      const id = combineRules(pile).id;
      if (pile.length > 1) {
        composees++;
        expect(ONE_RULES.some((r) => r.id === id), `graine ${g} : ${id}`).toBe(false);
      }
    }
    expect(composees, "aucune pile de plus d'une règle : le test ne prouve rien").toBeGreaterThan(
      40,
    );
  });
});

describe("ce que le code s'interdit désormais", () => {
  const source = readFileSync("src/main.ts", "utf8");

  it("la vignette refuse un identifiant absent du catalogue", () => {
    /*
     * La garde vit dans `carteVignette`, c'est-à-dire au seul endroit que les
     * SEPT surfaces qui montrent une carte traversent. La poser sur chaque
     * appelant aurait demandé de n'en oublier aucun — et le prochain aurait
     * oublié.
     */
    const i = source.indexOf("function carteVignette");
    const corps = source.slice(i, source.indexOf("\n}", i));
    expect(corps, "la vignette peut à nouveau demander une image inexistante").toMatch(
      /ONE_RULES\.some\([\s\S]*?\)\)\s*return\s*""/,
    );
  });

  it("l'escalade inscrit ses VRAIES règles, et s'arrête avant la composée", () => {
    /*
     * Deux moitiés, et il faut les deux : inscrire les vraies règles sans
     * couper le chemin d'après laisserait le fantôme revenir par la porte
     * qu'on vient de fermer.
     */
    expect(source, "les règles tenues ne sont plus inscrites une par une").toMatch(
      /for \(const r of reglesTenues\)/,
    );
    const i = source.indexOf("for (const r of reglesTenues)");
    expect(
      source.slice(i, i + 1400),
      "l'escalade retombe dans l'écriture de la composée",
    ).toMatch(/if \(mode === "escalade"\) \{[\s\S]{0,400}?return;/);
  });
});
