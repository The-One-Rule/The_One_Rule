/**
 * @vitest-environment jsdom
 *
 * LA FAILLE est la vitrine du site, et une vitrine se casse en silence.
 *
 * Trois choses peuvent y régresser sans qu'aucun autre test ne bouge, sans
 * erreur console, et sans se voir sur une capture :
 *
 * 1. Un calque de décor qui capte les clics. La fissure couvre TOUTE la
 *    surface du composant (`inset: 0`), pas seulement la fente : lui rendre
 *    ses `pointer-events`, c'est rendre SOLO et MULTI inertes d'un coup. Le
 *    symptôme serait « les boutons de l'accueil ne marchent plus », et la
 *    cause n'est pas dans les boutons.
 * 2. Une animation qui touche autre chose que `transform` et `opacity`. Vingt
 *    et quelques éléments animés en boucle sur la page d'accueil : une seule
 *    propriété qui déclenche la mise en page et c'est un recalcul permanent.
 * 3. Une animation neutralisée en mouvement réduit sans état de repos. Le
 *    piège est déjà payé dans ce dépôt : les particules démarrent à
 *    `opacity: 0`, donc couper l'animation sans leur rendre d'opacité les
 *    fait DISPARAÎTRE au lieu de les figer.
 *
 * jsdom ne calcule pas de cascade : on lit la feuille et on croise avec le
 * HTML, comme `hidden.test.ts`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/** Les seules propriétés qu'une animation de décor a le droit de toucher. */
const SURES = new Set(["transform", "opacity"]);

/** Corps de chaque `@keyframes`, par nom. */
const keyframes = new Map<string, string>();
/** Règles `sélecteur { corps }` hors `@keyframes`, at-rules aplaties. */
const regles: { sel: string; corps: string }[] = [];
/** Le contenu réuni des blocs `prefers-reduced-motion: reduce`. */
let calme = "";

/** Corps du bloc `{…}` qui commence à `ouvre`, accolades imbriquées comprises. */
function corpsDe(css: string, ouvre: number): { corps: string; fin: number } {
  let prof = 0;
  let debut = ouvre + 1;
  for (let i = ouvre; i < css.length; i++) {
    if (css[i] === "{") {
      if (prof === 0) debut = i + 1;
      prof++;
    } else if (css[i] === "}") {
      prof--;
      if (prof === 0) return { corps: css.slice(debut, i), fin: i + 1 };
    }
  }
  return { corps: "", fin: css.length };
}

