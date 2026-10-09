/**
 * API du mode classé — fonction edge Vercel.
 *
 * Principe directeur : le serveur ne fait jamais confiance à un score. Il
 * reçoit un journal d'entrées, le REJOUE avec le moteur pur partagé, et le
 * score est ce que le rejeu produit. C'est pour ça que `src/engine/` n'a
 * jamais eu le droit de toucher au DOM ni à l'horloge.
 *
 * Le stockage est derrière une interface : la version en mémoire fait tourner
 * l'API en local et sur une instance unique. Pour passer en production, on
 * implémente `Store` sur Postgres ou KV — c'est le seul fichier à toucher.
 */

import { verifyRun } from "../src/engine/verify";
import type { RunClaim } from "../src/engine/verify";
import { ONE_RULES } from "../src/engine/rules";
import { analyseReactions, rankedEligibility } from "../src/ranked/antibot";
import { START_RATING, applyMatch, divisionOf, searchWindow } from "../src/ranked/elo";

export const config = { runtime: "edge" };

/* ------------------------------------------------------------------ *
 * Stockage
 * ------------------------------------------------------------------ */

export interface Profile {
  id: string;
  name: string;
  rating: number;
  games: number;
  peakFloor: number;
  wins: number;
  /** cumul de suspicion : un tricheur occasionnel finit par se voir */
  flags: number;
}

export interface StoredRun {
  id: string;
  owner: string;
  ownerName: string;
  rating: number;
  seed: number;
  ruleId: string;
  score: number;
  /** journal complet : c'est lui qui fait autorité, pas le score */
  inputs: RunClaim["inputs"];
  splits: number[];
  createdAt: number;
}

export interface Store {
  getProfile(id: string): Promise<Profile | null>;
  putProfile(p: Profile): Promise<void>;
  putRun(r: StoredRun): Promise<void>;
  /** runs jouables comme fantôme, dans une fenêtre de classement */
  findRuns(rating: number, window: number, excludeOwner: string, limit: number): Promise<StoredRun[]>;
  /** Le run servi en fantôme, relu au moment du verdict. */
  runById(id: string): Promise<StoredRun | null>;
  top(limit: number): Promise<Profile[]>;
}

class MemoryStore implements Store {
  private profiles = new Map<string, Profile>();
  private runs: StoredRun[] = [];

  async getProfile(id: string): Promise<Profile | null> {
    return this.profiles.get(id) ?? null;
  }
  async putProfile(p: Profile): Promise<void> {
    this.profiles.set(p.id, p);
  }
  async putRun(r: StoredRun): Promise<void> {
    this.runs.push(r);
    // on garde un vivier borné : les runs récents suffisent à alimenter les duels
    if (this.runs.length > 5000) this.runs.splice(0, this.runs.length - 5000);
  }
  async findRuns(rating: number, window: number, exclude: string, limit: number): Promise<StoredRun[]> {
    return this.runs
      .filter((r) => r.owner !== exclude && Math.abs(r.rating - rating) <= window)
      .slice(-400)
      .sort(() => Math.random() - 0.5)
      .slice(0, limit);
  }
  async runById(id: string): Promise<StoredRun | null> {
    return this.runs.find((r) => r.id === id) ?? null;
  }
  async top(limit: number): Promise<Profile[]> {
    return [...this.profiles.values()]
      .filter((p) => p.games >= 5)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
  }
}

const store: Store = new MemoryStore();

/* ------------------------------------------------------------------ *
 * Garde-fous d'entrée
 * ------------------------------------------------------------------ */

const MAX_BODY = 120_000;
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const clean = (s: unknown, max: number): string =>
  typeof s === "string" ? s.slice(0, max).replace(/[^\p{L}\p{N} _.-]/gu, "") : "";

