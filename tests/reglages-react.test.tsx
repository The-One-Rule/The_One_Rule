/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Reglages } from "../src/features/reglages/Reglages";
import { effetsMuets } from "../src/features/reglages/effets";
import type { EffetsReglages } from "../src/features/reglages/effets";
import { ecranCourant, montre, reinitialiseNav, surEcran } from "../src/nav";
import * as P from "../src/game/progress";

function effets(partiel: Partial<EffetsReglages> = {}): EffetsReglages {
  return { ...effetsMuets, ...partiel };
}

afterEach(() => {
  document.body.innerHTML = "";
  reinitialiseNav("home");
});

describe("réglages en React", () => {
  it("main.ts ne touche plus au DOM de cet écran", () => {
    const src = readFileSync("src/main.ts", "utf8");
    for (const id of ["btnSound", "btnMusic", "btnMotifs", "btnMetrics", "btnPhotosAutres", "btnLangFr", "btnReglagesBack", "rglTheme", "rglAllure"]) {
      expect(src.includes(`"${id}"`), id).toBe(false);
    }
  });

  it("basculer le son demande l'effet et se réaffiche", () => {
    P.mutate((s) => {
      s.sound = true;
    });
    const vus: boolean[] = [];
    const hote = document.createElement("div");
    document.body.appendChild(hote);
    flushSync(() => {
      createRoot(hote).render(<Reglages effets={effets({ son: (on) => vus.push(on) })} />);
    });
    const bouton = hote.querySelector<HTMLButtonElement>("#btnSound")!;
    expect(bouton.getAttribute("aria-checked")).toBe("true");
    bouton.click();
    expect(vus).toEqual([false]);
  });

  it("démonter retire le bouton, donc ses écouteurs", () => {
    const hote = document.createElement("div");
    document.body.appendChild(hote);
    const root = createRoot(hote);
    flushSync(() => root.render(<Reglages effets={effets()} />));
    expect(hote.querySelector("#btnMusic")).not.toBeNull();
    flushSync(() => root.render(null));
    expect(hote.querySelector("#btnMusic")).toBeNull();
  });
});

describe("navigation", () => {
  it("un seul endroit pose hidden, et l'abonné est retiré", () => {
    document.body.innerHTML = `<section id="home"></section><section id="reglages" class="hidden"></section>`;
    const vus: Array<string | null> = [];
    const stop = surEcran((id) => vus.push(id));
    montre("reglages");
    expect(ecranCourant()).toBe("reglages");
    expect(document.getElementById("reglages")!.classList.contains("hidden")).toBe(false);
    expect(document.getElementById("home")!.classList.contains("hidden")).toBe(true);
    stop();
    montre("home");
    expect(vus).toEqual(["reglages"]);
  });
});
