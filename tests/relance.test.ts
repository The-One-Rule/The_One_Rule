/**
 * LA RELANCE EN UN GESTE — ce que ce fichier défend :
 *   · la carte ne paraît que sur une MORT ordinaire : jamais sur un duel, un
 *     niveau, un classé, un run terminé, ni quand l'écran de fin a quelque
 *     chose à donner ;
 *   · le run du jour n'y a droit que s'il reste un essai ;
 *   · « presque » est borné : un reproche (« à 38 ») ne se dit pas.
 */
import { describe, expect, it } from "vitest";
import { estPresque, relancePossible, vueRelance, type EtatMort } from "../src/render/relance";

const base: EtatMort = {
  mode: "training",
  duel: false,
  niveau: false,
  termine: false,
  essaisRestants: 0,
  aDonner: false,
};

describe("la carte de relance paraît-elle ?", () => {
  it("oui sur une mort d'entraînement ou de pile", () => {
    expect(relancePossible(base)).toBe(true);
    expect(relancePossible({ ...base, mode: "escalade" })).toBe(true);
  });

  it("le run du jour seulement s'il reste un essai", () => {
    expect(relancePossible({ ...base, mode: "daily", essaisRestants: 1 })).toBe(true);
    expect(relancePossible({ ...base, mode: "daily", essaisRestants: 0 })).toBe(false);
  });

  it("jamais sur un duel, un niveau, un classé ou un run terminé", () => {
    expect(relancePossible({ ...base, duel: true })).toBe(false);
    expect(relancePossible({ ...base, niveau: true })).toBe(false);
    expect(relancePossible({ ...base, mode: "ranked" })).toBe(false);
    expect(relancePossible({ ...base, mode: "daily", essaisRestants: 2, termine: true })).toBe(false);
  });

  it("⚠️ jamais quand l'écran de fin a quelque chose à donner", () => {
    expect(relancePossible({ ...base, aDonner: true })).toBe(false);
    expect(relancePossible({ ...base, mode: "daily", essaisRestants: 2, aDonner: true })).toBe(false);
  });
});

describe("ce que la carte dit du record", () => {
  it("battre zéro n'est pas un record", () => {
    expect(vueRelance(4, 0).id).toBe("premier");
  });

  it("record, égalé, presque, loin", () => {
    expect(vueRelance(25, 23)).toEqual({ id: "record", ancien: 23, ecart: 2 });
    expect(vueRelance(23, 23)).toEqual({ id: "egale", ancien: 23, ecart: 0 });
    expect(vueRelance(21, 23)).toEqual({ id: "presque", ancien: 23, ecart: 2 });
    expect(vueRelance(5, 43)).toEqual({ id: "loin", ancien: 43, ecart: 38 });
  });

  it("« presque » : deux manches au moins, 15 % au-delà", () => {
    expect(estPresque(2, 5)).toBe(true);
    expect(estPresque(3, 5)).toBe(false);
    expect(estPresque(9, 60)).toBe(true);
    expect(estPresque(10, 60)).toBe(false);
    expect(estPresque(0, 60)).toBe(false);
  });
});
