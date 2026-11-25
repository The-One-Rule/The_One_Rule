import { afterEach, describe, expect, it } from "vitest";
import {
  bougeSousImmobile,
  couleurDeLaFoule,
  estInconnue,
  gongPossible,
  inconnue,
  INCONNUE,
  regleSalonDepuisId,
  REGLE_GONG,
  REGLES_SALON,
  sousLInconnue,
  VERSION_SALON,
  voisineDuRouge,
} from "../src/engine/rules/salon";
import { ONE_RULES, ruleById } from "../src/engine/rules";
import { MOTIFS, MOTIFS_REGLE } from "../src/engine/motifs";
import { applyRule, buildMultiRound, draftShared, poolMulti } from "../src/engine/multiround";
import { CONSIGNES_VERSION } from "../src/engine/instructions";
import { resolveAction, resolveTimeout } from "../src/engine/resolve";
import { VERSION_CONTENU } from "../src/engine/version";
import type { Entity, OneRule, Round } from "../src/engine/types";
import { MatchLogic, multiRulesFor, piegeParConsigne } from "../server/match";
import { DEFAULT_SETTINGS } from "../shared/protocol";
import { pictogramme } from "../src/render/pictogramme";
import { briefCourtDeRegle, briefDeRegle, nomDeRegle, poseLangue, traduisMotif } from "../src/i18n";

/* ------------------------------------------------------------------ *
 * LES RÈGLES DE SALON — les idées de consignes de l'équipe (kanban).
 *
 * Ce fichier refait la MESURE qui a recalibré trois d'entre elles (voir
 * l'en-tête de `salon.ts`), éprouve que chacune juge ce qu'elle annonce, que
 * client et serveur lisent la même manche (n°3), et qu'un salon d'hier
 * retombe sur le pool d'hier.
 * ------------------------------------------------------------------ */

const V = VERSION_SALON;
const POOL = poolMulti(false, V);

const regle = (id: string): OneRule => {
  const r = regleSalonDepuisId(id);
  if (!r) throw new Error(`règle de salon inconnue : ${id}`);
  return r;
};

const clic = (e: Entity | null) => ({ kind: "click" as const, ent: e, x: e?.x ?? 0, y: e?.y ?? 0 });

/** Les manches d'une règle sur `n` matchs de `l` manches — le protocole de la mesure. */
function* manches(r: OneRule, n = 150, l = 40): Generator<{ round: Round; idx: number; seed: number }> {
  for (let s = 0; s < n; s++) {
    const seed = s * 7919 + 1;
    for (let idx = 0; idx < l; idx++) yield { round: buildMultiRound(seed, idx, r, POOL), idx, seed };
  }
}

/** Taux de pièges par tranche de dix manches. */
function tauxParTranche(r: OneRule): number[] {
  const t = [0, 0, 0, 0];
  const n = [0, 0, 0, 0];
  for (const { round, idx } of manches(r)) {
    const k = Math.floor(idx / 10);
    n[k]!++;
    if (round.trap) t[k]!++;
  }
  return t.map((x, i) => x / n[i]!);
}

afterEach(() => poseLangue("fr"));

describe("le calibrage — aucune règle de salon ne dépasse 28 % de pièges, à aucun moment", () => {
  for (const id of ["immobile", "voisin", "foule"]) {
    it(`${id} : entre 8 % et 28 % à chaque tranche de dix manches`, () => {
      const t = tauxParTranche(regle(id));
      for (const x of t) {
        expect(x).toBeLessThanOrEqual(0.28);
        expect(x).toBeGreaterThanOrEqual(0.08);
      }
    });
  }

  it("LE GONG : environ une manche sur cinq, et jamais deux d'affilée", () => {
    let gongs = 0;
    let total = 0;
    for (let s = 0; s < 150; s++) {
      let avant = false;
      for (let idx = 0; idx < 40; idx++) {
        const r = buildMultiRound(s * 31 + 7, idx, REGLE_GONG, POOL);
        total++;
        if (r.gong) {
          gongs++;
          expect(avant).toBe(false);
          expect(gongPossible(idx)).toBe(true);
          expect(r.trap).toBe(true);
          expect(r.steps).toEqual([]);
        }
        avant = !!r.gong;
      }
    }
    expect(gongs / total).toBeGreaterThan(0.15);
    expect(gongs / total).toBeLessThan(0.28);
  });

  it("L'IMMOBILE telle qu'écrite sur la carte serait inerte : c'est ce que corrige la part mobile", () => {
    // La lettre de la carte : seules les pièces de la consigne « BOUGE » bougent.
    let lettre = 0;
    let total = 0;
    for (let s = 0; s < 150; s++)
      for (let idx = 0; idx < 10; idx++) {
        const d = draftShared(s * 7919 + 1, idx, POOL);
        total++;
        if (d.want.kind === "click" && d.ents[d.want.idx]!.moving) lettre++;
      }
    expect(lettre / total).toBeLessThan(0.02);
  });

  it("LA FOULE telle qu'écrite (« plus de 4 formes ») tuerait l'action : 70 % de manches au silence", () => {
    let foule = 0;
    let total = 0;
    for (let s = 0; s < 150; s++)
      for (let idx = 0; idx < 40; idx++) {
        const d = draftShared(s * 7919 + 1, idx, POOL);
        total++;
        if (d.ents.length > 4) foule++;
      }
    expect(foule / total).toBeGreaterThan(0.6);
  });
});

