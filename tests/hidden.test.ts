/**
 * @vitest-environment jsdom
 *
 * `hidden` cache-t-il vraiment ?
 *
 * Cette feuille de style n'a PAS de `.hidden { display: none }` générique, et
 * ce n'est pas un oubli : une règle unique perdrait la cascade contre les
 * `display: flex` que les composants se donnent (`.plates`, `.emotes`, `.chat`
 * en portent). Chaque composant masquable déclare donc la sienne.
 *
 * Le prix, c'est qu'on peut ajouter un élément masquable et oublier sa règle.
 * Le code JS bascule alors une classe qui ne fait RIEN, sans erreur, sans
 * avertissement, et personne ne le voit avant de tomber dessus dans le jeu :
 * `#briefPace` s'affichait ainsi sur le brief du run du jour — le mot ALLURE
 * au-dessus d'une rangée d'options vide, sur le seul mode où l'allure ne
 * s'applique pas.
 *
 * jsdom ne calcule pas de cascade CSS, donc on ne peut pas interroger
 * `getComputedStyle`. On lit la feuille et on croise les deux fichiers.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/** Classes pour lesquelles la feuille déclare bien `.classe.hidden`. */
const masquantes = new Set<string>();
/** Vrai si la feuille porte un `.hidden` générique — alors tout est couvert. */
let generique = false;

beforeAll(() => {
  const html = readFileSync("index.html", "utf8");
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");

  // On aplatit : commentaires retirés (ils contiennent des accolades et des
  // déclarations en exemple), puis les ouvertures d'at-rules, pour que les
  // règles imbriquées dans un `@media` se lisent comme les autres.
  const css = readFileSync("src/style.css", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@[a-z-]+[^{]*\{/g, "");
  for (const [, selecteurs, corps] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/display\s*:\s*none/.test(corps!)) continue;
    for (const sel of selecteurs!.split(",")) {
      const cible = sel.trim().split(/\s+/).pop() ?? "";
      if (cible === ".hidden") generique = true;
      // `.ghost.hidden` → ghost ; `#app.has-gutters .plates.hidden` → plates
      const m = /\.([\w-]+)\.hidden$/.exec(cible);
      if (m) masquantes.add(m[1]!);
    }
  }
});

describe("classe hidden", () => {
  it("la feuille déclare de quoi masquer chaque élément masquable", () => {
    const orphelins: string[] = [];
    for (const el of Array.from(document.querySelectorAll(".hidden"))) {
      const classes = Array.from(el.classList).filter((c) => c !== "hidden");
      if (!classes.some((c) => masquantes.has(c))) {
        orphelins.push(`${el.tagName.toLowerCase()}#${el.id || "?"} .${classes.join(".")}`);
      }
    }
    expect(generique || orphelins.length === 0, `sans règle de masquage : ${orphelins.join(" · ")}`)
      .toBe(true);
  });

  it("trouve bien des règles de masquage — sinon le test ci-dessus est vide", () => {
    // Garde-fou : si l'extraction cassait, `masquantes` serait vide et le
    // premier test passerait pour de mauvaises raisons.
    expect(masquantes.size).toBeGreaterThan(8);
    expect(masquantes.has("screen")).toBe(true);
    expect(document.querySelectorAll(".hidden").length).toBeGreaterThan(8);
  });
});
