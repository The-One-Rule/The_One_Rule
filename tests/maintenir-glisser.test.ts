/**
 * MAINTENIR et GLISSER — les deux premières consignes qui ne sont pas un clic.
 *
 * Ce que ce fichier défend :
 *   · la cible est UNIQUE (le seul risque tenu pour fatal) ;
 *   · le maintien se juge sur une DURÉE, le glisser sur l'endroit du lever ;
 *   · un lever n'est une réponse que là où il en attend une — partout
 *     ailleurs il est ignoré, sinon chaque clic du jeu deviendrait mortel ;
 *   · une règle piège MAINTENIR et GLISSER comme elle piège un clic ;
 *   · le poids en gestes des étapes d'avant n'a pas bougé (aucune fenêtre
 *     existante ne change) ;
 *   · à la version 2, le multi tire EXACTEMENT ce qu'il tirait hier.
 */
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/engine/rng";
import { place } from "../src/engine/scene";
import { compile } from "../src/engine/round";
import { resolveAction, resolveTimeout } from "../src/engine/resolve";
import { HOLD_MS, poidsGestes, STEP_MS } from "../src/engine/difficulty";
import { CONSIGNES_MULTI, CONSIGNES_VERSION, TOUCH_INSTRUCTIONS } from "../src/engine/instructions";
import { applyRule, draftShared, poolMulti } from "../src/engine/multiround";
import { ONE_RULES } from "../src/engine/rules";
import { MOTIFS } from "../src/engine/motifs";
import { composePhrase } from "../src/i18n";
import type { Action, Entity, Round, Want } from "../src/engine/types";

const consigne = (id: string) => CONSIGNES_MULTI.find((i) => i.id === id)!;
const regle = (id: string) => ONE_RULES.find((r) => r.id === id)!;

function tirage(id: string, s: number) {
  const rng = mulberry32(s * 2654435761 + 17);
  const draft = consigne(id).gen(rng, 20);
  const ents = place(rng, draft.specs);
  const want = (draft.wantFrom ? draft.wantFrom(ents) : draft.want) as Want;
  return { draft, ents, want };
}

function manche(id: string, s: number): Round {
  const { draft, ents, want } = tirage(id, s);
  return {
    instructionId: id,
    text: draft.text,
    ents,
    steps: compile(want),
    trap: false,
    durationMs: 4000,
  } as Round;
}

const juge = () => null;
const clic = (e: Entity | null): Action => ({ kind: "click", ent: e, x: e?.x ?? 0, y: e?.y ?? 0 });
const leve = (e: Entity | null): Action => ({ kind: "lift", ent: e, x: e?.x ?? 0, y: e?.y ?? 0 });

describe("MAINTENIR — la consigne", () => {
  it("désigne une pièce unique par sa couleur ou sa forme", () => {
    for (let s = 0; s < 2000; s++) {
      const { draft, ents, want } = tirage("tiens", s);
      expect(want.kind).toBe("hold");
      if (want.kind !== "hold") return;
      const cible = ents[want.idx]!;
      const pareilles = ents.filter((e) =>
        draft.phrase?.couleur ? e.color === cible.color : e.shape === cible.shape,
      );
      expect(pareilles, `graine ${s}`).toHaveLength(1);
    }
  });

  it("le français composé redonne EXACTEMENT `text`", () => {
    for (let s = 0; s < 300; s++) {
      const { draft } = tirage("tiens", s);
      expect(composePhrase(draft.phrase!, "", "fr")).toBe(draft.text);
      expect(composePhrase(draft.phrase!, "", "en")).toMatch(/^HOLD THE /);
    }
  });
});

