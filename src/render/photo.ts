/**
 * LA PHOTO DE PROFIL — réduite ici, sur l'appareil, avant d'aller où que ce
 * soit.
 *
 * ⚠️ La pleine résolution ne quitte JAMAIS l'appareil : un joueur choisit une
 * photo de 4 Mo sur son téléphone, le salon reçoit un carré de 96 px de
 * quelques kilo-octets. C'est à la fois une question de poids (dix photos
 * relayées à l'arrivée dans un salon) et de discrétion (ni métadonnées EXIF,
 * ni position GPS : le canvas ne recopie que des pixels).
 *
 * `recadrageCarre` est PUR et testé ; `reduitPhoto` ne fait que peindre — jsdom
 * n'a pas de canvas, la même coupe que `donneesCarte` / `dessineCarte`.
 */
import { PHOTO_COTE, PHOTO_MAX, photoValide } from "../../shared/profil";

/** Le plus grand carré CENTRÉ d'une image : c'est le visage, le plus souvent. */
export function recadrageCarre(l: number, h: number): { x: number; y: number; cote: number } {
  const cote = Math.max(0, Math.min(l, h));
  return { x: Math.round((l - cote) / 2), y: Math.round((h - cote) / 2), cote };
}

/** Les qualités essayées, de la meilleure à la plus légère. */
export const QUALITES = [0.72, 0.6, 0.48, 0.36] as const;

/**
 * Réduit une image choisie par le joueur à un carré de `PHOTO_COTE` px, en
 * JPEG, sous `PHOTO_MAX`. Rend `null` si l'image ne se lit pas ou ne tient
 * pas même à la qualité la plus basse — jamais une erreur.
 */
export async function reduitPhoto(fichier: Blob): Promise<string | null> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier);
  } catch {
    return null;
  }
  const c = document.createElement("canvas");
  c.width = PHOTO_COTE;
  c.height = PHOTO_COTE;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const r = recadrageCarre(image.width, image.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, r.x, r.y, r.cote, r.cote, 0, 0, PHOTO_COTE, PHOTO_COTE);
  image.close?.();
  for (const q of QUALITES) {
    const url = photoValide(c.toDataURL("image/jpeg", q));
    if (url && url.length <= PHOTO_MAX) return url;
  }
  return null;
}
