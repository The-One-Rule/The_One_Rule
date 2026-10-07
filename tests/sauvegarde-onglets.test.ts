/**
 * @vitest-environment jsdom
 *
 * DEUX ONGLETS, UNE SAUVEGARDE — audit C2.
 *
 * `load` sert une copie en mémoire, et `mutate` réécrit tout depuis elle.
 * Sans suivre l'événement `storage`, un onglet resté ouvert écrasait ce que
 * l'autre venait d'écrire, et rendait les essais du jour déjà joués.
 *
 * DENTS : retirer l'écouteur `storage` de `progress.ts` fait tomber les deux
 * tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "oneRule.save.v1";

/** Ce que fait l'AUTRE onglet : écrire, puis le navigateur nous prévient. */
function autreOngletEcrit(muter: (s: Record<string, unknown>) => void): void {
  const s = JSON.parse(localStorage.getItem(KEY)!) as Record<string, unknown>;
  muter(s);
  const valeur = JSON.stringify(s);
  localStorage.setItem(KEY, valeur);
  window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: valeur }));
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("la sauvegarde suit les autres onglets", () => {
  it("⚠️ une écriture ailleurs n'est pas écrasée par notre prochaine écriture", async () => {
    const P = await import("../src/game/progress");
    P.mutate((s) => (s.coins = 10)); // notre onglet, avant
    autreOngletEcrit((s) => (s.coins = 250)); // l'autre gagne 240 pièces
    P.mutate((s) => (s.coins += 5)); // notre onglet écrit à nouveau
    expect(P.load().coins, "nos 15 ont effacé les 250 de l'autre onglet").toBe(255);
  });

  it("⚠️ les essais du jour joués dans un autre onglet ne sont pas rendus", async () => {
    const P = await import("../src/game/progress");
    P.mutate((s) => (s.daily = { ...s.daily, day: 280, essais: 0 }));
    autreOngletEcrit((s) => ((s.daily as Record<string, unknown>).essais = 3));
    expect((P.load().daily as { essais?: number }).essais).toBe(3);
  });
});
