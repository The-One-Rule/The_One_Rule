/**
 * L'OBJECTIF DE L'ACCUEIL.
 *
 * Demandé par Pierre : « le record doit devenir une motivation naturelle à
 * lancer une partie ». Ce fichier tient la seule chose qui puisse retourner
 * cette intention contre elle-même — montrer un chiffre décourageant.
 */
import { describe, expect, it } from "vitest";
import { MEILLEUR_CONNU, vueBut } from "../src/render/but";
import { PACE_CHOICES, PACE_DEFAULT } from "../src/engine/difficulty";
import { cleEntrainement } from "../src/game/perfs";
import { recordDeSonAllure } from "../src/game/progress";
import type { Save } from "../src/game/progress";

describe("ce que l'accueil donne à battre", () => {
  it("⚠️ ne montre RIEN tant que le joueur n'a pas de chiffre à lui", () => {
    /*
     * LE point du module. La médiane du PREMIER run d'un joueur est de 4
     * manches ; face à un record de 201, c'est un facteur cinquante. Ça ne dit
     * pas « essaie de me battre », ça dit « tu ne seras jamais bon à ce jeu ».
     *
     * Tant qu'il n'a pas de repère, l'accueil garde son chapo — qui explique ce
     * qu'EST le jeu, c'est-à-dire ce dont un nouveau venu a besoin.
     */
    expect(vueBut(0)).toBeNull();
    expect(vueBut(-1), "une sauvegarde bricolée ne doit rien afficher non plus").toBeNull();
  });

  it("montre le sien dès qu'il en a un, avec l'horizon À CÔTÉ", () => {
    const v = vueBut(23)!;
    expect(v.valeur).toBe(23);
    expect(v.horizon).not.toBeNull();
    expect(v.horizon!.score).toBe(MEILLEUR_CONNU.score);
  });

  it("⚠️ l'horizon porte son MODE", () => {
    /*
     * Le 201 a été fait en ENTRAÎNEMENT, à une allure donnée. Le poser nu à
     * côté du bouton du run du jour comparerait deux épreuves différentes —
     * exactement ce que la clé de comparabilité empêche côté serveur. L'écran
     * ne doit pas défaire ce que le stockage protège.
     */
    expect(vueBut(23)!.horizon!.mode.length).toBeGreaterThan(0);
    expect(MEILLEUR_CONNU.mode).toBe("entrainement");
  });

  it("⚠️ n'oppose PAS un record à celui qui l'a déjà battu", () => {
    // Sans cette branche, un joueur à 240 lirait « meilleur connu : 201 » —
    // le jeu lui dirait qu'il est moins bon que quelqu'un qu'il vient de
    // dépasser. La constante est gelée, donc le cas arrivera.
    expect(vueBut(MEILLEUR_CONNU.score)!.horizon).toBeNull();
    expect(vueBut(MEILLEUR_CONNU.score + 39)!.horizon).toBeNull();
    expect(vueBut(MEILLEUR_CONNU.score - 1)!.horizon).not.toBeNull();
  });
});

describe("le record lu sur l'accueil", () => {
  const sauve = (p: Partial<Save>): Save =>
    ({ records: {}, bestTraining: 0, trainingPace: PACE_DEFAULT, ...p }) as Save;

  it("⚠️ suit l'ALLURE du joueur, pas l'allure de référence", () => {
    /*
     * `bestTraining` n'est écrit qu'à `PACE_DEFAULT` — délibérément, un chiffre
     * qui mélange les allures ne veut plus rien dire. Mais l'allure par défaut
     * d'un joueur neuf est maintenant DÉBUT : son `bestTraining` reste donc à
     * zéro tant qu'il ne change pas de vitesse, c'est-à-dire tant qu'il est
     * débutant. L'accueil lui aurait montré « TON RECORD · 0 ».
     */
    const s = sauve({
      trainingPace: 2,
      records: { [cleEntrainement(2)]: 23 },
      bestTraining: 0,
    });
    expect(recordDeSonAllure(s)).toBe(23);
    expect(vueBut(recordDeSonAllure(s))).not.toBeNull();
  });

  it("ne mélange jamais deux allures", () => {
    // Un score fait en RAPIDE ne doit pas s'afficher comme le record de
    // quelqu'un qui joue en DÉBUT : ce n'est pas la même épreuve.
    const s = sauve({ trainingPace: 2, records: { [cleEntrainement(0.8)]: 99 } });
    expect(recordDeSonAllure(s)).toBe(0);
  });

  it("à l'allure de référence, une vieille sauvegarde garde son record", () => {
    // `bestTraining` est la source historique : les sauvegardes écrites avant
    // que les records par allure ne soient inscrits ne portent que lui.
    const s = sauve({ trainingPace: PACE_DEFAULT, records: {}, bestTraining: 41 });
    expect(recordDeSonAllure(s)).toBe(41);
  });

  it("chaque allure du catalogue a une clé lisible et distincte", () => {
    const cles = PACE_CHOICES.map((p) => cleEntrainement(p));
    expect(new Set(cles).size).toBe(PACE_CHOICES.length);
  });
});
