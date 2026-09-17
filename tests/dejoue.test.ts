/**
 * DÉJOUER — le raccourci de l'abstention, en entraînement seulement.
 *
 * Retour du jury Ystart : « l'écran ne rien faire gâche le peps, ça doit aller
 * vite ». Un piège dure toute sa fenêtre, parce que c'est la seule façon de
 * savoir qu'on a tenu : le meilleur geste du jeu se payait du plus long temps
 * mort. Le joueur peut désormais DIRE qu'il a vu.
 *
 * Décision de Pierre : un RACCOURCI (ne rien faire reste une bonne réponse), et
 * PAS PARTOUT (l'entraînement d'abord).
 *
 * Ce fichier tient les trois propriétés qui rendent le raccourci inoffensif :
 *   1. il ne sauve jamais une manche que l'attente aurait perdue ;
 *   2. il n'existe dans aucun mode qui se compare ;
 *   3. absent, il ne change rien — pas même le flux du RNG.
 */
import { describe, expect, it } from "vitest";
import { Session } from "../src/game/session";
import { ONE_RULES } from "../src/engine/rules";
import { mulberry32 } from "../src/engine/rng";
import { buildRound } from "../src/engine/round";
import { resolveTimeout, resoudreDejoue } from "../src/engine/resolve";
import { INSTRUCTIONS } from "../src/engine/instructions";
import { MOTIFS } from "../src/engine/motifs";
import { GRACE_ROUNDS } from "../src/engine/difficulty";
import type { Round } from "../src/engine/types";

const SANG = ONE_RULES.find((r) => r.id === "sang")!;

const entrainement = (opts: { dejoue?: boolean; seed?: number; touche?: string } = {}): Session =>
  new Session({
    mode: "training",
    rule: SANG,
    rng: mulberry32(opts.seed ?? 11),
    now: 0,
    seed: opts.seed ?? 11,
    dejoue: opts.dejoue,
    toucheDejoue: opts.touche,
  });

/** Avance jusqu'à une manche qui vérifie `quoi`, en la gagnant ou en l'attendant. */
function jusqua(s: Session, quoi: (r: Round) => boolean, t0 = 0): number {
  let t = t0;
  for (let garde = 0; garde < 400 && s.phase === "playing"; garde++) {
    if (quoi(s.round)) return t;
    // on franchit la manche courante sans mourir : attendre si elle ne demande
    // rien, sinon jouer sa réponse exacte
    const r = s.round;
    if (r.steps.length === 0) {
      t += r.durationMs + 1;
      s.tick(t);
    } else {
      for (const step of r.steps) {
        t += 5;
        if (step.kind === "key") s.input({ kind: "key", key: step.key }, t);
        else {
          const ent =
            step.kind === "click"
              ? r.ents.find((e) => e.idx === step.idx)!
              : step.kind === "clickAnyExcept"
                ? r.ents.find((e) => e.color !== step.color)!
                : r.ents[0]!;
          s.input({ kind: "click", ent, x: ent.x, y: ent.y }, t);
        }
      }
    }
  }
  throw new Error("aucune manche ne vérifie la condition");
}

describe("le verdict pur", () => {
  /*
   * ⚠️ LA PROPRIÉTÉ QUI REND LE RACCOURCI INOFFENSIF.
   *
   * Déjouer n'a le droit que d'AVANCER l'instant d'une survie que l'attente
   * aurait donnée. S'il sauvait une seule manche que le chrono aurait perdue,
   * il gonflerait les records et changerait ce qu'un score veut dire.
   */
  it("⚠️ déjouer ne sauve JAMAIS une manche que l'attente aurait perdue", () => {
    let manches = 0;
    let survies = 0;
    for (const regle of ONE_RULES) {
      for (let g = 0; g < 12; g++) {
        const rng = mulberry32(1000 + g);
        for (let niveau = 0; niveau < 30; niveau++) {
          const r = buildRound(rng, niveau, regle, INSTRUCTIONS);
          const d = resoudreDejoue(r);
          manches++;
          if (d.kind === "survive") {
            survies++;
            expect(
              resolveTimeout(r, { step: 0 }).kind,
              `${regle.id} n${niveau} : déjouer survit là où attendre ne survit pas`,
            ).toBe("survive");
          }
        }
      }
    }
    // Le test ne prouverait rien sans survies à examiner.
    expect(survies).toBeGreaterThan(manches * 0.1);
  });

  it("il réussit sur un piège ET sur « NE FAIS RIEN », il tue ailleurs", () => {
    let piege = false;
    let rien = false;
    let tue = false;
    const rng = mulberry32(3);
    for (let niveau = 0; niveau < 400 && !(piege && rien && tue); niveau++) {
      const r = buildRound(rng, niveau % 40, SANG, INSTRUCTIONS);
      const d = resoudreDejoue(r);
      if (r.trap) {
        piege = true;
        expect(d).toEqual({ kind: "survive", trap: true });
      } else if (r.steps.length === 0) {
        rien = true;
        expect(d).toEqual({ kind: "survive", trap: false });
      } else {
        tue = true;
        expect(d).toEqual({ kind: "death", cause: "wrong", reason: MOTIFS.dejoueATort });
      }
    }
    expect([piege, rien, tue], "les trois cas doivent avoir été rencontrés").toEqual([true, true, true]);
  });
});

