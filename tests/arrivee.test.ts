/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "http://localhost/solo" }
 *
 * ARRIVER DIRECTEMENT SUR UNE ADRESSE.
 *
 * Monte l'application réelle dans un DOM simulé dont l'URL est `/solo`, et
 * vérifie qu'elle s'ouvre là — et que l'écran est PEINT, pas seulement montré.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Chaque méthode rend le contexte lui-même : un dégradé (`createRadialGradient`)
// doit accepter `addColorStop`, comme dans un vrai navigateur.
const ctxStub: CanvasRenderingContext2D = new Proxy({}, { get: () => () => ctxStub }) as never;

beforeAll(() => {
  const html = readFileSync("index.html", "utf8");
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");

  HTMLCanvasElement.prototype.getContext = (() => ctxStub) as never;
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000, height: 420, right: 1000, bottom: 420, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  // La boucle de jeu ne doit pas tourner : ce test ne regarde que l'ARRIVÉE.
  globalThis.requestAnimationFrame = (() => 0) as never;
  globalThis.performance = { now: () => nowMs } as never;
  // Stub WebAudio volontairement PARTIEL : il n'implémente ni createBuffer,
  // ni createBiquadFilter. Le jeu doit rester parfaitement jouable sur un
  // navigateur dont l'audio est incomplet — le son est un agrément, pas une
  // dépendance. Si ce test casse, c'est que le moteur sonore a cessé d'être
  // défensif.
  const chain = { connect: () => chain };
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = class {
    state = "running";
    currentTime = 0;
    sampleRate = 48000;
    destination = {};
    resume() {}
    createOscillator() {
      return {
        type: "",
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect: () => chain,
        start() {},
        stop() {},
      };
    }
    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
          setTargetAtTime() {},
        },
        connect: () => chain,
      };
    }
  };
});

const nowMs = 0;

describe("ARRIVER DIRECTEMENT SUR UNE ADRESSE", () => {
  /*
   * ⚠️ RAPPORTÉ APRÈS DÉPLOIEMENT : « quand je tape ma propre url vers une page
   * du site elle me ramène directement à la page principale ».
   *
   * Mesuré d'abord côté serveur : `/solo` répond bien 200 et sert
   * l'application, et le bundle déployé contient le routage. Le défaut était
   * donc côté client, et il était double.
   *
   * ⚠️ 1. `show()` NE PEINT PAS L'ÉCRAN. Chaque bouton de la barre fait
   * `renderX(); show("x")` ; le démarrage n'appelait que la seconde moitié.
   * Arriver sur `/solo` donnait un écran aux données vides — un cadre qui a
   * l'air cassé, exactement ce que le repli sur le parent existe pour éviter.
   *
   * ⚠️ 2. `/home` n'était dans aucune table, alors que la demande de départ le
   * nommait explicitement (« lelien/home »). L'accueil s'écrit `/`, donc
   * `/home` tombait dans le cas « adresse inconnue ».
   *
   * ⚠️ CE TEST EXISTE PARCE QUE RIEN D'AUTRE NE POUVAIT LE VOIR. Le volet du
   * navigateur réécrit toute navigation vers la racine — impossible d'y ouvrir
   * `/solo` à froid — et l'extension Chrome n'était pas joignable. jsdom, lui,
   * accepte qu'on lui pose l'adresse d'arrivée.
   */
  it("l'application s'ouvre SUR l'écran demandé, et il est peint", async () => {
    expect(location.pathname, "l'environnement doit démarrer sur /solo").toBe("/solo");
    await import("../src/main.ts");

    expect(
      document.getElementById("solo")!.classList.contains("hidden"),
      "arriver sur /solo doit ouvrir SOLO",
    ).toBe(false);
    expect(
      document.getElementById("home")!.classList.contains("hidden"),
      "…et pas l'accueil",
    ).toBe(true);

    /*
     * L'écran est-il PEINT ? C'est la moitié qui manquait. Les cartes de SOLO
     * sont remplies par `renderSolo()` : sans elle, elles restent vides et le
     * joueur voit un cadre mort.
     */
    const carte = document.getElementById("btnDaily")!;
    expect(carte.textContent!.trim().length, "la carte du run du jour est vide").toBeGreaterThan(3);
  });
});
