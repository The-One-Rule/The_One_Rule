/**
 * Assemble le build Vite en un seul fichier HTML autonome, jouable hors ligne.
 *
 * Les polices sont embarquées en base64, mais uniquement en woff2 : les .woff
 * de repli ne servent qu'à des navigateurs qui ne feront jamais tourner ce jeu,
 * et doubleraient le poids du fichier.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";
const assetsDir = join(dist, "assets");
let html = readFileSync(join(dist, "index.html"), "utf8");
const files = readdirSync(assetsDir);

const css = files.find((f) => f.endsWith(".css"));
const js = files.find((f) => f.endsWith(".js"));

let style = readFileSync(join(assetsDir, css), "utf8");

// 1. polices : woff2 en data URI, blocs woff supprimés
let embedded = 0;
for (const f of files.filter((f) => f.endsWith(".woff2"))) {
  const b64 = readFileSync(join(assetsDir, f)).toString("base64");
  const before = style.length;
  style = style.replaceAll(`./${f}`, `data:font/woff2;base64,${b64}`);
  if (style.length !== before) embedded++;
}
style = style.replace(/,\s*url\(\.\/[^)]*\.woff\)\s*format\("woff"\)/g, "");

// 2. injection
// Remplacement par FONCTION, et non par chaîne : un bundle minifié contient
// des séquences $& et $' que String.replace réinterpréterait, ce qui réinjecte
// le tag d'origine au lieu du code.
const script = readFileSync(join(assetsDir, js), "utf8");
html = html
  .replace(new RegExp(`<link[^>]*href="[^"]*${css}"[^>]*>`), () => `<style>\n${style}\n</style>`)
  .replace(
    new RegExp(`<script[^>]*src="[^"]*${js}"[^>]*></script>`),
    () => `<script type="module">\n${script}\n</script>`,
  );

// 3. plus aucune référence externe ne doit subsister
const leftover = html.match(/(?:src|href)="\.?\/assets\/[^"]+"/g);
if (leftover) throw new Error("références externes restantes : " + leftover.join(", "));

writeFileSync("the-one-rule-v1.html", html);
const woff2 = files.filter((f) => f.endsWith(".woff2")).reduce((s, f) => s + statSync(join(assetsDir, f)).size, 0);
console.log(
  `single-file : ${(html.length / 1024).toFixed(0)} Ko  ` +
    `(dont ${(woff2 / 1024).toFixed(0)} Ko de polices, ${embedded} embarquées)`,
);
