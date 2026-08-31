/**
 * L'ESCALADE : la progression, et les deux garanties de tirage.
 *
 * Ce mode existe pour une raison chiffrée — les morts sur le piège sont
 * tombées à 4,1 % — et il la rate entièrement si sa première règle ne piège
 * pas : le joueur attendrait alors la huitième manche pour rencontrer une
 * contrainte réelle. C'est ce que ce fichier protège en premier.
 */
import { describe, expect, it } from "vitest";
import { ONE_RULES } from "../src/engine/rules";
import { compatibleAvec } from "../src/engine/rules/combine";
import { mulberry32 } from "../src/engine/rng";
import { PALIER, PALIER_MAX, avantPalier, pileA, pileEscalade, paliersA } from "../src/engine/escalade";

describe("progression des paliers", () => {
  it("démarre à une règle et en ajoute une tous les PALIER", () => {
    expect(paliersA(0)).toBe(1);
    expect(paliersA(PALIER - 1)).toBe(1);
    expect(paliersA(PALIER)).toBe(2);
    expect(paliersA(PALIER * 2)).toBe(3);
  });

  it("plafonne — au-delà, une mort n'est plus compréhensible", () => {
    // Le plafond n'est pas technique : c'est la limite au-delà de laquelle le
    // joueur ne sait plus POURQUOI il est mort, et une mort incomprise se lit
    // comme une injustice.
    expect(paliersA(PALIER * 20)).toBe(PALIER_MAX);
  });

  it("ne compte jamais moins d'une règle, même à un niveau absurde", () => {
    expect(paliersA(-5)).toBe(1);
  });

  it("annonce le prochain palier, et se tait quand il n'y en a plus", () => {
    const pile = pileEscalade(mulberry32(1));
    expect(avantPalier(pile, 0)).toBe(PALIER);
    expect(avantPalier(pile, PALIER - 1)).toBe(1);
    expect(avantPalier(pile, PALIER * (PALIER_MAX - 1))).toBeNull();
  });
});

describe("tirage de la pile", () => {
  it("OUVRE TOUJOURS sur une règle qui piège", () => {
    // La garantie qui donne son sens au mode. Sept règles sur douze ne piègent
    // jamais : sans cette contrainte, un run sur deux commencerait sans dents.
    for (let g = 1; g <= 300; g++) {
      const pile = pileEscalade(mulberry32(g));
      expect(pile[0]?.traps, `graine ${g} ouvre sur ${pile[0]?.name}`).toBe(true);
    }
  });

  it("n'empile que des règles compatibles entre elles", () => {
    // ÉCLAIR et LE MENTEUR se rendent mutuellement illisibles — mesuré.
    for (let g = 1; g <= 300; g++) {
      const pile = pileEscalade(mulberry32(g));
      for (let i = 0; i < pile.length; i++) {
        expect(compatibleAvec(pile.slice(0, i), pile[i]!), `graine ${g}`).toBe(true);
      }
    }
  });

  it("ne répète jamais une règle dans la pile", () => {
    for (let g = 1; g <= 200; g++) {
      const pile = pileEscalade(mulberry32(g));
      expect(new Set(pile.map((r) => r.id)).size).toBe(pile.length);
    }
  });

  it("remplit jusqu'au plafond quand le catalogue le permet", () => {
    for (let g = 1; g <= 100; g++) {
      expect(pileEscalade(mulberry32(g)).length).toBe(PALIER_MAX);
    }
  });

  it("varie d'une graine à l'autre — sinon c'est le bug du SANG à répétition", () => {
    // Le défaut du jour 2, puis celui du multijoueur : un tirage qui ne dépend
    // pas de la graine montre la même règle à tout le monde, à vie.
    const vues = new Set<string>();
    for (let g = 1; g <= 100; g++) vues.add(pileEscalade(mulberry32(g))[0]!.id);
    expect(vues.size, `le premier palier ne montre que ${[...vues].join(", ")}`).toBeGreaterThan(1);
  });

  it("respecte ce que l'appareil interdit", () => {
    // Même arbitrage que `withoutHold` : une règle injouable ici ne doit pas
    // être tirée du tout, plutôt que remplacée après coup.
    const sansMaintien = (r: (typeof ONE_RULES)[number]) => r.watchRelease === undefined;
    for (let g = 1; g <= 100; g++) {
      const pile = pileEscalade(mulberry32(g), sansMaintien);
      expect(pile.some((r) => r.watchRelease !== undefined), `graine ${g}`).toBe(false);
    }
  });

  it("tient encore si l'appareil ne laisse presque rien passer", () => {
    // Cas limite : une seule règle jouable. La pile doit exister quand même,
    // et le mode se comporter comme le jeu ordinaire.
    const pile = pileEscalade(mulberry32(7), (r) => r.id === "sang");
    expect(pile.map((r) => r.id)).toEqual(["sang"]);
    expect(pileA(pile, 999).length).toBe(1);
    expect(avantPalier(pile, 0)).toBeNull();
  });
});

describe("la pile tenue à une manche donnée", () => {
  it("ne révèle que ce que le palier autorise", () => {
    const pile = pileEscalade(mulberry32(42));
    expect(pileA(pile, 0).length).toBe(1);
    expect(pileA(pile, PALIER).length).toBe(2);
    expect(pileA(pile, PALIER * 99).length).toBe(pile.length);
  });

  it("les règles déjà gagnées ne changent JAMAIS en montant", () => {
    // Un joueur qui a intégré sa contrainte ne doit pas la voir remplacée : on
    // AJOUTE, on ne permute pas. C'est ce qui distingue l'escalade de la
    // rotation du multijoueur.
    const pile = pileEscalade(mulberry32(9));
    for (let lvl = 0; lvl < PALIER * PALIER_MAX + 5; lvl++) {
      const avant = pileA(pile, lvl);
      const apres = pileA(pile, lvl + 1);
      expect(apres.slice(0, avant.length).map((r) => r.id)).toEqual(avant.map((r) => r.id));
    }
  });
});