describe("L'IMMOBILE", () => {
  const r = regle("immobile");

  it("une manche est un piège exactement quand la pièce visée BOUGE chez son porteur", () => {
    for (const { round } of manches(r, 60, 30)) {
      if (round.trap) continue;
      for (const st of round.steps) {
        if (st.kind === "click") expect(round.ents[st.idx]!.moving).toBe(false);
      }
    }
  });

  it("la déformation ne fait bouger que les pièces que `forbids` voyait bouger — elle ne crée aucun piège", () => {
    for (let s = 0; s < 80; s++)
      for (let idx = 0; idx < 25; idx++) {
        const shared = draftShared(s * 13 + 5, idx, POOL);
        const round = applyRule(shared, r, s * 13 + 5);
        for (const e of round.ents) expect(e.moving).toBe(bougeSousImmobile(shared.ents[e.idx]!, shared.ents));
      }
  });

  it("n'ajoute aucun mouvement quand la consigne en fait déjà bouger (« CELUI QUI NE BOUGE PAS » reste lisible)", () => {
    let vus = 0;
    for (let s = 0; s < 300 && vus < 10; s++)
      for (let idx = 9; idx < 40; idx++) {
        const shared = draftShared(s * 17 + 3, idx, POOL);
        if (shared.instructionId !== "moving") continue;
        vus++;
        const round = applyRule(shared, r, s * 17 + 3);
        expect(round.ents.map((e) => e.moving)).toEqual(shared.ents.map((e) => e.moving));
      }
    expect(vus).toBeGreaterThan(0);
  });

  it("les entités de la scène commune ne sont jamais touchées (le serveur juge tout le monde dessus)", () => {
    const shared = draftShared(42, 3, POOL);
    const avant = shared.ents.map((e) => e.moving);
    applyRule(shared, r, 42);
    expect(shared.ents.map((e) => e.moving)).toEqual(avant);
  });

  it("cliquer une pièce qui bouge tue, avec son motif", () => {
    for (const { round } of manches(r, 40, 20)) {
      const mobile = round.ents.find((e) => e.moving);
      if (!mobile) continue;
      expect(r.judge(clic(mobile), { round, elapsedMs: 500 })).toBe(MOTIFS.immobile);
      return;
    }
    throw new Error("aucune pièce mobile rencontrée");
  });
});

describe("LE VOISIN", () => {
  const ent = (idx: number, col: number, row: number, color: Entity["color"]): Entity => ({
    idx,
    shape: "carre",
    color,
    size: "M",
    moving: false,
    r: 42,
    ox: col * 200 + 100,
    oy: row * 140 + 70,
    x: col * 200 + 100,
    y: row * 140 + 70,
    phase: 0,
  });

  it("par un côté oui, en diagonale non, et le rouge lui-même jamais", () => {
    const rouge = ent(0, 2, 1, "garance");
    const cote = ent(1, 3, 1, "azur");
    const diag = ent(2, 3, 2, "jade");
    const autreRouge = ent(3, 2, 0, "garance");
    const ents = [rouge, cote, diag, autreRouge];
    expect(voisineDuRouge(cote, ents)).toBe(true);
    expect(voisineDuRouge(diag, ents)).toBe(false);
    expect(voisineDuRouge(rouge, ents)).toBe(false);
    expect(voisineDuRouge(autreRouge, ents)).toBe(false);
  });

  it("juge sur la position AU REPOS : une pièce animée ne change pas de voisins", () => {
    const rouge = ent(0, 1, 1, "garance");
    const v = { ...ent(1, 2, 1, "ambre"), x: 9999, y: -50 };
    expect(voisineDuRouge(v, [rouge, v])).toBe(true);
  });

  it("forbids et judge disent la même chose", () => {
    const r = regle("voisin");
    for (const { round } of manches(r, 40, 30)) {
      for (const e of round.ents) {
        const meurt = r.judge(clic(e), { round, elapsedMs: 500 }) === MOTIFS.voisin;
        expect(meurt).toBe(voisineDuRouge(e, round.ents));
      }
    }
  });
});

