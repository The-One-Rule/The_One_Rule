import { describe, expect, it } from "vitest";
import { applyRule, buildMultiRound, draftShared } from "../src/engine/multiround";
import { MULTI_RULES, MatchLogic } from "../server/match";
import { ONE_RULES } from "../src/engine/rules";
import { ServerClock } from "../src/net/client";
import {
  INTERLUDE_DUEL_MS,
  INTERLUDE_ELIM_MS,
  INTERLUDE_LIFE_MS,
  MAX_ROUND_MS,
  MIN_ROUND_MS,
  ROTATION_EVERY,
  START_LIVES,
  STATS_MIN_SAMPLES,
} from "../shared/protocol";

/** Joue parfaitement la manche ouverte (silence sur piège). */
function playPerfect(m: MatchLogic, id: string, atMs = 300): void {
  const rule = m.rulesAt(m.roundIdx).get(id)!;
  const round = buildMultiRound(m.seed, m.roundIdx, rule);
  if (round.steps.length === 0) return;
  const step = round.steps[0]!;
  if (step.kind === "click") m.input(id, m.roundIdx, { kind: "click", ent: round.ents[step.idx]!, x: 0, y: 0 }, atMs);
  else if (step.kind === "key") m.input(id, m.roundIdx, { kind: "key", key: step.key }, atMs);
  else m.input(id, m.roundIdx, { kind: "click", ent: round.ents[0] ?? null, x: 900, y: 10 }, atMs);
}

/** Force une mort sur la manche ouverte (mauvais clic). */
function playDie(m: MatchLogic, id: string) {
  return m.input(id, m.roundIdx, { kind: "click", ent: null, x: 0, y: 0 }, 200);
}

describe("manches multijoueur", () => {
  it("donne la même scène à tous, quel que soit l'ordre de calcul", () => {
    for (let idx = 0; idx < 40; idx++) {
      const a = draftShared(424242, idx);
      const b = draftShared(424242, idx);
      expect(b.text).toBe(a.text);
      expect(b.ents.map((e) => `${e.shape}${e.color}${e.ox.toFixed(1)}`)).toEqual(
        a.ents.map((e) => `${e.shape}${e.color}${e.ox.toFixed(1)}`),
      );
    }
  });

  it("construit la manche 30 sans rejouer les 29 précédentes", () => {
    // accès direct par index : la propriété qui rend les reconnexions triviales
    const direct = draftShared(7, 30);
    for (let i = 0; i < 30; i++) draftShared(7, i);
    const after = draftShared(7, 30);
    expect(after.text).toBe(direct.text);
  });

  it("rend le piège PERSONNEL : même scène, verdicts différents", () => {
    const sang = ONE_RULES.find((r) => r.id === "sang")!;
    const pointe = ONE_RULES.find((r) => r.id === "pointe")!;
    let found = 0;
    for (let idx = 0; idx < 300 && found < 5; idx++) {
      const shared = draftShared(99, idx);
      const a = applyRule(shared, sang, 99);
      const b = applyRule(shared, pointe, 99);
      if (a.trap !== b.trap) found++;
      // les déformations d'un joueur ne fuient jamais chez l'autre
      expect(b.ents).not.toBe(a.ents);
    }
    expect(found).toBeGreaterThanOrEqual(5);
  });

  it("déforme de façon déterministe PAR joueur (LE MENTEUR)", () => {
    const menteur = ONE_RULES.find((r) => r.id === "menteur")!;
    for (let idx = 0; idx < 60; idx++) {
      const x = buildMultiRound(31, idx, menteur);
      const y = buildMultiRound(31, idx, menteur);
      expect(y.falseText).toBe(x.falseText); // client et serveur voient le même mensonge
    }
  });
});

