/**
 * L'ÉCHELLE DE MAÎTRISE — six cases.
 *
 * Demandée par Pierre sous la forme « GAUCHER ███████░░░ 72 % ». La maquette
 * dit l'inverse et elle a raison : six cases se jouent, un pourcentage non.
 *
 * Ce fichier tient les deux propriétés qui décident si la maîtrise veut dire
 * quelque chose : aucune case ne se donne, et aucune case ne se reprend.
 */
import { describe, expect, it } from "vitest";
import {
  ALLURES_MAITRISE,
  SERIE_EPREUVE,
  echelleMaitrise,
  estParfaite,
  franchies,
  lisRun,
} from "../src/game/echelle";
import { MANCHES_MAITRISE } from "../src/game/maitrise";
import { ONE_RULES } from "../src/engine/rules";
import { majCarnet } from "../src/game/progress";
import type { RuleRecord } from "../src/game/progress";

const PIEGEUSE = ONE_RULES.find((r) => r.traps)!;
const SANS_PIEGE = ONE_RULES.find((r) => !r.traps)!;

const plein = (): RuleRecord => ({
  best: 40,
  cleared: true,
  pieges: 3,
  parAllure: Object.fromEntries(ALLURES_MAITRISE.map((a) => [String(a), MANCHES_MAITRISE])),
  serie: SERIE_EPREUVE,
  sansFaute: true,
});

describe("les six cases", () => {
  it("il y en a exactement six, quelle que soit la règle", () => {
    for (const r of ONE_RULES) {
      expect(echelleMaitrise(r, undefined), r.id).toHaveLength(6);
      expect(echelleMaitrise(r, plein()), r.id).toHaveLength(6);
    }
  });

  it("une règle jamais rencontrée n'en a aucune", () => {
    for (const r of ONE_RULES) {
      expect(franchies(echelleMaitrise(r, undefined)), r.id).toBe(0);
    }
  });

  it("le carnet plein les franchit toutes", () => {
    for (const r of ONE_RULES) {
      expect(estParfaite(r, plein()), r.id).toBe(true);
    }
  });

  it("⚠️ la case ÉPROUVÉE est REMPLACÉE, jamais offerte", () => {
    /*
     * LE point de l'échelle. Sept règles sur seize ne portent pas `traps` :
     * leur demander un piège déjoué rendrait la case inatteignable, mais la
     * leur DONNER rendrait leur carte maîtrisée à meilleur compte — et la
     * maîtrise ne voudrait plus rien dire.
     *
     * Un carnet qui a tout SAUF la case éprouvée doit rester à 5/6 dans les
     * deux cas.
     */
    const sansEpreuve = (): RuleRecord => ({ ...plein(), pieges: 0, serie: 0 });
    expect(franchies(echelleMaitrise(PIEGEUSE, sansEpreuve())), "règle piégeuse").toBe(5);
    expect(franchies(echelleMaitrise(SANS_PIEGE, sansEpreuve())), "règle sans piège").toBe(5);
  });

  it("les deux formes de l'épreuve ne se confondent pas", () => {
    // Une règle piégeuse ne se libère pas avec une série, et l'inverse.
    const serieSeule: RuleRecord = { best: 40, cleared: true, pieges: 0, serie: SERIE_EPREUVE };
    const piegeSeul: RuleRecord = { best: 40, cleared: true, pieges: 2, serie: 0 };
    expect(echelleMaitrise(PIEGEUSE, serieSeule)[1]!.faite).toBe(false);
    expect(echelleMaitrise(PIEGEUSE, piegeSeul)[1]!.faite).toBe(true);
    expect(echelleMaitrise(SANS_PIEGE, serieSeule)[1]!.faite).toBe(true);
    expect(echelleMaitrise(SANS_PIEGE, piegeSeul)[1]!.faite).toBe(false);
  });

  it("⚠️ un record global ne remplit AUCUNE case d'allure", () => {
    /*
     * `best` ne dit pas à quelle allure il a été obtenu. Quarante manches
     * faites à DÉBUT ne prouvent rien sur RAPIDE — et depuis que DÉBUT est
     * l'allure par défaut d'un joueur neuf, c'est le cas le plus fréquent.
     */
    const gros: RuleRecord = { best: 999, cleared: true, pieges: 9 };
    const cases = echelleMaitrise(PIEGEUSE, gros);
    expect(cases.filter((c) => c.id.startsWith("allure")).every((c) => !c.faite)).toBe(true);
  });

  it("dit ce qu'il RESTE, pour ne pas laisser deviner", () => {
    const presque: RuleRecord = { best: 20, cleared: false, pieges: 1, parAllure: { "1": 11 } };
    const normale = echelleMaitrise(PIEGEUSE, presque).find((c) => c.id === "allure10")!;
    expect(normale.faite).toBe(false);
    expect(normale.reste).toBe(MANCHES_MAITRISE - 11);
  });
});

