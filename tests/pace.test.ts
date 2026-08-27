import { describe, expect, it } from "vitest";
import { buildRound } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import { ONE_RULES } from "../src/engine/rules";
import {
  PACE_CHOICES,
  PACE_DEFAULT,
  PACE_LABELS,
  windowMs,
} from "../src/engine/difficulty";
import { Session } from "../src/game/session";

/* ------------------------------------------------------------------ *
 * L'allure d'entraînement
 *
 * Elle existe parce que la courbe suppose un joueur ayant AUTOMATISÉ la
 * vérification de sa règle unique — un débutant ne l'a pas encore et meurt
 * avant de l'acquérir. Elle ne doit rien changer d'autre que le temps
 * disponible : ni les scènes, ni le run du jour, ni un duel.
 * ------------------------------------------------------------------ */

const regle = ONE_RULES.find((r) => r.id === "sang")!;

describe("allure d'entraînement", () => {
  it("ne change AUCUNE scène, seulement la fenêtre", () => {
    // Le point qui rend l'ajout sûr : le facteur est posé après `place()`,
    // donc il ne touche pas au flux du RNG. Si ce test tombe, une graine du
    // jour ne produit plus la même partie selon l'allure, et tous les liens
    // de défi déjà partagés deviennent faux.
    for (let level = 0; level < 45; level++) {
      const ref = buildRound(mulberry32(12345), level, regle, undefined, PACE_DEFAULT);
      for (const pace of PACE_CHOICES) {
        const autre = buildRound(mulberry32(12345), level, regle, undefined, pace);

        expect(autre.instructionId).toBe(ref.instructionId);
        expect(autre.text).toBe(ref.text);
        expect(autre.trap).toBe(ref.trap);
        expect(autre.steps).toEqual(ref.steps);
        expect(autre.ents).toEqual(ref.ents);
        // …et la seule différence attendue :
        expect(autre.durationMs).toBe(Math.round(windowMs(level) * pace));
      }
    }
  });

  it("donne bien plus de temps là où le mur se trouve", () => {
    // Constaté en test réel : ça bloque vers la manche 10, où la fenêtre vaut
    // 1080 ms alors qu'un débutant a besoin de 1000 à 1300 ms.
    const lent = PACE_CHOICES.find((p) => p > PACE_DEFAULT)!;
    expect(Math.round(windowMs(10) * lent)).toBeGreaterThanOrEqual(1500);
    expect(Math.round(windowMs(20) * lent)).toBeGreaterThanOrEqual(1300);
  });

  it("n'a AUCUN effet hors entraînement", () => {
    // Le run du jour doit rester identique pour tout le monde : sinon un score
    // ne se compare plus à rien et la graine partagée ne veut plus rien dire.
    const lent = PACE_CHOICES.find((p) => p > PACE_DEFAULT)!;
    for (const mode of ["daily", "ranked"] as const) {
      const s = new Session({ mode, rule: regle, rng: mulberry32(7), now: 0, seed: 7, pace: lent });
      expect(s.pace, `${mode} ne doit pas suivre l'allure`).toBe(PACE_DEFAULT);
      expect(s.round.durationMs).toBe(windowMs(0));
    }

    const t = new Session({
      mode: "training",
      rule: regle,
      rng: mulberry32(7),
      now: 0,
      seed: 7,
      pace: lent,
    });
    expect(t.pace).toBe(lent);
    expect(t.round.durationMs).toBe(Math.round(windowMs(0) * lent));
  });

  it("donne l'échauffement à l'entraînement aussi", () => {
    // Il était à zéro en entraînement et à trois dans le run du jour : le mode
    // censé servir à apprendre tuait à la première faute, alors que l'épreuve
    // pardonnait. C'était inversé.
    for (const mode of ["training", "daily"] as const) {
      const s = new Session({ mode, rule: regle, rng: mulberry32(3), now: 0, seed: 3 });
      expect(s.inGrace, `${mode} doit commencer en échauffement`).toBe(true);
    }
  });

  it("chaque allure porte un libellé", () => {
    for (const p of PACE_CHOICES) expect(PACE_LABELS[p]).toBeTruthy();
    expect(PACE_CHOICES).toContain(PACE_DEFAULT);
  });
});
