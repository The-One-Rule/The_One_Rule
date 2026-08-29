/**
 * Les tuiles du salon.
 *
 * Une tuile ne dit qu'UNE chose sous le nom, et c'est une priorité — donc
 * exactement le genre de code qui se lit juste et se comporte faux. Ce fichier
 * vérifie l'ordre, pas la mise en forme.
 *
 * Le cas qui a motivé l'extraction : la version en lignes concaténait tout
 * (« HÔTE · SPECT. · HORS LIGNE · ♥3 »), ce qui évitait de choisir. Dès qu'on
 * choisit, il faut prouver qu'on choisit bien.
 */
import { describe, expect, it } from "vitest";
import { seatClasses, seatStatus } from "../src/render/seat";
import type { SeatState } from "../src/render/seat";

const etat = (over: Partial<SeatState> = {}): SeatState => ({
  connected: true,
  spectator: false,
  host: false,
  rookie: false,
  lives: 3,
  score: 0,
  inMatch: false,
  isMe: false,
  ...over,
});

describe("mention d'une tuile", () => {
  it("dit PRÊT dans le cas ordinaire", () => {
    expect(seatStatus(etat())).toBe("PRÊT");
  });

  it("une coupure prime sur tout le reste", () => {
    // Le cas qui mord : l'hôte qui perd sa connexion. Afficher « HÔTE »
    // laisserait le salon attendre un lancement qui ne viendra pas.
    expect(seatStatus(etat({ connected: false, host: true, inMatch: true }))).toBe("HORS LIGNE");
  });

  it("le spectateur prime sur le match : il ne joue pas, ses vies ne veulent rien dire", () => {
    expect(seatStatus(etat({ spectator: true, inMatch: true, lives: 0 }))).toBe("SPECTATEUR");
  });

  it("en match, la mention porte ce qui bouge — vies et manches", () => {
    expect(seatStatus(etat({ inMatch: true, host: true, lives: 2, score: 11 }))).toBe(
      "2 VIES · 11 MANCHES",
    );
    // Le singulier compte : « 1 VIES » se remarque et fait douter du reste.
    expect(seatStatus(etat({ inMatch: true, lives: 1, score: 4 }))).toBe("1 VIE · 4 MANCHES");
  });

  it("hors match, l'hôte prime sur le débutant", () => {
    // Les deux sont vrais en même temps quand quelqu'un crée son premier
    // salon. C'est « qui lance » qu'on cherche à ce moment-là.
    expect(seatStatus(etat({ host: true, rookie: true }))).toBe("HÔTE");
    expect(seatStatus(etat({ rookie: true }))).toBe("1RE PARTIE · +1 VIE");
  });
});

describe("classes d'une tuile", () => {
  it("les états se CUMULENT, contrairement à la mention", () => {
    // Être l'hôte et être moi sont deux faits simultanés : l'écran doit dire
    // les deux, sinon je ne me retrouve pas dans une grille de dix.
    const c = seatClasses(etat({ host: true, isMe: true }));
    expect(c).toContain("is-host");
    expect(c).toContain("is-me");
  });

  it("le débutant ne se teinte que HORS match", () => {
    // Pendant une partie, la mention porte les vies : l'accent y désignerait
    // la mauvaise information.
    expect(seatClasses(etat({ rookie: true }))).toContain("is-rookie");
    expect(seatClasses(etat({ rookie: true, inMatch: true }))).not.toContain("is-rookie");
  });

  it("une coupure s'ajoute au rôle, elle ne l'efface pas", () => {
    const c = seatClasses(etat({ host: true, connected: false }));
    expect(c).toContain("is-off");
    expect(c).toContain("is-host");
  });
});
