/**
 * Le seul propriétaire de l'écran visible.
 *
 * `main.ts` demande `montre`. Ce module pose la classe `hidden`. Les écrans
 * migrés s'abonnent et montent leur propre contenu : personne d'autre n'écrit
 * dans leur DOM.
 */

export const ECRANS = [
  "home",
  "niveau",
  "boutique",
  "fiche",
  "solo",
  "brief",
  "over",
  "codex",
  "compte",
  "classement",
  "amis",
  "reglages",
  "multi-id",
  "multi-join",
  "multi-lobby",
  "multi-end",
] as const;

export type EcranId = (typeof ECRANS)[number] | null;

type Ecoute = (id: EcranId) => void;

let courant: EcranId = "home";
const ecoutes = new Set<Ecoute>();

export function ecranCourant(): EcranId {
  return courant;
}

/** Retourne la fonction qui retire l'abonnement. */
export function surEcran(cb: Ecoute): () => void {
  ecoutes.add(cb);
  return () => {
    ecoutes.delete(cb);
  };
}

export function montre(id: EcranId, doc: Document | null = typeof document === "undefined" ? null : document): void {
  courant = id;
  if (doc) {
    for (const s of ECRANS) {
      const el = doc.getElementById(s);
      if (!el) continue;
      el.classList.toggle("hidden", s !== id);
    }
  }
  for (const cb of ecoutes) cb(id);
}

/** Tests : repart d'un écran connu, sans abonnés. */
export function reinitialiseNav(id: EcranId = "home"): void {
  courant = id;
  ecoutes.clear();
}