describe("logique de match", () => {
  const ids = ["a", "b", "c", "d"];

  it("distribue des règles différentes et les fait tourner d'un cran", () => {
    const m = new MatchLogic(5, ids);
    const r0 = m.rulesAt(0);
    expect(new Set([...r0.values()].map((r) => r.id)).size).toBe(ids.length);

    const r8 = m.rulesAt(ROTATION_EVERY);
    // rotation : la règle de b à la manche 8 est celle de a à la manche 0
    expect(r8.get("a")!.id).toBe(m.rulesAt(0).get("b")!.id);
    expect(m.rotationJustHappened(ROTATION_EVERY)).toBe(true);
    expect(m.rotationJustHappened(3)).toBe(false);
  });

  it("exclut la contrainte de maintien du pool multijoueur", () => {
    expect(MULTI_RULES.some((r) => r.watchRelease)).toBe(false);
  });

  it("fait vivre un match complet : vies, éliminations, vainqueur", () => {
    const m = new MatchLogic(1234, ["a", "b"]);
    let winner: string | null = null;
    for (let guard = 0; guard < 200 && !winner; guard++) {
      m.openRound();
      const rules = m.rulesAt(m.roundIdx);
      for (const s of m.alive) {
        const round = buildMultiRound(1234, m.roundIdx, rules.get(s.id)!);
        // « a » joue parfaitement, « b » clique toujours — donc meurt sur les pièges
        if (s.id === "a") {
          if (round.steps.length === 0) continue;
          const step = round.steps[0]!;
          if (step.kind === "click") m.input(s.id, m.roundIdx, { kind: "click", ent: round.ents[step.idx]!, x: 0, y: 0 }, 300);
          else if (step.kind === "key") m.input(s.id, m.roundIdx, { kind: "key", key: step.key }, 300);
          else m.input(s.id, m.roundIdx, { kind: "click", ent: round.ents[0] ?? null, x: 900, y: 10 }, 300);
        } else {
          m.input(s.id, m.roundIdx, { kind: "click", ent: round.ents[0] ?? null, x: 0, y: 0 }, 300);
        }
      }
      const res = m.closeRound();
      if (res.matchOver) winner = res.winnerId;
    }
    expect(winner).toBe("a");
    expect(m.seats.find((s) => s.id === "b")!.eliminated).toBe(true);
    expect(m.seats.find((s) => s.id === "b")!.lives).toBe(0);
  });

  it("ignore un input en retard ou hors manche sans lever", () => {
    const m = new MatchLogic(9, ids);
    m.openRound();
    expect(m.input("a", 99, { kind: "key", key: "A" }, 100)).toBeNull();
    expect(m.input("a", 0, { kind: "key", key: "Z" }, -5)).toBeNull();
    expect(m.input("inconnu", 0, { kind: "key", key: "Z" }, 100)).toBeNull();
  });

  it("fige le verdict au premier input : pas de double jugement", () => {
    const m = new MatchLogic(11, ["a"]);
    m.openRound();
    const rules = m.rulesAt(0);
    const round = buildMultiRound(11, 0, rules.get("a")!);
    const bad = { kind: "click" as const, ent: null, x: 0, y: 0 };
    const first = m.input("a", 0, bad, 200);
    const second = m.input("a", 0, bad, 300);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    void round;
  });

  it("compte un timeout comme une survie sur un piège, une mort sinon", () => {
    // le joueur qui NE FAIT RIEN sur son piège doit gagner la manche :
    // c'est toute la mécanique, elle doit tenir en multijoueur
    const sangSeat = () => {
      const m = new MatchLogic(77, ["solo"]);
      for (let guard = 0; guard < 400; guard++) {
        m.openRound();
        const rules = m.rulesAt(m.roundIdx);
        const round = buildMultiRound(77, m.roundIdx, rules.get("solo")!);
        const res = m.closeRound();
        const out = res.outcomes.get("solo")!;
        if (round.trap) {
          expect(out).toEqual({ kind: "survive", trap: true });
          return true;
        }
        if (round.steps.length === 0) expect(out.kind).toBe("survive");
        else expect(out.kind).toBe("death");
        if (res.matchOver) return false;
      }
      return false;
    };
    sangSeat();
  });

  it("gère le départ en cours de match sans casser la rotation", () => {
    const m = new MatchLogic(3, ids);
    m.openRound();
    m.forfeit("b");
    expect(m.alive.map((s) => s.id)).toEqual(["a", "c", "d"]);
    // le siège reste : les règles des autres ne changent pas de mains
    expect(m.rulesAt(0).get("c")!.id).toBe(new MatchLogic(3, ids).rulesAt(0).get("c")!.id);
    const res = m.closeRound();
    expect(res.outcomes.get("b")!.kind).toBe("death");
  });

  it("part avec le bon nombre de vies", () => {
    const m = new MatchLogic(1, ids);
    for (const s of m.seats) expect(s.lives).toBe(START_LIVES);
  });

  it("pause INTERLUDE_LIFE_MS après une mort sans élimination (≥3 vivants)", () => {
    const m = new MatchLogic(50, ["a", "b", "c", "d"]);
    m.openRound();
    for (const id of ["a", "c", "d"]) playPerfect(m, id);
    playDie(m, "b");
    const res = m.closeRound();
    expect(res.outcomes.get("b")!.kind).toBe("death");
    expect(m.seats.find((s) => s.id === "b")!.eliminated).toBe(false);
    expect(m.alive.length).toBeGreaterThanOrEqual(3);
    expect(res.matchOver).toBe(false);
    expect(res.interludeMs).toBe(INTERLUDE_LIFE_MS);
  });

  it("pause INTERLUDE_ELIM_MS après une élimination (≥3 vivants restants)", () => {
    const m = new MatchLogic(51, ["a", "b", "c", "d"]);
    m.seats.find((s) => s.id === "b")!.lives = 1;
    m.openRound();
    for (const id of ["a", "c", "d"]) playPerfect(m, id);
    playDie(m, "b");
    const res = m.closeRound();
    expect(res.outcomes.get("b")!.kind).toBe("death");
    expect(m.seats.find((s) => s.id === "b")!.eliminated).toBe(true);
    expect(m.alive.length).toBeGreaterThanOrEqual(3);
    expect(res.matchOver).toBe(false);
    expect(res.interludeMs).toBe(INTERLUDE_ELIM_MS);
  });

  it("pause INTERLUDE_DUEL_MS en duel (≤2 vivants), même avec une mort", () => {
    const m = new MatchLogic(52, ["a", "b", "c"]);
    m.forfeit("c");
    expect(m.alive.map((s) => s.id).sort()).toEqual(["a", "b"]);
    let res: ReturnType<MatchLogic["closeRound"]> | null = null;
    for (let guard = 0; guard < 80 && !res; guard++) {
      m.openRound();
      playPerfect(m, "a");
      const died = playDie(m, "b");
      if (died?.kind === "death") res = m.closeRound();
      else m.closeRound();
    }
    expect(res).not.toBeNull();
    expect(res!.outcomes.get("b")!.kind).toBe("death");
    expect(m.alive.length).toBe(2);
    expect(res!.matchOver).toBe(false);
    expect(res!.interludeMs).toBe(INTERLUDE_DUEL_MS);
  });

  it("termine immédiatement au dernier survivant (sans tuer le vainqueur)", () => {
    const m = new MatchLogic(53, ["a", "b", "c"]);
    m.seats.find((s) => s.id === "b")!.lives = 1;
    m.seats.find((s) => s.id === "c")!.lives = 1;
    m.openRound();
    playPerfect(m, "a");
    playDie(m, "b");
    playDie(m, "c");
    const res = m.closeRound();
    expect(m.alive.map((s) => s.id)).toEqual(["a"]);
    expect(res.matchOver).toBe(true);
    expect(res.winnerId).toBe("a");
    expect(res.interludeMs).toBe(0);
  });
});

