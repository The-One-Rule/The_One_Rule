/**
 * LA SECONDE et le lever du doigt.
 *
 * Rapporté en playtest : « la règle LA SECONDE est buguée, peu importe quand
 * on clique elle retire une vie ». Cause : un clic réussi ouvre la manche
 * SUIVANTE, et le doigt se lève ~80 ms plus tard — donc dans les 400
 * premières ms de la manche d'après. `resolveAction` passait ce lever à la
 * règle unique AVANT de voir qu'il ne répondait à rien, et LA SECONDE le
 * jugeait « trop tôt ».
 *
 * DENTS : retirer la garde `leverAttendu` en tête de `resolveAction` fait
 * tomber les deux tests.
 */
import { describe, expect, it } from "vitest";
import { resolveAction } from "../src/engine/resolve";
import { mulberry32 } from "../src/engine/rng";
import { ONE_RULES } from "../src/engine/rules";
import type { Action } from "../src/engine/types";
import { Session } from "../src/game/session";

const seconde = ONE_RULES.find((r) => r.id === "seconde")!;

describe("LA SECONDE ne juge pas un lever qui ne répond à rien", () => {
  it("un lever à 80 ms d'une manche ouverte n'est pas une action", () => {
    const s = new Session({ mode: "training", rule: seconde, rng: mulberry32(3), now: 0, seed: 3, touchOnly: true });
    const lever: Action = { kind: "lift", ent: s.round.ents[0], x: 0, y: 0 };
    const r = resolveAction(s.round, { step: 0 }, lever, 80, seconde.judge);
    expect(r.outcome.kind).toBe("pending");
  });

  it("un joueur qui attend 500 ms puis lève le doigt survit, manche après manche", () => {
    const s = new Session({ mode: "training", rule: seconde, rng: mulberry32(11), now: 0, seed: 11, touchOnly: true });
    let now = 0;
    let clics = 0;
    for (let n = 0; n < 12 && s.phase === "playing"; n++) {
      const round = s.round;
      const st = round.steps[0];
      const idx =
        st?.kind === "click" ? st.idx
        : st?.kind === "clickAny" ? 0
        : st?.kind === "clickAnyExcept" ? round.ents.findIndex((x) => x.color !== st.color)
        : -1;
      if (idx < 0 || round.steps.length > 1) {
        // Rien à cliquer simplement ici : on laisse filer la manche.
        now += round.durationMs + 1;
        s.tick(now);
        continue;
      }
      const e = round.ents[idx]!;
      now += 500;
      expect(s.input({ kind: "click", ent: e, x: e.x, y: e.y }, now).kind).toBe("survive");
      clics++;
      // Le doigt se lève — sur la manche d'APRÈS.
      now += 80;
      const out = s.input({ kind: "lift", ent: e, x: e.x, y: e.y }, now);
      expect(out.kind, `manche ${n} : le lever a tué`).toBe("pending");
    }
    expect(clics, "le scénario n'a rien éprouvé").toBeGreaterThan(2);
  });
});
