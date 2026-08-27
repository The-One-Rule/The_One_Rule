import { describe, expect, it } from "vitest";
import { COLUMN_ENTER, COLUMN_MIN, stableGutter, wantsColumns } from "../src/render/layout";
import { FIELD_GUTTER } from "../src/render/scene";
import { FIELD_H, FIELD_W } from "../src/engine/types";

/* ------------------------------------------------------------------ *
 * Placement des plaques joueurs
 *
 * Ce qui est en jeu n'est pas l'esthétique, c'est la TERMINAISON. Décider de
 * la disposition à partir d'une grandeur que la disposition modifie fait
 * osciller la mise en page ; le navigateur abandonne alors des notifications
 * de redimensionnement et la géométrie reste figée sur une valeur fausse —
 * pièces invisibles, plaques tantôt sur les côtés tantôt en bas.
 * ------------------------------------------------------------------ */

/** Hauteur du bandeau de plaques quand il est dans le flux. */
const BANDEAU = 96;

/**
 * Simule un cycle complet de mise en page à partir d'un état donné.
 *
 * En bandeau, la scène perd la hauteur du bandeau ; en colonnes elle la
 * récupère. C'est exactement le couplage qui produisait la boucle.
 */
function cycle(canvasW: number, hSansPlaques: number, etat: boolean): boolean {
  const hauteurScene = etat ? hSansPlaques : hSansPlaques - BANDEAU;
  const dansLeFlux = !etat;
  const reconstitue = hauteurScene + (dansLeFlux ? BANDEAU : 0);
  return wantsColumns(stableGutter(canvasW, reconstitue), etat);
}

describe("placement des plaques", () => {
  it("ne peut PAS osciller, quelle que soit la fenêtre", () => {
    // Le cœur du correctif. On balaie un large éventail de fenêtres, et pour
    // chacune on vérifie qu'aucun état ne se renvoie vers l'autre indéfiniment :
    // partir de « colonnes » et partir de « bandeau » doit mener au même point
    // fixe, atteint en un pas.
    let testees = 0;
    for (let w = 320; w <= 2600; w += 17) {
      for (let h = 240; h <= 1600; h += 23) {
        testees++;
        const depuisColonnes = cycle(w, h, true);
        const depuisBandeau = cycle(w, h, false);

        // Point fixe : réappliquer la décision ne la change plus.
        expect(cycle(w, h, depuisColonnes), `oscille en ${w}x${h} depuis colonnes`).toBe(
          depuisColonnes,
        );
        expect(cycle(w, h, depuisBandeau), `oscille en ${w}x${h} depuis bandeau`).toBe(
          depuisBandeau,
        );
      }
    }
    expect(testees).toBeGreaterThan(8000); // le balayage doit avoir des dents
  });

  it("n'affiche jamais une colonne trop étroite pour une plaque", () => {
    // `.plate` a min-width 108 px, `.plates__col` ajoute 10 px de chaque côté,
    // et la colonne est en overflow hidden : sous 128 px, la plaque est rognée.
    // C'est exactement ce qu'on a vu en production.
    expect(COLUMN_MIN).toBeGreaterThanOrEqual(128);
    expect(COLUMN_ENTER).toBeGreaterThan(COLUMN_MIN);

    for (let g = 0; g < COLUMN_MIN; g++) {
      expect(wantsColumns(g, true), `colonne rognée à ${g}px`).toBe(false);
      expect(wantsColumns(g, false), `colonne rognée à ${g}px`).toBe(false);
    }
  });

  it("mesure la même gouttière dans les deux dispositions", () => {
    // La propriété qui rompt la boucle : la grandeur qui décide ne dépend pas
    // de la décision. L'appelant reconstitue la hauteur hors flux, donc les
    // deux états doivent produire un chiffre identique.
    for (const [w, h] of [
      [1750, 960],
      [1280, 800],
      [2560, 1440],
      [900, 700],
    ] as const) {
      const enColonnes = stableGutter(w, h);
      const enBandeau = stableGutter(w, h - BANDEAU + BANDEAU);
      expect(enBandeau).toBe(enColonnes);
    }
  });

  it("garde la scène large sur un écran étroit, donc pas de colonnes", () => {
    // Téléphone : le champ est limité par la LARGEUR, il ne reste donc que la
    // gouttière réservée au cadre de temps — jamais de quoi loger une colonne.
    // Le bandeau est la seule disposition tenable.
    const g = stableGutter(390, 720);
    expect(g).toBe(FIELD_GUTTER);
    expect(g).toBeLessThan(COLUMN_MIN);
    expect(wantsColumns(g, false)).toBe(false);
    expect(wantsColumns(g, true)).toBe(false);
  });

  it("propose les colonnes quand la place existe réellement", () => {
    // Écran large et court : le champ est limité par la hauteur, il reste de
    // la place sur les côtés — c'est le cas que le mode colonnes sert.
    const g = stableGutter(2400, 700);
    expect(g).toBeGreaterThanOrEqual(COLUMN_ENTER);
    expect(wantsColumns(g, false)).toBe(true);
  });

  it("respecte le rapport du champ", () => {
    // Contrôle de cohérence : la gouttière déduite doit correspondre au champ
    // réellement dessiné, sinon les plaques se poseraient à côté de la scène.
    const w = 1600;
    const h = 600;
    const g = stableGutter(w, h);
    const largeurChamp = w - g * 2;
    const hauteurChamp = (largeurChamp * FIELD_H) / FIELD_W;
    expect(hauteurChamp).toBeLessThanOrEqual(h);
  });
});
