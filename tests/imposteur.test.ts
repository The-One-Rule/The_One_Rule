/**
 * Mode imposteur — lot 1 : 10 manches, règle commune secrète, 5 pièges forcés.
 *
 * Personne n'est éliminé. Le secret est le bug qui tue le mode s'il est raté :
 * le JSON public ne doit jamais distinguer l'imposteur.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  PROTOCOL_VERSION,
  sanitizeSettings,
  SPEED_CHOICES,
} from "../shared/protocol";
import { MatchLogic, multiRulesFor } from "../server/match";
import {
  draftImposteur,
  dureeImposteur,
  fautSignalerActe,
  acteDe,
  IMPOSTEUR_MANCHES,
  IMPOSTEUR_PIEGES,
  IMPOSTEUR_PLANCHER_MS,
  IMPOSTEUR_VITESSE,
  SANS_REGLE,
} from "../src/engine/imposteur";
import { applyRule, poolMulti } from "../src/engine/multiround";
import { ONE_RULES } from "../src/engine/rules";
import { MOTIFS } from "../src/engine/motifs";
import { VERSION_CONTENU } from "../src/engine/version";

function matchImposteur(seed: number, n = 4, clavier = false): MatchLogic {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  return new MatchLogic(
    seed,
    ids,
    { ...DEFAULT_SETTINGS, mode: "imposteur", duo: false },
    new Set(),
    clavier,
    false,
  );
}

/** Le JSON public refuse toute distinction de l'imposteur. */
function refuseFuite(rules: Record<string, string>): void {
  const vals = Object.values(rules);
  if (vals.length === 0) throw new Error("vide");
  if (vals.some((v) => !v || v === "sansRegle")) throw new Error("fuite");
  if (new Set(vals).size !== 1) throw new Error("distinction");
}

describe("invariants du lot", () => {
  it("VERSION_CONTENU n'a pas bougé", () => {
    expect(VERSION_CONTENU).toBe("hdblrb");
  });

  it("PROTOCOL_VERSION reste à 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it("SANS_REGLE n'entre pas dans ONE_RULES", () => {
    expect(ONE_RULES.some((r) => r.id === "sansRegle")).toBe(false);
    expect(SANS_REGLE.traps).toBe(false);
    expect(SANS_REGLE.forbids({ kind: "clickAny" }, [])).toBe(false);
    expect(SANS_REGLE.watchRelease).toBeUndefined();
    expect(SANS_REGLE.transform).toBeUndefined();
  });

  it("version.ts n'importe pas le module imposteur", () => {
    const src = readFileSync("src/engine/version.ts", "utf8");
    expect(src).not.toMatch(/imposteur/);
    expect(src).not.toMatch(/sansRegle/);
  });
});

describe("sanitizeSettings — mode facultatif", () => {
  it("absent, undefined, valeur inconnue → classique", () => {
    expect(sanitizeSettings({}).mode).toBe("classique");
    expect(sanitizeSettings({}).duo).toBe(false);
    expect(sanitizeSettings({ mode: "foo" as "classique" }).mode).toBe("classique");
  });

  it("un client ancien qui n'envoie que { duo: true } tombe en duo", () => {
    const s = sanitizeSettings({ duo: true });
    expect(s.mode).toBe("duo");
    expect(s.duo).toBe(true);
  });

  it("mode imposteur force duo à false, et les deux ne se cumulent jamais", () => {
    const s = sanitizeSettings({ mode: "imposteur", duo: true });
    expect(s.mode).toBe("imposteur");
    expect(s.duo).toBe(false);
  });

  it("mode duo force duo à true", () => {
    const s = sanitizeSettings({ mode: "duo", duo: false });
    expect(s.mode).toBe("duo");
    expect(s.duo).toBe(true);
  });

  it("l'e2e DUO : { duo: true, lives: 3 } sur DEFAULT reste duo", () => {
    expect("mode" in DEFAULT_SETTINGS).toBe(false);
    const s = sanitizeSettings({ ...DEFAULT_SETTINGS, duo: true, lives: 3 });
    expect(s.duo).toBe(true);
    expect(s.mode).toBe("duo");
    expect(s.lives).toBe(3);
  });
});

