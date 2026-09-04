import { describe, expect, it } from "vitest";
import { buildRound } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import { ONE_RULES } from "../src/engine/rules";
import {
  DAILY_LENGTH,
  PACE_CHOICES,
  PACE_DEFAULT,
  PACE_LABELS,
  windowForSteps,
  windowMs,
} from "../src/engine/difficulty";
import { Session } from "../src/game/session";
import { cleEntrainement } from "../src/game/perfs";
import { readFileSync } from "node:fs";

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
    /*
     * La référence se lit sur le nombre d'ÉTAPES de la manche, pas sur
     * `windowMs(0)` seul : depuis que la fenêtre suit le travail demandé, une
     * manche à deux clics dure plus longtemps qu'une manche à un clic. Écrit
     * en dur, ce test passait par chance — parce que la manche 0 de cette
     * graine n'a qu'une étape.
     */
    for (const mode of ["daily", "ranked"] as const) {
      const s = new Session({ mode, rule: regle, rng: mulberry32(7), now: 0, seed: 7, pace: lent });
      expect(s.pace, `${mode} ne doit pas suivre l'allure`).toBe(PACE_DEFAULT);
      expect(s.round.durationMs).toBe(windowForSteps(0, s.round.steps.length));
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
    expect(t.round.durationMs).toBe(
      Math.round(windowForSteps(0, t.round.steps.length) * lent),
    );
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

/* ------------------------------------------------------------------ *
 * L'ÉCHELLE DES ALLURES
 * ------------------------------------------------------------------ */

describe("l'échelle des allures", () => {
  /*
   * Demandé par Pierre après playtest : « la différence entre les niveaux est
   * vraiment trop énorme … les nouveaux joueurs galèrent vraiment à comprendre
   * sur leur première run ».
   *
   * Ce bloc tient les deux propriétés qui font qu'une échelle est une échelle,
   * et le défaut qui décide de la première impression du jeu.
   */

  it("est ordonnée de la plus lente à la plus rapide, sans doublon", () => {
    // `renderPace` la retourne pour l'affichage ; une jauge qui descend de
    // gauche à droite se lit à l'envers, et un doublon donnerait deux segments
    // qui se disputent la même clé de record.
    const tri = [...PACE_CHOICES].sort((a, b) => b - a);
    expect([...PACE_CHOICES]).toEqual(tri);
    expect(new Set(PACE_CHOICES).size).toBe(PACE_CHOICES.length);
  });

  it("⚠️ un joueur neuf démarre à l'allure la PLUS LENTE", () => {
    /*
     * C'est la première impression du jeu, et elle s'est déjà trompée deux
     * fois : NORMAL d'abord, puis DÉCOUVERTE. Ajouter une allure plus lente
     * sans déplacer le défaut la rendrait invisible — exactement le défaut
     * rapporté la première fois, « le mode entraînement est plutôt difficile
     * actuellement », alors que le réglage existait déjà.
     */
    // On lit la SOURCE : la sauvegarde neuve est fabriquée par une fonction
    // privée, et l'exporter pour un test ferait de son intérieur une API.
    const laPlusLente = Math.max(...PACE_CHOICES);
    const src = readFileSync("src/game/progress.ts", "utf8");
    expect(src).toContain(`trainingPace: ${laPlusLente},`);
  });

  it("⚠️ l'allure la plus lente laisse VRAIMENT le temps, jusqu'au bout", () => {
    /*
     * Le chiffre qui a motivé l'ajout d'un quatrième cran.
     *
     * Un débutant fait trois gestes conscients par manche — lire la consigne,
     * la confronter à sa règle, chercher la cible — soit environ 1100 ms tant
     * que le deuxième n'est pas réflexe. À 1.5, la manche 39 donnait 1140 ms :
     * ça tenait à quarante millisecondes, et seulement sur une consigne à une
     * action. Ce n'est pas une marge, c'est une coïncidence.
     *
     * On exige donc une vraie marge sur la manche la plus serrée du run.
     */
    const derniere = DAILY_LENGTH - 1;
    const fenetre = windowMs(derniere) * Math.max(...PACE_CHOICES);
    expect(fenetre).toBeGreaterThan(1400);
  });

  it("chaque allure a sa propre clé de record", () => {
    // C'est ce qui rend l'ajout d'une allure INOFFENSIF : rien d'existant ne
    // change de clé, donc aucun record ne se trouve invalidé ni pollué.
    const cles = new Set(PACE_CHOICES.map((v) => cleEntrainement(v)));
    expect(cles.size).toBe(PACE_CHOICES.length);
  });
});
