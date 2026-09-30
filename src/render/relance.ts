/**
 * LA RELANCE EN UN GESTE — « encore une », comme Suika.
 *
 * Demandé par Pierre : « c'est juste un petit jeu plutôt sympa mais pas
 * addictif ». Ce qui fait « encore une » dans les jeux qui l'ont, c'est deux
 * choses à la fois : on voit à COMBIEN on a échoué, et relancer ne coûte
 * rien. TOR faisait l'inverse. La mort ouvrait un écran de fin long, qui
 * défile, puis REJOUER, puis le brief, puis COMMENCER : deux gestes et un
 * écran à lire entre la faute et la manche suivante.
 *
 * Ce module décide, et ne dessine rien :
 *   · si la mort a droit à la CARTE DE RELANCE plutôt qu'à l'écran de fin ;
 *   · ce que la carte dit du record.
 *
 * ⚠️ **SEPTIÈME MODULE DE PRIORITÉ PURE**, après `plate`, `seat`, `jour`,
 * `but`, `exploit` et `finactions`. Même raison à chaque fois : des cas qui
 * s'excluent, écrits en ternaires dans le rendu, se lisent juste et se
 * comportent faux.
 *
 * ⚠️ **LA CARTE NE REMPLACE PAS L'ÉCRAN DE FIN, ELLE LE REPOUSSE.** Tout ce
 * que `finishRun` écrit est écrit de la même façon ; seul `show("over")` est
 * différé, et le bouton BILAN l'ouvre à tout moment. Un moment qui a quelque
 * chose à DONNER passe donc toujours par l'écran de fin. C'est le cas d'une
 * carte gagnée, d'une maîtrise, d'une quête bouclée ou d'une demande (mesure,
 * avis, installation). Les sauter pour gagner une seconde retirerait
 * précisément les récompenses que le jeu vient d'ajouter.
 */

import type { Mode } from "../game/session";

export interface EtatMort {
  mode: Mode;
  /** Un défi rejoue la graine de quelqu'un : sa fin EST le verdict du duel. */
  duel: boolean;
  /** Un niveau du parcours a son propre écran, déjà en un seul bouton. */
  niveau: boolean;
  /** Le run est allé au bout (40/40 du jour) : ce n'est pas une mort. */
  termine: boolean;
  /** Essais restants au run du jour, APRÈS celui-ci. Sans objet ailleurs. */
  essaisRestants: number;
  /** Quelque chose attend sur l'écran de fin : carte, maîtrise, quête, demande. */
  aDonner: boolean;
}

/** La mort a-t-elle droit à la carte de relance ? */
export function relancePossible(e: EtatMort): boolean {
  if (e.duel || e.niveau || e.termine || e.aDonner) return false;
  if (e.mode === "ranked") return false;
  if (e.mode === "daily") return e.essaisRestants > 0;
  return true;
}

/** Ce que la carte dit du record. Un identifiant, jamais une phrase. */
export type RelanceId = "record" | "egale" | "presque" | "loin" | "premier";

export interface VueRelance {
  id: RelanceId;
  /** Le record d'AVANT ce run, `0` s'il n'y en avait pas. */
  ancien: number;
  /** Manches qui manquaient (`presque`, `loin`) ou d'avance (`record`). */
  ecart: number;
}

/**
 * « PRESQUE », c'est au plus deux manches, ou 15 % du record.
 *
 * Deux manches, parce qu'à un record de 5 une manche d'écart vaut déjà 20 %.
 * Et 15 %, parce qu'à un record de 60 il manque trois manches pour la même
 * sensation : on voyait la ligne. Au-delà, la carte montre le record sans
 * écart. « À 38 DE TON RECORD » n'est pas une tentation, c'est un reproche.
 */
export function estPresque(ecart: number, ancien: number): boolean {
  return ecart > 0 && ecart <= Math.max(2, Math.round(ancien * 0.15));
}

export function vueRelance(score: number, ancien: number): VueRelance {
  // Battre zéro n'est pas un exploit (même doctrine que `exploit.ts`) : sans
  // record d'avant, la carte dit seulement que ce score est le premier.
  if (ancien <= 0) return { id: "premier", ancien: 0, ecart: 0 };
  if (score > ancien) return { id: "record", ancien, ecart: score - ancien };
  if (score === ancien) return { id: "egale", ancien, ecart: 0 };
  const ecart = ancien - score;
  return { id: estPresque(ecart, ancien) ? "presque" : "loin", ancien, ecart };
}

/**
 * Délai pendant lequel la carte IGNORE les appuis.
 *
 * Le joueur qui vient de mourir tapait : c'est souvent CE tapotement qui l'a
 * tué. Sans garde, le suivant relancerait une partie qu'il n'a pas demandée,
 * sans avoir vu son score. 450 ms suffisent à lever le doigt. Le gel de mort
 * (820 ms) est déjà passé quand la carte paraît, donc l'attente totale reste
 * sous 1,3 s.
 */
export const RELANCE_GARDE_MS = 450;
