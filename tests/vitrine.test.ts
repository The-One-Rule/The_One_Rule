/**
 * LA VITRINE DE L'ARRIVÉE — `render/vitrine.ts`.
 *
 * Ce qu'elle doit montrer, et seulement ça : une obéissance récompensée, puis
 * un piège déjoué EN NE TOUCHANT PAS le rouge.
 */
import { describe, expect, it } from "vitest";
import { DUREE_VITRINE, PIECES_VITRINE, etatVitrine } from "../src/render/vitrine";

const pas = (n = 400) => Array.from({ length: n }, (_, i) => (i * DUREE_VITRINE) / n);

describe("la vitrine", () => {
  it("montre les deux retours : BIEN puis PIÈGE DÉJOUÉ, dans cet ordre", () => {
    const badges = pas().map((t) => etatVitrine(t).badge);
    const iBien = badges.indexOf("bien");
    const iPiege = badges.indexOf("piege");
    expect(iBien).toBeGreaterThan(-1);
    expect(iPiege).toBeGreaterThan(iBien);
  });

  it("⚠️ LA MAIN NE TOUCHE JAMAIS LE ROUGE — c'est toute la leçon", () => {
    const rouge = PIECES_VITRINE.rouge;
    for (const t of pas(2000)) {
      const e = etatVitrine(t);
      if (e.appui) {
        const d = Math.hypot(e.main.x - rouge.x, e.main.y - rouge.y);
        expect(d, `appui près du rouge à ${t} ms`).toBeGreaterThan(0.15);
      }
    }
  });

  it("le seul appui se pose sur le bleu, pendant la manche 1", () => {
    const bleu = PIECES_VITRINE.bleu;
    const appuis = pas(2000).map(etatVitrine).filter((e) => e.appui);
    expect(appuis.length).toBeGreaterThan(0);
    for (const e of appuis) {
      expect(e.manche).toBe(1);
      expect(Math.hypot(e.main.x - bleu.x, e.main.y - bleu.y)).toBeLessThan(0.01);
    }
  });

  it("le piège se gagne quand le temps est ÉPUISÉ, pas avant", () => {
    for (const t of pas(2000)) {
      const e = etatVitrine(t);
      if (e.badge === "piege") expect(e.chrono).toBe(0);
      expect(e.chrono).toBeGreaterThanOrEqual(0);
      expect(e.chrono).toBeLessThanOrEqual(1);
    }
  });

  it("la main reste dans le terrain", () => {
    for (const t of pas(2000)) {
      const { x, y } = etatVitrine(t).main;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it("boucle sans saut : la fin rejoint le début", () => {
    const fin = etatVitrine(DUREE_VITRINE - 1);
    const debut = etatVitrine(DUREE_VITRINE);
    expect(debut.manche).toBe(1);
    expect(fin.manche).toBe(2);
  });
});