describe("ce qu'un run apprend, lu dans les marques du moteur", () => {
  const suite = (n: number, m: string): string[] => Array.from({ length: n }, () => m);

  it("compte la plus longue série de manches propres", () => {
    // 🟩 propre · 🟦 piège déjoué · 🟨 faute d'échauffement · 🟥 la mort
    expect(lisRun([...suite(4, "🟩"), "🟨", ...suite(7, "🟩"), "🟥"]).serie).toBe(7);
    expect(lisRun(["🟩", "🟦", "🟩", "🟥"]).serie, "un piège déjoué NE casse PAS la série").toBe(3);
    expect(lisRun([]).serie).toBe(0);
  });

  it("⚠️ SANS FAUTE ignore la mort finale, mais pas les fautes d'échauffement", () => {
    /*
     * Un run d'entraînement se termine TOUJOURS par une mort : l'exiger
     * rendrait la case inatteignable ailleurs que sur un run du jour bouclé.
     * Ce qu'on regarde, ce sont les 🟨 — les fautes commises pendant
     * l'échauffement, là où elles ne coûtent rien et ne se voient pas.
     */
    expect(lisRun([...suite(MANCHES_MAITRISE, "🟩"), "🟥"]).sansFaute).toBe(true);
    expect(lisRun(["🟨", ...suite(MANCHES_MAITRISE, "🟩"), "🟥"]).sansFaute).toBe(false);
    // …et il faut avoir tenu le palier : trois manches propres ne sont pas un
    // run sans faute, c'est un run court.
    expect(lisRun([...suite(3, "🟩"), "🟥"]).sansFaute).toBe(false);
  });
});

describe("ce que le carnet retient d'un run", () => {
  it("⚠️ une case franchie ne se reprend JAMAIS", () => {
    /*
     * Union et maximum, jamais une affectation — la même loi que la fusion des
     * comptes. Un second run raté ne doit rien effacer : voir une case
     * s'éteindre après avoir joué serait le pire retour possible.
     */
    const bon = majCarnet(undefined, 30, false, 2, { allure: 1, serie: 20, sansFaute: true });
    const apres = majCarnet(bon, 2, false, 0, { allure: 1, serie: 1, sansFaute: false });
    expect(apres.best).toBe(30);
    expect(apres.serie).toBe(20);
    expect(apres.sansFaute).toBe(true);
    expect(apres.parAllure?.["1"]).toBe(30);
  });

  it("chaque allure garde SON meilleur, sans écraser les autres", () => {
    let rec = majCarnet(undefined, 18, false, 0, { allure: 1.5, serie: 5, sansFaute: false });
    rec = majCarnet(rec, 11, false, 0, { allure: 1, serie: 5, sansFaute: false });
    expect(rec.parAllure).toEqual({ "1.5": 18, "1": 11 });
  });

  it("⚠️ une entrée sans run ne porte AUCUN des trois champs", () => {
    // « Absent vaut zéro » est la doctrine du carnet : les poser à `{}`, `0` et
    // `false` sur chaque entrée gonflerait toutes les sauvegardes et tout ce
    // qui transite, pour ne rien dire de plus que leur absence.
    const nu = majCarnet(undefined, 5, false, 0);
    expect(Object.keys(nu).sort()).toEqual(["best", "cleared", "pieges"]);
  });
});
