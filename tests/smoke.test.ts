/**
 * @vitest-environment jsdom
 *
 * Test de câblage : monte l'application réelle dans un DOM simulé, lance un
 * run et joue quelques manches. Ne vérifie pas le rendu, mais attrape les
 * erreurs d'assemblage que les tests unitaires ne peuvent pas voir.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { LECTURE_NEUVE_MS } from "../src/game/lecture";

// Chaque méthode rend le contexte lui-même : un dégradé (`createRadialGradient`)
// doit accepter `addColorStop`, comme dans un vrai navigateur.
const ctxStub: CanvasRenderingContext2D = new Proxy({}, { get: () => () => ctxStub }) as never;

/**
 * ⚠️ LE HASARD DE CE TEST EST FIGÉ, et il l'a payé.
 *
 * La graine d'un run d'entraînement vient de `Math.random`. Or ce test laisse
 * le temps filer sans jouer et PARIE que le niveau 1-1 est perdu — alors
 * qu'une manche piégée se survit en ne faisant rien. Mesuré sur 3000 graines :
 * 156, soit 5,2 %, font gagner le 1-1 à un joueur qui ne touche à rien. Le
 * test tombait donc une fois sur vingt environ, sans qu'aucun code n'ait
 * changé, avec un message (« expected false to be true » sur `is-rate`) qui ne
 * désignait rien. Un générateur fixé rend le run identique à chaque passage.
 * Éprouvé : sur les valeurs 1 à 30, 18 et 20 font tomber exactement cette
 * assertion.
 */
const HASARD = 20260925;