describe("statistiques de siège", () => {
  /** Ouvre des manches jusqu'à en avoir une non-piège pour `id`, puis joue. */
  function surviveAt(m: MatchLogic, id: string, atMs: number, otherIds: string[]): boolean {
    for (let guard = 0; guard < 80; guard++) {
      m.openRound();
      const rule = m.rulesAt(m.roundIdx).get(id)!;
      const round = buildMultiRound(m.seed, m.roundIdx, rule);
      for (const oid of otherIds) playPerfect(m, oid);
      if (round.trap || round.steps.length === 0) {
        // silence sur piège / rien à faire : survie sans réaction
        m.closeRound();
        continue;
      }
      playPerfect(m, id, atMs);
      m.closeRound();
      return true;
    }
    return false;
  }

  it("ne retient que les manches réussies dans la médiane (pas les morts)", () => {
    const m = new MatchLogic(9001, ["a", "b"]);
    expect(surviveAt(m, "a", 100, ["b"])).toBe(true);
    expect(surviveAt(m, "a", 500, ["b"])).toBe(true);
    // mort à 200 ms : ne doit pas entrer dans reactions
    m.openRound();
    playPerfect(m, "b");
    playDie(m, "a");
    m.closeRound();
    expect(surviveAt(m, "a", 300, ["b"])).toBe(true);
    const st = m.statsOf("a");
    expect(st.reaction).toBe(300);
    expect(m.seats.find((s) => s.id === "a")!.stats.reactions).toEqual([100, 500, 300]);
  });

  it("laisse reaction à null sous STATS_MIN_SAMPLES, puis une médiane", () => {
    const m = new MatchLogic(9002, ["a", "b"]);
    expect(surviveAt(m, "a", 120, ["b"])).toBe(true);
    expect(m.statsOf("a").reaction).toBeNull();
    expect(surviveAt(m, "a", 180, ["b"])).toBe(true);
    expect(m.statsOf("a").reaction).toBeNull();
    expect(STATS_MIN_SAMPLES).toBe(3);
    expect(surviveAt(m, "a", 240, ["b"])).toBe(true);
    expect(m.statsOf("a").reaction).toBe(180);
  });

  it("repart la série à zéro à la mort et conserve bestStreak", () => {
    const m = new MatchLogic(9003, ["a", "b"]);
    expect(surviveAt(m, "a", 200, ["b"])).toBe(true);
    expect(surviveAt(m, "a", 200, ["b"])).toBe(true);
    expect(m.statsOf("a").streak).toBeGreaterThanOrEqual(2);
    const peak = m.statsOf("a").bestStreak;
    expect(peak).toBeGreaterThanOrEqual(2);
    m.openRound();
    playPerfect(m, "b");
    playDie(m, "a");
    m.closeRound();
    expect(m.statsOf("a").streak).toBe(0);
    expect(m.statsOf("a").bestStreak).toBe(peak);
    expect(surviveAt(m, "a", 200, ["b"])).toBe(true);
    expect(m.statsOf("a").streak).toBe(1);
    expect(m.statsOf("a").bestStreak).toBe(peak);
  });

  it("ne compte trapsAvoided que sur survive avec trap", () => {
    const m = new MatchLogic(9004, ["a", "b"]);
    let traps = 0;
    for (let guard = 0; guard < 200 && traps < 1; guard++) {
      m.openRound();
      const rule = m.rulesAt(m.roundIdx).get("a")!;
      const round = buildMultiRound(m.seed, m.roundIdx, rule);
      playPerfect(m, "b");
      if (round.trap) {
        // silence = survie au piège
        const res = m.closeRound();
        expect(res.outcomes.get("a")).toEqual({ kind: "survive", trap: true });
        traps = m.statsOf("a").traps;
      } else {
        playPerfect(m, "a");
        m.closeRound();
      }
    }
    expect(traps).toBeGreaterThanOrEqual(1);
    expect(m.statsOf("a").traps).toBe(traps);
  });
});

