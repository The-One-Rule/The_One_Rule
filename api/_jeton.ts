/**
 * Émission et vérification du jeton côté edge — ASYNCHRONE.
 *
 * Pendant du fichier `server/jeton.ts`, qui fait la même chose de façon
 * synchrone avec `node:crypto`. Ici on n'a que `crypto.subtle`, et c'est
 * suffisant : une fonction edge n'a aucune course à craindre, elle traite une
 * requête et répond.
 *
 * La logique commune vit dans `shared/jeton.ts`. Ce fichier n'apporte que la
 * primitive HMAC, et `tests/jeton.test.ts` vérifie que les deux chemins
 * produisent et acceptent exactement les mêmes jetons.
 *
 * Le préfixe `_` n'est pas décoratif : Vercel transforme en point d'entrée
 * tout fichier de `api/` qui n'en porte pas. Ce module n'est pas une route.
 */

import { assemble, corps, decoupe, fraicheur, revendicationsPour } from "../shared/jeton";
import type { Frappe, Revendications } from "../shared/jeton";

const ENC = new TextEncoder();

/**
 * Les clés importées sont mises en cache par secret.
 *
 * `importKey` n'est pas gratuit et une fonction edge peut servir des centaines
 * de requêtes sur la même instance. La clé du cache est le secret lui-même :
 * il n'y en a qu'un, mais un cache indexé sur autre chose serait un piège le
 * jour où l'on fera tourner une deuxième clé.
 */
const cache = new Map<string, Promise<CryptoKey>>();

function cle(secret: string): Promise<CryptoKey> {
  let k = cache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey(
      "raw",
      ENC.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    cache.set(secret, k);
  }
  return k;
}

/** Frappe un jeton pour cet utilisateur. */
export async function signeJeton(
  f: Frappe,
  secret: string,
  maintenant: number = Date.now(),
): Promise<string> {
  const c = corps(revendicationsPour(f, maintenant));
  const sig = await crypto.subtle.sign("HMAC", await cle(secret), ENC.encode(c));
  return assemble(c, new Uint8Array(sig));
}

/**
 * Vérifie un jeton. Renvoie les revendications, ou `null`.
 *
 * `crypto.subtle.verify` compare en temps constant — c'est la raison de
 * l'utiliser plutôt que de resigner et de comparer nous-mêmes.
 */
export async function verifieJeton(
  jeton: unknown,
  secret: string,
  maintenant: number = Date.now(),
): Promise<Revendications | null> {
  if (!secret) return null;
  const d = decoupe(jeton);
  if (!d) return null;

  const bonne = await crypto.subtle.verify(
    "HMAC",
    await cle(secret),
    d.signature,
    ENC.encode(d.corps),
  );
  if (!bonne) return null;
  if (!fraicheur(d.revendications, maintenant).ok) return null;
  return d.revendications;
}

/**
 * Lit le jeton porté par une requête.
 *
 * `Authorization: Bearer …` uniquement. Pas de cookie : le jeton doit de toute
 * façon voyager dans le `hello` de la socket, ce qu'un cookie `httpOnly` ne
 * saurait pas faire, et deux emplacements pour la même chose est une source de
 * désaccord silencieux.
 */
export function jetonDeLaRequete(req: Request): string | null {
  const brut = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(brut.trim());
  return m ? m[1]! : null;
}
