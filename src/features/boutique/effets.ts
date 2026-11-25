import type { SkinId } from "../../game/boutique";

export interface EffetsBoutique {
  skin(id: SkinId): void;
  achat(id: SkinId, prix: number, nom: string): void;
  retour(): void;
  ui(): void;
  gagne(): void;
}

export const effetsBoutiqueMuets: EffetsBoutique = {
  skin() {},
  achat() {},
  retour() {},
  ui() {},
  gagne() {},
};
