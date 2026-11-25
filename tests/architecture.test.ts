/**
 * LES FRONTIÈRES DE L'ARCHITECTURE, tenues par un test et non par la relecture.
 *
 * Tout le dépôt repose sur une promesse : `src/engine/` est PUR — aucun DOM,
 * aucune horloge, aucun hasard qui ne vienne pas d'une graine. C'est elle qui
 * permet à `verifyRun` de REJOUER un run côté serveur, et au multijoueur de
 * reconstruire chaque manche depuis `{ seed, idx }` sans jamais transmettre de
 * scène (docs/adr/0002, 0003). Elle était VRAIE dans le code et gardée par
 * rien : `tests/invariants-compte.test.ts` refusait seulement l'import des
 * comptes. Un `Date.now()` glissé dans une règle passait tsc, passait les
 * tests, et faisait diverger en silence le rejeu serveur du jeu à l'écran —
 * le seul défaut que ce projet tient pour fatal (« le jeu triche »).
 *
 * Trois couches pures, une règle chacune :
 *   · `src/engine/` n'importe que lui-même et `shared/` ;
 *   · `shared/` — importé par le client, le serveur ET les fonctions edge —
 *     n'importe que lui-même ;
 *   · la logique de match du serveur (`match`, `coop`, `rapide`, `debit`)
 *     n'importe que `shared/` et le moteur : l'horloge et les sockets restent
 *     dans `server/index.ts`, qui les lui PASSE.
 * Et aucune des trois ne touche à ce qui rend un calcul irreproductible.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

const fichiers = (dossier: string): string[] =>
  readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : p.endsWith(".ts") ? [p] : [];
  });

/** Le code sans ses commentaires : un commentaire qui DIT « Date.now() » n'en appelle pas. */
const sansCommentaires = (t: string): string =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = (f: string): string => sansCommentaires(readFileSync(f, "utf8"));

/** Les modules importés par un fichier, résolus depuis la racine du dépôt. */
const imports = (f: string): string[] =>
  // `from "…"`, `import("…")` ET `import "…"` : un import d'effet de bord,
  // sans `from`, échappait à la première version (éprouvé).
  [...code(f).matchAll(/(?:\bfrom|\bimport\s*\(|\bimport)\s*["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((m): m is string => typeof m === "string" && m.startsWith("."))
    .map((m) => normalize(join(dirname(f), m)));

/** Ce qui rend un calcul irreproductible, ou le lie à un navigateur. */
const IMPUR: [RegExp, string][] = [
  [/\bMath\.random\s*\(/, "Math.random()"],
  [/\bDate\.now\s*\(/, "Date.now()"],
  [/\bnew Date\s*\(/, "new Date()"],
  [/\bperformance\.now\s*\(/, "performance.now()"],
  [/\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/, "minuterie"],
  [/\b(document|window|localStorage|sessionStorage|navigator)\./, "API du navigateur"],
  [/\bfetch\s*\(/, "réseau"],
];

const impuretes = (f: string): string[] => {
  const c = code(f);
  return IMPUR.filter(([re]) => re.test(c)).map(([, quoi]) => `${f} : ${quoi}`);
};

const MOTEUR = fichiers("src/engine");
const PARTAGE = fichiers("shared");
const MATCH = ["server/match.ts", "server/coop.ts", "server/rapide.ts", "server/debit.ts"];

describe("les couches pures le restent", () => {
  it("le relevé porte bien sur le code (garde contre un test qui ne lit rien)", () => {
    expect(MOTEUR.length).toBeGreaterThanOrEqual(15);
    expect(PARTAGE.length).toBeGreaterThanOrEqual(5);
  });

  it("le moteur n'importe que lui-même et shared/", () => {
    const hors = MOTEUR.flatMap((f) =>
      imports(f)
        .filter((m) => !m.startsWith("src/engine") && !m.startsWith("shared"))
        .map((m) => `${f} → ${m}`),
    );
    expect(hors).toEqual([]);
  });

  it("shared/ n'importe que lui-même : client, serveur et edge le chargent tous", () => {
    const hors = PARTAGE.flatMap((f) =>
      imports(f)
        .filter((m) => !m.startsWith("shared"))
        .map((m) => `${f} → ${m}`),
    );
    expect(hors).toEqual([]);
  });

  it("la logique de match n'importe que shared/ et le moteur", () => {
    const hors = MATCH.flatMap((f) =>
      imports(f)
        .filter((m) => !m.startsWith("shared") && !m.startsWith("src/engine"))
        .map((m) => `${f} → ${m}`),
    );
    expect(hors).toEqual([]);
  });

  it("aucune horloge, aucun hasard non seedé, aucune API de navigateur", () => {
    expect([...MOTEUR, ...PARTAGE, ...MATCH].flatMap(impuretes)).toEqual([]);
  });

  it("le détecteur voit bien ce qu'il cherche", () => {
    // Sans ce témoin, une expression régulière fausse rendrait le test
    // précédent vert pour toujours.
    const temoin = "const t = Date.now(); const r = Math.random(); window.x = 1;";
    const vus = IMPUR.filter(([re]) => re.test(temoin)).map(([, q]) => q);
    expect(vus).toEqual(["Math.random()", "Date.now()", "API du navigateur"]);
    // Et un commentaire qui en parle n'est pas un appel.
    const commente = "/** appelle Date.now() */\n// window.x\nconst a = 1;";
    expect(IMPUR.some(([re]) => re.test(sansCommentaires(commente)))).toBe(false);
  });
});
