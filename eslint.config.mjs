/**
 * LE LINT — phase 5, point 29. `npm run lint`.
 *
 * Réglé sur la JUSTESSE, jamais sur le style : les règles recommandées
 * d'ESLint et de typescript-eslint, qui visent des bugs probables (variable
 * inutilisée, `any` qui désactive le typage, réaffectation oubliée…). Aucun
 * formateur : reformater 30 000 lignes casserait `git blame` sans corriger
 * un seul bug, et le dépôt a ses conventions (CLAUDE.md §11).
 *
 * Mesuré au premier passage : 15 signalements seulement — `tsc` en mode strict
 * faisait déjà le gros du travail. Deux réglages, chacun pour une raison :
 *
 *  · `no-irregular-whitespace` ignore commentaires et chaînes. Les neuf
 *    « blancs irréguliers » trouvés sont des BOM LITTÉRAUX (U+FEFF), voulus :
 *    ils documentent et TESTENT le bug du BOM devant une URL (`src/env.ts`,
 *    `tests/env.test.ts`). Hors chaîne et commentaire, la règle reste active ;
 *  · un paramètre préfixé `_` est un inutilisé ASSUMÉ (signature imposée par
 *    une interface : `statsOf(_playerId)`, `_possessions`).
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "node_modules/**", "public/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "no-irregular-whitespace": ["error", { skipStrings: true, skipComments: true, skipTemplates: true, skipRegExps: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
);
