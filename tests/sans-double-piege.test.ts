/**
 * JAMAIS DEUX PIÈGES D'AFFILÉE, ET PLUS DE « NE FAIS RIEN » — directive de
 * Pierre (01/10) : « fais en sorte que deux consignes ne puissent jamais
 * demander à la fois de ne rien faire, par exemple sur le sang, pas deux
 * consignes de suite qui disent de cliquer sur du rouge ».
 *
 * Solo : catalogue 3 (`INSTRUCTIONS_SOLO`, `buildRound(… apresPiege)`).
 * Multi : salons en version 4, le SERVEUR choisit le tirage
 * (`tirageSansDoublePiege`) et le transmet.
 *
 * DENTS : retirer `apresPiege` de `Session.nextRound` fait tomber le test des
 * runs ; le retirer de `verifyRun` fait tomber celui du rejeu ; ignorer
 * `sortants` dans `tirageSansDoublePiege` fait tomber celui du multi.
 */
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/engine/rng";
import { ONE_RULES } from "../src/engine/rules";
import {
  CATALOGUE_SOLO,
  CONSIGNES_RIEN,
  CONSIGNES_VERSION,
  INSTRUCTIONS,
  INSTRUCTIONS_SOLO,
  INSTRUCTIONS_SOLO_V2,
  TOUCH_INSTRUCTIONS_SOLO,
} from "../src/engine/instructions";
import { draftShared, applyRule, poolMulti, tirageSansDoublePiege } from "../src/engine/multiround";
import { buildRound } from "../src/engine/round";
import { verifyRun } from "../src/engine/verify";
import { Session } from "../src/game/session";
import { MatchLogic } from "../server/match";

const piegeuses = ONE_RULES.filter((r) => r.traps);

describe("le catalogue solo 3", () => {
  it("ne contient plus aucune consigne « NE FAIS RIEN »", () => {
    expect(CATALOGUE_SOLO).toBe(3);
    for (const pool of [INSTRUCTIONS_SOLO, TOUCH_INSTRUCTIONS_SOLO]) {
      expect(pool.filter((i) => CONSIGNES_RIEN.has(i.id))).toEqual([]);
    }
    // …mais le catalogue 2 les garde : un run d'hier se rejoue sur elles.
    expect(INSTRUCTIONS_SOLO_V2.filter((i) => CONSIGNES_RIEN.has(i.id)).length).toBe(2);
    // et la base du multi v1-3 aussi.
    expect(INSTRUCTIONS.filter((i) => CONSIGNES_RIEN.has(i.id)).length).toBe(2);
  });

  it("⚠️ une partie réelle n'enchaîne JAMAIS deux pièges, sous aucune règle", () => {
    let pieges = 0;
    for (const rule of piegeuses) {
      for (let seed = 1; seed <= 40; seed++) {
        // Entraînement, cinq vies : on traverse beaucoup de manches sans jouer.
        const s = new Session({ mode: "training", rule, rng: mulberry32(seed), now: 0, seed, vies: 99, grace: 99 });
        let now = 0;
        let avant = false;
        for (let n = 0; n < 45 && s.phase === "playing"; n++) {
          const r = s.round;
          expect(CONSIGNES_RIEN.has(r.instructionId), `${rule.id} graine ${seed} : NE FAIS RIEN`).toBe(false);
          expect(avant && r.trap, `${rule.id} graine ${seed} manche ${n} : deux pièges d'affilée`).toBe(false);
          avant = r.trap;
          if (r.trap) pieges++;
          now += r.durationMs + 1;
          s.tick(now);
        }
      }
    }
    // Le piège n'a pas disparu pour autant : c'est le cœur du jeu.
    expect(pieges).toBeGreaterThan(500);
  });

  it("buildRound sans `apresPiege` tire exactement comme avant", () => {
    // Le rejeu des catalogues 1 et 2 dépend de ce défaut.
    for (const rule of piegeuses) {
      const a = mulberry32(7);
      const b = mulberry32(7);
      for (let level = 0; level < 30; level++) {
        const x = buildRound(a, level, rule, INSTRUCTIONS_SOLO_V2);
        const y = buildRound(b, level, rule, INSTRUCTIONS_SOLO_V2, 1, undefined, false);
        expect(y.text).toBe(x.text);
        expect(y.trap).toBe(x.trap);
      }
    }
  });
});

