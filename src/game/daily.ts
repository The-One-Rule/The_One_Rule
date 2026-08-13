import { mulberry32, rShuffle } from "../engine/rng";
import { ONE_RULES } from "../engine/rules";
import type { OneRule } from "../engine/types";

/** Jour 1 = 1er janvier 2026, en UTC. Tout le monde change de jour au même instant. */
const EPOCH = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;

export function dayIndex(now: Date = new Date()): number {
  return Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - EPOCH) / DAY_MS);
}

export const dailySeed = (day: number): number => (day * 2654435761) >>> 0;

/**
 * Rotation de la règle du jour.
 * Permutation complète par cycle de 12 jours plutôt qu'un simple modulo :
 * toutes les règles sortent avant qu'une seule ne repasse, et l'ordre change
 * à chaque cycle. Déterministe, donc la règle de DEMAIN est calculable.
 */
export function ruleOfDay(day: number): OneRule {
  const n = ONE_RULES.length;
  const cycle = Math.floor(day / n);
  const pos = ((day % n) + n) % n;
  return rShuffle(mulberry32(cycle + 1), ONE_RULES)[pos]!;
}

export const tomorrowRule = (day: number): OneRule => ruleOfDay(day + 1);

/** Le run quotidien : même seed, même règle, même suite de manches pour tous. */
export const dailyRng = (day: number) => mulberry32(dailySeed(day));
