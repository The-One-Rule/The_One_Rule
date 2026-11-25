import { describe, expect, it } from "vitest";
import { decodeClient, valideClient } from "../shared/protocol";

const TYPES = [
  "hello",
  "create",
  "join",
  "quick",
  "leave",
  "start",
  "settings",
  "watch",
  "emote",
  "cursor",
  "chat",
  "kick",
  "ping",
  "profil",
  "vote",
  "input",
] as const;

describe("validation des messages client", () => {
  it("accepte un message minimal de chaque type connu", () => {
    const ok = [
      valideClient({ t: "hello", v: 1, name: "ADA" }),
      valideClient({ t: "create" }),
      valideClient({ t: "join", code: "abcd" }),
      valideClient({ t: "quick" }),
      valideClient({ t: "leave" }),
      valideClient({ t: "start" }),
      valideClient({ t: "settings", settings: { lives: 1 } }),
      valideClient({ t: "watch", playerId: "abc" }),
      valideClient({ t: "emote", k: 0 }),
      valideClient({ t: "cursor", x: 1, y: 2 }),
      valideClient({ t: "chat", text: "salut" }),
      valideClient({ t: "kick", playerId: "abc" }),
      valideClient({ t: "ping", sent: 10 }),
      valideClient({ t: "profil", carte: "sang" }),
      valideClient({ t: "vote", playerId: "abc" }),
      valideClient({ t: "input", round: 0, at: 10, action: { k: "c", i: 1 } }),
    ];
    expect(ok.every((m) => m !== null)).toBe(true);
    expect(new Set(ok.map((m) => m?.t)).size).toBe(TYPES.length);
  });

  it("rejette le JSON invalide, un type inconnu et un tableau", () => {
    expect(decodeClient("{")).toBeNull();
    expect(decodeClient("null")).toBeNull();
    expect(decodeClient("[]")).toBeNull();
    expect(valideClient({ t: "inconnu" })).toBeNull();
    expect(valideClient({ t: "" })).toBeNull();
    expect(valideClient(null)).toBeNull();
  });

  it("enlève les clés inattendues sans refuser le message", () => {
    const m = valideClient({ t: "leave", pirate: true, extra: "x" });
    expect(m).toEqual({ t: "leave" });
  });

  it("rejette un input dont l'action n'a pas de sens", () => {
    expect(valideClient({ t: "input", round: 0, at: 0 })).toBeNull();
    expect(valideClient({ t: "input", round: 0, at: 0, action: { k: "c", i: "__proto__" } })).toBeNull();
    expect(valideClient({ t: "input", round: 0, at: 0, action: { k: "z" } })).toBeNull();
    expect(valideClient({ t: "input", round: 1.5, at: 0, action: { k: "c", i: 0 } })).toBeNull();
  });

  it("garde un index entier, même grand, et une touche vide", () => {
    expect(valideClient({ t: "input", round: 0, at: 0, action: { k: "c", i: 1e9 } })).toEqual({
      t: "input",
      round: 0,
      at: 0,
      action: { k: "c", i: 1e9 },
    });
    expect(valideClient({ t: "input", round: 0, at: 0, action: { k: "k" } })).toEqual({
      t: "input",
      round: 0,
      at: 0,
      action: { k: "k", key: "" },
    });
  });

  it("ne laisse pas un booléen devenir une emote ou un chat", () => {
    expect(valideClient({ t: "emote", k: true })).toBeNull();
    expect(valideClient({ t: "chat", text: true })).toBeNull();
    expect(valideClient({ t: "ping", sent: "1" })).toBeNull();
    expect(valideClient({ t: "cursor", x: true, y: 1 })).toBeNull();
  });

  it("un hello hostile garde la version et ne ferme pas pour un nom nul", () => {
    const m = valideClient({ t: "hello", v: 1, name: null, rookie: "oui" });
    expect(m).toMatchObject({ t: "hello", v: 1, name: "", rookie: false });
  });

  it("une charge invalide ne change pas l'état", () => {
    let vies = 3;
    const recoit = (brut: unknown): void => {
      const msg = typeof brut === "string" ? decodeClient(brut) : valideClient(brut);
      if (!msg) return;
      if (msg.t === "emote") vies -= 1;
    };
    recoit("{");
    recoit({ t: "emote", k: true });
    recoit({ t: "emote", k: 99 });
    recoit({ t: "input", action: { k: "c", i: "x" } });
    expect(vies).toBe(3);
    recoit({ t: "emote", k: 1 });
    expect(vies).toBe(2);
  });
});
