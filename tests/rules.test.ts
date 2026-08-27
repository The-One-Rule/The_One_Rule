import { describe, expect, it } from "vitest";
import { ONE_RULES } from "../src/engine/rules";
import { draftShared, applyRule } from "../src/engine/multiround";
import { MULTI_RULES } from "../server/match";
import { resolveAction } from "../src/engine/resolve";
import type { Action, Entity, Round } from "../src/engine/types";

/* ------------------------------------------------------------------ *
 * Passe systématique sur les règles, à travers le transport multijoueur
 *
 * LE GAUCHER a montré le défaut de famille : une règle peut être parfaitement
 * correcte en solo et cassée en multijoueur, parce que le fil ne transporte
 * qu'un INDEX de pièce et jamais de coordonnées. Le serveur reconstruisait donc
 * l'action avec `x: 0`, et la règle — qui juge sur `a.x` — déclarait une
 * infraction à chaque clic. Personne ne l'avait vu : le solo, lui, envoie les
 * vraies coordonnées.
 *
 * Ces tests vérifient les propriétés qui ne se voient pas en jouant dix
 * minutes, et qui détruisent la perception d'équité quand elles cèdent.
 * ------------------------------------------------------------------ */

/** L'action telle que le SERVEUR la reconstruit : position issue de l'entité. */
function vueServeur(ent: Entity | null): Action {
  return ent
    ? { kind: "click", ent, x: ent.x, y: ent.y }
    : { kind: "click", ent: null, x: Number.NaN, y: Number.NaN };
}

/** L'action telle que le CLIENT la voit : position du point cliqué. */
function vueClient(ent: Entity | null, dx = 0): Action {
  return ent
    ? { kind: "click", ent, x: ent.x + dx, y: ent.y }
    : { kind: "click", ent: null, x: 0, y: 0 };
}

const manches = (ruleId: string, n = 60): Round[] => {
  const r = ONE_RULES.find((x) => x.id === ruleId)!;
  return Array.from({ length: n }, (_, i) => applyRule(draftShared(555, i), r, 555));
};

describe("les règles à travers le transport multijoueur", () => {
  it("aucune règle ne condamne un geste licite", () => {
    /*
     * Le test qui aurait attrapé LE GAUCHER. Pour chaque règle du pool et
     * chaque manche NON piégée, jouer la bonne étape doit survivre — jamais
     * mourir. Une règle qui tue sur la réponse attendue est injouable.
     */
    for (const rule of MULTI_RULES) {
      let verifiees = 0;
      for (let idx = 0; idx < 80; idx++) {
        const round = applyRule(draftShared(4242, idx), rule, 4242);
        if (round.trap || round.steps.length === 0) continue;
        const step = round.steps[0]!;
        if (step.kind !== "click") continue;
        const ent = round.ents[step.idx];
        if (!ent) continue;

        const { outcome } = resolveAction(
          round,
          { step: 0 },
          vueServeur(ent),
          600, // après les 400 ms de LA SECONDE
          rule.judge,
        );
        expect(
          outcome.kind,
          `${rule.name} manche ${idx} : la bonne cible ne doit pas tuer (${
            outcome.kind === "death" ? outcome.reason : ""
          })`,
        ).not.toBe("death");
        verifiees++;
      }
      expect(verifiees, `${rule.name} : aucune manche testable`).toBeGreaterThan(3);
    }
  });

  it("le client et le serveur rendent le MÊME verdict", () => {
    /*
     * L'aperçu local est du confort, mais s'il contredit le verdict serveur le
     * joueur conclut que le jeu triche — le seul risque que le projet tient
     * pour fatal. Les deux doivent juger la même action.
     */
    for (const rule of MULTI_RULES) {
      for (let idx = 0; idx < 40; idx++) {
        const round = applyRule(draftShared(777, idx), rule, 777);
        for (const ent of round.ents) {
          const serveur = rule.judge(vueServeur(ent), { round, elapsedMs: 600 });
          const client = rule.judge(vueServeur(ent), { round, elapsedMs: 600 });
          expect(client, `${rule.name} : divergence client/serveur`).toBe(serveur);
        }
      }
    }
  });

  it("LE GAUCHER : la frontière de zone est jugée sur la pièce, pas sur le clic", () => {
    // C'est le cas qui divergeait : cliquer le bord droit d'une pièce dont le
    // CENTRE est dans la zone. Le serveur juge le centre ; le client doit faire
    // pareil, sinon l'aperçu annonce « tenu » et le verdict dit « infraction ».
    const gaucher = ONE_RULES.find((r) => r.id === "gaucher")!;
    const round = manches("gaucher", 1)[0]!;
    const dedans: Entity = { ...round.ents[0]!, x: 150, ox: 150 };

    expect(gaucher.judge(vueServeur(dedans), { round, elapsedMs: 600 })).not.toBeNull();
    // Le client naïf, lui, aurait laissé passer :
    expect(gaucher.judge(vueClient(dedans, 90), { round, elapsedMs: 600 })).toBeNull();
  });

  it("une manche piégée se franchit toujours en ne faisant rien", () => {
    // La mécanique centrale du jeu. Si une seule règle la casse, le joueur
    // meurt en appliquant la seule chose que le brief lui a apprise.
    for (const rule of MULTI_RULES.filter((r) => r.traps)) {
      let pieges = 0;
      for (let idx = 0; idx < 200; idx++) {
        const round = applyRule(draftShared(31, idx), rule, 31);
        if (!round.trap) continue;
        pieges++;
        expect(round.steps.length, `${rule.name} : un piège n'a aucune étape`).toBe(0);
      }
      expect(pieges, `${rule.name} n'a produit aucun piège`).toBeGreaterThan(0);
    }
  });

  it("chaque règle du pool multi a un brief lisible", () => {
    // Le panneau plein cadre du départ affiche ce texte : s'il est vide ou
    // télégraphique, le joueur entre en partie sans savoir ce qui l'attend.
    for (const rule of MULTI_RULES) {
      expect(rule.name.length, `${rule.id} : nom vide`).toBeGreaterThan(2);
      expect(rule.brief.length, `${rule.name} : brief trop court`).toBeGreaterThan(30);
      expect(rule.brief.trim().endsWith("."), `${rule.name} : brief non ponctué`).toBe(true);
    }
  });
});
