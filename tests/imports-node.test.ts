/**
 * LES FONCTIONS NODE SE CHARGENT — la panne qu'aucun autre test ne voit.
 *
 * En runtime EDGE, Vercel regroupe chaque fonction en un fichier : un import
 * relatif sans extension (`from "./_depot"`) y marche. En runtime NODE (depuis
 * Prisma, ADR 0012), il transpile fichier par fichier SANS regrouper, et Node
 * refuse un import ESM sans extension. Mesuré le 25/11 avec `vercel build` :
 * la fonction `moi` passée en Node tel quelle levait `ERR_MODULE_NOT_FOUND …
 * shared/profil` au chargement — toutes les routes de compte en 500, build
 * vert, tests verts, `tsc` vert.
 *
 * Ce fichier parcourt donc le graphe d'imports de chaque fonction Node, comme
 * Node le chargera, et exige que chaque import relatif nomme un `.js` qui
 * correspond à un fichier réel. Éprouvé en retirant l'extension d'un import
 * de `shared/compte.ts` : il tombe en nommant le fichier et l'import.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = join(__dirname, "..");
const API = join(RACINE, "api");

/** Les fonctions (pas les modules `_`), et le runtime que chacune déclare. */
const fonctions = readdirSync(API)
  .filter((f) => f.endsWith(".ts") && !f.startsWith("_"))
  .map((f) => ({ f, edge: /runtime:\s*"edge"/.test(readFileSync(join(API, f), "utf8")) }));
const NODE = fonctions.filter((x) => !x.edge).map((x) => x.f);

/** Les imports de VALEUR relatifs (un `import type` disparaît à la compilation). */
function importsRelatifs(source: string): string[] {
  const out: string[] = [];
  const motif = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
  for (const m of source.matchAll(motif)) {
    if (m[2]) continue;
    out.push((m[3] ?? m[4])!);
  }
  return out;
}

function graphe(entree: string): { fichier: string; spec: string }[] {
  const fautes: { fichier: string; spec: string }[] = [];
  const vus = new Set<string>();
  const pile = [entree];
  while (pile.length) {
    const f = pile.pop()!;
    if (vus.has(f)) continue;
    vus.add(f);
    for (const spec of importsRelatifs(readFileSync(f, "utf8"))) {
      const cible = resolve(dirname(f), spec);
      const ts = cible.replace(/\.js$/, ".ts");
      if (!spec.endsWith(".js") || !existsSync(ts)) {
        fautes.push({ fichier: relative(RACINE, f), spec });
        continue;
      }
      pile.push(ts);
    }
  }
  return fautes;
}

describe("les fonctions Node se chargent sous Node", () => {
  it("les fonctions qui touchent la base tournent en Node, pas en edge", () => {
    for (const f of ["amis.ts", "auth.ts", "authcb.ts", "boutique.ts", "moi.ts", "perf.ts"]) {
      expect(NODE, `${f} doit tourner en Node (Prisma)`).toContain(f);
    }
  });

  it.each(NODE)("%s : chaque import relatif nomme un .js qui existe", (f) => {
    expect(graphe(join(API, f))).toEqual([]);
  });

  it.each(NODE)("%s : exporte le format `fetch`", async (f) => {
    const m = (await import(`../api/${f}`)) as { default?: { fetch?: unknown } };
    expect(typeof m.default?.fetch, `${f} : en Node, une fonction exportée seule serait lue comme (req, res)`).toBe("function");
  });
});
