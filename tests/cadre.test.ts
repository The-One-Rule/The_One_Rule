/**
 * Cadre d'attract — zoom téléphone, letterbox inchangé à zoom 1.
 *
 * À 375 px, le letterbox classique rend une pièce de rayon 40 à ~13 px.
 * `poseCadre` agrandit le scale puis recadre pour ne pas montrer le vide.
 * Le canvas de JEU n'appelle jamais `cadrer` : `fieldRect()` y reste la
 * géométrie du moteur.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FIELD_H, FIELD_W } from "../src/engine/types";
import { FIELD_GUTTER, poseCadre } from "../src/render/scene";

describe("poseCadre", () => {
  it("zoom 1 reproduit le letterbox centré", () => {
    const cssW = 800;
    const cssH = 400;
    const a = poseCadre(cssW, cssH, FIELD_W / 2, FIELD_H / 2, 1);
    const scale = Math.min(
      (cssW - FIELD_GUTTER * 2) / FIELD_W,
      (cssH - FIELD_GUTTER * 2) / FIELD_H,
    );
    expect(a.scale).toBe(scale);
    expect(a.offX).toBe((cssW - FIELD_W * scale) / 2);
    expect(a.offY).toBe((cssH - FIELD_H * scale) / 2);
  });

  it("un zoom agrandit le scale, et seulement lui à centre égal", () => {
    const a = poseCadre(375, 650, FIELD_W / 2, FIELD_H / 2, 1);
    const b = poseCadre(375, 650, FIELD_W / 2, FIELD_H / 2, 2);
    expect(b.scale).toBe(a.scale * 2);
  });

  it("le cadre reste sur le champ — pas de vide autour", () => {
    const cssW = 375;
    const cssH = 650;
    const c = poseCadre(cssW, cssH, 0, 0, 2);
    const fieldW = FIELD_W * c.scale;
    const fieldH = FIELD_H * c.scale;
    if (fieldW >= cssW) {
      expect(c.offX).toBeLessThanOrEqual(0);
      expect(c.offX).toBeGreaterThanOrEqual(cssW - fieldW);
    } else {
      expect(c.offX).toBe((cssW - fieldW) / 2);
    }
    if (fieldH >= cssH) {
      expect(c.offY).toBeLessThanOrEqual(0);
      expect(c.offY).toBeGreaterThanOrEqual(cssH - fieldH);
    } else {
      expect(c.offY).toBe((cssH - fieldH) / 2);
    }
  });
});

describe("lot C — sources", () => {
  const main = readFileSync("src/main.ts", "utf8");
  const css = readFileSync("src/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const scene = readFileSync("src/render/scene.ts", "utf8");

  it("la vitrine de l'arrivée se fige sous le mouvement réduit", () => {
    const fn = /function peintVitrine[\s\S]*?\n}/.exec(main)?.[0] ?? "";
    expect(fn, "peintVitrine introuvable").toMatch(
      /matchMedia\(\s*["']\(prefers-reduced-motion:\s*reduce\)["']\s*\)/,
    );
  });

  it("la vitrine ne touche pas le canvas de jeu", () => {
    expect(main).not.toMatch(/\bscene\.cadrer\(/);
    expect(scene).toContain("function poseCadre");
  });

  it("un onglet caché ne peint pas l'attract", () => {
    expect(main).toMatch(/visibilityState === ["']hidden["']/);
  });

  it("sous 899 px, la démo n'est plus display:none et la nuit n'est pas redécidée", () => {
    const blocs: string[] = [];
    const re = /@media[^{]+\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      if (!/max-width:\s*899px/.test(m[0])) continue;
      const debut = m.index + m[0].length;
      let profondeur = 1;
      let i = debut;
      for (; i < css.length; i++) {
        if (css[i] === "{") profondeur++;
        else if (css[i] === "}") {
          profondeur--;
          if (profondeur === 0) break;
        }
      }
      blocs.push(css.slice(debut, i));
    }
    const tel = blocs.join("\n");
    expect(tel.length, "aucun @media (max-width: 899px)").toBeGreaterThan(40);
    expect(tel).not.toMatch(/\.home__demo[^{]*\{[^}]*display:\s*none/);
    expect(tel).not.toMatch(/attract--nuit/);
    expect(tel).toMatch(/\.profondeur\s*\{[^}]*display:\s*none/);
    expect(tel).toMatch(/padding-bottom:\s*83px/);
    expect(tel).toMatch(/#app\.has-topbar #home \.home/);
  });
});