describe("LA FOULE", () => {
  it("la couleur strictement la plus nombreuse, jamais à égalité, jamais seule", () => {
    const e = (color: Entity["color"]) => ({ color }) as Entity;
    expect(couleurDeLaFoule([e("azur"), e("azur"), e("jade")])).toBe("azur");
    expect(couleurDeLaFoule([e("azur"), e("azur"), e("jade"), e("jade")])).toBeNull();
    expect(couleurDeLaFoule([e("azur"), e("jade"), e("ambre")])).toBeNull();
  });

  it("une manche piège exactement quand la cible est de la couleur de la foule", () => {
    const r = regle("foule");
    for (let s = 0; s < 60; s++)
      for (let idx = 0; idx < 30; idx++) {
        const shared = draftShared(s * 7 + 2, idx, POOL);
        const round = applyRule(shared, r, s * 7 + 2);
        if (shared.want.kind !== "click") continue;
        const foule = couleurDeLaFoule(shared.ents);
        expect(round.trap).toBe(shared.ents[shared.want.idx]!.color === foule);
      }
  });
});

describe("LE MIROIR", () => {
  const r = regle("miroir");

  it("« LE PLUS À GAUCHE » se joue à droite, et toucher la gauche tue avec le motif du miroir", () => {
    let vus = 0;
    for (const { round } of manches(r, 200, 40)) {
      if (round.instructionId !== "extremeSide") continue;
      vus++;
      const xs = round.ents.map((e) => e.ox);
      const gauche = round.ents[xs.indexOf(Math.min(...xs))]!;
      const droite = round.ents[xs.indexOf(Math.max(...xs))]!;
      const cle = round.phrase?.cle;
      const attendue = cle === "clicGauche" ? droite : gauche;
      const leurre = cle === "clicGauche" ? gauche : droite;
      expect(round.steps).toEqual([{ kind: "click", idx: attendue.idx }]);
      expect(round.leurre).toBe(leurre.idx);
      expect(resolveAction(round, { step: 0 }, clic(leurre), 500, r.judge).outcome).toEqual({
        kind: "death",
        cause: "macro",
        reason: MOTIFS.miroir,
      });
      expect(resolveAction(round, { step: 0 }, clic(attendue), 500, r.judge).outcome.kind).toBe("survive");
    }
    expect(vus).toBeGreaterThan(20);
  });

  it("« LE PLUS GROS ROUGE » se joue sur le plus petit rouge", () => {
    let vus = 0;
    for (const { round } of manches(r, 200, 40)) {
      if (round.instructionId !== "smallestOfColor") continue;
      vus++;
      const st = round.steps[0]!;
      expect(st.kind).toBe("click");
      if (st.kind !== "click") continue;
      const visee = round.ents[st.idx]!;
      const nommee = round.ents[round.leurre!]!;
      expect(visee.color).toBe(nommee.color);
      expect(visee.size).not.toBe(nommee.size);
      const grosse = round.phrase?.cle === "clicPlusGrosCouleur";
      expect(visee.size).toBe(grosse ? "S" : "L");
    }
    expect(vus).toBeGreaterThan(10);
  });

  it("les flèches gauche et droite s'échangent au clavier ; haut et bas ne bougent pas", () => {
    const poolClavier = poolMulti(true, V);
    let vus = 0;
    for (let s = 0; s < 400; s++)
      for (let idx = 9; idx < 30; idx++) {
        const round = buildMultiRound(s, idx, r, poolClavier);
        if (round.instructionId !== "arrow") continue;
        const st = round.steps[0]!;
        if (st.kind !== "key") continue;
        if (round.leurreTouche === undefined) {
          expect(["ArrowUp", "ArrowDown"]).toContain(st.key);
        } else {
          vus++;
          expect(new Set([st.key, round.leurreTouche])).toEqual(new Set(["ArrowLeft", "ArrowRight"]));
          expect(r.judge({ kind: "key", key: round.leurreTouche }, { round, elapsedMs: 500 })).toBe(MOTIFS.miroir);
        }
      }
    expect(vus).toBeGreaterThan(0);
  });

  it("ne touche à rien d'autre : ni le nombre de gestes, ni la fenêtre, ni le piège", () => {
    for (let s = 0; s < 60; s++)
      for (let idx = 0; idx < 30; idx++) {
        const sans = buildMultiRound(s, idx, ONE_RULES.find((x) => x.id === "jumeau")!, POOL);
        const avec = buildMultiRound(s, idx, r, POOL);
        expect(avec.trap).toBe(false);
        expect(avec.durationMs).toBe(draftShared(s, idx, POOL).durationMs);
        expect(avec.steps.length).toBe(sans.steps.length / 2 || avec.steps.length);
      }
  });
});