beforeAll(() => {
  let h = HASARD;
  Math.random = () => {
    // mulberry32 : le même générateur que le moteur, recopié pour ne pas
    // lier le harnais à une signature interne.
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

/**
 * Déroule la boucle JUSQU'À ce que `pret()` réponde vrai, ou échoue en le
 * disant.
 *
 * ⚠️ Ce filet a déjà passé par chance, et il a fallu vingt lancements pour
 * l'attraper. Il attendait la mort du joueur avec un `pump(20000)` calibré à la
 * main : quatre manches à l'allure 1.5, plus la marge. Deux changements du même
 * soir ont mangé cette marge — le battement de lecture prend 3 s du budget, et
 * l'allure d'un joueur neuf est passée à 2.0, ce qui DOUBLE la durée de chaque
 * manche. Selon le nombre d'étapes tirées, la mort tombait parfois après la
 * vingtième seconde : deux échecs sur vingt lancements, sur un test qui ne
 * disait rien de la cause.
 *
 * Une durée écrite en dur encode une hypothèse sur l'équilibrage. Attendre la
 * CONDITION ne l'encode pas — et le plafond, très large, ne sert qu'à ne pas
 * boucler indéfiniment si le run ne se termine jamais.
 */
function pumpJusqua(pret: () => boolean, quoi: string, maxMs = 120000): void {
  for (let t = 0; t < maxMs; t += 16) {
    if (pret()) return;
    pump(16);
  }
  throw new Error(`la boucle n'a jamais atteint : ${quoi} (après ${maxMs} ms simulées)`);
}

describe("application", () => {
  it("démarre, joue et termine un run sans erreur", async () => {
    const errors: unknown[] = [];
    window.addEventListener("error", (e) => errors.push(e));
    vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a));

    await import("../src/main.ts");

    /*
     * L'accueil est monté : le champ tourne derrière, PLAY est au centre, et la
     * profondeur est en bas. C'est la composition de la maquette — « MODE
     * ATTRACT · LA PARTIE TOURNE, PLAY EST AU CENTRE, LA PROFONDEUR EST EN
     * BAS » — qui a remplacé l'objet fendu SOLO / MULTI.
     */
    expect(document.getElementById("home")!.classList.contains("hidden")).toBe(false);
    expect(document.getElementById("btnPlay")).not.toBeNull();
    expect(document.getElementById("attractCvs")).not.toBeNull();
    expect(document.getElementById("btnMulti")).not.toBeNull();

    /*
     * Les modes solo ont quitté l'accueil pour leur propre écran.
     *
     * Mesuré sur l'ancien accueil, mobile 375x812 : 1271 px de contenu pour
     * 812 de haut, première chose cliquable à y=465, et la série, les quêtes
     * et le carnet entièrement sous la ligne de flottaison. Le parcours passe
     * donc par SOLO — et ce test le suit, parce qu'un joueur le suit.
     */
    document.getElementById("btnPlay")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    /*
     * ⚠️ UN JOUEUR NEUF NE VA PAS EN PARTIE — il va sur la PREMIÈRE ARRIVÉE.
     *
     * Ce test partait d'une sauvegarde vierge, donc il décrit exactement le
     * parcours d'un nouveau venu : c'est lui qui a changé. Rapporté par Pierre
     * après avoir fait tester le jeu à ses camarades — « ils ont adoré mais ils
     * n'ont pas immédiatement compris, j'étais à côté pour expliquer ».
     *
     * La première arrivée n'est PAS déclenchée à l'ouverture du site : elle
     * l'est par les portes de jeu, parce que le joueur doit avoir choisi de
     * jouer. On vérifie les deux moitiés de cette règle.
     */
    /*
     * ⚠️ PLUS D'ÉCRAN D'EXPLICATION : il arrive DIRECTEMENT sur le terrain, en
     * train de jouer sa première manche (retour du jury Ystart, « un tuto qui
     * se passe en jouant »).
     */
    expect(
      document.getElementById("tuto")!.classList.contains("hidden"),
      "un joueur neuf qui clique JOUER arrive sur le terrain, tutoriel en cours",
    ).toBe(false);
    expect(
      document.getElementById("brief")!.classList.contains("hidden"),
      "…et pas directement sur l'annonce de la règle",
    ).toBe(true);
    // Le premier temps dit la RÈGLE en jouant : elle est au bandeau, et la
    // ligne d'aide la rappelle.
    expect(document.getElementById("bandRule")!.textContent!.length).toBeGreaterThan(2);
    expect(document.getElementById("tutoAide")!.textContent!.length).toBeGreaterThan(8);

    // PASSER remet le joueur sur l'accueil sans rien casser, et le marque comme
    // ayant vu l'arrivée : le reste du parcours redevient celui d'un habitué.
    document.getElementById("btnTutoPasser")!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(document.getElementById("home")!.classList.contains("hidden")).toBe(false);

    // Une fois l'arrivée vue, l'accueil EST le parcours, et PLAY mène au brief
    // du PROCHAIN NIVEAU — le 1-1, sous LE SANG, la règle que le tutoriel
    // vient d'enseigner. C'était le bug : l'entraînement servait une autre règle.
    expect(document.getElementById("parcours")!.classList.contains("hidden")).toBe(false);
    document.getElementById("btnPlay")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.getElementById("brief")!.classList.contains("hidden")).toBe(false);
    const name = document.getElementById("briefName")!.textContent!;
    // (la langue suit le navigateur du harnais : on accepte les deux noms)
    expect(["LE SANG", "THE BLOOD"]).toContain(name);

    // certaines règles exigent ESPACE maintenu : on l'enfonce avant de lancer
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    document.getElementById("btnGo")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    /*
     * ⚠️ LE CLIC NE LANCE PLUS TOUT DE SUITE, et ce test l'affirmait.
     *
     * Un battement de lecture sépare désormais COMMENCER de la première
     * consigne : mesuré à 50 ms avant, ce qui jetait un joueur neuf sous une
     * fenêtre d'une seconde et demie sans lui laisser le temps de retenir sa
     * règle. Le brief RESTE affiché pendant ce temps, sa règle en grand.
     *
     * Le battement est porté par la boucle de jeu et non par un `setTimeout` —
     * c'est exactement ce qui permet à `pump` de le dérouler ici. Une minuterie
     * ne serait jamais jouée par ce filet, et le correctif serait donc non
     * testé sur le chemin le plus chaud du jeu.
     */
    expect(
      document.getElementById("brief")!.classList.contains("hidden"),
      "le brief reste pendant le temps de lecture",
    ).toBe(false);
    pump(LECTURE_NEUVE_MS + 100);
    expect(document.getElementById("brief")!.classList.contains("hidden")).toBe(true);
    expect(document.getElementById("bandRule")!.textContent).toBe(name);

    // la boucle tourne : la consigne s'affiche et la barre de temps descend
    pump(200);
    expect(document.getElementById("instr")!.textContent!.trim().length).toBeGreaterThan(0);
    const fill = document.getElementById("timerFill") as HTMLElement;
    expect(fill.style.transform).toMatch(/scaleX/);

    // On laisse simplement le temps filer : la mort par dépassement est
    // certaine, mais PAS son échéance — elle dépend de l'allure par défaut, du
    // nombre de manches d'échauffement et du nombre d'étapes tirées. On attend
    // donc l'écran de fin, on ne parie pas sur une durée.
    // Trois vies : trois dépassements de temps, puis l'écran de NIVEAU — pas
    // l'ancien écran de fin.
    pumpJusqua(
      () => !document.getElementById("niveau")!.classList.contains("hidden"),
      "l'écran de fin de niveau après trois vies perdues",
    );

    expect(document.getElementById("niveau")!.classList.contains("is-rate")).toBe(true);
    expect(document.getElementById("niveauMotif")!.textContent!.length).toBeGreaterThan(3);
    expect(document.querySelectorAll("#niveauEtoiles .etoile.is-on").length).toBe(0);
    // Un échec ne révèle pas de carte : elle se GAGNE en réussissant le 1-1.
    expect(document.getElementById("niveauRevele")!.classList.contains("hidden")).toBe(true);
    // Et l'action évidente est de réessayer le même niveau.
    expect(document.getElementById("btnNiveauSuite")!.textContent).toMatch(/RÉESSAYER|TRY AGAIN/);
    expect(errors).toEqual([]);
  });

  it("enregistre la règle au carnet et propose la règle de demain", async () => {
    const P = await import("../src/game/progress");
    expect(Object.keys(P.load().encountered).length).toBeGreaterThan(0);

    document.getElementById("btnNiveauParcours")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    /*
     * ⚠️ LE RUN DU JOUR EST FERMÉ tant que le chapitre 1 n'est pas bouclé : un
     * nouveau venu y brûlait un essai à l'aveugle. La carte le DIT au lieu de
     * s'ouvrir.
     */
    expect(document.getElementById("profJour")!.classList.contains("is-verrou")).toBe(true);
    document.getElementById("profJour")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.getElementById("solo")!.classList.contains("hidden")).toBe(true);

    // Le boss du chapitre 1 battu : le run du jour s'ouvre.
    P.mutate((st) => {
      st.encountered.sang = { ...st.encountered.sang!, etoiles: [1, 1, 1, 1, 1] };
    });
    document.getElementById("navParcours")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.getElementById("profJour")!.classList.contains("is-verrou")).toBe(false);
    // La carte DU JOUR ouvre l'écran SOLO — il porte les essais restants, la
    // série et les quêtes, c'est-à-dire tout ce qu'on veut savoir AVANT de
    // brûler un des trois essais. L'annonce vient ensuite.
    document.getElementById("profJour")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.getElementById("btnDaily")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    document.getElementById("btnGo")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // Le battement de lecture d'abord, le run ensuite — et là encore on attend
    // la CONDITION plutôt qu'une durée devinée.
    pumpJusqua(
      () => !document.getElementById("over")!.classList.contains("hidden"),
      "la fin du run du jour",
    );

    const teaser = document.getElementById("teaser")!;
    // ⚠️ Ce test exigeait « DEMAIN » alors que le harnais tourne en ANGLAIS :
    // il gravait le bug. Le mot suit désormais la langue.
    const { langue } = await import("../src/i18n");
    expect(teaser.textContent).toContain(langue() === "fr" ? "DEMAIN" : "TOMORROW");
    expect(teaser.querySelector("b")!.textContent!.length).toBeGreaterThan(2);

    /*
     * TROIS essais par jour : le bouton reste OUVERT après le premier.
     *
     * Ce test affirmait l'inverse — « un seul essai par jour » — et c'est
     * exactement ce qui a changé. La mesure le demandait : la médiane du
     * PREMIER run d'un joueur est de 4 manches, donc un essai unique faisait de
     * toute sa relation au run du jour un échec à quatre manches.
     *
     * Le verrou est posé par `renderSolo`, donc il faut repasser par l'écran
     * SOLO — c'est aussi ce que fait un joueur qui veut voir ses essais. Depuis
     * la refonte, l'accueil n'y mène plus directement : on y va par la barre du
     * bas, comme lui. Le verrou à trois essais, lui, se teste sur
     * `essaisDuJour` : `main.ts` ne s'évalue qu'une fois ici, on ne peut donc
     * pas rejouer une journée entière dans ce fichier.
     */
    document.getElementById("btnHome")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.getElementById("profJour")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(
      (document.getElementById("btnDaily") as HTMLButtonElement).disabled,
      "un essai consommé sur trois : on doit pouvoir rejouer",
    ).toBe(false);
    // Et l'écran DIT combien il en reste — sans ça, le joueur ne peut pas le
    // savoir, et un bouton actif après un run se lit comme un bug.
    expect(document.getElementById("cardDailyState")!.textContent).toMatch(/2/);
  });
});
