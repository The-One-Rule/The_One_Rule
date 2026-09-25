/**
 * LA SAUVEGARDE EST UNE DONNÉE QU'ON NE CONTRÔLE PAS.
 *
 * ⚠️ Mesuré dans le navigateur avant correctif : avec `encountered: null` dans
 * le stockage, l'accueil s'affichait normalement et JOUER ne répondait plus —
 * `Object.keys` levait, la boucle de clic mourait, et le joueur n'avait rien à
 * l'écran pour comprendre. C'est la pire forme de panne : muette, et sans
 * recours pour celui qui la subit.
 *
 * Ce fichier tient la seule propriété qui compte : QUOI QU'ON RELISE, on rend
 * une sauvegarde jouable.
 */
import { describe, expect, it } from "vitest";
import { normaliseSave } from "../src/game/progress";

const jouable = (s: ReturnType<typeof normaliseSave>): void => {
  // Ce que le jeu fait à chaque écran, et qui levait.
  expect(() => Object.keys(s.encountered)).not.toThrow();
  expect(Array.isArray(s.recent)).toBe(true);
  expect(typeof s.daily.day).toBe("number");
  expect(typeof s.metrics.on).toBe("boolean");
  expect(typeof s.trainingPace).toBe("number");
  expect(Number.isFinite(s.trainingPace)).toBe(true);
  expect(s.lang === "fr" || s.lang === "en").toBe(true);
  expect(Object.values(s.records).every((x) => typeof x === "number")).toBe(true);
};

describe("relire une sauvegarde bricolée", () => {
  it("⚠️ un champ du mauvais type ne tue plus le jeu", () => {
    const s = normaliseSave({
      v: 1,
      encountered: null,
      recent: "non",
      daily: 3,
      metrics: null,
      records: 7,
      streak: false,
      quests: [],
      compte: 0,
      trainingPace: "vite",
      bestTraining: "x",
      lang: 42,
      dejoue: "oui",
    });
    jouable(s);
    expect(s.encountered).toEqual({});
    expect(s.recent).toEqual([]);
    expect(s.trainingPace).toBe(2);
    expect(s.lang).toBe("fr");
  });

  it("une sauvegarde écrite du temps de DÉJOUER se relit, et oublie le réglage", () => {
    // Le raccourci est retiré ; son réglage traîne dans les sauvegardes déjà
    // écrites. Il ne doit ni casser la relecture, ni survivre à la réécriture.
    const s = normaliseSave({ v: 1, dejoue: { on: true, touche: "F", cote: "droite" } });
    jouable(s);
    expect("dejoue" in s).toBe(false);
  });

  it("rien, un tableau, une chaîne : on rend une sauvegarde neuve", () => {
    for (const brut of [undefined, null, [1, 2, 3], "sauvegarde", 7, true]) {
      const s = normaliseSave(brut);
      jouable(s);
      expect(s.v).toBe(1);
    }
  });

  it("⚠️ ce qui est VALIDE est gardé — on ne repart pas de zéro pour un champ", () => {
    const s = normaliseSave({
      v: 1,
      anonId: "abc123",
      encountered: { sang: { best: 23, cleared: true, pieges: 4, serie: 9, sansFaute: true, runs: 12 }, casse: null },
      recent: [3, 5, "x", 8],
      daily: { day: 260, played: true, score: 31, cleared: false, essais: 2 },
      bestTraining: 41,
      trainingPace: 1.5,
      lang: "en",
      onboarded: true,
      records: { "entrainement:1.5:abc": 30, mauvais: "non" },
      compte: { revendiquePar: "u-1", glyphe: 17 },
      metrics: { on: false, asked: true, firstDay: 250, lastDay: 260 },
    });
    expect(s.anonId).toBe("abc123");
    expect(s.encountered.sang).toEqual({ best: 23, cleared: true, pieges: 4, serie: 9, sansFaute: true, runs: 12 });
    // l'entrée cassée disparaît, les autres restent
    expect(s.encountered.casse).toBeUndefined();
    expect(s.recent).toEqual([3, 5, 8]);
    expect(s.daily).toEqual({ day: 260, played: true, score: 31, cleared: false, essais: 2 });
    expect(s.bestTraining).toBe(41);
    expect(s.trainingPace).toBe(1.5);
    expect(s.lang).toBe("en");
    expect(s.onboarded).toBe(true);
    expect(s.records).toEqual({ "entrainement:1.5:abc": 30 });
    expect(s.compte).toEqual({ revendiquePar: "u-1", glyphe: 17 });
    expect(s.metrics.on).toBe(false);
  });

  it("⚠️ « absent vaut NON » tient pour les deux drapeaux déjà-vu", () => {
    // Les poser à faux et les laisser absents ne sont pas la même chose pour
    // `fusionne` ni pour les tests d'arrivée : on ne les invente pas.
    const vierge = normaliseSave({ v: 1 });
    expect("onboarded" in vierge).toBe(false);
    expect("avisVu" in vierge).toBe(false);
    expect(normaliseSave({ v: 1, onboarded: "oui", avisVu: 1 }).onboarded).toBeUndefined();
    expect(normaliseSave({ v: 1, onboarded: true, avisVu: true }).avisVu).toBe(true);
  });
});
