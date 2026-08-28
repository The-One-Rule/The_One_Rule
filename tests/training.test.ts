/**
 * Le tirage de l'entraînement.
 *
 * Mesuré sur le playtest du 28/08/2026 : sur 33 parties, LE SANG est sorti 30
 * fois, LE JUMEAU 3, et les dix autres règles zéro. Ce n'était pas de la
 * malchance — l'entraînement ne tirait que parmi les règles DÉJÀ rencontrées,
 * avec LE SANG pour unique repli. Un joueur neuf jouait donc LE SANG, ce qui
 * marquait LE SANG comme rencontrée, ce qui laissait le pool à LE SANG.
 *
 * Ces tests tiennent les propriétés qui empêchent la boucle de se refermer.
 */
import { describe, expect, it } from "vitest";
import { ruleOfDay, trainingRule } from "../src/game/daily";
import { ONE_RULES } from "../src/engine/rules";
import { mulberry32 } from "../src/engine/rng";

const base = (over: Partial<Parameters<typeof trainingRule>[0]> = {}) => ({
  duJour: ruleOfDay(100).id,
  connues: new Set<string>(),
  derniere: null,
  sansMaintien: false,
  rng: mulberry32(7),
  ...over,
});

describe("règle d'entraînement", () => {
  it("ouvre TOUT le catalogue à un joueur neuf, sauf la règle du jour", () => {
    // Le cas exact du bug : carnet vide. Vingt tirages doivent produire bien
    // plus d'une règle — avant, ils en produisaient une seule.
    const duJour = ruleOfDay(100).id;
    const rng = mulberry32(1234);
    const vues = new Set<string>();
    let derniere: string | null = null;
    for (let i = 0; i < 40; i++) {
      const r = trainingRule(base({ duJour, connues: new Set(), derniere, rng }));
      vues.add(r.id);
      derniere = r.id;
    }
    expect(vues.size, `un joueur neuf n'a vu que ${[...vues].join(",")}`).toBeGreaterThan(5);
    expect(vues.has(duJour), "la règle du jour a été brûlée en entraînement").toBe(false);
  });

  it("sert d'abord ce qui n'a jamais été rencontré", () => {
    // La découverte passe avant la répétition : c'est ce qui fait apprendre
    // le catalogue en jouant.
    const duJour = ruleOfDay(100).id;
    const jamais = ONE_RULES.find((r) => r.id !== duJour)!;
    const connues = new Set(ONE_RULES.filter((r) => r.id !== jamais.id).map((r) => r.id));
    for (let s = 1; s < 20; s++) {
      const r = trainingRule(base({ duJour, connues, rng: mulberry32(s) }));
      expect(r.id, "une règle déjà connue est passée avant une inconnue").toBe(jamais.id);
    }
  });

  it("ne resert jamais la précédente tant qu'il reste autre chose", () => {
    const duJour = ruleOfDay(100).id;
    const connues = new Set(ONE_RULES.map((r) => r.id));
    let derniere: string | null = null;
    for (let i = 0; i < 60; i++) {
      const r = trainingRule(base({ duJour, connues, derniere, rng: mulberry32(i + 1) }));
      expect(r.id, `répétition immédiate de ${r.id}`).not.toBe(derniere);
      derniere = r.id;
    }
  });

  it("n'a jamais besoin d'une touche maintenue sur un appareil tactile", () => {
    const connues = new Set(ONE_RULES.map((r) => r.id));
    for (let s = 1; s < 40; s++) {
      const r = trainingRule(
        base({ connues, sansMaintien: true, rng: mulberry32(s) }),
      );
      expect(r.watchRelease, `${r.name} exige une touche maintenue`).toBeUndefined();
    }
  });

  it("rend toujours une règle, même dans le cas dégénéré", () => {
    // Catalogue d'une seule règle, qui se trouve être celle du jour : mieux
    // vaut la resservir que de n'avoir aucune partie à lancer.
    const une = [ONE_RULES[0]!];
    const r = trainingRule(base({ duJour: une[0]!.id, derniere: une[0]!.id }), une);
    expect(r).toBe(une[0]);
  });

  it("est déterministe à graine donnée", () => {
    const a = trainingRule(base({ rng: mulberry32(42) }));
    const b = trainingRule(base({ rng: mulberry32(42) }));
    expect(a.id).toBe(b.id);
  });
});
