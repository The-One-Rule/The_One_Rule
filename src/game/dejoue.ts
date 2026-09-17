/**
 * LE RÉGLAGE DU DÉJOUAGE — pur, et relu à chaque chargement.
 *
 * Le moteur est dans `engine/resolve.ts` (`resoudreDejoue`) et la `Session`
 * (`dejouer`). Ce module ne tient que ce que le JOUEUR choisit : s'il veut le
 * raccourci, quelle lettre le déclenche, et de quel côté du pouce tombe le
 * bouton sur un téléphone.
 *
 * ⚠️ Une sauvegarde est une donnée du client : un `localStorage` trafiqué, une
 * version antérieure ou une extension peuvent y mettre n'importe quoi. Une
 * touche invalide — « Espace », « Échap », une flèche, deux lettres — ne doit
 * pas être acceptée, sinon le raccourci volerait une touche de jeu : ESPACE
 * est le maintien de LA MAIN GAUCHE, une flèche est une réponse, et ÉCHAP
 * abandonne la partie. On retombe donc sur le défaut, sans erreur.
 */

export type CoteDejoue = "gauche" | "droite";

export interface ReglageDejoue {
  /** Le raccourci est-il proposé en entraînement ? */
  on: boolean;
  /** Une lettre A–Z, en capitale. Elle sort du tirage des consignes. */
  touche: string;
  /** Côté du bouton sur un appareil tactile. */
  cote: CoteDejoue;
}

export const TOUCHE_DEJOUE_DEFAUT = "F";

/*
 * ⚠️ R EST REFUSÉE : c'est « REJOUER » sur l'écran de fin. Une partie finit
 * souvent sur un déjouage raté — celui qui le tape une fraction de seconde
 * trop tard relancerait une partie sans l'avoir voulu.
 */
const INTERDITES = new Set(["R"]);

/** La lettre est-elle acceptable comme touche du déjouage ? */
export function toucheAcceptable(cle: string): boolean {
  if (cle.length !== 1) return false;
  const c = cle.toUpperCase();
  return c >= "A" && c <= "Z" && !INTERDITES.has(c);
}

export const reglageDejoueDefaut = (): ReglageDejoue => ({
  on: true,
  touche: TOUCHE_DEJOUE_DEFAUT,
  // Droitier par défaut : la majorité tient son téléphone de la main droite.
  cote: "droite",
});

/** Reconstruit un réglage sûr depuis ce que contenait la sauvegarde. */
export function normaliseDejoue(brut: unknown): ReglageDejoue {
  const d = reglageDejoueDefaut();
  if (!brut || typeof brut !== "object") return d;
  const o = brut as Record<string, unknown>;
  return {
    on: typeof o.on === "boolean" ? o.on : d.on,
    touche: typeof o.touche === "string" && toucheAcceptable(o.touche) ? o.touche.toUpperCase() : d.touche,
    cote: o.cote === "gauche" || o.cote === "droite" ? o.cote : d.cote,
  };
}