async function profileOf(id: string, name: string): Promise<Profile> {
  const found = await store.getProfile(id);
  if (found) {
    if (name && found.name !== name) {
      found.name = name;
      await store.putProfile(found);
    }
    return found;
  }
  const fresh: Profile = {
    id,
    name: name || "ANONYME",
    rating: START_RATING,
    games: 0,
    peakFloor: 0,
    wins: 0,
    flags: 0,
  };
  await store.putProfile(fresh);
  return fresh;
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get("a");

  if (action === "top") {
    // ⚠️ Le profil PUBLIC seulement. La liste rendait chaque profil entier
    // moins `flags` — donc son `id`, qui est l'`anonId` du joueur : sa clé de
    // reprise de siège en salon et son identifiant de mesure (audit S1).
    return json({ top: (await store.top(50)).map(publicProfile) });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "too large" }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const id = clean(body.id, 24);
  const name = clean(body.name, 14).toUpperCase();
  if (!id) return json({ error: "id manquant" }, 400);
  const me = await profileOf(id, name);

  /* --- appariement : on sert un adversaire enregistré --- */
  if (action === "queue") {
    const waited = Number(body.waited) || 0;
    const window = searchWindow(waited);
    const found = await store.findRuns(me.rating, window, me.id, 1);
    const rule = ONE_RULES[Math.floor(Math.random() * ONE_RULES.length)]!;

    if (!found.length) {
      // File vide : plutôt que de faire patienter, on propose un run étalon.
      // Un joueur qui attend est un joueur qui ferme l'onglet.
      return json({
        opponent: null,
        seed: (Math.random() * 2 ** 31) | 0,
        ruleId: rule.id,
        me: publicProfile(me),
      });
    }
    const r = found[0]!;
    return json({
      opponent: { name: r.ownerName, rating: r.rating, score: r.score, splits: r.splits, runId: r.id },
      seed: r.seed,
      ruleId: r.ruleId,
      me: publicProfile(me),
    });
  }

  /* --- remise d'un run : rejeu, contrôle, classement --- */
  if (action === "submit") {
    const claim: RunClaim = {
      seed: Number(body.seed),
      ruleId: clean(body.ruleId, 20),
      mode: "ranked",
      inputs: (body.inputs ?? []) as RunClaim["inputs"],
      // Mêmes lectures que `api/perf.ts` : seul `false` compte, seul 2 est connu.
      capacites: {
        clavier: (body.capacites as Record<string, unknown> | undefined)?.clavier !== false,
        maintien: (body.capacites as Record<string, unknown> | undefined)?.maintien !== false,
        encre: (body.capacites as Record<string, unknown> | undefined)?.encre !== false,
        lettres: (body.capacites as Record<string, unknown> | undefined)?.lettres !== false,
      },
      catalogue: body.catalogue === 3 ? 3 : body.catalogue === 2 ? 2 : undefined,
    };

    const v = verifyRun(claim);
    if (!v.ok) return json({ error: "run invalide", reason: v.reason }, 400);

    const bot = analyseReactions(v.reactions);
    const elig = rankedEligibility(bot);

    if (!elig.countsForRating) {
      me.flags += 1;
      await store.putProfile(me);
      return json({
        rejected: true,
        verdict: bot.verdict,
        reasons: bot.reasons,
        me: publicProfile(me),
      });
    }

    /*
     * Le score adverse est relu du stockage, jamais accepté du client.
     *
     * ⚠️ Ce commentaire était déjà là, au-dessus de `Number(body.opponentScore)` :
     * le client fixait lui-même le score ET le classement de l'adversaire, donc
     * son propre gain d'Elo (audit S1). Le client ne désigne plus que le run
     * qu'on lui a servi ; un run introuvable (autre instance, vivier recyclé)
     * ne fait bouger aucun classement.
     */
    const opp = typeof body.opponentRunId === "string" ? await store.runById(body.opponentRunId.slice(0, 64)) : null;
    const hasOpponent = opp !== null && opp.owner !== me.id;
    const oppScore = opp?.score ?? 0;
    const oppRating = opp?.rating ?? 0;

    let change = null;
    if (hasOpponent) {
      const c = applyMatch({
        rating: me.rating,
        games: me.games,
        peakFloor: me.peakFloor,
        myScore: v.score,
        theirScore: oppScore,
        theirRating: oppRating,
      });
      me.rating = c.rating;
      me.peakFloor = c.peakFloor;
      me.games += 1;
      if (v.score > oppScore) me.wins += 1;
      await store.putProfile(me);
      change = { delta: c.delta, division: c.division, promoted: c.promoted, floored: c.floored };
    }

    // Seul un run au profil parfaitement humain rejoint le vivier de fantômes :
    // on ne fait pas affronter à tout le monde une partie possiblement truquée.
    if (elig.servableAsGhost && v.score >= 5) {
      await store.putRun({
        id: `${id}-${Date.now().toString(36)}`,
        owner: me.id,
        ownerName: me.name,
        rating: me.rating,
        seed: claim.seed,
        ruleId: claim.ruleId,
        score: v.score,
        inputs: claim.inputs,
        splits: splitsFrom(v.reactions, claim),
        createdAt: Date.now(),
      });
    }

    return json({
      score: v.score,
      cause: v.cause,
      traps: v.trapsSurvived,
      verdict: bot.verdict,
      change,
      me: publicProfile(me),
    });
  }

  return json({ error: "action inconnue" }, 404);
}

const publicProfile = (p: Profile) => ({
  name: p.name,
  rating: p.rating,
  games: p.games,
  wins: p.wins,
  division: divisionOf(p.rating),
});

/** Instants cumulés de franchissement, reconstitués depuis le rejeu. */
function splitsFrom(reactions: number[], claim: RunClaim): number[] {
  const out: number[] = [];
  let i = 0;
  for (const input of claim.inputs) {
    if (i >= reactions.length) break;
    out.push(input.t);
    i++;
  }
  return out.slice(0, reactions.length);
}
