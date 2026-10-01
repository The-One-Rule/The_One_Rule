import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/engine/rng";
import { MAX_ENTITIES, place } from "../src/engine/scene";
import { INSTRUCTIONS, pickInstruction } from "../src/engine/instructions";
import { ONE_RULES, uniqueBiggest } from "../src/engine/rules";
import { INSTRUCTIONS_SOLO } from "../src/engine/instructions";
import { buildRound, compile } from "../src/engine/round";
import { resolveAction, resolveTimeout } from "../src/engine/resolve";
import { FIELD_H, FIELD_W } from "../src/engine/types";
import type { Entity, Want } from "../src/engine/types";

/* ------------------------------------------------------------------ *
 * 1. La scène
 * ------------------------------------------------------------------ */
describe("scene", () => {
  it("ne fait jamais se chevaucher deux formes", () => {
    let worst = Infinity;
    for (let s = 0; s < 5000; s++) {
      const rng = mulberry32(s * 2654435761);
      const n = 1 + Math.floor(rng() * MAX_ENTITIES);
      const specs = Array.from({ length: n }, () => ({
        shape: "rond" as const,
        color: "garance" as const,
        size: (["S", "M", "L"] as const)[Math.floor(rng() * 3)]!,
        moving: false,
      }));
      const ents = place(rng, specs);
      for (let i = 0; i < ents.length; i++)
        for (let j = i + 1; j < ents.length; j++) {
          const a = ents[i]!;
          const b = ents[j]!;
          worst = Math.min(worst, Math.hypot(a.x - b.x, a.y - b.y) - (a.r + b.r));
        }
    }
    expect(worst).toBeGreaterThan(0);
  });

  it("garde toutes les formes dans le champ", () => {
    for (let s = 0; s < 2000; s++) {
      const rng = mulberry32(s * 40503);
      const specs = Array.from({ length: 1 + Math.floor(rng() * 8) }, () => ({
        shape: "carre" as const,
        color: "azur" as const,
        size: "L" as const,
        moving: false,
      }));
      for (const e of place(rng, specs)) {
        expect(e.x - e.r).toBeGreaterThanOrEqual(0);
        expect(e.x + e.r).toBeLessThanOrEqual(FIELD_W);
        expect(e.y - e.r).toBeGreaterThanOrEqual(0);
        expect(e.y + e.r).toBeLessThanOrEqual(FIELD_H);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2. L'unicité des cibles — le filet de sécurité du projet
 *
 * Une consigne ambiguë ne se voit pas en jouant dix minutes, mais elle
 * convainc le joueur que le jeu triche. C'est le seul risque fatal.
 * ------------------------------------------------------------------ */

/** Prédicat par consigne : quelles entités satisfont l'énoncé ? */
const SATISFIERS: Record<string, (ents: Entity[], target: Entity) => Entity[]> = {
  clickColor: (e, t) => e.filter((x) => x.color === t.color),
  clickShape: (e, t) => e.filter((x) => x.shape === t.shape),
  compound: (e, t) => e.filter((x) => x.shape === t.shape && x.color === t.color),
  notColor: (e, t) => e.filter((x) => x.color === t.color),
  notShape: (e, t) => e.filter((x) => x.shape === t.shape),
  odd: (e, t) => e.filter((x) => x.shape === t.shape && x.color === t.color),
  moving: (e, t) => e.filter((x) => x.moving === t.moving),
  extreme: (e, t) => e.filter((x) => x.r === t.r),
  smallestOfColor: (e, t) => e.filter((x) => x.color === t.color && x.r === t.r),
  extremeSide: (e, t) => e.filter((x) => x.x === t.x),
  typeFirstLetter: (e) => e,
};

describe("consignes", () => {
  it("désignent toujours une cible unique et non ambiguë", () => {
    const failures: string[] = [];
    for (const instr of INSTRUCTIONS) {
      const check = SATISFIERS[instr.id];
      if (!check) continue;
      for (let s = 0; s < 3000; s++) {
        const rng = mulberry32(s * 22695477 + instr.id.length);
        const draft = instr.gen(rng, 20);
        const ents = place(rng, draft.specs);
        const want: Want = draft.wantFrom ? draft.wantFrom(ents) : draft.want;
        if (want.kind !== "click") continue;
        const target = ents[want.idx];
        expect(target, `${instr.id}: cible hors scène`).toBeTruthy();
        const sat = check(ents, target!);
        if (sat.length !== 1) failures.push(`${instr.id} seed=${s} → ${sat.length} satisfont`);
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });

  it("produisent toujours un texte et une attente valide", () => {
    for (const instr of INSTRUCTIONS) {
      for (let s = 0; s < 500; s++) {
        const rng = mulberry32(s * 7919 + 11);
        const draft = instr.gen(rng, 25);
        expect(draft.text.length, instr.id).toBeGreaterThan(0);
        const ents = place(rng, draft.specs);
        const want = draft.wantFrom ? draft.wantFrom(ents) : draft.want;
        if (want.kind === "click") expect(ents[want.idx], instr.id).toBeTruthy();
        if (want.kind === "sequence") {
          expect(new Set(want.idxs).size, instr.id).toBe(want.idxs.length);
          for (const i of want.idxs) expect(ents[i], instr.id).toBeTruthy();
        }
        expect(compile(want).length, instr.id).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("respecte les paliers de déblocage", () => {
    const rng = mulberry32(4242);
    for (let level = 0; level < 40; level++)
      for (let k = 0; k < 200; k++) expect(pickInstruction(rng, level).minLevel).toBeLessThanOrEqual(level);
  });
});

/* ------------------------------------------------------------------ *
 * 3. Les règles uniques et l'équilibrage des pièges
 * ------------------------------------------------------------------ */
describe("règles uniques", () => {
  it("gardent un taux de pièges tenable", () => {
    const stats: Record<string, { rounds: number; traps: number }> = {};
    for (const rule of ONE_RULES) {
      stats[rule.id] = { rounds: 0, traps: 0 };
      for (let run = 0; run < 120; run++) {
        const rng = mulberry32(run * 7919 + 13);
        let avant = false;
        for (let level = 0; level < 45; level++) {
          // Le catalogue réellement joué en solo (double appui, MAINTENIR,
          // GLISSER compris) : mesurer l'ancien donnerait un chiffre faux.
          // Et ENCHAÎNÉ comme le joue `Session` : jamais deux pièges
          // d'affilée (catalogue 3). Sans la chaîne, LA POINTE mesurait
          // 28,2 % — un tirage que plus aucun joueur ne reçoit.
          const round = buildRound(rng, level, rule, INSTRUCTIONS_SOLO, 1, undefined, avant);
          avant = round.trap;
          stats[rule.id]!.rounds++;
          if (round.trap) stats[rule.id]!.traps++;
        }
      }
    }
    const lines = ONE_RULES.map((r) => {
      const s = stats[r.id]!;
      return `${r.name.padEnd(16)} ${((s.traps / s.rounds) * 100).toFixed(1)}%`;
    });
    console.log("\nTaux de pièges par règle unique :\n" + lines.join("\n"));

    // Après fillCount (densité 5→11) : les bornes [0.04, 0.28] tiennent encore.
    // Une règle au-delà de ~30 % ne serait plus un piège, ce serait une consigne.
    for (const rule of ONE_RULES) {
      const s = stats[rule.id]!;
      const rate = s.traps / s.rounds;
      if (rule.traps) {
        expect(rate, `${rule.name} trop rare`).toBeGreaterThan(0.04);
        expect(rate, `${rule.name} trop fréquent`).toBeLessThan(0.28);
      } else {
        expect(rate, `${rule.name} ne devrait pas piéger`).toBe(0);
      }
    }
  });

  it("ne laissent jamais un piège avec des étapes à résoudre", () => {
    for (const rule of ONE_RULES) {
      const rng = mulberry32(rule.id.length * 99991 + 7);
      for (let level = 0; level < 45; level++) {
        const round = buildRound(rng, level, rule, INSTRUCTIONS_SOLO);
        if (round.trap) expect(round.steps.length, rule.name).toBe(0);
        expect(round.durationMs).toBeGreaterThan(400);
      }
    }
  });

  it("LE COLOSSE n'interdit que la plus grosse strictement unique", () => {
    const rng = mulberry32(1234);
    const ents = place(rng, [
      { shape: "rond", color: "azur", size: "M", moving: false },
      { shape: "rond", color: "azur", size: "M", moving: false },
    ]);
    expect(uniqueBiggest(ents)).toBeNull();
  });

  it("LE JUMEAU double bien les étapes", () => {
    const jumeau = ONE_RULES.find((r) => r.id === "jumeau")!;
    const sang = ONE_RULES.find((r) => r.id === "sang")!;
    let doubled = 0;
    for (let s = 0; s < 200; s++) {
      const a = buildRound(mulberry32(s), 12, sang);
      const b = buildRound(mulberry32(s), 12, jumeau);
      if (a.steps.length > 0 && !a.trap) {
        expect(b.steps.length).toBe(a.steps.length * 2);
        doubled++;
      }
    }
    expect(doubled).toBeGreaterThan(50);
  });
});

/* ------------------------------------------------------------------ *
 * 4. La résolution
 * ------------------------------------------------------------------ */
describe("résolution", () => {
  const sang = ONE_RULES.find((r) => r.id === "sang")!;

  it("fait primer la règle unique sur la consigne", () => {
    const rng = mulberry32(7);
    const round = buildRound(rng, 0, sang);
    const red = round.ents.find((e) => e.color === "garance");
    if (!red) return;
    const { outcome } = resolveAction(
      round,
      { step: 0 },
      { kind: "click", ent: red, x: red.x, y: red.y },
      500,
      sang.judge,
    );
    expect(outcome.kind).toBe("death");
    if (outcome.kind === "death") expect(outcome.cause).toBe("macro");
  });

  it("fait survivre le silence sur un piège, et tuer l'action", () => {
    for (let s = 0; s < 3000; s++) {
      const round = buildRound(mulberry32(s), 10, sang);
      if (!round.trap) continue;
      expect(resolveTimeout(round, { step: 0 }).kind).toBe("survive");
      const nonRed = round.ents.find((e) => e.color !== "garance");
      const act = { kind: "click" as const, ent: nonRed ?? null, x: 900, y: 10 };
      const { outcome } = resolveAction(round, { step: 0 }, act, 500, sang.judge);
      expect(outcome.kind).toBe("death");
      return;
    }
    throw new Error("aucun piège rencontré — l'équilibrage est cassé");
  });

  it("exige la séquence complète avant de valider", () => {
    const jumeau = ONE_RULES.find((r) => r.id === "jumeau")!;
    for (let s = 0; s < 500; s++) {
      const round = buildRound(mulberry32(s), 16, jumeau);
      const first = round.steps[0];
      if (!first || first.kind !== "click") continue;
      const ent = round.ents[first.idx]!;
      const act = { kind: "click" as const, ent, x: ent.x, y: ent.y };
      const r1 = resolveAction(round, { step: 0 }, act, 300, jumeau.judge);
      expect(r1.outcome.kind).toBe("pending");
      const r2 = resolveAction(round, r1.progress, act, 400, jumeau.judge);
      expect(r2.outcome.kind).toBe(round.steps.length === 2 ? "survive" : "pending");
      return;
    }
  });

  it("ne tue jamais sur un relâchement de touche hors LA MAIN GAUCHE", () => {
    const round = buildRound(mulberry32(3), 5, sang);
    const { outcome } = resolveAction(
      round,
      { step: 0 },
      { kind: "release", key: " " },
      100,
      sang.judge,
    );
    expect(outcome.kind).toBe("pending");
  });
});