describe("il n'existe que là où il est permis", () => {
  it("absent par défaut : un entraînement sans l'option l'ignore", () => {
    const s = entrainement();
    const t = jusqua(s, (r) => r.trap);
    const avant = s.level;
    expect(s.dejouer(t + 1)).toEqual({ kind: "pending" });
    expect(s.level).toBe(avant);
    expect(s.dejoues).toBe(0);
  });

  it("⚠️ le run du jour, le classé et l'escalade le refusent MÊME si on le demande", () => {
    for (const mode of ["daily", "ranked", "escalade"] as const) {
      const s = new Session({ mode, rule: SANG, rng: mulberry32(5), now: 0, seed: 5, dejoue: true });
      expect(s.dejoueActif, `${mode} accepte le déjouage`).toBe(false);
      expect(s.dejouer(10)).toEqual({ kind: "pending" });
    }
  });
});

describe("en partie d'entraînement", () => {
  it("déjouer un piège termine la manche tout de suite, et se compte", () => {
    const s = entrainement({ dejoue: true });
    const t = jusqua(s, (r) => r.trap);
    const niveau = s.level;
    const fenetre = s.round.durationMs;
    // bien avant la fin de la fenêtre : c'est tout l'intérêt
    const res = s.dejouer(t + 50);
    expect(res).toEqual({ kind: "survive", trap: true });
    expect(s.level).toBe(niveau + 1);
    expect(s.dejoues).toBe(1);
    expect(s.piegesDejoues).toBe(1);
    expect(fenetre).toBeGreaterThan(50);
  });

  it("déjouer à tort APRÈS l'échauffement tue, avec son motif", () => {
    const s = entrainement({ dejoue: true });
    const t = jusqua(s, (r) => s.level >= GRACE_ROUNDS && r.steps.length > 0);
    expect(s.dejouer(t + 5).kind).toBe("death");
    expect(s.phase).toBe("freeze");
    s.tick(t + 5000);
    expect(s.end?.reason).toBe(MOTIFS.dejoueATort);
  });

  it("déjouer à tort PENDANT l'échauffement est pardonné, comme toute erreur", () => {
    const s = entrainement({ dejoue: true });
    const t = jusqua(s, (r) => s.level < GRACE_ROUNDS && r.steps.length > 0);
    const niveau = s.level;
    s.dejouer(t + 5);
    expect(s.phase).toBe("playing");
    expect(s.level).toBe(niveau + 1);
    expect(s.marks[s.marks.length - 1]).toBe("🟨");
  });

  it("la fin de partie rapporte ce qui a été déjoué", () => {
    const s = entrainement({ dejoue: true });
    const t = jusqua(s, (r) => r.trap);
    s.dejouer(t + 1);
    const t2 = jusqua(s, (r) => s.level >= GRACE_ROUNDS && r.steps.length > 0, t + 2);
    s.dejouer(t2 + 1);
    s.tick(t2 + 5000);
    expect(s.end?.dejoues).toBe(1);
    expect(s.end?.piegesDejoues).toBe(1);
  });
});

describe("la touche du déjouage sort du tirage", () => {
  /*
   * ⚠️ ABSENTE, ELLE NE CHANGE RIEN — PAS MÊME LE FLUX DU RNG.
   *
   * C'est la garantie qui protège tout ce qui se compare : le run du jour, le
   * multijoueur, le classé et `verifyRun` n'ont jamais cet argument. Si son
   * absence changeait un seul tirage, tous les scores enregistrés cesseraient
   * d'être comparables, en silence.
   */
  it("⚠️ sans touche réservée, les manches sont identiques à l'appel d'origine", () => {
    for (const regle of ONE_RULES) {
      const a = mulberry32(77);
      const b = mulberry32(77);
      for (let niveau = 0; niveau < 25; niveau++) {
        const nu = buildRound(a, niveau, regle, INSTRUCTIONS);
        const explicite = buildRound(b, niveau, regle, INSTRUCTIONS, 1, undefined, undefined);
        expect(explicite.text, `${regle.id} n${niveau}`).toBe(nu.text);
        expect(explicite.ents.map((e) => [e.shape, e.color, e.ox, e.oy])).toEqual(
          nu.ents.map((e) => [e.shape, e.color, e.ox, e.oy]),
        );
      }
    }
  });

  it("avec F réservée, aucune consigne ne demande F — et sans, il y en a", () => {
    const demandeF = (r: Round): boolean => r.steps.some((s) => s.kind === "key" && s.key === "F");
    let sansReserve = 0;
    let avecReserve = 0;
    for (let g = 0; g < 150; g++) {
      const a = mulberry32(g);
      const b = mulberry32(g);
      for (let niveau = 3; niveau < 20; niveau++) {
        if (demandeF(buildRound(a, niveau, SANG, INSTRUCTIONS))) sansReserve++;
        if (demandeF(buildRound(b, niveau, SANG, INSTRUCTIONS, 1, undefined, "f"))) avecReserve++;
      }
    }
    // Les dents du test : sans réservation, F sort bel et bien.
    expect(sansReserve).toBeGreaterThan(0);
    expect(avecReserve).toBe(0);
  });

  it("sur un appareil tactile, rien n'est réservé (aucune consigne clavier n'y sort)", () => {
    const s = new Session({
      mode: "training",
      rule: SANG,
      rng: mulberry32(9),
      now: 0,
      seed: 9,
      touchOnly: true,
      dejoue: true,
      toucheDejoue: "F",
    });
    expect(s.dejoueActif).toBe(true);
    const t = jusqua(s, (r) => r.trap);
    expect(s.dejouer(t + 1)).toEqual({ kind: "survive", trap: true });
  });
});
