import { afterEach, describe, expect, it } from "vitest";
import {
  familleDeRegle,
  formeDeDepart,
  formeDeRancune,
  formeQuiACoute,
  rancune,
  RANCUNE,
  VERSION_RANCUNE,
} from "../src/engine/rules/rancune";
import { ONE_RULES, ruleById } from "../src/engine/rules";
import { MOTIFS, MOTIFS_REGLE } from "../src/engine/motifs";
import { applyRule, buildMultiRound, draftShared, poolMulti } from "../src/engine/multiround";
import { CONSIGNES_VERSION } from "../src/engine/instructions";
import { SHAPE_IDS } from "../src/engine/types";
import type { Entity, Round, ShapeId } from "../src/engine/types";
import { MatchLogic, multiRulesFor } from "../server/match";
import { DEFAULT_SETTINGS } from "../shared/protocol";
import type { RoomSettings } from "../shared/protocol";
import { briefCourtDeRegle, briefDeRegle, nomDeRegle, poseLangue, traduisMotif } from "../src/i18n";

/* ------------------------------------------------------------------ *
 * LA RANCUNE — « ne clique jamais la forme qui t'a coûté une vie ».
 *
 * La seule règle dont l'interdit dépend de l'histoire du joueur. Ce fichier
 * éprouve les trois réponses données aux questions de la tâche (départ tiré
 * de la graine, mort au temps, absente du solo), la négociation sur le fil,
 * et surtout que le serveur et le client lisent la MÊME cible (n°3).
 * ------------------------------------------------------------------ */

const V = VERSION_RANCUNE;

/** Un match de salon en version 5, LA RANCUNE au siège `a` dès la manche 0. */
function matchRancune(
  ids = ["a", "b"],
  reglages: Partial<RoomSettings> = {},
): MatchLogic {
  for (let g = 1; g < 5000; g++) {
    const m = new MatchLogic(g, ids, { ...DEFAULT_SETTINGS, ...reglages }, new Set(), false, false, V);
    if (m.rulesAt(0).get(ids[0]!)!.id.startsWith(`${RANCUNE}:`)) return m;
  }
  throw new Error("aucune graine ne donne LA RANCUNE au siège 0");
}

/** Assez de vies pour que personne ne soit éliminé pendant le test. */
function viesLarges(m: MatchLogic): void {
  for (const t of m.teams) t.lives = 50;
  for (const s of m.seats) s.lives = 50;
}

/** La manche ouverte, telle que le serveur la juge pour `id`. */
function mancheDe(m: MatchLogic, id: string): Round {
  return buildMultiRound(m.seed, m.roundIdx, m.rulesAt(m.roundIdx).get(id)!, poolMulti(false, V), m.tirage);
}

const equipe = (m: MatchLogic, id: string) => m.teamOf(m.seats.find((s) => s.id === id)!);

/**
 * Ouvre des manches jusqu'à en trouver une où `id` doit cliquer UNE pièce
 * précise et où `choix` en désigne une. Les manches sautées se ferment sans
 * que personne ne joue — d'où `viesLarges`.
 */
function ouvreJusqua(
  m: MatchLogic,
  id: string,
  choix: (round: Round, cible: Entity) => boolean,
): Round {
  for (let garde = 0; garde < 200; garde++) {
    m.openRound();
    const round = mancheDe(m, id);
    const step = round.steps[0];
    if (!round.trap && step?.kind === "click") {
      const cible = round.ents[step.idx]!;
      if (choix(round, cible)) return round;
    }
    m.closeRound();
  }
  throw new Error("aucune manche ne convient");
}

describe("LA RANCUNE — l'identifiant porte la cible", () => {
  it("se lit et se rejette sans ambiguïté", () => {
    expect(formeDeRancune("rancune:rond")).toBe("rond");
    expect(formeDeRancune("rancune:carre")).toBe("carre");
    expect(formeDeRancune("rancune")).toBeNull();
    expect(formeDeRancune("rancune:etoile")).toBeNull();
    expect(formeDeRancune("sang")).toBeNull();
    expect(familleDeRegle("rancune:triangle")).toBe("rancune");
    expect(familleDeRegle("sang")).toBe("sang");
  });

  it("ruleById rend la même règle que le serveur porte — même objet", () => {
    for (const f of SHAPE_IDS) {
      expect(ruleById(`rancune:${f}`)).toBe(rancune(f));
      expect(rancune(f).id).toBe(`rancune:${f}`);
    }
    // Sans cible, ce n'est pas un identifiant de salon : rien à jouer.
    expect(ruleById("rancune")).toBeUndefined();
    expect(ruleById("rancune:etoile")).toBeUndefined();
  });

  it("n'est PAS au catalogue solo : run du jour et VERSION_CONTENU intacts (n°11)", () => {
    expect(ONE_RULES.some((r) => r.id.startsWith(RANCUNE))).toBe(false);
    expect(ONE_RULES).toHaveLength(16);
  });
});