beforeAll(() => {
  const html = readFileSync("index.html", "utf8");
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");

  let css = readFileSync("src/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  // Les blocs de mouvement réduit, avant tout aplatissement : c'est
  // l'appartenance au bloc qui porte le sens.
  for (const m of Array.from(css.matchAll(/@media[^{]*prefers-reduced-motion[^{]*\{/g))) {
    calme += corpsDe(css, m.index! + m[0].length - 1).corps;
  }

  // Les `@keyframes` sortent d'abord — leurs `0% {}` ressemblent à des règles.
  for (const m of Array.from(css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g))) {
    keyframes.set(m[1]!, corpsDe(css, m.index! + m[0].length - 1).corps);
  }
  css = css.replace(/@keyframes\s+[\w-]+\s*\{/g, (t) => t.replace("@keyframes", "/*kf*/"));
  for (const [nom] of keyframes) {
    const i = css.indexOf(`/*kf*/ ${nom}`);
    if (i >= 0) {
      const { fin } = corpsDe(css, css.indexOf("{", i));
      css = css.slice(0, i) + css.slice(fin);
    }
  }

  for (const [, sel, corps] of css.replace(/@[a-z-]+[^{]*\{/g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    regles.push({ sel: sel!.trim(), corps: corps! });
  }
});

/** Noms d'animation cités par les règles dont le sélecteur satisfait `vise`. */
function animationsDe(vise: (sel: string) => boolean): Set<string> {
  const noms = new Set<string>();
  for (const { sel, corps } of regles) {
    if (!vise(sel)) continue;
    const decl = /(^|[\s;])animation(-name)?\s*:([^;]*)/g;
    for (const [, , , valeur] of corps.matchAll(decl)) {
      for (const mot of valeur!.split(/[\s,]+/)) {
        if (keyframes.has(mot)) noms.add(mot);
      }
    }
  }
  return noms;
}

describe("la faille", () => {
  it("son décor ne vole aucun clic", () => {
    // `.fissure` est posée par-dessus les deux faces sur toute leur surface.
    const posees = regles.filter((r) => /^\.fissure$/.test(r.sel));
    expect(posees.length, ".fissure n'a plus de règle propre").toBeGreaterThan(0);
    expect(
      posees.some((r) => /pointer-events\s*:\s*none/.test(r.corps)),
      ".fissure sans `pointer-events: none` : elle couvre SOLO et MULTI en entier",
    ).toBe(true);
  });

  it("l'accueil porte la coupe entre l'enseigne et la faille", () => {
    const home = document.getElementById("home");
    expect(home, "#home absent").not.toBeNull();
    const coupe = home!.querySelector(".coupe");
    expect(coupe, "la coupe manque sur l'accueil").not.toBeNull();
    expect(coupe!.getAttribute("aria-hidden")).toBe("true");
    const brand = home!.querySelector(".home__brand");
    const faille = home!.querySelector(".faille");
    expect(brand && faille && coupe, "enseigne, coupe ou faille manquent").toBeTruthy();
    expect(
      brand!.compareDocumentPosition(coupe!) & Node.DOCUMENT_POSITION_FOLLOWING,
      "la coupe doit suivre l'enseigne",
    ).toBeTruthy();
    expect(
      coupe!.compareDocumentPosition(faille!) & Node.DOCUMENT_POSITION_FOLLOWING,
      "la faille doit suivre la coupe",
    ).toBeTruthy();
  });

  it("la vitrine porte les familles qui font bouger la fente", () => {
    const fissure = document.querySelector(".fissure");
    expect(fissure).not.toBeNull();
    for (const nom of ["abime", "fenetre", "arcs", "braises", "debris", "eclats", "traverse"]) {
      expect(
        fissure!.querySelector(`.fissure__${nom}`),
        `.fissure__${nom} absent — la vitrine a perdu un plan`,
      ).not.toBeNull();
    }
    expect(fissure!.querySelectorAll(".fissure__sortie--solo i").length).toBeGreaterThan(6);
    expect(fissure!.querySelectorAll(".fissure__sortie--multi i").length).toBeGreaterThan(6);
  });

  it("tout ce qui bouge dans la fente est décoratif", () => {
    const fissure = document.querySelector(".fissure");
    expect(fissure, ".fissure absente du document").not.toBeNull();
    expect(fissure!.getAttribute("aria-hidden"), ".fissure doit être aria-hidden").toBe("true");
    // Rien d'informatif ne doit y être écrit : un lecteur d'écran ne verra
    // jamais ce calque, donc un texte posé là serait perdu.
    expect(fissure!.textContent?.trim(), "du texte dans un calque aria-hidden").toBe("");
    // Et les faces, elles, restent de vrais boutons atteignables.
    for (const id of ["btnSolo", "btnMulti"]) {
      const b = document.getElementById(id);
      expect(b?.tagName, `#${id} doit rester un <button>`).toBe("BUTTON");
      expect(b?.closest(".fissure"), `#${id} ne doit pas vivre dans le décor`).toBeNull();
    }
  });

  it("ses animations ne touchent que transform et opacity", () => {
    const noms = animationsDe((s) => /\.faille|\.fissure/.test(s));
    expect(noms.size, "aucune animation trouvée — l'extraction a cassé").toBeGreaterThan(6);
    const fautes: string[] = [];
    for (const nom of noms) {
      for (const [, prop] of keyframes.get(nom)!.matchAll(/(?:^|[{;\s])([a-z-]+)\s*:/g)) {
        if (!SURES.has(prop!)) fautes.push(`${nom} anime ${prop}`);
      }
    }
    expect(fautes, `une propriété de mise en page animée en boucle :\n${fautes.join("\n")}`)
      .toEqual([]);
  });

  it("rien ne disparaît quand le mouvement est coupé", () => {
    // Les familles qui démarrent invisibles. Couper leur animation sans leur
    // rendre d'opacité les efface au lieu de les figer.
    const invisibles = new Set<string>();
    for (const { sel, corps } of regles) {
      if (!/\.fissure__/.test(sel) || !/(^|[\s;])opacity\s*:\s*0\s*(;|$)/.test(corps)) continue;
      for (const un of sel.split(",")) invisibles.add(un.trim());
    }
    expect(invisibles.size, "aucun calque à `opacity: 0` — l'extraction a cassé")
      .toBeGreaterThan(2);

    const oublies: string[] = [];
    for (const sel of invisibles) {
      // Les pictogrammes de survol n'ont pas d'état de repos, et c'est
      // volontaire : sans mouvement, une épée figée au bord de la fente ne
      // raconte rien. Ils ne sont pas neutralisés, ils ne sortent pas.
      if (sel.includes("__sortie")) continue;
      const rendu = calme.includes(sel) && new RegExp(`${sel.replace(/[.]/g, "\\.")}[^{]*\\{[^}]*opacity\\s*:\\s*0?\\.?[1-9]`)
        .test(calme);
      if (!rendu) oublies.push(sel);
    }
    expect(oublies, `neutralisés sans état visible :\n${oublies.join("\n")}`).toEqual([]);
  });
});
