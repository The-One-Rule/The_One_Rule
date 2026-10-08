/**
 * Les limites de débit du serveur de salons (`server/debit.ts`).
 *
 * Ce qui compte : aucun JOUEUR ne les touche, et un SCRIPT y bute tout de
 * suite. Le débit légitime le plus haut est celui des curseurs du coop.
 */
import { describe, expect, it } from "vitest";
import {
  adresseDe,
  ECHECS_JOIN_FENETRE_MS,
  ECHECS_JOIN_MAX,
  EchecsParAdresse,
  SEAU_CAPACITE,
  SEAU_PAR_SECONDE,
  Seau,
} from "../server/debit";
import { CURSOR_COOLDOWN_MS } from "../shared/protocol";

describe("le seau d'une socket", () => {
  it("un joueur de coop au débit maximal ne perd JAMAIS un message", () => {
    const s = new Seau(SEAU_CAPACITE, SEAU_PAR_SECONDE, 0);
    // Curseurs à leur cadence plafond, plus un ping par seconde et trois
    // entrées par seconde : dix minutes de jeu.
    for (let t = 0; t < 600_000; t += CURSOR_COOLDOWN_MS) {
      expect(s.prend(t), `curseur à ${t} ms`).toBe(true);
      if (t % 1000 === 0) expect(s.prend(t)).toBe(true);
      if (t % 1000 < 150) expect(s.prend(t)).toBe(true);
    }
  });

  it("une rafale passe sa réserve, puis le débit est plafonné", () => {
    const s = new Seau(SEAU_CAPACITE, SEAU_PAR_SECONDE, 0);
    let passes = 0;
    for (let i = 0; i < 1000; i++) if (s.prend(0)) passes++;
    expect(passes).toBe(SEAU_CAPACITE);
    // Une seconde de rafale continue : pas plus que le débit accordé.
    passes = 0;
    for (let t = 1; t <= 1000; t++) for (let k = 0; k < 10; k++) if (s.prend(t)) passes++;
    expect(passes).toBeLessThanOrEqual(SEAU_PAR_SECONDE + 1);
  });

  it("une horloge qui recule ne crée pas de jetons", () => {
    const s = new Seau(2, 1, 10_000);
    s.prend(10_000);
    s.prend(10_000);
    expect(s.prend(5_000)).toBe(false);
  });
});

describe("les échecs de join par adresse", () => {
  it("un joueur qui se trompe trois fois n'est jamais bloqué", () => {
    const e = new EchecsParAdresse();
    for (let i = 0; i < 3; i++) e.note("1.2.3.4", i * 1000);
    expect(e.bloquee("1.2.3.4", 3000)).toBe(false);
  });

  it("au-delà du maximum dans la fenêtre, l'adresse est bloquée — et elle seule", () => {
    const e = new EchecsParAdresse();
    for (let i = 0; i < ECHECS_JOIN_MAX; i++) e.note("6.6.6.6", i);
    expect(e.bloquee("6.6.6.6", ECHECS_JOIN_MAX)).toBe(true);
    expect(e.bloquee("1.2.3.4", ECHECS_JOIN_MAX)).toBe(false);
  });

  it("la fenêtre glisse : une minute plus tard, l'adresse respire, et la table se vide", () => {
    const e = new EchecsParAdresse();
    for (let i = 0; i < ECHECS_JOIN_MAX; i++) e.note("6.6.6.6", 0);
    expect(e.bloquee("6.6.6.6", ECHECS_JOIN_FENETRE_MS + 1)).toBe(false);
    expect(e.taille).toBe(0);
  });

  it("balayer l'espace des codes devient hors de portée", () => {
    // 31⁴ codes à ECHECS_JOIN_MAX par minute : plus d'un mois par adresse.
    const jours = 31 ** 4 / ECHECS_JOIN_MAX / 60 / 24;
    expect(jours).toBeGreaterThan(30);
  });
});

describe("l'adresse du joueur", () => {
  it("derrière Fly, l'en-tête du proxy ; ailleurs, la socket", () => {
    expect(adresseDe({ "fly-client-ip": "9.9.9.9" }, "10.0.0.1")).toBe("9.9.9.9");
    expect(adresseDe({}, "10.0.0.1")).toBe("10.0.0.1");
    expect(adresseDe({ "fly-client-ip": ["8.8.8.8", "x"] }, undefined)).toBe("8.8.8.8");
    expect(adresseDe({}, undefined)).toBe("?");
  });
});
