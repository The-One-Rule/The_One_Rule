import { describe, expect, it, vi } from "vitest";
import { Analytics } from "../src/analytics";
import type { TrackedEvent, Transport } from "../src/analytics";

function harness(enabled = true) {
  const sent: Array<{ id: string; day: number; batch: TrackedEvent[] }> = [];
  const transport: Transport = { send: (p) => void sent.push(p) };
  const a = new Analytics({ id: "abc123", day: 42, enabled, transport, now: () => 1000 });
  return { a, sent, flat: () => sent.flatMap((s) => s.batch) };
}

describe("mesure", () => {
  it("regroupe les événements plutôt que d'envoyer à chaque fois", () => {
    const { a, sent } = harness();
    a.track("run_start", { mode: "daily" });
    a.track("run_end", { score: 12 });
    expect(sent).toHaveLength(0);
    a.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.batch).toHaveLength(2);
  });

  it("vide la file automatiquement quand elle est pleine", () => {
    const { a, sent } = harness();
    for (let i = 0; i < 20; i++) a.track("run_end", { score: i });
    expect(sent).toHaveLength(1);
    expect(a.pending).toBe(0);
  });

  it("n'envoie rien quand le joueur a refusé", () => {
    const { a, sent } = harness(false);
    a.track("first_open");
    a.track("run_end", { score: 3 });
    a.flush();
    expect(sent).toHaveLength(0);
  });

  it("envoie ce qui restait avant de se taire définitivement", () => {
    const { a, flat } = harness(true);
    a.track("run_end", { score: 9 });
    a.setEnabled(false);
    a.track("run_end", { score: 10 });
    a.flush();
    const evs = flat();
    expect(evs).toHaveLength(1);
    expect(evs[0]!.score).toBe(9);
  });

  it("joint l'identifiant anonyme et le jour à chaque envoi", () => {
    const { a, sent } = harness();
    a.track("share");
    a.flush();
    expect(sent[0]!.id).toBe("abc123");
    expect(sent[0]!.day).toBe(42);
  });

  it("ne casse jamais le jeu si le transport échoue", () => {
    const a = new Analytics({
      id: "x",
      day: 1,
      enabled: true,
      now: () => 0,
      transport: {
        send() {
          throw new Error("collecteur injoignable");
        },
      },
    });
    a.track("run_end", { score: 1 });
    expect(() => a.flush()).not.toThrow();
    expect(a.pending).toBe(0);
  });

  it("ne fait rien du tout sans endpoint configuré", () => {
    const a = new Analytics({ id: "x", day: 1, enabled: true, now: () => 0 });
    a.track("first_open");
    expect(a.pending).toBe(0);
    expect(() => a.flush()).not.toThrow();
  });

  it("purge le minuteur au vidage, sans envoi vide", () => {
    vi.useFakeTimers();
    const { a, sent } = harness();
    a.track("run_start");
    a.flush();
    vi.advanceTimersByTime(10_000);
    expect(sent).toHaveLength(1);
    vi.useRealTimers();
  });
});
