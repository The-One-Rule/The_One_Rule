import { mulberry32, rPick } from "../engine/rng";
import { recentAverage } from "./progress";
import type { Save } from "./progress";

export type Metric = "runs" | "traps" | "best" | "dailyCleared" | "rounds" | "noKey";

export interface Quest {
  id: string;
  label: string;
  metric: Metric;
  target: number;
  reward: number;
}

export interface QuestView extends Quest {
  value: number;
  done: boolean;
  claimed: boolean;
}

/* --- quête 1 : présence. Toujours faisable, quel que soit le niveau. --- */
const PRESENCE: Array<(rng: () => number) => Quest> = [
  () => ({ id: "p_daily", label: "Termine le run du jour", metric: "dailyCleared", target: 1, reward: 10 }),
  () => ({ id: "p_runs3", label: "Joue 3 parties", metric: "runs", target: 3, reward: 10 }),
  () => ({ id: "p_rounds40", label: "Survis à 40 manches en tout", metric: "rounds", target: 40, reward: 10 }),
];

/* --- quête 2 : exploration. Pousse hors du confort. --- */
const EXPLORATION: Array<(rng: () => number) => Quest> = [
  () => ({ id: "e_traps3", label: "Déjoue 3 pièges", metric: "traps", target: 3, reward: 15 }),
  () => ({ id: "e_traps6", label: "Déjoue 6 pièges", metric: "traps", target: 6, reward: 20 }),
  () => ({ id: "e_nokey", label: "Atteins la manche 8 sans toucher au clavier", metric: "noKey", target: 8, reward: 15 }),
  () => ({ id: "e_rounds80", label: "Survis à 80 manches en tout", metric: "rounds", target: 80, reward: 15 }),
];

/**
 * Quête 3 : performance, calée sur le joueur.
 *
 * Un seuil fixe ("atteindre 30") est un mur infranchissable pour un débutant
 * et une formalité de 70 secondes pour un bon joueur. Le seuil suit donc la
 * moyenne des 5 derniers runs : toujours à portée, jamais offert.
 */
function performanceQuest(s: Save): Quest {
  const avg = recentAverage(s);
  const target = Math.max(5, Math.round(avg * 1.12) + 1);
  return {
    id: "x_beat",
    label: `Dépasse ${target} manches dans une partie`,
    metric: "best",
    target,
    reward: 20,
  };
}

export function questsOfDay(day: number, s: Save): Quest[] {
  const rng = mulberry32(day * 97 + 5);
  return [rPick(rng, PRESENCE)(rng), rPick(rng, EXPLORATION)(rng), performanceQuest(s)];
}

/** Remet les compteurs à zéro au changement de jour. */
export function ensureDay(s: Save, day: number): void {
  if (s.quests.day !== day) {
    s.quests = { day, state: {}, claimed: [] };
  }
  if (s.daily.day !== day) {
    s.daily = { day, played: false, score: 0, cleared: false, essais: 0 };
  }
}

export function viewQuests(s: Save, day: number): QuestView[] {
  return questsOfDay(day, s).map((q) => {
    const value = s.quests.state[q.metric] ?? 0;
    return {
      ...q,
      value,
      done: value >= q.target,
      claimed: s.quests.claimed.includes(q.id),
    };
  });
}

export function bump(s: Save, metric: Metric, value: number, mode: "add" | "max" = "add"): void {
  const cur = s.quests.state[metric] ?? 0;
  s.quests.state[metric] = mode === "add" ? cur + value : Math.max(cur, value);
}

/** Retourne les pièces gagnées et marque les quêtes comme encaissées. */
export function claimAll(s: Save, day: number): number {
  let gained = 0;
  for (const q of viewQuests(s, day)) {
    if (q.done && !q.claimed) {
      gained += q.reward;
      s.quests.claimed.push(q.id);
    }
  }
  s.coins += gained;
  return gained;
}
