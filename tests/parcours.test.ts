/**
 * LE PARCOURS — la suite de niveaux qui remplace l'entraînement comme porte
 * d'entrée, et les VIES qui en font les étoiles.
 *
 * Trois pannes à empêcher :
 *
 * 1. **Un parcours qui bloque.** Un chapitre injouable sur l'appareil (LA MAIN
 *    GAUCHE sur un téléphone) ne doit jamais devenir un mur.
 * 2. **Des étoiles qui rétrécissent.** Un second essai moins bon n'efface rien,
 *    et rejouer un niveau déjà parfait ne fabrique pas de pièces.
 * 3. **Des vies qui déteignent.** Sans `vies`, `Session` doit rester
 *    exactement l'ancienne : une faute hors échauffement tue.
 */
import { describe, expect, it } from "vitest";
import {
  CHAPITRES,
  chapitreOuvert,
  enregistreEssai,
  ETOILES_MAX,
  etoilesChapitre,
  etoilesDeLEssai,
  fusionneEtoiles,
  litEtoiles,
  NIVEAU_BOSS,
  NIVEAUX,
  niveauOuvert,
  PIECES_CHAPITRE,
  PIECES_PAR_ETOILE,
  prochainNiveau,
  totalEtoiles,
  VIES_NIVEAU,
} from "../src/game/parcours";
import type { Etoiles } from "../src/game/parcours";
import { ONE_RULES } from "../src/engine/rules";
import { Session } from "../src/game/session";
import { mulberry32 } from "../src/engine/rng";
import { GRACE_ROUNDS } from "../src/engine/difficulty";
import { fusionne } from "../shared/compte";

const tout = (): boolean => true;
const boss = (id: string): Etoiles => ({ [id]: [1, 1, 1, 1, 1] });

describe("les chapitres", () => {
  it("couvrent le catalogue entier, chaque règle une seule fois", () => {
    expect([...CHAPITRES].sort()).toEqual(ONE_RULES.map((r) => r.id).sort());
  });

  it("commencent par LE SANG — la couleur se voit, elle ne se cherche pas", () => {
    expect(CHAPITRES[0]).toBe("sang");
  });

  it("les trois premiers piègent : le cœur du jeu s'apprend d'abord", () => {
    for (const id of CHAPITRES.slice(0, 3)) {
      expect(ONE_RULES.find((r) => r.id === id)!.traps, id).toBe(true);
    }
  });
});

describe("les niveaux", () => {
  it("ne se relâchent jamais : allure décroissante, manches croissantes", () => {
    for (let k = 1; k < NIVEAUX.length; k++) {
      expect(NIVEAUX[k]!.allure).toBeLessThanOrEqual(NIVEAUX[k - 1]!.allure);
      expect(NIVEAUX[k]!.manches).toBeGreaterThan(NIVEAUX[k - 1]!.manches);
    }
  });

  it("le piège n'est annoncé que sur les deux premiers — le boss se joue sans aide", () => {
    expect(NIVEAUX.map((n) => n.annonce)).toEqual(["toujours", "toujours", "jamais", "jamais", "jamais"]);
  });

  it("le premier niveau ne force aucun piège, le deuxième si", () => {
    expect(NIVEAUX[0]!.cadence).toBe(0);
    expect(NIVEAUX[1]!.cadence).toBeGreaterThan(0);
  });
});

