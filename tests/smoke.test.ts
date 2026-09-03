/**
 * @vitest-environment jsdom
 *
 * Test de câblage : monte l'application réelle dans un DOM simulé, lance un
 * run et joue quelques manches. Ne vérifie pas le rendu, mais attrape les
 * erreurs d'assemblage que les tests unitaires ne peuvent pas voir.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

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

describe("application", () => {
  it("démarre, joue et termine un run sans erreur", async () => {
    const errors: unknown[] = [];
    window.addEventListener("error", (e) => errors.push(e));
    vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a));

    await import("../src/main.ts");

    // l'accueil est monté — DEUX portes, et rien d'autre
    expect(document.getElementById("home")!.classList.contains("hidden")).toBe(false);
    expect(document.getElementById("btnSolo")).not.toBeNull();
    expect(document.getElementById("btnMulti")).not.toBeNull();

    /*
     * Les modes solo ont quitté l'accueil pour leur propre écran.
     *
     * Mesuré sur l'ancien accueil, mobile 375x812 : 1271 px de contenu pour
     * 812 de haut, première chose cliquable à y=465, et la série, les quêtes
     * et le carnet entièrement sous la ligne de flottaison. Le parcours passe
     * donc par SOLO — et ce test le suit, parce qu'un joueur le suit.
     */
    document.getElementById("btnSolo")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.getElementById("solo")!.classList.contains("hidden")).toBe(false);
    expect(document.querySelectorAll("#homeQuests .quest").length).toBe(3);

    // entraînement → brief → run
    document.getElementById("btnTraining")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.getElementById("brief")!.classList.contains("hidden")).toBe(false);
    const name = document.getElementById("briefName")!.textContent!;
    expect(name.length).toBeGreaterThan(2);

    // certaines règles exigent ESPACE maintenu : on l'enfonce avant de lancer
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    document.getElementById("btnGo")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.getElementById("brief")!.classList.contains("hidden")).toBe(true);
    expect(document.getElementById("bandRule")!.textContent).toBe(name);

    // la boucle tourne : la consigne s'affiche et la barre de temps descend
    pump(200);
    expect(document.getElementById("instr")!.textContent!.trim().length).toBeGreaterThan(0);
    const fill = document.getElementById("timerFill") as HTMLElement;
    expect(fill.style.transform).toMatch(/scaleX/);

    // on laisse simplement le temps filer : mort par dépassement garantie
    pump(20000);

    expect(document.getElementById("over")!.classList.contains("hidden")).toBe(false);
    expect(document.getElementById("because")!.textContent!.length).toBeGreaterThan(3);
    expect(Number(document.getElementById("tally")!.textContent)).toBeGreaterThanOrEqual(0);
    expect(document.getElementById("marks")!.textContent).toContain("🟥");
    // L'écran de fin porte la même liste de quêtes que l'accueil : c'est là
    // qu'elle bouge, et « QUÊTES VALIDÉES · +N PIÈCES » ne désigne rien sans
    // elle.
    expect(document.querySelectorAll("#overQuests .quest").length).toBe(3);
    expect(errors).toEqual([]);
  });

  it("enregistre la règle au carnet et propose la règle de demain", async () => {
    const P = await import("../src/game/progress");
    expect(Object.keys(P.load().encountered).length).toBeGreaterThan(0);

    document.getElementById("btnHome")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.getElementById("btnSolo")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.getElementById("btnDaily")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    document.getElementById("btnGo")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    pump(30000);

    const teaser = document.getElementById("teaser")!;
    expect(teaser.textContent).toContain("DEMAIN");
    expect(teaser.querySelector("b")!.textContent!.length).toBeGreaterThan(2);

    /*
     * TROIS essais par jour : le bouton reste OUVERT après le premier.
     *
     * Ce test affirmait l'inverse — « un seul essai par jour » — et c'est
     * exactement ce qui a changé. La mesure le demandait : la médiane du
     * PREMIER run d'un joueur est de 4 manches, donc un essai unique faisait de
     * toute sa relation au run du jour un échec à quatre manches.
     *
     * Le verrou est posé par `renderSolo`, donc il faut repasser par SOLO —
     * c'est aussi ce que fait un joueur. Le verrou à trois essais, lui, se
     * teste sur `essaisDuJour` : `main.ts` ne s'évalue qu'une fois ici, on ne
     * peut donc pas rejouer une journée entière dans ce fichier.
     */
    document.getElementById("btnHome")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.getElementById("btnSolo")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(
      (document.getElementById("btnDaily") as HTMLButtonElement).disabled,
      "un essai consommé sur trois : on doit pouvoir rejouer",
    ).toBe(false);
    // Et l'écran DIT combien il en reste — sans ça, le joueur ne peut pas le
    // savoir, et un bouton actif après un run se lit comme un bug.
    expect(document.getElementById("cardDailyState")!.textContent).toMatch(/2/);
  });
});
