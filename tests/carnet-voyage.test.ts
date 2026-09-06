/**
 * LE CARNET SURVIT-IL AU VOYAGE ? — le filet qui manquait.
 *
 * Un run écrit dans le carnet local ; `agregatsDe` l'emballe ; le réseau
 * l'emporte ; **`api/moi.ts` le RECONSTRUIT champ par champ** — on ne fait pas
 * confiance à ce que le client envoie — ; `fusionne` le marie à ce que le
 * compte savait déjà ; `appliqueAgregats` le réinjecte dans l'appareil.
 *
 * Cinq étapes, et **un champ oublié à n'importe laquelle disparaît en
 * silence.** Rien ne casse, rien n'avertit, aucun test ne rougit : le joueur
 * change d'appareil et retrouve un compteur à zéro. Le §12 de CLAUDE.md décrit
 * cette panne au mot près, et elle a déjà été payée une fois sur le compteur de
 * manches de l'échelle de maîtrise.
 *
 * ⚠️ **CE FICHIER NE TESTE PAS UNE LISTE DE CHAMPS, IL TESTE LA LISTE.** Un test
 * qui vérifierait « best, pieges et escalier font le voyage » se contenterait de
 * décrire le carnet d'aujourd'hui, et le dix-septième champ passerait à travers
 * exactement comme les précédents. On part donc d'une entrée où TOUS les champs
 * connus portent une valeur, et on compare l'objet ENTIER à l'arrivée.
 */
import { describe, expect, it } from "vitest";
import { agregatsDe, appliqueAgregats } from "../src/game/progress";
import type { RuleRecord, Save } from "../src/game/progress";
import { agregatsVides, fusionne } from "../shared/compte";
import { litAgregats } from "../api/moi";
import { PALIER_SOMMET } from "../src/game/escalier";

/**
 * Une entrée de carnet où RIEN n'est laissé à sa valeur par défaut.
 *
 * Chaque champ porte une valeur distincte et non nulle : un zéro ou un `false`
 * survivrait à une perte, et le test passerait pour de mauvaises raisons.
 */
const ENTREE_PLEINE: Required<RuleRecord> = {
  best: 23,
  cleared: true,
  pieges: 7,
  parAllure: { "1": 19, "0.8": 12 },
  serie: 11,
  sansFaute: true,
  runs: 31,
  escalier: { palier: 8, essais: 3, meilleur: 11 },
};

const sauve = (encountered: Record<string, RuleRecord>): Save =>
  ({
    encountered,
    streak: { count: 4, lastDay: 300, graceWeek: 0, graceLeft: 0 },
    records: {},
    bestTraining: 0,
  }) as unknown as Save;

/** Le voyage complet : appareil → réseau → nettoyage serveur → retour. */
function voyage(rec: RuleRecord): RuleRecord | undefined {
  const depart = sauve({ sang: rec });
  // 1. l'appareil emballe · 2. le réseau sérialise (donc du JSON, pas l'objet)
  const surLeFil = JSON.parse(JSON.stringify(agregatsDe(depart)));
  // 3. le serveur RECONSTRUIT · 4. il fusionne avec ce qu'il savait
  const cote = fusionne(agregatsVides(), litAgregats(surLeFil));
  // 5. un AUTRE appareil, vierge, réinjecte
  const arrivee = sauve({});
  appliqueAgregats(arrivee, cote);
  return arrivee.encountered.sang;
}

