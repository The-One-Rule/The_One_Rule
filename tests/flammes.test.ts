/**
 * Les flammes : ce qui doit rester vrai quoi qu'il arrive au dessin.
 *
 * Le rendu se juge à l'œil ; ces propriétés-là, non. Un feu qui prend racine
 * dans le terrain cache une pièce, un feu qui s'allume sur une manche piégée
 * révèle le piège (n°5) — et aucun des deux ne se voit sur une capture prise
 * au hasard.
 *
 * ⚠️ Le placement ne garantit pas tout : les flammes ONDULENT, et c'est le
 * DÉCOUPAGE du calque (`main.ts`) qui rogne une langue qui dépasserait. Ici on
 * tient l'autre moitié : aucune flamme ne prend racine dans le champ.
 */
import { describe, expect, it } from "vitest";
import { IMAGES, PLANCHE, SEUIL, ardeurDe, braisesPour, imageDe } from "../src/render/flammes";
import type { Braise } from "../src/render/flammes";

/**
 * Une scène relevée pour de vrai : un téléphone debout de 375 × 812, terrain
 * mesuré à {70, 176, 234, 558} dans le repère de l'application — le calque des
 * flammes couvre `#app`, pas le canvas de jeu.
 */
const CANVAS = { w: 375, h: 812 };
const CHAMP = { x: 70, y: 176, w: 234, h: 558 };

const dansLeChamp = (b: Braise): boolean =>
  b.x > CHAMP.x && b.x < CHAMP.x + CHAMP.w && b.y > CHAMP.y && b.y < CHAMP.y + CHAMP.h;

describe("où le feu prend", () => {
  it("⚠️ aucune flamme ne prend racine dans le terrain", () => {
    for (let a = 0; a <= 1.001; a += 0.05) {
      for (const b of braisesPour(CANVAS, CHAMP, a)) {
        expect(dansLeChamp(b), `ardeur ${a.toFixed(2)} : une flamme dans le champ`).toBe(false);
      }
    }
  });

  it("le feu prend par le BAS, puis les côtés, et le haut en dernier", () => {
    const cotes = (a: number): string[] => [...new Set(braisesPour(CANVAS, CHAMP, a).map((b) => b.cote))].sort();
    expect(cotes(0.02)).toEqual([]);
    expect(cotes(0.1)).toEqual(["bas"]);
    expect(cotes(0.3)).toEqual(["bas", "droite", "gauche"]);
    expect(cotes(1)).toEqual(["bas", "droite", "gauche", "haut"]);
    // Le haut n'arrive qu'au-delà du seuil de la maquette.
    expect(cotes(SEUIL.haut - 0.01)).not.toContain("haut");
  });

  it("plus on avance, plus il y a de flammes et plus elles montent", () => {
    const mesure = (a: number): { n: number; h: number } => {
      const bs = braisesPour(CANVAS, CHAMP, a);
      return { n: bs.length, h: Math.max(0, ...bs.map((b) => b.h)) };
    };
    const tiede = mesure(0.25);
    const chaud = mesure(1);
    expect(chaud.n).toBeGreaterThan(tiede.n);
    expect(chaud.h).toBeGreaterThan(tiede.h);
  });

  it("⚠️ rien n'est tiré au sort : deux appels donnent le même feu", () => {
    // Sinon le feu grésillerait d'une image à l'autre, et aucun test ne
    // pourrait le décrire.
    expect(braisesPour(CANVAS, CHAMP, 0.6)).toEqual(braisesPour(CANVAS, CHAMP, 0.6));
  });

  it("les flammes ne battent pas toutes ensemble", () => {
    const bs = braisesPour(CANVAS, CHAMP, 1);
    expect(new Set(bs.map((b) => b.phase)).size).toBeGreaterThan(3);
    expect(new Set(bs.map((b) => Math.round(b.vitesse * 100))).size).toBeGreaterThan(3);
  });
});

describe("l'ardeur", () => {
  it("rien pendant l'échauffement, tout à la manche 30, jamais en arrière", () => {
    expect(ardeurDe(0, 3)).toBe(0);
    expect(ardeurDe(2, 3)).toBe(0);
    expect(ardeurDe(30, 3)).toBe(1);
    expect(ardeurDe(90, 3)).toBe(1);
    let avant = 0;
    for (let n = 0; n < 40; n++) {
      const a = ardeurDe(n, 3);
      expect(a).toBeGreaterThanOrEqual(avant);
      avant = a;
    }
  });
});

describe("la planche", () => {
  it("l'image tourne en boucle et reste dans la planche", () => {
    const b = braisesPour(CANVAS, CHAMP, 1)[0]!;
    for (const t of [0, 123, 5000, 999999]) {
      const { sx, sy } = imageDe(b, t);
      expect(sx % PLANCHE.image).toBe(0);
      expect(sy % PLANCHE.image).toBe(0);
      expect(sx).toBeLessThan(PLANCHE.colonnes * PLANCHE.image);
      expect(sy).toBeLessThan(PLANCHE.rangees * PLANCHE.image);
    }
    expect(IMAGES).toBe(PLANCHE.colonnes * PLANCHE.rangees);
  });

  it("l'animation avance vraiment avec le temps", () => {
    const b = braisesPour(CANVAS, CHAMP, 1)[0]!;
    const vues = new Set<string>();
    for (let t = 0; t < 2000; t += 40) {
      const { sx, sy } = imageDe(b, t);
      vues.add(`${sx},${sy}`);
    }
    expect(vues.size).toBeGreaterThan(10);
  });
});
