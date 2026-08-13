/**
 * Vérification déterministe d'un run.
 *
 * C'est le module pour lequel `engine/` est resté pur depuis le premier jour :
 * aucun DOM, aucune horloge, aucun `Math.random()`. Le serveur peut donc
 * rejouer une partie exactement comme le navigateur l'a jouée, et comparer.
 *
 * Un score envoyé par le client est une affirmation, pas un fait. On ne stocke
 * jamais un score : on stocke un journal d'entrées, on le rejoue, et le score
 * est ce que le rejeu produit.
 *
 * Ce fichier tourne à l'identique dans le navigateur et dans la fonction edge.
 */

import { mulberry32 } from "./rng";
import { ONE_RULES } from "./rules";
import { buildRound } from "./round";
import { resolveAction, resolveTimeout } from "./resolve";
import { DAILY_LENGTH, GRACE_ROUNDS } from "./difficulty";
import type { Action, Entity, OneRule, Round, RoundProgress } from "./types";

/** Une entrée journalisée. `t` est en ms depuis le début du run. */
export type LoggedInput =
  | { t: number; k: "c"; i: number | null } // clic : index de la pièce, ou null pour le vide
  | { t: number; k: "x"; x: number; y: number } // clic hors pièce, position conservée
  | { t: number; k: "k"; key: string } // touche
  | { t: number; k: "r"; key: string }; // relâchement

export interface RunClaim {
  seed: number;
  ruleId: string;
  mode: "daily" | "training" | "ranked";
  inputs: LoggedInput[];
}

export interface Verdict {
  ok: boolean;
  /** score réel produit par le rejeu — fait autorité sur toute prétention */
  score: number;
  cleared: boolean;
  cause: "macro" | "wrong" | "timeout" | "complete";
  trapsSurvived: number;
  /**
   * Délais de réaction, en ms.
   *
   * Uniquement les manches franchies par une ACTION du joueur. Une manche
   * « ne fais rien » se franchit en laissant filer le temps : y voir une
   * réaction de 2400 ms polluerait la distribution et ferait passer un bot
   * pour un humain en gonflant artificiellement sa dispersion.
   */
  reactions: number[];
  /** durée totale du run en ms */
  durationMs: number;
  reason?: string;
}

const MAX_INPUTS = 4000;
const MAX_RUN_MS = 45 * 60_000;

const fail = (reason: string): Verdict => ({
  ok: false,
  score: 0,
  cleared: false,
  cause: "wrong",
  trapsSurvived: 0,
  reactions: [],
  durationMs: 0,
  reason,
});

function toAction(input: LoggedInput, ents: Entity[]): Action | null {
  switch (input.k) {
    case "c": {
      if (input.i === null) return { kind: "click", ent: null, x: 0, y: 0 };
      const ent = ents[input.i];
      if (!ent) return null;
      return { kind: "click", ent, x: ent.x, y: ent.y };
    }
    case "x":
      return { kind: "click", ent: null, x: input.x, y: input.y };
    case "k":
      return { kind: "key", key: input.key };
    case "r":
      return { kind: "release", key: input.key };
  }
}

/**
 * Rejoue un run.
 *
 * L'implémentation double délibérément la logique de `Session` plutôt que de
 * l'importer : `Session` vit dans `game/` et connaît les modes, la persistance
 * et les quêtes. Le vérificateur ne doit dépendre que du moteur pur, sinon il
 * devient impossible à exécuter côté serveur.
 */
export function verifyRun(claim: RunClaim): Verdict {
  const rule: OneRule | undefined = ONE_RULES.find((r) => r.id === claim.ruleId);
  if (!rule) return fail("règle inconnue");
  if (!Number.isFinite(claim.seed)) return fail("graine invalide");
  if (!Array.isArray(claim.inputs)) return fail("journal absent");
  if (claim.inputs.length > MAX_INPUTS) return fail("journal trop long");

  // le journal doit être monotone : un temps qui recule signale un montage
  for (let i = 1; i < claim.inputs.length; i++) {
    if (claim.inputs[i]!.t < claim.inputs[i - 1]!.t) return fail("journal non monotone");
  }
  if (claim.inputs.length && claim.inputs[claim.inputs.length - 1]!.t > MAX_RUN_MS) {
    return fail("run trop long");
  }

  const rng = mulberry32(claim.seed);
  const limited = claim.mode !== "training";
  const maxRounds = limited ? DAILY_LENGTH : 400;
  const grace = limited ? GRACE_ROUNDS : 0;

  let level = 0;
  let traps = 0;
  const reactions: number[] = [];
  let roundStart = 0;
  let round: Round = buildRound(rng, level, rule);
  let progress: RoundProgress = { step: 0 };
  let cursor = 0;

  const nextRound = (at: number): void => {
    round = buildRound(rng, level, rule);
    progress = { step: 0 };
    roundStart = at;
  };

  const survive = (at: number, byAction: boolean): boolean => {
    if (byAction) reactions.push(at - roundStart);
    if (round.trap) traps++;
    level++;
    if (level >= maxRounds) return true; // run complet
    nextRound(at);
    return false;
  };

  for (let guard = 0; guard < MAX_INPUTS * 4; guard++) {
    const deadline = roundStart + round.durationMs;
    const next = claim.inputs[cursor];

    // Expiration avant la prochaine entrée : la manche se conclut seule.
    if (!next || next.t >= deadline) {
      const outcome = resolveTimeout(round, progress);
      if (outcome.kind === "survive") {
        // franchie par expiration : ce n'est pas une réaction
        if (survive(deadline, false)) {
          return {
            ok: true,
            score: level,
            cleared: true,
            cause: "complete",
            trapsSurvived: traps,
            reactions,
            durationMs: deadline,
          };
        }
        continue;
      }
      if (level < grace) {
        level++;
        nextRound(deadline);
        continue;
      }
      return {
        ok: true,
        score: level,
        cleared: false,
        cause: "timeout",
        trapsSurvived: traps,
        reactions,
        durationMs: deadline,
      };
    }

    cursor++;
    const action = toAction(next, round.ents);
    if (!action) return fail("entrée hors scène");

    const res = resolveAction(round, progress, action, next.t - roundStart, rule.judge);
    progress = res.progress;

    if (res.outcome.kind === "survive") {
      if (survive(next.t, true)) {
        return {
          ok: true,
          score: level,
          cleared: true,
          cause: "complete",
          trapsSurvived: traps,
          reactions,
          durationMs: next.t,
        };
      }
    } else if (res.outcome.kind === "death") {
      if (level < grace) {
        level++;
        nextRound(next.t);
        continue;
      }
      return {
        ok: true,
        score: level,
        cleared: false,
        cause: res.outcome.cause,
        trapsSurvived: traps,
        reactions,
        durationMs: next.t,
        reason: res.outcome.reason,
      };
    }
  }

  return fail("rejeu non convergent");
}
