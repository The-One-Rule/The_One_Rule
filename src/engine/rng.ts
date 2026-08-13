import type { Rng } from "./types";

/** PRNG déterministe, 32 bits, rapide. Même seed = même partie, partout. */
export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rInt = (rng: Rng, n: number): number => Math.floor(rng() * n);

export const rPick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;

export function rShuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export const rSome = <T>(rng: Rng, arr: readonly T[], n: number): T[] => rShuffle(rng, arr).slice(0, n);

/** true avec la probabilité p */
export const rChance = (rng: Rng, p: number): boolean => rng() < p;

/** Hash stable d'une chaîne vers un entier 32 bits — sert aux seeds nommés. */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
