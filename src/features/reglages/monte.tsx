import { createRoot, type Root } from "react-dom/client";
import { ecranCourant, surEcran } from "../../nav";
import type { EcranId } from "../../nav";
import { Reglages } from "./Reglages";
import type { EffetsReglages } from "./effets";

let root: Root | null = null;
let arret: (() => void) | null = null;

function peint(hote: HTMLElement, effets: EffetsReglages, id: EcranId): void {
  if (!root) root = createRoot(hote);
  if (id === "reglages") root.render(<Reglages effets={effets} />);
  else root.render(null);
}

/**
 * Branche Réglages sur la navigation. Le retour démonte le contenu :
 * plus aucun écouteur ni abonnement.
 */
export function monteReglages(hote: HTMLElement, effets: EffetsReglages): () => void {
  if (arret) arret();
  const stop = surEcran((id) => peint(hote, effets, id));
  peint(hote, effets, ecranCourant());
  arret = () => {
    stop();
    root?.unmount();
    root = null;
    arret = null;
  };
  return arret;
}
