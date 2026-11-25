/**
 * LE CAMÉLÉON — le réglage de LA PILE où la règle CHANGE au lieu de s'ajouter.
 *
 * Trois promesses, et chacune a sa panne silencieuse :
 *   · la règle change toutes les 10 manches, une à la fois, et s'annonce ;
 *   · la pause de lecture (`Session.decale`) ne laisse aucune trace dans le
 *     journal — sinon le rejeu verrait un joueur immobile pendant l'annonce ;
 *   · le serveur rejoue le run sur la MÊME file (`claim.cameleon`) — sans le
 *     drapeau, il tirerait la pile de l'escalade et jugerait d'autres règles.
 */
import { describe, expect, it } from "vitest";
import {
  PALIER_CAMELEON,
  PALIER_MAX,
  pileCameleon,
  pileEscalade,
  rangCameleon,
  regleCameleonA,
} from "../src/engine/escalade";
import { mulberry32 } from "../src/engine/rng";
import { ONE_RULES } from "../src/engine/rules";
import { verifyRun } from "../src/engine/verify";
import { Session } from "../src/game/session";
import { cleEscalade } from "../src/game/perfs";
import type { OneRule } from "../src/engine/types";

const DERIVE = 0x5eca1ade;

describe("la file du caméléon", () => {
  it("quatre règles qui piègent toutes, tirées de la graine", () => {
    for (let g = 1; g < 200; g++) {
      const a = pileCameleon(mulberry32(g ^ DERIVE));
      expect(a.length).toBe(PALIER_MAX);
      for (const r of a) expect(r.traps).toBe(true);
      expect(new Set(a.map((r) => r.id)).size).toBe(a.length);
      expect(pileCameleon(mulberry32(g ^ DERIVE)).map((r) => r.id)).toEqual(a.map((r) => r.id));
    }
  });

  it("respecte ce que l'appareil sait jouer", () => {
    const jouable = (r: OneRule) => r.id !== "sang" && r.id !== "azur";
    for (let g = 1; g < 100; g++) {
      for (const r of pileCameleon(mulberry32(g), jouable)) expect(jouable(r)).toBe(true);
    }
  });

  it("une règle par tranche de dix manches, jamais deux à la fois", () => {
    const pile = pileCameleon(mulberry32(7));
    expect(rangCameleon(0)).toBe(1);
    expect(rangCameleon(PALIER_CAMELEON - 1)).toBe(1);
    expect(rangCameleon(PALIER_CAMELEON)).toBe(2);
    expect(rangCameleon(1000)).toBe(PALIER_MAX);
    for (let l = 0; l < 60; l++) {
      const t = regleCameleonA(pile, l);
      expect(t).toHaveLength(1);
      expect(t[0]).toBe(pile[rangCameleon(l) - 1]);
    }
  });
});

describe("la session en caméléon", () => {
  const pile = pileCameleon(mulberry32(21 ^ DERIVE));
  const nouvelle = () =>
    new Session({ mode: "escalade", rule: pile[0]!, rng: mulberry32(21), now: 0, seed: 21, pile, cameleon: true });

  it("part sur la première règle de la file", () => {
    const s = nouvelle();
    expect(s.rule).toBe(pile[0]);
    expect(s.paliers).toBe(1);
    expect(s.cameleon).toBe(true);
  });

  it("change de règle à la manche 10, l'annonce UNE fois, et compte les règles tenues", () => {
    let vu = false;
    for (let seed = 40; seed < 80 && !vu; seed++) {
      const changes: { id: string; level: number }[] = [];
      const s = joueCameleon(seed, 0, (id, level) => changes.push({ id, level }));
      if (s.level <= PALIER_CAMELEON) continue;
      vu = true;
      expect(changes[0]).toEqual({ id: s.pile[1]!.id, level: PALIER_CAMELEON });
      expect(changes.filter((c) => c.level === PALIER_CAMELEON)).toHaveLength(1);
      expect(s.paliers).toBe(rangCameleon(s.level));
      expect(s.reglesTenues).toEqual([s.pile[rangCameleon(s.level) - 1]]);
    }
    expect(vu).toBe(true);
  });

  it("sans le réglage, LA PILE reste la pile : rien ne change pour elle", () => {
    const p = pileEscalade(mulberry32(21 ^ DERIVE));
    const s = new Session({ mode: "escalade", rule: p[0]!, rng: mulberry32(21), now: 0, seed: 21, pile: p });
    expect(s.cameleon).toBe(false);
  });

  it("le réglage n'a d'effet qu'en escalade", () => {
    const s = new Session({ mode: "training", rule: ONE_RULES[0]!, rng: mulberry32(3), now: 0, seed: 3, cameleon: true });
    expect(s.cameleon).toBe(false);
  });

  it("son record a sa propre clé ; celle de LA PILE ne bouge pas", () => {
    expect(cleEscalade(true)).not.toBe(cleEscalade());
    expect(cleEscalade(false)).toBe(cleEscalade());
    expect(cleEscalade()).not.toContain("cameleon");
  });
});

