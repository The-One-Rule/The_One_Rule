/**
 * Vérification du jeton côté salons — SYNCHRONE, et c'est tout l'intérêt.
 *
 * Le `hello` de `server/index.ts` est traité dans un `switch` synchrone. Rendre
 * la vérification asynchrone ouvrirait une course réelle : `create` ou `join`
 * arrivent dans le même paquet TCP que le `hello` chez la plupart des clients,
 * donc le joueur entrerait dans le salon sous son identité anonyme, et le
 * salon montrerait un nom qui changerait une milliseconde plus tard.
 *
 * `node:crypto` sait faire un HMAC-SHA256 sans promesse. La logique — format,
 * revendications, péremption — vient de `shared/jeton.ts`, écrite une seule
 * fois pour les deux back-ends ; ce fichier n'apporte que la primitive.
 *
 * ⚠️ Ne JAMAIS importer ce module depuis `api/` : le runtime edge n'a pas
 * `node:crypto`. L'équivalent asynchrone est `api/_jeton.ts`.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { corps, decoupe, fraicheur, revendicationsPour } from "../shared/jeton";
import type { Frappe, Revendications } from "../shared/jeton";

const hmac = (secret: string, message: string): Buffer =>
  createHmac("sha256", secret).update(message).digest();

/**
 * Vérifie un jeton. Renvoie les revendications, ou `null`.
 *
 * `null` couvre TOUS les échecs sans les distinguer : mal formé, signature
 * fausse, périmé. Le serveur de salons n'en fait qu'une seule chose — jouer
 * anonymement — et lui donner le détail ne servirait qu'à écrire un message
 * d'erreur qui bloquerait un chemin d'entrée. Absent vaut anonyme, faux vaut
 * anonyme : c'est la même doctrine que `clavier`.
 */
export function verifieJeton(
  jeton: unknown,
  secret: string,
  maintenant: number = Date.now(),
): Revendications | null {
  if (!secret) return null;
  const d = decoupe(jeton);
  if (!d) return null;

  const attendue = hmac(secret, d.corps);
  // Comparaison à temps constant. Les longueurs sont déjà garanties égales
  // par `decoupe` (32 octets), mais `timingSafeEqual` lève si elles diffèrent :
  // le garde reste, il coûte une comparaison d'entiers.
  if (attendue.length !== d.signature.length) return null;
  if (!timingSafeEqual(attendue, d.signature)) return null;

  if (!fraicheur(d.revendications, maintenant).ok) return null;
  return d.revendications;
}

/**
 * Frappe un jeton.
 *
 * Le serveur de salons n'en émet pas — c'est le rôle de `api/auth.ts`. Cette
 * fonction existe pour les tests : c'est elle qui permet à
 * `tests/jeton.test.ts` de signer d'un côté et de vérifier de l'autre, dans
 * les deux sens. Sans ce croisement, les deux chemins pourraient diverger
 * pendant des mois sans qu'aucun test ne s'en plaigne — et le symptôme serait
 * « le multijoueur ne me reconnaît pas », c'est-à-dire indébogable.
 */
export function signeJeton(f: Frappe, secret: string, maintenant: number = Date.now()): string {
  const r = revendicationsPour(f, maintenant);
  const c = corps(r);
  const sig = hmac(secret, c);
  return `${c}.${Buffer.from(sig)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")}`;
}
