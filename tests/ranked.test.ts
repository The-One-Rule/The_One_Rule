import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/engine/rng";
import { buildRound } from "../src/engine/round";
import { ONE_RULES } from "../src/engine/rules";
import { verifyRun } from "../src/engine/verify";
import type { LoggedInput, RunClaim } from "../src/engine/verify";
import { DAILY_LENGTH } from "../src/engine/difficulty";
import { analyseReactions, rankedEligibility } from "../src/ranked/antibot";
import {
  DIVISIONS,
  applyMatch,
  divisionOf,
  expectedScore,
  marginWeight,
  searchWindow,
} from "../src/ranked/elo";

/* ------------------------------------------------------------------ *
 * Un joueur simulé : rejoue la même graine et répond correctement,
 * avec un temps de réaction paramétrable.
 * ------------------------------------------------------------------ */
function playPerfectly(
  seed: number,
  ruleId: string,
  opts: { reaction: () => number; stopAt?: number; mode?: RunClaim["mode"] } = {
    reaction: () => 260,
  },
): RunClaim {
  const rule = ONE_RULES.find((r) => r.id === ruleId)!;
  const rng = mulberry32(seed);
  const inputs: LoggedInput[] = [];
  const stop = opts.stopAt ?? DAILY_LENGTH;
  let t = 0;

  for (let level = 0; level < stop; level++) {
    const round = buildRound(rng, level, rule);
    // LA SECONDE interdit d'agir avant 400 ms : un joueur correct attend
    const wait = Math.max(opts.reaction(), rule.id === "seconde" ? 430 : 0);
    const at = t + Math.min(wait, round.durationMs - 40);

    if (round.steps.length === 0) {
      t += round.durationMs; // ne rien faire : on laisse filer
      continue;
    }

    // Un joueur « parfait » obéit à la consigne SANS enfreindre la règle
    // unique. Sur une consigne libre ("clique n'importe où"), il doit donc
    // choisir une pièce que la règle autorise — exactement ce qu'un humain
    // fait, et ce que le vérificateur doit accepter.
    const allowed = (i: number, when: number): boolean =>
      rule.judge(
        { kind: "click", ent: round.ents[i]!, x: round.ents[i]!.x, y: round.ents[i]!.y },
        { round, elapsedMs: when - t },
      ) === null;

    let k = 0;
    for (const step of round.steps) {
      const when = at + k * 40;
      if (step.kind === "click") {
        inputs.push({ t: when, k: "c", i: step.idx });
      } else if (step.kind === "clickAny" || step.kind === "clickAnyExcept") {
        const ok = round.ents.findIndex(
          (e, i) => allowed(i, when) && (step.kind === "clickAny" || e.color !== step.color),
        );
        inputs.push({ t: when, k: "c", i: ok >= 0 ? ok : 0 });
      } else {
        inputs.push({ t: when, k: "k", key: (step as { key: string }).key });
      }
      k++;
    }
    t = at + (round.steps.length - 1) * 40 + 1;
  }
  return { seed, ruleId, mode: opts.mode ?? "ranked", inputs };
}

