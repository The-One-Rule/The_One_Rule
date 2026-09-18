/**
 * LE PAYSAGE SERRÉ — un téléphone couché, et le terrain qui n'y existait plus.
 *
 * Deux propriétés valent d'être tenues par un test, et aucune des deux n'est
 * esthétique :
 *
 * 1. **LE CHAMP NE CHANGE PAS DE TAILLE PENDANT UNE PARTIE.** Couché, le HUD
 *    était dans le flux et sa hauteur suivait la consigne : une consigne sur
 *    deux lignes rétrécissait le terrain de 24 % en pleine manche (n°10, n°2).
 *    Les bandes sont maintenant des CONSTANTES — ce fichier vérifie qu'elles
 *    le restent et que le cadrage s'y tient.
 * 2. **LE MODULE ET LA FEUILLE DÉCIDENT AU MÊME PIXEL.** C'est la feuille qui
 *    sort le HUD du flux et le module qui lui réserve sa bande. Un critère
 *    divergent donnerait soit un HUD flottant sur le terrain, soit deux bandes
 *    vides. Le test lit la feuille.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  FIELD_GUTTER,
  PAYSAGE_SERRE_H,
  RESERVE_CONSIGNE_COUCHE,
  RESERVE_HUD_MULTI,
  RESERVE_HUD_MULTI_COUCHE,
  RESERVE_PIED_COUCHE,
  cadrePour,
  orientationPour,
  paysageSerre,
  rectEcran,
} from "../src/render/orientation";
import { stableGutter } from "../src/render/layout";
import { FIELD_H, FIELD_W } from "../src/engine/types";

const css = readFileSync("src/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const main = readFileSync("src/main.ts", "utf8");

describe("qui est en paysage serré", () => {
  it("un téléphone couché, oui ; tenu droit, non", () => {
    expect(paysageSerre(812, 375)).toBe(true);
    expect(paysageSerre(667, 375)).toBe(true);
    expect(paysageSerre(568, 320)).toBe(true);
    expect(paysageSerre(375, 812)).toBe(false);
  });

  it("une tablette couchée n'en est pas : elle a la hauteur", () => {
    expect(paysageSerre(1024, 768)).toBe(false);
    expect(paysageSerre(1280, 800)).toBe(false);
  });

  it("ce qui manque est de la HAUTEUR, jamais de la largeur", () => {
    // Une fenêtre de bureau écrasée reçoit le même remède, et c'est voulu.
    expect(paysageSerre(1920, 420)).toBe(true);
    expect(paysageSerre(PAYSAGE_SERRE_H * 2, PAYSAGE_SERRE_H)).toBe(true);
    expect(paysageSerre(PAYSAGE_SERRE_H * 2, PAYSAGE_SERRE_H + 1)).toBe(false);
  });

  it("⚠️ les deux domaines ne se chevauchent JAMAIS avec le terrain debout", () => {
    /*
     * Debout, la consigne a déjà sa bande (`RESERVE_CONSIGNE`). Si une fenêtre
     * pouvait être à la fois « portrait » et « serrée », les deux réserves
     * hautes s'additionneraient en silence et le champ perdrait 190 px.
     */
    for (let w = 200; w <= 1400; w += 37) {
      for (let h = 200; h <= 1000; h += 41) {
        const debout = orientationPour(w, h) === "portrait";
        expect(debout && paysageSerre(w, h), `${w} × ${h}`).toBe(false);
      }
    }
  });
});

