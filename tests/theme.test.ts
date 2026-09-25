/**
 * LE MODE SOMBRE — trois propriétés, et chacune a déjà coûté ailleurs.
 *
 * 1. Les deux portes (`[data-theme="sombre"]` et `prefers-color-scheme`)
 *    portent EXACTEMENT les mêmes jetons. Écrites deux fois, elles divergent à
 *    la première retouche — et le joueur en AUTO ne voit pas la même nuit que
 *    celui qui l'a forcée, sans que rien ne le dise.
 * 2. Chaque jeton que le jour définit, la nuit le redéfinit. Un jeton oublié
 *    garde sa valeur de JOUR : un texte prune sur fond nuit, invisible.
 * 3. La nuit ne touche que le DESSIN : les teintes des pièces ne bougent pas
 *    (calibrage daltonien), et seul le style maison change de terrain.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TEINTES, TERRAINS, TERRAIN_NUIT, terrainDe } from "../src/render/skins";
import { SKINS } from "../src/game/boutique";
import { normaliseSave } from "../src/game/progress";

const css = readFileSync("src/theme.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Les déclarations `--x: v` d'un bloc, triées. */
function jetons(corps: string): string[] {
  return [...corps.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .map((m) => `${m[1]}: ${m[2]!.trim()}`)
    .sort();
}

function blocApres(selecteur: string): string {
  const i = css.indexOf(selecteur);
  expect(i, `${selecteur} introuvable`).toBeGreaterThanOrEqual(0);
  const debut = css.indexOf("{", i);
  return css.slice(debut + 1, css.indexOf("}", debut));
}

describe("les deux portes de la nuit", () => {
  it("[data-theme=sombre] et prefers-color-scheme portent les mêmes valeurs", () => {
    const force = jetons(blocApres(':root[data-theme="sombre"]'));
    const auto = jetons(blocApres(':root:not([data-theme="clair"])'));
    expect(force.length).toBeGreaterThan(10);
    expect(auto).toEqual(force);
  });

  it("chaque jeton de COULEUR du jour est redéfini la nuit", () => {
    const jour = jetons(blocApres(":root {"))
      .map((l) => l.split(":")[0]!)
      // Les formes, épaisseurs et ombres composées se dérivent : seules les
      // couleurs doivent être retournées.
      .filter((n) => !/^--(r-|trait|ombre$|ombre-haute|ombre-basse|grain)/.test(n));
    const nuit = new Set(jetons(blocApres(':root[data-theme="sombre"]')).map((l) => l.split(":")[0]));
    const oublies = jour.filter((n) => !nuit.has(n));
    expect(oublies, "jetons gardant leur valeur de jour la nuit").toEqual([]);
  });
});

describe("le terrain de nuit", () => {
  it("ne concerne que le style maison", () => {
    expect(terrainDe("sticker", true)).toBe(TERRAIN_NUIT);
    expect(terrainDe("sticker", false)).toBe(TERRAINS.sticker);
    for (const skin of SKINS.map((k) => k.id).filter((id) => id !== "sticker")) {
      expect(terrainDe(skin, true), skin).toBe(TERRAINS[skin]);
    }
  });

  it("les teintes des pièces n'ont pas bougé d'un chiffre", () => {
    expect(TEINTES).toEqual({
      garance: "#F74058",
      azur: "#237EF6",
      jade: "#40F7C0",
      ambre: "#F5B214",
    });
  });
});

describe("la sauvegarde", () => {
  it("absent vaut AUTO, une valeur inconnue aussi", () => {
    expect(normaliseSave({}).theme).toBe("auto");
    expect(normaliseSave({ theme: "violet" }).theme).toBe("auto");
    expect(normaliseSave({ theme: 3 }).theme).toBe("auto");
    expect(normaliseSave({ theme: "sombre" }).theme).toBe("sombre");
    expect(normaliseSave({ theme: "clair" }).theme).toBe("clair");
  });
});
