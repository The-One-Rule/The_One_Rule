/**
 * CE QUE LA CARTE DU RUN DU JOUR ANNONCE — pur, et testé.
 *
 * Quatre états qui se recouvrent, donc une PRIORITÉ — et une priorité écrite
 * en ternaires successifs au milieu d'une fonction de rendu est exactement le
 * genre de code qui se lit juste et se comporte faux. `plate.ts` a été extrait
 * après ce bug-là ; celui-ci est arrivé quand même, un cran plus loin.
 *
 * Le symptôme, rapporté tel quel : « la run du jour est buguée, elle ne se
 * valide pas même quand on la termine ». En passant à trois essais, tout
 * l'écran s'était mis à dépendre de `restants === 0` — donc un joueur qui
 * finissait les quarante manches lisait « 2 ESSAIS RESTANTS », l'accueil
 * continuait d'annoncer la règle du jour comme s'il n'avait rien fait, et rien
 * ne disait nulle part qu'il avait réussi.
 *
 * ⚠️ **TERMINÉ prime sur tout le reste.** C'est l'accomplissement qu'on
 * annonce, pas la consommation des essais. Le run reste REJOUABLE tant qu'il en
 * demeure — le classement départage sur la durée, donc améliorer son temps a du
 * sens — mais l'écran dit d'abord ce qui est ACQUIS.
 *
 * Comme `render/seat.ts`, ce module rend un IDENTIFIANT et jamais une phrase :
 * son test dit alors quelle branche de la priorité a gagné, pas à quoi
 * ressemblait le français.
 */
import { DAILY_ESSAIS } from "../engine/difficulty";
import { essaisDuJour } from "../game/progress";
import type { Save } from "../game/progress";

/** Ce que la carte a à dire, du plus fort au plus faible. */
export type EtatJour =
  /** Les quarante manches sont tombées. Prime sur tout. */
  | "termine"
  /** Trois essais consommés sans y arriver : à demain. */
  | "epuise"
  /** Pas encore joué aujourd'hui. */
  | "vierge"
  /** Joué, raté, et il en reste. */
  | "reste";

export interface VueJour {
  etat: EtatJour;
  /** Essais restants — toujours ≥ 0, un négatif s'afficherait tel quel. */
  restants: number;
  /** Le run est-il joué ET fini ? C'est ce que l'accueil et le multi lisent. */
  acquis: boolean;
  /** Le bouton se verrouille sur les ESSAIS, jamais sur l'accomplissement. */
  verrouille: boolean;
}

export function vueDuJour(s: Save, jour: number): VueJour {
  // ⚠️ Un run d'HIER ne vaut rien aujourd'hui : sans la garde de jour, la
  // carte annoncerait « TERMINÉ » au réveil, sur le score de la veille.
  const aJour = s.daily.day === jour;
  const essais = aJour ? essaisDuJour(s) : 0;
  const restants = Math.max(0, DAILY_ESSAIS - essais);
  const acquis = aJour && s.daily.cleared;
  const etat: EtatJour = acquis
    ? "termine"
    : restants === 0
      ? "epuise"
      : essais === 0
        ? "vierge"
        : "reste";
  return { etat, restants, acquis, verrouille: restants === 0 };
}
