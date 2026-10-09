/**
 * LE CORPS D'UNE REQUÊTE, lu une fois et pour toutes les routes.
 *
 * ⚠️ `JSON.parse` réussit sur `null`, `42`, `"x"` ou `[]` — et chaque route
 * écrivait ensuite `corps.mode` ou `payload.id` comme si elle tenait un objet.
 * Un corps `null` faisait donc LEVER perf, moi, amis et collect (corpus de
 * `tests/entrees-malformees.test.ts`), c'est-à-dire répondre 500 à une entrée
 * hostile triviale. Le type `as Record<string, unknown>` mentait au compilateur.
 *
 * `null` en retour veut dire « ce n'est pas un objet JSON » : l'appelant
 * répond 400, exactement comme pour un JSON coupé.
 */
export function litObjet(brut: string): Record<string, unknown> | null {
  let v: unknown;
  try {
    v = JSON.parse(brut);
  } catch {
    return null;
  }
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