describe("règle commune, imposteur, secret", () => {
  it("tire une seule règle piégeuse, et un seul siège sans règle", () => {
    const m = matchImposteur(42, 5);
    expect(m.imposteur).toBe(true);
    expect(m.regleCommune).toBeTruthy();
    expect(m.regleCommune!.traps).toBe(true);
    expect(m.imposteurId).toBeTruthy();
    const internes = m.rulesAt(0);
    const ids = [...internes.values()].map((r) => r.id);
    expect(ids.filter((id) => id === "sansRegle")).toHaveLength(1);
    expect(ids.filter((id) => id === m.regleCommune!.id)).toHaveLength(4);
    expect(internes.get(m.imposteurId!)!.id).toBe("sansRegle");
  });

  it("la rotation est ignorée", () => {
    const m = matchImposteur(7, 4);
    expect(m.rotationJustHappened(8)).toBe(false);
    expect(m.rulesAt(0).get("p0")!.id).toBe(m.rulesAt(8).get("p0")!.id);
  });

  it("le JSON public ne distingue pas l'imposteur", () => {
    const m = matchImposteur(99, 6);
    refuseFuite(m.reglesPubliques(0));
    expect(Object.values(m.reglesPubliques(0))[0]).toBe(m.regleCommune!.id);
  });

  it("tombe si l'imposteur fuit dans le Record public — dents", () => {
    expect(() => refuseFuite({ a: "sang", b: "" })).toThrow(/fuite/);
    expect(() => refuseFuite({ a: "sang", b: "sansRegle" })).toThrow(/fuite/);
    expect(() => refuseFuite({ a: "sang", b: "pointe" })).toThrow(/distinction/);
    const m = matchImposteur(13, 4);
    const fuite: Record<string, string> = {};
    for (const [id, r] of m.rulesAt(0)) fuite[id] = r.id;
    expect(() => refuseFuite(fuite)).toThrow();
    refuseFuite(m.reglesPubliques(0));
  });

  it("le pool piégeur suit le salon clavier, sans LA MAIN GAUCHE", () => {
    const tactile = multiRulesFor(false).filter((r) => r.traps);
    const clavier = multiRulesFor(true).filter((r) => r.traps);
    expect(tactile.some((r) => r.id === "voyelle")).toBe(false);
    expect(clavier.some((r) => r.id === "voyelle")).toBe(true);
    expect(tactile.some((r) => r.watchRelease)).toBe(false);
    expect(clavier.some((r) => r.watchRelease)).toBe(false);
    const m = matchImposteur(3, 4, false);
    expect(tactile.some((r) => r.id === m.regleCommune!.id)).toBe(true);
  });
});

describe("10 manches, personne n'est éliminé", () => {
  it("enchaîne 10 manches sans retirer de vie ni terminer avant l'index 9", () => {
    const m = matchImposteur(7, 4);
    const vies = m.seats.map((s) => s.lives);
    for (let i = 0; i < IMPOSTEUR_MANCHES; i++) {
      m.openRound();
      const res = m.closeRound();
      expect(m.seats.every((s) => !s.eliminated)).toBe(true);
      expect(m.seats.map((s) => s.lives)).toEqual(vies);
      if (i < IMPOSTEUR_MANCHES - 1) expect(res.matchOver).toBe(false);
      else expect(res.matchOver).toBe(true);
    }
    expect(m.roundIdx).toBe(IMPOSTEUR_MANCHES - 1);
    expect(m.journal).toHaveLength(IMPOSTEUR_MANCHES);
  });

  it("tensionAt n'entre pas dans la durée", () => {
    expect(IMPOSTEUR_VITESSE).toBe(SPEED_CHOICES[0]);
    expect(dureeImposteur(1500)).toBe(2400);
    expect(dureeImposteur(760)).toBe(1292);
    expect(dureeImposteur(100)).toBe(IMPOSTEUR_PLANCHER_MS);
    const m = matchImposteur(1, 4);
    const shared = draftImposteur(m.seed, 0, m.regleCommune!, poolMulti(false));
    const { durationMs } = m.openRound();
    expect(durationMs).toBe(dureeImposteur(shared.durationMs));
    expect(m.tensionAt(0)).toBeGreaterThan(1);
  });
});

