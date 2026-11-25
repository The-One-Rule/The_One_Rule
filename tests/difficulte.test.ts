/**
 * LA DIFFICULTÉ DES CONSIGNES — le réglage DOUCES / TOUTES / CORSÉES du salon.
 *
 * Ce que ce fichier tient :
 *   · TOUTES (et l'absence du réglage) tire EXACTEMENT les manches d'hier ;
 *   · DOUCES et CORSÉES déplacent vraiment le tirage, mesuré ;
 *   · « jamais deux pièges d'affilée » reste prioritaire sur la classe ;
 *   · le réglage se lit et se nettoie sans erreur, et le serveur l'applique.
 */
import { describe, expect, it } from "vitest";
import { CONSIGNES_CORSEES, DIFFICULTES, difficulteDuReglage, estCorsee, prefereConsigne } from "../src/engine/difficulte";
import { draftShared, poolMulti, tirageSansDoublePiege } from "../src/engine/multiround";
import { INSTRUCTIONS, CONSIGNES_MULTI } from "../src/engine/instructions";
import { ruleById } from "../src/engine/rules";
import { MatchLogic } from "../server/match";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../shared/protocol";

const POOL = poolMulti(false, 4);

/** Part de consignes corsées sur `n` matchs × manches 10 à 39, pour une préférence. */
function partCorsee(prefere: ((id: string) => boolean) | undefined): number {
  let c = 0;
  let n = 0;
  for (let s = 1; s <= 120; s++)
    for (let idx = 10; idx < 40; idx++) {
      const t = tirageSansDoublePiege(s, idx, POOL, [], prefere);
      if (estCorsee(draftShared(s, idx, POOL, t).instructionId)) c++;
      n++;
    }
  return c / n;
}

describe("les classes de consignes", () => {
  it("chaque consigne corsée existe au catalogue", () => {
    const ids = new Set([...INSTRUCTIONS, ...CONSIGNES_MULTI].map((i) => i.id));
    for (const id of CONSIGNES_CORSEES) expect(ids.has(id)).toBe(true);
  });

  it("le réglage absent, douteux ou hors bornes vaut TOUTES", () => {
    expect(difficulteDuReglage(undefined)).toBe("normale");
    expect(difficulteDuReglage("2")).toBe("normale");
    expect(difficulteDuReglage(9)).toBe("normale");
    expect(DIFFICULTES.map((_, i) => difficulteDuReglage(i))).toEqual(["douce", "normale", "corsee"]);
  });

  it("sanitizeSettings garde 0 et 2, et OMET la valeur par défaut", () => {
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, difficulte: 0 }).difficulte).toBe(0);
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, difficulte: 2 }).difficulte).toBe(2);
    expect("difficulte" in sanitizeSettings({ ...DEFAULT_SETTINGS, difficulte: 1 })).toBe(false);
    expect("difficulte" in sanitizeSettings({ ...DEFAULT_SETTINGS, difficulte: 7 })).toBe(false);
  });
});

describe("le tirage", () => {
  it("TOUTES tire exactement les manches d'hier", () => {
    expect(prefereConsigne("normale")).toBeUndefined();
    for (let s = 1; s < 60; s++)
      for (let idx = 0; idx < 30; idx++) expect(tirageSansDoublePiege(s, idx, POOL, [], undefined)).toBe(0);
  });

  it("DOUCES et CORSÉES déplacent vraiment la part de consignes corsées", () => {
    const base = partCorsee(undefined);
    const douce = partCorsee(prefereConsigne("douce"));
    const corsee = partCorsee(prefereConsigne("corsee"));
    // Mesuré : environ 45 % au naturel ; quasiment rien en DOUCES, quasiment tout en CORSÉES.
    expect(douce).toBeLessThan(0.05);
    expect(corsee).toBeGreaterThan(0.95);
    expect(base).toBeGreaterThan(douce + 0.2);
    expect(base).toBeLessThan(corsee - 0.2);
  });

  it("jamais deux pièges d'affilée passe AVANT la classe", () => {
    const sang = ruleById("sang")!;
    let compte = 0;
    for (let s = 1; s < 200; s++)
      for (let idx = 3; idx < 30; idx++) {
        const t = tirageSansDoublePiege(s, idx, POOL, [sang], prefereConsigne("corsee"));
        const d = draftShared(s, idx, POOL, t);
        // Il existe presque toujours un tirage sans piège : il doit être pris.
        if (!sang.forbids(d.want, d.ents)) compte++;
      }
    expect(compte / (199 * 27)).toBeGreaterThan(0.99);
  });
});

describe("le serveur applique le réglage", () => {
  it("un salon CORSÉ tire des consignes corsées, un salon par défaut celles d'hier", () => {
    let corsees = 0;
    let n = 0;
    for (let g = 1; g < 40; g++) {
      const m = new MatchLogic(g, ["a", "b"], { ...DEFAULT_SETTINGS, difficulte: 2 }, new Set(), false, false, 4);
      const d = new MatchLogic(g, ["a", "b"], DEFAULT_SETTINGS, new Set(), false, false, 4);
      for (let k = 0; k < 15; k++) {
        const o = m.openRound();
        d.openRound();
        if (o.idx >= 10) {
          n++;
          if (estCorsee(draftShared(g, o.idx, POOL, o.tirage).instructionId)) corsees++;
        }
        // Le salon par défaut ne retire un tirage que pour un piège : jamais pour une classe.
        if (d.tirage !== 0) {
          const avant = draftShared(g, o.idx, POOL, 0);
          expect(["a", "b"].some((id) => d.rulesAt(o.idx).get(id)!.forbids(avant.want, avant.ents))).toBe(true);
        }
      }
    }
    expect(corsees / n).toBeGreaterThan(0.9);
  });
});
