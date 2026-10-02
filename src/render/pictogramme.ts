/**
 * LA CONSIGNE DESSINÉE — maquette 3.1 à 3.4 (lot C).
 *
 * « On lit l'image avant le texte » : à côté de la consigne écrite, la pièce
 * qu'elle désigne, dessinée comme sur le terrain (forme et couleur), et le
 * geste — un appui, deux, un anneau à tenir, une flèche à glisser.
 *
 * PUR : décide QUOI dessiner, jamais comment. Le HUD peint.
 *
 * ⚠️ TROIS RÈGLES SE JOUENT DE LA CONSIGNE ÉCRITE, et un dessin les rendrait
 * INERTES — un avantage gratuit, la famille de la décision n°1 :
 *   · LE MENTEUR affiche d'abord une phrase FAUSSE : dessiner la vraie pièce
 *     pendant le mensonge le dénoncerait ;
 *   · LE DALTONIEN oppose le MOT à l'ENCRE : un rond de la couleur du mot
 *     trancherait le conflit à la place du joueur ;
 *   · L'ÉCLAIR efface la consigne : le dessin doit s'effacer avec elle.
 * Sur ces manches, rien n'est dessiné (testé). Le dessin ne dit jamais rien
 * que le texte ne dise déjà — il ne trahit donc aucun piège (n°5).
 */
import type { ColorId, Phrase, Round, ShapeId } from "../engine/types";

export type Geste = "clic" | "double" | "tiens" | "glisse" | "suite";

export interface PieceDessinee {
  couleur?: ColorId;
  forme?: ShapeId;
}

export interface Pictogramme {
  geste: Geste;
  /** Une pièce, ou deux (GLISSE de l'une SUR l'autre, l'une PUIS l'autre). */
  pieces: PieceDessinee[];
}

/** Ce que la consigne désigne, ou `null` quand il n'y a rien à dessiner. */
export function pictogramme(round: Pick<Round, "phrase" | "falseText" | "inkColor" | "hideTextAtMs" | "glyph">): Pictogramme | null {
  if (round.falseText !== undefined || round.inkColor !== undefined || round.hideTextAtMs !== undefined) return null;
  if (round.glyph) return null;
  return depuisPhrase(round.phrase);
}

function depuisPhrase(p: Phrase | undefined): Pictogramme | null {
  if (!p) return null;
  switch (p.cle) {
    case "clicCouleur":
      return p.couleur ? { geste: "clic", pieces: [{ couleur: p.couleur }] } : null;
    case "clicForme":
      return p.forme ? { geste: "clic", pieces: [{ forme: p.forme }] } : null;
    case "clicFormeCouleur":
      return p.forme && p.couleur ? { geste: "clic", pieces: [{ forme: p.forme, couleur: p.couleur }] } : null;
    case "deuxFoisCouleur":
      return p.couleur ? { geste: "double", pieces: [{ couleur: p.couleur }] } : null;
    case "deuxFoisForme":
      return p.forme ? { geste: "double", pieces: [{ forme: p.forme }] } : null;
    case "tiensCouleur":
      return p.couleur ? { geste: "tiens", pieces: [{ couleur: p.couleur }] } : null;
    case "glisseCouleur":
      return p.couleur && p.couleur2 ? { geste: "glisse", pieces: [{ couleur: p.couleur }, { couleur: p.couleur2 }] } : null;
    case "couleurPuis":
      return p.couleur && p.couleur2 ? { geste: "suite", pieces: [{ couleur: p.couleur }, { couleur: p.couleur2 }] } : null;
    default:
      // Négations, intrus, lettres, « n'importe où » : un dessin dirait moins
      // bien que la phrase, ou dirait autre chose. On se tait.
      return null;
  }
}
