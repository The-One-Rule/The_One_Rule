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
  },
});
