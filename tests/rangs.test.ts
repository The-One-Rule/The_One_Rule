import { describe, expect, it } from "vitest";
import { classeMatch } from "../src/render/rangs";

const j = (id: string, lives: number, score: number, spectator = false) => ({ id, lives, score, spectator });

describe("le classement d'une fin de match", () => {
  it("trois ex æquo PARTAGENT la première place — c'était 1er, 2e, 3e", () => {
    const r = classeMatch([j("a", 4, 60), j("b", 4, 60), j("c", 4, 60)], null);
    expect(r.map((x) => x.rang)).toEqual([1, 1, 1]);
    expect(r.every((x) => x.exAequo)).toBe(true);
  });

  it("le vainqueur du serveur passe devant, même à vies égales", () => {
    const r = classeMatch([j("a", 1, 10), j("b", 1, 10)], "b");
    expect(r[0]!.joueur.id).toBe("b");
    expect(r[0]!.rang).toBe(1);
    expect(r[1]!.rang).toBe(2);
    expect(r[0]!.exAequo).toBe(false);
  });

  it("un rang se compte : deux devant, puis le troisième est 3e", () => {
    const r = classeMatch([j("a", 3, 20), j("b", 3, 20), j("c", 0, 12), j("d", 0, 9)], null);
    expect(r.map((x) => [x.joueur.id, x.rang])).toEqual([["a", 1], ["b", 1], ["c", 3], ["d", 4]]);
  });

  it("les spectateurs ne sont pas classés", () => {
    const r = classeMatch([j("a", 3, 5), j("s", 9, 99, true)], null);
    expect(r.map((x) => x.joueur.id)).toEqual(["a"]);
  });
});
