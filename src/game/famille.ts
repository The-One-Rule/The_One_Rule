/**
 * CE QU'UNE RÈGLE EST — sa famille, et à quelle fréquence elle piège.
 *
 * Deux données que la fiche de carte affiche, et qu'il aurait été facile
 * d'inventer. Aucune des deux ne l'est.
 */
import { ONE_RULES } from "../engine/rules";
import type { OneRule } from "../engine/types";

/**
 * Les trois familles réelles du catalogue — DÉRIVÉES, jamais déclarées.
 *
 * Un champ `famille` posé à la main sur chaque règle se serait désynchronisé du
 * comportement à la première règle ajoutée. Ici la famille se lit de ce que la
 * règle FAIT :
 *
 * - **INTERDIT** — elle interdit quelque chose, donc une consigne peut entrer en
 *   conflit avec elle : c'est exactement ce que `traps` veut dire. Neuf règles.
 * - **DÉFORMATION** — elle ne défend rien, elle change la manche (`transform`) :
 *   doubler chaque geste, accélérer, cacher la consigne, mentir. Cinq règles.
 * - **CONTRAINTE** — elle pèse sur la façon d'agir sans toucher à la manche :
 *   tenir une touche (`watchRelease`), ou attendre avant d'agir. Deux règles.
 *
 * ⚠️ La partition est vérifiée par test : les seize règles tombent dans une
 * famille et une seule, et le jour où une nouvelle n'y tombe pas, on le saura
 * avant de l'avoir livrée.
 */
export type Famille = "interdit" | "deformation" | "contrainte";

export function familleDe(r: OneRule): Famille {
  if (r.watchRelease) return "contrainte";
  if (r.traps) return "interdit";
  if (r.transform) return "deformation";
  // Ni interdit, ni déformation : une contrainte sur le GESTE. LA SECONDE
  // interdit d'agir trop tôt — elle ne change pas la manche, elle change ce
  // qu'on a le droit d'y faire, et son verdict vit dans `judge`.
  return "contrainte";
}

/**
 * Proportion de manches piégeuses, par règle — MESURÉE, pas estimée.
 *
 * Relevé avec `buildRound` sur 120 runs × 45 niveaux par règle, c'est-à-dire
 * exactement le protocole du test d'équilibrage `tests/engine.test.ts`. Une
 * règle sans `traps` est à zéro par construction.
 *
 * ⚠️ **Table GELÉE, et gardée par un test.** La recalculer à l'affichage
 * coûterait 5400 manches par règle ; la laisser dériver en silence ferait
 * afficher un chiffre faux sur chaque carte. Le test la recalcule et la compare
 * — il tombera le jour où une consigne, une pondération ou une règle changera
 * la distribution, et il faudra alors remettre les chiffres à jour.
 *
 * ⚠️ La maquette annonçait d'autres valeurs (15,9 % pour LE SANG, 13,8 % pour
 * LE GAUCHER). Ce sont celles d'un catalogue antérieur : les quatre règles
 * ajoutées depuis ont changé la distribution des consignes. Ce sont ces
 * chiffres-ci qui sont vrais aujourd'hui.
 *
 * Remesurés à l'ouverture au solo du double appui, de MAINTIENS et de GLISSE :
 * la table suit le catalogue SOLO (`INSTRUCTIONS_SOLO`), celui qu'on joue.
 * Remesurés au catalogue 3 (01/10) : sans « NE FAIS RIEN » et sans deux pièges
 * d'affilée — tous les taux baissent de 2 à 5 points (LA POINTE 27,2 → 22,6).
 */
export const TAUX_PIEGE: Record<string, number> = {
  sang: 19.9,
  azur: 19.1,
  pointe: 22.6,
  roue: 22.8,
  solitaire: 21.9,
  angles: 21.5,
  voyelle: 9.4,
  colosse: 11.9,
  gaucher: 18.0,
  seconde: 0,
  eclair: 0,
  menteur: 0,
  daltonien: 0,
  jumeau: 0,
  acceleration: 0,
  mainGauche: 0,
};

/** Le taux d'une règle, ou `null` quand elle ne piège pas — à ne pas afficher. */
export function tauxPiege(r: OneRule): number | null {
  const t = TAUX_PIEGE[r.id];
  return t === undefined || t === 0 ? null : t;
}

/** Combien de règles par famille. Sert au test de partition, et à l'écran. */
export function parFamille(): Record<Famille, OneRule[]> {
  const out: Record<Famille, OneRule[]> = { interdit: [], deformation: [], contrainte: [] };
  for (const r of ONE_RULES) out[familleDe(r)].push(r);
  return out;
}
