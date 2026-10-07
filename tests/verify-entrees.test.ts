/**
 * LE JOURNAL VIENT DU RÉSEAU — audit S2.
 *
 * `verifyRun` reçoit le journal tel que le client l'envoie, en JSON brut. Ces
 * cas étaient mesurés avant le correctif : une exception sur `null`, et un
 * run ACCEPTÉ avec un horodatage en texte.
 *
 * DENTS : retirer la ligne `entreeValide` de `verifyRun` fait tomber les
 * trois premiers tests.
 */
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/engine/rng";
import { ONE_RULES } from "../src/engine/rules";
import { CATALOGUE_SOLO } from "../src/engine/instructions";
import { verifyRun } from "../src/engine/verify";
import { dailySeed, ruleOfDay } from "../src/game/daily";
import { Session } from "../src/game/session";

const jour = 280;
const base = { seed: dailySeed(jour), ruleId: ruleOfDay(jour).id, mode: "daily" as const, catalogue: CATALOGUE_SOLO };
const rejoue = (inputs: unknown) => verifyRun({ ...base, inputs: inputs as never });

describe("verifyRun refuse un journal malformé", () => {
  it("une entrée null est un refus, pas une exception", () => {
    expect(() => rejoue([null])).not.toThrow();
    expect(rejoue([null]).ok).toBe(false);
  });

  it("⚠️ un horodatage en texte est refusé (il était accepté, durée « abc… »)", () => {
    const v = rejoue([{ t: "abc", k: "c", i: 0 }]);
    expect(v.ok).toBe(false);
    expect(typeof v.durationMs).toBe("number");
  });

  it("un index qui n'est pas un entier ne remonte pas un prototype", () => {
    for (const i of ["__proto__", 1.5, -1, "0"]) expect(rejoue([{ t: 500, k: "c", i }]).ok, String(i)).toBe(false);
  });

  it("une touche absente, vide ou démesurée est refusée", () => {
    for (const key of [undefined, "", "x".repeat(40), 7]) expect(rejoue([{ t: 500, k: "k", key }]).ok).toBe(false);
  });

  it("…et un run réellement joué passe toujours, au coup près", () => {
    // Le contrôle ne doit rien coûter à un vrai joueur : on rejoue des parties
    // produites par `Session`, qui journalise exactement comme le jeu.
    for (const rule of ONE_RULES.filter((r) => r.traps).slice(0, 4)) {
      for (const seed of [11, 23]) {
        const s = new Session({ mode: "daily", rule, rng: mulberry32(seed), now: 0, seed });
        let now = 0;
        for (let n = 0; n < 200 && s.phase === "playing"; n++) {
          const r = s.round;
          const st = r.steps[0];
          if (r.steps.length !== 1 || st?.kind !== "click") {
            now += r.durationMs + 1;
            s.tick(now);
            continue;
          }
          const e = r.ents[st.idx]!;
          now += 420;
          s.input({ kind: "click", ent: e, x: e.x, y: e.y }, now);
        }
        const v = verifyRun({ seed, ruleId: rule.id, mode: "daily", inputs: s.log, catalogue: CATALOGUE_SOLO });
        expect(v.ok, `${rule.id}/${seed} : ${v.reason}`).toBe(true);
        expect(v.score).toBe(s.level);
      }
    }
  });
});
