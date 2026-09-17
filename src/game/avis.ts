/**
 * L'AVIS DU JOUEUR — demandé une fois, après la deuxième partie.
 *
 * Retour du jury Ystart : « recevoir des feedbacks (après 2 parties) ». Pierre
 * obtient aujourd'hui ses retours en regardant jouer ses amis ; les inconnus
 * de Reddit repartent sans rien dire, et 74 % des visiteurs ne lancent jamais
 * une partie.
 *
 * POURQUOI APRÈS LA DEUXIÈME, ET PAS LA PREMIÈRE : le premier run a une
 * médiane de 4 manches et la moitié de ses morts sont des dépassements de
 * temps. Demander un avis là, c'est recueillir la frustration d'une chute ;
 * celui qui relance a choisi de rester, et c'est lui qui sait dire pourquoi.
 *
 * TROIS RÈGLES, et aucune n'est de goût :
 * - UNE SEULE FOIS. Marqué vu dès qu'il paraît, répondu ou non : une demande
 *   qui revient devient une réclame.
 * - UNE SOLLICITATION PAR ÉCRAN. Si le bandeau de mesure paraît, l'avis
 *   attend : c'est la règle déjà posée pour l'invitation au compte.
 * - JAMAIS SI LA MESURE EST REFUSÉE. L'avis voyage par la même collecte :
 *   le demander à quelqu'un qui l'a coupée, c'est lui faire écrire un texte
 *   qui n'arrivera nulle part.
 */

/** Longueur maximale du mot libre. Le serveur coupe au même nombre. */
export const AVIS_MAX = 280;

export type NoteAvis = 1 | 2 | 3;

export interface EtatAvis {
  /** Nombre de runs ACHEVÉS connus (`recent` en garde les cinq derniers). */
  runsAcheves: number;
  /** La demande a-t-elle déjà paru une fois ? */
  dejaVu: boolean;
  /** La collecte est-elle active ? */
  mesureOn: boolean;
  /** Le bandeau de mesure s'affiche-t-il sur CET écran de fin ? */
  mesureDemandee: boolean;
  /** Un point d'envoi existe-t-il (un build local n'en a pas) ? */
  collecte: boolean;
}

export function doitDemanderAvis(e: EtatAvis): boolean {
  return e.collecte && e.mesureOn && !e.dejaVu && !e.mesureDemandee && e.runsAcheves >= 2;
}

/**
 * Le mot libre, prêt à partir : espaces resserrés, coupé à `AVIS_MAX`.
 * Vide après nettoyage vaut « pas de mot » — on n'envoie pas un blanc.
 */
export function nettoieAvis(texte: string): string {
  return texte.replace(/\s+/g, " ").trim().slice(0, AVIS_MAX);
}