describe("horloge serveur", () => {
  it("estime l'offset au milieu de l'aller-retour", () => {
    const c = new ServerClock();
    // client à t=1000, serveur 500 ms en avance, 40 ms de latence aller
    c.addSample(1000, 1080, 1000 + 40 + 500);
    c.addSample(2000, 2080, 2000 + 40 + 500);
    c.addSample(3000, 3080, 3000 + 40 + 500);
    expect(c.ready).toBe(true);
    expect(Math.abs(c.currentOffset - 500)).toBeLessThan(1);
  });

  it("résiste à un pic de latence grâce à la médiane", () => {
    const c = new ServerClock();
    for (let i = 0; i < 6; i++) c.addSample(i * 1000, i * 1000 + 60, i * 1000 + 30 + 200);
    // un ping traverse un pic à 900 ms : l'échantillon est aberrant
    c.addSample(9000, 9900, 9000 + 450 + 200);
    expect(Math.abs(c.currentOffset - 200)).toBeLessThan(5);
  });

  it("convertit une date serveur en date locale et retour", () => {
    const c = new ServerClock();
    c.addSample(0, 0, 300);
    c.addSample(10, 10, 310);
    c.addSample(20, 20, 320);
    const serverDeadline = 5000;
    expect(c.toLocal(serverDeadline) + c.currentOffset).toBeCloseTo(serverDeadline, 5);
  });
});