describe("vérification serveur", () => {
  it("valide un run honnête et retrouve le même score", () => {
    const claim = playPerfectly(20260812, "sang", { reaction: () => 250 });
    const v = verifyRun(claim);
    expect(v.ok).toBe(true);
    expect(v.score).toBeGreaterThan(20);
    // les manches « ne fais rien » ne produisent pas de réaction
    expect(v.reactions.length).toBeLessThanOrEqual(v.score);
    expect(v.reactions.length).toBeGreaterThan(10);
  });

  it("donne exactement le même verdict à chaque rejeu", () => {
    const claim = playPerfectly(777, "menteur", { reaction: () => 300 });
    const a = verifyRun(claim);
    const b = verifyRun(claim);
    expect(b).toEqual(a);
  });

  it("produit un score IDENTIQUE à la partie réellement jouée", async () => {
    // le rejeu serveur doit reproduire le moteur du navigateur au coup près,
    // sinon toute la validation est du théâtre
    const { Session } = await import("../src/game/session");
    const rule = ONE_RULES.find((r) => r.id === "colosse")!;
    const seed = 4242;
    const claim = playPerfectly(seed, "colosse", { reaction: () => 240, mode: "ranked" });

    const s = new Session({ mode: "ranked", rule, rng: mulberry32(seed), now: 0, seed });
    let cursor = 0;
    let clock = 0;
    for (let guard = 0; guard < 20000 && s.phase === "playing"; guard++) {
      // début de la manche courante, déduit du temps écoulé
      const roundStart = clock - s.elapsed(clock);
      const deadline = roundStart + s.round.durationMs;
      const next = claim.inputs[cursor];

      if (!next || next.t >= deadline) {
        clock = deadline;
        s.tick(clock);
        continue;
      }
      clock = next.t;
      s.tick(clock);
      if (s.phase !== "playing") break;
      cursor++;
      const ent = next.k === "c" && next.i !== null ? (s.round.ents[next.i] ?? null) : null;
      if (next.k === "c") s.input({ kind: "click", ent, x: ent?.x ?? 0, y: ent?.y ?? 0 }, clock);
      else if (next.k === "k") s.input({ kind: "key", key: next.key }, clock);
    }
    const server = verifyRun(claim);
    expect(server.score).toBe(s.level);
  });

  it("refuse un journal dont les temps reculent", () => {
    const claim = playPerfectly(5, "sang");
    claim.inputs[3]!.t = 0;
    const v = verifyRun(claim);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("monotone");
  });

  it("refuse une règle inventée", () => {
    expect(verifyRun({ seed: 1, ruleId: "dieu", mode: "ranked", inputs: [] }).ok).toBe(false);
  });

  it("refuse un journal démesuré", () => {
    const inputs = Array.from({ length: 5000 }, (_, i) => ({ t: i, k: "c" as const, i: 0 }));
    expect(verifyRun({ seed: 1, ruleId: "sang", mode: "ranked", inputs }).ok).toBe(false);
  });

  it("ne se laisse pas gonfler par un score prétendu", () => {
    // un tricheur envoie un journal court en prétendant 40 : le rejeu tranche
    const claim = playPerfectly(99, "sang", { reaction: () => 260, stopAt: 6 });
    const v = verifyRun(claim);
    expect(v.ok).toBe(true);
    expect(v.score).toBeLessThan(10);
    expect(v.cleared).toBe(false);
  });

  it("attrape un clic sur une pièce qui n'existe pas", () => {
    const claim = playPerfectly(11, "sang");
    claim.inputs[0] = { t: 300, k: "c", i: 99 };
    expect(verifyRun(claim).ok).toBe(false);
  });

  it("s'arrête au bon endroit quand le joueur enfreint la règle unique", () => {
    const v = verifyRun({
      seed: 31337,
      ruleId: "voyelle",
      mode: "training", // pas d'échauffement : la première faute est fatale
      inputs: [{ t: 300, k: "k", key: "E" }],
    });
    expect(v.ok).toBe(true);
    expect(v.cause).toBe("macro");
    expect(v.score).toBe(0);
  });

  it("applique l'échauffement au classé comme au quotidien", () => {
    // Les deux adversaires reçoivent la même graine, donc le même échauffement :
    // un misclic à la deuxième manche ne doit pas décider un match.
    const v = verifyRun({
      seed: 31337,
      ruleId: "voyelle",
      mode: "ranked",
      inputs: [{ t: 300, k: "k", key: "E" }],
    });
    expect(v.cause).not.toBe("macro");
    expect(v.score).toBeGreaterThan(0);
  });
});

describe("détection d'automatisation", () => {
  const jitter = (base: number, spread: number, n: number): number[] =>
    Array.from({ length: n }, (_, i) => base + Math.sin(i * 12.9898) * spread + (i % 7) * 4);

  it("laisse tranquille un joueur humain", () => {
    const human = [
      288, 341, 254, 402, 310, 275, 520, 298, 333, 266, 380, 291, 610, 305, 272, 349, 288, 455,
      302, 318, 264, 290,
    ];
    const r = analyseReactions(human);
    expect(r.verdict).toBe("humain");
    expect(rankedEligibility(r).countsForRating).toBe(true);
    expect(rankedEligibility(r).servableAsGhost).toBe(true);
  });

  it("épingle un script rapide et régulier", () => {
    const bot = Array.from({ length: 30 }, (_, i) => 28 + (i % 3));
    const r = analyseReactions(bot);
    expect(r.verdict).toBe("automatisé");
    expect(r.suspicion).toBeGreaterThan(0.7);
    expect(rankedEligibility(r).countsForRating).toBe(false);
  });

  it("épingle aussi un bot qui ralentit pour se cacher", () => {
    // ralentir à 300 ms ne suffit pas : c'est la régularité qui trahit,
    // et l'imiter revient à perdre l'avantage
    const sneaky = Array.from({ length: 30 }, (_, i) => 300 + (i % 2) * 3);
    const r = analyseReactions(sneaky);
    expect(r.verdict).not.toBe("humain");
    expect(r.cv).toBeLessThan(0.1);
  });

  it("ne conclut rien sur un échantillon trop court", () => {
    expect(analyseReactions([20, 22, 19]).verdict).toBe("humain");
  });

  it("tolère un joueur très rapide mais irrégulier", () => {
    const fast = jitter(215, 70, 26);
    const r = analyseReactions(fast);
    expect(r.verdict).not.toBe("automatisé");
  });
});

