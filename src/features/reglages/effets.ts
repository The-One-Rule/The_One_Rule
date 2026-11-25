import type { Theme } from "../../game/progress";
import type { Lang } from "../../i18n";

/** Ce que Réglages demande au reste du jeu. Le composant ne touche pas au canvas. */
export interface EffetsReglages {
  son(on: boolean): void;
  musique(on: boolean): void;
  photos(on: boolean): void;
  motifs(on: boolean): void;
  theme(theme: Theme): void;
  allure(v: number): void;
  langue(lang: Lang): void;
  mesure(on: boolean): void;
  retour(): void;
  ui(): void;
}

export const effetsMuets: EffetsReglages = {
  son() {},
  musique() {},
  photos() {},
  motifs() {},
  theme() {},
  allure() {},
  langue() {},
  mesure() {},
  retour() {},
  ui() {},
};
