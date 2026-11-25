/**
 * LE CONTRAT DE `src/ui/`, tenu par un test.
 *
 * Le DOM de l'application n'est plus écrit dans `index.html` (2 100 lignes) mais
 * rendu par des composants React. La migration se fait en deux temps
 * (docs/adr/0010) et ce premier temps ne tient que sur une promesse :
 *
 *   · les composants de `src/ui/` sont du BALISAGE STATIQUE. Aucun état, aucun
 *     effet : React les rend une fois, au chargement, puis n'y touche plus.
 *     `main.ts` continue de piloter ce DOM à la main (classe `hidden`,
 *     `innerHTML`, `textContent`). Un `useState` dans un de ces composants le
 *     ferait re-rendre, et React effacerait en silence ce que `main.ts` vient
 *     d'écrire — l'écran se « réinitialiserait » sans qu'aucune erreur ne soit
 *     levée ;
 *   · ils ne contiennent aucune logique de jeu : ni moteur, ni réseau, ni
 *     comptes. Un composant qui en importerait casserait aussi la frontière que
 *     `tests/architecture.test.ts` garde côté moteur ;
 *   · `main.ts` ne s'exécute qu'après le rendu (ordre d'import de `entry.tsx`),
 *     parce qu'il lit les éléments par leur `id` dès son évaluation.
 *
 * Quand un écran passera à un vrai état React, il quittera `src/ui/` pour
 * `src/features/` : c'est la sortie de ce dossier, pas l'affaiblissement de ce
 * test, qui marque l'écran comme migré.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";
import { pageHtml } from "./helpers/page";

const fichiers = (dossier: string): string[] =>
  readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.tsx?$/.test(p) ? [p] : [];
  });

/** Le code sans ses commentaires : un commentaire qui DIT `useState` n'en appelle pas. */
const code = (f: string): string =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const UI = fichiers("src/ui");

describe("index.html", () => {
  const gabarit = readFileSync("index.html", "utf8");

  it("ne porte plus le DOM : un #app vide, que React remplit", () => {
    expect(gabarit).toContain('<div id="app"></div>');
    expect(gabarit).not.toMatch(/<(section|button|canvas|nav|footer)\b/);
    // Le seuil n'est pas esthétique : il empêche le retour du fichier géant.
    expect(gabarit.split("\n").length).toBeLessThan(150);
  });

  it("charge l'entrée React, pas main.ts directement", () => {
    expect(gabarit).toContain('<script type="module" src="/src/entry.tsx"></script>');
    expect(gabarit).not.toContain("/src/main.ts");
  });
});

describe("src/entry.tsx et src/monte.tsx", () => {
  const entree = readFileSync("src/entry.tsx", "utf8");
  const monte = readFileSync("src/monte.tsx", "utf8");

  it("rend le DOM de façon synchrone", () => {
    expect(monte, "flushSync absent : le rendu ne serait pas terminé").toContain("flushSync(");
  });

  it("importe `monte` AVANT `main` : le DOM existe quand main.ts le lit", () => {
    const iMonte = entree.indexOf('import "./monte";');
    const iMain = entree.indexOf('import "./main";');
    expect(iMonte, "import de ./monte absent").toBeGreaterThan(-1);
    expect(iMain, "import de ./main absent").toBeGreaterThan(-1);
    expect(iMonte).toBeLessThan(iMain);
  });

  it("ne charge pas main.ts par import() : il quitterait le paquet de la page", () => {
    // `scripts/check-deploy.mjs` ne lit que les <script> de la page.
    expect(entree.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/\bimport\s*\(/);
  });
});

describe("src/ui — du balisage et rien d'autre", () => {
  it("le relevé porte bien sur le code (garde contre un test qui ne lit rien)", () => {
    expect(UI.length).toBeGreaterThanOrEqual(40);
  });

  it("n'importe que React et lui-même", () => {
    const hors = UI.flatMap((f) =>
      [...code(f).matchAll(/(?:\bfrom|\bimport\s*\(|\bimport)\s*["']([^"']+)["']/g)]
        .map((m) => m[1])
        .filter((m) => !(m === "react" || m.startsWith("react/") || m.startsWith("react-dom")))
        .filter((m) => !m.startsWith(".") || !normalize(join(dirname(f), m)).startsWith(normalize("src/ui")))
        .map((m) => `${f} → ${m}`),
    );
    expect(hors).toEqual([]);
  });

  it("reste statique : aucun hook, donc aucun re-rendu", () => {
    const HOOKS =
      /\buse(State|Effect|LayoutEffect|Reducer|Ref|Context|Memo|Callback|Id|Transition|SyncExternalStore|Optimistic)\b/;
    const fautifs = UI.filter((f) => HOOKS.test(code(f)));
    expect(fautifs).toEqual([]);
  });

  it("ne branche aucun gestionnaire : les événements sont posés par main.ts", () => {
    const fautifs = UI.filter((f) => /\son[A-Z][A-Za-z]+=/.test(code(f)));
    expect(fautifs).toEqual([]);
  });
});

describe("le document rendu", () => {
  const html = pageHtml();

  it("chaque id est unique : `$(id)` désigne un seul élément", () => {
    const vus = new Map<string, number>();
    for (const m of html.matchAll(/\sid="([^"]+)"/g)) vus.set(m[1], (vus.get(m[1]) ?? 0) + 1);
    const doubles = [...vus].filter(([, n]) => n > 1).map(([id, n]) => `#${id} ×${n}`);
    expect(vus.size, "aucun id trouvé : le rendu est vide").toBeGreaterThan(400);
    expect(doubles).toEqual([]);
  });

  it("garde l'ordre des écrans et des couches de #app", () => {
    // `#cv` avant ses surcouches, le HUD avant le pied : la CSS et `coop.test`
    // en dépendent. Ce sont les premiers ids de chaque bloc racine.
    const ordre = ["heat", "band", "head", "stage", "liveHud", "foot", "home", "multi-end", "pastille"].map((id) =>
      html.indexOf(`id="${id}"`),
    );
    expect(ordre.every((i) => i > -1)).toBe(true);
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre);
  });

  it("garde les 16 écrans, et l'accueil seul visible", () => {
    const ecrans = [...html.matchAll(/<section class="(screen[^"]*)" id="([^"]+)"/g)];
    expect(ecrans.map((m) => m[2]).length).toBe(16);
    const visibles = ecrans.filter((m) => !m[1].split(" ").includes("hidden")).map((m) => m[2]);
    expect(visibles).toEqual(["home"]);
  });
});