describe("ce qui s'ouvre", () => {
  it("un joueur neuf commence au chapitre 1, niveau 1", () => {
    expect(prochainNiveau({}, tout)).toEqual({ chapitre: 0, ruleId: "sang", niveau: 1 });
  });

  it("un niveau s'ouvre quand le précédent a au moins une étoile", () => {
    expect(niveauOuvert({}, 0, 2, tout)).toBe(false);
    expect(niveauOuvert({ sang: [1, 0, 0, 0, 0] }, 0, 2, tout)).toBe(true);
    expect(prochainNiveau({ sang: [1, 0, 0, 0, 0] }, tout)?.niveau).toBe(2);
  });

  it("le chapitre suivant attend le BOSS, pas le premier niveau", () => {
    expect(chapitreOuvert({ sang: [3, 3, 3, 3, 0] }, 1, tout)).toBe(false);
    expect(chapitreOuvert(boss("sang"), 1, tout)).toBe(true);
    expect(prochainNiveau(boss("sang"), tout)).toEqual({ chapitre: 1, ruleId: "azur", niveau: 1 });
  });

  it("⚠️ un chapitre injouable ici est SAUTÉ, jamais un mur", () => {
    const i = CHAPITRES.indexOf("mainGauche");
    const avant = CHAPITRES[i - 1]!;
    const sansMain = (id: string): boolean => id !== "mainGauche";
    // Le chapitre qui SUIT la main gauche (s'il existe) s'ouvre dès que celui
    // d'AVANT est bouclé ; on le vérifie sur un catalogue réduit.
    const cat = ["sang", "mainGauche", "azur"];
    expect(chapitreOuvert(boss("sang"), 2, sansMain, cat)).toBe(true);
    expect(niveauOuvert(boss(avant), i, 1, sansMain)).toBe(false);
    expect(prochainNiveau(boss("sang"), sansMain, cat)?.ruleId).toBe("azur");
  });

  it("tout réussi : on renvoie au premier niveau qui n'a pas ses trois étoiles", () => {
    const e: Etoiles = {};
    for (const id of CHAPITRES) e[id] = [3, 3, 3, 3, 3];
    e.azur = [3, 2, 3, 3, 3];
    expect(prochainNiveau(e, tout)).toEqual({ chapitre: 1, ruleId: "azur", niveau: 2 });
    e.azur = [3, 3, 3, 3, 3];
    expect(prochainNiveau(e, tout)).toBeNull();
    expect(totalEtoiles(e)).toBe(CHAPITRES.length * NIVEAUX.length * ETOILES_MAX);
  });
});

describe("ce qu'un essai rapporte", () => {
  it("les étoiles sont les vies restantes, et un échec n'en vaut aucune", () => {
    expect(etoilesDeLEssai(true, 3)).toBe(3);
    expect(etoilesDeLEssai(true, 1)).toBe(1);
    expect(etoilesDeLEssai(false, 3)).toBe(0);
  });

  it("⚠️ un second essai moins bon n'efface rien", () => {
    const g = enregistreEssai([3, 0, 0, 0, 0], 1, 1);
    expect(g.cases[0]).toBe(3);
    expect(g.nouvelles).toBe(0);
    expect(g.pieces).toBe(0);
  });

  it("⚠️ seules les étoiles NOUVELLES rapportent", () => {
    expect(enregistreEssai(undefined, 1, 2).pieces).toBe(2 * PIECES_PAR_ETOILE);
    expect(enregistreEssai([2, 0, 0, 0, 0], 1, 3).pieces).toBe(PIECES_PAR_ETOILE);
    expect(enregistreEssai([3, 0, 0, 0, 0], 1, 3).pieces).toBe(0);
  });

  it("battre le boss la première fois boucle le chapitre, et paie le bonus une fois", () => {
    const g = enregistreEssai([3, 3, 3, 3, 0], NIVEAU_BOSS, 1);
    expect(g.chapitreBoucle).toBe(true);
    expect(g.pieces).toBe(PIECES_PAR_ETOILE + PIECES_CHAPITRE);
    const encore = enregistreEssai(g.cases, NIVEAU_BOSS, 3);
    expect(encore.chapitreBoucle).toBe(false);
    expect(encore.pieces).toBe(2 * PIECES_PAR_ETOILE);
  });

  it("la fusion est un maximum case par case, et le compte la porte", () => {
    expect(fusionneEtoiles([3, 1, 0, 0, 0], [1, 2, 1, 0, 0])).toEqual([3, 2, 1, 0, 0]);
    const a = { carnet: { sang: { best: 1, cleared: false, etoiles: [3, 1, 0, 0, 0] } }, serie: { count: 0, lastDay: 0 }, records: {} };
    const b = { carnet: { sang: { best: 1, cleared: false, etoiles: [1, 2, 1, 0, 0] } }, serie: { count: 0, lastDay: 0 }, records: {} };
    expect(fusionne(a, b).carnet.sang!.etoiles).toEqual([3, 2, 1, 0, 0]);
    expect(fusionne(b, a).carnet.sang!.etoiles).toEqual([3, 2, 1, 0, 0]);
  });

  it("une sauvegarde bricolée est bornée", () => {
    expect(litEtoiles([9, -2, "x", 2.7])).toEqual([3, 0, 0, 2, 0]);
    expect(litEtoiles([0, 0])).toBeUndefined();
    expect(litEtoiles(null)).toBeUndefined();
  });
});

