import { describe, expect, it } from "vitest";
import { originAllowed, parseOrigins } from "../server/origin";

/* ------------------------------------------------------------------ *
 * Le contrôle d'origine
 *
 * Un serveur de salons ouvert à toutes les pages du web est un serveur qu'on
 * ne remarque jamais avoir laissé ouvert. Ces tests fixent le défaut : fermé
 * en production, ouvert en développement.
 * ------------------------------------------------------------------ */
describe("contrôle d'origine", () => {
  it("lit une liste séparée par des virgules, espaces compris", () => {
    expect(parseOrigins("https://a.app, https://b.app")).toEqual([
      "https://a.app",
      "https://b.app",
    ]);
    expect(parseOrigins("  https://a.app  ")).toEqual(["https://a.app"]);
  });

  it("traite l'absence de variable comme une liste vide", () => {
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins("")).toEqual([]);
    expect(parseOrigins(" , ,, ")).toEqual([]);
  });

  it("REFUSE TOUT en production quand la liste est vide", () => {
    // Le garde-fou du projet : mieux vaut un multijoueur visiblement cassé au
    // premier déploiement qu'un serveur ouvert que personne ne remarque.
    expect(originAllowed("https://legitime.app", [], true)).toBe(false);
    expect(originAllowed(undefined, [], true)).toBe(false);
  });

  it("accepte tout hors production quand la liste est vide", () => {
    expect(originAllowed("http://localhost:5173", [], false)).toBe(true);
    // Sans en-tête Origin : c'est le cas des clients Node, dont e2e.mjs.
    expect(originAllowed(undefined, [], false)).toBe(true);
  });

  it("n'accepte que les origines exactes quand la liste est renseignée", () => {
    const allowed = ["https://jeu.app"];
    expect(originAllowed("https://jeu.app", allowed, true)).toBe(true);
    expect(originAllowed("https://jeu.app.evil.com", allowed, true)).toBe(false);
    expect(originAllowed("http://jeu.app", allowed, true)).toBe(false);
    expect(originAllowed("null", allowed, true)).toBe(false);
    expect(originAllowed(undefined, allowed, true)).toBe(false);
  });

  it("applique la liste blanche même hors production", () => {
    // Sinon un oubli de NODE_ENV en préproduction rouvrirait tout.
    expect(originAllowed("https://autre.app", ["https://jeu.app"], false)).toBe(false);
  });
});
