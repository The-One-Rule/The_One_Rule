/**
 * Le réglage DÉJOUER, relu depuis une sauvegarde qu'on ne contrôle pas.
 *
 * ⚠️ La touche vole une lettre au jeu : accepter n'importe quoi, c'est laisser
 * une sauvegarde bricolée prendre ESPACE (le maintien de LA MAIN GAUCHE), une
 * flèche (une réponse) ou R (REJOUER, tapé une fraction de seconde trop tard
 * après un déjouage raté).
 */
import { describe, expect, it } from "vitest";
import { normaliseDejoue, reglageDejoueDefaut, toucheAcceptable } from "../src/game/dejoue";

describe("la touche du déjouage", () => {
  it("n'accepte qu'une lettre, et jamais R", () => {
    for (const ok of ["F", "f", "A", "z", "Q"]) expect(toucheAcceptable(ok), ok).toBe(true);
    for (const non of [" ", "Escape", "ArrowUp", "Enter", "1", "é", "FF", "", "R", "r"]) {
      expect(toucheAcceptable(non), JSON.stringify(non)).toBe(false);
    }
  });
});

describe("la relecture d'une sauvegarde", () => {
  it("absent vaut le défaut : activé, F, à droite", () => {
    expect(normaliseDejoue(undefined)).toEqual({ on: true, touche: "F", cote: "droite" });
    expect(normaliseDejoue(null)).toEqual(reglageDejoueDefaut());
    expect(normaliseDejoue("n'importe quoi")).toEqual(reglageDejoueDefaut());
  });

  it("garde un choix valide, en capitale", () => {
    expect(normaliseDejoue({ on: false, touche: "j", cote: "gauche" })).toEqual({
      on: false,
      touche: "J",
      cote: "gauche",
    });
  });

  it("⚠️ remplace champ par champ ce qui est invalide, sans jeter le reste", () => {
    expect(normaliseDejoue({ on: false, touche: " ", cote: "gauche" })).toEqual({
      on: false,
      touche: "F",
      cote: "gauche",
    });
    expect(normaliseDejoue({ on: "oui", touche: "K", cote: "haut" })).toEqual({
      on: true,
      touche: "K",
      cote: "droite",
    });
    expect(normaliseDejoue({ touche: "R" }).touche).toBe("F");
  });
});