describe("les vies dans Session", () => {
  const SANG = ONE_RULES.find((r) => r.id === "sang")!;
  const neuve = (vies?: number, grace?: number): Session =>
    new Session({
      mode: "training",
      rule: SANG,
      rng: mulberry32(7),
      now: 0,
      seed: 7,
      pace: 2,
      longueur: 12,
      vies,
      grace,
    });

  /** Laisse filer le temps : une manche qui demande un geste tue au temps. */
  function laisseFiler(s: Session, t: number): number {
    t += s.round.durationMs + 1;
    s.tick(t);
    // Gel de mort éventuel — plus long que `FREEZE_MS` (820), quel qu'il soit
    // demain : l'aide ne doit pas dépendre de sa valeur exacte.
    t += 2000;
    s.tick(t);
    return t;
  }

  it("⚠️ sans vies, rien n'a changé : la première faute hors échauffement tue", () => {
    const s = neuve();
    let t = 0;
    for (let g = 0; g < 50 && s.phase !== "over"; g++) t = laisseFiler(s, t);
    expect(s.end!.cleared).toBe(false);
    expect(s.end!.vies).toBe(0);
    // Morts sur une manche d'action, une fois l'échauffement fini.
    expect(s.end!.score).toBeGreaterThanOrEqual(GRACE_ROUNDS);
  });

  it("avec trois vies et sans échauffement, trois fautes terminent le run", () => {
    const s = neuve(VIES_NIVEAU, 0);
    let t = 0;
    let fautes = 0;
    for (let g = 0; g < 50 && s.phase !== "over"; g++) {
      const avant = s.vies;
      const action = s.round.steps.length > 0;
      t = laisseFiler(s, t);
      if (action && (s.vies < avant || (s.phase as string) === "over")) fautes++;
    }
    expect(fautes).toBe(VIES_NIVEAU);
    expect(s.end!.vies).toBe(0);
    expect(s.end!.cleared).toBe(false);
  });

  it("une faute coûte une vie et la partie continue", () => {
    const s = neuve(VIES_NIVEAU, 0);
    let t = 0;
    // Première manche d'action : on la laisse filer.
    while (s.round.steps.length === 0) t = laisseFiler(s, t);
    laisseFiler(s, t);
    expect(s.vies).toBe(VIES_NIVEAU - 1);
    expect(s.phase).toBe("playing");
    expect(s.vieJustePerdue).toBe(true);
  });
});

describe("⚠️ un ancien joueur n'est pas renvoyé au chapitre 1", () => {
  const tout = () => true;
  it("un chapitre dont la règle est déjà au carnet est ouvert, sans boss", () => {
    const connues = new Set(CHAPITRES);
    for (let i = 0; i < CHAPITRES.length; i++) {
      expect(chapitreOuvert({}, i, tout, CHAPITRES, connues), CHAPITRES[i]).toBe(true);
      expect(niveauOuvert({}, i, 1, tout, CHAPITRES, connues)).toBe(true);
    }
  });

  it("…mais ses niveaux s'enchaînent toujours dans l'ordre, et rien n'est offert", () => {
    const connues = new Set(CHAPITRES);
    expect(niveauOuvert({}, 3, 2, tout, CHAPITRES, connues)).toBe(false);
    expect(etoilesChapitre({}, CHAPITRES[3]!)).toBe(0);
  });

  it("une règle jamais rencontrée reste verrouillée derrière son boss", () => {
    const connues = new Set([CHAPITRES[0]!]);
    expect(chapitreOuvert({}, 2, tout, CHAPITRES, connues)).toBe(false);
  });

  it("JOUER mène au premier niveau non réussi, pas au premier chapitre verrouillé", () => {
    const connues = new Set(CHAPITRES);
    const e = { [CHAPITRES[0]!]: [3, 3, 3, 3, 3] };
    expect(prochainNiveau(e, tout, CHAPITRES, connues)).toEqual({ chapitre: 1, ruleId: CHAPITRES[1], niveau: 1 });
  });
});
