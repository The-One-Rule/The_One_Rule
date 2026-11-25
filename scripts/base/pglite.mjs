// PGlite n'est PAS une dépendance du dépôt (docs/BASE-DE-DONNEES.md §10) :
// ces scripts le chargent s'il est installé, et disent comment l'installer
// sinon, sans toucher à package.json.
let mod;
try {
  mod = await import("@electric-sql/pglite");
} catch {
  console.error("PGlite absent. Installer sans l'ajouter au dépôt :\n  npm i --no-save @electric-sql/pglite@0.3");
  process.exit(3);
}
export const PGlite = mod.PGlite;
