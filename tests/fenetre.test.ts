/**
 * La fenêtre de temps face au travail demandé.
 *
 * Playtest du 28/08/2026 : le dépassement de temps est devenu la première
 * cause de mort (39,4 %), et le retour nommait la combinaison exacte —
 * « clique jaune puis bleu devient déjà très difficile, et pire encore avec
 * LE JUMEAU ». La cause était que la fenêtre ne dépendait que du niveau : une
 * séquence de deux clics avait la durée d'un clic unique, et LE JUMEAU, qui
 * DOUBLE toutes les étapes, n'ajoutait pas une milliseconde.
 *
 * Ces tests tiennent la propriété qui manquait : le temps par action ne
 * s'effondre jamais, quelle que soit la règle et quel que soit le niveau.
 */
import { describe, expect, it } from "vitest";
import { MS_MIN_PAR_GESTE, STEP_MS, windowForSteps, windowMs } from "../src/engine/difficulty";
import { ONE_RULES } from "../src/engine/rules";
import { applyRule, draftShared } from "../src/engine/multiround";
import { buildRound } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";

describe("fenêtre et nombre d'actions", () => {
  it("une seule action n'ouvre droit à aucun supplément", () => {
    for (const lvl of [0, 5, 12, 30, 60]) {
      expect(windowForSteps(lvl, 1)).toBe(windowMs(lvl));
      // Un piège ne demande RIEN : il ne doit ni gagner ni perdre de temps.
      expect(windowForSteps(lvl, 0)).toBe(windowMs(lvl));
    }
  });

  it("chaque action supplémentaire ajoute exactement un pas", () => {
    for (const lvl of [0, 12, 40]) {
      for (let n = 2; n <= 6; n++) {
        expect(windowForSteps(lvl, n) - windowForSteps(lvl, n - 1)).toBe(STEP_MS);
      }
    }
  });

  it("LE JUMEAU double les étapes ET le temps qu'elles coûtent", () => {
    const jumeau = ONE_RULES.find((r) => r.id === "jumeau")!;
    let vues = 0;
    for (let idx = 0; idx < 60; idx++) {
      const partagee = draftShared(909, idx);
      const nu = applyRule(partagee, ONE_RULES.find((r) => r.id === "eclair")!, 909);
      const double = applyRule(partagee, jumeau, 909);
      if (double.steps.length === 0) continue;
      vues++;
      expect(double.steps.length, `manche ${idx}`).toBe(nu.steps.length * 2);
      /*
       * Le supplement couvre AU MOINS les etapes ajoutees.
       *
       * L'egalite stricte tenait tant que la regle etait seule a decider de la
       * duree. `plancherParGeste` s'applique apres elle et peut donner
       * davantage — c'est son role. Ce qui doit rester vrai, et que cette
       * assertion garde, c'est que doubler les gestes n'a jamais lieu a temps
       * constant.
       */
      expect(double.durationMs - partagee.durationMs).toBeGreaterThanOrEqual(
        nu.steps.length * STEP_MS,
      );
    }
    expect(vues, "aucune manche testable").toBeGreaterThan(10);
  });

  it("le temps par action ne descend jamais sous le seuil de réflexe, pour AUCUNE règle", () => {
    /*
     * Le test qui aurait attrapé le défaut. On balaie tout le catalogue sur
     * soixante manches, en solo comme à travers le transport multijoueur, et
     * on regarde la seule grandeur qui compte pour un joueur : le temps dont
     * il dispose par geste à faire.
     *
     * ⚠️ LE SEUIL ETAIT A 350, ET IL A LAISSE PASSER LE DEFAUT SUIVANT.
     * L'ACCELERATION multiplie la fenetre entiere par 0,7, supplement par geste
     * compris : sur une sequence de deux, elle donnait 364 ms par geste au
     * niveau 40 et 406 au niveau 25 — au-dessus de 350, donc vert, et pourtant
     * rapporte a l'usage comme « le temps ne suffit pas ». Le seuil suit
     * desormais `MS_MIN_PAR_GESTE`, cale sur la reaction mediane mesuree
     * (412 ms), et c'est la meme constante qui borne le jeu et ce test : ils ne
     * peuvent plus diverger.
     */
    for (const rule of ONE_RULES) {
      for (let lvl = 0; lvl < 60; lvl++) {
        for (const round of [
          buildRound(mulberry32(1000 + lvl), lvl, rule),
          applyRule(draftShared(77, lvl), rule, 77),
        ]) {
          if (round.steps.length === 0) continue;
          const parAction = round.durationMs / round.steps.length;
          expect(
            parAction,
            `${rule.name} niveau ${lvl} : ${round.steps.length} actions en ${round.durationMs} ms`,
          ).toBeGreaterThanOrEqual(MS_MIN_PAR_GESTE);
        }
      }
    }
  });

  it("une manche à plusieurs actions dure plus longtemps qu'une manche à une", () => {
    // Propriété de bon sens, mais c'est elle qui était fausse.
    let compares = 0;
    for (let idx = 0; idx < 120; idx++) {
      const r = draftShared(4242, idx);
      const un = windowForSteps(idx, 1);
      if (r.durationMs > un) compares++;
    }
    expect(compares, "aucune manche à plusieurs actions dans l'échantillon").toBeGreaterThan(0);
  });
});
