/**
 * LA FAMILLE D'UNE RÈGLE, ET SON TAUX DE PIÈGE.
 *
 * Deux données que la fiche de carte affiche, et qu'il aurait été facile
 * d'inventer. Ce fichier existe pour qu'elles restent vraies.
 */
import { describe, expect, it } from "vitest";
import { TAUX_PIEGE, familleDe, parFamille, tauxPiege } from "../src/game/famille";
import { ONE_RULES } from "../src/engine/rules";
import { buildRound } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";

describe("les trois familles", () => {
  it("⚠️ chaque règle tombe dans une famille et une seule", () => {
    /*
     * La famille est DÉRIVÉE de ce que la règle fait, jamais déclarée : un
     * champ posé à la main se serait désynchronisé du comportement à la
     * première règle ajoutée.
     *
     * Ce test tombe le jour où une nouvelle règle n'entre nulle part — donc
     * avant qu'elle soit livrée avec une fiche muette.
     */
    const par = parFamille();
    const total = par.interdit.length + par.deformation.length + par.contrainte.length;
    expect(total, "toutes les règles sont classées, sans doublon").toBe(ONE_RULES.length);
    for (const r of ONE_RULES) {
      expect(["interdit", "deformation", "contrainte"]).toContain(familleDe(r));
    }
  });

  it("INTERDIT est exactement l'ensemble des règles qui piègent", () => {
    // C'est ce que « interdire » veut dire ici : une consigne peut entrer en
    // conflit avec la règle. Les deux notions ne doivent jamais diverger.
    const par = parFamille();
    const piegeuses = ONE_RULES.filter((r) => r.traps && !r.watchRelease);
    expect(par.interdit.map((r) => r.id).sort()).toEqual(piegeuses.map((r) => r.id).sort());
  });

  it("aucune famille n'est vide", () => {
    // Une famille vide serait un intitulé qui ne désigne rien — et l'écran la
    // proposerait quand même en filtre.
    const par = parFamille();
    for (const [nom, liste] of Object.entries(par)) {
      expect(liste.length, `famille ${nom}`).toBeGreaterThan(0);
    }
  });
});

describe("le taux de piège affiché", () => {
  it("⚠️ la table GELÉE correspond encore à ce que le moteur produit", () => {
    /*
     * La table est gelée parce que la recalculer à l'affichage coûterait 5400
     * manches par règle. Le prix de ce gel, c'est ce test : il refait la mesure
     * — même protocole que `tests/engine.test.ts`, 120 runs × 45 niveaux — et
     * la compare.
     *
     * Il tombera le jour où une consigne, une pondération ou une règle changera
     * la distribution. Ce jour-là il faudra remettre les chiffres à jour, pas
     * relâcher la marge : un taux faux sur une carte est un mensonge sur la
     * seule statistique que le jeu publie sur lui-même.
     */
    for (const rule of ONE_RULES) {
      let rounds = 0;
      let traps = 0;
      for (let run = 0; run < 120; run++) {
        const rng = mulberry32(run * 7919 + 13);
        for (let level = 0; level < 45; level++) {
          rounds++;
          if (buildRound(rng, level, rule).trap) traps++;
        }
      }
      const mesure = Number(((traps / rounds) * 100).toFixed(1));
      expect(TAUX_PIEGE[rule.id], `${rule.id} : la table a dérivé du moteur`).toBeCloseTo(
        mesure,
        1,
      );
    }
  });

  it("une règle qui ne piège pas ne montre AUCUN taux", () => {
    // « 0 % de pièges » sur une carte se lit comme une information ; c'est un
    // vide. On n'affiche rien plutôt qu'un zéro.
    for (const r of ONE_RULES) {
      if (r.traps) expect(tauxPiege(r), r.id).toBeGreaterThan(0);
      else expect(tauxPiege(r), r.id).toBeNull();
    }
  });

  it("la table couvre le catalogue, sans entrée morte", () => {
    const ids = new Set(ONE_RULES.map((r) => r.id));
    expect(Object.keys(TAUX_PIEGE).sort()).toEqual([...ids].sort());
  });
});