describe("classement", () => {
  it("récompense davantage une victoire large", () => {
    const base = { rating: 1000, games: 40, peakFloor: 900, theirRating: 1000 };
    const serré = applyMatch({ ...base, myScore: 19, theirScore: 18 });
    const large = applyMatch({ ...base, myScore: 31, theirScore: 4 });
    expect(large.delta).toBeGreaterThan(serré.delta);
    expect(serré.delta).toBeGreaterThan(0);
  });

  it("borne la marge : un score fleuve ne fait pas exploser le classement", () => {
    expect(marginWeight(60, 1)).toBeLessThanOrEqual(1.5);
    expect(marginWeight(19, 18)).toBeGreaterThanOrEqual(0.5);
  });

  it("fait bouger un débutant plus qu'un joueur installé", () => {
    const neuf = applyMatch({
      rating: 1000, games: 2, peakFloor: 0, myScore: 25, theirScore: 10, theirRating: 1000,
    });
    const vieux = applyMatch({
      rating: 1000, games: 200, peakFloor: 0, myScore: 25, theirScore: 10, theirRating: 1000,
    });
    expect(neuf.delta).toBeGreaterThan(vieux.delta);
  });

  it("ne fait jamais redescendre sous la division atteinte", () => {
    let state = { rating: 1310, games: 50, peakFloor: 1300 };
    for (let i = 0; i < 12; i++) {
      const c = applyMatch({ ...state, myScore: 3, theirScore: 30, theirRating: 1400 });
      state = { rating: c.rating, games: state.games + 1, peakFloor: c.peakFloor };
    }
    expect(state.rating).toBeGreaterThanOrEqual(1300);
    expect(divisionOf(state.rating).id).toBe("or");
  });

  it("signale une promotion au franchissement d'un palier", () => {
    const c = applyMatch({
      rating: 1090, games: 5, peakFloor: 900, myScore: 40, theirScore: 3, theirRating: 1250,
    });
    expect(c.promoted).toBe(true);
    expect(c.division.id).toBe("argent");
  });

  it("garde les divisions ordonnées et couvrantes", () => {
    for (let i = 1; i < DIVISIONS.length; i++) {
      expect(DIVISIONS[i]!.floor).toBeGreaterThan(DIVISIONS[i - 1]!.floor);
    }
    expect(divisionOf(0).id).toBe("bois");
    expect(divisionOf(99999).id).toBe("obsidienne");
  });

  it("converge vers l'écart de niveau réel", () => {
    // un joueur nettement meilleur doit finir nettement plus haut
    let a = { rating: 1000, games: 0, peakFloor: 0 };
    let b = { rating: 1000, games: 0, peakFloor: 0 };
    for (let i = 0; i < 120; i++) {
      const strong = 30 + (i % 5);
      const weak = 12 + (i % 4);
      const ca = applyMatch({ ...a, myScore: strong, theirScore: weak, theirRating: b.rating });
      const cb = applyMatch({ ...b, myScore: weak, theirScore: strong, theirRating: a.rating });
      a = { rating: ca.rating, games: a.games + 1, peakFloor: ca.peakFloor };
      b = { rating: cb.rating, games: b.games + 1, peakFloor: cb.peakFloor };
    }
    expect(a.rating - b.rating).toBeGreaterThan(250);
    expect(expectedScore(a.rating, b.rating)).toBeGreaterThan(0.75);
  });

  it("élargit la recherche avec l'attente plutôt que de laisser la file vide", () => {
    expect(searchWindow(0)).toBeLessThan(searchWindow(10_000));
    expect(searchWindow(60_000)).toBe(1200);
  });
});

/* ------------------------------------------------------------------ *
 * Bout en bout : ce que le navigateur journalise doit passer le rejeu.
 *
 * C'est le test qui compte vraiment. Un vérificateur qui refuse les runs
 * honnêtes est pire qu'un vérificateur absent : il bannit les joueurs et
 * laisse passer ceux qui savent forger un journal propre.
 * ------------------------------------------------------------------ */