describe("la feuille et le module décident la même chose", () => {
  it("⚠️ la media query du paysage serré existe, et elle dit 500 px", () => {
    const re = /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*(\d+)px\)/g;
    const trouvees = [...css.matchAll(re)].map((m) => Number(m[1]));
    expect(trouvees.length, "aucune media query de paysage serré dans la feuille").toBeGreaterThan(
      0,
    );
    for (const v of trouvees) expect(v).toBe(PAYSAGE_SERRE_H);
  });

  it("⚠️ le HUD y quitte le flux, sans exception d'écran", () => {
    /*
     * Sans `:not(.has-topbar)`, contrairement au repli de la consigne debout :
     * les écrans de menu masquent le HUD en `visibility` pour que le canvas ne
     * change pas de taille d'un show() à l'autre. Le sortir du flux en jeu
     * SEULEMENT rouvrirait exactement ce trou.
     */
    const bloc = corpsSerre();
    expect(bloc).toMatch(/#app > #band[\s\S]*?position:\s*absolute/);
    expect(bloc).not.toMatch(/#app:not\(\.has-topbar\) > #band/);
  });

  it("⚠️ la bande absorbe les touchers : pas de pointer-events: none dessus", () => {
    /*
     * Le canvas occupe maintenant toute la scène. Un doigt qui traverserait la
     * bande atterrirait dans le VIDE du champ, que `resolveAction` juge comme
     * un clic raté — donc le HUD tuerait le joueur qui le touche.
     */
    const bloc = corpsSerre();
    const regles = [...bloc.matchAll(/([^{}]+)\{([^}]*)\}/g)];
    for (const [, sel, corps] of regles) {
      if (!/#band|#head|#foot/.test(sel!)) continue;
      expect(corps!, `pointer-events none sur ${sel!.trim()}`).not.toMatch(
        /pointer-events\s*:\s*none/,
      );
    }
  });
});

/** Le corps du `@media` du paysage serré, accolades appariées. */
function corpsSerre(): string {
  const m = /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*\d+px\)\s*\{/.exec(css);
  if (!m) return "";
  let profondeur = 1;
  let i = m.index + m[0].length;
  const debut = i;
  for (; i < css.length; i++) {
    if (css[i] === "{") profondeur++;
    else if (css[i] === "}") {
      profondeur--;
      if (profondeur === 0) break;
    }
  }
  return css.slice(debut, i);
}

describe("le cadrage couché", () => {
  it("⚠️ SANS réserve, rien ne bouge — le bureau garde son champ au pixel", () => {
    /*
     * La bande haute a un PLANCHER, et c'est la gouttière. C'est ce qui
     * garantit que l'ajout du paramètre ne change aucune fenêtre existante.
     */
    for (const [w, h] of [
      [1280, 566],
      [1024, 534],
      [1680, 800],
      [375, 710],
    ] as const) {
      const avant = rectEcran(cadrePour(w, h, "paysage"));
      const apres = rectEcran(cadrePour(w, h, "paysage", 0, 0));
      expect(apres).toEqual(avant);
    }
  });

  it("le champ se pose ENTRE les deux bandes, et exactement au milieu", () => {
    const c = cadrePour(812, 375, "paysage", RESERVE_PIED_COUCHE, RESERVE_CONSIGNE_COUCHE);
    const r = rectEcran(c);
    expect(r.y).toBeGreaterThanOrEqual(RESERVE_CONSIGNE_COUCHE);
    expect(r.y + r.h).toBeLessThanOrEqual(375 - RESERVE_PIED_COUCHE);
    // Centré : autant d'air au-dessus qu'en dessous.
    const haut = r.y - RESERVE_CONSIGNE_COUCHE;
    const bas = 375 - RESERVE_PIED_COUCHE - (r.y + r.h);
    expect(Math.abs(haut - bas)).toBeLessThan(1);
  });

  it("le relevé de référence du téléphone couché : 674 × 283 à 812 × 375", () => {
    /*
     * Mesuré à l'écran, partie lancée. Avant ce lot, le même téléphone donnait
     * 278 × 117 — et 116 × 49 sur une consigne à glyphe. Ce test est là pour
     * que la prochaine retouche du HUD se voie en chiffres.
     */
    const r = rectEcran(
      cadrePour(812, 375, "paysage", RESERVE_PIED_COUCHE, RESERVE_CONSIGNE_COUCHE),
    );
    expect(Math.round(r.w)).toBe(674);
    expect(Math.round(r.h)).toBe(283);
    expect(Math.round(r.y)).toBe(62);
  });

  it("⚠️ DEBOUT, la réserve haute est ignorée — sinon elle s'ajoute à la consigne", () => {
    const sans = rectEcran(cadrePour(375, 710, "portrait", 0, 0));
    const avec = rectEcran(cadrePour(375, 710, "portrait", 0, RESERVE_CONSIGNE_COUCHE));
    expect(avec).toEqual(sans);
  });

  it("⚠️ la bande haute non plus ne peut pas écraser le terrain", () => {
    // Même garde que la bande basse : jamais plus du tiers du canvas.
    const r = rectEcran(cadrePour(600, 150, "paysage", 0, 400));
    expect(r.h).toBeGreaterThan(150 / 3);
  });

  it("les deux bandes réunies laissent toujours au moins un tiers au champ", () => {
    for (let h = 120; h <= 500; h += 7) {
      const r = rectEcran(cadrePour(900, h, "paysage", 900, 900));
      expect(r.h, `${h} px de canvas`).toBeGreaterThanOrEqual(h / 3 - 1);
    }
  });
});

describe("ce qui décide avec les mêmes bandes", () => {
  it("la gouttière des plaques compte la bande haute, comme le renderer", () => {
    const g = stableGutter(812, 375, "paysage", RESERVE_PIED_COUCHE, RESERVE_CONSIGNE_COUCHE);
    const r = rectEcran(
      cadrePour(812, 375, "paysage", RESERVE_PIED_COUCHE, RESERVE_CONSIGNE_COUCHE),
    );
    expect(g).toBe(Math.round((812 - r.w) / 2));
  });

  it("⚠️ la décision des colonnes ne reçoit QUE des réserves de fenêtre", () => {
    /*
     * Décision n°2. Les bandes du paysage serré ne dépendent que de la
     * fenêtre : elles valent la même chose en colonnes et en bandeau. La
     * réserve des PLAQUES, elle, n'existe que hors colonnes — la lui passer
     * rouvrirait la boucle que `stableGutter` existe pour fermer.
     */
    const appel = /stableGutter\(([\s\S]*?)\)\s*,\s*\n\s*gutters/.exec(main);
    expect(appel, "l'appel à stableGutter a changé de forme").not.toBeNull();
    expect(appel![1]).not.toMatch(/reserveMulti/);
    expect(appel![1]).toMatch(/rc\.bas/);
    expect(appel![1]).toMatch(/rc\.haut/);
  });
});

describe("le salon couché", () => {
  it("sa bande est plus courte que debout, et elle tient sous le plafond", () => {
    expect(RESERVE_HUD_MULTI_COUCHE).toBeLessThan(RESERVE_HUD_MULTI);
    // Le plafond du tiers, sur le plus court des téléphones couchés.
    expect(RESERVE_HUD_MULTI_COUCHE).toBeLessThanOrEqual(375 / 3 + RESERVE_PIED_COUCHE);
  });

  it("⚠️ les plaques ne traversent plus le terrain à 667 × 375", () => {
    /*
     * Mesuré avec un vrai salon avant correctif : `#liveHud` faisait 144 px
     * (plaques 110, émotes 60) pour une bande plafonnée à 125, donc 49 px de
     * terrain sous les plaques. Couché, les émotes passent à côté des plaques
     * et le calque retombe à 94, plus 30 de pied.
     */
    const CALQUE = 94;
    const r = rectEcran(
      cadrePour(667, 375, "paysage", RESERVE_HUD_MULTI_COUCHE, RESERVE_CONSIGNE_COUCHE),
    );
    const hautDuCalque = 375 - RESERVE_PIED_COUCHE - CALQUE;
    expect(r.y + r.h).toBeLessThanOrEqual(hautDuCalque);
    // Et il reste bien SOUS la bande de la consigne : sans ce second bord, le
    // test passe par chance dès que le champ glisse vers le haut.
    expect(r.y).toBeGreaterThanOrEqual(RESERVE_CONSIGNE_COUCHE);
  });

  it("les émotes quittent leur rangée dans la feuille — c'est ce qui rend les 60 px", () => {
    const bloc = corpsSerre();
    expect(bloc).toMatch(/#liveHud\s*\{[^}]*flex-direction:\s*row/);
  });
});

describe("les bandes sont des CONSTANTES, pas des mesures", () => {
  it("elles ne dépendent d'aucun contenu — le champ ne bouge pas d'une manche à l'autre", () => {
    /*
     * La seule façon de tenir cette propriété dans un test unitaire est de
     * vérifier que le cadrage ne prend aucune entrée qui change en cours de
     * partie : à fenêtre égale, deux appels rendent exactement le même champ.
     */
    const a = rectEcran(
      cadrePour(812, 375, "paysage", RESERVE_PIED_COUCHE, RESERVE_CONSIGNE_COUCHE),
    );
    const b = rectEcran(
      cadrePour(812, 375, "paysage", RESERVE_PIED_COUCHE, RESERVE_CONSIGNE_COUCHE),
    );
    expect(b).toEqual(a);
    // Et la bande haute laisse la gouttière au minimum syndical.
    expect(RESERVE_CONSIGNE_COUCHE).toBeGreaterThan(FIELD_GUTTER);
  });

  it("couché, le champ garde le rapport du terrain logique", () => {
    const r = rectEcran(
      cadrePour(812, 375, "paysage", RESERVE_PIED_COUCHE, RESERVE_CONSIGNE_COUCHE),
    );
    expect(r.w / r.h).toBeCloseTo(FIELD_W / FIELD_H, 5);
  });
});
