/**
 * Le pont de données existe. Ce fichier refuse que l'UI l'ignore.
 *
 * Quatre causes vérifiées dans le code, aucune visible à la lecture d'un
 * rendu : `ouvreCompte` ne repeignait pas après `synchronise()`,
 * `demarreCompte` ne repeignait que l'accueil, `finishRun` faisait
 * `void synchronise()` sans suite, `cptJourVal` lisait `s.daily.score` nu.
 *
 * On lit les sources. Un correctif qui se débranche se voit ici, pas en
 * playtest trois semaines plus tard.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const main = readFileSync("src/main.ts", "utf8");
const file = readFileSync("src/compte/file.ts", "utf8");
const progress = readFileSync("src/game/progress.ts", "utf8");

function corps(src: string, signature: string): string {
  const i = src.indexOf(signature);
  expect(i, `introuvable : ${signature}`).toBeGreaterThan(-1);
  const start = src.indexOf("{", i);
  let n = 0;
  for (let k = start; k < src.length; k++) {
    if (src[k] === "{") n++;
    else if (src[k] === "}") {
      n--;
      if (n === 0) return src.slice(start, k + 1);
    }
  }
  return src.slice(start);
}

describe("l'UI suit la sync", () => {
  it("ouvreCompte peint local, attend synchronise, repeint si on est encore sur compte", () => {
    const fn = corps(main, "async function ouvreCompte");
    expect(fn).toMatch(/renderCompte\(/);
    expect(fn).toMatch(/show\(\s*["']compte["']\s*\)/);
    expect(fn).toMatch(/await synchronise\(/);
    expect(fn).toMatch(/screen === ["']compte["']/);
    // Doctrine n°12 : on n'attend PAS la sync AVANT le premier rendu.
    const premier = fn.indexOf("renderCompte(");
    const sync = fn.indexOf("await synchronise(");
    expect(premier).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(premier);
  });

  it("repeintChiffres couvre compte, home, solo, classement, over", () => {
    const fn = corps(main, "function repeintChiffres");
    for (const ecran of ["compte", "home", "solo", "classement", "over"]) {
      expect(fn, `écran ${ecran} oublié`).toMatch(new RegExp(`["']${ecran}["']`));
    }
  });

  it("finishRun repeint après vide() et après synchronise()", () => {
    expect(main).toMatch(/vide\(\)\.then/);
    expect(main).toMatch(/synchronise\(\)\.then/);
    expect(main).toMatch(/repeintChiffres\(/);
  });

  it("demarreCompte ne se limite plus à screen === home", () => {
    const fn = corps(main, "async function demarreCompte");
    expect(fn).toMatch(/repeintChiffres\(/);
    // L'ancien garde `if (screen === "home") renderHome()` en fin de fonction
    // laissait compte / solo / classement avec les chiffres d'avant la sync.
    expect(fn).not.toMatch(/if\s*\(\s*screen\s*===\s*["']home["']\s*\)\s*renderHome\s*\(\s*\)\s*;?\s*\}/);
  });
});

describe("un seul chiffre « score du jour »", () => {
  it("cptJourVal passe par monScoreDuJour, pas s.daily.score nu", () => {
    const fn = corps(main, "function renderCompte");
    expect(fn).toMatch(/cptJourVal/);
    expect(fn).toMatch(/monScoreDuJour/);
    expect(fn).not.toMatch(/cptJourFait\)\(\s*s\.daily\.score\s*\)/);
  });

  it("⚠️ cptJourVal ne fait plus vueJ.acquis || s.daily.score", () => {
    const fn = corps(main, "function renderCompte");
    const i = fn.indexOf("cptJourVal");
    expect(i, "cptJourVal a disparu").toBeGreaterThan(-1);
    const slice = fn.slice(Math.max(0, i - 200), i + 250);
    expect(slice, "s.daily.score est revenu sur cptJourVal").not.toMatch(/s\.daily\.score/);
    expect(slice, "le OU vueJ.acquis est revenu").not.toMatch(/vueJ\.acquis\s*\|\|/);
    expect(slice).toMatch(/monScoreDuJour/);
  });

  it("l'écart se calcule contre la perf du MÊME jour", () => {
    const fn = corps(main, "function renderCompte");
    expect(fn).toMatch(/p\.jour === jourDemande/);
  });

  it("renderCompte et renderClassement relisent le jour", () => {
    expect(corps(main, "function renderCompte")).toMatch(/rafraichitJour\(/);
    expect(corps(main, "function renderClassement")).toMatch(/rafraichitJour\(/);
    expect(corps(main, "function renderHome")).toMatch(/rafraichitJour\(/);
    expect(corps(main, "function renderSolo")).toMatch(/rafraichitJour\(/);
  });
});

describe("day n'est plus une constante de session", () => {
  it("show() relit dayIndex sauf jeu et écran de fin", () => {
    const fn = corps(main, "function show");
    expect(fn).toMatch(/rafraichitJour\(/);
    expect(fn).toMatch(/id !== null/);
    expect(fn).toMatch(/["']over["']/);
  });

  it("rafraichitJour pose day = dayIndex() puis ensureDay", () => {
    const fn = corps(main, "function rafraichitJour");
    expect(fn).toMatch(/day = dayIndex\(\)/);
    expect(fn).toMatch(/ensureDay\(s,\s*day\)/);
  });
});

describe("la file et les refus", () => {
  it("enfile ne jette plus le même jour pour pousser le dernier", () => {
    const fn = corps(file, "export function enfile");
    expect(fn).not.toMatch(/filter\(\s*\(x\)\s*=>\s*!/);
    expect(fn).toMatch(/fusionneMeilleurs/);
  });

  it("vide() partage sa promesse", () => {
    const fn = corps(file, "export function vide");
    expect(fn).toMatch(/enVol/);
  });

  it("un 200 enregistre:false ne recolle pas un refus", () => {
    expect(file).not.toMatch(/r\.refus = r\.refus \?\? ["']non enregistre["']/);
  });

  it("traiteEnvois toaste sur estRefusReel, pas sur tout !enregistre", () => {
    const fn = corps(main, "function traiteEnvois");
    expect(fn).toMatch(/estRefusReel/);
    expect(fn).not.toMatch(/filter\(\s*\(r\)\s*=>\s*!r\.enregistre\s*\)/);
  });

  it("⚠️ REJOUER plus faible : le toast perfRefusee est derrière estRefusReel", () => {
    const fn = corps(main, "function traiteEnvois");
    const iFilter = fn.indexOf("filter(estRefusReel)");
    const iToast = fn.indexOf('montreToast(t("perfRefusee")');
    expect(iFilter, "le toast n'est plus filtré par estRefusReel").toBeGreaterThan(-1);
    expect(iToast, "le toast perfRefusee a disparu").toBeGreaterThan(-1);
    expect(iFilter).toBeLessThan(iToast);
  });
});

describe("fiche compte : TON record", () => {
  it("cptRecordEntrainement lit recordDeSonAllure, pas bestTraining", () => {
    const fn = corps(main, "function renderCompte");
    const i = fn.indexOf("cptRecordEntrainement");
    expect(i, "cptRecordEntrainement a disparu").toBeGreaterThan(-1);
    const ligne = fn.slice(i, i + 160);
    expect(ligne, "la ligne du bas relit encore bestTraining").not.toMatch(/bestTraining/);
    expect(ligne).toMatch(/monRecord|recordDeSonAllure/);
  });
});

describe("appliqueAgregats écrit le jour du compte s'il est plus récent", () => {
  it("les trois branches sont nommées", () => {
    const fn = corps(progress, "export function appliqueAgregats");
    expect(fn).toMatch(/fusionnes\.jour\.jour === s\.daily\.day/);
    expect(fn).toMatch(/fusionnes\.jour\.jour > s\.daily\.day/);
  });
});

describe("le record à l'allure, partout où on le montre", () => {
  it("la carte SOLO lit recordDeSonAllure, pas bestTraining", () => {
    /*
     * Même famille que la fiche compte : à DÉBUT, bestTraining vaut 0 et
     * le vrai record est sous la clé de l'allure. DENTS : recoller
     * `s.bestTraining` dans trainingRecord fait tomber le second expect.
     */
    const fn = corps(main, "function renderSolo");
    const i = fn.indexOf("trainingRecord");
    expect(i, "trainingRecord a disparu de renderSolo").toBeGreaterThan(-1);
    const slice = fn.slice(i, i + 80);
    expect(slice, "la carte SOLO relit encore bestTraining").not.toMatch(/bestTraining/);
    expect(slice).toMatch(/recordDeSonAllure/);
  });

  it("le pied d'entraînement libre lit recordDeSonAllure", () => {
    const fn = corps(main, "function lanceRun");
    expect(fn).toMatch(/recordDeSonAllure/);
    expect(fn, "le repli du pied est revenu à bestTraining").not.toMatch(
      /palier\?\.manches \?\? s\.bestTraining/,
    );
  });
});