describe("navigateur → serveur", () => {
  it("fait valider par le serveur un run réellement joué", async () => {
    const { Session } = await import("../src/game/session");

    for (const rule of ONE_RULES) {
      const seed = (rule.id.length * 7919 + 31) | 0;
      const s = new Session({ mode: "ranked", rule, rng: mulberry32(seed), now: 0, seed });

      let clock = 0;
      for (let guard = 0; guard < 4000 && s.phase === "playing"; guard++) {
        const roundStart = clock - s.elapsed(clock);
        const deadline = roundStart + s.round.durationMs;

        if (s.round.steps.length === 0) {
          clock = deadline; // piège ou « ne fais rien » : on laisse filer
          s.tick(clock);
          continue;
        }

        // joueur crédible : réaction variable, jamais robotique
        const react = 210 + ((guard * 37) % 190);
        const at = Math.min(roundStart + react, deadline - 30);
        clock = Math.max(clock, at);
        s.tick(clock);
        if (s.phase !== "playing") break;

        const step = s.round.steps[0]!;
        if (step.kind === "click") {
          const ent = s.round.ents[step.idx]!;
          s.input({ kind: "click", ent, x: ent.x, y: ent.y }, clock);
        } else if (step.kind === "key") {
          s.input({ kind: "key", key: (step as { key: string }).key }, clock);
        } else {
          const ent = s.round.ents[0]!;
          s.input({ kind: "click", ent, x: ent.x, y: ent.y }, clock);
        }
      }

      const server = verifyRun({ seed, ruleId: rule.id, mode: "ranked", inputs: s.log });
      expect(server.ok, `${rule.name} : run honnête rejeté`).toBe(true);
      expect(server.score, `${rule.name} : score divergent`).toBe(s.level);
      // un délai mesuré correspond forcément à une manche franchie
      expect(server.reactions.length).toBeLessThanOrEqual(server.score);
      for (const r of server.reactions) expect(r).toBeGreaterThanOrEqual(0);
    }
  });

  it("détecte un journal auquel on a ajouté des manches après coup", async () => {
    const { Session } = await import("../src/game/session");
    const rule = ONE_RULES.find((r) => r.id === "sang")!;
    const seed = 8080;
    const s = new Session({ mode: "ranked", rule, rng: mulberry32(seed), now: 0, seed });

    let clock = 0;
    for (let guard = 0; guard < 200 && s.phase === "playing"; guard++) {
      const roundStart = clock - s.elapsed(clock);
      const deadline = roundStart + s.round.durationMs;
      if (s.round.steps.length === 0) {
        clock = deadline;
        s.tick(clock);
        continue;
      }
      clock = Math.min(roundStart + 260, deadline - 30);
      s.tick(clock);
      if (s.phase !== "playing") break;
      const step = s.round.steps[0]!;
      if (step.kind === "click") {
        const ent = s.round.ents[step.idx]!;
        s.input({ kind: "click", ent, x: ent.x, y: ent.y }, clock);
      } else if (step.kind === "key") s.input({ kind: "key", key: (step as { key: string }).key }, clock);
      else s.input({ kind: "click", ent: s.round.ents[0]!, x: 0, y: 0 }, clock);
    }

    const honest = verifyRun({ seed, ruleId: rule.id, mode: "ranked", inputs: s.log });
    // on rallonge le journal avec des clics inventés pour gonfler le score
    const forged = [...s.log];
    let t = (forged[forged.length - 1]?.t ?? 0) + 400;
    for (let i = 0; i < 15; i++, t += 400) forged.push({ t, k: "c", i: 0 });

    const cheated = verifyRun({ seed, ruleId: rule.id, mode: "ranked", inputs: forged });
    // le rejeu ne peut pas être trompé : les clics inventés tombent à côté
    expect(cheated.score).toBeLessThanOrEqual(honest.score + 2);
  });
});

describe("qualité du signal anti-bot", () => {
  it("n'enregistre que de vraies réactions, jamais les manches passives", () => {
    // Un run qui ne fait que laisser filer le temps ne fournit aucune donnée
    // de réaction : c'est la seule façon de garder l'analyse honnête.
    const v = verifyRun({ seed: 555, ruleId: "sang", mode: "training", inputs: [] });
    expect(v.reactions).toHaveLength(0);
    for (const r of v.reactions) expect(r).toBeLessThan(3000);
  });

  it("garde des délais plausibles pour un joueur simulé", () => {
    const claim = playPerfectly(20260812, "daltonien", { reaction: () => 265 });
    const v = verifyRun(claim);
    expect(v.reactions.length).toBeGreaterThan(8);
    for (const r of v.reactions) {
      expect(r).toBeGreaterThan(100);
      expect(r).toBeLessThan(1500);
    }
    expect(analyseReactions(v.reactions).median).toBeGreaterThan(200);
  });
});
