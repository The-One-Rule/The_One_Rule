/**
 * L'OBJECTIF DE L'ACCUEIL, ET LE MUR DES RECORDS.
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
import { MEILLEUR_CONNU, vueBut } from "../src/render/but";
import type { SiennesDuJoueur } from "../src/render/but";
import { PACE_CHOICES, PACE_DEFAULT } from "../src/engine/difficulty";
import { cleEntrainement } from "../src/game/perfs";
import { recordDeSonAllure } from "../src/game/progress";
import type { Save } from "../src/game/progress";

/** Un joueur qui n'a rien fait dans aucune des deux épreuves. */
const RIEN: SiennesDuJoueur = { jour: null, entrainement: 0 };

const siennes = (jour: number | null, entrainement = 0): SiennesDuJoueur => ({
  jour,
  entrainement,
});

describe("la cible à battre", () => {
  it("⚠️ le RUN DU JOUR l'emporte dès qu'il existe", () => {
    /*
     * C'est la meilleure cible qu'on puisse donner : vérifiée par le serveur
     * (`verifyRun` a rejoué le journal), VIVANTE — elle change chaque jour — et
     * bien plus atteignable qu'un record de tous les temps.
     *
     * La médiane du PREMIER run d'un joueur est de 4 manches. Lui opposer 201
     * ne dit pas « essaie de me battre », ça dit « tu ne seras jamais bon à ce
     * jeu ». Le score du jour, lui, est à sa portée.
     */
    const v = vueBut(RIEN, 34);
    expect(v.cible.score).toBe(34);
    expect(v.cible.source).toBe("jour");
  });

  it("se rabat sur l'ENTRAÎNEMENT quand le classement se tait — SUR LE MUR", () => {
    // Le mur des records l'étiquette, et un mur sans record n'est plus un mur.
    for (const muet of [null, 0]) {
      const v = vueBut(RIEN, muet, "entrainement");
      expect(v.cible.score).toBe(MEILLEUR_CONNU.score);
      expect(v.cible.source).toBe("entrainement");
    }
  });

  it("⚠️ n'emprunte AUCUNE cible sur l'accueil quand le classement se tait", () => {
    /*
     * LA CARTE DE L'ACCUEIL PARLE DU RUN DU JOUR, ET DE RIEN D'AUTRE.
     *
     * Y glisser le meilleur connu en entraînement mettrait deux épreuves sous
     * un même cadre. ⚠️ Et ce n'est pas un cas rare : tant que le déploiement
     * n'a ni Supabase ni fournisseur OAuth, `classementDuJour` rend `null`
     * pour tout le monde, tous les jours.
     */
    for (const muet of [null, 0]) {
      expect(vueBut(RIEN, muet, "aucun").cible).toBeNull();
      expect(vueBut(siennes(37), muet, "aucun").cible).toBeNull();
    }
  });

  it("⚠️ le 201 n'est JAMAIS étiqueté run du jour", () => {
    const v = vueBut(RIEN, null);
    expect(v.cible.score).toBe(MEILLEUR_CONNU.score);
    expect(v.cible.source).not.toBe("jour");
  });

  it("le mode est toujours l'un des deux, jamais vide", () => {
    for (const duJour of [null, 0, 1, 34, 500]) {
      expect(["jour", "entrainement"]).toContain(
        vueBut(siennes(12, 12), duJour).cible.source,
      );
    }
  });
});

describe("le chiffre du joueur SUIT l'épreuve de la cible", () => {
  it("⚠️ LE DÉFAUT QUE CE MODULE EXISTE POUR RENDRE IMPOSSIBLE", () => {
    /*
     * Le mur des records passait `recordDeSonAllure` — le record
     * d'ENTRAÎNEMENT — pendant que sa cible venait du classement du JOUR dès
     * que celui-ci répondait. Il comparait donc un record fait à une allure
     * choisie, sur une règle choisie, au meilleur du jour où tout le monde joue
     * la même graine et la même règle. « Il te manque 170 manches » ne voulait
     * rien dire.
     *
     * En prenant les DEUX chiffres, le module choisit celui qui correspond à la
     * cible qu'il vient lui-même d'élire : l'appelant ne peut plus se tromper.
     * C'est ce qui rend l'invariant structurel au lieu de compter sur la
     * vigilance de chaque écran.
     */
    const j = siennes(27, 201);
    // Cible du JOUR → on lit son score DU JOUR, jamais son record d'entraînement.
    expect(vueBut(j, 34).sien).toBe(27);
    // Cible d'ENTRAÎNEMENT → on lit son record d'entraînement.
    expect(vueBut(j, null).sien).toBe(201);
  });

  it("un joueur qui n'a pas joué aujourd'hui n'oppose rien à la cible du jour", () => {
    const j = siennes(null, 201);
    expect(vueBut(j, 34).sien, "son 201 d'entraînement n'a rien à faire ici").toBeNull();
    expect(vueBut(j, 34).depasse).toBe(false);
  });

  it("apparaît À CÔTÉ de la cible dès qu'il existe", () => {
    expect(vueBut(siennes(23), 34).sien).toBe(23);
    expect(vueBut(RIEN, 34).sien, "un joueur sans score n'en montre pas").toBeNull();
  });

  it("⚠️ le jeu ne dit pas à quelqu'un qu'il est moins bon que ce qu'il fait", () => {
    // Sans ça, un joueur à 240 lirait « le record à battre : 201 » — le jeu lui
    // dirait qu'il est moins bon que quelqu'un qu'il vient de dépasser.
    expect(vueBut(siennes(null, MEILLEUR_CONNU.score + 39), null).depasse).toBe(true);
    expect(
      vueBut(siennes(null, MEILLEUR_CONNU.score), null).depasse,
      "à égalité aussi",
    ).toBe(true);
    expect(vueBut(siennes(null, MEILLEUR_CONNU.score - 1), null).depasse).toBe(false);
    // Et ça vaut aussi contre le record du jour, qui est bien plus battable.
    expect(vueBut(siennes(40), 34).depasse).toBe(true);
  });

  it("⚠️ sans cible, on ne DÉPASSE rien", () => {
    // Un joueur à 37 face à personne n'a battu personne : « tu fais mieux que
    // ça » n'aurait aucun antécédent — et son chiffre n'a rien à quoi se
    // comparer, donc il ne s'affiche pas non plus.
    expect(vueBut(siennes(37), null, "aucun").depasse).toBe(false);
    expect(vueBut(siennes(37), null, "aucun").sien).toBeNull();
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
    expect(vueBut(siennes(null, recordDeSonAllure(s)), null).sien).toBe(23);
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
