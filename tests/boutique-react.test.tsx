/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Boutique } from "../src/features/boutique/Boutique";
import { effetsBoutiqueMuets } from "../src/features/boutique/effets";
import type { EffetsBoutique } from "../src/features/boutique/effets";
import * as P from "../src/game/progress";

function effets(partiel: Partial<EffetsBoutique> = {}): EffetsBoutique {
  return { ...effetsBoutiqueMuets, ...partiel };
}

describe("boutique en React", () => {
  it("main.ts ne touche plus au DOM de la boutique", () => {
    const src = readFileSync("src/main.ts", "utf8");
    for (const id of ["boutiquePieces", "skins", "btnBoutiqueRetour"]) {
      expect(src.includes(`"${id}"`), id).toBe(false);
    }
  });

  it("un achat sans assez de pièces affiche l'échec et ne débite rien", () => {
    P.mutate((s) => {
      s.coins = 150;
      s.boutique = { possedes: ["sticker"], porte: "sticker" };
    });
    const hote = document.createElement("div");
    document.body.appendChild(hote);
    const root = createRoot(hote);
    flushSync(() => root.render(<Boutique effets={effets()} />));
    P.mutate((s) => {
      s.coins = 0;
    });
    const bouton = Array.from(hote.querySelectorAll("button")).find((b) => b.classList.contains("btn--primary"));
    expect(bouton, "le bouton d'achat").toBeTruthy();
    act(() => bouton!.click());
    expect(hote.querySelector("#boutiqueErr")).not.toBeNull();
    expect(P.load().coins).toBe(0);
    expect(P.load().boutique.possedes).toEqual(["sticker"]);
    flushSync(() => root.unmount());
  });

  it("démonter retire la grille", () => {
    const hote = document.createElement("div");
    const root = createRoot(hote);
    flushSync(() => root.render(<Boutique effets={effets()} />));
    expect(hote.querySelector("#skins")).not.toBeNull();
    flushSync(() => root.render(null));
    expect(hote.querySelector("#skins")).toBeNull();
  });
});