describe("L'INSOUMIS", () => {
  const r = regle("insoumis");

  it("environ trois consignes à un clic sur dix s'écrivent en rouge, et seulement celles-là", () => {
    let unClic = 0;
    let rouges = 0;
    for (const { round, idx, seed } of manches(r, 150, 30)) {
      const shared = draftShared(seed, idx, POOL);
      const simple = shared.want.kind === "click";
      if (simple) unClic++;
      if (round.insoumise) {
        rouges++;
        expect(simple).toBe(true);
        expect(round.inkColor).toBe("garance");
        expect(round.steps).toEqual([{ kind: "clickAny" }]);
        expect(round.leurre).toBe(shared.want.kind === "click" ? shared.want.idx : -1);
      }
    }
    expect(rouges / unClic).toBeGreaterThan(0.24);
    expect(rouges / unClic).toBeLessThan(0.36);
  });

  it("toucher ce qu'elle désigne tue ; toucher autre chose, ou le vide, passe", () => {
    let vus = 0;
    for (const { round } of manches(r, 60, 20)) {
      if (!round.insoumise) continue;
      vus++;
      const nommee = round.ents[round.leurre!]!;
      const autre = round.ents.find((e) => e !== nommee)!;
      expect(resolveAction(round, { step: 0 }, clic(nommee), 500, r.judge).outcome).toMatchObject({
        kind: "death",
        reason: MOTIFS.insoumis,
      });
      expect(resolveAction(round, { step: 0 }, clic(autre), 500, r.judge).outcome.kind).toBe("survive");
      expect(resolveAction(round, { step: 0 }, clic(null), 500, r.judge).outcome.kind).toBe("survive");
    }
    expect(vus).toBeGreaterThan(10);
  });

  it("l'encre rouge éteint le dessin de la consigne : il ne tranche rien à la place du joueur", () => {
    for (const { round } of manches(r, 40, 20)) {
      if (round.insoumise) expect(pictogramme(round)).toBeNull();
    }
  });
});

describe("LE GONG", () => {
  it("bouger sous le gong tue avec son motif ; attendre survit", () => {
    for (const { round } of manches(REGLE_GONG, 20, 20)) {
      if (!round.gong) continue;
      const e = round.ents[0] ?? null;
      expect(REGLE_GONG.judge(clic(e), { round, elapsedMs: 500 })).toBe(MOTIFS.gong);
      expect(resolveTimeout(round, { step: 0 })).toEqual({ kind: "survive", trap: true });
      return;
    }
    throw new Error("aucun gong");
  });

  it("le même gong chez le client et au serveur : il ne dépend que de la graine, de la manche et de la règle", () => {
    for (let idx = 0; idx < 30; idx++) {
      expect(buildMultiRound(77, idx, REGLE_GONG, POOL).gong).toBe(buildMultiRound(77, idx, REGLE_GONG, POOL).gong);
    }
  });
});

describe("L'INCONNUE", () => {
  it("le voile juge, piège et déforme EXACTEMENT comme la règle qu'il cache", () => {
    const sang = ruleById("sang")!;
    const v = inconnue(sang);
    expect(v.id).toBe("inconnue:sang");
    expect(ruleById("inconnue:sang")).toBe(v);
    expect(sousLInconnue(v.id)).toBe("sang");
    for (let idx = 0; idx < 30; idx++) {
      const a = buildMultiRound(5, idx, sang, POOL);
      const b = buildMultiRound(5, idx, v, POOL);
      expect(b.trap).toBe(a.trap);
      expect(b.steps).toEqual(a.steps);
    }
  });

  it("le serveur pose un voile sur une règle qui piège par la consigne, par équipe, depuis la graine", () => {
    let vus = 0;
    for (let g = 1; g < 400; g++) {
      const ids = ["a", "b", "c", "d"];
      const m = new MatchLogic(g, ids, DEFAULT_SETTINGS, new Set(), false, false, V);
      for (const [, rule] of m.rulesAt(0)) {
        if (!estInconnue(rule.id)) continue;
        vus++;
        const dessous = ruleById(sousLInconnue(rule.id)!)!;
        expect(piegeParConsigne(dessous)).toBe(true);
        // Le même tirage à chaque appel : la règle cachée ne change pas sous les pieds.
        expect(m.rulesAt(0)).toEqual(m.rulesAt(0));
      }
    }
    expect(vus).toBeGreaterThan(0);
  });

  it("le représentant du pool n'est jamais attribué tel quel", () => {
    for (let g = 1; g < 200; g++) {
      const m = new MatchLogic(g, ["a", "b", "c"], DEFAULT_SETTINGS, new Set(), false, false, V, true);
      for (const id of Object.values(m.reglesPubliques(0))) {
        expect(id).not.toBe(INCONNUE);
        expect(ruleById(id)).toBeDefined();
      }
    }
  });
});

