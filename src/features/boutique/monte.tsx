import { createRoot, type Root } from "react-dom/client";
import { ecranCourant, surEcran } from "../../nav";
import type { EcranId } from "../../nav";
import { Boutique } from "./Boutique";
import type { EffetsBoutique } from "./effets";

let root: Root | null = null;
let arret: (() => void) | null = null;

function peint(hote: HTMLElement, effets: EffetsBoutique, id: EcranId): void {
  if (!root) root = createRoot(hote);
  if (id === "boutique") root.render(<Boutique effets={effets} />);
  else root.render(null);
}

export function monteBoutique(hote: HTMLElement, effets: EffetsBoutique): () => void {
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
