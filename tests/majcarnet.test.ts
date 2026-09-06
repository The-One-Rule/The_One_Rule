/**
 * `majCarnet` RECONSTRUIT L'ENTRÉE — et tout ce qu'elle ne nomme pas disparaît.
 *
 * ⚠️ **CE FICHIER EXISTE À CAUSE D'UN BUG LIVRÉ À UN JOUEUR.** Rapporté en
 * playtest, mot pour mot : « impossible d'aller au-delà de l'étape 2, même en
 * la réussissant ». Capture à l'appui, l'écran affichait pourtant « PALIER 2
 * FRANCHI ».
 *
 * Le mécanisme. `escalier` avait été branché à deux des trois bouts que le §12
 * de CLAUDE.md nomme — `fusionne` et le nettoyage de `api/moi.ts` — et pas au
 * troisième, `majCarnet`, qui est justement le seul à tourner à CHAQUE partie.
 * Un run de palier écrivait donc une entrée sans montée ; la ligne suivante
 * relisait cette entrée pour y trouver la montée, tombait sur « pas
 * commencée », et repartait du palier 1. Le libellé « PALIER 2 FRANCHI », lui,
 * vient du palier JOUÉ et non de l'état enregistré : **le jeu annonçait une
 * victoire qu'il venait d'effacer.**
 *
 * Et ça mordait bien au-delà de l'escalier — n'importe quel run d'entraînement
 * ou du jour passe par ici, donc jouer quoi que ce soit détruisait la montée.
 *
 * ⚠️ **CE TEST NE VÉRIFIE PAS UNE LISTE DE CHAMPS, IL VÉRIFIE LA LISTE.** Un
 * test qui nommerait `escalier` ne protégerait que `escalier`, et le prochain
 * champ passerait à travers exactement comme celui-ci. On part d'une entrée où
 * TOUT est rempli et on exige que rien ne se perde — quoi qu'on ajoute demain.
 *
 * `tests/carnet-voyage.test.ts` ne pouvait pas l'attraper : il éprouve le
 * voyage entre deux appareils, pas le chemin d'un run.
 */
import { describe, expect, it } from "vitest";
import { majCarnet } from "../src/game/progress";
import {
  ESCALIER_VIERGE,
  PALIER_SOMMET,
  majEscalier,
  palierCourant,
  palierN,
} from "../src/game/escalier";
import type { RuleRecord } from "../src/game/progress";

/** Une entrée où RIEN n'est laissé à sa valeur par défaut. */
const PLEINE: Required<RuleRecord> = {
  best: 23,
  cleared: true,
  pieges: 7,
  parAllure: { "1": 19, "0.8": 12 },
  serie: 11,
  sansFaute: true,
  runs: 31,
  escalier: { palier: 8, essais: 3, meilleur: 11 },
};

