/**
 * Construction des manches multijoueur.
 *
 * Le principe qui rend le netcode trivial : la scène est DÉTERMINISTE et
 * INDÉPENDANTE de la règle. Le serveur ne transmet jamais une scène — il
 * transmet une graine de partie et un index de manche, et chaque client
 * reconstruit exactement la même grille localement.
 *
 * La règle unique, elle, est PERSONNELLE. Deux joueurs voient la même scène
 * et la même consigne, mais `CLIQUE LE ROUGE` est un piège pour celui qui
 * porte LE SANG et une consigne ordinaire pour les autres. D'où la séparation
 * en deux temps :
 *
 *   1. draftShared(seed, idx)          → scène + attente, identiques pour tous
 *   2. applyRule(shared, rule, seed)   → piège + déformations, par joueur
 *
 * Chaque étape a son propre RNG dérivé par hachage : la manche 12 se
 * construit sans rejouer les manches 0 à 11, et la déformation du MENTEUR
 * chez Pierre ne dépend pas de ce que voit Marie.
 */

import { hashStr, mulberry32 } from "./rng";
import { pickInstruction, TOUCH_INSTRUCTIONS } from "./instructions";
import { place } from "./scene";
import { windowForSteps } from "./difficulty";
import { compile } from "./round";
import type { Instruction, OneRule, Round, Want } from "./types";

/** Partie commune d'une manche, avant application d'une règle. */
export interface SharedRound {
  idx: number;
  instructionId: string;
  text: string;
  sub?: string;
  glyph?: string;
  colorWord?: Round["colorWord"];
  ents: Round["ents"];
  want: Want;
  durationMs: number;
}

/** RNG de la scène partagée : fonction de la graine et de l'index seulement. */
const sharedRng = (seed: number, idx: number) => mulberry32(hashStr(`${seed}:${idx}`) ^ seed);

/** RNG des déformations : fonction de la graine, de l'index ET de la règle. */
const ruleRng = (seed: number, idx: number, ruleId: string) =>
  mulberry32(hashStr(`${seed}:${idx}:${ruleId}`));

export function draftShared(
  seed: number,
  idx: number,
  pool?: Instruction[],
): SharedRound {
  const rng = sharedRng(seed, idx);
  /*
   * Le multijoueur tire dans le pool TACTILE, pour tout le monde, toujours.
   *
   * La scène est partagée : impossible de donner des consignes différentes
   * selon l'appareil sans casser le déterminisme. Et un salon mélange par
   * nature téléphones et PC — on ne sait jamais à l'avance. La règle est donc
   * celle de l'appareil le moins capable : un joueur PC perd quatre consignes
   * clavier, un joueur mobile ne perd plus de vies sur des manches qu'il ne
   * pouvait PAS jouer. Le premier coût est cosmétique, le second tuait des
   * parties (constaté en bêta : deux vies perdues sur « APPUIE SUR B » puis
   * « APPUIE SUR K », mort sans avoir pu agir).
   *
   * Corollaire traité dans server/match.ts : LA VOYELLE, qui ne piège que
   * sur des consignes clavier, sort du pool de règles multijoueur.
   */
  const instr = pickInstruction(rng, idx, pool ?? TOUCH_INSTRUCTIONS);
  const draft = instr.gen(rng, idx);
  const ents = place(rng, draft.specs);
  const want: Want = draft.wantFrom ? draft.wantFrom(ents) : draft.want;
  return {
    idx,
    instructionId: instr.id,
    text: draft.text,
    sub: draft.sub,
    glyph: draft.glyph,
    colorWord: draft.colorWord,
    ents,
    want,
    /*
     * La durée suit le nombre d'actions de la consigne COMMUNE, donc elle
     * reste la même pour tout le salon : l'échéance diffusée par le serveur
     * garde son sens. Ce qu'une règle ajoute par-dessus — LE JUMEAU qui double
     * les étapes, L'ACCÉLÉRATION qui retranche — reste personnel et passe par
     * `transform`, que le serveur relit dans `durationFor`.
     */
    durationMs: windowForSteps(idx, compile(want).length),
  };
}

/**
 * Applique la règle d'un joueur à la manche partagée.
 *
 * Les entités sont CLONÉES : les déformations et l'animation d'un joueur ne
 * doivent jamais fuir dans la scène d'un autre (le serveur applique les douze
 * règles sur la même manche pour juger tout le monde).
 */
export function applyRule(shared: SharedRound, rule: OneRule, seed: number): Round {
  const ents = shared.ents.map((e) => ({ ...e }));
  const trap = rule.forbids(shared.want, ents);

  let round: Round = {
    instructionId: shared.instructionId,
    text: shared.text,
    sub: shared.sub,
    glyph: shared.glyph,
    colorWord: shared.colorWord,
    ents,
    steps: trap ? [] : compile(shared.want),
    trap,
    originalWant: trap ? shared.want : undefined,
    durationMs: shared.durationMs,
  };

  if (rule.transform) round = rule.transform(round, ruleRng(seed, shared.idx, rule.id), shared.idx);
  return round;
}

/** Raccourci : la manche complète d'un joueur donné. */
export const buildMultiRound = (
  seed: number,
  idx: number,
  rule: OneRule,
  pool?: Instruction[],
): Round => applyRule(draftShared(seed, idx, pool), rule, seed);
