/**
 * @vitest-environment jsdom
 *
 * PHASE 4, POINT 28 — LE HUD N'ÉCRIT QUE CE QUI CHANGE.
 *
 * La boucle appelle le pied et le bandeau à CHAQUE image. Ils réécrivaient
 * leurs textes et leurs classes à l'identique, et chaque réécriture invalide
 * les styles et force une mise en page : mesuré en partie au téléphone ×4,
 * un recalcul de styles et une mise en page COMPLÈTE à chaque image, 30
 * images/s. Après : 11 à 23 mises en page en 12 s, 60 images/s au p50.
 *
 * Un `MutationObserver` compte ce que le DOM reçoit : le second appel, avec
 * les mêmes valeurs, ne doit en produire AUCUNE.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Round } from "../src/engine/types";
import { pageHtml } from "./helpers/page";

beforeAll(() => {
  const html = pageHtml();
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
});

/** Les mutations produites par `f`, après que la file a été vidée. */
async function mutations(f: () => void): Promise<string[]> {
  const vues: string[] = [];
  const mo = new MutationObserver((l) => {
    for (const m of l) vues.push(`${m.type} ${m.attributeName ?? ""} #${(m.target as Element).id ?? ""}`);
  });
  mo.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true });
  f();
  await Promise.resolve();
  for (const m of mo.takeRecords()) vues.push(`${m.type} ${m.attributeName ?? ""}`);
  mo.disconnect();
  return vues;
}

const manche = { instructionId: "x", text: "CLIQUE LE ROUGE", ents: [], steps: [{ kind: "click", idx: 0 }], trap: false, durationMs: 3000 } as unknown as Round;

describe("le HUD à chaque image", () => {
  it("le pied, réécrit à l'identique, ne touche plus le DOM", async () => {
    const { Hud } = await import("../src/render/hud");
    const hud = new Hud();
    hud.setFooter(3, 12, "ENTRAÎNEMENT");
    expect(await mutations(() => hud.setFooter(3, 12, "ENTRAÎNEMENT"))).toEqual([]);
    hud.setFooterRecord(14, 2, "ENTRAÎNEMENT");
    expect(await mutations(() => hud.setFooterRecord(14, 2, "ENTRAÎNEMENT"))).toEqual([]);
    // Et une valeur qui change s'écrit bien.
    expect(await mutations(() => hud.setFooterRecord(15, 3, "ENTRAÎNEMENT"))).not.toEqual([]);
    expect(document.getElementById("fScore")!.textContent).toBe("15");
  });

  it("la case META du bandeau non plus", async () => {
    const { Hud } = await import("../src/render/hud");
    const hud = new Hud();
    hud.setMeta("3 PIÈGES");
    expect(await mutations(() => hud.setMeta("3 PIÈGES"))).toEqual([]);
    hud.setMeta("");
    expect(await mutations(() => hud.setMeta(""))).toEqual([]);
  });

  it("la consigne d'une même manche non plus", async () => {
    const { Hud } = await import("../src/render/hud");
    const hud = new Hud();
    hud.updateRound(manche, 100, 0.1);
    expect(await mutations(() => hud.updateRound(manche, 100, 0.1))).toEqual([]);
  });
});
