/**
 * LE TERRAIN DEBOUT — la conversion qui décide où tombe un doigt.
 *
 * Une erreur ici ne lève rien : elle fait cliquer la pièce d'à côté, et le
 * joueur accuse le jeu de tricher. C'est le défaut tenu pour fatal (n°3), vu
 * du côté de l'écran.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  FIELD_GUTTER,
  RESERVE_CONSIGNE,
  RESERVE_HUD_MULTI,
  cadrePour,
  decalage,
  orientationPour,
  rectEcran,
  versChamp,
  versEcran,
} from "../src/render/orientation";
import { stableGutter } from "../src/render/layout";
import { versCss } from "../src/render/cursors";
import { briefCourtDeRegle, briefDeRegle, composePhrase, poseDebout, poseLangue, t } from "../src/i18n";
import { FIELD_H, FIELD_W } from "../src/engine/types";

describe("quand le terrain se met debout", () => {
  it("sur un téléphone tenu droit, et seulement là", () => {
    expect(orientationPour(375, 812)).toBe("portrait");
    expect(orientationPour(390, 844)).toBe("portrait");
    expect(orientationPour(680, 900)).toBe("portrait");
    // le même critère que la feuille : au-delà de 680 px, la consigne reste
    // dans le flux, donc le terrain reste couché
    expect(orientationPour(681, 900)).toBe("paysage");
    expect(orientationPour(812, 375)).toBe("paysage");
    expect(orientationPour(1280, 800)).toBe("paysage");
  });
});

describe("la géométrie", () => {
  it("⚠️ couché, rien ne bouge : le bureau garde son champ au pixel (n°10)", () => {
    // Relevé de référence du dépôt : {x:24, y:30, w:952, h:400}.
    const ref = rectEcran(cadrePour(1000, 460, "paysage"));
    expect([ref.x, ref.y, ref.w, ref.h].map(Math.round)).toEqual([24, 30, 952, 400]);
    // et la formule d'origine, sur d'autres tailles
    for (const [w, h] of [
      [373, 710],
      [1440, 700],
      [800, 300],
    ] as const) {
      const c = cadrePour(w, h, "paysage");
      const s = Math.min((w - 2 * FIELD_GUTTER) / FIELD_W, (h - 2 * FIELD_GUTTER) / FIELD_H);
      expect(c.scale).toBeCloseTo(s, 10);
      expect(c.offX).toBeCloseTo((w - FIELD_W * s) / 2, 10);
      expect(c.offY).toBeCloseTo((h - FIELD_H * s) / 2, 10);
    }
  });

  it("debout à 375 × 812, les pièces sont 1,7 fois plus grandes", () => {
    const couche = cadrePour(373, 710, "paysage");
    const debout = cadrePour(373, 710, "portrait");
    expect(debout.scale / couche.scale).toBeGreaterThan(1.7);
    const r = rectEcran(debout);
    // la bande de la consigne est libre, et le terrain tient dans le canvas
    expect(r.y).toBeGreaterThanOrEqual(RESERVE_CONSIGNE);
    expect(r.x).toBeGreaterThanOrEqual(FIELD_GUTTER - 1e-9);
    expect(r.x + r.w).toBeLessThanOrEqual(373 - FIELD_GUTTER + 1e-9);
    expect(r.y + r.h).toBeLessThanOrEqual(710 - FIELD_GUTTER + 1e-9);
    // les dimensions sont échangées : c'est le même champ, tourné
    expect(r.w / r.h).toBeCloseTo(FIELD_H / FIELD_W, 10);
  });

  it("en multi debout, la bande des plaques reste libre sous le terrain", () => {
    const r = rectEcran(cadrePour(373, 710, "portrait", RESERVE_HUD_MULTI));
    expect(r.y).toBeGreaterThanOrEqual(RESERVE_CONSIGNE);
    expect(r.y + r.h).toBeLessThanOrEqual(710 - RESERVE_HUD_MULTI + 1e-9);
    // et couché, la réserve ne change rien : le paysage garde sa formule
    expect(cadrePour(1000, 460, "paysage", RESERVE_HUD_MULTI)).toEqual(cadrePour(1000, 460, "paysage"));
  });

  it("⚠️ l'écran et le champ se convertissent l'un dans l'autre sans perte", () => {
    for (const o of ["paysage", "portrait"] as const) {
      const c = cadrePour(373, 710, o);
      for (let x = -20; x <= FIELD_W + 20; x += 37) {
        for (let y = -20; y <= FIELD_H + 20; y += 23) {
          const e = versEcran(c, x, y);
          const retour = versChamp(c, e.x, e.y);
          expect(retour.x).toBeCloseTo(x, 9);
          expect(retour.y).toBeCloseTo(y, 9);
        }
      }
    }
  });

  it("⚠️ debout, « à gauche » devient EN HAUT, jamais en bas — et rien n'est en miroir", () => {
    const c = cadrePour(373, 710, "portrait");
    const a = versEcran(c, 100, 200);
    // x du champ plus grand → plus bas à l'écran
    expect(versEcran(c, 700, 200).y).toBeGreaterThan(a.y);
    // y du champ plus grand → plus à droite
    expect(versEcran(c, 100, 350).x).toBeGreaterThan(a.x);
    // la bande de LE GAUCHER (x < 200) est donc le haut du terrain
    const r = rectEcran(c);
    expect(versEcran(c, 199, 0).y).toBeLessThan(r.y + r.h * 0.2 + 1e-9);
  });

  it("la pointe d'un triangle et l'ombre suivent l'ÉCRAN, pas le champ", () => {
    for (const o of ["paysage", "portrait"] as const) {
      const c = cadrePour(373, 710, o);
      const centre = versEcran(c, 500, 210);
      const [px, py] = decalage(o, 0, -40);
      const pointe = versEcran(c, 500 + px, 210 + py);
      expect(pointe.y, `${o} : la pointe monte`).toBeLessThan(centre.y);
      expect(pointe.x).toBeCloseTo(centre.x, 9);
      const [ox, oy] = decalage(o, 0, 6);
      const ombre = versEcran(c, 500 + ox, 210 + oy);
      expect(ombre.y, `${o} : l'ombre tombe`).toBeGreaterThan(centre.y);
    }
  });
});

describe("ceux qui convertissent sans le renderer", () => {
  it("la gouttière des plaques est celle du renderer, couché comme debout", () => {
    for (const o of ["paysage", "portrait"] as const) {
      const r = rectEcran(cadrePour(373, 710, o));
      expect(stableGutter(373, 710, o)).toBe(Math.round((373 - r.w) / 2));
    }
    // absent vaut paysage : les appels d'hier ne changent pas
    expect(stableGutter(390, 720)).toBe(stableGutter(390, 720, "paysage"));
  });

  it("⚠️ un curseur coop pointe la même pièce que le renderer dessine", () => {
    for (const o of ["paysage", "portrait"] as const) {
      const c = cadrePour(373, 710, o);
      const rect = { ...rectEcran(c), debout: o === "portrait" };
      for (const [x, y] of [
        [0, 0],
        [120, 380],
        [870, 55],
      ] as const) {
        const attendu = versEcran(c, x, y);
        const vu = versCss(x, y, rect);
        expect(vu.x).toBeCloseTo(attendu.x, 9);
        expect(vu.y).toBeCloseTo(attendu.y, 9);
      }
    }
  });
});

describe("ce qui se dit debout", () => {
  afterEach(() => {
    poseDebout(false);
    poseLangue("fr");
  });

  it("« le plus à gauche » devient « le plus en haut », dans les deux langues", () => {
    poseDebout(true);
    expect(composePhrase({ cle: "clicGauche" }, "CLIQUE LE PLUS À GAUCHE", "fr")).toBe("CLIQUE LE PLUS EN HAUT");
    expect(composePhrase({ cle: "clicDroite" }, "CLIQUE LE PLUS À DROITE", "fr")).toBe("CLIQUE LE PLUS EN BAS");
    expect(composePhrase({ cle: "clicGauche" }, "x", "en")).toBe("CLICK THE TOPMOST");
    // couché, rien ne change — c'est ce que compare `tests/consignes.test.ts`
    poseDebout(false);
    expect(composePhrase({ cle: "clicGauche" }, "x", "fr")).toBe("CLIQUE LE PLUS À GAUCHE");
  });

  it("LE GAUCHER interdit la bande du haut, sur chaque surface", () => {
    poseDebout(true);
    for (const lang of ["fr", "en"] as const) {
      poseLangue(lang);
      const textes = [briefDeRegle("gaucher", ""), briefCourtDeRegle("gaucher", ""), t("puceDe")("gaucher")];
      for (const txt of textes) {
        expect(txt, `${lang} : « ${txt} »`).not.toMatch(/gauche|colonne|left|column/i);
        expect(txt, `${lang} : « ${txt} »`).toMatch(/haut|top/i);
      }
    }
  });
});
