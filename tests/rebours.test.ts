/**
 * @vitest-environment jsdom
 *
 * Test de câblage : monte l'application réelle dans un DOM simulé, lance un
 * run et joue quelques manches. Ne vérifie pas le rendu, mais attrape les
 * erreurs d'assemblage que les tests unitaires ne peuvent pas voir.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LECTURE_NEUVE_MS } from "../src/game/lecture";

const ctxStub = new Proxy({}, { get: () => () => undefined }) as CanvasRenderingContext2D;

beforeAll(() => {
  const html = readFileSync("index.html", "utf8");
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");

  HTMLCanvasElement.prototype.getContext = (() => ctxStub) as never;
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000, height: 420, right: 1000, bottom: 420, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  // on capture la callback pour pouvoir dérouler la boucle de jeu à la main
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    frameCb = cb;
    return 0;
  }) as never;
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

let nowMs = 0;
let frameCb: FrameRequestCallback | null = null;

/** Avance le temps de `ms` en déroulant la boucle image par image. */
function pump(ms: number, step = 16): void {
  for (let t = 0; t < ms; t += step) {
    nowMs += step;
    const cb = frameCb;
    frameCb = null;
    cb?.(nowMs);
  }
}



describe("LE REBOURS DU BRIEF — le bouton doit retrouver son mot", () => {
  /*
   * ⚠️ RAPPORTÉ EN PLAYTEST : « le décompte avant l'entraînement sur le bouton
   * lancer est bugué ».
   *
   * La fin NORMALE du rebours ne restituait pas le libellé — seule la sortie
   * prématurée le faisait. Le bouton restait donc sur « 1 », invisible pendant
   * la partie puisque le brief est masqué, et réécrit au brief suivant par
   * `openBrief`. La panne ne se déclenchait que par un chemin : lancer, laisser
   * le rebours finir, revenir, relancer, puis quitter pendant CE rebours-là —
   * `startRun` avait mémorisé « 1 » comme libellé à restituer.
   *
   * Même racine que le bug déjà documenté sur ESPACE, fermé du côté de l'appel
   * en trop et pas du côté de la cause. On mesure donc l'invariant, pas le
   * chemin : AU REPOS, LE BOUTON NE PORTE JAMAIS UN CHIFFRE.
   */
  it("le rebours descend, puis rend le mot au bouton", async () => {
    await import("../src/main.ts");
    const btn = () => document.getElementById("btnGo") as HTMLButtonElement;
    document.getElementById("btnPlay")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.getElementById("btnOnbSkip")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.getElementById("btnPlay")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    

    const motInitial = btn().textContent!;
    expect(motInitial, "le brief doit proposer un mot, pas un chiffre").not.toMatch(/^\d+$/);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    btn().dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // Le rebours COURT : c'est ce qu'on veut voir, et c'est ce qui prouve que
    // l'assertion suivante ne passe pas parce qu'il n'a jamais démarré.
    pump(900);
    expect(btn().textContent, "le rebours doit s'afficher").toMatch(/^\d+$/);

    // Puis il aboutit — largement au-delà de LECTURE_NEUVE_MS.
    pump(LECTURE_NEUVE_MS + 600);
    expect(
      document.getElementById("brief")!.classList.contains("hidden"),
      "le run doit avoir démarré",
    ).toBe(true);
    expect(
      btn().textContent,
      "⚠️ le bouton est resté sur un chiffre : le prochain rebours le mémorisera",
    ).toBe(motInitial);
    expect(btn().disabled, "et il doit être réactivé").toBe(false);
  });
});
