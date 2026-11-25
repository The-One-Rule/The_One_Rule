import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Reglages } from "./Reglages";
import { effetsMuets } from "./effets";
import type { EffetsReglages } from "./effets";

/** Les tests qui lisaient le HTML statique peignent maintenant le composant. */
export function peintReglagesPourTest(hote: HTMLElement, effets: EffetsReglages = effetsMuets): void {
  flushSync(() => {
    createRoot(hote).render(<Reglages effets={effets} />);
  });
}
