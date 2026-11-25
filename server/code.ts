/**
 * Codes de salon et identifiants de connexion.
 *
 * `Math.random` n'est pas une source cryptographique : un code de salon se
 * dicte, mais il ouvre aussi une table. On tire donc dans `node:crypto`.
 * La graine d'une manche, elle, reste un aléa de jeu : elle voyage sur le fil
 * et n'authentifie personne.
 */
import { randomBytes, randomInt } from "node:crypto";

/** Sans I, L, O, 0, 1 : un code se dicte à voix haute. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Quatre lettres libres. `tirage(n)` rend un entier dans `[0, n)`.
 * `pris` dit si le code est déjà une table.
 */
export function codeSalon(tirage: (max: number) => number, pris: (code: string) => boolean): string {
  for (let tries = 0; tries < 50; tries++) {
    let c = "";
    for (let i = 0; i < 4; i++) {
      const n = tirage(CODE_ALPHABET.length);
      const lettre = CODE_ALPHABET[n];
      if (lettre === undefined) throw new Error("tirage hors alphabet");
      c += lettre;
    }
    if (!pris(c)) return c;
  }
  throw new Error("plus de codes disponibles");
}

export function nouveauCode(pris: (code: string) => boolean): string {
  return codeSalon((n) => randomInt(n), pris);
}

/** Identifiant de connexion, 12 hex (48 bits). */
export function nouvelId(): string {
  return randomBytes(6).toString("hex");
}

/** Identifiant d'instance, pour distinguer deux machines Fly. */
export function identifiantInstance(): string {
  return randomBytes(4).toString("hex");
}