describe("la négociation sur le fil", () => {
  const ids = (r: OneRule[]) => r.map((x) => x.id).sort();
  const SALON = ["miroir", "insoumis", "foule", "voisin", "immobile", INCONNUE];

  it("CONSIGNES_VERSION les porte", () => {
    expect(CONSIGNES_VERSION).toBeGreaterThanOrEqual(V);
  });

  it("un salon d'hier (version 5) tire EXACTEMENT le pool d'hier", () => {
    for (const clavier of [false, true]) {
      expect(ids(multiRulesFor(clavier, V - 1, true))).toEqual(ids(multiRulesFor(clavier, V - 1)));
      for (const id of [...SALON, "gong"]) expect(ids(multiRulesFor(clavier, V - 1, true))).not.toContain(id);
    }
  });

  it("en version 6 elles entrent, et LE GONG seulement si toute la table a le son", () => {
    for (const clavier of [false, true]) {
      const sansSon = ids(multiRulesFor(clavier, V));
      const avecSon = ids(multiRulesFor(clavier, V, true));
      for (const id of SALON) expect(sansSon).toContain(id);
      expect(sansSon).not.toContain("gong");
      expect(avecSon).toContain("gong");
    }
  });

  it("le pool de CONSIGNES ne bouge pas en version 6", () => {
    for (const clavier of [false, true]) {
      expect(poolMulti(clavier, V).map((i) => i.id)).toEqual(poolMulti(clavier, V - 1).map((i) => i.id));
    }
  });

  it("l'imposteur ne tire jamais une règle qui ne piège pas par la consigne", () => {
    for (let g = 1; g < 300; g++) {
      const m = new MatchLogic(g, ["a", "b", "c"], { ...DEFAULT_SETTINGS, mode: "imposteur" }, new Set(), false, false, V, true);
      expect(piegeParConsigne(m.regleCommune!)).toBe(true);
    }
  });

  it("le solo n'en sait rien : catalogue et VERSION_CONTENU inchangés", () => {
    for (const r of [...REGLES_SALON, REGLE_GONG]) expect(ONE_RULES.map((x) => x.id)).not.toContain(r.id);
    // La même que la veille : records d'entraînement et classement intacts.
    expect(VERSION_CONTENU).toBe("bi44iq");
  });
});

describe("l'affichage", () => {
  const TOUTES = [...REGLES_SALON.map((r) => r.id), REGLE_GONG.id];

  it("chaque règle a son nom, son brief et son brief court, en français et en anglais", () => {
    for (const langue of ["fr", "en"] as const) {
      poseLangue(langue);
      for (const id of TOUTES) {
        expect(nomDeRegle(id, "§")).not.toBe("§");
        expect(briefDeRegle(id, "§")).not.toBe("§");
        const court = briefCourtDeRegle(id, "§");
        expect(court).not.toBe("§");
        expect(court.length).toBeLessThanOrEqual(31);
      }
    }
  });

  it("L'INCONNUE ne dit jamais ce qu'elle cache, dans aucune langue", () => {
    for (const langue of ["fr", "en"] as const) {
      poseLangue(langue);
      const nom = nomDeRegle("inconnue:sang", "§");
      const brief = briefDeRegle("inconnue:sang", "§");
      expect(nom).toBe(nomDeRegle(INCONNUE, "§"));
      expect(brief).toBe(briefDeRegle(INCONNUE, "§"));
      expect(`${nom} ${brief}`).not.toMatch(/ROUGE|RED|SANG|BLOOD/i);
    }
  });

  it("leurs motifs comptent pour TÊTE BRÛLÉE et ont leur traduction", () => {
    for (const k of ["immobile", "voisin", "foule", "miroir", "insoumis", "gong"] as const) {
      expect(MOTIFS_REGLE).toContain(MOTIFS[k]);
      poseLangue("en");
      expect(traduisMotif(MOTIFS[k])).not.toBe(MOTIFS[k]);
    }
  });
});
