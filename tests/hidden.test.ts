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
import { pageHtml } from "./helpers/page";

/** Classes pour lesquelles la feuille déclare bien `.classe.hidden`. */
const masquantes = new Set<string>();
/**
 * Identifiants pour lesquels la feuille déclare `#id.hidden`.
 *
 * Certains composants n'existent qu'une fois et se masquent par leur id plutôt
 * que par une classe — `#ledeHome`, `#compteTitre`. Ne lire que les classes
 * les faisait passer pour des orphelins.
 */
const masquantesId = new Set<string>();
/** Vrai si la feuille porte un `.hidden` générique — alors tout est couvert. */
let generique = false;

beforeAll(() => {
  const html = pageHtml();
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");

  // On aplatit : commentaires retirés (ils contiennent des accolades et des
  // déclarations en exemple), puis les ouvertures d'at-rules, pour que les
  // règles imbriquées dans un `@media` se lisent comme les autres.
  // Les deux feuilles : `theme.css` porte les composants du parcours.
  const css = (readFileSync("src/style.css", "utf8") + readFileSync("src/theme.css", "utf8"))
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
      const mi = /#([\w-]+)\.hidden$/.exec(cible);
      if (mi) masquantesId.add(mi[1]!);
    }
  }
});

describe("classe hidden", () => {
  it("la feuille déclare de quoi masquer chaque élément masquable", () => {
    const orphelins: string[] = [];
    for (const el of Array.from(document.querySelectorAll(".hidden"))) {
      if (el.id && masquantesId.has(el.id)) continue;
      const classes = Array.from(el.classList).filter((c) => c !== "hidden");
      if (!classes.some((c) => masquantes.has(c))) {
        orphelins.push(`${el.tagName.toLowerCase()}#${el.id || "?"} .${classes.join(".")}`);
      }
    }
    expect(generique || orphelins.length === 0, `sans règle de masquage : ${orphelins.join(" · ")}`)
      .toBe(true);
  });

  it("couvre AUSSI les éléments que seul le JS masque", () => {
    /*
     * ⚠️ LE TROU QUE CE TEST AVAIT, ET PAR LEQUEL UN BUG EST PASSÉ.
     *
     * Le test ci-dessus lit les éléments qui portent `hidden` DANS L'HTML. Or
     * la plupart ne l'obtiennent qu'à l'exécution : `$("teaser").classList
     * .add("hidden")` masquait un bloc dont la feuille n'avait aucune règle, et
     * il gardait ses 32 px, son filet et son fond — vides, sur l'écran de fin.
     * Le filet n'a rien dit, parce qu'il ne regardait pas là.
     *
     * On lit donc le CODE : tout `$("id").classList.add("hidden")` désigne un
     * élément masquable, exactement comme un `class="hidden"` en dur. Les deux
     * sources se croisent avec la même table `masquantes`.
     *
     * `toggle` est inclus : il ajoute la classe une fois sur deux, ce qui est
     * la même exigence.
     */
    const sources = ["src/main.ts", "src/multi.ts"]
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const ids = new Set<string>();
    for (const [, id] of sources.matchAll(
      /\$\(\s*"([\w-]+)"\s*\)[\s\S]{0,40}?classList\.(?:add|toggle)\(\s*"hidden"/g,
    )) {
      ids.add(id!);
    }
    // Garde-fou : si l'extraction cassait, l'assertion suivante serait vide.
    expect(ids.size, "aucun masquage par le JS trouvé — l'extraction a cassé").toBeGreaterThan(8);

    const orphelins: string[] = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      // Un id absent du HTML n'est pas le sujet de ce test.
      if (!el) continue;
      if (masquantesId.has(id)) continue;
      const classes = Array.from(el.classList).filter((c) => c !== "hidden");
      if (!classes.some((c) => masquantes.has(c))) {
        orphelins.push(`#${id} .${classes.join(".") || "(sans classe)"}`);
      }
    }
    expect(
      generique || orphelins.length === 0,
      `masqués par le JS sans règle de masquage : ${orphelins.join(" · ")}`,
    ).toBe(true);
  });

  it("trouve bien des règles de masquage — sinon le test ci-dessus est vide", () => {
    // Garde-fou : si l'extraction cassait, `masquantes` serait vide et le
    // premier test passerait pour de mauvaises raisons.
    expect(masquantes.size).toBeGreaterThan(8);
    expect(masquantes.has("screen")).toBe(true);
    expect(document.querySelectorAll(".hidden").length).toBeGreaterThan(8);
  });
});