describe("LA RANCUNE — la règle", () => {
  it("interdit la forme, et seulement elle", () => {
    const round = applyRule(draftShared(3, 5), rancune("rond"), 3);
    for (const ent of round.ents) {
      const a = { kind: "click" as const, ent, x: ent.x, y: ent.y };
      const motif = rancune("rond").judge(a, { round, elapsedMs: 600 });
      expect(motif).toBe(ent.shape === "rond" ? MOTIFS.rancune : null);
    }
    // Un lever ou une touche ne sont jamais une infraction — comme LA ROUE.
    const ent = round.ents[0]!;
    expect(rancune(ent.shape).judge({ kind: "lift", ent, x: ent.x, y: ent.y }, { round, elapsedMs: 600 })).toBeNull();
    expect(rancune("rond").judge({ kind: "key", key: "A" }, { round, elapsedMs: 600 })).toBeNull();
  });

  it("mourir sur sa rancune compte comme enfreindre SA règle (TÊTE BRÛLÉE)", () => {
    expect(MOTIFS_REGLE).toContain(MOTIFS.rancune);
  });

  it("chaque cible produit des pièges, et une manche piégée se franchit sans rien faire", () => {
    for (const f of SHAPE_IDS) {
      let pieges = 0;
      for (let idx = 0; idx < 200; idx++) {
        const round = applyRule(draftShared(31, idx, poolMulti(false, V)), rancune(f), 31);
        if (!round.trap) continue;
        pieges++;
        expect(round.steps).toHaveLength(0);
      }
      expect(pieges, `rancune:${f} ne piège jamais`).toBeGreaterThan(0);
    }
  });

  it("ne piège pas plus que LA ROUE et LA POINTE, ses aînées de forme", () => {
    /*
     * Mesuré : rancune:rond piège EXACTEMENT les manches de LA ROUE (même
     * interdit), rancune:triangle celles de LA POINTE, et le carré se tient
     * entre les deux. Elle n'ajoute donc aucune densité de pièges que le pool
     * ne connaisse déjà.
     */
    const taux = (regle: ReturnType<typeof rancune>, clavier: boolean): number => {
      let n = 0;
      let p = 0;
      for (let seed = 1; seed <= 40; seed++) {
        for (let idx = 0; idx < 45; idx++) {
          n++;
          if (applyRule(draftShared(seed * 7919, idx, poolMulti(clavier, V)), regle, seed).trap) p++;
        }
      }
      return p / n;
    };
    for (const clavier of [false, true]) {
      const roue = taux(ruleById("roue")!, clavier);
      const pointe = taux(ruleById("pointe")!, clavier);
      expect(taux(rancune("rond"), clavier)).toBe(roue);
      expect(taux(rancune("triangle"), clavier)).toBe(pointe);
      expect(taux(rancune("carre"), clavier)).toBeLessThanOrEqual(Math.max(roue, pointe) + 0.015);
    }
  });
});

describe("LA RANCUNE — la forme qui coûte une vie", () => {
  const round = applyRule(draftShared(8, 7), rancune("rond"), 8);

  it("la pièce TOUCHÉE d'abord", () => {
    const touchee = round.ents.find((e) => e.shape === "triangle") ?? round.ents[0]!;
    expect(formeQuiACoute(round, { step: 0 }, touchee)).toBe(touchee.shape);
  });

  it("au TEMPS, la pièce que l'étape demandait", () => {
    const fabrique: Round = { ...round, trap: false, steps: [{ kind: "click", idx: 2 }] };
    expect(formeQuiACoute(fabrique, { step: 0 }, null)).toBe(round.ents[2]!.shape);
  });

  it("dans le vide sur un piège, la cible d'origine", () => {
    const piege: Round = { ...round, trap: true, steps: [], originalWant: { kind: "click", idx: 1 } };
    expect(formeQuiACoute(piege, { step: 0 }, null)).toBe(round.ents[1]!.shape);
  });

  it("aucune forme en jeu : rien ne change", () => {
    const partout: Round = { ...round, trap: false, steps: [{ kind: "clickAny" }] };
    expect(formeQuiACoute(partout, { step: 0 }, null)).toBeNull();
    const clavier: Round = { ...round, trap: false, steps: [{ kind: "key", key: "B" }] };
    expect(formeQuiACoute(clavier, { step: 0 }, null)).toBeNull();
  });

  it("le départ est tiré de la graine, et diffère d'une équipe à l'autre", () => {
    expect(formeDeDepart(42, 0)).toBe(formeDeDepart(42, 0));
    const vues = new Set<ShapeId>();
    for (let e = 0; e < 30; e++) vues.add(formeDeDepart(42, e));
    expect(vues.size).toBe(3);
  });
});

