/**
 * LA PRIORITÉ DE LA CARTE DU RUN DU JOUR.
 *
 * Ce fichier existe à cause d'un bug rapporté par Pierre en ces termes : « la
 * run du jour est buguée, elle ne se valide pas même quand on la termine ».
 *
 * La cause n'était pas dans le run — le score et le `cleared` étaient
 * correctement enregistrés. Elle était dans l'AFFICHAGE : en passant à trois
 * essais, la carte s'était mise à ne parler que du nombre d'essais restants, et
 * l'état TERMINÉ avait disparu de la priorité. Un joueur qui bouclait les
 * quarante manches lisait « 2 ESSAIS RESTANTS », l'accueil continuait
 * d'annoncer la règle du jour, et rien nulle part ne disait qu'il avait réussi.
 *
 * C'est la troisième fois que ce projet paie une priorité écrite en ternaires
 * successifs (après `plate.ts` et `seat.ts`), et la leçon est toujours la même :
 * ça se lit juste et ça se comporte faux.
 */
import { describe, expect, it } from "vitest";
import { DAILY_ESSAIS } from "../src/engine/difficulty";
import { vueDuJour, scoreDuJour } from "../src/render/jour";
import type { Save } from "../src/game/progress";

const AUJ = 300;
const sauve = (daily: Partial<Save["daily"]>): Save =>
  ({ daily: { day: AUJ, played: false, score: 0, cleared: false, ...daily } }) as Save;

describe("ce que la carte du jour annonce", () => {
  it("jamais joué : elle propose", () => {
    const v = vueDuJour(sauve({}), AUJ);
    expect(v.etat).toBe("vierge");
    expect(v.restants).toBe(DAILY_ESSAIS);
    expect(v.verrouille).toBe(false);
    expect(v.acquis).toBe(false);
  });

  it("joué et raté : elle dit ce qui reste", () => {
    const v = vueDuJour(sauve({ played: true, score: 7, essais: 1 }), AUJ);
    expect(v.etat).toBe("reste");
    expect(v.restants).toBe(DAILY_ESSAIS - 1);
    expect(v.verrouille).toBe(false);
  });

  it("⚠️ TERMINÉ prime sur les essais restants", () => {
    /*
     * LE BUG, tenu ici. Avec deux essais encore disponibles, l'ancien code
     * répondait « il t'en reste 2 » à quelqu'un qui venait de finir le run.
     *
     * Casser le correctif — retirer `acquis` de la priorité de `vueDuJour` —
     * fait tomber cette assertion et elle seule. Éprouvé.
     */
    const v = vueDuJour(sauve({ played: true, score: 40, cleared: true, essais: 1 }), AUJ);
    expect(v.etat).toBe("termine");
    expect(v.acquis).toBe(true);
    // …et il peut REJOUER : le classement départage sur la durée.
    expect(v.verrouille).toBe(false);
    expect(v.restants).toBe(DAILY_ESSAIS - 1);
  });

  it("terminé au DERNIER essai : terminé quand même, et verrouillé", () => {
    // Les deux conditions se rencontrent ici, et l'ordre compte : dire
    // « REVIENS DEMAIN » à quelqu'un qui vient de gagner efface sa victoire.
    const v = vueDuJour(
      sauve({ played: true, score: 40, cleared: true, essais: DAILY_ESSAIS }),
      AUJ,
    );
    expect(v.etat).toBe("termine");
    expect(v.verrouille).toBe(true);
  });

  it("trois essais brûlés sans y arriver : à demain", () => {
    const v = vueDuJour(sauve({ played: true, score: 9, essais: DAILY_ESSAIS }), AUJ);
    expect(v.etat).toBe("epuise");
    expect(v.verrouille).toBe(true);
    expect(v.acquis).toBe(false);
  });

  it("⚠️ le run d'HIER ne vaut rien aujourd'hui", () => {
    /*
     * Sans la garde de jour, la carte annoncerait « TERMINÉ · 40 MANCHES » au
     * réveil, sur le score de la veille — et le bouton resterait verrouillé
     * toute la journée pour un joueur assidu. `ensureDay` remet à zéro à
     * l'ouverture, mais la vue doit tenir seule : elle est appelée par trois
     * chemins, et il suffit qu'un seul la précède.
     */
    const hier = sauve({ day: AUJ - 1, played: true, score: 40, cleared: true, essais: 3 });
    const v = vueDuJour(hier, AUJ);
    expect(v.etat).toBe("vierge");
    expect(v.acquis).toBe(false);
    expect(v.verrouille).toBe(false);
    expect(v.restants).toBe(DAILY_ESSAIS);
  });

  it("⚠️ un score d'un autre jour ne s'affiche pas — la fiche compte", () => {
    /*
     * `cptJourVal` faisait `vueJ.acquis || s.daily.score > 0`. `acquis` est
     * gardé par le jour, le score NU ne l'est pas : un 34 d'hier allumait
     * « 34 aujourd'hui » dès que le OU basculait.
     *
     * DENTS : recoller l'ancien OU fait passer `ancien` à true pour
     * aujourd'hui, alors que `scoreDuJour` reste null.
     */
    const hier = sauve({ day: AUJ - 1, played: true, score: 34, cleared: true, essais: 1 });
    expect(scoreDuJour(hier, AUJ), "le 34 d'hier passe encore").toBeNull();
    expect(scoreDuJour(hier, AUJ - 1)).toBe(34);

    const ancien = vueDuJour(hier, AUJ).acquis || hier.daily.score > 0;
    expect(ancien, "l'ancienne formule ne ment plus ?").toBe(true);
  });

  it("un compteur bricolé ne rend pas d'essai négatif", () => {
    // Il s'afficherait tel quel : « −2 ESSAIS RESTANTS ».
    expect(vueDuJour(sauve({ played: true, essais: 99 }), AUJ).restants).toBe(0);
  });

  it("⚠️ une sauvegarde d'AVANT le compteur reste à un essai consommé", () => {
    // `essais` est arrivé après. Le repli sur `played` évite de rendre trois
    // essais neufs à tous ceux déjà venus, sur le seul mode qui se compare.
    const v = vueDuJour({ daily: { day: AUJ, played: true, score: 12, cleared: false } } as Save, AUJ);
    expect(v.etat).toBe("reste");
    expect(v.restants).toBe(DAILY_ESSAIS - 1);
  });

  it("⚠️ score sans compteur : plus vierge, pas trois essais neufs", () => {
    /*
     * Le cas du nouvel onglet. `essais: 0` est une valeur présente, donc
     * l'ancien `??` ne retombait pas sur `played`. La carte disait VIERGE
     * avec 3 restants, COMMENCER actif, et on rejouait le jour.
     *
     * DENTS : retirer le plancher de `essaisDuJour` fait retomber `etat`
     * à vierge et `restants` à 3.
     */
    const v = vueDuJour(sauve({ essais: 0, score: 28, played: false }), AUJ);
    expect(v.etat, "un 28 d'aujourd'hui n'est pas une journée vierge").not.toBe("vierge");
    expect(v.restants, "trois essais neufs après un score").toBe(DAILY_ESSAIS - 1);
    expect(v.verrouille).toBe(false);
  });
});
