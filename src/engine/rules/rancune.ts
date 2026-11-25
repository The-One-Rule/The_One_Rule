/**
 * LA RANCUNE — « ne clique jamais la forme qui t'a coûté une vie ».
 *
 * La seule règle dont l'interdit dépend de l'HISTOIRE du joueur. Toutes les
 * autres sont des objets fixes ; celle-ci est une FAMILLE de trois règles
 * (rond, carré, triangle), et la partie choisit laquelle on porte.
 *
 * ⚠️ TROIS QUESTIONS ÉTAIENT OUVERTES (tâche du 25/11), et voici les réponses.
 *
 * 1. **Inerte jusqu'à la première vie perdue ?** Non : une règle qui ne piège
 *    rien pendant toute une partie parfaite est un avantage gratuit (n°1).
 *    Chaque équipe démarre avec une rancune TIRÉE de la graine du match
 *    (`formeDeDepart`) — « une forme t'en veut déjà ». Une vie perdue la
 *    remplace.
 *
 * 2. **Une mort au TEMPS, sans rien cliquer ?** C'est la forme qu'on
 *    n'a pas su toucher : la cible de l'étape en cours. Une mort sur une
 *    pièce touchée retient CETTE pièce. Une mort sans aucune forme en jeu
 *    (consigne clavier, « n'importe où ») ne change rien. Voir `formeQuiACoute`.
 *
 * 3. **Le run du jour identique pour tous (n°11) ?** La règle n'est PAS au
 *    catalogue solo (`ONE_RULES`) : elle n'existe qu'en salon, là où l'on a
 *    des vies à perdre. Le run du jour, l'entraînement, `VERSION_CONTENU` et
 *    le rejeu serveur n'en savent rien. Un solo à une vie ne la ferait
 *    jamais changer : elle y serait LA ROUE sous un autre nom.
 *
 * ⚠️ LE CLIENT NE DÉDUIT JAMAIS LA RANCUNE. Le serveur tient l'état par
 * équipe, et la cible voyage dans l'identifiant de règle (`rancune:rond`)
 * que le salon transmet déjà à chaque rotation et à chaque changement. Deux
 * historiques reconstitués de chaque côté finiraient par diverger, et un
 * aperçu qui contredit le verdict est le seul défaut tenu pour fatal (n°3).
 *
 * Module PUR : aucune horloge, aucun hasard non seedé.
 */

import { MOTIFS } from "../motifs.js";
import { hashStr, mulberry32, rInt } from "../rng.js";
import { SHAPE_IDS } from "../types.js";
import type { Entity, OneRule, Round, RoundProgress, ShapeId } from "../types.js";
import { targets } from "./cibles.js";

/** L'identifiant de FAMILLE — sans la cible. */
export const RANCUNE = "rancune";

/**
 * La version du jeu de consignes à partir de laquelle un salon peut la tirer
 * (`CONSIGNES_VERSION`). Un client ou un serveur plus ancien ne sait pas lire
 * `rancune:rond` : la négociation le fait retomber sur le pool d'avant.
 */
export const VERSION_RANCUNE = 5;

/** `rancune:rond` → `rond`. Tout le reste → null. */
export function formeDeRancune(id: string): ShapeId | null {
  if (!id.startsWith(`${RANCUNE}:`)) return null;
  const forme = id.slice(RANCUNE.length + 1);
  return (SHAPE_IDS as readonly string[]).includes(forme) ? (forme as ShapeId) : null;
}

/** L'identifiant de famille d'une règle : `rancune:rond` → `rancune`. */
export const familleDeRegle = (id: string): string =>
  formeDeRancune(id) ? RANCUNE : id;

export const estRancune = (id: string): boolean => formeDeRancune(id) !== null;

const cache = new Map<ShapeId, OneRule>();

/**
 * La règle « jamais de <forme> ».
 *
 * Mêmes leviers que LA ROUE et LA POINTE, qui l'ont précédée : `forbids` lit
 * les cibles de la consigne (le glisser compte ses DEUX pièces), `judge` la
 * pièce touchée. Mêmes objets à chaque appel : deux appels pour la même forme
 * rendent la même règle, comparable par identité.
 */
export function rancune(forme: ShapeId): OneRule {
  const connue = cache.get(forme);
  if (connue) return connue;
  const regle: OneRule = {
    id: `${RANCUNE}:${forme}`,
    name: "LA RANCUNE",
    brief: `Ne clique jamais un ${NOM_FR[forme]} : il t'a coûté une vie. Chaque vie perdue change ta rancune.`,
    traps: true,
    forbids: (want, ents) => targets(want, ents).some((e) => e.shape === forme),
    judge: (a) => (a.kind === "click" && a.ent?.shape === forme ? MOTIFS.rancune : null),
  };
  cache.set(forme, regle);
  return regle;
}

const NOM_FR: Record<ShapeId, string> = { carre: "carré", rond: "rond", triangle: "triangle" };

/** La règle d'un identifiant de salon, ou `undefined` s'il n'en est pas une. */
export function regleRancuneDepuisId(id: string): OneRule | undefined {
  const forme = formeDeRancune(id);
  return forme ? rancune(forme) : undefined;
}

/** Sel du tirage de départ : même graine, autre usage, sans corrélation. */
const SEL_RANCUNE = 0x2c1b3c6d | 0;

/**
 * La rancune d'une équipe AVANT sa première vie perdue — tirée de la graine.
 *
 * Par équipe et non par salon : deux joueurs qui reçoivent LA RANCUNE l'un
 * après l'autre par rotation n'en veulent pas forcément à la même forme.
 */
export function formeDeDepart(seed: number, equipe: number): ShapeId {
  const rng = mulberry32(hashStr(`${seed}:rancune:${equipe}`) ^ SEL_RANCUNE);
  return SHAPE_IDS[rInt(rng, SHAPE_IDS.length)]!;
}

/** Les pièces que désigne une étape, dans l'ordre où elle les nomme. */
function ciblesDeLEtape(round: Round, progress: RoundProgress): Entity[] {
  const step = round.steps[progress.step];
  if (!step) return [];
  switch (step.kind) {
    case "click":
    case "hold":
    case "drop":
      return round.ents[step.idx] ? [round.ents[step.idx]!] : [];
    default:
      return [];
  }
}

/**
 * La forme qui vient de coûter une vie — ou null si aucune n'est en cause.
 *
 * Dans l'ordre :
 *   1. la pièce TOUCHÉE par le geste fatal — on s'en souvient parce qu'on
 *      l'a touchée ;
 *   2. sinon, la pièce que l'étape en cours demandait — la mort au temps, la
 *      plus fréquente : on s'en souvient parce qu'on l'a ratée ;
 *   3. sinon, la cible d'origine d'un piège — on a cliqué dans le vide sur
 *      une manche où il fallait s'abstenir ;
 *   4. sinon rien : une consigne clavier ou « n'importe où » ne désigne
 *      aucune forme, et la rancune reste ce qu'elle était.
 */
export function formeQuiACoute(
  round: Round,
  progress: RoundProgress,
  touchee: Entity | null,
): ShapeId | null {
  if (touchee) return touchee.shape;
  const attendue = ciblesDeLEtape(round, progress)[0];
  if (attendue) return attendue.shape;
  const origine = round.originalWant ? targets(round.originalWant, round.ents)[0] : undefined;
  return origine?.shape ?? null;
}
