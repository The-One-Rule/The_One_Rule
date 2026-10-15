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
  issueDuVote,
  peutLancerImposteur,
  refuseZoneAuRendu,
  renduObserve,
  roundObserve,
  SANS_REGLE,
} from "../src/engine/imposteur";
import { applyRule, poolMulti } from "../src/engine/multiround";
import { ONE_RULES } from "../src/engine/rules";
import { MOTIFS } from "../src/engine/motifs";
import { VERSION_CONTENU } from "../src/engine/version";
import { FORCED_TRAP_ROUNDS } from "../src/engine/difficulty";
import { pageHtml } from "./helpers/page";

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
  it("VERSION_CONTENU suit la courbe du playtest 247", () => {
    // Origin a redescendu windowMs (1500 → 4000). Ce n'est plus hdblrb.
    // `1h63n7k` depuis l'ouverture au solo du double appui, de MAINTENIR et GLISSER
    // (directive de Pierre) : les records d'entraînement repartent d'une clé neuve.
    // `bi44iq` depuis le catalogue 3 (01/10) : sans « NE FAIS RIEN », jamais deux
    // pièges d'affilée — nouvelle clé, coût annoncé à Pierre.
    expect(VERSION_CONTENU).toBe("bi44iq");
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
    let last: ReturnType<MatchLogic["closeRound"]> | null = null;
    for (let i = 0; i < IMPOSTEUR_MANCHES; i++) {
      m.openRound();
      last = m.closeRound();
      expect(m.seats.every((s) => !s.eliminated)).toBe(true);
      expect(m.seats.map((s) => s.lives)).toEqual(vies);
      if (i < IMPOSTEUR_MANCHES - 1) expect(last.matchOver).toBe(false);
      else expect(last.matchOver).toBe(true);
    }
    expect(m.roundIdx).toBe(IMPOSTEUR_MANCHES - 1);
    expect(m.journal).toHaveLength(IMPOSTEUR_MANCHES);
    expect(last!.winnerId).toBeNull();
  });

  it("tensionAt n'entre pas dans la durée", () => {
    expect(IMPOSTEUR_VITESSE).toBe(SPEED_CHOICES[0]);
    expect(dureeImposteur(1500)).toBe(2550);
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

describe("journal — une entrée par manche, sièges seulement", () => {
  it("chaque tour porte idx, aAgit, outcome — pas de coordonnées, pas d'imposteurId", () => {
    const m = matchImposteur(11, 4);
    m.openRound();
    unGeste(m, "p0");
    m.closeRound();
    expect(m.journal).toHaveLength(1);
    const tour = m.journal[0]!;
    expect(tour.idx).toBe(0);
    expect(Object.keys(tour.sieges).sort()).toEqual(["p0", "p1", "p2", "p3"]);
    expect(tour.sieges.p0!.aAgit).toBe(true);
    expect(tour.sieges.p1!.aAgit).toBe(false);
    expect(Object.keys(tour.sieges.p0!).sort()).toEqual(["aAgit", "outcome"]);
    const json = JSON.stringify(m.journalPublic());
    expect(json).not.toMatch(/imposteurId/);
    expect(json).not.toMatch(/sansRegle/);
    expect(json).not.toMatch(/"ents"/);
    expect(json).not.toMatch(/"ox"/);
  });

  it("aAgit suit firstInputMs, et le repli acteDe si le siège n'avait pas d'état", () => {
    const m = matchImposteur(3, 4);
    m.setAway("p3", true);
    m.openRound();
    unGeste(m, "p1");
    m.closeRound();
    expect(m.journal[0]!.sieges.p1!.aAgit).toBe(true);
    expect(m.journal[0]!.sieges.p3!.aAgit).toBe(false);
    expect(m.journal[0]!.sieges.p3!.outcome.kind).toBe("idle");
  });

  it("le journal public ne distingue pas l'imposteur", () => {
    const m = matchImposteur(5, 4);
    m.openRound();
    m.closeRound();
    const ids = Object.keys(m.journalPublic()[0]!.sieges);
    expect(ids).toContain(m.imposteurId!);
    expect(ids).toHaveLength(4);
  });
});

describe("observation — zone et transform coupés", () => {
  it("renduObserve ne passe pas rule.zone au renderer", () => {
    const gaucher = ONE_RULES.find((r) => r.id === "gaucher")!;
    expect(gaucher.zone, "LE GAUCHER doit porter une zone").toBeTruthy();
    const round = roundObserve(1, 0, gaucher);
    const state = renduObserve(round);
    refuseZoneAuRendu(state);
    expect(state.rule).toBeNull();
  });

  it("tombe si la zone est passée — dents", () => {
    const gaucher = ONE_RULES.find((r) => r.id === "gaucher")!;
    expect(() => refuseZoneAuRendu({ rule: gaucher })).toThrow(/zone/);
  });

  it("tombe si un transform est passé — dents", () => {
    const jumeau = ONE_RULES.find((r) => r.id === "jumeau")!;
    expect(typeof jumeau.transform).toBe("function");
    expect(() => refuseZoneAuRendu({ rule: jumeau })).toThrow(/transform/);
  });

  it("roundObserve n'applique pas transform", () => {
    const acc = ONE_RULES.find((r) => r.id === "acceleration")!;
    const shared = draftImposteur(1, 1, acc, poolMulti(false));
    const coupe = roundObserve(1, 1, acc, poolMulti(false));
    const deforme = applyRule(shared, acc, 1);
    expect(coupe.durationMs).toBe(shared.durationMs);
    expect(deforme.durationMs).toBe(Math.round(shared.durationMs * 0.7));
  });

  it("LES ANGLES non plus : zone coupée, scène reconstruite", () => {
    const angles = ONE_RULES.find((r) => r.id === "angles")!;
    expect(angles.zone?.length).toBe(4);
    refuseZoneAuRendu(renduObserve(roundObserve(2, 4, angles)));
  });

  it("le client d'observation appelle renduObserve, pas match.rule", () => {
    const src = readFileSync("src/multi.ts", "utf8");
    expect(src).toMatch(/renduObserve\(match\.round\)/);
    expect(src).toMatch(/match\.phase === "observe"/);
  });

  it("l'overlay est hors flux dans #stage — #cv ne change pas de géométrie", () => {
    const html = pageHtml();
    const iCv = html.indexOf('id="cv"');
    const iObs = html.indexOf('id="observe"');
    const iStage = html.indexOf("</main>");
    expect(iCv).toBeGreaterThan(0);
    expect(iObs).toBeGreaterThan(iCv);
    expect(iStage).toBeGreaterThan(iObs);
    const css = readFileSync("src/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.observe\s*\{[^}]*position:\s*absolute/);
    expect(css).toMatch(/\.observe\s*\{[^}]*pointer-events:\s*none/);
    expect(css).toMatch(/\.observe__vote\.hidden/);
    expect(css).toMatch(/\.observe__vote\s*>\s*button[^}]*pointer-events:\s*auto/);
    const obs = html.slice(html.indexOf('id="observe"'), html.indexOf("</main>"));
    expect(obs).not.toMatch(/<select/);
    expect(obs).not.toMatch(/<input/);
    expect(obs).toMatch(/id="btnObserveVote"/);
    expect(html).toContain('id="optDuo"');
    expect(html).not.toMatch(/id="observe"[\s\S]{0,800}ONE_RULES|id="observe"[\s\S]{0,800}carnet/);
  });
});

describe("fil — journal une fois, pas dans le verdict, pas de match_end", () => {
  it("PROTOCOL_VERSION reste à 1 après l'ajout des messages", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it("le type verdict ne porte pas le journal", () => {
    const src = readFileSync("shared/protocol.ts", "utf8");
    const verdict = src.slice(src.indexOf('t: "verdict"'), src.indexOf('t: "match_end"'));
    expect(verdict).not.toMatch(/tours/);
    expect(src).toMatch(/t: "journal"; tours: TourJournal\[\]/);
    expect(src).toMatch(/t: "observe"/);
  });

  it("après les 10 manches le serveur ouvre observe, pas match_end", () => {
    const src = readFileSync("server/index.ts", "utf8");
    const close = src.slice(src.indexOf("function closeRound"), src.indexOf("Connexions"));
    const iImp = close.search(/over && match\.imposteur/);
    const iJournal = close.search(/t:\s*"journal"/);
    const iObserve = close.search(/t:\s*"observe"/);
    const iEnd = close.search(/t:\s*"match_end"/);
    expect(iImp).toBeGreaterThan(0);
    expect(iJournal).toBeGreaterThan(iImp);
    expect(iObserve).toBeGreaterThan(iJournal);
    expect(iEnd).toBeGreaterThan(iObserve);
    expect(close).toMatch(/journalPublic\(\)/);
  });

  it("le chat du salon s'ouvre pendant l'observation — pas un second chat", () => {
    const src = readFileSync("src/multi.ts", "utf8");
    expect(src).toMatch(/enObservation\(\)/);
    expect(src).toMatch(/screenOpen\(\) \|\| enObservation\(\)/);
    expect(pageHtml().match(/id="chat"/g)?.length).toBe(1);
  });
});

describe("un seul vote", () => {
  const sieges = ["a", "b", "c", "d"] as const;

  it("majorité STRICTE : 2 voix sur 4 ne suffisent pas — dents pour un >=", () => {
    const voix = new Map([
      ["a", "d"],
      ["b", "d"],
    ]);
    const r = issueDuVote(voix, sieges, "d");
    expect(r.vainqueur).toBe("imposteur");
    expect(r.accuseId).toBeNull();
  });

  it("3 voix sur 4 pour l'imposteur → village", () => {
    const voix = new Map([
      ["a", "d"],
      ["b", "d"],
      ["c", "d"],
    ]);
    const r = issueDuVote(voix, sieges, "d");
    expect(r.vainqueur).toBe("village");
    expect(r.accuseId).toBe("d");
  });

  it("3 voix sur 4 pour un villageois → imposteur (mauvais accusé)", () => {
    const voix = new Map([
      ["a", "b"],
      ["c", "b"],
      ["d", "b"],
    ]);
    const r = issueDuVote(voix, sieges, "d");
    expect(r.vainqueur).toBe("imposteur");
    expect(r.accuseId).toBe("b");
  });

  it("personne n'a voté, égalité, voix hors sièges → imposteur", () => {
    expect(issueDuVote(new Map(), sieges, "d").vainqueur).toBe("imposteur");
    const egal = new Map([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(issueDuVote(egal, sieges, "d").accuseId).toBeNull();
    const hors = new Map([["a", "zzz"]]);
    expect(issueDuVote(hors, sieges, "d").vainqueur).toBe("imposteur");
  });

  it("poserVote ignore spectateur, inconnu, second vote — silence", () => {
    const m = matchImposteur(4, 4);
    for (let i = 0; i < IMPOSTEUR_MANCHES; i++) {
      m.openRound();
      m.closeRound();
    }
    expect(m.poserVote("spectateur", "p0")).toEqual({ ignore: true });
    expect(m.poserVote("p0", "zzz")).toEqual({ ignore: true });
    const premier = m.poserVote("p0", "p1");
    expect(premier.ignore).toBe(false);
    if (premier.ignore) return;
    expect(premier.issue).toBeNull();
    expect(m.poserVote("p0", "p2")).toEqual({ ignore: true });
  });

  it("3 voix pour l'imposteur ferment sans attendre la 4e", () => {
    const m = matchImposteur(8, 4);
    for (let i = 0; i < IMPOSTEUR_MANCHES; i++) {
      m.openRound();
      m.closeRound();
    }
    const cible = m.imposteurId!;
    const villageois = m.seats.map((s) => s.id).filter((id) => id !== cible);
    const v0 = m.poserVote(villageois[0]!, cible);
    const v1 = m.poserVote(villageois[1]!, cible);
    expect(v0.ignore).toBe(false);
    expect(v1.ignore).toBe(false);
    if (v0.ignore || v1.ignore) return;
    expect(v0.issue).toBeNull();
    expect(v1.issue).toBeNull();
    const clos = m.poserVote(villageois[2]!, cible);
    expect(clos.ignore).toBe(false);
    if (clos.ignore) return;
    expect(clos.issue?.vainqueur).toBe("village");
    expect(clos.issue?.accuseId).toBe(cible);
    expect(m.poserVote(cible, villageois[0]!)).toEqual({ ignore: true });
  });

  it("⚠️ un votant qui part ne bloque plus le vote : ceux qui restent ont voté, il se clôt", () => {
    // Audit C3 : seul `poserVote` clôturait, donc un départ après un vote
    // partagé laissait le match posé pour toujours (`in_match` à tout).
    const m = matchImposteur(4, 4);
    for (let i = 0; i < IMPOSTEUR_MANCHES; i++) {
      m.openRound();
      m.closeRound();
    }
    const [a, b, c, d] = m.seats.map((s) => s.id) as [string, string, string, string];
    m.poserVote(a, b);
    m.poserVote(b, c);
    m.poserVote(c, a); // partagé : pas de majorité, d n'a pas voté
    expect(m.enObservation()).toBe(true);
    // d quitte le salon : les trois présents ont voté.
    const issue = m.clotureSansAttendre([a, b, c]);
    expect(issue).not.toBeNull();
    expect(m.enObservation()).toBe(false);
    expect(m.clotureSansAttendre([a, b, c]), "on ne clôt qu'une fois").toBeNull();
    void d;
  });

  it("⚠️ la borne de temps clôt un vote où quelqu'un n'a jamais voté", () => {
    const m = matchImposteur(4, 4);
    for (let i = 0; i < IMPOSTEUR_MANCHES; i++) {
      m.openRound();
      m.closeRound();
    }
    const ids = m.seats.map((s) => s.id);
    m.poserVote(ids[0]!, ids[1]!);
    expect(m.clotureSansAttendre(ids), "sans force, on attend encore").toBeNull();
    expect(m.clotureSansAttendre(ids, true)).not.toBeNull();
    expect(m.enObservation()).toBe(false);
  });

  it("une coupure n'est pas un aveu : le siège away reste accusable", () => {
    const m = matchImposteur(2, 4);
    for (let i = 0; i < IMPOSTEUR_MANCHES; i++) {
      m.openRound();
      m.closeRound();
    }
    m.setAway("p3", true);
    const clos = m.poserVote("p0", "p3");
    expect(clos.ignore).toBe(false);
    expect(m.seats.some((s) => s.id === "p3")).toBe(true);
  });

  it("le lancement imposteur est borné [4, 8] — UI et serveur, même fonction", () => {
    expect(peutLancerImposteur(3)).toBe(false);
    expect(peutLancerImposteur(4)).toBe(true);
    expect(peutLancerImposteur(8)).toBe(true);
    expect(peutLancerImposteur(9)).toBe(false);
  });

  it("FORCED_TRAP_ROUNDS du run du jour n'a pas bougé", () => {
    expect([...FORCED_TRAP_ROUNDS].sort((a, b) => a - b)).toEqual([2, 5, 9]);
    expect([...IMPOSTEUR_PIEGES].sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 8]);
  });

  it("le fil porte vote puis vote_result, PROTOCOL_VERSION reste à 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
    const proto = readFileSync("shared/protocol.ts", "utf8");
    expect(proto).toMatch(/t: "vote"; playerId: string/);
    expect(proto).toMatch(/t: "vote_result"/);
    const srv = readFileSync("server/index.ts", "utf8");
    expect(srv).toMatch(/case "vote"/);
    expect(srv).toMatch(/function clotureVote/);
    const iEnd = srv.indexOf("function clotureVote");
    const cloture = srv.slice(iEnd, srv.indexOf("Connexions", iEnd));
    expect(cloture.search(/t:\s*"vote_result"/)).toBeGreaterThan(0);
    expect(cloture.search(/t:\s*"match_end"/)).toBeGreaterThan(cloture.search(/t:\s*"vote_result"/));
  });

  it("CONFIRMER n'est pas écrit en textContent — il porte data-i18n", () => {
    const src = readFileSync("src/multi.ts", "utf8");
    expect(src).not.toMatch(/btnObserveVote[\s\S]{0,80}textContent\s*=/);
    expect(src).not.toMatch(/\$\("btnObserveVote"\)[\s\S]{0,40}textContent/);
  });
});

