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
import type { SeatState, SeatStatus } from "../src/render/seat";
import { poseLangue, statutSiege } from "../src/i18n";

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
  /*
   * Ce module rend un IDENTIFIANT depuis qu'il est traduit : le salon est
   * précisément l'écran où l'on invite quelqu'un qui ne parle pas la même
   * langue. Le test y gagne — il dit quelle branche a gagné, pas à quoi
   * ressemblait la phrase. Une reformulation ne le casse plus ; une priorité
   * inversée, si.
   */
  it("dit PRÊT dans le cas ordinaire", () => {
    expect(seatStatus(etat())).toEqual({ id: "pret" });
  });

  it("une coupure prime sur tout le reste", () => {
    // Le cas qui mord : l'hôte qui perd sa connexion. Afficher « HÔTE »
    // laisserait le salon attendre un lancement qui ne viendra pas.
    expect(seatStatus(etat({ connected: false, host: true, inMatch: true }))).toEqual({
      id: "horsLigne",
    });
  });

  it("le spectateur prime sur le match : il ne joue pas, ses vies ne veulent rien dire", () => {
    expect(seatStatus(etat({ spectator: true, inMatch: true, lives: 0 }))).toEqual({
      id: "spectateur",
    });
  });

  it("en match, la mention porte ce qui bouge — vies et manches", () => {
    expect(seatStatus(etat({ inMatch: true, host: true, lives: 2, score: 11 }))).toEqual({
      id: "enMatch",
      lives: 2,
      score: 11,
    });
  });

  it("hors match, l'hôte prime sur le débutant", () => {
    // Les deux sont vrais en même temps quand quelqu'un crée son premier
    // salon. C'est « qui lance » qu'on cherche à ce moment-là.
    expect(seatStatus(etat({ host: true, rookie: true }))).toEqual({ id: "hote" });
    expect(seatStatus(etat({ rookie: true }))).toEqual({ id: "debutant" });
  });
});

describe("la mention, écrite", () => {
  /*
   * L'écriture a quitté `seat.ts` mais elle n'a pas disparu : le singulier est
   * toujours un piège (« 1 VIES » se remarque et fait douter du reste), et il
   * est maintenant à écrire DEUX fois, une par langue. C'est exactement le
   * genre de détail qu'une traduction perd en silence.
   */
  it("accorde le singulier dans les deux langues", () => {
    poseLangue("fr");
    expect(statutSiege({ id: "enMatch", lives: 1, score: 4 })).toBe("1 VIE · 4 MANCHES");
    expect(statutSiege({ id: "enMatch", lives: 2, score: 11 })).toBe("2 VIES · 11 MANCHES");
    poseLangue("en");
    expect(statutSiege({ id: "enMatch", lives: 1, score: 4 })).toBe("1 LIFE · 4 ROUNDS");
    expect(statutSiege({ id: "enMatch", lives: 2, score: 11 })).toBe("2 LIVES · 11 ROUNDS");
    poseLangue("fr");
  });

  it("écrit CHAQUE branche dans les deux langues", () => {
    // Une branche sans phrase rendrait une tuile muette — et une tuile muette
    // dans un salon se lit comme un joueur qui n'est pas là.
    const tous: SeatStatus[] = [
      { id: "horsLigne" },
      { id: "spectateur" },
      { id: "hote" },
      { id: "debutant" },
      { id: "pret" },
      { id: "enMatch", lives: 3, score: 0 },
    ];
    for (const lang of ["fr", "en"] as const) {
      poseLangue(lang);
      for (const st of tous) {
        expect(statutSiege(st), `${lang} / ${st.id}`).not.toBe("");
      }
    }
    poseLangue("fr");
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
