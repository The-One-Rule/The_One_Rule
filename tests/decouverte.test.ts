/**
 * LE TUTORIEL N'EST PLUS UNE PORTE — directive de Pierre (30/09/2026).
 *
 * « Les gens arrivent sur le site et doivent faire le tuto avant de débloquer
 * tout le site, ça les rend très réticents. Le tuto doit se faire lors de la
 * première partie, mais ne pas être la condition pour débloquer le jeu. »
 *
 * On lit les sources, comme `sync-ui.test.ts` : un verrou qui revient se voit
 * ici, pas au prochain relevé d'entonnoir.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const main = readFileSync("src/main.ts", "utf8");

function corps(signature: string): string {
  const i = main.indexOf(signature);
  expect(i, `introuvable : ${signature}`).toBeGreaterThan(-1);
  const start = main.indexOf("{", i);
  let n = 0;
  for (let k = start; k < main.length; k++) {
    if (main[k] === "{") n++;
    else if (main[k] === "}" && --n === 0) return main.slice(start, k + 1);
  }
  return main.slice(start);
}

describe("tout est ouvert dès l'arrivée", () => {
  it("aucun mode n'attend un chapitre", () => {
    expect(main).toMatch(/const DECOUVERTE_LIBRE = true;/);
    const fn = corps("function modeOuvert");
    expect(fn.indexOf("if (DECOUVERTE_LIBRE) return true;")).toBeGreaterThan(-1);
    expect(fn.indexOf("DECOUVERTE_LIBRE")).toBeLessThan(fn.indexOf("chapitresBoucles"));
  });

  it("l'accueil ne se réduit plus à un bouton pour un nouveau venu", () => {
    const fn = corps("function renderHome");
    expect(fn).toMatch(/const neuf = false;/);
  });
});

describe("le tutoriel est la première partie, puis la partie choisie", () => {
  it("openBrief retient le mode choisi avant d'ouvrir le tutoriel", () => {
    const fn = corps("function openBrief");
    const i = fn.indexOf("modeApresTuto = mode;");
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(fn.indexOf("ouvreOnboarding()"));
  });

  it("à la sortie — terminé OU passé — on y conduit le joueur", () => {
    const fn = corps("function finitOnboarding");
    const voulu = fn.indexOf("openBrief(voulu)");
    expect(voulu).toBeGreaterThan(-1);
    // avant la branche PASSER : sauter le tutoriel ne coûte pas la partie voulue
    expect(voulu).toBeLessThan(fn.indexOf("if (passe)"));
  });
});