describe("LA RANCUNE — négociée sur le fil", () => {
  it("n'entre au pool qu'en version 5, une fois", () => {
    expect(CONSIGNES_VERSION).toBeGreaterThanOrEqual(V);
    for (const clavier of [false, true]) {
      // Le défaut reste le pool d'hier : la table `regle` de la base le lit.
      expect(multiRulesFor(clavier).some((r) => r.id.startsWith(RANCUNE))).toBe(false);
      expect(multiRulesFor(clavier, V - 1).some((r) => r.id.startsWith(RANCUNE))).toBe(false);
      expect(multiRulesFor(clavier, V).filter((r) => r.id.startsWith(RANCUNE))).toHaveLength(1);
    }
  });

  it("un salon sans la version 5 ne la tire jamais", () => {
    for (let g = 1; g < 300; g++) {
      const m = new MatchLogic(g, ["a", "b", "c"], DEFAULT_SETTINGS, new Set(), false, false, V - 1);
      for (let idx = 0; idx < 40; idx += 8) {
        for (const r of m.rulesAt(idx).values()) expect(r.id.startsWith(RANCUNE)).toBe(false);
      }
    }
  });

  it("jamais en IMPOSTEUR : sans vie perdue, elle ne changerait jamais", () => {
    for (let g = 1; g < 300; g++) {
      const m = new MatchLogic(
        g,
        ["a", "b", "c", "d"],
        { ...DEFAULT_SETTINGS, mode: "imposteur" },
        new Set(),
        false,
        false,
        V,
      );
      expect(m.regleCommune!.id.startsWith(RANCUNE)).toBe(false);
    }
  });
});

