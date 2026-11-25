/**
 * Délai d'un appel du client vers nos fonctions.
 *
 * Un réseau mobile qui ne répond pas ne doit pas laisser la promesse ouverte :
 * l'écran resterait en chargement, et une action volontaire n'aurait aucune
 * issue. Au-delà, `fetch` rejette et l'appelant traite l'échec.
 */
export const DELAI_APPEL_MS = 5_000;

/** Ajoute un signal d'abandon si l'appelant n'en a pas déjà un. */
export function avecDelai(init: RequestInit = {}, ms: number = DELAI_APPEL_MS): RequestInit {
  if (init.signal) return init;
  return { ...init, signal: AbortSignal.timeout(ms) };
}
