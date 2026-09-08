/**
 * Mode coop — une vague, plusieurs clics, une vie commune.
 *
 * Ce n'est PAS un DUO à N. DUO réutilise MatchLogic ; le coop a sa propre
 * classe parce que `input()` fige le siège dès qu'un outcome existe.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  PROTOCOL_VERSION,
  CURSOR_COOLDOWN_MS,
  sanitizeSettings,
} from "../shared/protocol";
import { MatchCoop } from "../server/coop";
import {
  attribueReglesCoop,
  borneCurseur,
  dureeVague,
  jugerClic,
  needDe,
  peutLancerCoop,
  poolCoop,
  roundCoop,
  viesInitialesCoop,
  COOP_MAX_ASIS,
  COOP_MIN_JOUEURS,
  COOP_RASSEMBLEMENT_MS,
  COOP_VAGUE_MAX,
  COOP_VAGUE_MIN,
} from "../src/engine/coop";
import { ONE_RULES } from "../src/engine/rules";
import { VERSION_CONTENU } from "../src/engine/version";
import { COLOR_IDS, FIELD_H, FIELD_W } from "../src/engine/types";
import { colorHex, NEED_BADGE } from "../src/render/scene";
import { GLYPH_COLORS } from "../src/net/glyph";
import type { Action, Entity, OneRule } from "../src/engine/types";

const QUATRE = ["a", "b", "c", "d"];

const coop = (seed = 7, ids = QUATRE) => {
  const m = new MatchCoop(seed, ids);
  m.openVague();
  return m;
};

function pred(
  m: MatchCoop,
  id: string,
  interdit: boolean,
): (e: Entity) => boolean {
  const rule = m.regleDe(id);
  if (!rule) throw new Error("sans règle");
  return (e) => {
    const visibles = m.ents.filter((x) => !m.consumed.has(x.idx));
    const a: Action = { kind: "click", ent: e, x: e.x, y: e.y };
    const v = jugerClic(rule, a, visibles, 400, m.durationMs);
    return interdit ? v === "interdit" : v === "licite";
  };
}

function clic(
  m: MatchCoop,
  id: string,
  interdit: boolean,
  elapsed = 400,
) {
  const cible = m.ents.filter((e) => !m.consumed.has(e.idx)).find((e) => {
    if (!pred(m, id, interdit)(e)) return false;
    // Les tests d'un clic isolé visent need=1 : need=2 n'est pas un pris immédiat.
    if (!interdit && needDe(m.seed, m.roundIdx, e.idx) !== 1) return false;
    return true;
  });
  if (!cible) throw new Error(interdit ? "pas d'interdit" : "pas de licite need=1");
  return m.inputCoop(
    id,
    m.roundIdx,
    { kind: "click", ent: cible, x: cible.x, y: cible.y },
    elapsed,
  );
}

function clicSur(m: MatchCoop, id: string, e: Entity, elapsed: number) {
  return m.inputCoop(
    id,
    m.roundIdx,
    { kind: "click", ent: e, x: e.x, y: e.y },
    elapsed,
  );
}

function trouveCible(
  m: MatchCoop,
  need: 1 | 2 | 3,
  licites: readonly string[],
  interditId?: string,
): Entity | undefined {
  return m.ents.find((e) => {
    if (m.consumed.has(e.idx)) return false;
    if (needDe(m.seed, m.roundIdx, e.idx) !== need) return false;
    if (!licites.every((id) => pred(m, id, false)(e))) return false;
    if (interditId && !pred(m, interditId, true)(e)) return false;
    return true;
  });
}

function matchAvecCible(
  need: 1 | 2 | 3,
  licites: readonly string[],
  interditId?: string,
): { m: MatchCoop; e: Entity } {
  for (let seed = 0; seed < 400; seed++) {
    const m = coop(seed);
    const e = trouveCible(m, need, licites, interditId);
    if (e) return { m, e };
  }
  throw new Error(
    `aucune cible need=${need} licites=${licites.join(",")} interdit=${interditId ?? "—"}`,
  );
}

describe("invariants du lot", () => {
  it("VERSION_CONTENU ne bouge pas", () => {
    expect(VERSION_CONTENU).toBe("5m4fgw");
  });

  it("PROTOCOL_VERSION reste à 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it("aucune 17e règle, pas de sansRegle", () => {
    expect(ONE_RULES).toHaveLength(16);
    expect(ONE_RULES.some((r) => r.id === "sansRegle")).toBe(false);
  });

  it("version.ts n'importe pas le module coop", () => {
    const src = readFileSync("src/engine/version.ts", "utf8");
    expect(src).not.toMatch(/coop/);
  });

  it("MatchLogic.input fige toujours le siège — le coop ne s'y branche pas", () => {
    const match = readFileSync("server/match.ts", "utf8");
    expect(match).toMatch(/if\s*\(\s*!st\s*\|\|\s*st\.outcome\s*\)\s*return null/);
    expect(match).not.toMatch(/coop/);
    expect(match).not.toMatch(/mode === ["']coop["']/);
    const input = match.slice(match.indexOf("input("), match.indexOf("encoreSansGeste"));
    expect(input).not.toMatch(/coop/);
  });
});

describe("sanitizeSettings — coop exclusif", () => {
  it("mode coop force duo à false, et les deux ne se cumulent jamais", () => {
    const s = sanitizeSettings({ mode: "coop", duo: true });
    expect(s.mode).toBe("coop");
    expect(s.duo).toBe(false);
  });

  it("un client ancien qui n'envoie que { duo: true } reste en duo", () => {
    const s = sanitizeSettings({ duo: true });
    expect(s.mode).toBe("duo");
    expect(s.duo).toBe(true);
  });

  it("coop et imposteur ne se cumulent pas : le mode posé gagne", () => {
    expect(sanitizeSettings({ mode: "coop", duo: false }).mode).toBe("coop");
    expect(sanitizeSettings({ mode: "imposteur" }).mode).toBe("imposteur");
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS }).mode).toBe("classique");
  });
});

describe("pool et attribution publiques", () => {
  it("exclut voyelle, mainGauche, seconde et les déformations", () => {
    const ids = poolCoop().map((r) => r.id);
    expect(ids).not.toContain("voyelle");
    expect(ids).not.toContain("mainGauche");
    expect(ids).not.toContain("seconde");
    expect(ids).not.toContain("jumeau");
    expect(ids).not.toContain("menteur");
    expect(ids).not.toContain("eclair");
    expect(ids).not.toContain("acceleration");
    expect(ids).not.toContain("daltonien");
    expect(poolCoop().every((r) => r.traps)).toBe(true);
    expect(poolCoop().every((r) => !r.transform)).toBe(true);
    expect(poolCoop().length).toBeGreaterThanOrEqual(COOP_MAX_ASIS);
  });

  it("chaque siège reçoit une règle DIFFÉRENTE, et elle est publique", () => {
    const rules = attribueReglesCoop(42, QUATRE);
    const ids = [...rules.values()].map((r) => r.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    const m = coop(42);
    const pub = Object.values(m.reglesPubliques());
    expect(pub).toHaveLength(4);
    expect(new Set(pub).size).toBe(4);
    expect(pub.every((id) => id && id !== "sansRegle")).toBe(true);
  });

  it("peutLancerCoop : [4, 6], le 7e est spectateur", () => {
    expect(peutLancerCoop(3)).toBe(false);
    expect(peutLancerCoop(COOP_MIN_JOUEURS)).toBe(true);
    expect(peutLancerCoop(COOP_MAX_ASIS)).toBe(true);
    expect(peutLancerCoop(7)).toBe(false);
  });
});

describe("scène commune, pas un piège solo", () => {
  it("roundCoop ne pose pas trap et ne déforme pas", () => {
    const r = roundCoop(3, 0);
    expect(r.trap).toBe(false);
    expect(r.falseText).toBeUndefined();
    expect(r.hideTextAtMs).toBeUndefined();
    expect(r.ents.length).toBe(15);
  });

  it("la durée d'une vague reste dans [20000, 40000]", () => {
    for (let s = 0; s < 40; s++) {
      for (let i = 0; i < 8; i++) {
        const d = dureeVague(s * 17 + 3, i);
        expect(d).toBeGreaterThanOrEqual(COOP_VAGUE_MIN);
        expect(d).toBeLessThanOrEqual(COOP_VAGUE_MAX);
      }
    }
  });
});

describe("MatchCoop — vie, score, plusieurs clics", () => {
  it("un clic qui enfreint SA règle retire 1 vie, l'entité RESTE", () => {
    const m = coop(11);
    const vies = m.vies;
    const score = m.score;
    const r = clic(m, "a", true);
    expect(r?.kind).toBe("interdit");
    expect(m.vies).toBe(vies - 1);
    expect(m.score).toBe(score);
    expect(m.consumed.size).toBe(0);
    expect(m.entityOf("a", r!.i)).not.toBeNull();
  });

  it("un clic licite : +1 score, l'entité disparaît", () => {
    const m = coop(11);
    const r = clic(m, "a", false);
    expect(r?.kind).toBe("pris");
    expect(m.score).toBe(1);
    expect(m.consumed.has(r!.i)).toBe(true);
    expect(m.entityOf("a", r!.i)).toBeNull();
  });

  it("deux clics du même joueur dans la même vague sont acceptés", () => {
    const m = coop(11);
    const premier = clic(m, "a", false);
    const second = clic(m, "a", false);
    expect(premier?.kind).toBe("pris");
    expect(second?.kind).toBe("pris");
    expect(second!.i).not.toBe(premier!.i);
    expect(m.score).toBe(2);
  });

  it("un clic dans le vide est ignoré — pas une mort", () => {
    const m = coop(11);
    const vies = m.vies;
    const r = m.inputCoop(
      "a",
      m.roundIdx,
      { kind: "click", ent: null, x: Number.NaN, y: Number.NaN },
      400,
    );
    expect(r).toBeNull();
    expect(m.vies).toBe(vies);
    expect(m.score).toBe(0);
  });

  it("la vie initiale est 3 × le nombre de joueurs", () => {
    expect(viesInitialesCoop(4)).toBe(12);
    expect(viesInitialesCoop(6)).toBe(18);
    expect(coop(1, QUATRE).vies).toBe(12);
  });

  it("LA ROUE interdit les ronds, elle n'autorise PAS uniquement les ronds", () => {
    let seed = 0;
    let rule: OneRule | undefined;
    for (; seed < 80; seed++) {
      const porteur = [...attribueReglesCoop(seed, QUATRE).values()].find((r) => r.id === "roue");
      if (porteur) {
        rule = porteur;
        break;
      }
    }
    expect(rule, "aucune graine n'a donné LA ROUE en 80 essais").toBeTruthy();
    const m = coop(seed);
    const rond = m.ents.find((e) => e.shape === "rond");
    const autre = m.ents.find((e) => e.shape !== "rond");
    expect(rond && autre).toBeTruthy();
    expect(
      jugerClic(
        rule!,
        { kind: "click", ent: rond!, x: rond!.x, y: rond!.y },
        m.ents,
        400,
        m.durationMs,
      ),
    ).toBe("interdit");
    expect(
      jugerClic(
        rule!,
        { kind: "click", ent: autre!, x: autre!.x, y: autre!.y },
        m.ents,
        400,
        m.durationMs,
      ),
    ).toBe("licite");
  });
});

describe("HUD hors flux", () => {
  it("le HUD coop est hors flux dans #stage — #cv ne change pas de géométrie", () => {
    const html = readFileSync("index.html", "utf8");
    const iCv = html.indexOf('id="cv"');
    const iHud = html.indexOf('id="coophud"');
    const iStage = html.indexOf("</main>");
    expect(iCv).toBeGreaterThan(0);
    expect(iHud).toBeGreaterThan(iCv);
    expect(iStage).toBeGreaterThan(iHud);
    const css = readFileSync("src/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.coophud\s*\{[^}]*position:\s*absolute/);
    expect(css).toMatch(/\.coophud\s*\{[^}]*pointer-events:\s*none/);
    expect(css).toMatch(/\.coophud\.hidden/);
    const hud = html.slice(html.indexOf('id="coophud"'), html.indexOf("</main>"));
    expect(hud).toMatch(/data-i18n="coop\.vies"/);
    expect(hud).toMatch(/data-i18n="coop\.score"/);
    expect(hud).toMatch(/id="coopViesVal"/);
    expect(hud).toMatch(/id="coopScoreVal"/);
  });
});

describe("need — second signe, pas une teinte de pièce", () => {
  it("needDe est borné à 3, majorité 1, quelques 2, rare 3", () => {
    const counts = { 1: 0, 2: 0, 3: 0 };
    let total = 0;
    for (let s = 0; s < 80; s++) {
      for (let v = 0; v < 8; v++) {
        for (let i = 0; i < 15; i++) {
          const n = needDe(s * 19 + 3, v, i);
          expect(n === 1 || n === 2 || n === 3).toBe(true);
          counts[n]++;
          total++;
        }
      }
    }
    expect(counts[1]).toBeGreaterThan(counts[2]);
    expect(counts[2]).toBeGreaterThan(counts[3]);
    expect(counts[3]).toBeGreaterThan(0);
    expect(counts[1] / total).toBeGreaterThan(0.55);
  });

  it("le need vit à côté de la scène — Entity n'en porte pas, place() est appelé tel quel", () => {
    const src = readFileSync("src/engine/coop.ts", "utf8");
    expect(src).toMatch(/place\(rng, rShuffle\(rng, specs\)/);
    expect(src).toMatch(/needsDeVague\(seed, idx, ents\)/);
    const types = readFileSync("src/engine/types.ts", "utf8");
    const ent = types.slice(types.indexOf("export interface Entity"), types.indexOf("/* ------------------------------------------------------------------"));
    expect(ent).not.toMatch(/\bneed\b/);
  });

  it("COOP_RASSEMBLEMENT_MS vaut 400", () => {
    expect(COOP_RASSEMBLEMENT_MS).toBe(400);
  });
});

describe("rassemblement — le serveur compte les sièges DISTINCTS", () => {
  it("deux clics licites dans la fenêtre sur need=2 → +2, consumed", () => {
    const { m, e } = matchAvecCible(2, ["a", "b"]);
    const r1 = clicSur(m, "a", e, 200);
    expect(r1?.kind).toBe("charge");
    if (r1?.kind === "charge") {
      expect(r1.n).toBe(1);
      expect(r1.need).toBe(2);
    }
    expect(m.consumed.has(e.idx)).toBe(false);
    const r2 = clicSur(m, "b", e, 350);
    expect(r2?.kind).toBe("pris");
    expect(m.score).toBe(2);
    expect(m.consumed.has(e.idx)).toBe(true);
    expect(m.entityOf("a", e.idx)).toBeNull();
  });

  it("un seul clic, 400 ms → rien, entité encore là", () => {
    const { m, e } = matchAvecCible(2, ["a", "b"]);
    const r1 = clicSur(m, "a", e, 100);
    expect(r1?.kind).toBe("charge");
    expect(m.cloreCharge(e.idx, 100 + COOP_RASSEMBLEMENT_MS - 1)).toBeNull();
    expect(m.consumed.has(e.idx)).toBe(false);
    const fin = m.cloreCharge(e.idx, 100 + COOP_RASSEMBLEMENT_MS);
    expect(fin?.kind).toBe("rate");
    expect(m.score).toBe(0);
    expect(m.consumed.has(e.idx)).toBe(false);
    expect(m.entityOf("a", e.idx)).not.toBeNull();
  });

  it("un licite + un interdit → −1 vie, pas de point", () => {
    const { m, e } = matchAvecCible(2, ["a"], "b");
    const vies = m.vies;
    const r1 = clicSur(m, "a", e, 100);
    expect(r1?.kind).toBe("charge");
    const r2 = clicSur(m, "b", e, 180);
    expect(r2?.kind).toBe("interdit");
    expect(m.vies).toBe(vies - 1);
    expect(m.score).toBe(0);
    expect(m.consumed.has(e.idx)).toBe(false);
    const fin = m.cloreCharge(e.idx, 100 + COOP_RASSEMBLEMENT_MS);
    expect(fin?.kind).toBe("rate");
    expect(m.score).toBe(0);
    expect(m.vies).toBe(vies - 1);
    expect(m.consumed.has(e.idx)).toBe(false);
  });

  it("deux clics du même siège ne comptent qu'une fois", () => {
    const { m, e } = matchAvecCible(2, ["a", "b"]);
    expect(clicSur(m, "a", e, 100)?.kind).toBe("charge");
    expect(clicSur(m, "a", e, 150)).toBeNull();
    expect(m.cloreCharge(e.idx, 100 + COOP_RASSEMBLEMENT_MS)?.kind).toBe("rate");
    expect(m.consumed.has(e.idx)).toBe(false);
  });

  it("le message charge n'entre pas dans un verdict — PROTOCOL_VERSION reste à 1", () => {
    const src = readFileSync("shared/protocol.ts", "utf8");
    expect(src).toMatch(/t: "charge"; i: number; n: number; need: number/);
    expect(src).toMatch(/N'entre JAMAIS dans un verdict/);
    expect(PROTOCOL_VERSION).toBe(1);
  });
});

describe("badge need — hors palette jouable", () => {
  it("colorHex des 4 teintes est inchangé", () => {
    expect(colorHex("garance")).toBe("#F74058");
    expect(colorHex("azur")).toBe("#237EF6");
    expect(colorHex("jade")).toBe("#40F7C0");
    expect(colorHex("ambre")).toBe("#F5B214");
  });

  it("le badge n'utilise aucune des 4 clés ColorId", () => {
    const src = readFileSync("src/render/scene.ts", "utf8");
    const start = src.indexOf("export function drawNeedBadge");
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf("/** Hitbox", start);
    const body = src.slice(start, end);
    expect(body).not.toMatch(/garance|azur|jade|ambre/);
    expect(body).not.toMatch(/HEX|colorHex|ColorId/);
    for (const id of COLOR_IDS) {
      expect(Object.values(NEED_BADGE), id).not.toContain(colorHex(id));
    }
  });
});

describe("curseurs — canal hors verdict", () => {
  it("PROTOCOL_VERSION reste à 1, cursor n'est pas un input", () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(CURSOR_COOLDOWN_MS).toBe(50);
    const proto = readFileSync("shared/protocol.ts", "utf8");
    expect(proto).toMatch(/t: "cursor"; x: number; y: number/);
    expect(proto).toMatch(/t: "cursors"; at: number; pos:/);
    expect(proto).toMatch(/N'entre JAMAIS dans un verdict/);
    expect(proto).toMatch(/CE N'EST PAS un `t: "input"`/);
  });

  it("le verdict coop ne lit jamais le curseur", () => {
    const index = readFileSync("server/index.ts", "utf8");
    const coop = readFileSync("server/coop.ts", "utf8");
    const debut = index.indexOf("if (room.coop)");
    const fin = index.indexOf("const match = room.match;", debut);
    const branche = index.slice(debut, fin);
    expect(branche).toMatch(/x: entC \? entC\.x/);
    expect(branche).toMatch(/y: entC \? entC\.y/);
    expect(branche).not.toMatch(/cursorPos|lastCursor|msg\.x|msg\.y/);
    expect(coop).not.toMatch(/cursor/i);
    expect(coop).toMatch(/x: cible\.x,\s*y: cible\.y/);
    expect(index).toMatch(/Jamais lu par inputCoop/);
  });

  it("borneCurseur cale dans le champ et refuse le non-nombre", () => {
    expect(borneCurseur(0, 0)).toEqual({ x: 0, y: 0 });
    expect(borneCurseur(FIELD_W + 50, -10)).toEqual({ x: FIELD_W, y: 0 });
    expect(borneCurseur(-1, FIELD_H + 10)).toEqual({ x: 0, y: FIELD_H });
    expect(borneCurseur("nope", 1)).toBeNull();
    expect(borneCurseur(Number.NaN, 10)).toBeNull();
  });

  it("HIT global reste à 1.22 — pas d'élargissement du solo", () => {
    const src = readFileSync("src/render/scene.ts", "utf8");
    expect(src).toMatch(/const HIT = 1\.22/);
  });

  it("le calque est hors flux, pointer-events none, 6 sièges", () => {
    const html = readFileSync("index.html", "utf8");
    const iCv = html.indexOf('id="cv"');
    const iCur = html.indexOf('id="cursors"');
    const iStage = html.indexOf("</main>");
    expect(iCur).toBeGreaterThan(iCv);
    expect(iStage).toBeGreaterThan(iCur);
    expect((html.match(/class="curseur"/g) ?? []).length).toBe(6);
    const css = readFileSync("src/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.cursors\s*\{[^}]*position:\s*absolute/);
    expect(css).toMatch(/\.cursors\s*\{[^}]*pointer-events:\s*none/);
    expect(css).toMatch(/\.cursors\.hidden/);
    const paint = readFileSync("src/render/cursors.ts", "utf8");
    expect(paint).not.toMatch(/garance|azur|jade|ambre/);
    expect(paint).toMatch(/glyphHex/);
    for (const hex of GLYPH_COLORS) {
      expect(COLOR_IDS.some((id) => colorHex(id) === hex)).toBe(false);
    }
  });
});
