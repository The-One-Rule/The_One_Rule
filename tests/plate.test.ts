/**
 * Plaques de joueur — ce qu'on EST n'efface pas ce qu'on vient de FAIRE.
 *
 * Rapporté en playtest : « quand les autres valident, leurs icônes ne sont pas
 * toutes vertes ». La cause était une chaîne de `else if` où le statut de
 * débutant passait avant le verdict de la manche.
 */
import { describe, expect, it } from "vitest";
import { plateClasses } from "../src/render/plate";
import type { PlateState } from "../src/render/plate";

const etat = (over: Partial<PlateState> = {}): PlateState => ({
  isMe: false,
  lives: 3,
  rookie: false,
  pulse: null,
  inRound: true,
  ...over,
});

describe("classes de plaque", () => {
  it("montre le verdict d'un joueur qui joue sa première partie", () => {
    // LE bug : le liseré de débutant remplaçait le vert de la réussite.
    const c = plateClasses(etat({ rookie: true, pulse: "ok" }));
    expect(c).toContain("plate--ok");
    expect(c).toContain("plate--rookie");
  });

  it("montre le verdict quel que soit l'état durable du joueur", () => {
    for (const pulse of ["ok", "trap", "dead"] as const) {
      for (const durable of [{ rookie: true }, { isMe: true }, { lives: 0 }]) {
        const c = plateClasses(etat({ ...durable, pulse }));
        expect(c, `${pulse} avec ${JSON.stringify(durable)}`).toContain(`plate--${pulse}`);
      }
    }
  });

  it("garde le liseré de débutant tant qu'aucun verdict n'est affiché", () => {
    const c = plateClasses(etat({ rookie: true }));
    expect(c).toContain("plate--rookie");
    // `--live` poserait une deuxième bordure par-dessus la première.
    expect(c).not.toContain("plate--live");
  });

  it("n'annonce pas « en jeu » une plaque déjà éliminée", () => {
    const c = plateClasses(etat({ lives: 0 }));
    expect(c).toContain("plate--out");
    expect(c).not.toContain("plate--live");
  });

  it("marque « en jeu » pendant une manche, et rien entre deux manches", () => {
    expect(plateClasses(etat({ inRound: true }))).toContain("plate--live");
    expect(plateClasses(etat({ inRound: false }))).not.toContain("plate--live");
  });

  it("distingue toujours ma propre plaque", () => {
    expect(plateClasses(etat({ isMe: true, pulse: "dead" }))).toContain("plate--me");
  });
});
