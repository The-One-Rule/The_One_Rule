import type { ReactNode } from "react";

interface Props {
  id: string;
  /** Écran à dock latéral (le salon et sa fin, qui portent le tchat). */
  dock?: boolean;
  /** Visible au chargement. Seul l'accueil l'est ; les autres sont affichés par `show()`. */
  visible?: boolean;
  children: ReactNode;
}

/**
 * L'enveloppe commune des écrans.
 *
 * Le contrat avec `main.ts` n'a pas changé : un écran est une `<section>` dont
 * l'`id` est un `EcranId` (voir `src/route.ts`) et que l'on montre ou cache en
 * basculant la classe `hidden`. Les classes sont écrites dans le même ordre
 * qu'avant — des sélecteurs de test et de CSS les lisent telles quelles.
 */
export function Screen({ id, dock = false, visible = false, children }: Props) {
  const className = ["screen", dock && "screen--dock", !visible && "hidden"].filter(Boolean).join(" ");
  return (
    <section className={className} id={id}>
      {children}
    </section>
  );
}
