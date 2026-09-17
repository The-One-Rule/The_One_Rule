/**
 * LE SALON N'ANNONCE QUE DES PLACES QU'IL A.
 *
 * Rapporte a l'ecran : « 4 / 10 JOUEURS » dans un salon COOP, dont le plafond
 * est 6. Le compteur et la rangee « une place libre » lisaient `MAX_PLAYERS`,
 * qui est le plafond du mode CLASSIQUE. L'hote invitait donc jusqu'a dix, et
 * les joueurs en trop devenaient spectateurs sans que rien ne l'ait annonce.
 *
 * ⚠️ Ce test compare a la MEME source que la borne de lancement. Un chiffre
 * ecrit a la main ici ne prouverait rien : il faudrait qu'il diverge des deux
 * cotes en meme temps pour que le test tombe, ce qui n'arrive jamais.
 */
import { describe, expect, it } from "vitest";
import { placesDuMode } from "../src/multi";
import { COOP_MAX_ASIS, peutLancerCoop } from "../src/engine/coop";
import { IMPOSTEUR_MAX_ASIS, peutLancerImposteur } from "../src/engine/imposteur";
import { MAX_PLAYERS } from "../shared/protocol";
import type { RoomSettings } from "../shared/protocol";

const reglages = (p: Partial<RoomSettings>): RoomSettings =>
  ({ speed: 1, lives: 3, rotationEvery: 8, duo: false, ...p }) as RoomSettings;

describe("les places annoncees sont celles du mode", () => {
  it("chaque mode annonce SON plafond", () => {
    expect(placesDuMode(reglages({ mode: "coop" }))).toBe(COOP_MAX_ASIS);
    expect(placesDuMode(reglages({ mode: "imposteur" }))).toBe(IMPOSTEUR_MAX_ASIS);
    expect(placesDuMode(reglages({ mode: "classique" }))).toBe(MAX_PLAYERS);
    expect(placesDuMode(reglages({ mode: "duo", duo: true }))).toBe(MAX_PLAYERS);
  });

  /*
   * Le vrai invariant : on n'annonce jamais une place ou l'on ne peut pas
   * s'asseoir. C'est ce qui rend le test independant des chiffres eux-memes —
   * changer COOP_MAX_ASIS ne le casse pas, le desaccorder si.
   */
  it("le dernier siege annonce est encore un siege jouable", () => {
    for (const [mode, peut] of [
      ["coop", peutLancerCoop],
      ["imposteur", peutLancerImposteur],
    ] as const) {
      const places = placesDuMode(reglages({ mode }));
      expect(peut(places), `${mode} : ${places} assis devrait pouvoir lancer`).toBe(true);
      expect(peut(places + 1), `${mode} : ${places + 1} assis ne devrait PAS tenir`).toBe(false);
    }
  });

  it("un salon classique n'est pas rabote par les nouveaux modes", () => {
    expect(placesDuMode(reglages({}))).toBe(MAX_PLAYERS);
    expect(MAX_PLAYERS).toBeGreaterThan(COOP_MAX_ASIS);
  });
});
