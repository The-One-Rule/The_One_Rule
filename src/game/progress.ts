import { dayIndex } from "./daily";

const KEY = "oneRule.save.v1";

export interface RuleRecord {
  best: number;
  cleared: boolean;
}

export interface Save {
  v: 1;
  anonId: string;
  /** carnet : règles déjà rencontrées et meilleur résultat sur chacune */
  encountered: Record<string, RuleRecord>;
  streak: { count: number; lastDay: number; graceWeek: number; graceLeft: number };
  /** 5 derniers scores, sert à calibrer la quête de performance */
  recent: number[];
  daily: { day: number; played: boolean; score: number; cleared: boolean };
  quests: { day: number; state: Record<string, number>; claimed: string[] };
  coins: number;
  /** identité du classé : pseudo court et dernier classement connu */
  ranked: { name: string; rating: number; games: number };
  /**
   * Identité multijoueur.
   *
   * `glyph` est la variante de signe choisie par le joueur — le vocabulaire
   * en compte 144, et aucun n'était jusqu'ici montré ni choisi. `matches`
   * compte les parties terminées : à zéro, on est nouveau, et c'est ce qui
   * déclenche l'accueil du débutant.
   */
  multi: { glyph: number; matches: number };
  sound: boolean;
  music: boolean;
  bestTraining: number;
  /** mesure d'usage : consentement, jour de première ouverture, jours vus */
  metrics: { on: boolean; asked: boolean; firstDay: number; lastDay: number };
}

const fresh = (): Save => ({
  v: 1,
  anonId: Math.random().toString(36).slice(2, 12),
  encountered: {},
  streak: { count: 0, lastDay: -99, graceWeek: -1, graceLeft: 1 },
  recent: [],
  daily: { day: -1, played: false, score: 0, cleared: false },
  quests: { day: -1, state: {}, claimed: [] },
  coins: 0,
  ranked: { name: "", rating: 1000, games: 0 },
  multi: { glyph: 0, matches: 0 },
  sound: true,
  music: true,
  bestTraining: 0,
  metrics: { on: true, asked: false, firstDay: -1, lastDay: -1 },
});

let cache: Save | null = null;

export function load(): Save {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Save;
      if (parsed.v === 1) {
        cache = { ...fresh(), ...parsed };
        return cache;
      }
    }
  } catch {
    /* stockage indisponible (navigation privée) : on joue quand même, sans mémoire */
  }
  cache = fresh();
  return cache;
}

export function save(s: Save): void {
  cache = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const mutate = (fn: (s: Save) => void): Save => {
  const s = load();
  fn(s);
  save(s);
  return s;
};

/* ------------------------------------------------------------------ *
 * Streak
 * ------------------------------------------------------------------ */

/**
 * Met à jour la série. Un jour de grâce par semaine, non négociable :
 * sans lui, le premier jour manqué détruit la série et le joueur ne revient
 * jamais. Avec lui, il voit "série protégée" et il revient le lendemain.
 */
export function touchStreak(s: Save, day: number): { kept: boolean; graceUsed: boolean } {
  const week = Math.floor(day / 7);
  if (s.streak.graceWeek !== week) {
    s.streak.graceWeek = week;
    s.streak.graceLeft = 1;
  }
  const gap = day - s.streak.lastDay;
  if (gap === 0) return { kept: true, graceUsed: false };
  if (gap === 1) {
    s.streak.count += 1;
    s.streak.lastDay = day;
    return { kept: true, graceUsed: false };
  }
  if (gap === 2 && s.streak.graceLeft > 0) {
    s.streak.graceLeft -= 1;
    s.streak.count += 1;
    s.streak.lastDay = day;
    return { kept: true, graceUsed: true };
  }
  s.streak.count = 1;
  s.streak.lastDay = day;
  return { kept: false, graceUsed: false };
}

/* ------------------------------------------------------------------ *
 * Carnet
 * ------------------------------------------------------------------ */

export function recordRun(ruleId: string, score: number, cleared: boolean): Save {
  return mutate((s) => {
    const prev = s.encountered[ruleId] ?? { best: 0, cleared: false };
    s.encountered[ruleId] = {
      best: Math.max(prev.best, score),
      cleared: prev.cleared || cleared,
    };
    s.recent = [...s.recent, score].slice(-5);
  });
}

export const isEncountered = (s: Save, ruleId: string): boolean => !!s.encountered[ruleId];

/** Moyenne des 5 derniers runs — base de la quête de performance. */
export function recentAverage(s: Save): number {
  if (s.recent.length === 0) return 0;
  return s.recent.reduce((a, b) => a + b, 0) / s.recent.length;
}

export const today = (): number => dayIndex();