describe("un carnet qui change d'appareil", () => {
  it("⚠️ NE PERD AUCUN CHAMP — la liste entière, pas trois d'entre eux", () => {
    const arrive = voyage(ENTREE_PLEINE);
    /*
     * L'égalité porte sur l'objet COMPLET. Un `toMatchObject` laisserait
     * passer une perte, et c'est précisément la perte qu'on cherche.
     */
    expect(arrive).toEqual(ENTREE_PLEINE);
  });

  it("le filet a des dents : chaque champ retiré fait tomber le voyage", () => {
    /*
     * ⚠️ CE TEST EST LA RAISON D'ÊTRE DU FICHIER.
     *
     * Il ne vérifie pas le carnet, il vérifie que l'assertion ci-dessus est
     * capable d'échouer — champ par champ, sans en nommer aucun. On retire
     * chaque clé à tour de rôle et on exige que l'arrivée diffère du départ.
     * Le jour où un dix-septième champ traversera sans être câblé, c'est ici
     * que ça se saura, sans qu'on ait à y penser.
     */
    const cles = Object.keys(ENTREE_PLEINE) as (keyof RuleRecord)[];
    expect(cles.length, "l'entrée témoin s'est vidée").toBeGreaterThan(6);
    for (const cle of cles) {
      const ampute = { ...ENTREE_PLEINE };
      delete ampute[cle];
      expect(
        voyage(ampute as RuleRecord),
        `retirer « ${cle} » ne change rien à l'arrivée : ce champ n'est pas vraiment vérifié`,
      ).not.toEqual(ENTREE_PLEINE);
    }
  });

  it("absent reste absent — on ne gonfle pas une entrée au passage", () => {
    /*
     * L'autre moitié de la doctrine : « absent vaut zéro ». Un carnet minimal
     * ne doit pas revenir lesté de `{}`, `0` et `false` sur chaque champ — ça
     * gonflerait chaque agrégat stocké et chaque octet qui transite pour ne
     * rien dire de plus que leur absence.
     */
    const arrive = voyage({ best: 5, cleared: false })!;
    expect(arrive.parAllure).toBeUndefined();
    expect(arrive.serie).toBeUndefined();
    expect(arrive.sansFaute).toBeUndefined();
    expect(arrive.runs).toBeUndefined();
    expect(arrive.escalier, "une montée jamais commencée ne s'écrit pas").toBeUndefined();
  });

  it("⚠️ la montée ne peut pas dépasser le sommet, même envoyée trafiquée", () => {
    /*
     * Le nettoyage borne `palier` sur la longueur RÉELLE de la montée, pas sur
     * `MAX_VALEUR`. Sans ça, un client bricolé qui enverrait 9999 se
     * retrouverait au-delà du dernier palier : `palierCourant` rendrait
     * `undefined`, et l'écran afficherait une montée terminée qu'aucun essai ne
     * peut plus reprendre.
     */
    const fou = { ...ENTREE_PLEINE, escalier: { palier: 9999, essais: 1, meilleur: 2 } };
    expect(voyage(fou)!.escalier!.palier).toBe(PALIER_SOMMET);
  });

  it("deux appareils sur des paliers différents : le plus haut gagne, avec son escorte", () => {
    /*
     * Le cas concret de la question « est-ce que mon escalier me suit ? ». Le
     * téléphone est au palier 12, le PC au 8 avec un bon essai en cours. Le
     * compte doit rendre le 12 — et surtout PAS le meilleur essai du 8, qui
     * s'afficherait comme un chiffre invraisemblable sur un palier jamais joué.
     */
    const tel = agregatsDe(
      sauve({ sang: { best: 30, cleared: true, escalier: { palier: 12, essais: 1, meilleur: 3 } } }),
    );
    const pc = agregatsDe(
      sauve({ sang: { best: 18, cleared: false, escalier: { palier: 8, essais: 4, meilleur: 14 } } }),
    );
    const cote = fusionne(litAgregats(JSON.parse(JSON.stringify(tel))), litAgregats(JSON.parse(JSON.stringify(pc))));
    expect(cote.carnet.sang!.escalier).toEqual({ palier: 12, essais: 1, meilleur: 3 });
    // Et le reste du carnet suit sa propre loi : le maximum, comme toujours.
    expect(cote.carnet.sang!.best).toBe(30);
  });
});
