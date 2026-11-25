/**
 * Limitation de débit.
 *
 * Adossée à l'Upstash qui sert déjà `api/collect.ts` : pas une dépendance de
 * plus, pas un service de plus, pas un identifiant de plus à poser. `INCR`
 * suivi d'`EXPIRE` est exactement le compteur à fenêtre dont on a besoin, et
 * le pipeline REST fait les deux en un aller-retour — le quota gratuit se
 * compte en commandes.
 *
 * ⚠️ SANS UPSTASH, TOUT PASSE. C'est délibéré et il faut le savoir : le
 * développement local et un déploiement sans mesure ne doivent pas se
 * comporter différemment du jeu. La limitation est une protection contre
 * l'abus, pas un élément de correction — si elle disparaît, le jeu reste
 * juste, il est seulement plus facile à ennuyer.
 *
 * Elle ne bloque JAMAIS un chemin de jeu : les seules routes limitées sont
 * celles qui écrivent dans un compte.
 *
 * Le préfixe `_` empêche Vercel d'en faire un point d'entrée.
 */

import { cleanEnv } from "../src/env.js";

export interface Quota {
  /** Nombre d'écritures autorisées dans la fenêtre. */
  max: number;
  /** Largeur de la fenêtre, en secondes. */
  fenetreS: number;
}

/**
 * Les quotas, par action.
 *
 * Ils sont larges. Le but n'est pas de discipliner un joueur — aucun humain
 * ne renomme son compte quarante fois par heure — mais d'empêcher qu'une
 * boucle, un onglet devenu fou ou quelqu'un qui s'amuse ne remplisse la base.
 */
export const QUOTAS: Record<string, Quota> = {
  // Une revendication réussie n'a lieu qu'une fois par appareil, mais elle est
  // retentée à chaque ouverture tant qu'elle échoue : la marge doit tenir
  // compte des reprises.
  fusion: { max: 30, fenetreS: 3600 },
  // Un renommage est un geste rare et réfléchi.
  identite: { max: 10, fenetreS: 3600 },
  // Un run du jour par jour, plus les reprises de file hors ligne.
  perf: { max: 40, fenetreS: 3600 },
  suppression: { max: 5, fenetreS: 3600 },
  // Ajouter ou retirer un ami. Large pour une soirée où l'on s'ajoute à dix ;
  // assez bas pour qu'essayer des codes au hasard ne mène nulle part — un
  // code sur 887 millions, soixante essais par heure.
  amis: { max: 60, fenetreS: 3600 },
  // Acheter, porter, importer : des gestes de boutique. Une session de
  // boutique fait quelques appels ; soixante par heure n'arrête qu'une boucle.
  boutique: { max: 60, fenetreS: 3600 },
};

interface Config {
  url: string;
  token: string;
}

function litConfig(env: Record<string, string | undefined>): Config | null {
  // Les DEUX jeux de noms, pour la même raison que dans `api/collect.ts` :
  // Vercel n'injecte pas les mêmes selon le chemin d'installation d'Upstash,
  // et n'en lire qu'un a déjà produit une panne muette.
  const url = cleanEnv(env.UPSTASH_REDIS_REST_URL) ?? cleanEnv(env.KV_REST_API_URL);
  const token = cleanEnv(env.UPSTASH_REDIS_REST_TOKEN) ?? cleanEnv(env.KV_REST_API_TOKEN);
  return url && token ? { url, token } : null;
}

export interface Verdict {
  ok: boolean;
  /** Combien il en reste dans la fenêtre. -1 quand la limitation est inactive. */
  reste: number;
}

/**
 * Consomme une unité de quota pour `(action, sujet)`.
 *
 * Le sujet est l'identifiant de compte — jamais une IP. `api/collect.ts` ne
 * journalise ni IP, ni en-tête d'identification, ni user-agent, et ce chantier
 * ne doit pas être l'occasion de commencer : toutes ces routes exigent déjà
 * un jeton, donc le compte est un sujet plus précis ET moins intrusif.
 *
 * Ne lève jamais. Une panne d'Upstash laisse passer : perdre une protection
 * contre l'abus est préférable à refuser une revendication légitime.
 */
export async function consomme(
  env: Record<string, string | undefined>,
  action: string,
  sujet: string,
): Promise<Verdict> {
  const conf = litConfig(env);
  const quota = QUOTAS[action];
  if (!conf || !quota) return { ok: true, reste: -1 };

  // Fenêtre glissante par tranches : la clé porte le numéro de tranche, donc
  // elle change d'elle-même et expire toute seule. Pas de nettoyage à écrire.
  const tranche = Math.floor(Date.now() / 1000 / quota.fenetreS);
  const cle = `deb:${action}:${sujet}:${tranche}`;

  try {
    const res = await fetch(`${conf.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${conf.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", cle],
        ["EXPIRE", cle, String(quota.fenetreS + 60)],
      ]),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return { ok: true, reste: -1 };
    const lignes = (await res.json()) as { result?: number }[];
    const compte = Number(lignes[0]?.result ?? 0);
    return { ok: compte <= quota.max, reste: Math.max(0, quota.max - compte) };
  } catch {
    return { ok: true, reste: -1 };
  }
}
