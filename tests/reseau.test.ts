import { describe, expect, it } from "vitest";
import { DELAI_APPEL_MS, avecDelai } from "../src/reseau";

describe("délai des appels client", () => {
  it("pose un signal d'abandon", () => {
    const init = avecDelai({ method: "POST" });
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it("ne remplace pas un signal déjà choisi", () => {
    const ctrl = new AbortController();
    const init = avecDelai({ signal: ctrl.signal });
    expect(init.signal).toBe(ctrl.signal);
  });

  it("borne le délai par défaut à cinq secondes", () => {
    expect(DELAI_APPEL_MS).toBe(5_000);
  });
});
