/**
 * LES RÉCOMPENSES EN PIÈCES — les quatre cartes du kanban.
 *
 * Ce que ce fichier tient : le barème de la place finale (ex æquo compris),
 * le quart de pièce par manche sans jamais afficher de fraction, le plafond
 * du jour qui borne le farming à deux onglets, et le combo plafonné à ×2.
 */
import { describe, expect, it } from "vitest";
import {
  BOURSE_VIDE,
  comboApres,
  crediteParties,
  manchesJoueesSolo,
  multiplicateurCombo,
  piecesAvecCombo,
  piecesDeRang,
  PLAFOND_PARTIES_JOUR,
} from "../src/game/recompenses";
import { classeMatch } from "../src/render/rangs";
import { normaliseSave } from "../src/game/progress";

describe("la place finale", () => {
  it("1er 50, 2e 25, 3e 10, ensuite rien", () => {
    expect([1, 2, 3, 4, 10].map((r) => piecesDeRang(r, 10))).toEqual([50, 25, 10, 0, 0]);
  });

  it("rien sans adversaire, rien pour un rang absurde", () => {
    expect(piecesDeRang(1, 1)).toBe(0);
    expect(piecesDeRang(0, 5)).toBe(0);
    expect(piecesDeRang(1.5, 5)).toBe(0);
  });

  it("des ex æquo partagent leur rang, donc leur récompense", () => {
    const joueurs = [
      { id: "a", lives: 2, score: 30 },
      { id: "b", lives: 2, score: 30 },
      { id: "c", lives: 0, score: 12 },
    ];
    const c = classeMatch(joueurs, null);
    const rangs = Object.fromEntries(c.map((x) => [x.joueur.id, piecesDeRang(x.rang, c.length)]));
    expect(rangs).toEqual({ a: 50, b: 50, c: 10 });
  });
});

describe("le quart de pièce par manche", () => {
  it("quatre manches font une pièce, le reste attend en reliquat", () => {
    const a = crediteParties(BOURSE_VIDE, 100, 0, 7);
    expect(a.pieces).toBe(1);
    expect(a.bourse.quarts).toBe(3);
    const b = crediteParties(a.bourse, 100, 0, 1);
    expect(b.pieces).toBe(1);
    expect(b.bourse.quarts).toBe(0);
  });

  it("jamais de fraction dans le solde : les pièces rendues sont entières", () => {
    let bourse = { ...BOURSE_VIDE };
    for (let n = 0; n < 50; n++) {
      const r = crediteParties(bourse, 7, n % 3 === 0 ? 10 : 0, n % 5);
      expect(Number.isInteger(r.pieces)).toBe(true);
      expect(r.bourse.quarts).toBeGreaterThanOrEqual(0);
      expect(r.bourse.quarts).toBeLessThan(4);
      bourse = r.bourse;
    }
  });

  it("jouées = tenues, plus la fatale", () => {
    expect(manchesJoueesSolo(12, true)).toBe(13);
    expect(manchesJoueesSolo(40, false)).toBe(40);
  });
});

describe("le plafond du jour", () => {
  it("borne le farming : pas plus de 150 pièces de partie par jour", () => {
    let bourse = { ...BOURSE_VIDE };
    let total = 0;
    let plafonne = false;
    // Cent victoires « à deux onglets » dans la journée.
    for (let k = 0; k < 100; k++) {
      const r = crediteParties(bourse, 42, 50, 8);
      total += r.pieces;
      plafonne ||= r.plafonne;
      bourse = r.bourse;
    }
    expect(total).toBe(PLAFOND_PARTIES_JOUR);
    expect(plafonne).toBe(true);
  });

  it("repart à zéro le lendemain", () => {
    const hier = crediteParties(BOURSE_VIDE, 42, 200, 0);
    expect(hier.pieces).toBe(PLAFOND_PARTIES_JOUR);
    expect(crediteParties(hier.bourse, 43, 50, 0).pieces).toBe(50);
  });
});

describe("le combo", () => {
  it("monte sur un niveau sans vie perdue, retombe sinon", () => {
    expect(comboApres(0, true, 0)).toBe(1);
    expect(comboApres(3, true, 0)).toBe(4);
    expect(comboApres(3, true, 1)).toBe(0);
    expect(comboApres(3, false, 0)).toBe(0);
  });

  it("×1 jusqu'à 1, puis +0,25 par niveau, plafonné à ×2", () => {
    expect([0, 1, 2, 3, 4, 5, 9, 100].map(multiplicateurCombo)).toEqual([1, 1, 1.25, 1.5, 1.75, 2, 2, 2]);
  });

  it("ne multiplie que ce que le niveau rapporte : zéro reste zéro", () => {
    expect(piecesAvecCombo(30, 3)).toBe(45);
    expect(piecesAvecCombo(0, 10)).toBe(0);
  });
});

describe("la sauvegarde", () => {
  it("une sauvegarde d'avant n'a ni bourse ni combo : ils partent vides", () => {
    const s = normaliseSave({ coins: 120 });
    expect(s.coins).toBe(120);
    expect(s.bourse).toEqual(BOURSE_VIDE);
    expect(s.comboNiveaux).toBe(0);
  });

  it("une bourse bricolée est ramenée dans ses bornes", () => {
    const s = normaliseSave({ bourse: { quarts: 99, jour: "x", gagnes: -5 }, comboNiveaux: -3 });
    expect(s.bourse.quarts).toBe(3);
    expect(s.bourse.gagnes).toBe(0);
    expect(s.comboNiveaux).toBe(0);
  });
});
