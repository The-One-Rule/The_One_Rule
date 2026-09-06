/**
 * L'OBJECTIF DE L'ACCUEIL.
 *
 * Demandé par Pierre : « le record doit devenir une motivation naturelle à
 * lancer une partie », et « uniquement des données réelles ».
 *
 * Ce fichier tient la contrainte qui façonne tout le module : **un score sans
 * son mode est un chiffre faux**. Le run du jour et l'entraînement ne sont pas
 * la même épreuve — même graine et même règle pour tout le monde d'un côté,
 * règle choisie et allure réglable de l'autre — et c'est ce que la clé de
 * comparabilité sépare côté serveur.
 */
import { describe, expect, it } from "vitest";
import { MEILLEUR_CONNU, vueAccueil, vueBut } from "../src/render/but";
import { PACE_CHOICES, PACE_DEFAULT } from "../src/engine/difficulty";
import { cleEntrainement } from "../src/game/perfs";
import { recordDeSonAllure } from "../src/game/progress";
import type { Save } from "../src/game/progress";

describe("la cible à battre", () => {
  it("⚠️ le RUN DU JOUR l'emporte des qu'il existe", () => {
    /*
     * C'est la meilleure cible qu'on puisse donner : verifiee par le serveur
     * (`verifyRun` a rejoue le journal), VIVANTE — elle change chaque jour — et
     * bien plus atteignable qu'un record de tous les temps.
     *
     * La mediane du PREMIER run d'un joueur est de 4 manches. Lui opposer 201
     * ne dit pas « essaie de me battre », ca dit « tu ne seras jamais bon a ce
     * jeu ». Le score du jour, lui, est a sa portee.
     */
    const v = vueBut(0, 34);
    expect(v.cible.score).toBe(34);
    expect(v.cible.source).toBe("jour");
  });

  it("se rabat sur l'ENTRAÎNEMENT quand le classement se tait — SUR LE MUR", () => {
    // Le mur des records l'étiquette, et un mur sans record n'est plus un mur.
    for (const muet of [null, 0]) {
      const v = vueBut(0, muet, "entrainement");
      expect(v.cible!.score).toBe(MEILLEUR_CONNU.score);
      expect(v.cible!.source).toBe("entrainement");
    }
  });

  it("⚠️ n'emprunte AUCUNE cible sur l'accueil quand le classement se tait", () => {
    /*
     * LA CARTE DE L'ACCUEIL PARLE DU RUN DU JOUR, ET DE RIEN D'AUTRE.
     *
     * Y glisser le meilleur connu en entraînement mettrait deux épreuves sous
     * un même cadre — une graine et une règle communes à tous d'un côté, une
     * allure choisie sur une règle choisie de l'autre. C'est le chiffre faux
     * que tout ce module existe pour interdire.
     *
     * ⚠️ Et ce n'est pas un cas rare : tant que le déploiement n'a ni Supabase
     * ni fournisseur OAuth, `classementDuJour` rend `null` pour tout le monde,
     * tous les jours. C'est l'état que la plupart des visiteurs voient.
     */
    for (const muet of [null, 0]) {
      expect(vueBut(0, muet, "aucun").cible).toBeNull();
      expect(vueBut(37, muet, "aucun").cible).toBeNull();
    }
  });

  it("⚠️ sans cible, on ne DÉPASSE rien", () => {
    // Un joueur à 37 face à personne n'a battu personne : « tu fais mieux que
    // ça » n'aurait aucun antécédent.
    expect(vueBut(37, null, "aucun").depasse).toBe(false);
    // Mais son chiffre reste affichable — il a bien joué.
    expect(vueBut(37, null, "aucun").sien).toBe(37);
  });

  it("⚠️ le 201 n'est JAMAIS étiqueté run du jour", () => {
    /*
     * LE point du module. Le 201 a été fait en ENTRAÎNEMENT, à une allure
     * choisie, sur une règle choisie. La table `performance` ne contient que
     * des runs du jour vérifiés, donc son maximum n'est pas celui-ci et ne le
     * sera jamais.
     *
     * L'étiqueter « run du jour » serait une fausse statistique — exactement ce
     * que la consigne interdit.
     */
    const v = vueBut(0, null);
    expect(v.cible.score).toBe(MEILLEUR_CONNU.score);
    expect(v.cible.source).not.toBe("jour");
  });

  it("le mode est toujours l'un des deux, jamais vide", () => {
    for (const duJour of [null, 0, 1, 34, 500]) {
      expect(["jour", "entrainement"]).toContain(vueBut(12, duJour).cible.source);
    }
  });
});

describe("le chiffre du joueur", () => {
  it("apparaît À CÔTÉ de la cible dès qu'il existe", () => {
    // À côté, jamais à la place : c'est ce qui rend la cible comparable au lieu
    // de l'opposer.
    expect(vueBut(23, 34).sien).toBe(23);
    expect(vueBut(0, 34).sien, "un joueur sans record n'en montre pas").toBeNull();
  });

  it("⚠️ le jeu ne dit pas à quelqu'un qu'il est moins bon que ce qu'il fait", () => {
    // Sans ça, un joueur à 240 lirait « le record à battre : 201 » — le jeu lui
    // dirait qu'il est moins bon que quelqu'un qu'il vient de dépasser.
    expect(vueBut(MEILLEUR_CONNU.score + 39, null).depasse).toBe(true);
    expect(vueBut(MEILLEUR_CONNU.score, null).depasse, "à égalité aussi").toBe(true);
    expect(vueBut(MEILLEUR_CONNU.score - 1, null).depasse).toBe(false);
    // Et ça vaut aussi contre le record du jour, qui est bien plus battable.
    expect(vueBut(40, 34).depasse).toBe(true);
  });
});

