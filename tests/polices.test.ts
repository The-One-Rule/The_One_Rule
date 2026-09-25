/**
 * LA FEUILLE ET LE CANVAS NOMMENT LA MÊME POLICE.
 *
 * Le canvas ne lit pas le CSS : `ctx.font` veut une chaîne complète, donc
 * `var(--display)` n'y sert à rien. Les deux déclarations ne peuvent pas être
 * fusionnées — une feuille de style n'importe pas de TypeScript — seulement
 * TENUES D'ACCORD.
 *
 * ⚠️ CE TEST EXISTE PARCE QUE LA DIVERGENCE EST MUETTE. Au changement de
 * polices, trois chaînes sur quatre citaient encore « Inter » et « JetBrains
 * Mono » : la carte à partager — c'est-à-dire la seule image du jeu qui sorte
 * du site — serait restée dans l'ancienne identité sans que rien ne casse, et
 * sans qu'aucun écran ne le montre.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DISPLAY_FAMILLE,
  DISPLAY_STACK,
  MONO_FAMILLE,
  MONO_STACK,
  policeDisplay,
  policeMono,
} from "../src/render/polices";

const css = readFileSync("src/style.css", "utf8");

/**
 * La valeur d'une variable de police déclarée à la racine.
 *
 * ⚠️ On découpe à la main plutôt qu'avec une expression construite : la
 * première version passait par `new RegExp` dans un littéral gabarit, et une
 * contre-oblique perdue en chemin a donné `^s*--display:` — une expression qui
 * ne matche jamais et dont le test dit seulement « introuvable ». C'est le
 * piège d'échappement que ce dépôt a déjà payé deux fois.
 */
function variable(nom: string): string {
  const marque = `--${nom}:`;
  for (const ligne of css.split("\n")) {
    const t = ligne.trim();
    if (!t.startsWith(marque)) continue;
    return t.slice(marque.length, t.indexOf(";")).trim();
  }
  throw new Error(`${marque} introuvable dans la feuille`);
}

describe("les polices ont une seule source", () => {
  it("la feuille et le module nomment la même famille", () => {
    expect(variable("display")).toBe(DISPLAY_STACK);
    expect(variable("mono")).toBe(MONO_STACK);
  });

  /*
   * Une famille déclarée mais jamais chargée donne le repli, en silence — et
   * un repli système ressemble assez à une vraie police pour qu'on ne le voie
   * pas tout de suite.
   */
  it("chaque famille déclarée est aussi CHARGÉE", () => {
    for (const fam of [DISPLAY_FAMILLE, MONO_FAMILLE]) {
      const paquet = fam.toLowerCase().replace(/\s+/g, "-");
      expect(
        css.includes(`@fontsource/${paquet}/`),
        `« ${fam} » est déclarée mais aucun @import ne la charge`,
      ).toBe(true);
    }
  });

  it("aucune chaîne de canvas ne cite une police en dur", () => {
    for (const f of ["src/render/partage.ts", "src/render/scene.ts", "src/main.ts"]) {
      const src = readFileSync(f, "utf8");
      const dur = [...src.matchAll(/\.font\s*=\s*["'`][^"'`]*["'`]/g)].map((m) => m[0]);
      expect(dur, `${f} écrit une police en dur : ${dur.join(" · ")}`).toEqual([]);
    }
  });

  it("les fabriques rendent une chaîne que `ctx.font` accepte", () => {
    // Graisse, taille, famille, repli — dans cet ordre, sinon le canvas ignore
    // la déclaration entière et garde sa police par défaut.
    expect(policeDisplay(600, 96)).toBe(`600 96px ${DISPLAY_STACK}`);
    expect(policeMono(700, 10)).toBe(`700 10px ${MONO_STACK}`);
    expect(policeDisplay(500, 12)).toMatch(/^500 12px "/);
    expect(policeMono(400, 11)).toMatch(/^400 11px "/);
  });

  /*
   * Le repli est ce qui s'affiche pendant que la police charge, et sur un
   * navigateur qui la refuse. Sans famille générique en fin de pile, c'est du
   * Times New Roman — sur l'accueil, au premier dixième de seconde.
   */
  it("chaque pile finit par une famille générique", () => {
    expect(DISPLAY_STACK.trim().endsWith("sans-serif")).toBe(true);
    // Le second rôle est devenu le TEXTE (Nunito) : sa pile finit en sans-serif.
    expect(MONO_STACK.trim().endsWith("sans-serif")).toBe(true);
  });
});
