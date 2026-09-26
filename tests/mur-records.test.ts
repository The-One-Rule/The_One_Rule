import { describe, expect, it } from "vitest";
import { lignesRecords, REGLES_CITEES } from "../src/game/murRecords";

const vide = { jour: null, parAllure: new Map<number, number>(), pile: 0, parRegle: new Map<string, number>() };

describe("tes records", () => {
  it("un joueur neuf n'a AUCUNE ligne — pas une rangée de zéros", () => {
    expect(lignesRecords(vide)).toEqual([]);
  });

  it("⚠️ le record d'une AUTRE allure que la sienne est montré (la capture de Pierre)", () => {
    const l = lignesRecords({ ...vide, parAllure: new Map([[2, 0], [1, 24]]) });
    expect(l).toEqual([{ quoi: "allure", cle: 1, valeur: 24 }]);
  });

  it("les allures vont de la plus lente à la plus rapide", () => {
    const l = lignesRecords({ ...vide, parAllure: new Map([[0.8, 5], [2, 30], [1, 12]]) });
    expect(l.map((x) => x.cle)).toEqual([2, 1, 0.8]);
  });

  it(`cite au plus ${REGLES_CITEES} règles, les mieux tenues d'abord`, () => {
    const l = lignesRecords({ ...vide, parRegle: new Map([["a", 3], ["b", 9], ["c", 0], ["d", 7], ["e", 5]]) });
    expect(l.map((x) => x.cle)).toEqual(["b", "d", "e"]);
  });

  it("chaque ligne dit son épreuve, dans l'ordre jour · allures · pile · règles", () => {
    const l = lignesRecords({ jour: 12, parAllure: new Map([[1, 20]]), pile: 3, parRegle: new Map([["sang", 8]]) });
    expect(l.map((x) => x.quoi)).toEqual(["jour", "allure", "pile", "regle"]);
  });
});
