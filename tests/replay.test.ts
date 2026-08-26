import { describe, expect, it } from "vitest";
import {
  decodeReplay,
  encodeReplay,
  ghostDone,
  ghostFinal,
  ghostLevelAt,
  ruleOfReplay,
} from "../src/game/replay";
import type { Replay } from "../src/game/replay";
import { ONE_RULES } from "../src/engine/rules";

const make = (splits: number[], who?: string): Replay => ({
  v: 1,
  seed: 1234567,
  ruleId: "sang",
  splits,
  who,
});

/* Le fragment d'URL est fabriqué par le navigateur ; en Node il faut btoa/atob. */
if (typeof globalThis.btoa === "undefined") {
  globalThis.btoa = (s: string) => Buffer.from(s, "binary").toString("base64");
  globalThis.atob = (s: string) => Buffer.from(s, "base64").toString("binary");
}

describe("duel asynchrone", () => {
  it("refuse un lien qui annonce un nombre absurde de manches", () => {
    // Le fragment d'URL accepte des mégaoctets. Sans plafond, un lien forgé
    // fait construire un tableau immense au destinataire, que ghostLevelAt
    // parcourt à chaque image : le jeu se fige chez celui qui a cliqué.
    const enorme = encodeReplay(make(Array.from({ length: 5000 }, (_, i) => (i + 1) * 100)));
    expect(decodeReplay(enorme)).toBeNull();

    // La borne ne doit pas mordre sur un run réel, même long.
    const long = encodeReplay(make(Array.from({ length: 400 }, (_, i) => (i + 1) * 100)));
    expect(decodeReplay(long)?.splits).toHaveLength(400);
  });

  it("survit à un aller-retour d'encodage", () => {
    const r = make([1200, 2400, 3300, 4800], "pierre");
    const back = decodeReplay(encodeReplay(r));
    expect(back).not.toBeNull();
    expect(back!.seed).toBe(r.seed);
    expect(back!.ruleId).toBe(r.ruleId);
    expect(back!.who).toBe("pierre");
    // stockage au centième de seconde : on tolère l'arrondi, pas la dérive
    expect(back!.splits).toHaveLength(4);
    back!.splits.forEach((v, i) => expect(Math.abs(v - r.splits[i]!)).toBeLessThanOrEqual(10));
  });

  it("tient un run complet dans une URL partageable", () => {
    // 40 manches : le lien doit passer dans un message sans être tronqué
    const splits = Array.from({ length: 40 }, (_, i) => (i + 1) * 1400);
    const payload = encodeReplay(make(splits, "alexandre"));
    expect(payload.length).toBeLessThan(220);
    expect(payload).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(decodeReplay(payload)!.splits).toHaveLength(40);
  });

  it("refuse un lien trafiqué plutôt que de planter", () => {
    expect(decodeReplay("nimportequoi")).toBeNull();
    expect(decodeReplay("")).toBeNull();
    // règle inexistante
    expect(decodeReplay(btoa("1|abc|pasunerègle||1.2.3"))).toBeNull();
    // splits qui reculent dans le temps
    const forged = btoa("1|abc|sang||5.-3.2");
    expect(decodeReplay(forged)).toBeNull();
  });

  it("retrouve la règle du fantôme", () => {
    const r = make([1000]);
    expect(ruleOfReplay(r)).toBe(ONE_RULES.find((x) => x.id === "sang"));
  });

  it("fait progresser le fantôme dans le temps, jamais à l'envers", () => {
    const r = make([1000, 2000, 3000]);
    expect(ghostLevelAt(r, 0)).toBe(0);
    expect(ghostLevelAt(r, 999)).toBe(0);
    expect(ghostLevelAt(r, 1000)).toBe(1);
    expect(ghostLevelAt(r, 2500)).toBe(2);
    expect(ghostLevelAt(r, 99999)).toBe(3);

    let prev = 0;
    for (let t = 0; t < 5000; t += 50) {
      const lvl = ghostLevelAt(r, t);
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });

  it("sait quand le fantôme est arrêté", () => {
    const r = make([1000, 2000]);
    expect(ghostDone(r, 1500)).toBe(false);
    expect(ghostDone(r, 2001)).toBe(true);
    expect(ghostFinal(r)).toBe(2);
    expect(ghostDone(make([]), 0)).toBe(true);
  });

  it("donne la même partie aux deux joueurs", async () => {
    // c'est tout l'intérêt du duel : même graine, même règle, même ordre
    const { mulberry32 } = await import("../src/engine/rng");
    const { buildRound } = await import("../src/engine/round");
    const rule = ONE_RULES.find((r) => r.id === "sang")!;
    const r = make([1000]);

    const a = mulberry32(r.seed);
    const b = mulberry32(decodeReplay(encodeReplay(r))!.seed);
    for (let lvl = 0; lvl < 25; lvl++) {
      const ra = buildRound(a, lvl, rule);
      const rb = buildRound(b, lvl, rule);
      expect(rb.text).toBe(ra.text);
      expect(rb.trap).toBe(ra.trap);
      expect(rb.ents.map((e) => `${e.shape}${e.color}${e.r}`)).toEqual(
        ra.ents.map((e) => `${e.shape}${e.color}${e.r}`),
      );
    }
  });
});