/** Un joueur qui obéit sans enfreindre sa règle, et marque une pause à chaque changement. */
function joueCameleon(seed: number, pauseMs: number, surChange?: (id: string, level: number) => void) {
  const pile = pileCameleon(mulberry32(seed ^ DERIVE));
  const s = new Session({ mode: "escalade", rule: pile[0]!, rng: mulberry32(seed), now: 0, seed, pile, cameleon: true });
  let now = 0;
  for (let n = 0; n < 45 && s.phase === "playing"; n++) {
    if (s.regleAjoutee) {
      surChange?.(s.regleAjoutee.id, s.level);
      s.regleAjoutee = null;
      // L'annonce plein cadre : la partie est suspendue, puis décalée d'autant.
      now += pauseMs;
      s.decale(pauseMs);
      s.tick(now);
    }
    const round = s.round;
    const regle = s.rule;
    const attente = regle.id === "seconde" ? 430 : 300;
    if (round.trap || round.steps.length === 0) {
      now += round.durationMs + 1;
      s.tick(now);
      continue;
    }
    const permise = (i: number) =>
      regle.judge({ kind: "click", ent: round.ents[i]!, x: 0, y: 0 }, { round, elapsedMs: attente }) === null;
    const gestes: (() => void)[] = [];
    for (const st of round.steps) {
      if (st.kind === "click") {
        const e = round.ents[st.idx]!;
        gestes.push(() => s.input({ kind: "click", ent: e, x: e.x, y: e.y }, now));
      } else if (st.kind === "clickAny" || st.kind === "clickAnyExcept") {
        const i = round.ents.findIndex((e, k) => permise(k) && (st.kind === "clickAny" || e.color !== st.color));
        if (i < 0) break;
        const e = round.ents[i]!;
        gestes.push(() => s.input({ kind: "click", ent: e, x: e.x, y: e.y }, now));
      } else if (st.kind === "key") {
        gestes.push(() => s.input({ kind: "key", key: st.key }, now));
      } else break;
    }
    if (gestes.length !== round.steps.length) {
      now += round.durationMs + 1;
      s.tick(now);
      continue;
    }
    now += attente;
    for (const g of gestes) {
      g();
      now += 60;
    }
  }
  return s;
}

describe("le rejeu serveur du caméléon", () => {
  it("la pause d'annonce ne laisse aucune trace : même journal, même score", () => {
    for (const seed of [11, 12, 13]) {
      const sans = joueCameleon(seed, 0);
      const avec = joueCameleon(seed, 4000);
      expect(avec.log).toEqual(sans.log);
      expect(avec.level).toBe(sans.level);
    }
  });

  it("le serveur rejoue la MÊME file avec `cameleon`, et une autre sans", () => {
    let franchis = 0;
    let diverge = 0;
    for (const seed of [31, 32, 33, 34, 35, 36]) {
      const s = joueCameleon(seed, 3000);
      if (s.level >= PALIER_CAMELEON) franchis++;
      const ruleId = s.pile[0]!.id;
      const v = verifyRun({ seed, ruleId, mode: "escalade", inputs: s.log, catalogue: 3, cameleon: true });
      expect(v.ok).toBe(true);
      expect(v.score).toBe(s.level);
      const faux = verifyRun({ seed, ruleId, mode: "escalade", inputs: s.log, catalogue: 3 });
      if (faux.score !== s.level) diverge++;
    }
    // Au moins un run a traversé un changement de règle : sinon la file ne serait pas éprouvée.
    expect(franchis).toBeGreaterThan(0);
    expect(diverge).toBeGreaterThan(0);
  });
});
