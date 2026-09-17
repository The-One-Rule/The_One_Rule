/**
 * HUD téléphone — consigne dans le letterbox, bandeau d'une ligne.
 *
 * Le bureau ne bouge pas. En jeu portrait seulement, `#head` quitte le flux
 * pour que le canvas grandisse : sur portrait le scale est plafonné par la
 * largeur, donc les pièces ne grandissent pas. Le gain de hauteur monte le
 * champ (le centre remonte), il ne le descend pas vers le pouce.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const html = readFileSync("index.html", "utf8");
const scene = readFileSync("src/render/scene.ts", "utf8");

/** Corps des `@media` dont la condition matche, accolades appariées. */
function corpsMedia(feuille: string, cond: RegExp): string[] {
  const blocs: string[] = [];
  const re = /@media[^{]+\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(feuille))) {
    if (!cond.test(m[0])) continue;
    const debut = m.index + m[0].length;
    let profondeur = 1;
    let i = debut;
    for (; i < feuille.length; i++) {
      if (feuille[i] === "{") profondeur++;
      else if (feuille[i] === "}") {
        profondeur--;
        if (profondeur === 0) break;
      }
    }
    blocs.push(feuille.slice(debut, i));
  }
  return blocs;
}

function displaysDe(bloc: string, selecteur: string): string[] {
  const out: string[] = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloc))) {
    const vises = m[1]!.split(",").map((s) => s.trim());
    if (!vises.includes(selecteur)) continue;
    const d = /display\s*:\s*([^;]+)/.exec(m[2]!);
    if (d) out.push(d[1]!.trim());
  }
  return out;
}

describe("HUD téléphone — bandeau et consigne", () => {
  const tel = corpsMedia(css, /max-width:\s*680px/).join("\n");

  it("il y a un bloc 680 px à lire — sinon les tests suivants sont vides", () => {
    expect(tel.length, "aucun @media (max-width: 680px)").toBeGreaterThan(80);
  });

  it("un seul display pour .band__brief à 680 px, et c'est none", () => {
    /*
     * Deux @media (max-width: 680px) se contredisaient : le premier masquait
     * le brief, le second le rallumait en -webkit-line-clamp: 2. Le second
     * gagnait. Un brief qui revient coûte du terrain sur le seul écran où
     * chaque pixel de HUD pousse le champ vers le haut.
     */
    const displays = displaysDe(tel, ".band__brief");
    expect(displays, `displays .band__brief à 680 px : ${displays.join(" · ")}`).toEqual(["none"]);
    expect(tel).not.toMatch(/\.band__brief\s*\{[^}]*-webkit-line-clamp/);
  });

  it("bandeau d'une ligne : intitulé et brief masqués, vies visibles, méta masquée", () => {
    expect(displaysDe(tel, ".band__tag")).toEqual(["none"]);
    expect(displaysDe(tel, ".band__brief")).toEqual(["none"]);
    expect(displaysDe(tel, ".band__meta")).toEqual(["none"]);
    expect(displaysDe(tel, ".band__droite")).toEqual([]);
    expect(html).toContain('class="band__droite"');
    expect(html).toContain('id="bandVies"');
  });

  it("en jeu portrait, #head quitte le flux sans quitter le document", () => {
    expect(tel).toMatch(/orientation:\s*portrait/);
    expect(tel).toMatch(/#app:not\(\.has-topbar\)\s+#head/);
    const overlay = /#app:not\(\.has-topbar\)\s+#head\s*\{([^}]*)\}/.exec(tel);
    expect(overlay, "règle d'overlay introuvable").not.toBeNull();
    const corps = overlay![1]!;
    expect(corps).toMatch(/pointer-events:\s*none/);
    expect(corps).toMatch(/height:\s*0/);
    expect(corps).toMatch(/flex:\s*0\s+0\s+0/);
    expect(corps).toMatch(/overflow:\s*visible/);
    expect(corps).not.toMatch(/position:\s*absolute/);
  });

  it("hors jeu, #head reste dans le flux — visibility, pas display", () => {
    const vis = /#app\.has-topbar #band,[\s\S]*?\{([^}]+)\}/.exec(css);
    expect(vis, "règle has-topbar HUD introuvable").not.toBeNull();
    expect(vis![1]).toMatch(/visibility:\s*hidden/);
    expect(vis![1]).not.toMatch(/display\s*:/);
    // L'overlay est sous :not(.has-topbar) : les menus ne le voient pas.
    expect(tel).toMatch(/#app:not\(\.has-topbar\)/);
  });

  it("#head n'a pas déménagé dans #stage — le bureau garde le flux de #app", () => {
    const iBand = html.indexOf('id="band"');
    const iHead = html.indexOf('id="head"');
    const iStage = html.indexOf('id="stage"');
    expect(iBand).toBeGreaterThan(0);
    expect(iHead).toBeGreaterThan(iBand);
    expect(iStage).toBeGreaterThan(iHead);
    const fermetureHead = html.indexOf("</section>", iHead);
    expect(fermetureHead).toBeGreaterThan(iHead);
    expect(fermetureHead).toBeLessThan(iStage);
  });

  it("le pied reste — RECORD DÉPASSÉ vit là, compactage déjà en place", () => {
    expect(tel).toMatch(/#foot\s*\{/);
    expect(tel).not.toMatch(/#foot\s*\{[^}]*display:\s*none/);
    expect(tel).toMatch(/\.foot__value\s*\{[^}]*font-size:\s*17px/);
  });

  /*
   * ⚠️ Cette garde lisait la formule paysage de `fieldRect()` au caractère
   * près. Depuis que le terrain se met DEBOUT sur un téléphone tenu droit
   * (directive de Pierre : « l'UI rend très mal sur téléphone »), la formule
   * vit dans `render/orientation.ts`, et le paysage y est gardé AU PIXEL par
   * `tests/orientation.test.ts` ({24, 30, 952, 400}). Ce qui reste vrai ici :
   * le HIT ne bouge pas, et `fieldRect()` passe par la même conversion que le
   * dessin.
   */
  it("HIT ne bouge pas, et fieldRect() passe par la géométrie partagée", () => {
    expect(scene).toMatch(/const HIT = 1\.22/);
    expect(scene).toContain("rectEcran(this.cadreCourant)");
  });
});