describe("le rejeu serveur", () => {
  /** Une partie jouée par `Session` (catalogue 3), son journal tel quel. */
  function partieJouee(ruleId: string, seed: number) {
    const rule = ONE_RULES.find((r) => r.id === ruleId)!;
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
    return { s, rule };
  }

  it("rejoue un run de catalogue 3 au coup près — et pas sur le catalogue 2", () => {
    let differents = 0;
    for (const id of ["sang", "pointe", "roue", "gaucher"]) {
      for (const seed of [11, 23, 57]) {
        const { s, rule } = partieJouee(id, seed);
        const v3 = verifyRun({ seed, ruleId: rule.id, mode: "daily", inputs: s.log, catalogue: CATALOGUE_SOLO });
        expect(v3.score, `${id}/${seed}`).toBe(s.level);
        const v2 = verifyRun({ seed, ruleId: rule.id, mode: "daily", inputs: s.log, catalogue: 2 });
        if (v2.score !== s.level || !v2.ok) differents++;
      }
    }
    // Le catalogue compte : rejoués sur le 2, ces runs ne tiennent plus.
    expect(differents).toBeGreaterThan(0);
  });
});

describe("le multi en version 4", () => {
  it("la version 4 ferme « NE FAIS RIEN », la 3 le garde (un salon d'hier)", () => {
    // 5 = LA RANCUNE entre au pool de RÈGLES : les consignes ne bougent pas.
    expect(CONSIGNES_VERSION).toBe(5);
    for (const clavier of [false, true]) {
      expect(poolMulti(clavier, 4).some((i) => CONSIGNES_RIEN.has(i.id))).toBe(false);
      expect(poolMulti(clavier, 3).some((i) => CONSIGNES_RIEN.has(i.id))).toBe(true);
      expect(poolMulti(clavier, 5).map((i) => i.id)).toEqual(poolMulti(clavier, 4).map((i) => i.id));
    }
  });

  it("le tirage 0 est la manche d'hier, à l'identique", () => {
    for (let idx = 0; idx < 30; idx++) {
      const a = draftShared(99, idx, poolMulti(false, 3));
      const b = draftShared(99, idx, poolMulti(false, 3), 0);
      expect(b.text).toBe(a.text);
      expect(b.ents).toEqual(a.ents);
    }
  });

  it("le serveur ne fait enchaîner deux pièges à personne", () => {
    const pool = poolMulti(false, 4);
    let retires = 0;
    let doubles = 0;
    for (let seed = 1; seed <= 60; seed++) {
      // Six joueurs, six règles piégeuses : le pire cas réaliste.
      const regles = piegeuses.slice(0, 6);
      let avant = new Set<number>();
      for (let idx = 0; idx < 40; idx++) {
        const sortants = [...avant].map((k) => regles[k]!);
        const t = tirageSansDoublePiege(seed, idx, pool, sortants);
        if (t > 0) retires++;
        const d = draftShared(seed, idx, pool, t);
        const maintenant = new Set<number>();
        regles.forEach((r, k) => {
          if (applyRule(d, r, seed).trap) maintenant.add(k);
        });
        for (const k of maintenant) if (avant.has(k)) doubles++;
        avant = maintenant;
      }
    }
    expect(retires, "le serveur n'a jamais rien retiré : le test ne prouve rien").toBeGreaterThan(50);
    // `TIRAGES_MAX` au plus : un double reste possible en théorie. Mesuré :
    // 17 à 8 tirages, 1 à 16, zéro à 32 sur ces 2400 manches.
    expect(doubles).toBe(0);
  });

  it("MatchLogic transmet un tirage, et sa manche est celle du client", () => {
    let vus = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const m = new MatchLogic(seed, ["a", "b", "c", "d", "e", "f"], undefined, new Set(), false, false, 4);
      for (let k = 0; k < 15; k++) {
        const { idx, tirage } = m.openRound();
        if (tirage > 0) vus++;
        // Le client reconstruit avec le tirage reçu : même consigne.
        const d = draftShared(seed, idx, poolMulti(false, 4), tirage);
        expect((m as unknown as { shared: { text: string } }).shared.text).toBe(d.text);
        m.closeRound();
        if (m.alive.length < 2) break;
      }
    }
    expect(vus).toBeGreaterThan(0);
  });
});
