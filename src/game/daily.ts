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

/**
 * La règle d'une partie d'entraînement.
 *
 * L'ancienne version tirait parmi les règles DÉJÀ RENCONTRÉES, avec LE SANG
 * pour seul repli. Les deux se refermaient l'un sur l'autre : un joueur neuf
 * n'a rien rencontré, donc il jouait LE SANG, ce qui marquait LE SANG comme
 * rencontrée — donc le pool restait LE SANG. La seule sortie était le run du
 * jour, une fois par vingt-quatre heures.
 *
 * Mesuré sur le playtest du 28/08/2026 : sur 33 parties, LE SANG apparaît 30
 * fois et LE JUMEAU 3. Les dix autres règles n'ont jamais été jouées par
 * personne. « J'ai eu six ou sept fois d'affilée la même règle » — c'était le
 * comportement nominal, pas de la malchance.
 *
 * L'intention d'origine était de ne pas brûler la surprise du run du jour.
 * Elle est conservée telle quelle : c'est la règle DU JOUR qu'on exclut, et
 * elle seule. Les onze autres s'ouvrent.
 *
 * Deux préférences par-dessus, dans cet ordre :
 *   · ce qu'on n'a jamais vu passe d'abord — le catalogue s'apprend en jouant,
 *     ce qui est aussi le meilleur onboarding possible ;
 *   · à catalogue épuisé, on évite au moins de resservir la précédente.
 *
 * Pure et déterministe à RNG donné : c'est ce qui la rend testable.
 */
export function trainingRule(
  opts: {
    /** Règle du jour, gardée pour le run quotidien. */
    duJour: string;
    /** Identifiants déjà rencontrés (carnet). */
    connues: ReadonlySet<string>;
    /** Dernière règle d'entraînement servie, pour ne pas la répéter. */
    derniere: string | null;
    /** Écarter les règles à touche maintenue (appareil sans clavier). */
    sansMaintien: boolean;
    rng: () => number;
  },
  rules: readonly OneRule[] = ONE_RULES,
): OneRule {
  const jouables = rules.filter(
    (r) => !(opts.sansMaintien && r.watchRelease !== undefined),
  );
  // On n'écarte la règle du jour que s'il reste autre chose à jouer : mieux
  // vaut la resservir que de n'avoir aucune partie à lancer.
  const horsJour = jouables.filter((r) => r.id !== opts.duJour);
  const base = horsJour.length ? horsJour : jouables;

  const neuves = base.filter((r) => !opts.connues.has(r.id));
  const pool = neuves.length ? neuves : base;

  // Éviter la répétition immédiate, sauf s'il ne reste rien d'autre.
  const varie = pool.filter((r) => r.id !== opts.derniere);
  const final = varie.length ? varie : pool;

  return final[Math.floor(opts.rng() * final.length)] ?? final[0]!;
}

/** Le run quotidien : même seed, même règle, même suite de manches pour tous. */
export const dailyRng = (day: number) => mulberry32(dailySeed(day));
