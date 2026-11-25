/**
 * La PROJECTION du carnet vers les tables de la collection.
 *
 * `carte_utilisateur` et `progression_chapitre` (migration 0008) ne sont pas
 * une seconde source : ce sont les agrégats déjà FUSIONNÉS (`fusionne`, dans
 * `shared/compte.ts`), rangés en lignes pour que la base sache répondre
 * « qui a maîtrisé LE GAUCHER » sans ouvrir mille JSONB. La fonction SQL
 * `agregats_ecrit` les écrit dans la même transaction que les agrégats.
 *
 * ⚠️ PURE, et écrite UNE fois. La maîtrise se juge avec `estMaitrisee`, la
 * même fonction que l'écran de la collection : une règle maîtrisée en base
 * et pas à l'écran serait exactement le « deux jugements sur un même fait »
 * que ce dépôt a payé trois fois.
 *
 * ⚠️ Ce qui est projeté reste AFFIRMÉ par le client (décision n°14) : rien ici
 * ne doit jamais nourrir un classement.
 *
 * Le préfixe `_` empêche Vercel d'en faire un point d'entrée.
 */

import type { Agregats } from "../shared/compte";
import { ruleById } from "../src/engine/rules";
import { estMaitrisee } from "../src/game/maitrise";
import type { RuleRecord } from "../src/game/progress";
import { CHAPITRES, NIVEAUX } from "../src/game/parcours";

/** Une carte possédée, telle que `agregats_ecrit` l'attend. */
export interface LigneCarte {
  regle: string;
  meilleur: number;
  pieges: number;
  runs: number;
  maitrisee: boolean;
}

/** Un chapitre entamé : les étoiles de ses cinq niveaux. */
export interface LigneChapitre {
  regle: string;
  etoiles: number[];
}

export interface Projection {
  cartes: LigneCarte[];
  chapitres: LigneChapitre[];
}

const borne = (v: unknown, max: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : 0;
};

/** Plafond des compteurs : celui que `litAgregats` applique déjà (api/moi.ts). */
const MAX_VALEUR = 100_000;

/**
 * Le carnet en lignes.
 *
 * Une entrée de carnet = une carte OBTENUE (décision n°7 : la carte se gagne
 * en rencontrant la règle). Une règle inconnue du catalogue — une pile
 * d'escalade, une version plus récente du client — est écartée ici ; elle
 * reste dans les agrégats, où rien ne se perd.
 */
export function projette(a: Agregats): Projection {
  const cartes: LigneCarte[] = [];
  const chapitres: LigneChapitre[] = [];
  for (const [id, e] of Object.entries(a.carnet)) {
    const regle = ruleById(id);
    if (!regle) continue;
    cartes.push({
      regle: id,
      meilleur: borne(e.best, MAX_VALEUR),
      pieges: borne(e.pieges, MAX_VALEUR),
      runs: borne(e.runs, MAX_VALEUR),
      maitrisee: estMaitrisee(regle, e as RuleRecord),
    });
    if (CHAPITRES.includes(id) && e.etoiles?.some((x) => x > 0)) {
      chapitres.push({
        regle: id,
        etoiles: Array.from({ length: NIVEAUX.length }, (_, k) => borne(e.etoiles?.[k], 3)),
      });
    }
  }
  return { cartes, chapitres };
}
