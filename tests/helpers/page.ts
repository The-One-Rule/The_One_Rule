import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Shell } from "../../src/ui/Shell";

/**
 * La page telle que le navigateur la voit après le rendu de React : le
 * `<head>` de `index.html` (méta, JSON-LD…) et, dans `#app`, le balisage de
 * `src/ui/`.
 *
 * Ces tests lisaient `index.html` tel quel quand tout le DOM s'y trouvait. Il
 * est désormais écrit par des composants ; ce helper leur redonne la même
 * chaîne, sans que chacun ait à connaître React.
 */
export function pageHtml(): string {
  const gabarit = readFileSync("index.html", "utf8");
  // React 19 ajoute, côté SERVEUR seulement, un `<link rel="preload">` devant
  // les images ; le vrai client (`createRoot`) n'en écrit jamais. On l'écarte
  // pour que le test voie le DOM du navigateur, pas celui du rendu serveur.
  const balisage = renderToStaticMarkup(createElement(Shell)).replace(
    /<link rel="preload" as="image"[^>]*>/g,
    "",
  );
  return gabarit.replace('<div id="app"></div>', () => `<div id="app">${balisage}</div>`);
}