describe("5 pièges forcés", () => {
  it("les 5 indices forcés sont des pièges pour la règle commune, sur 20 graines", () => {
    for (let g = 1; g <= 20; g++) {
      const m = matchImposteur(g * 7919, 4);
      const rule = m.regleCommune!;
      for (const idx of IMPOSTEUR_PIEGES) {
        const shared = draftImposteur(m.seed, idx, rule, poolMulti(false));
        expect(rule.forbids(shared.want, shared.ents), `graine ${g} manche ${idx}`).toBe(true);
        const villageois = applyRule(shared, rule, m.seed);
        const imposteur = applyRule(shared, SANS_REGLE, m.seed);
        expect(villageois.trap).toBe(true);
        expect(imposteur.trap).toBe(false);
        expect(villageois.text).toBe(imposteur.text);
      }
    }
  });

  it("casser le retry fait tomber le piège forcé — dents", () => {
    let rate = 0;
    for (let g = 1; g <= 20; g++) {
      const m = matchImposteur(g * 7919, 4);
      const rule = m.regleCommune!;
      const shared = draftImposteur(m.seed, 0, rule, poolMulti(false), 1);
      if (!rule.forbids(shared.want, shared.ents)) rate++;
    }
    expect(rate).toBeGreaterThan(0);
  });
});

describe("acte live — AGI / RIEN", () => {
  it("acteDe : survive+piège et mort au temps = rien, le reste qui a bougé = agi", () => {
    expect(acteDe({ kind: "survive", trap: false })).toBe("agi");
    expect(acteDe({ kind: "survive", trap: true })).toBe("rien");
    expect(acteDe({ kind: "death", reason: MOTIFS.temps })).toBe("rien");
    expect(acteDe({ kind: "death", reason: MOTIFS.rouge })).toBe("agi");
    expect(acteDe({ kind: "death", reason: MOTIFS.sequence })).toBe("agi");
    expect(acteDe({ kind: "idle" })).toBe("rien");
  });

  it("le premier input d'un siège, et seulement celui-là, ouvre un acted", () => {
    const m = matchImposteur(1, 4);
    m.openRound();
    expect(m.encoreSansGeste("p0")).toBe(true);
    const avant = m.encoreSansGeste("p0");
    unGeste(m, "p0");
    expect(fautSignalerActe(m.imposteur, avant, m.encoreSansGeste("p0"))).toBe(true);
    const avant2 = m.encoreSansGeste("p0");
    expect(avant2).toBe(false);
    unGeste(m, "p0");
    expect(fautSignalerActe(m.imposteur, avant2, m.encoreSansGeste("p0"))).toBe(false);
  });

  it("en classique / duo, pas d'acted — le spectacle existant ne bouge pas", () => {
    const m = new MatchLogic(1, ["a", "b"]);
    m.openRound();
    const avant = m.encoreSansGeste("a");
    m.input("a", m.roundIdx, { kind: "click", ent: null, x: 0, y: 0 }, 200);
    expect(m.imposteur).toBe(false);
    expect(fautSignalerActe(m.imposteur, avant, m.encoreSansGeste("a"))).toBe(false);
  });

  it("le serveur émet t: acted au premier input — dents", () => {
    const src = readFileSync("server/index.ts", "utf8")
      .split(/\r?\n/)
      .filter((l) => !/^\s*\/\//.test(l))
      .join("\n");
    expect(src).toMatch(/broadcast\(\s*room,\s*\{\s*t:\s*"acted"/);
  });

  it("le message acted ne porte ni reason, ni trap, ni coordonnées", () => {
    const src = readFileSync("shared/protocol.ts", "utf8");
    const bloc = /t: "acted"; idx: number; playerId: string/.exec(src);
    expect(bloc, "le type acted a bougé").toBeTruthy();
  });
});

/** Un seul geste, scène imposteur — pas `buildMultiRound` (draftShared). */
function unGeste(m: MatchLogic, id: string): void {
  const rule = m.rulesAt(m.roundIdx).get(id)!;
  const shared = draftImposteur(m.seed, m.roundIdx, m.regleCommune!, poolMulti(false));
  const round = applyRule(shared, rule, m.seed);
  const step = round.steps[0];
  if (!step) {
    m.input(id, m.roundIdx, { kind: "click", ent: null, x: 0, y: 0 }, 200);
    return;
  }
  if (step.kind === "click") {
    const ent = round.ents[step.idx]!;
    m.input(id, m.roundIdx, { kind: "click", ent, x: ent.x, y: ent.y }, 200);
    return;
  }
  if (step.kind === "key") {
    m.input(id, m.roundIdx, { kind: "key", key: step.key }, 200);
    return;
  }
  m.input(id, m.roundIdx, { kind: "click", ent: round.ents[0] ?? null, x: 900, y: 10 }, 200);
}
