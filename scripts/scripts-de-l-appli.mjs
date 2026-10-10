/**
 * Les scripts que sert l'APPLICATION, et eux seuls.
 *
 * Extrait de `check-deploy.mjs` pour une raison : ce tri a déjà fait tomber la
 * CI, et un script à `await` de premier niveau qui appelle `process.exit` ne
 * se teste pas. La fonction est pure — du HTML et une adresse en entrée, des
 * URL absolues en sortie — et `tests/check-deploy.test.ts` la tient.
 *
 * ⚠️ VERCEL INJECTE SA BARRE D'OUTILS DANS SES PRÉVERSIONS :
 * `<script src="https://vercel.live/_next-live/feedback/feedback.js">`. Elle
 * vit sur un autre domaine, et le vérificateur lit toute réponse venue d'un
 * autre hôte comme un déploiement PROTÉGÉ (code 3). Tant que
 * `VERCEL_AUTOMATION_BYPASS_SECRET` manquait, la page elle-même était
 * redirigée et le flux sortait en avertissement : la barre n'était jamais
 * atteinte. Le secret posé, la page se lit — et la barre faisait tomber la
 * vérification (PR #22, 10/10/2026).
 *
 * Ce qu'on cherche (l'URL du collecteur, celle des salons) est inliné par Vite
 * dans le paquet du JEU. Un script servi par un autre hôte ne peut pas le
 * porter : le suivre ne prouve rien et peut seulement échouer.
 *
 * @param {string} html la page servie
 * @param {string} base l'adresse vérifiée, sans barre finale
 * @returns {string[]} les URL absolues des scripts servis par `base`
 */
export function scriptsDeLAppli(html, base) {
  const hote = new URL(base).host;
  return [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map((m) => new URL(m[1], base + "/"))
    .filter((u) => u.host === hote)
    .map((u) => u.href);
}