describe("courbe de tension", () => {
  it("départ bavard sur un salon de 6", () => {
    const m = new MatchLogic(1, ["a", "b", "c", "d", "e", "f"]);
    expect(m.tensionAt(0)).toBeGreaterThan(1.3);
  });

  it("resserre la vis après des éliminations", () => {
    const m = new MatchLogic(1, ["a", "b", "c", "d", "e", "f"]);
    const start = m.tensionAt(0);
    m.forfeit("a");
    m.forfeit("b");
    expect(m.tensionAt(0)).toBeLessThan(start);
    expect(m.tensionAt(0)).toBeGreaterThan(0.7);
  });

  it("atteint 1,10 au dernier état avant duel, quel que soit l'effectif", () => {
    for (const [n, kills] of [
      [4, 1],
      [5, 2],
      [6, 3],
    ] as const) {
      const ids = Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i));
      const m = new MatchLogic(1, ids);
      for (let i = 0; i < kills; i++) m.forfeit(ids[i]!);
      expect(m.alive.length).toBe(3);
      expect(m.tensionAt(0)).toBeCloseTo(1.1, 5);
    }
  });

  it("bascule en duel à ×0,55 après éliminations", () => {
    const m = new MatchLogic(1, ["a", "b", "c", "d", "e", "f"]);
    for (const id of ["a", "b", "c", "d"]) m.forfeit(id);
    expect(m.alive.length).toBe(2);
    expect(m.tensionAt(0)).toBe(0.55);
  });

  it("salon de 3 : duel dès la première élimination", () => {
    const m = new MatchLogic(1, ["a", "b", "c"]);
    m.forfeit("a");
    expect(m.alive.length).toBe(2);
    expect(m.tensionAt(0)).toBe(0.55);
  });

  it("1v1 pur accélère par l'index, sans bascule duel", () => {
    const m = new MatchLogic(1, ["a", "b"]);
    expect(m.tensionAt(0)).toBeGreaterThan(1.3);
    expect(m.tensionAt(40)).toBeCloseTo(0.9, 5);
  });

  it("plancher MIN_ROUND_MS sous speed 0.65 en duel", () => {
    const m = new MatchLogic(1, ["a", "b", "c", "d", "e", "f"], {
      speed: 0.65,
      lives: 3,
      rotationEvery: 8,
    });
    for (const id of ["a", "b", "c", "d"]) m.forfeit(id);
    for (let i = 0; i < 50; i++) {
      const { durationMs } = m.openRound();
      expect(durationMs).toBeGreaterThanOrEqual(MIN_ROUND_MS);
    }
  });

  it("plafond MAX_ROUND_MS sous speed 1.3 au départ", () => {
    const m = new MatchLogic(1, ["a", "b", "c", "d", "e", "f"], {
      speed: 1.3,
      lives: 3,
      rotationEvery: 8,
    });
    for (let i = 0; i < 50; i++) {
      const { durationMs } = m.openRound();
      expect(durationMs).toBeLessThanOrEqual(MAX_ROUND_MS);
    }
  });
});