describe("MAINTENIR — le jugement", () => {
  const m = manche("tiens", 3);
  const cible = m.ents[(m.steps[0] as { idx: number }).idx]!;
  const autre = m.ents.find((e) => e !== cible)!;

  it("l'appui seul ne suffit pas : il attend le lever", () => {
    const a = resolveAction(m, { step: 0 }, clic(cible), 500, juge);
    expect(a.outcome.kind).toBe("pending");
    expect(a.progress.holdAt).toBe(500);
  });

  it("lâcher avant HOLD_MS tue, et le dit", () => {
    const a = resolveAction(m, { step: 0 }, clic(cible), 500, juge);
    const b = resolveAction(m, a.progress, leve(cible), 500 + HOLD_MS - 1, juge);
    expect(b.outcome).toEqual({ kind: "death", cause: "wrong", reason: MOTIFS.lacheTot });
  });

  it("lâcher après HOLD_MS fait survivre — où que soit le doigt", () => {
    const a = resolveAction(m, { step: 0 }, clic(cible), 500, juge);
    const b = resolveAction(m, a.progress, leve(null), 500 + HOLD_MS, juge);
    expect(b.outcome).toEqual({ kind: "survive", trap: false });
  });

  it("appuyer AILLEURS tue, avant comme pendant le maintien", () => {
    expect(resolveAction(m, { step: 0 }, clic(autre), 500, juge).outcome.kind).toBe("death");
    const a = resolveAction(m, { step: 0 }, clic(cible), 500, juge);
    expect(resolveAction(m, a.progress, clic(autre), 700, juge).outcome.kind).toBe("death");
  });

  it("un lever SANS appui n'est rien", () => {
    expect(resolveAction(m, { step: 0 }, leve(cible), 900, juge).outcome.kind).toBe("pending");
  });

  it("la fenêtre qui se ferme pendant le maintien ne passe pas pour une survie", () => {
    expect(resolveTimeout(m, { step: 0, holdAt: 3800 }).kind).toBe("death");
  });
});

describe("GLISSER — la consigne", () => {
  it("les deux couleurs nommées n'existent qu'une fois chacune", () => {
    for (let s = 0; s < 2000; s++) {
      const { draft, ents, want } = tirage("glisse", s);
      expect(want.kind).toBe("drag");
      if (want.kind !== "drag") return;
      expect(want.from).not.toBe(want.to);
      const a = draft.phrase!.couleur!;
      const b = draft.phrase!.couleur2!;
      expect(ents[want.from]!.color).toBe(a);
      expect(ents[want.to]!.color).toBe(b);
      expect(ents.filter((e) => e.color === a), `graine ${s}`).toHaveLength(1);
      expect(ents.filter((e) => e.color === b), `graine ${s}`).toHaveLength(1);
    }
  });

  it("le français composé redonne EXACTEMENT `text`", () => {
    for (let s = 0; s < 300; s++) {
      const { draft } = tirage("glisse", s);
      expect(composePhrase(draft.phrase!, "", "fr")).toBe(draft.text);
      expect(composePhrase(draft.phrase!, "", "en")).toMatch(/^DRAG THE .* ONTO THE /);
    }
  });
});

describe("GLISSER — le jugement", () => {
  const m = manche("glisse", 5);
  const de = m.ents[(m.steps[0] as { idx: number }).idx]!;
  const vers = m.ents[(m.steps[1] as { idx: number }).idx]!;
  const autre = m.ents.find((e) => e !== de && e !== vers) ?? null;

  it("prendre puis lever sur la bonne pièce fait survivre", () => {
    const a = resolveAction(m, { step: 0 }, clic(de), 500, juge);
    expect(a.outcome.kind).toBe("pending");
    expect(resolveAction(m, a.progress, leve(vers), 800, juge).outcome).toEqual({
      kind: "survive",
      trap: false,
    });
  });

  it("lever sur place — un simple clic — tue, et dit pourquoi", () => {
    const a = resolveAction(m, { step: 0 }, clic(de), 500, juge);
    expect(resolveAction(m, a.progress, leve(de), 560, juge).outcome).toEqual({
      kind: "death",
      cause: "wrong",
      reason: MOTIFS.lacheAilleurs,
    });
  });

  it("lever ailleurs tue", () => {
    const a = resolveAction(m, { step: 0 }, clic(de), 500, juge);
    expect(resolveAction(m, a.progress, leve(autre), 800, juge).outcome.kind).toBe("death");
  });
});

