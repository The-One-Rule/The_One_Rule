import { dayIndex } from "./daily";
import { cleEntrainement } from "./perfs";
import { PACE_DEFAULT } from "../engine/difficulty";
import { fusionne } from "../../shared/compte";
import type { Agregats } from "../../shared/compte";

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
  /**
   * Mode daltonien : chaque couleur porte en plus une trame.
   *
   * Purement du rendu — sauf un point de jeu, qui ne pouvait pas être évité :
   * LE DALTONIEN sort du tirage, parce qu'elle deviendrait inerte et donc un
   * avantage gratuit (voir `withoutInk`). C'est la même exception que pour une
   * règle matériellement injouable sur l'appareil.
   */
  daltonien: boolean;
  /**
   * Langue de l'accueil. Le jeu (règles, consignes, canvas) ne suit pas.
   *
   * `"fr"` par défaut : une sauvegarde ancienne n'a pas ce champ, et
   * `load()` reprend alors `fresh()`. Une valeur hors `{fr,en}` retombe
   * aussi sur le français — on ne laisse pas un localStorage trafiqué
   * éteindre l'écran.
   */
  lang: "fr" | "en";
  bestTraining: number;
  /**
   * Allure choisie pour l'entraînement (voir PACE_CHOICES).
   *
   * Le record `bestTraining` n'est inscrit qu'à l'allure de référence : un
   * record obtenu en DÉCOUVERTE ne se compare pas à un record obtenu en
   * RAPIDE, et un chiffre qui mélange les deux ne veut plus rien dire.
   */
  trainingPace: number;
  /** mesure d'usage : consentement, jour de première ouverture, jours vus */
  metrics: { on: boolean; asked: boolean; firstDay: number; lastDay: number };
  /**
   * Records, indexés par CLÉ DE COMPARABILITÉ (voir `game/perfs.ts`).
   *
   * Généralise `bestTraining`, qui reste écrit à côté parce que trois écrans
   * le lisent déjà. La clé porte le mode, le régime et la version de contenu :
   * deux chiffres obtenus dans des conditions différentes ne peuvent donc plus
   * se retrouver dans la même case, ce qui était jusqu'ici évité à la main et
   * seulement pour l'allure.
   */
  records: Record<string, number>;
  /**
   * Le compte, côté appareil.
   *
   * `revendiquePar` retient l'identifiant du compte qui a déjà absorbé la
   * progression de CET appareil. La fusion n'a lieu qu'une fois, et c'est ce
   * champ qui l'empêche de recommencer : sans lui, se connecter sur le
   * téléphone d'un ami aspirerait son carnet et sa série dans son propre
   * compte. Le cas est banal en playtest — vous êtes plusieurs sur les mêmes
   * appareils.
   *
   * Le garde est volontairement LOCAL. Un attaquant qui pourrait le contourner
   * a déjà l'appareil en main, donc déjà tout ce qu'il y a à prendre : le
   * mettre côté serveur ne protégerait de rien de plus et coûterait une table.
   */
  compte: {
    revendiquePar: string | null;
    /**
     * Signe du COMPTE, en index canonique (voir `net/glyph.ts`).
     *
     * `multi.glyph` juste au-dessus est une variante dérivée de l'`anonId` :
     * il ne survit donc pas à un changement d'appareil, alors qu'un signe est
     * précisément ce à quoi les autres vous reconnaissent d'un salon à
     * l'autre. Une fois connecté, c'est celui-ci qui fait foi.
     *
     * `null` = anonyme, et on retombe sur la variante locale.
     */
    glyphe: number | null;
  };
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
  daltonien: false,
  lang: "fr",
  bestTraining: 0,
  /*
   * L'entraînement démarre en DÉCOUVERTE, pas en NORMAL.
   *
   * Il est la rampe d'accès : sa raison d'être est qu'on y apprenne, et le
   * réglage ne sert à rien si personne ne le trouve. Rapporté en soirée : « le
   * mode entraînement est plutôt difficile actuellement », alors que l'allure
   * existait déjà — elle n'était simplement pas celle par défaut.
   *
   * Le joueur accélère quand il veut, et `bestTraining` ne s'inscrit qu'à
   * l'allure de référence : le record reste comparable.
   */
  trainingPace: 1.5,
  metrics: { on: true, asked: false, firstDay: -1, lastDay: -1 },
  records: {},
  compte: { revendiquePar: null, glyphe: null },
});

let cache: Save | null = null;

export function load(): Save {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Save;
      if (parsed.v === 1) {
        const s = { ...fresh(), ...parsed };
        if (s.lang !== "fr" && s.lang !== "en") s.lang = "fr";
        cache = s;
        return s;
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

/* ------------------------------------------------------------------ *
 * Passerelle vers le compte
 * ------------------------------------------------------------------ */

/**
 * Ce que cet appareil apporte à un compte.
 *
 * `bestTraining` est publié sous la clé de l'allure de référence : c'est
 * exactement le sens qu'il a toujours eu, il ne s'inscrivait qu'à `PACE_DEFAULT`.
 * Le convertir ici plutôt que de le transporter tel quel évite au serveur de
 * connaître une exception de plus.
 */
export function agregatsDe(s: Save): Agregats {
  const records = { ...s.records };
  const cle = cleEntrainement(PACE_DEFAULT);
  records[cle] = Math.max(records[cle] ?? 0, s.bestTraining);
  return {
    carnet: { ...s.encountered },
    serie: { count: s.streak.count, lastDay: s.streak.lastDay },
    records,
  };
}

/**
 * Réinjecte ce que le compte sait dans l'appareil.
 *
 * Union et maximum, jamais une affectation — la même loi que `fusionne`, parce
 * que c'est la même opération vue de l'autre côté. Un compte tout neuf ne doit
 * rien pouvoir effacer, et un appareil en retard ne doit rien perdre.
 */
export function appliqueAgregats(s: Save, a: Agregats): void {
  const fusionnes = fusionne(agregatsDe(s), a);
  s.encountered = fusionnes.carnet;
  s.streak.count = fusionnes.serie.count;
  s.streak.lastDay = fusionnes.serie.lastDay;
  s.records = fusionnes.records;
  s.bestTraining = Math.max(
    s.bestTraining,
    fusionnes.records[cleEntrainement(PACE_DEFAULT)] ?? 0,
  );
}

/** Inscrit un record local sous sa clé, s'il bat le précédent. */
export function inscritRecord(s: Save, cle: string, valeur: number): void {
  if (valeur > (s.records[cle] ?? 0)) s.records[cle] = valeur;
}
