import { beforeEach, describe, expect, it } from "vitest";
import { ONE_RULES } from "../src/engine/rules";
import { dayIndex, ruleOfDay, tomorrowRule } from "../src/game/daily";

/* localStorage minimal : progress.ts doit fonctionner hors navigateur */
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const P = await import("../src/game/progress");
const Q = await import("../src/game/quests");

describe("rotation quotidienne", () => {
  it("épuise tout le catalogue avant de répéter une règle", () => {
    const n = ONE_RULES.length;
    for (let cycle = 0; cycle < 20; cycle++) {
      const seen = new Set<string>();
      for (let i = 0; i < n; i++) seen.add(ruleOfDay(cycle * n + i).id);
      expect(seen.size).toBe(n);
    }
  });

  it("change l'ordre d'un cycle à l'autre", () => {
    const n = ONE_RULES.length;
    const a = Array.from({ length: n }, (_, i) => ruleOfDay(i).id).join(",");
    const b = Array.from({ length: n }, (_, i) => ruleOfDay(n + i).id).join(",");
    expect(a).not.toBe(b);
  });

  it("permet d'annoncer la règle de demain", () => {
    const d = dayIndex();
    expect(tomorrowRule(d).id).toBe(ruleOfDay(d + 1).id);
  });

  it("est stable pour un jour donné", () => {
    expect(ruleOfDay(500).id).toBe(ruleOfDay(500).id);
  });
});

describe("série et jour de grâce", () => {
  beforeEach(() => store.clear());

  const reset = () => {
    const s = P.load();
    s.streak = { count: 0, lastDay: -99, graceWeek: -1, graceLeft: 1 };
    P.save(s);
    return s;
  };

  it("monte d'un cran par jour consécutif", () => {
    const s = reset();
    P.touchStreak(s, 10);
    P.touchStreak(s, 11);
    P.touchStreak(s, 12);
    expect(s.streak.count).toBe(3);
  });

  it("ignore un second passage le même jour", () => {
    const s = reset();
    P.touchStreak(s, 10);
    P.touchStreak(s, 10);
    expect(s.streak.count).toBe(1);
  });

  it("survit à UN jour manqué grâce au jour de grâce", () => {
    const s = reset();
    P.touchStreak(s, 7);
    P.touchStreak(s, 8);
    const r = P.touchStreak(s, 10); // jour 9 manqué
    expect(r.graceUsed).toBe(true);
    expect(s.streak.count).toBe(3);
  });

  it("casse au deuxième jour manqué de la même semaine", () => {
    const s = reset();
    P.touchStreak(s, 7);
    P.touchStreak(s, 9); // grâce consommée
    const r = P.touchStreak(s, 11);
    expect(r.kept).toBe(false);
    expect(s.streak.count).toBe(1);
  });

  it("casse sur une absence de deux jours pleins", () => {
    const s = reset();
    P.touchStreak(s, 7);
    const r = P.touchStreak(s, 11);
    expect(r.kept).toBe(false);
    expect(s.streak.count).toBe(1);
  });

  it("recharge la grâce à la semaine suivante", () => {
    const s = reset();
    P.touchStreak(s, 1);
    P.touchStreak(s, 3); // grâce de la semaine 0
    P.touchStreak(s, 4);
    P.touchStreak(s, 5);
    P.touchStreak(s, 6);
    P.touchStreak(s, 7);
    const r = P.touchStreak(s, 9); // semaine 1, nouvelle grâce
    expect(r.graceUsed).toBe(true);
    expect(r.kept).toBe(true);
  });
});

describe("quêtes", () => {
  beforeEach(() => store.clear());

  it("cale la quête de performance sur le niveau du joueur", () => {
    const s = P.load();
    s.recent = [];
    const debutant = Q.questsOfDay(3, s).find((q) => q.metric === "best")!;

    s.recent = [40, 44, 38, 46, 42];
    const bon = Q.questsOfDay(3, s).find((q) => q.metric === "best")!;

    // un seuil fixe serait un mur pour l'un et une formalité pour l'autre
    expect(debutant.target).toBeLessThan(10);
    expect(bon.target).toBeGreaterThan(40);
  });

  it("donne toujours trois quêtes dont une toujours faisable", () => {
    const s = P.load();
    for (let d = 0; d < 60; d++) {
      const qs = Q.questsOfDay(d, s);
      expect(qs).toHaveLength(3);
      expect(qs.some((q) => q.id.startsWith("p_"))).toBe(true);
      expect(new Set(qs.map((q) => q.id)).size).toBe(3);
    }
  });

  it("n'encaisse une récompense qu'une seule fois", () => {
    const s = P.load();
    Q.ensureDay(s, 5);
    Q.bump(s, "runs", 10);
    Q.bump(s, "traps", 10);
    Q.bump(s, "rounds", 200);
    Q.bump(s, "best", 99, "max");
    Q.bump(s, "dailyPlayed", 1);
    Q.bump(s, "dailyCleared", 1);
    Q.bump(s, "noKey", 99, "max");
    const first = Q.claimAll(s, 5);
    const second = Q.claimAll(s, 5);
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
  });

  it("remet les compteurs à zéro au changement de jour", () => {
    const s = P.load();
    Q.ensureDay(s, 5);
    Q.bump(s, "runs", 3);
    Q.ensureDay(s, 6);
    expect(s.quests.state["runs"] ?? 0).toBe(0);
    expect(s.daily.played).toBe(false);
  });
});

describe("⚠️ la quête de PRÉSENCE doit être faisable", () => {
  it("se valide en JOUANT le run du jour, pas en le terminant", () => {
    /*
     * Elle visait `dailyCleared`, qui n'est vrai qu'en atteignant la 40e
     * manche. Or le score médian d'un run est de 12 et le p75 de 20 : la
     * quête était donc hors de portée de la quasi-totalité des joueurs, tous
     * les jours — alors que son lot s'annonce « toujours faisable, quel que
     * soit le niveau ».
     *
     * Rapporté par Pierre : « j'ai validé ma run du jour mais la quête du
     * jour ne me la valide toujours pas », avec 34 manches sur 40 à l'écran.
     */
    const s = P.load();
    Q.ensureDay(s, 5);
    const presence = Q.viewQuests(s, 5).find((q) => q.id === "p_daily");
    if (!presence) return; // ce jour-là, le tirage a servi une autre présence
    expect(presence.done, "rien joué, rien validé").toBe(false);
    // Un run du jour JOUÉ, et perdu bien avant la quarantième manche.
    Q.bump(s, "dailyPlayed", 1, "max");
    expect(Q.viewQuests(s, 5).find((q) => q.id === "p_daily")!.done).toBe(true);
  });
});
