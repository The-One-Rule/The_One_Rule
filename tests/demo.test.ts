/**
 * LA DÉMO DE L'ACCUEIL — ce qu'elle n'a pas le droit de montrer.
 *
 * Elle existe pour un chiffre : **118 nouveaux visiteurs sur 159 (74 %)
 * repartent sans lancer une seule partie**, médiane 6 secondes. L'accueil ne
 * montrait aucun jeu, et un jeu de réflexes se comprend en deux secondes de
 * vidéo — pas en trois lignes de texte.
 *
 * Ce qu'elle enseigne, c'est le PIÈGE : la seule chose non copiable de TOR, et
 * la plus difficile à deviner puisque seules 5,4 % des manches en produisent un.
 *
 * ⚠️ Une démo qui se trompe apprend un jeu faux, et c'est pire que pas de démo :
 * elle mentirait au seul public qui la regarde. Ce fichier tient les deux
 * affirmations qui peuvent casser en silence — le curseur ne clique JAMAIS le
 * piège, et le verdict ne tombe jamais avant le chrono.
 */
import { describe, expect, it } from "vitest";
import { etatDemo } from "../src/render/demo";

/** Un balayage fin d'un cycle entier : 8,6 s par pas de 20 ms. */
const CYCLE = 8600;
const pas = (n = 20): number[] =>
  Array.from({ length: Math.ceil(CYCLE / n) }, (_, i) => i * n);

describe("la démo de l'accueil", () => {
  it("⚠️ NE CLIQUE JAMAIS SUR LA MANCHE PIÉGÉE", () => {
    /*
     * C'est toute la démonstration. Un clic sur le piège montrerait l'inverse
     * exact de ce que le jeu demande — et ce serait invisible : l'image passe
     * en 40 ms, personne ne la reverrait au ralenti.
     */
    for (const t of pas(10)) {
      const e = etatDemo(t);
      if (e.manche === "b") {
        expect(e.clic, `un clic à t=${t} sur la manche piégée`).toBe(false);
      }
    }
  });

  it("la manche ordinaire, elle, clique — sinon il n'y a rien à comparer", () => {
    // Sans ce test, « ne clique jamais » passerait aussi avec une démo qui ne
    // clique nulle part, c'est-à-dire qui ne montre plus la mécanique.
    expect(pas(10).some((t) => etatDemo(t).clic)).toBe(true);
  });

  it("les deux manches existent, et la piégée dure plus longtemps", () => {
    /*
     * Ne rien faire prend le temps que le chrono met à s'écouler. Une manche
     * piégée plus courte que l'ordinaire ferait passer l'inaction pour de
     * l'hésitation.
     */
    const a = pas(10).filter((t) => etatDemo(t).manche === "a").length;
    const b = pas(10).filter((t) => etatDemo(t).manche === "b").length;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });

  it("le verdict ne devance jamais son chrono", () => {
    // Un « PIÈGE DÉJOUÉ » affiché à mi-manche dirait qu'on gagne en attendant
    // un peu, alors qu'il faut tenir jusqu'au bout.
    for (const t of pas(10)) {
      const e = etatDemo(t);
      if (e.verdict === "piege") {
        expect(e.ratio, `verdict piège à t=${t} avec un chrono à ${e.ratio}`).toBe(1);
      }
    }
  });

  it("les deux verdicts finissent par tomber", () => {
    const vus = new Set(pas(10).map((t) => etatDemo(t).verdict));
    expect(vus.has("tenu")).toBe(true);
    expect(vus.has("piege")).toBe(true);
  });

  it("le curseur reste dans le champ, et il boucle", () => {
    for (const t of pas(10)) {
      const c = etatDemo(t).curseur;
      if (c !== null) {
        expect(c, `curseur hors champ à t=${t}`).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
    // La boucle est vraiment une boucle : deux cycles donnent le même état.
    expect(etatDemo(1234)).toEqual(etatDemo(1234 + CYCLE));
  });

  it("⚠️ le curseur RENONCE : il s'approche du piège, puis recule", () => {
    /*
     * C'est le geste que la démo doit montrer — le réflexe, puis l'inhibition.
     * Un curseur qui ne bougerait pas du tout sur la manche piégée montrerait
     * quelqu'un qui n'a rien vu, pas quelqu'un qui s'est retenu.
     */
    const b = pas(10)
      .map((t) => etatDemo(t))
      .filter((e) => e.manche === "b" && e.curseur !== null)
      .map((e) => e.curseur!);
    const max = Math.max(...b);
    expect(max, "le curseur ne s'approche même pas").toBeGreaterThan(0.1);
    expect(b[b.length - 1]!, "il ne recule pas").toBeLessThan(max);
  });
});
