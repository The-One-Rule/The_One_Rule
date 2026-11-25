import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";

/*
 * `DepotPrisma` (api/_depot-prisma.ts) ne s'exerce que contre un VRAI PostgreSQL
 * (`TOR_BASE_TEST_URL`, voir tests/depot-contrat.test.ts). Sans base, ses
 * lignes ne peuvent pas être couvertes, et le cliquet `api/**` tomberait sur
 * un poste qui n'a pas de PostgreSQL — sans qu'aucune logique ait perdu son
 * test. Il sort donc du calcul, ET on le dit. La CI, elle, a une base et
 * `TOR_BASE_EXIGEE=1` : le cliquet y porte sur tout.
 */
const AVEC_BASE = !!process.env.TOR_BASE_TEST_URL?.trim();
if (!AVEC_BASE && process.argv.includes("--coverage")) {
  console.warn("couverture : sans TOR_BASE_TEST_URL, api/_depot-prisma.ts est hors du calcul (la CI le compte).");
}

/**
 * EN DEV, `/api/` N'EST PAS SERVI PAR VITE.
 *
 * Il n'y a pas de fonctions Vercel en local, et le client appelle par défaut
 * `/api/auth`, `/api/moi`… Or Vite lit une adresse SANS extension comme un
 * MODULE : il servait `api/auth.ts` transformé (200, du JavaScript que le
 * client ne savait pas lire comme du JSON) et pré-transformait ses imports.
 * Sans conséquence tant qu'ils étaient tous relatifs ; depuis Prisma, ils
 * mènent à `@prisma/client` : Vite découvre une dépendance neuve, ré-optimise
 * et RECHARGE la page. Mesuré le 25/11 : l'e2e navigateur tombait 4 fois sur 4
 * à froid (10 assertions, « Failed to fetch dynamically imported module …
 * qr.ts »), 0 sur 3 sur master. Un 404 net dit la vérité : pas de comptes ici.
 */
const pasDApiEnDev: Plugin = {
  name: "tor-pas-d-api-en-dev",
  configureServer(serveur) {
    serveur.middlewares.use((req, res, suite) => {
      if (req.url?.startsWith("/api/")) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ disponible: false }));
        return;
      }
      suite();
    });
  },
};

export default defineConfig({
  base: "./",
  plugins: [pasDApiEnDev],
  build: { target: "es2022", assetsInlineLimit: 4096, cssCodeSplit: false },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    /*
     * Node 25+ expose un `localStorage` natif qui MASQUE celui de jsdom : il
     * vaut `undefined` sans `--localstorage-file`, et 22 tests tombaient sans
     * rapport avec leur sujet. Le couper rend l'environnement de Node 22.
     */
    execArgv: Number(process.versions.node.split(".")[0]) >= 25 ? ["--no-experimental-webstorage"] : [],
    /*
     * LA COUVERTURE (`npm run coverage`) — un CLIQUET, pas un objectif.
     *
     * Relevé du 08/10 : 51 % des lignes au total, mais la moyenne ne dit rien.
     * Les couches PURES sont couvertes à 85-98 % ; les trous sont `main.ts`
     * (45 %) et `multi.ts` (7 %), deux fichiers qui touchent le DOM et le
     * réseau. `server/index.ts` lit 0 % ici et 92 % sous l'e2e, qui l'exerce
     * en vrai : vitest ne compte pas l'e2e.
     *
     * Les seuils ne portent donc que là où une baisse veut dire « de la
     * logique de jeu a été ajoutée sans test » : moteur, jeu, protocole,
     * fonctions edge. Ils sont posés un ou deux points SOUS la mesure. Un
     * seuil global à 51 % ne protégerait rien, et un seuil sur `multi.ts`
     * pousserait à tester l'orthographe du code (audit, R3).
     */
    coverage: {
      provider: "v8",
      include: ["src/**", "server/**", "shared/**", "api/**"],
      exclude: AVEC_BASE ? [] : ["api/_depot-prisma.ts"],
      reporter: ["text-summary", "json-summary"],
      thresholds: {
        "src/engine/**": { lines: 97, branches: 92 },
        "src/game/**": { lines: 94, branches: 86 },
        "shared/**": { lines: 94, branches: 90 },
        "api/**": { lines: 85, branches: 76 },
      },
    },
  },
});
