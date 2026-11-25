/**
 * Signal entre le reste du jeu et l'écran Réglages.
 *
 * Pas un magasin : la sauvegarde reste dans `progress`. On dit seulement
 * « relis-la ». Le démontage retire l'abonnement.
 */

const ecoutes = new Set<() => void>();

export function invalideReglages(): void {
  for (const cb of ecoutes) cb();
}

export function souscrisReglages(cb: () => void): () => void {
  ecoutes.add(cb);
  return () => {
    ecoutes.delete(cb);
  };
}
