/**
 * Mode coop — primitives PURES.
 *
 * Une vague, une scène IDENTIQUE, des interdits de cible. Le nom d'une règle
 * veut dire ce qu'il veut dire en solo : LA ROUE interdit les ronds, elle
 * n'autorise PAS « uniquement les ronds ».
 *
 * ⚠️ N'entre PAS dans `VERSION_CONTENU` : ce module n'est importé ni par
 * `version.ts`, ni par les consignes, ni par `difficulty.ts`. Pas de 17ᵉ
 * règle, pas de `sansRegle`.
 */

import { ONE_RULES } from "./rules";
import { place, MAX_ENTITIES } from "./scene";
import { mulberry32, rChance, rShuffle } from "./rng";
import { COLOR_IDS, SHAPE_IDS } from "./types";
import type { Action, Entity, EntitySpec, JudgeContext, OneRule, Round, SizeId } from "./types";

export const COOP_MIN_JOUEURS = 4;
export const COOP_MAX_ASIS = 6;
export const COOP_VIES_PAR_JOUEUR = 3;
export const COOP_VAGUE_MS = 30000;
export const COOP_VAGUE_MIN = 20000;
export const COOP_VAGUE_MAX = 40000;

/** Séparé du tirage des scènes : même graine, autre usage. */
const SEL_REGLES = 0xc005e1d | 0;
const SEL_SCENE = 0xc00c5ce | 0;
const SEL_DUREE = 0xc00d4e | 0;

/** L'effectif assis autorise-t-il le lancement ? UI et serveur, même règle. */
export function peutLancerCoop(assis: number): boolean {
  return assis >= COOP_MIN_JOUEURS && assis <= COOP_MAX_ASIS;
}

export function viesInitialesCoop(joueurs: number): number {
  return COOP_VIES_PAR_JOUEUR * joueurs;
}

/**
 * Pool coop : les interdits de CIBLE.
 *
 * Exclus, chacun pour une raison :
 *   · les déformations (`transform`) — la scène est commune, un Jumeau
 *     local la casserait ;
 *   · LA MAIN GAUCHE — ce n'est pas un interdit de cible ;
 *   · LA SECONDE — idem, une fenêtre, pas une cible ;
 *   · LA VOYELLE — elle ne juge qu'une touche, or le fil coop n'envoie
 *     que `{ k: "c", i }`. La garder serait une règle inerte, un avantage
 *     gratuit (décision n°1).
 */
export function poolCoop(): OneRule[] {
  return ONE_RULES.filter(
    (r) =>
      r.traps &&
      !r.transform &&
      !r.watchRelease &&
      r.id !== "voyelle" &&
      r.id !== "seconde",
  );
}

/** Une règle DIFFÉRENTE par siège, tirée dans `poolCoop`, déterministe. */
export function attribueReglesCoop(seed: number, ids: readonly string[]): Map<string, OneRule> {
  const rng = mulberry32((seed ^ SEL_REGLES) >>> 0);
  const tirees = rShuffle(rng, poolCoop());
  const out = new Map<string, OneRule>();
  ids.forEach((id, i) => {
    const r = tirees[i % tirees.length];
    if (r) out.set(id, r);
  });
  return out;
}

/**
 * Durée d'une vague, déterministe depuis la graine et l'index.
 *
 * Borne [20000, 40000]. `windowMs` n'entre pas : le rythme est du MODE,
 * et `windowMs` est un levier de `VERSION_CONTENU`.
 */
export function dureeVague(seed: number, idx: number): number {
  const rng = mulberry32((seed ^ SEL_DUREE ^ Math.imul(idx + 1, 0x9e3779b9)) >>> 0);
  const span = COOP_VAGUE_MAX - COOP_VAGUE_MIN;
  return COOP_VAGUE_MIN + Math.floor(rng() * (span + 1));
}

/**
 * Scène commune d'une vague : `place()` existant, 15 cellules, `need=1`
 * (chaque pièce se prend d'un clic).
 *
 * Calibrée pour qu'aucune règle du pool ne soit inerte sur un plateau plein :
 * une forme unique (SOLITAIRE), un seul L (COLOSSE), les quatre couleurs,
 * la grille entière (GAUCHER, ANGLES).
 */
export function draftCoop(seed: number, idx: number): { ents: Entity[] } {
  const rng = mulberry32((seed ^ SEL_SCENE ^ Math.imul(idx + 1, 0x85ebca6b)) >>> 0);
  const formes = rShuffle(rng, SHAPE_IDS);
  const unique = formes[0]!;
  const a = formes[1]!;
  const b = formes[2]!;
  const shapes = [unique, ...Array<typeof a>(7).fill(a), ...Array<typeof b>(7).fill(b)];
  const specs: EntitySpec[] = shapes.map((shape, i) => ({
    shape,
    color: COLOR_IDS[i % COLOR_IDS.length]!,
    size: (i === 1 ? "L" : "M") as SizeId,
    moving: rChance(rng, 0.28),
  }));
  return { ents: place(rng, rShuffle(rng, specs).slice(0, MAX_ENTITIES)) };
}

/** Round d'affichage — consigne générique, pas une cible solo. */
export function roundCoop(
  seed: number,
  idx: number,
  consumed: ReadonlySet<number> = new Set(),
): Round {
  const { ents } = draftCoop(seed, idx);
  const visibles = ents.filter((e) => !consumed.has(e.idx));
  const durationMs = dureeVague(seed, idx);
  return roundPourJuge(visibles, durationMs);
}

export function roundPourJuge(ents: Entity[], durationMs: number): Round {
  return {
    instructionId: "coop",
    text: "NETTOIEZ LE TERRAIN",
    phrase: { cle: "coop.nettoyez" },
    ents,
    steps: [],
    trap: false,
    durationMs,
  };
}

export function ctxCoop(ents: Entity[], durationMs: number, elapsedMs: number): JudgeContext {
  return { round: roundPourJuge(ents, durationMs), elapsedMs };
}

/**
 * Juge UN clic contre LA règle du cliqueur, sur les entités encore visibles.
 *
 * `action.ent` doit être une référence du tableau `visibles` : LE COLOSSE
 * compare par identité d'objet.
 */
export function jugerClic(
  rule: OneRule,
  action: Action,
  visibles: Entity[],
  elapsedMs: number,
  durationMs: number,
): "interdit" | "licite" | "vide" {
  if (action.kind !== "click" || !action.ent) return "vide";
  const motif = rule.judge(action, ctxCoop(visibles, durationMs, elapsedMs));
  return motif ? "interdit" : "licite";
}
