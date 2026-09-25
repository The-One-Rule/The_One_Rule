/**
 * LA BOUTIQUE — les pièces gagnées achètent enfin quelque chose.
 *
 * `st.coins` montait depuis le premier jour (quêtes, puis le parcours) et ne
 * s'échangeait contre rien. Une monnaie sans dépense apprend au joueur que les
 * chiffres du jeu sont décoratifs — y compris les autres.
 *
 * Ce qui s'achète ne touche JAMAIS au jeu : un style change le dessin d'une
 * pièce, pas sa couleur (c'est le mot de la consigne), pas sa forme (c'est
 * celui de la règle), pas sa géométrie de clic (décision n°3). La décision
 * n°12 tient aussi : rien ici ne dépend du compte.
 *
 * PUR : ni DOM ni stockage.
 */

export type SkinId = "sticker" | "neon" | "bonbon" | "pixel" | "craie";

export interface Skin {
  id: SkinId;
  prix: number;
}

/**
 * Le catalogue, du moins cher au plus cher. Le premier est offert.
 *
 * Les prix sont calés sur ce que rapporte le parcours : 10 pièces par étoile
 * nouvelle, 50 par chapitre bouclé. Un chapitre à trois étoiles partout vaut
 * 200 pièces — donc le premier style s'achète après UN chapitre bien joué, le
 * dernier après quatre ou cinq. Assez près pour être un but, assez loin pour
 * valoir quelque chose.
 */
export const SKINS: readonly Skin[] = [
  { id: "sticker", prix: 0 },
  { id: "neon", prix: 150 },
  { id: "bonbon", prix: 300 },
  { id: "pixel", prix: 450 },
  { id: "craie", prix: 600 },
];

export const SKIN_DEFAUT: SkinId = "sticker";

export const estSkin = (v: unknown): v is SkinId => SKINS.some((s) => s.id === v);

export interface EtatBoutique {
  possedes: SkinId[];
  porte: SkinId;
}

export const BOUTIQUE_VIERGE: EtatBoutique = { possedes: [SKIN_DEFAUT], porte: SKIN_DEFAUT };

/** Relit un état venu du stockage : tout ce qui est douteux retombe sur le défaut. */
export function litBoutique(v: unknown): EtatBoutique {
  if (!v || typeof v !== "object") return { ...BOUTIQUE_VIERGE, possedes: [...BOUTIQUE_VIERGE.possedes] };
  const o = v as Record<string, unknown>;
  const possedes = Array.isArray(o.possedes) ? o.possedes.filter(estSkin) : [];
  if (!possedes.includes(SKIN_DEFAUT)) possedes.unshift(SKIN_DEFAUT);
  const uniques = [...new Set(possedes)];
  const porte = estSkin(o.porte) && uniques.includes(o.porte) ? o.porte : SKIN_DEFAUT;
  return { possedes: uniques, porte };
}

export type Achat =
  | { ok: true; etat: EtatBoutique; pieces: number }
  | { ok: false; raison: "inconnu" | "deja" | "pauvre"; manque: number };

/**
 * Acheter un style. Il est PORTÉ aussitôt : on n'achète pas un habit pour le
 * ranger, et un second geste pour l'enfiler se lirait comme un achat raté.
 */
export function achete(etat: EtatBoutique, pieces: number, id: SkinId): Achat {
  const skin = SKINS.find((s) => s.id === id);
  if (!skin) return { ok: false, raison: "inconnu", manque: 0 };
  if (etat.possedes.includes(id)) return { ok: false, raison: "deja", manque: 0 };
  if (pieces < skin.prix) return { ok: false, raison: "pauvre", manque: skin.prix - pieces };
  return {
    ok: true,
    etat: { possedes: [...etat.possedes, id], porte: id },
    pieces: pieces - skin.prix,
  };
}

/** Porter un style déjà possédé. Un style non possédé est refusé en silence. */
export function porte(etat: EtatBoutique, id: SkinId): EtatBoutique {
  return etat.possedes.includes(id) ? { ...etat, porte: id } : etat;
}
