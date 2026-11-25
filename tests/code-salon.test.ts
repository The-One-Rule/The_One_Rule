import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, codeSalon } from "../server/code";

describe("code de salon", () => {
  it("fait quatre signes de l'alphabet dictable", () => {
    const code = codeSalon(() => 0, () => false);
    expect(code).toHaveLength(4);
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    expect(code).toBe("AAAA");
  });

  it("saute un code déjà pris", () => {
    let n = 0;
    const code = codeSalon(
      () => n++,
      (c) => c === "AAAA",
    );
    expect(code).not.toBe("AAAA");
    expect(code).toHaveLength(4);
  });

  it("échoue nettement quand tout est pris", () => {
    expect(() => codeSalon(() => 0, () => true)).toThrow(/codes disponibles/);
  });
});
