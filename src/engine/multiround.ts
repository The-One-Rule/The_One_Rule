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
import {
  CONSIGNES_MULTI,
  INSTRUCTIONS,
  pickInstruction,
  TOUCH_INSTRUCTIONS,
  VERSION_DE_CONSIGNE,
} from "./instructions";
import { place } from "./scene";
import { plancherParGeste, poidsGestes, windowForSteps } from "./difficulty";
import { compile } from "./round";
import type { Instruction, OneRule, Round, Want } from "./types";

/** Partie commune d'une manche, avant application d'une règle. */
export interface SharedRound {
  idx: number;
  instructionId: string;
  text: string;
  /*
   * La consigne structuree voyage avec la scene partagee — mais pas sur le
   * fil : le multi RECONSTRUIT la scene depuis la graine, il ne la transmet
   * pas. Voir `buildMultiRound`. Elle est donc gratuite pour le reseau.
   */
  phrase?: Round["phrase"];
  sousPhrase?: string;
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
   * Le pool par DÉFAUT est le tactile, et ce défaut est une garantie.
   *
   * Un joueur mobile ne doit jamais perdre une vie sur une manche qu'il ne
   * pouvait PAS jouer — constaté en bêta : deux vies perdues sur « APPUIE SUR
   * B » puis « APPUIE SUR K », mort sans avoir pu agir. Tant qu'on ne sait pas
   * de quoi la table est capable, on suppose le moins capable.
   *
   * Le salon peut l'élargir en passant `poolMulti(true)`, mais seulement si
   * TOUS ses sièges ont annoncé un clavier — voir `poolMulti`. La décision se
   * prend au salon, jamais au joueur : la scène doit rester commune.
   *
   * Corollaire traité dans server/match.ts : LA VOYELLE ne piège que sur des
   * consignes clavier, elle n'entre donc au pool de règles que dans un salon
   * clavier. Ailleurs elle serait inerte, c'est-à-dire un avantage gratuit.
   */
  const instr = pickInstruction(rng, idx, pool ?? TOUCH_INSTRUCTIONS);
  const draft = instr.gen(rng, idx);
  const ents = place(rng, draft.specs);
  const want: Want = draft.wantFrom ? draft.wantFrom(ents) : draft.want;
  return {
    idx,
    instructionId: instr.id,
    text: draft.text,
    phrase: draft.phrase,
    sousPhrase: draft.sousPhrase,
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
    durationMs: windowForSteps(idx, poidsGestes(compile(want))),
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
    phrase: shared.phrase,
    sousPhrase: shared.sousPhrase,
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
  /*
   * Le MEME plancher qu'en solo, et pose au meme endroit — apres la regle.
   * Le serveur lit `round.durationMs` dans `durationFor` : une seule des deux
   * faces qui l'appliquerait ferait diverger le temps juge du temps affiche,
   * c'est-a-dire le defaut tenu pour fatal (n°3).
   */
  return { ...round, durationMs: plancherParGeste(round.durationMs, poidsGestes(round.steps)) };
}

/**
 * Le pool d'un SALON, selon ce que tous ses joueurs peuvent faire.
 *
 * Le multijoueur tirait dans le pool tactile pour tout le monde, toujours,
 * parce qu'un salon mélange par nature téléphones et PC et qu'on ne sait pas
 * à l'avance. C'était la règle de l'appareil le moins capable, et elle coûtait
 * quatre consignes à une table qui n'a que des claviers.
 *
 * Le choix se fait donc au SALON et non au joueur : entre PC, les dix-neuf
 * consignes s'ouvrent ; dès qu'un téléphone est assis, on retombe sur les
 * quinze tactiles. La scène et la consigne restent COMMUNES — c'est ce qui
 * fait qu'on crie ensemble et qu'on comprend d'un coup d'œil pourquoi le
 * voisin est tombé. Un tirage par joueur donnerait des plateaux différents,
 * puisque `instr.gen()` produit les pièces, et la kill-cam montrerait alors un
 * tableau que personne d'autre n'a vu.
 */
export const poolMulti = (clavier: boolean, consignes = 1): Instruction[] => {
  const base = clavier ? INSTRUCTIONS : TOUCH_INSTRUCTIONS;
  /*
   * ⚠️ ABSENT VAUT 1, et c'est ce qui rend le déploiement sûr dans les quatre
   * combinaisons. Un client ancien n'annonce rien → 1 ; un serveur ancien ne
   * transmet rien → 1 ; les deux côtés reconstruisent alors le catalogue
   * d'origine, à l'identique de la version d'hier. La manche 2 et au-delà ne
   * se tire que si le serveur ET chaque siège la connaissent.
   */
  if (consignes < 2) return base;
  return [
    ...base,
    ...CONSIGNES_MULTI.filter(
      (i) => (clavier || i.touch) && (VERSION_DE_CONSIGNE[i.id] ?? Infinity) <= consignes,
    ),
  ];
};

/** Raccourci : la manche complète d'un joueur donné. */
export const buildMultiRound = (
  seed: number,
  idx: number,
  rule: OneRule,
  pool?: Instruction[],
): Round => applyRule(draftShared(seed, idx, pool), rule, seed);
