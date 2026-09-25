/**
 * LE PROFIL — carte de visite et photo, validés par la MÊME fonction des deux
 * côtés du fil. Ce que ces tests gardent : rien de douteux ne passe, et rien
 * de douteux ne lève — absent vaut non.
 */
import { describe, expect, it } from "vitest";
import { carteValide, litProfil, photoValide, PHOTO_MAX } from "../shared/profil";
import { recadrageCarre } from "../src/render/photo";
import { normaliseSave } from "../src/game/progress";

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL";

describe("la carte de visite", () => {
  it("accepte un identifiant de règle, rien d'autre", () => {
    expect(carteValide("sang")).toBe("sang");
    expect(carteValide("gaucher")).toBe("gaucher");
    for (const v of ["", "a", "SANG", "sang+pointe", "../etc", "sang.png", 3, null, undefined, {}]) {
      expect(carteValide(v), String(v)).toBeUndefined();
    }
  });

  it("⚠️ ne peut pas s'échapper d'une url() CSS", () => {
    // La carte finit dans `url("/cartes/${carte}.png")` : un guillemet ou une
    // parenthèse y ouvrirait une injection de style chez tous les autres.
    for (const v of ['sang")', "sang)", "sang'", "sa ng"]) expect(carteValide(v)).toBeUndefined();
  });
});

describe("la photo", () => {
  it("accepte une petite image encodée", () => {
    expect(photoValide(JPEG)).toBe(JPEG);
    expect(photoValide("data:image/png;base64,iVBORw0KGgo=")).toBeDefined();
    expect(photoValide("data:image/webp;base64,UklGRg==")).toBeDefined();
  });

  it("refuse tout ce qui n'est pas une image en base64", () => {
    for (const v of [
      "data:image/svg+xml;base64,PHN2Zz4=", // un SVG porte du script
      "data:text/html;base64,PGI+",
      "https://exemple.org/moi.jpg", // une URL ferait sonder chaque client
      "data:image/jpeg;base64,", // vide
      'data:image/jpeg;base64,abc")',
      JPEG.replace("base64,", "base64, "),
      42,
      null,
    ]) {
      expect(photoValide(v), String(v)).toBeUndefined();
    }
  });

  it("refuse une photo trop lourde", () => {
    const entete = "data:image/jpeg;base64,";
    expect(photoValide(entete + "A".repeat(PHOTO_MAX - entete.length))).toBeDefined();
    expect(photoValide(entete + "A".repeat(PHOTO_MAX - entete.length + 1))).toBeUndefined();
  });
});

describe("litProfil", () => {
  it("garde le valide, fait tomber le douteux, ne lève jamais", () => {
    expect(litProfil({ carte: "sang", photo: JPEG })).toEqual({ carte: "sang", photo: JPEG });
    expect(litProfil({ carte: "SANG", photo: "http://x" })).toEqual({});
    expect(litProfil({ carte: "roue", autre: 1 })).toEqual({ carte: "roue" });
    for (const v of [null, undefined, "x", 3, []]) expect(litProfil(v)).toEqual({});
  });

  it("la sauvegarde : absent vaut aucun profil, et les photos des autres visibles", () => {
    const s = normaliseSave({});
    expect(s.profil).toEqual({});
    expect(s.photosAutres).toBe(true);
    expect(normaliseSave({ photosAutres: false }).photosAutres).toBe(false);
    expect(normaliseSave({ photosAutres: "non" }).photosAutres).toBe(true);
    expect(normaliseSave({ profil: { carte: "sang" } }).profil).toEqual({ carte: "sang" });
    expect(normaliseSave({ profil: "cassé" }).profil).toEqual({});
  });
});

describe("recadrageCarre", () => {
  it("prend le plus grand carré centré", () => {
    expect(recadrageCarre(400, 300)).toEqual({ x: 50, y: 0, cote: 300 });
    expect(recadrageCarre(300, 400)).toEqual({ x: 0, y: 50, cote: 300 });
    expect(recadrageCarre(96, 96)).toEqual({ x: 0, y: 0, cote: 96 });
  });

  it("une image vide ne donne pas de côté négatif", () => {
    expect(recadrageCarre(0, 50).cote).toBe(0);
  });
});
