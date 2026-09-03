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
import type { OneRule } from "../src/engine/types";
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
    /*
     * Le cas exact du bug du jour 2 : LE SANG sortait 30 fois sur 33.
     *
     * ⚠️ Le carnet GROSSIT ici, comme dans le jeu — `main.ts` inscrit la règle
     * à chaque fin de run. La version precedente de ce test le gardait vide
     * sur quarante tirages, un etat qui n'existe pas en jeu : elle passait
     * donc pour de bonnes raisons mais mesurait une situation fictive.
     */
    const duJour = ruleOfDay(100).id;
    const rng = mulberry32(1234);
    const connues = new Set<string>();
    const vues = new Set<string>();
    let derniere: string | null = null;
    for (let i = 0; i < 40; i++) {
      const r = trainingRule(base({ duJour, connues, derniere, rng }));
      vues.add(r.id);
      connues.add(r.id);
      derniere = r.id;
    }
    expect(vues.size, `un joueur neuf n'a vu que ${[...vues].join(",")}`).toBeGreaterThan(5);
    expect(vues.has(duJour), "la règle du jour a été brûlée en entraînement").toBe(false);
  });

  it("sert les règles QUI PIÈGENT en premier, puis rend la main", () => {
    /*
     * MESURÉ sur les premiers runs réels : 78 % ne rencontrent AUCUN piège,
     * pour un score médian de 4 manches. Seules 5 règles sur 12 portent
     * `traps`, donc un débutant avait 7 chances sur 12 de découvrir le jeu
     * sans jamais voir ce qui le distingue — et `FORCED_TRAP_ROUNDS` restait
     * alors sans effet, puisqu'il ne se déclenche que sur une règle piégeante.
     *
     * La préférence doit se DISSOUDRE : passé les cinq, le tirage reprend son
     * cours. Sans ça on aurait recréé le bug du jour 2, en plus subtil.
     */
    const duJour = "aucune";
    const rng = mulberry32(99);
    const connues = new Set<string>();
    const ordre: OneRule[] = [];
    let derniere: string | null = null;
    // Le catalogue entier, pas un nombre en dur : ce test s'est mis a echouer
    // en ajoutant des regles, alors que ce qu'il verifie n'a pas change.
    for (let i = 0; i < ONE_RULES.length; i++) {
      const r = trainingRule(base({ duJour, connues, derniere, rng }));
      ordre.push(r);
      connues.add(r.id);
      derniere = r.id;
    }
    const piegeantes = ONE_RULES.filter((r) => r.traps).length;
    expect(piegeantes, "le catalogue doit contenir des règles piégeantes").toBeGreaterThan(2);

    // Les premières servies piègent toutes...
    for (let i = 0; i < piegeantes; i++) {
      expect(ordre[i]!.traps, `la règle ${i + 1} (${ordre[i]!.id}) ne piège pas`).toBe(true);
    }
    // ...et le reste du catalogue sort ensuite, sans être bloqué.
    expect(new Set(ordre.map((r) => r.id)).size).toBe(ONE_RULES.length);
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
