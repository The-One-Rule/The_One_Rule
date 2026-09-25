/**
 * LE PROFIL D'UN JOUEUR — sa carte de visite et sa photo.
 *
 * Demandé par Pierre : « une meilleure personnification du joueur, pouvoir
 * choisir sa carte, qu'elle soit plus visible et distinctive, photo de
 * profil, car l'essence du jeu c'est le multi ». Un joueur n'était jusqu'ici
 * qu'un nom et un signe de 26 px : à dix dans un salon, on ne reconnaissait
 * personne sans lire.
 *
 * PUR, et partagé : le client valide ce qu'il envoie, le serveur ce qu'il
 * relaie, avec la MÊME fonction. Une validation écrite deux fois diverge, et
 * le symptôme serait « ma photo n'apparaît pas chez les autres » — sans une
 * erreur nulle part.
 *
 * ⚠️ ABSENT VAUT NON, comme `clavier` et `tok`. Un champ invalide est
 * IGNORÉ, jamais refusé avec une erreur : un profil n'est pas un chemin
 * d'entrée, il ne doit jamais empêcher de jouer.
 */

/** Une carte de visite est l'identifiant d'une règle : court, en minuscules. */
export function carteValide(v: unknown): string | undefined {
  return typeof v === "string" && /^[a-z]{2,20}$/.test(v) ? v : undefined;
}

/** Le côté de la photo, en pixels, une fois réduite par le client. */
export const PHOTO_COTE = 96;

/**
 * La taille maximale d'une photo, en caractères de `data:` URL.
 *
 * Une photo de 96 × 96 en JPEG à 0,72 pèse 3 à 6 Ko, soit 4 à 8 Ko en base64.
 * 14 000 laisse la marge d'une image chargée sans laisser passer une photo
 * pleine résolution : à dix joueurs, un salon relaie au plus 140 Ko de
 * photos, UNE fois, à l'arrivée.
 */
export const PHOTO_MAX = 14_000;

const ENTETES = ["data:image/jpeg;base64,", "data:image/webp;base64,", "data:image/png;base64,"];

/** Une photo acceptable : une petite image encodée, et rien d'autre. */
export function photoValide(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > PHOTO_MAX) return undefined;
  const entete = ENTETES.find((e) => v.startsWith(e));
  if (!entete) return undefined;
  const corps = v.slice(entete.length);
  return corps.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(corps) ? v : undefined;
}

/** Ce qu'un joueur annonce de lui-même. Tout est facultatif. */
export interface Profil {
  carte?: string;
  photo?: string;
}

/** Relit un profil venu du stockage ou du fil : ce qui est douteux tombe. */
export function litProfil(v: unknown): Profil {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  const carte = carteValide(o.carte);
  const photo = photoValide(o.photo);
  return { ...(carte ? { carte } : {}), ...(photo ? { photo } : {}) };
}
