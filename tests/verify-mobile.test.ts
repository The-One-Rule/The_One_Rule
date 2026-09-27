/**
 * LE REJEU D'UN RUN FAIT AU TÉLÉPHONE.
 *
 * Le client tire au doigt dans `TOUCH_INSTRUCTIONS` et remplace une règle à
 * maintien ; le serveur rejouait dans le catalogue complet, sous la règle
 * brute. Mesuré avant correctif : les manches divergeaient dès la manche 3 sur
 * 200 graines sur 200 — tout run du jour mobile était rejoué sur d'autres
 * manches que celles jouées.
 */
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/engine/rng";
import { buildRound } from "../src/engine/round";
import { TOUCH_INSTRUCTIONS } from "../src/engine/instructions";
import { ONE_RULES, withoutHold, withoutLetters } from "../src/engine/rules";
import { verifyRun } from "../src/engine/verify";
import type { LoggedInput } from "../src/engine/verify";
import type { OneRule } from "../src/engine/types";
import { DAILY_LENGTH } from "../src/engine/difficulty";

/** Un joueur de téléphone qui joue juste : pool tactile, règle jouable au doigt. */
function joueAuDoigt(seed: number, rule: OneRule): LoggedInput[] {
  const rng = mulberry32(seed);
  const inputs: LoggedInput[] = [];
  let t = 0;
  for (let level = 0; level < DAILY_LENGTH; level++) {
    const round = buildRound(rng, level, rule, TOUCH_INSTRUCTIONS);
    const at = t + Math.min(Math.max(300, rule.id === "seconde" ? 430 : 0), round.durationMs - 40);
    if (round.steps.length === 0) {
      t += round.durationMs;
      continue;
    }
    const permis = (i: number, quand: number): boolean =>
      rule.judge(
        { kind: "click", ent: round.ents[i]!, x: round.ents[i]!.x, y: round.ents[i]!.y },
        { round, elapsedMs: quand - t },
      ) === null;
    let k = 0;
    for (const step of round.steps) {
      const quand = at + k * 40;
      if (step.kind === "click") inputs.push({ t: quand, k: "c", i: step.idx });
      else if (step.kind === "clickAny" || step.kind === "clickAnyExcept") {
        const ok = round.ents.findIndex(
          (e, i) => permis(i, quand) && (step.kind === "clickAny" || e.color !== step.color),
        );
        inputs.push({ t: quand, k: "c", i: ok >= 0 ? ok : null });
      } else throw new Error(`étape non tactile au doigt : ${step.kind}`);
      k++;
    }
    t = at + (round.steps.length - 1) * 40 + 1;
  }
  return inputs;
}

const TEL = { clavier: false, maintien: false, encre: true };

describe("un run joué au doigt se rejoue au doigt", () => {
  it("le score rejoué est celui du run, règle par règle", () => {
    for (const r of ONE_RULES) {
      const seed = 1000 + r.id.length * 7;
      const jouee = withoutHold(r);
      const v = verifyRun({ seed, ruleId: r.id, mode: "daily", inputs: joueAuDoigt(seed, jouee), capacites: TEL });
      expect(v.ok, `${r.id} : ${v.reason}`).toBe(true);
      expect(v.score, r.id).toBe(DAILY_LENGTH);
    }
  });

  it("⚠️ sans les capacités, le même journal est rejoué sur d'autres manches", () => {
    // Les dents du test : c'était le comportement d'avant, pour tous les
    // téléphones. Si ce test tombe, le rejeu par défaut a changé — et les
    // files écrites avant le correctif ne se rejouent plus comme avant.
    let faux = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = ONE_RULES.find((x) => x.id === "sang")!;
      const v = verifyRun({ seed, ruleId: r.id, mode: "daily", inputs: joueAuDoigt(seed, r) });
      if (!v.ok || v.score !== DAILY_LENGTH) faux++;
    }
    expect(faux).toBeGreaterThan(15);
  });
});

describe("LA VOYELLE au doigt", () => {
  const voyelle = ONE_RULES.find((x) => x.id === "voyelle")!;
  const TEL_LETTRES = { ...TEL, lettres: false };

  it("est remplacée par une règle qui peut piéger au doigt", () => {
    const r = withoutLetters(voyelle);
    expect(r.id).not.toBe("voyelle");
    expect(r.watchRelease).toBeUndefined();
    // Les autres règles ne bougent pas.
    for (const x of ONE_RULES) if (x.id !== "voyelle") expect(withoutLetters(x)).toBe(x);
  });

  it("un run du jour joué sous le remplaçant se rejoue sous le remplaçant", () => {
    const jouee = withoutLetters(voyelle);
    for (const seed of [11, 42, 777]) {
      const v = verifyRun({ seed, ruleId: "voyelle", mode: "daily", inputs: joueAuDoigt(seed, jouee), capacites: TEL_LETTRES });
      expect(v.ok, v.reason).toBe(true);
      expect(v.score).toBe(DAILY_LENGTH);
    }
  });

  it("⚠️ sans `lettres`, un téléphone d'avant reste rejoué sous LA VOYELLE", () => {
    // Les dents : les files écrites avant ce correctif portent la voyelle
    // brute ; ABSENT doit la garder.
    const seed = 42;
    const v = verifyRun({ seed, ruleId: "voyelle", mode: "daily", inputs: joueAuDoigt(seed, voyelle), capacites: TEL });
    expect(v.ok, v.reason).toBe(true);
    expect(v.score).toBe(DAILY_LENGTH);
  });
});