describe("le record lu sur l'accueil", () => {
  const sauve = (p: Partial<Save>): Save =>
    ({ records: {}, bestTraining: 0, trainingPace: PACE_DEFAULT, ...p }) as Save;

  it("⚠️ suit l'ALLURE du joueur, pas l'allure de référence", () => {
    /*
     * `bestTraining` n'est écrit qu'à `PACE_DEFAULT` — délibérément, un chiffre
     * qui mélange les allures ne veut plus rien dire. Mais l'allure par défaut
     * d'un joueur neuf est DÉBUT : son `bestTraining` reste donc à zéro tant
     * qu'il ne change pas de vitesse, c'est-à-dire tant qu'il est débutant.
     */
    const s = sauve({ trainingPace: 2, records: { [cleEntrainement(2)]: 23 }, bestTraining: 0 });
    expect(recordDeSonAllure(s)).toBe(23);
    expect(vueBut(recordDeSonAllure(s), null).sien).toBe(23);
  });

  it("ne mélange jamais deux allures", () => {
    const s = sauve({ trainingPace: 2, records: { [cleEntrainement(0.8)]: 99 } });
    expect(recordDeSonAllure(s)).toBe(0);
  });

  it("à l'allure de référence, une vieille sauvegarde garde son record", () => {
    const s = sauve({ trainingPace: PACE_DEFAULT, records: {}, bestTraining: 41 });
    expect(recordDeSonAllure(s)).toBe(41);
  });

  it("chaque allure du catalogue a une clé lisible et distincte", () => {
    const cles = PACE_CHOICES.map((p) => cleEntrainement(p));
    expect(new Set(cles).size).toBe(PACE_CHOICES.length);
  });
});

describe("ce que l'accueil met en haut", () => {
  /*
   * ⚠️ LE BUG QUE CES TESTS EXISTENT POUR EMPÊCHER, ET IL ÉTAIT EN PRODUCTION.
   *
   * Relevé en arrivant sur le site avec un `localStorage` vide, à 375 × 812 —
   * l'état exact des 74 % de visiteurs qui repartent sans lancer une partie,
   * médiane 6 secondes. Le texte INTÉGRAL de la page d'accueil était :
   *
   *     THE ONE RULE · PERSONNE N'A ENCORE JOUÉ · Sois le premier ·
   *     TENTER LA RUN DU JOUR · SOLO · MULTI
   *
   * Nulle part il n'était dit ce qu'on FAIT dans ce jeu. La phrase existait,
   * écrite et traduite, et portait `hidden`.
   */
  it("⚠️ UN NOUVEAU VENU LIT TOUJOURS CE QU'EST LE JEU", () => {
    for (const large of [false, true]) {
      expect(
        vueAccueil(false, false, large).chapo,
        `large=${large} : le nouveau venu n'a rien à lire`,
      ).toBe(true);
    }
  });

  it("⚠️ et on ne lui montre PAS un classement vide à la place", () => {
    /*
     * « PERSONNE N'A ENCORE JOUÉ · Sois le premier » est une invitation pour
     * qui sait qu'un classement quotidien existe. Pour un inconnu, c'est un
     * constat de désert — sur un jeu dont l'accroche est « ton code, tes
     * potes ». La même phrase change de sens selon le lecteur.
     */
    expect(vueAccueil(false, false, false).bloc).toBe("rien");
  });

  it("l'habitué sans cible garde son invitation", () => {
    expect(vueAccueil(false, true, false)).toEqual({ chapo: false, bloc: "invitation" });
  });

  it("un chiffre à battre passe devant la définition, sur téléphone", () => {
    // Celui qui revient sait déjà ce qu'est le jeu : il vient chercher sa cible.
    expect(vueAccueil(true, true, false)).toEqual({ chapo: false, bloc: "objectif" });
    expect(vueAccueil(true, false, false).bloc).toBe("objectif");
  });

  it("en large, les deux — la colonne de gauche était VIDE", () => {
    expect(vueAccueil(true, true, true)).toEqual({ chapo: true, bloc: "objectif" });
    expect(vueAccueil(false, true, true)).toEqual({ chapo: true, bloc: "invitation" });
  });

  it("le chapo et l'objectif ne peuvent pas disparaître ENSEMBLE", () => {
    /*
     * Le garde-fou de forme : quelle que soit la combinaison, le haut de
     * l'accueil dit toujours quelque chose. Un titre seul au-dessus de deux
     * portes serait pire que ce qu'on vient de corriger.
     */
    for (const cible of [false, true]) {
      for (const connait of [false, true]) {
        for (const large of [false, true]) {
          const v = vueAccueil(cible, connait, large);
          expect(v.chapo || v.bloc !== "rien", `${cible}/${connait}/${large} : haut vide`).toBe(
            true,
          );
        }
      }
    }
  });
});
