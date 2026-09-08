/**
 * LES TROIS ESSAIS DU RUN DU JOUR.
 *
 * Un seul essai jusqu'ici, et c'était défendable — la rareté fait la valeur.
 * La mesure a tranché autrement : le PREMIER run d'un joueur a une médiane de
 * **4 manches**, et la moitié de ces morts sont des dépassements de temps. À un
 * essai par jour, toute la relation d'un nouveau venu au run du jour était donc
 * un échec à quatre manches, sans recours avant le lendemain.
 *
 * Deux choses se cassent en silence ici, et ce fichier les tient.
 *
 * **Le MEILLEUR des essais, jamais le dernier.** Sans ça, un second run raté
 * effacerait un bon premier — et le pire est que le serveur, lui, garde le
 * meilleur (`posePerf` améliore et ne remplace pas) : la carte SOLO et le
 * classement afficheraient deux chiffres différents pour le même jour.
 *
 * **Et le compteur est arrivé APRÈS.** Les sauvegardes déjà écrites ne le
 * portent pas ; s'il repartait de zéro, tous les joueurs déjà venus
 * recevraient trois essais neufs le jour du déploiement.
 */
import { describe, expect, it } from "vitest";
import { DAILY_ESSAIS } from "../src/engine/difficulty";
import { essaisDuJour, majJour } from "../src/game/progress";
import type { Save } from "../src/game/progress";

const sauve = (daily: Partial<Save["daily"]>): Save =>
  ({ daily: { day: 300, played: false, score: 0, cleared: false, ...daily } }) as Save;

describe("le compteur d'essais", () => {
  it("part de zéro sur une journée neuve", () => {
    expect(essaisDuJour(sauve({ essais: 0 }))).toBe(0);
  });

  it("compte ce qui a été consommé", () => {
    expect(essaisDuJour(sauve({ essais: 2, played: true }))).toBe(2);
  });

  it("⚠️ une sauvegarde d'AVANT le compteur ne repart pas à zéro", () => {
    /*
     * Le champ n'existait pas hier. Un joueur qui avait déjà fait son run du
     * jour doit rester à un essai consommé : lui en rendre trois d'un coup lui
     * donnerait un avantage sur ceux qui jouent après le déploiement, sur le
     * seul mode dont les résultats se comparent.
     *
     * Absent vaut « ce que `played` dit » — la doctrine habituelle du projet,
     * appliquée à un champ ajouté après coup.
     */
    const ancienJoue = { day: 300, played: true, score: 12, cleared: false } as Save["daily"];
    const ancienVierge = { day: 300, played: false, score: 0, cleared: false } as Save["daily"];
    expect(essaisDuJour({ daily: ancienJoue } as Save)).toBe(1);
    expect(essaisDuJour({ daily: ancienVierge } as Save)).toBe(0);
  });

  it("il en reste, jusqu'à ce qu'il n'en reste plus", () => {
    // Le calcul que fait l'écran, vérifié ici plutôt qu'à travers le DOM.
    const restants = (n: number): number => Math.max(0, DAILY_ESSAIS - n);
    expect(restants(essaisDuJour(sauve({ essais: 0 })))).toBe(3);
    expect(restants(essaisDuJour(sauve({ essais: 1 })))).toBe(2);
    expect(restants(essaisDuJour(sauve({ essais: DAILY_ESSAIS })))).toBe(0);
    // Un compteur qui dépasserait — sauvegarde bricolée — ne rend pas d'essai
    // négatif, qui s'afficherait tel quel : « −2 ESSAIS RESTANTS ».
    expect(restants(essaisDuJour(sauve({ essais: 99 })))).toBe(0);
  });
});

describe("ce que le jour retient", () => {
  /*
   * La formule de `finishRun`, reproduite ici : un MAXIMUM sur le score, un OU
   * sur le « terminé », et un incrément sur les essais. C'est la même loi que
   * le carnet et que la fusion des comptes — jamais une affectation.
   */
  const retient = majJour;

  it("un second essai RATÉ n'efface pas un bon premier", () => {
    const apres1 = retient({ day: 300, played: false, score: 0, cleared: false, essais: 0 }, 300, 28, false);
    expect(apres1.score).toBe(28);
    const apres2 = retient(apres1, 300, 3, false);
    expect(apres2.score, "le meilleur des deux").toBe(28);
    expect(apres2.essais).toBe(2);
  });

  it("un second essai MEILLEUR remplace bien le premier", () => {
    // L'inverse du test précédent : sans lui, figer le score passerait aussi.
    const apres1 = retient({ day: 300, played: false, score: 0, cleared: false, essais: 0 }, 300, 10, false);
    expect(retient(apres1, 300, 31, false).score).toBe(31);
  });

  it("le compteur ne dépasse JAMAIS le nombre d'essais du mode", () => {
    /*
     * Relevé en jeu : 6 essais consommés sur une journée qui en autorise 3, via
     * un chemin de lancement depuis ferme. Un compteur qui depasse sa propre
     * limite rend faux tout ce qui en derive — « restants » part negatif, et
     * l'etat de la journee cesse de se deduire du chiffre.
     *
     * Le plafond double le verrou de lancement, il ne le remplace pas : l'un
     * empeche de jouer, l'autre empeche d'ecrire un etat impossible.
     */
    let etat: Save["daily"] = { day: 300, played: false, score: 0, cleared: false, essais: 0 };
    for (let i = 0; i < 8; i++) etat = retient(etat, 300, 5, false);
    expect(etat.essais, "huit lancements ne font pas huit essais").toBe(DAILY_ESSAIS);
  });

  it("un run TERMINÉ le reste, même si le suivant échoue", () => {
    const gagne = retient({ day: 300, played: false, score: 0, cleared: false, essais: 0 }, 300, 40, true);
    expect(retient(gagne, 300, 5, false).cleared).toBe(true);
  });

  it("le changement de jour remet tout à zéro", () => {
    /*
     * `ensureDay` s'en charge à l'ouverture, mais la formule doit tenir seule :
     * sans la garde `avant.day === jour`, le score d'hier survivrait à minuit
     * et le classement du jour partirait d'un chiffre qui n'y appartient pas.
     */
    const hier = { day: 299, played: true, score: 40, cleared: true, essais: 3 } as Save["daily"];
    const aujourdhui = retient(hier, 300, 6, false);
    expect(aujourdhui.score).toBe(6);
    expect(aujourdhui.cleared).toBe(false);
    expect(aujourdhui.essais).toBe(1);
  });
});
