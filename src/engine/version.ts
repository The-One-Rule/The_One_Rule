/**
 * La version de contenu — CALCULÉE, jamais tenue à la main.
 *
 * Un score ne veut rien dire hors des conditions qui l'ont produit. Ajouter
 * une treizième règle, changer `windowMs`, ajouter une consigne du backlog :
 * chacun de ces gestes change ce que « 23 manches » signifie, sans qu'aucun
 * test ne tombe et sans que personne ne s'en aperçoive. C'est la dette que
 * CLAUDE.md nomme « pas de version de génération sur les runs stockés », et
 * c'est le champ le moins cher à poser maintenant, le plus cher à rattraper.
 *
 * ⚠️ Elle est DÉRIVÉE du contenu, et c'est tout l'intérêt. Une constante à
 * incrémenter à la main est une constante qu'on oublie d'incrémenter — et on
 * ne s'en aperçoit que le jour où l'on compare deux chiffres incomparables,
 * c'est-à-dire trop tard. Ici, ajouter une règle change la version, qu'on y
 * pense ou non.
 *
 * Le module reste PUR : pas de DOM, pas d'horloge, pas de `Math.random()`. Il
 * tourne à l'identique dans le navigateur et dans la fonction edge, ce qui est
 * la condition pour que le client et le serveur rangent une performance sous
 * la même clé.
 */

import { INSTRUCTIONS_SOLO } from "./instructions";
import { ONE_RULES } from "./rules";
import { DAILY_LENGTH, GRACE_ROUNDS, STEP_MS, windowMs } from "./difficulty";

/**
 * FNV-1a 32 bits.
 *
 * On ne cherche ni la résistance aux collisions ni le secret : on cherche à
 * ce que deux contenus différents donnent deux étiquettes différentes, de
 * façon reproductible et sans dépendance. Une somme de contrôle
 * cryptographique serait asynchrone dans le navigateur, ce qui contaminerait
 * tous les appelants pour rien.
 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * L'empreinte du contenu qui décide d'un score.
 *
 * Ce qui entre ici doit être exactement ce qui change la difficulté ou le
 * tirage — ni plus, ni moins :
 *
 *   · les identifiants de règles, triés : en ajouter une change la difficulté
 *     du run du jour et le contenu de toute pile d'escalade ;
 *   · les identifiants de consignes, triés, avec leur pondération et leur
 *     niveau d'entrée : ils décident de ce qui tombe et quand ;
 *   · la courbe de fenêtre, échantillonnée : `windowMs` est une fonction, donc
 *     on l'échantillonne plutôt que d'espérer se souvenir de la toucher ;
 *   · les constantes qui bornent un run.
 *
 * Ce qui n'entre PAS : les libellés, les couleurs, les sons, la mise en page.
 * Un changement d'habillage ne doit pas rendre incomparables des chiffres
 * obtenus dans les mêmes conditions de jeu — sinon la version se met à
 * changer tout le temps, et une version qui change tout le temps ne segmente
 * plus rien.
 */
export function calculeVersion(
  regles: readonly { id: string }[],
  consignes: readonly { id: string; minLevel: number; weight: number; touch: boolean }[],
): string {
  const r = regles.map((x) => x.id).sort().join(",");
  const c = consignes
    .map((i) => `${i.id}:${i.minLevel}:${i.weight}:${i.touch ? 1 : 0}`)
    .sort()
    .join(",");
  // Échantillonnage de la courbe : début, coude, plancher. `windowMs` est une
  // fonction, donc on l'échantillonne plutôt que d'espérer se souvenir de
  // toucher une constante le jour où on la modifie.
  const courbe = [0, 5, 11, 12, 20, 38, 60].map(windowMs).join(",");
  const bornes = `${STEP_MS}/${DAILY_LENGTH}/${GRACE_ROUNDS}`;
  return fnv1a(`${r}|${c}|${courbe}|${bornes}`).toString(36);
}

/**
 * La version de contenu, calculée une fois.
 *
 * Courte à dessein : elle voyage dans chaque clé de comparabilité, donc dans
 * chaque ligne de performance stockée. Sept caractères au plus.
 */
// Sur le catalogue du SOLO : c'est lui que jouent les runs dont on garde les
// records. Voir `INSTRUCTIONS_SOLO`.
export const VERSION_CONTENU: string = calculeVersion(ONE_RULES, INSTRUCTIONS_SOLO);
