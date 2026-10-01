/**
 * LA PAUSE DE FIN D'ÉCHAUFFEMENT ne laisse aucune trace dans le journal.
 *
 * L'écran « Échauffement terminé » (maquette 2.6) s'affiche ENTRE deux
 * manches, partie suspendue. Le journal est ce que `verifyRun` rejoue : s'il
 * gardait la trace de la pause, le serveur verrait un joueur immobile pendant
 * cinq secondes — une manche perdue au temps qu'il n'a jamais perdue.
 *
 * DENTS : décaler `runStart` sans `roundStart` (ou l'inverse) fait tomber le
 * test.
 */
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/engine/rng";
import { ONE_RULES } from "../src/engine/rules";
import { Session } from "../src/game/session";

const sang = ONE_RULES.find((r) => r.id === "sang")!;

/** Joue 10 manches avec un temps de réaction fixe, pause optionnelle après l'échauffement. */
function joue(pauseMs: number): { log: unknown; level: number; splits: number[] } {
  const s = new Session({ mode: "daily", rule: sang, rng: mulberry32(9), now: 0, seed: 9 });
  let now = 0;
  let pause = false;
  for (let n = 0; n < 10 && s.phase === "playing"; n++) {
    if (pauseMs && !pause && s.graceJustEnded) {
      pause = true;
      now += pauseMs;
      s.decale(pauseMs);
      // La boucle de jeu tique à chaque image, pause comprise.
      s.tick(now);
    }
    const round = s.round;
    const st = round.steps[0];
    const idx = st?.kind === "click" ? st.idx : st?.kind === "clickAny" ? round.ents.findIndex((e) => e.color !== "garance") : -1;
    if (idx < 0 || round.steps.length > 1) {
      now += round.durationMs + 1;
      s.tick(now);
      continue;
    }
    now += 450;
    const e = round.ents[idx]!;
    s.input({ kind: "click", ent: e, x: e.x, y: e.y }, now);
  }
  return { log: s.log, level: s.level, splits: s.splits };
}

describe("la pause de fin d'échauffement", () => {
  it("le journal, le score et les temps de passage sont ceux d'une partie sans pause", () => {
    const sans = joue(0);
    const avec = joue(5000);
    expect(sans.level).toBeGreaterThan(3);
    expect(avec.log).toEqual(sans.log);
    expect(avec.level).toBe(sans.level);
    expect(avec.splits).toEqual(sans.splits);
  });

  it("une pause nulle ou négative ne fait rien", () => {
    const s = new Session({ mode: "daily", rule: sang, rng: mulberry32(9), now: 0, seed: 9 });
    const avant = s.elapsed(1000);
    s.decale(0);
    s.decale(-50);
    expect(s.elapsed(1000)).toBe(avant);
  });
});
