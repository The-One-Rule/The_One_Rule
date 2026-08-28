/**
 * @vitest-environment jsdom
 *
 * Boutons d'option de réglage.
 *
 * Deux propriétés comptent, et aucune ne se voit à la lecture du CSS : la
 * jauge doit dire le rang de l'option (sinon elle décore), et l'animation ne
 * doit se déclencher QUE sur un changement de sélection (sinon un salon qui se
 * repeint à chaque message la rejoue en boucle).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fillOptions, optionButton } from "../src/render/option";
import type { OptionSpec } from "../src/render/option";

const spec = (over: Partial<OptionSpec> = {}): OptionSpec => ({
  value: "1",
  label: "NORMAL",
  level: 2,
  steps: 3,
  icon: "bars",
  selected: false,
  ...over,
});

const trois = (choisie: string): OptionSpec[] =>
  ["1.5", "1", "0.8"].map((v, i) =>
    spec({ value: v, label: v, level: i + 1, steps: 3, selected: v === choisie }),
  );

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "<div id='h'></div>";
  host = document.getElementById("h")!;
});

describe("bouton d'option", () => {
  it("allume autant de repères que le rang de l'option", () => {
    const btn = optionButton(spec({ level: 2, steps: 5 }));
    const marks = btn.querySelectorAll(".opt__marks i");
    expect(marks.length).toBe(5);
    expect(btn.querySelectorAll(".opt__marks i.is-on").length).toBe(2);
  });

  it("porte l'état de sélection pour l'œil ET pour un lecteur d'écran", () => {
    const on = optionButton(spec({ selected: true, aria: "Vitesse normale" }));
    expect(on.classList.contains("is-on")).toBe(true);
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(on.getAttribute("aria-label")).toBe("Vitesse normale");

    const off = optionButton(spec({ selected: false }));
    expect(off.classList.contains("is-on")).toBe(false);
    expect(off.getAttribute("aria-pressed")).toBe("false");
  });

  it("transporte sa valeur et son verrouillage", () => {
    const btn = optionButton(spec({ value: "0.65", disabled: true }));
    expect(btn.dataset.value).toBe("0.65");
    expect(btn.disabled).toBe(true);
    expect(btn.type).toBe("button");
  });
});

describe("groupe d'options", () => {
  it("n'anime rien au premier affichage", () => {
    // Personne n'a encore rien choisi : animer désignerait un geste qui n'a
    // pas eu lieu.
    fillOptions(host, trois("1"));
    expect(host.querySelectorAll(".is-fresh").length).toBe(0);
  });

  it("n'anime rien quand la sélection ne bouge pas", () => {
    // Le cas qui mord : le salon se repeint à chaque message du serveur.
    fillOptions(host, trois("1"));
    fillOptions(host, trois("1"));
    fillOptions(host, trois("1"));
    expect(host.querySelectorAll(".is-fresh").length).toBe(0);
  });

  it("anime la seule option qui vient de prendre la sélection", () => {
    fillOptions(host, trois("1"));
    fillOptions(host, trois("0.8"));
    const fresh = host.querySelectorAll(".is-fresh");
    expect(fresh.length).toBe(1);
    expect((fresh[0] as HTMLElement).dataset.value).toBe("0.8");
    expect(fresh[0]!.classList.contains("is-on")).toBe(true);
  });

  it("oublie la sélection quand le groupe n'en porte plus", () => {
    fillOptions(host, trois("1"));
    fillOptions(
      host,
      trois("1").map((s) => ({ ...s, selected: false })),
    );
    expect(host.dataset.on).toBeUndefined();
    // Et le retour d'une sélection après un groupe sans choix n'anime pas
    // davantage : il n'y avait rien à remplacer.
    fillOptions(host, trois("1"));
    expect(host.querySelectorAll(".is-fresh").length).toBe(0);
  });
});