describe("le lancement du jour refuse un compteur à zéro", () => {
  it("startRun et lanceRun consultent verrouille — pas seulement les boutons", () => {
    /*
     * Le brief désactive COMMENCER. Ça n'empêche pas un chemin qui appelle
     * startRun directement, ni le rebours qui tombe après une sync. Le
     * garde-fou appartient au point de passage commun.
     */
    expect(corps(main, "function startRun")).toMatch(/jourDuRunClos/);
    expect(corps(main, "function lanceRun")).toMatch(/verrouille/);
  });

  it("un navigateur neuf connecté attend la sync avant de lancer le daily", () => {
    const fn = corps(main, "function startRun");
    expect(fn).toMatch(/compteBootFini/);
    expect(fn).toMatch(/bootCompte/);
    expect(fn).toMatch(/estConnecte/);
  });

  it("demarreCompte recolle une perf du jour puis pose compteBootFini", () => {
    const fn = corps(main, "async function demarreCompte");
    expect(fn).toMatch(/posePreuveDuJour/);
    expect(fn).toMatch(/mesPerfs/);
    expect(fn).toMatch(/compteBootFini = true/);
  });

  it("l'écran de fin lit les restants via vueDuJour, pas essaisDuJour nu", () => {
    expect(main).toMatch(/essaisRestants = mode === "daily" \? vueDuJour\(s, day\)\.restants/);
  });
});
