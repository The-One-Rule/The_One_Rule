import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Shell } from "./ui/Shell";

/**
 * Écrit le DOM de l'application dans `#app`, de façon SYNCHRONE : `flushSync`
 * ne rend la main qu'une fois les éléments en place.
 *
 * Ce module n'exporte rien et n'existe que pour son effet. `entry.tsx` l'importe
 * AVANT `main.ts`, et c'est l'ordre d'évaluation des modules ES qui garantit que
 * le DOM existe quand `main.ts` le lit.
 *
 * Les composants de `src/ui/` sont STATIQUES (ni état, ni props qui changent) :
 * React les rend une fois et ne les re-rend jamais, donc ne touche plus au DOM
 * que `main.ts` pilote impérativement (classes `hidden`, `innerHTML`…). C'est ce
 * qui rend la migration écran par écran possible — voir docs/adr/0010.
 */
const racine = document.getElementById("app");
if (!racine) throw new Error("#app introuvable dans index.html");

flushSync(() => createRoot(racine).render(<Shell />));