describe("LA RANCUNE — le match", () => {
  it("part de la forme tirée, et le fil la dit telle que le client la lit", () => {
    const m = matchRancune();
    const depart = formeDeDepart(m.seed, equipe(m, "a").id);
    expect(equipe(m, "a").rancune).toBe(depart);
    const id = m.reglesPubliques(0).a!;
    expect(id).toBe(`rancune:${depart}`);
    // Le client résout CET identifiant : la règle qui juge son aperçu est
    // celle qui juge le verdict (n°3).
    expect(ruleById(id)).toBe(m.rulesAt(0).get("a"));
  });

  it("une mauvaise pièce touchée devient la rancune", () => {
    const m = matchRancune();
    viesLarges(m);
    const avant = equipe(m, "a").rancune;
    const round = ouvreJusqua(m, "a", (r, cible) =>
      r.ents.some((e) => e !== cible && e.shape !== avant && e.shape !== cible.shape),
    );
    const cible = round.ents[(round.steps[0] as { idx: number }).idx]!;
    const fautive = round.ents.find((e) => e !== cible && e.shape !== avant && e.shape !== cible.shape)!;
    const verdict = m.input("a", m.roundIdx, { kind: "click", ent: fautive, x: fautive.x, y: fautive.y }, 600);
    expect(verdict?.kind).toBe("death");
    m.closeRound();
    expect(equipe(m, "a").rancune).toBe(fautive.shape);
    expect(m.reglesPubliques(m.roundIdx + 1).a).toBe(`rancune:${fautive.shape}`);
  });

  it("une mort au TEMPS retient la pièce qu'il fallait toucher", () => {
    const m = matchRancune();
    viesLarges(m);
    const avant = equipe(m, "a").rancune;
    const round = ouvreJusqua(m, "a", (_r, cible) => cible.shape !== avant);
    const cible = round.ents[(round.steps[0] as { idx: number }).idx]!;
    const { outcomes } = m.closeRound();
    expect(outcomes.get("a")?.kind).toBe("death");
    expect(equipe(m, "a").rancune).toBe(cible.shape);
  });

  it("une manche tenue ne change rien", () => {
    const m = matchRancune();
    viesLarges(m);
    const avant = equipe(m, "a").rancune;
    const round = ouvreJusqua(m, "a", () => true);
    const cible = round.ents[(round.steps[0] as { idx: number }).idx]!;
    // La bonne pièce n'est jamais la rancune : sinon la manche serait un piège.
    expect(cible.shape).not.toBe(avant);
    for (const [i, step] of round.steps.entries()) {
      if (step.kind !== "click") break;
      const ent = round.ents[step.idx]!;
      m.input("a", m.roundIdx, { kind: "click", ent, x: ent.x, y: ent.y }, 600 + i);
    }
    const { outcomes } = m.closeRound();
    expect(outcomes.get("a")?.kind).toBe("survive");
    expect(equipe(m, "a").rancune).toBe(avant);
  });

  it("toucher sa rancune tue sous son propre motif, et compte pour TÊTE BRÛLÉE", () => {
    const m = matchRancune();
    viesLarges(m);
    const avant = equipe(m, "a").rancune;
    const round = ouvreJusqua(m, "a", (r) => r.ents.some((e) => e.shape === avant));
    const interdite = round.ents.find((e) => e.shape === avant)!;
    const verdict = m.input("a", m.roundIdx, { kind: "click", ent: interdite, x: interdite.x, y: interdite.y }, 600);
    expect(verdict).toEqual({ kind: "death", reason: MOTIFS.rancune });
    m.closeRound();
    expect(m.seats.find((s) => s.id === "a")!.stats.rulebreaks).toBe(1);
    expect(equipe(m, "a").rancune).toBe(avant);
  });

  it("par rotation, on hérite de SON passé, pas d'une forme neuve", () => {
    /*
     * Une équipe garde sa rancune même quand elle ne porte pas la règle :
     * celle qui la reçoit par rotation en veut à la forme qui lui a coûté sa
     * dernière vie, quelle que soit la règle qu'elle portait alors.
     */
    for (let g = 1; g < 5000; g++) {
      const m = new MatchLogic(g, ["a", "b"], { ...DEFAULT_SETTINGS, rotationEvery: 1 }, new Set(), false, false, V);
      if (m.rulesAt(0).get("b")!.id.startsWith(RANCUNE)) continue;
      if (!m.rulesAt(1).get("b")!.id.startsWith(RANCUNE)) continue;
      viesLarges(m);
      m.openRound();
      const round = mancheDe(m, "b");
      const step = round.steps[0];
      if (round.trap || step?.kind !== "click") continue;
      const cible = round.ents[step.idx]!;
      if (cible.shape === equipe(m, "b").rancune) continue;
      m.closeRound(); // b ne joue pas : mort au temps
      expect(m.reglesPubliques(1).b).toBe(`rancune:${cible.shape}`);
      return;
    }
    throw new Error("aucune graine ne convient");
  });
});

describe("LA RANCUNE — à l'écran", () => {
  afterEach(() => poseLangue("fr"));

  it("garde son nom de famille, et son brief dit la forme", () => {
    poseLangue("fr");
    expect(nomDeRegle("rancune:rond", "LA RANCUNE")).toBe("LA RANCUNE");
    expect(briefDeRegle("rancune:carre", "")).toContain("CARRÉ");
    expect(briefCourtDeRegle("rancune:triangle", "")).toBe("Rancune : jamais de triangle");
    poseLangue("en");
    expect(nomDeRegle("rancune:rond", "LA RANCUNE")).toBe("THE GRUDGE");
    expect(briefDeRegle("rancune:rond", "")).toContain("CIRCLE");
    expect(briefCourtDeRegle("rancune:carre", "")).toBe("Grudge: never a square");
    expect(traduisMotif(MOTIFS.rancune)).toBe("YOU CLICKED YOUR GRUDGE");
  });

  it("le brief court tient dans le bandeau (≤ 31 caractères)", () => {
    for (const lang of ["fr", "en"] as const) {
      poseLangue(lang);
      for (const f of SHAPE_IDS) {
        expect(briefCourtDeRegle(`rancune:${f}`, "").length, `${lang} ${f}`).toBeLessThanOrEqual(31);
      }
    }
  });

  it("le brief du moteur est lisible, comme celui des autres règles", () => {
    for (const f of SHAPE_IDS) {
      expect(rancune(f).brief.length).toBeGreaterThan(30);
      expect(rancune(f).brief.trim().endsWith(".")).toBe(true);
    }
  });
});