describe("le lever ailleurs n'est RIEN", () => {
  it("sur une consigne de clic, un lever entre deux appuis est ignoré", () => {
    const m = manche("tiens", 7);
    const clicSimple: Round = { ...m, steps: [{ kind: "click", idx: 0 }, { kind: "click", idx: 1 }] };
    const a = resolveAction(clicSimple, { step: 0 }, clic(m.ents[0]!), 400, juge);
    const b = resolveAction(clicSimple, a.progress, leve(m.ents[0]!), 450, juge);
    expect(b.outcome.kind).toBe("pending");
    expect(b.progress).toEqual(a.progress);
  });
});

describe("les règles les lisent comme un clic", () => {
  it("LE SANG piège « MAINTIENS LE ROUGE »", () => {
    let vus = 0;
    for (let s = 0; s < 400; s++) {
      const { draft, ents, want } = tirage("tiens", s);
      if (draft.phrase?.couleur !== "garance") continue;
      expect(regle("sang").forbids(want, ents)).toBe(true);
      vus++;
    }
    expect(vus).toBeGreaterThan(10);
  });

  it("LE SANG piège un glisser qui PREND ou POSE du rouge, et aucun autre", () => {
    for (let s = 0; s < 400; s++) {
      const { draft, ents, want } = tirage("glisse", s);
      const rouge = draft.phrase!.couleur === "garance" || draft.phrase!.couleur2 === "garance";
      expect(regle("sang").forbids(want, ents), `graine ${s}`).toBe(rouge);
    }
  });
});

describe("le temps", () => {
  it("les étapes d'avant pèsent exactement leur nombre — aucune fenêtre ne bouge", () => {
    const anciennes = [
      { kind: "click" },
      { kind: "clickAny" },
      { kind: "clickAnyExcept" },
      { kind: "key" },
    ] as const;
    for (let n = 0; n < 6; n++) {
      const steps = Array.from({ length: n }, (_, i) => anciennes[i % anciennes.length]!);
      expect(poidsGestes(steps)).toBe(n);
    }
  });

  it("un maintien paie sa durée, un glisser sa traversée", () => {
    expect(poidsGestes(compile({ kind: "hold", idx: 0 })) * STEP_MS).toBeGreaterThanOrEqual(HOLD_MS + STEP_MS);
    expect(poidsGestes(compile({ kind: "drag", from: 0, to: 1 }))).toBe(3);
  });
});

describe("⚠️ la négociation du multijoueur", () => {
  it("à la version 2, le pool est celui d'avant MAINTENIR et GLISSER", () => {
    const v2 = poolMulti(false, 2).map((i) => i.id);
    expect(v2).toEqual([...TOUCH_INSTRUCTIONS.map((i) => i.id), "doubleTap"]);
  });

  it("à la version 3, elles sortent, et se jouent sous chaque règle du salon", () => {
    expect(CONSIGNES_VERSION).toBeGreaterThanOrEqual(3);
    const sorties = new Map<string, number>();
    for (let seed = 1; seed < 80; seed++) {
      for (let idx = 6; idx < 30; idx++) {
        const sh = draftShared(seed, idx, poolMulti(false, 3));
        if (sh.instructionId !== "tiens" && sh.instructionId !== "glisse") continue;
        sorties.set(sh.instructionId, (sorties.get(sh.instructionId) ?? 0) + 1);
        for (const r of ONE_RULES) {
          const round = applyRule(sh, r, seed);
          expect(round.trap || round.steps.length >= 1, r.id).toBe(true);
        }
      }
    }
    expect(sorties.get("tiens") ?? 0).toBeGreaterThan(10);
    expect(sorties.get("glisse") ?? 0).toBeGreaterThan(10);
  });
});
