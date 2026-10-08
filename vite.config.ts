import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
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
