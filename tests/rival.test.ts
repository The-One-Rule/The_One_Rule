/**
 * LE RIVAL DU JOUR — ce que ce fichier défend :
 *   · soi n'est jamais son propre rival, et un ami sans score du jour non plus ;
 *   · on dépasse les amis UN PAR UN, du plus faible au plus fort ; une égalité
 *     n'est pas un dépassement ;
 *   · le rang anonyme se tait sous `JOUEURS_MIN` joueurs ;
 *   · la carte raconte un dépassement avant un « presque », et un « presque »
 *     avant un pourcentage.
 */
import { describe, expect, it } from "vitest";
import {
  adversaires,
  cibleDuPied,
  depasses,
  JOUEURS_MIN,
  ligneRival,
  manquePour,
  nomCourt,
  partDepassee,
  prochainPalier,
  prochainRival,
  seuilTop,
} from "../src/game/rival";

const l = (pseudo: string, v: number | null, moi = false) => ({
  pseudo,
  moi,
  aujourdhui: v === null ? null : { valeur: v },
});

describe("les amis à dépasser", () => {
  const advs = adversaires([l("moi", 30, true), l("léa", 14), l("théo", 9), l("zoé", null), l("max", 22)]);

  it("sans soi, sans absent, du plus faible au plus fort", () => {
    expect(advs.map((a) => a.nom)).toEqual(["THÉO", "LÉA", "MAX"]);
  });

  it("le prochain est le plus faible encore devant ; l'égalité ne suffit pas", () => {
    expect(prochainRival(advs, 0)!.nom).toBe("THÉO");
    expect(prochainRival(advs, 9)!.nom).toBe("THÉO");
    expect(prochainRival(advs, 10)!.nom).toBe("LÉA");
    expect(prochainRival(advs, 23)).toBeNull();
    expect(manquePour(14, 12)).toBe(3);
  });

  it("dépassés : ceux qu'on franchit en passant d'un score à l'autre", () => {
    expect(depasses(advs, 9, 10).map((a) => a.nom)).toEqual(["THÉO"]);
    expect(depasses(advs, 10, 15).map((a) => a.nom)).toEqual(["LÉA"]);
    expect(depasses(advs, 0, 40).length).toBe(3);
    expect(depasses(advs, 14, 14)).toEqual([]);
  });

  it("un nom trop long se coupe pour tenir dans le pied", () => {
    expect(nomCourt("anticonstitutionnel").length).toBe(10);
    expect(nomCourt("  ")).toBe("?");
  });
});

describe("le rang anonyme", () => {
  const scores = [2, 4, 4, 6, 8, 10, 12, 14, 20, 30];

  it("se tait sous le seuil", () => {
    expect(partDepassee(scores.slice(0, JOUEURS_MIN - 1), 50)).toBeNull();
    expect(prochainPalier(scores.slice(0, JOUEURS_MIN - 1), 0)).toBeNull();
  });

  it("dit la part STRICTEMENT dépassée", () => {
    expect(partDepassee(scores, 4)).toBe(10);
    expect(partDepassee(scores, 5)).toBe(30);
    expect(partDepassee(scores, 31)).toBe(100);
  });

  it("le seuil d'un top suffit, et le cran d'avant ne suffit pas", () => {
    for (const top of [50, 25, 10, 1]) {
      const s = seuilTop(scores, top);
      expect(partDepassee(scores, s)!).toBeGreaterThanOrEqual(100 - top);
      if (s > 0) expect(partDepassee(scores, s - 1)!).toBeLessThan(100 - top);
    }
  });

  it("les paliers se franchissent dans l'ordre", () => {
    expect(prochainPalier(scores, 0)!.top).toBe(50);
    expect(prochainPalier(scores, seuilTop(scores, 50))!.top).toBe(25);
    expect(prochainPalier(scores, 999)).toBeNull();
  });
});

describe("le pied et la carte", () => {
  const advs = adversaires([l("léa", 14)]);
  const scores = Array.from({ length: 20 }, (_, i) => i);
  const presque = (m: number) => m <= 2;

  it("le pied vise un ami d'abord, puis un palier", () => {
    expect(cibleDuPied(advs, scores, 3)).toEqual({ kind: "ami", nom: "LÉA", valeur: 14 });
    expect(cibleDuPied(advs, scores, 15)!.kind).toBe("top");
    expect(cibleDuPied([], [], 3)).toBeNull();
  });

  it("dépassé > presque > part", () => {
    expect(ligneRival(advs, scores, 0, 16, presque)).toEqual({ kind: "depasse", noms: ["LÉA"] });
    expect(ligneRival(advs, scores, 0, 13, presque)).toEqual({ kind: "presque", nom: "LÉA", manque: 2 });
    expect(ligneRival(advs, scores, 0, 5, presque)).toEqual({ kind: "part", part: 25 });
    expect(ligneRival([], [], 0, 5, presque)).toBeNull();
  });

  it("un ami déjà dépassé avant ce run ne se raconte pas une seconde fois", () => {
    // Départ = le meilleur du jour d'avant : LÉA était déjà derrière.
    expect(ligneRival(advs, scores, 16, 17, presque)!.kind).toBe("part");
  });
});
