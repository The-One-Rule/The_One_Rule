/**
 * Le second canal doit VRAIMENT distinguer.
 *
 * Un mode daltonien qui donne deux trames semblables à deux couleurs qui se
 * confondent ne corrige rien — il ajoute du bruit et laisse croire au joueur
 * que le problème est réglé. C'est pire que pas de mode du tout, parce que
 * plus personne ne va vérifier.
 *
 * Ce fichier ne teste pas le dessin, qui n'est pas pur. Il teste la seule
 * chose qui décide de tout : l'attribution des motifs aux couleurs.
 */
import { describe, expect, it } from "vitest";
import {
  ENCRE_CLAIRE,
  ENCRE_SOMBRE,
  MOTIFS,
  clarteDeuteranope,
  distincts,
  encrePour,
} from "../src/render/motif";
import { COLOR_IDS } from "../src/engine/types";

describe("motifs du mode daltonien", () => {
  it("couvre exactement les couleurs du jeu", () => {
    // Une couleur ajoutée au moteur sans motif serait rendue en aplat : elle
    // redeviendrait indistinguable, en silence.
    expect(Object.keys(MOTIFS).sort()).toEqual([...COLOR_IDS].sort());
  });

  it("distingue les deux couleurs qui se confondent le plus", () => {
    // Garance et jade : la collision rouge-vert, ~6 % des hommes. Ce sont les
    // deux couleurs qui portent LE SANG et le couple vie/mort.
    expect(distincts(MOTIFS.garance, MOTIFS.jade)).toBe(true);
    // Azur et ambre : la collision bleu-jaune, plus rare mais réelle.
    expect(distincts(MOTIFS.azur, MOTIFS.ambre)).toBe(true);
  });

  it("distingue TOUTES les paires, pas seulement celles auxquelles on a pensé", () => {
    const ids = [...COLOR_IDS];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        expect(distincts(MOTIFS[a], MOTIFS[b]), `${a} et ${b} se ressemblent`).toBe(true);
      }
    }
  });
});

describe("le choix de l'encre", () => {
  const RGB: Record<string, number[]> = {
    garance: [247, 64, 88],
    azur: [35, 126, 246],
    jade: [64, 247, 192],
    ambre: [245, 178, 20],
  };

  it("juge sur la clarté PERÇUE, pas sur celle de la vision normale", () => {
    // Le piège qui m'a fait choisir la mauvaise encre au premier essai.
    // La garance a une clarté de 105 en vision normale — « sombre », donc on
    // l'éclaircirait. Mais un deutéranope la perçoit CLAIRE, à 181 : c'est
    // l'encre sombre qui y creuse l'écart. Décider sur la vision normale,
    // c'est optimiser pour l'œil que ce mode ne sert pas.
    const normale = 0.2126 * 247 + 0.7152 * 64 + 0.0722 * 88;
    expect(Math.round(normale)).toBe(105);
    expect(Math.round(clarteDeuteranope(RGB.garance!))).toBeGreaterThan(170);
    expect(encrePour(RGB.garance!)).toBe(ENCRE_SOMBRE);
  });

  it("éclaircit l'azur, qui reste sombre même perçu", () => {
    // Mesuré : encre sombre partout donnait 12,7 d'écart-type sur l'azur
    // contre 28 à 33 ailleurs. L'encre claire l'a porté à 30,1.
    expect(encrePour(RGB.azur!)).toBe(ENCRE_CLAIRE);
  });

  it("chaque couleur gagne un écart réel, quelle que soit l'encre retenue", () => {
    // La propriété qui compte vraiment : peu importe LAQUELLE est choisie,
    // il faut qu'elle creuse. Une encre qui ne change presque rien laisserait
    // une couleur sans second canal — en silence.
    for (const [nom, rgb] of Object.entries(RGB)) {
      const e = encrePour(rgb);
      const mix = rgb.map((v, i) => v * (1 - e.alpha) + e.rgb[i]! * e.alpha);
      const ecart = Math.abs(clarteDeuteranope(mix) - clarteDeuteranope(rgb));
      expect(ecart, `${nom} : la trame ne creuse que ${ecart.toFixed(0)}`).toBeGreaterThan(30);
    }
  });
});

describe("le critère de distinction", () => {
  it("refuse deux trames obliques trop proches", () => {
    // Le cas qui mord : deux hachures à 15° d'écart passent pour identiques en
    // 200 ms. Sans ce refus, on pourrait « couvrir » quatre couleurs avec
    // quatre angles voisins et croire le travail fait.
    expect(distincts({ kind: "hachures", angle: 0 }, { kind: "hachures", angle: 15 })).toBe(false);
    expect(distincts({ kind: "hachures", angle: 0 }, { kind: "hachures", angle: 45 })).toBe(true);
  });

  it("traite l'angle modulo 180 : une hachure n'a pas de sens", () => {
    // Une trame à 10° et une à 190° sont le MÊME dessin. Comparer les angles
    // bruts les déclarerait distinctes.
    expect(distincts({ kind: "hachures", angle: 10 }, { kind: "hachures", angle: 190 })).toBe(false);
    // Et -45 / +45 font bien 90° d'écart, pas 0.
    expect(distincts({ kind: "hachures", angle: -45 }, { kind: "hachures", angle: 45 })).toBe(true);
  });

  it("deux semis de points ne se distinguent jamais", () => {
    // Ils n'ont pas d'orientation : leur donner des angles différents ne
    // changerait rien à l'écran.
    expect(distincts({ kind: "points", angle: 0 }, { kind: "points", angle: 90 })).toBe(false);
  });

  it("des natures différentes se distinguent toujours", () => {
    expect(distincts({ kind: "points", angle: 0 }, { kind: "barres", angle: 0 })).toBe(true);
  });
});