describe("majCarnet ne perd rien en chemin", () => {
  it("⚠️ AUCUN CHAMP NE DISPARAÎT — pas même sur un run sans `run`", () => {
    /*
     * Le cas EXACT du bug : un run de PALIER passe `undefined` comme argument
     * `run`, parce qu'il ne doit alimenter aucune case de l'échelle de
     * maîtrise. C'est ce chemin-là qui effaçait la montée.
     */
    const apres = majCarnet(PLEINE, 5, false, 0, undefined);
    for (const cle of Object.keys(PLEINE) as (keyof RuleRecord)[]) {
      expect(apres[cle], `« ${cle} » a disparu du carnet`).toBeDefined();
    }
    expect(apres.escalier, "la montée n'est plus celle d'avant").toEqual(PLEINE.escalier);
  });

  it("ni sur un run ordinaire", () => {
    const apres = majCarnet(PLEINE, 30, true, 2, { allure: 1, serie: 4, sansFaute: false });
    for (const cle of Object.keys(PLEINE) as (keyof RuleRecord)[]) {
      expect(apres[cle], `« ${cle} » a disparu du carnet`).toBeDefined();
    }
    expect(apres.escalier).toEqual(PLEINE.escalier);
  });

  it("le filet a des dents : chaque champ retiré se voit", () => {
    /*
     * Le garde-fou du garde-fou. Sans lui, l'assertion ci-dessus passerait
     * aussi avec une entrée témoin vide — et ne vérifierait plus rien.
     */
    const cles = Object.keys(PLEINE) as (keyof RuleRecord)[];
    expect(cles.length, "l'entrée témoin s'est vidée").toBeGreaterThan(6);
    for (const cle of cles) {
      const ampute = { ...PLEINE };
      delete ampute[cle];
      const apres = majCarnet(ampute as RuleRecord, 1, false, 0, undefined);
      // `best`, `cleared` et `pieges` sont toujours recalculés, donc présents
      // même absents de l'entrée : ils ne peuvent pas servir de témoin.
      if (cle === "best" || cle === "cleared" || cle === "pieges") continue;
      expect(
        apres[cle],
        `retirer « ${cle} » ne change rien : ce champ n'est pas vraiment vérifié`,
      ).toBeUndefined();
    }
  });

  it("ce qu'elle calcule, elle l'écrase bien — le report ne fige rien", () => {
    /*
     * L'autre moitié : recopier l'entrée d'avant ne doit pas EMPÊCHER la mise à
     * jour. Un `...prev` posé après les calculs les annulerait tous, et le
     * carnet cesserait d'avancer — un bug aussi silencieux que le premier, en
     * sens inverse.
     */
    const apres = majCarnet(PLEINE, 40, false, 3, { allure: 1, serie: 20, sansFaute: false });
    expect(apres.best, "le record ne monte plus").toBe(40);
    expect(apres.pieges, "les pièges ne s'additionnent plus").toBe(10);
    expect(apres.serie, "la série ne monte plus").toBe(20);
    expect(apres.runs, "les runs ne se comptent plus").toBe(32);
    expect(apres.parAllure!["1"], "le record d'allure ne monte plus").toBe(40);
  });

  it("une entrée neuve n'est pas gonflée pour autant", () => {
    // « Absent vaut zéro » reste la doctrine : un premier run n'écrit pas
    // `{}`, `0` et `false` sur chaque champ.
    const neuf = majCarnet(undefined, 4, false, 0, undefined);
    expect(neuf.escalier).toBeUndefined();
    expect(neuf.parAllure).toBeUndefined();
    expect(neuf.serie).toBeUndefined();
    expect(neuf.sansFaute).toBeUndefined();
    expect(neuf.runs).toBeUndefined();
  });
});

describe("la montée complète, par le chemin RÉEL d'un run", () => {
  it("⚠️ ON GRAVIT BIEN LES VINGT PALIERS — le bug du playtest, en régression", () => {
    /*
     * Le test qui reproduit exactement ce que le joueur a vécu. Il enchaîne les
     * DEUX écritures que `finishRun` fait, dans l'ordre où il les fait, et
     * réussit chaque palier. Avant le correctif, il s'arrêtait au palier 1 et
     * y restait — « impossible d'aller au-delà de l'étape 2 ».
     *
     * ⚠️ Il n'appelle pas `finishRun` (qui a besoin du DOM, d'une Session et
     * d'une horloge) mais reproduit sa séquence. Le risque d'une formule
     * écrite deux fois est réel et documenté ; il est accepté ici parce que la
     * séquence tient en deux lignes et que le test précédent tient déjà
     * `majCarnet` seule. Ce qu'il ajoute, c'est l'ENCHAÎNEMENT.
     */
    let entree: RuleRecord | undefined;
    for (let n = 1; n <= PALIER_SOMMET; n++) {
      const pal = palierN(n)!;
      const avant = entree?.escalier ?? ESCALIER_VIERGE;
      expect(palierCourant(avant)?.n, `on ne joue pas le palier ${n}`).toBe(n);
      // Les deux écritures de `finishRun`, dans l'ordre.
      entree = majCarnet(entree, pal.manches, true, 1, undefined);
      entree.escalier = majEscalier(avant, pal.manches);
      expect(entree.escalier.palier, `le palier ${n} n'est pas retenu`).toBe(n);
    }
    expect(palierCourant(entree!.escalier!), "la montée n'est pas terminée").toBeUndefined();
  });

  it("⚠️ et un run ORDINAIRE ne détruit pas la montée en passant", () => {
    /*
     * La moitié la plus large du bug : `majCarnet` tourne à CHAQUE partie, pas
     * seulement sur un palier. Jouer un entraînement ou le run du jour effaçait
     * donc l'escalier — sans rapport apparent, et sans rien à l'écran.
     */
    const apres = majCarnet(
      { best: 3, cleared: false, escalier: { palier: 12, essais: 2, meilleur: 9 } },
      40,
      true,
      2,
      { allure: 1, serie: 8, sansFaute: true },
    );
    expect(apres.escalier).toEqual({ palier: 12, essais: 2, meilleur: 9 });
  });
});
