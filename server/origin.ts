/**
 * Contrôle d'origine des connexions WebSocket.
 *
 * Séparé de `index.ts` parce que celui-ci ouvre un port dès l'import : une
 * règle de sécurité doit pouvoir être testée sans démarrer de serveur. Même
 * raison d'être que `match.ts` — la logique pure d'un côté, l'écoute réseau
 * de l'autre.
 */

/** Liste blanche depuis l'environnement : `"https://a.app, https://b.app"`. */
export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Une origine a-t-elle le droit d'ouvrir une socket ?
 *
 * Liste vide EN PRODUCTION : tout est refusé. C'est volontaire. Un serveur
 * public sans liste blanche laisse n'importe quelle page ouvrir des salons sur
 * notre instance, et personne ne s'en aperçoit jamais. Un multijoueur
 * visiblement cassé au premier déploiement est un bien meilleur défaut : il se
 * corrige en une commande (`fly secrets set ALLOWED_ORIGINS=…`).
 *
 * Liste vide HORS production : tout est accepté, y compris les clients sans
 * en-tête `Origin`. Les navigateurs en envoient toujours un ; les clients Node
 * — dont `e2e.mjs` — n'en envoient aucun.
 */
export function originAllowed(
  origin: string | undefined,
  allowed: string[],
  production: boolean,
): boolean {
  if (allowed.length > 0) return !!origin && allowed.includes(origin);
  return !production;
}
