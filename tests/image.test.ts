/**
 * L'image du serveur contient-elle tout ce que le serveur importe ?
 *
 * Cette question n'a l'air de rien et elle a coûté une production.
 *
 * Le Dockerfile ne copie PAS le dépôt : il copie quatre ou cinq chemins
 * choisis, parce que le front est déployé ailleurs. Un import ajouté dans
 * `server/` vers un fichier absent de cette liste passe `tsc`, passe les
 * tests, passe `vite build` — et TUE l'instance au démarrage : Node ne résout
 * pas le module, le process meurt avant d'écouter, la sonde `/health` échoue,
 * et Fly répond 502.
 *
 * Le symptôme se lit comme « le serveur est tombé », jamais comme « il manque
 * un fichier dans l'image ». Payé le 30/08/2026 en ajoutant `cleanEnv` au
 * serveur pour nettoyer le BOM du secret de signature : un import d'une ligne,
 * `src/env.ts` absent du Dockerfile, salons injoignables.
 *
 * C'est la même famille que le BOM devant l'URL de collecte ou l'origine
 * refusée : une panne totale dont la cause est invisible à la lecture du code
 * qui la provoque. Elle se mesure, elle ne se relit pas.
 *
 * La liste des chemins est lue DANS le Dockerfile, jamais recopiée ici : un
 * test qui dupliquerait la liste passerait au vert le jour où quelqu'un la
 * modifie d'un seul côté, ce qui est exactement le bug qu'il prétend empêcher.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const lit = (f: string): string => readFileSync(f, "utf8");
const norm = (p: string): string => normalize(p).replace(/\\/g, "/");

/** Les chemins SOURCE des instructions `COPY` du Dockerfile. */
function cheminsCopies(): string[] {
  const out: string[] = [];
  for (const ligne of lit("Dockerfile").split("\n")) {
    const m = /^\s*COPY\s+(.+)$/.exec(ligne);
    if (!m) continue;
    const args = m[1]!.trim().split(/\s+/);
    // Le dernier argument est la destination ; tout le reste est source.
    for (const src of args.slice(0, -1)) {
      if (src.startsWith("--")) continue;
      out.push(norm(src));
    }
  }
  return out;
}

const COPIES = cheminsCopies();

const dansImage = (p: string): boolean =>
  COPIES.some((c) => p === c || p.startsWith(`${c}/`));

/** Résout un import relatif vers un fichier du dépôt, ou `null`. */
function resout(depuis: string, rel: string): string | null {
  const base = norm(join(dirname(depuis), rel));
  for (const cand of [`${base}.ts`, `${base}/index.ts`]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

/** Tous les fichiers du dépôt atteignables depuis un point d'entrée. */
function atteignables(entree: string): string[] {
  const vus = new Set<string>();
  const pile = [norm(entree)];
  while (pile.length) {
    const f = pile.pop()!;
    if (vus.has(f) || !existsSync(f)) continue;
    vus.add(f);
    for (const m of lit(f).matchAll(/from\s+"(\.[^"]+)"/g)) {
      const cible = resout(f, m[1]!);
      if (cible) pile.push(cible);
    }
  }
  return [...vus];
}

describe("image du serveur de salons", () => {
  it("le Dockerfile copie bien quelque chose — sinon le test suivant est vide", () => {
    // Garde-fou : si l'extraction des `COPY` cassait, `COPIES` serait vide et
    // TOUT serait signalé, ou pire, plus rien ne le serait.
    expect(COPIES).toContain("server");
    expect(COPIES).toContain("shared");
    expect(COPIES.length).toBeGreaterThan(3);
  });

  it("tout ce que le serveur importe est copié dans l'image", () => {
    const fichiers = atteignables("server/index.ts");
    // Le serveur atteint le protocole, le moteur, les glyphes : une poignée de
    // fichiers vide signalerait une extraction cassée.
    expect(fichiers.length).toBeGreaterThan(10);

    const absents = fichiers.filter((f) => !dansImage(f));
    expect(
      absents,
      "ces fichiers sont importés par le serveur mais absents de l'image — " +
        "l'instance mourra au démarrage et Fly répondra 502 :\n" +
        absents.map((f) => `  ${f}`).join("\n"),
    ).toEqual([]);
  });

  it("le point d'entrée du Dockerfile est bien celui qu'on teste", () => {
    // Si `CMD` changeait de fichier, le test ci-dessus vérifierait le mauvais
    // graphe d'imports sans rien dire.
    expect(lit("Dockerfile")).toContain("server/index.ts");
  });

  it("aucun chemin copié n'est exclu par .dockerignore", () => {
    /*
     * Le piège symétrique, et il est pire : `.dockerignore` retire un chemin
     * du CONTEXTE de construction, donc le `COPY` échoue — ou pire, copie un
     * dossier amputé. Le Dockerfile aurait l'air juste.
     */
    const ignores = lit(".dockerignore")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map(norm);

    const conflits: string[] = [];
    for (const c of COPIES) {
      for (const i of ignores) {
        if (c === i || c.startsWith(`${i}/`)) conflits.push(`${c} exclu par « ${i} »`);
      }
    }
    expect(conflits, conflits.join(" · ")).toEqual([]);
  });
});
