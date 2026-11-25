/**
 * LE TEMPS DE LIRE SA RÈGLE.
 *
 * Rapporté par Pierre : « un nouveau joueur qui lance un entraînement au hasard
 * ne voit plus sa règle s'afficher et est directement jeté dans la fosse aux
 * lions ».
 *
 * L'écran de brief s'affiche pourtant — vérifié dans le navigateur, il est bien
 * là avec le nom de la règle et son explication. Ce qui manquait se mesure
 * ailleurs : **50 ms** entre le clic sur COMMENCER et la première consigne.
 * Le multijoueur donnait déjà 4500 ms pour exactement ça.
 */
import { describe, expect, it } from "vitest";
import { LECTURE_CONNUE_MS, LECTURE_NEUVE_MS, tempsDeLecture } from "../src/game/lecture";
import { ONE_RULES } from "../src/engine/rules";
import type { Save } from "../src/game/progress";

const carnet = (...ids: string[]): Save =>
  ({ encountered: Object.fromEntries(ids.map((i) => [i, { best: 20, cleared: true }])) }) as Save;

const REGLE = ONE_RULES[0]!;
const AUTRE = ONE_RULES[1]!;

describe("le temps de lecture", () => {
  it("une règle JAMAIS rencontrée mérite le temps long", () => {
    expect(tempsDeLecture(REGLE, carnet())).toBe(LECTURE_NEUVE_MS);
  });

  it("une règle déjà au carnet ne demande qu'une mise en position", () => {
    expect(tempsDeLecture(REGLE, carnet(REGLE.id))).toBe(LECTURE_CONNUE_MS);
  });

  it("c'est bien LA règle jouée qui décide, pas une autre du carnet", () => {
    // Sans ça, un joueur qui connaît une seule règle aurait le temps court
    // sur les quinze autres — soit exactement le défaut qu'on corrige, rendu
    // invisible par un carnet qui se remplit.
    expect(tempsDeLecture(REGLE, carnet(AUTRE.id))).toBe(LECTURE_NEUVE_MS);
  });

  it("le temps neuf laisse vraiment lire, le temps connu reste bref", () => {
    /*
     * Les deux bornes qui donnent son sens au dispositif.
     *
     * En bas : la fenêtre de décision la plus large du jeu est de 1500 ms
     * (`windowMs(0)`), et c'est sous elle que meurt un joueur neuf. Un temps de
     * lecture plus court que ça ne serait pas un temps de lecture.
     *
     * En haut : au-delà du compte à rebours du multi, on ferait attendre plus
     * pour une partie solo que pour une partie à dix.
     */
    expect(LECTURE_NEUVE_MS).toBeGreaterThan(1500);
    expect(LECTURE_NEUVE_MS).toBeLessThanOrEqual(4500);
    expect(LECTURE_CONNUE_MS).toBeLessThan(LECTURE_NEUVE_MS);
    expect(LECTURE_CONNUE_MS).toBeGreaterThan(0);
  });
});
