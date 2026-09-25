/**
 * LE DOUBLE APPUI — « CLIQUE DEUX FOIS LE ROUGE ».
 *
 * Ce que ce fichier défend :
 *   · la cible est UNIQUE (le seul risque tenu pour fatal) ;
 *   · un appui ne suffit pas, deux suffisent, un appui ailleurs tue ;
 *   · une règle piège le double appui comme elle piège le simple ;
 *   · à la version 1, le multijoueur tire EXACTEMENT ce qu'il tirait hier —
 *     c'est ce qui rend sûr un front et des salons déployés séparément ;
 *   · le solo n'a pas bougé : `VERSION_CONTENU` est intacte.
 */
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/engine/rng";
import { place } from "../src/engine/scene";
import { compile } from "../src/engine/round";
import { resolveAction } from "../src/engine/resolve";
import {
  CONSIGNES_MULTI,
  CONSIGNES_VERSION,
  INSTRUCTIONS,
  TOUCH_INSTRUCTIONS,
} from "../src/engine/instructions";
import { applyRule, draftShared, poolMulti } from "../src/engine/multiround";
import { ONE_RULES } from "../src/engine/rules";
import { VERSION_CONTENU } from "../src/engine/version";
import { composePhrase } from "../src/i18n";
import type { Entity, Round, Want } from "../src/engine/types";

const doubleTap = CONSIGNES_MULTI.find((i) => i.id === "doubleTap")!;
const regle = (id: string) => ONE_RULES.find((r) => r.id === id)!;

function tirage(s: number) {
  const rng = mulberry32(s * 2654435761);
  const draft = doubleTap.gen(rng, 20);
  const ents = place(rng, draft.specs);
  const want = (draft.wantFrom ? draft.wantFrom(ents) : draft.want) as Want;
  return { draft, ents, want };
}

describe("la consigne", () => {
  it("désigne DEUX FOIS la même pièce, et une seule pièce y répond", () => {
    for (let s = 0; s < 3000; s++) {
      const { draft, ents, want } = tirage(s);
      expect(want.kind).toBe("sequence");
      if (want.kind !== "sequence") return;
      expect(want.idxs).toHaveLength(2);
      expect(want.idxs[0]).toBe(want.idxs[1]);
      const cible = ents[want.idxs[0]!]!;
      const repondent = ents.filter((e) =>
        draft.phrase?.couleur ? e.color === cible.color : e.shape === cible.shape,
      );
      expect(repondent, `graine ${s}`).toHaveLength(1);
    }
  });

  it("le français composé redonne EXACTEMENT `text` (LE MENTEUR compare des textes)", () => {
    for (let s = 0; s < 300; s++) {
      const { draft } = tirage(s);
      expect(composePhrase(draft.phrase!, "", "fr")).toBe(draft.text);
      expect(composePhrase(draft.phrase!, "", "en")).toMatch(/TWICE$/);
    }
  });

  it("demande deux gestes — donc la fenêtre de deux gestes", () => {
    expect(compile(tirage(1).want)).toHaveLength(2);
  });
});

function manche(s: number): { round: Round; cible: Entity; autre: Entity } | null {
  // La manche nue : aucune règle, le juge est neutre — on éprouve la séquence.
  const { want, ents, draft } = tirage(s);
  if (want.kind !== "sequence") return null;
  const round: Round = {
    instructionId: "doubleTap",
    text: draft.text,
    ents,
    steps: compile(want),
    trap: false,
    durationMs: 3000,
  } as Round;
  const cible = ents[want.idxs[0]!]!;
  const autre = ents.find((e) => e !== cible)!;
  return { round, cible, autre };
}

describe("le jugement", () => {
  const juge = () => null;
  const clic = (e: Entity) => ({ kind: "click" as const, ent: e, x: e.x, y: e.y });

  it("un appui ne suffit pas, le second fait survivre", () => {
    const m = manche(3)!;
    const a = resolveAction(m.round, { step: 0 }, clic(m.cible), 500, juge);
    expect(a.outcome.kind).toBe("pending");
    const b = resolveAction(m.round, a.progress, clic(m.cible), 600, juge);
    expect(b.outcome).toEqual({ kind: "survive", trap: false });
  });

  it("le second appui AILLEURS tue", () => {
    const m = manche(5)!;
    const a = resolveAction(m.round, { step: 0 }, clic(m.cible), 500, juge);
    const b = resolveAction(m.round, a.progress, clic(m.autre), 600, juge);
    expect(b.outcome.kind).toBe("death");
  });
});

describe("les règles la lisent comme les autres", () => {
  it("LE SANG piège « DEUX FOIS LE ROUGE », jamais une autre couleur", () => {
    let vus = 0;
    for (let s = 0; s < 400; s++) {
      const { draft, ents, want } = tirage(s);
      if (!draft.phrase?.couleur) continue;
      const rouge = draft.phrase.couleur === "garance";
      expect(regle("sang").forbids(want, ents), `graine ${s}`).toBe(rouge);
      if (rouge) vus++;
    }
    expect(vus).toBeGreaterThan(10);
  });
});

describe("⚠️ la négociation du multijoueur", () => {
  it("à la version 1, le pool est EXACTEMENT celui d'hier", () => {
    expect(poolMulti(false, 1)).toBe(TOUCH_INSTRUCTIONS);
    expect(poolMulti(true, 1)).toBe(INSTRUCTIONS);
    // …et l'appel à un seul argument, celui des clients anciens, aussi
    expect(poolMulti(false)).toBe(TOUCH_INSTRUCTIONS);
  });

  it("à la version 1, les manches tirées sont identiques, graine par graine", () => {
    for (let seed = 1; seed < 40; seed++) {
      for (let idx = 0; idx < 30; idx++) {
        const hier = draftShared(seed, idx, TOUCH_INSTRUCTIONS);
        const auj = draftShared(seed, idx, poolMulti(false, 1));
        expect(auj.instructionId).toBe(hier.instructionId);
        expect(auj.want).toEqual(hier.want);
      }
    }
  });

  it("à la version 2, le double appui sort, et se joue sous chaque règle du salon", () => {
    let sorties = 0;
    for (let seed = 1; seed < 60; seed++) {
      for (let idx = 4; idx < 30; idx++) {
        const sh = draftShared(seed, idx, poolMulti(false, CONSIGNES_VERSION));
        if (sh.instructionId !== "doubleTap") continue;
        sorties++;
        for (const r of ONE_RULES) {
          const round = applyRule(sh, r, seed);
          // piège = aucune étape ; sinon au moins les deux gestes demandés
          expect(round.trap || round.steps.length >= 2, `${r.id}`).toBe(true);
        }
      }
    }
    expect(sorties).toBeGreaterThan(20);
  });

  it("un pool tactile n'hérite jamais d'une consigne clavier", () => {
    expect(poolMulti(false, CONSIGNES_VERSION).every((i) => i.touch)).toBe(true);
  });
});

describe("le solo n'a pas bougé", () => {
  it("le double appui n'est PAS au catalogue solo", () => {
    expect(INSTRUCTIONS.some((i) => i.id === "doubleTap")).toBe(false);
  });

  it("VERSION_CONTENU est celle d'avant l'ajout", () => {
    // Relevée avant et après : si elle bouge, les records d'entraînement
    // affichés repartent de zéro pour tout le monde au déploiement.
    expect(VERSION_CONTENU).toBe("5m4fgw");
  });
});
