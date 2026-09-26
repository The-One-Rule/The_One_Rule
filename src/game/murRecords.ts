/**
 * TES RECORDS — ce que le mur des records montre de toi.
 *
 * Rapporté par Pierre : « pas de réel classement, il est mal présenté ». Le
 * mur posait en grand un 201 figé à la main (« meilleur connu ») au-dessus
 * d'un « TON MIEUX · — » vide — alors que le joueur de la capture avait des
 * records : ils étaient rangés à son allure de référence, et l'écran ne lisait
 * que l'allure où il jouait AUJOURD'HUI.
 *
 * Tout ce que le joueur a fait est donc listé, et chaque ligne dit son
 * ÉPREUVE : un score sans son mode est un chiffre faux (§12). Une ligne vide
 * se tait plutôt que d'afficher « 0 » — un zéro se lit comme un échec.
 *
 * PUR, et testé : aucune lecture de stockage, aucune langue. `main.ts` fournit
 * les chiffres et compose les libellés.
 */

export type QuoiRecord = "jour" | "allure" | "pile" | "regle";

export interface LigneRecord {
  quoi: QuoiRecord;
  /** L'allure (quoi = "allure") ou l'identifiant de règle (quoi = "regle"). */
  cle?: number | string;
  valeur: number;
}

export interface SourcesRecords {
  /** Score du run du jour aujourd'hui, ou null s'il n'a pas été joué. */
  jour: number | null;
  /** Record d'entraînement par allure. */
  parAllure: ReadonlyMap<number, number>;
  /** Règles tenues à LA PILE. */
  pile: number;
  /** Meilleur score par règle (le carnet). */
  parRegle: ReadonlyMap<string, number>;
}

/** Combien de règles on cite : au-delà, la liste devient un carnet bis. */
export const REGLES_CITEES = 3;

export function lignesRecords(s: SourcesRecords): LigneRecord[] {
  const out: LigneRecord[] = [];
  if (s.jour !== null && s.jour > 0) out.push({ quoi: "jour", valeur: s.jour });
  // Les allures dans l'ordre où le jeu les propose : de la plus lente à la
  // plus rapide. Un record à DÉBUT et un record à RAPIDE ne se comparent pas.
  for (const [allure, v] of [...s.parAllure].sort((a, b) => b[0] - a[0])) {
    if (v > 0) out.push({ quoi: "allure", cle: allure, valeur: v });
  }
  if (s.pile > 0) out.push({ quoi: "pile", valeur: s.pile });
  const regles = [...s.parRegle]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, REGLES_CITEES);
  for (const [id, v] of regles) out.push({ quoi: "regle", cle: id, valeur: v });
  return out;
}
