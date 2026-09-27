/**
 * Client du mode classé.
 *
 * Une seule règle de conduite : le réseau peut toujours tomber, et le jeu doit
 * rester jouable quand il tombe. Aucune des fonctions ci-dessous ne lève —
 * elles renvoient `null` et l'appelant retombe sur l'entraînement.
 */

import { divisionOf, START_RATING } from "./elo";
import type { Division } from "./elo";
import type { LoggedInput } from "../engine/verify";

const ENDPOINT = (import.meta.env.VITE_RANKED_URL as string | undefined) ?? "";

export const rankedAvailable = (): boolean => ENDPOINT !== "";

export interface PublicProfile {
  name: string;
  rating: number;
  games: number;
  wins: number;
  division: Division;
}

export interface Opponent {
  name: string;
  rating: number;
  score: number;
  splits: number[];
  runId: string;
}

export interface MatchOffer {
  opponent: Opponent | null;
  seed: number;
  ruleId: string;
  me: PublicProfile;
}

export interface SubmitResult {
  score: number;
  cause: string;
  traps: number;
  verdict: "humain" | "douteux" | "automatisé";
  change: { delta: number; division: Division; promoted: boolean; floored: boolean } | null;
  me: PublicProfile;
  rejected?: boolean;
  reasons?: string[];
}

async function post<T>(action: string, body: Record<string, unknown>): Promise<T | null> {
  if (!ENDPOINT) return null;
  try {
    const res = await fetch(`${ENDPOINT}?a=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // hors ligne : l'appelant retombe sur l'entraînement
  }
}

export const findMatch = (id: string, name: string, waited: number): Promise<MatchOffer | null> =>
  post<MatchOffer>("queue", { id, name, waited });

export const submitRun = (payload: {
  id: string;
  name: string;
  seed: number;
  ruleId: string;
  inputs: LoggedInput[];
  capacites?: { clavier: boolean; maintien: boolean; encre: boolean; lettres?: boolean };
  catalogue?: number;
  opponentScore?: number;
  opponentRating?: number;
}): Promise<SubmitResult | null> => post<SubmitResult>("submit", payload);

/** Profil local affiché tant que le serveur n'a pas répondu. */
export const localProfile = (name: string, rating = START_RATING): PublicProfile => ({
  name,
  rating,
  games: 0,
  wins: 0,
  division: divisionOf(rating),
});
