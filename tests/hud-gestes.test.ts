/**
 * @vitest-environment jsdom
 *
 * La ligne des gestes sous la consigne.
 *
 * Vu en jouant le niveau 1-1 au téléphone : après « CLIQUE LE ROUGE · 1 GESTE »,
 * la manche suivante « NE FAIS RIEN » gardait « 1 GESTE ». La clé de repeinture
 * portait le compte CALCULÉ au lieu du compte PEINT — identique d'une manche à
 * l'autre, donc rien n'était repeint. Une consigne d'agir sur la seule manche
 * où il faut s'abstenir.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Round } from "../src/engine/types";
import { pageHtml } from "./helpers/page";

beforeAll(() => {
  const html = pageHtml();
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
});

const manche = (text: string, steps: Round["steps"]): Round =>
  ({ instructionId: "x", text, ents: [], steps, trap: false, durationMs: 3000 }) as Round;

describe("la ligne des gestes", () => {
  it("se VIDE quand la manche suivante n'a aucun geste", async () => {
    const { Hud } = await import("../src/render/hud");
    const hud = new Hud();
    const sub = () => document.getElementById("sub")!.textContent ?? "";
    hud.updateRound(manche("CLIQUE LE ROUGE", [{ kind: "click", idx: 0 }]), 0, 0);
    expect(sub()).toMatch(/1/);
    hud.updateRound(manche("NE FAIS RIEN", []), 0, 0);
    expect(sub()).not.toMatch(/GESTE|MOVE/);
  });
});
