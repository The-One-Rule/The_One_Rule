import { DAILY_LENGTH, GRACE_ROUNDS, isTierBoundary, tierOf } from "../engine/difficulty";
import { INSTRUCTIONS, TOUCH_INSTRUCTIONS } from "../engine/instructions";
import { buildRound } from "../engine/round";
import { resolveAction, resolveTimeout } from "../engine/resolve";
import type { Action, Instruction, OneRule, Outcome, Rng, Round, RoundProgress } from "../engine/types";
import type { LoggedInput } from "../engine/verify";

export type Mode = "daily" | "training" | "ranked";
export type Phase = "playing" | "freeze" | "over";

export interface SessionEnd {
  score: number;
  /** instants cumulés de franchissement de chaque manche, pour le duel */
  splits: number[];
  cleared: boolean;
  cause: "macro" | "wrong" | "timeout" | "complete";
  reason: string;
  marks: string[];
  trapsSurvived: number;
  usedKeyboard: boolean;
}

const FREEZE_MS = 520;

/**
 * Orchestrateur d'un run. Ne connaît pas le DOM et ne lit jamais l'horloge :
 * l'appelant lui passe `now`. Un run est donc rejouable à l'identique.
 */
export class Session {
  readonly mode: Mode;
  readonly rule: OneRule;
  private rng: Rng;
  level = 0;
  round!: Round;
  progress: RoundProgress = { step: 0 };
  phase: Phase = "playing";
  marks: string[] = [];
  trapsSurvived = 0;
  usedKeyboard = false;
  end: SessionEnd | null = null;
  /** temps écoulé depuis le début du run, à chaque manche franchie */
  splits: number[] = [];
  /** Journal complet, rejoué tel quel par le serveur pour valider le score. */
  log: LoggedInput[] = [];
  readonly seed: number;
  /** Pool de consignes : tactile sur téléphone, complet ailleurs. */
  private pool: Instruction[];
  /** Palier franchi à la manche précédente, pour l'annoncer une seule fois. */
  tierJustCrossed = false;

  private roundStart = 0;
  private freezeUntil = 0;
  private lastDeath: { cause: SessionEnd["cause"]; reason: string } = { cause: "wrong", reason: "" };
  /** manches d'échauffement restantes : elles ne tuent pas */
  private grace: number;

  private runStart: number;

  constructor(opts: {
    mode: Mode;
    rule: OneRule;
    rng: Rng;
    now: number;
    seed: number;
    touchOnly?: boolean;
  }) {
    this.mode = opts.mode;
    this.rule = opts.rule;
    this.rng = opts.rng;
    this.seed = opts.seed;
    this.runStart = opts.now;
    this.grace = opts.mode === "training" ? 0 : GRACE_ROUNDS;
    this.pool = opts.touchOnly ? TOUCH_INSTRUCTIONS : INSTRUCTIONS;
    this.nextRound(opts.now);
  }

  get maxRounds(): number {
    // Le classé est borné comme le quotidien : un match doit se conclure, et
    // deux runs de longueur différente ne se comparent pas.
    return this.mode === "training" ? Infinity : DAILY_LENGTH;
  }

  get inGrace(): boolean {
    return this.level < this.grace;
  }

  get tier(): number {
    return tierOf(this.level);
  }

  elapsed(now: number): number {
    return now - this.roundStart;
  }

  /** 0 → 1 sur la fenêtre de la manche courante. */
  ratio(now: number): number {
    return Math.min(1, this.elapsed(now) / this.round.durationMs);
  }

  private nextRound(now: number): void {
    this.round = buildRound(this.rng, this.level, this.rule, this.pool);
    this.progress = { step: 0 };
    this.roundStart = now;
  }

  /** Temps écoulé depuis le début du run — repère du duel asynchrone. */
  runTime(now: number): number {
    return now - this.runStart;
  }

  private survive(now: number): void {
    this.splits.push(Math.round(now - this.runStart));
    this.marks.push(this.round.trap ? "🟦" : "🟩");
    if (this.round.trap) this.trapsSurvived++;
    this.level++;
    this.tierJustCrossed = isTierBoundary(this.level);
    if (this.level >= this.maxRounds) {
      this.finish("complete", "TENU JUSQU'AU BOUT", true);
      return;
    }
    this.nextRound(now);
  }

  private die(outcome: Extract<Outcome, { kind: "death" }>, now: number): void {
    // échauffement : la manche est perdue mais le run continue
    if (this.inGrace) {
      this.marks.push("🟨");
      this.level++;
      this.nextRound(now);
      return;
    }
    this.marks.push("🟥");
    this.lastDeath = { cause: outcome.cause, reason: outcome.reason };
    this.phase = "freeze";
    this.freezeUntil = now + FREEZE_MS;
  }

  private finish(cause: SessionEnd["cause"], reason: string, cleared: boolean): void {
    this.phase = "over";
    this.end = {
      score: this.level,
      splits: this.splits,
      cleared,
      cause,
      reason,
      marks: this.marks,
      trapsSurvived: this.trapsSurvived,
      usedKeyboard: this.usedKeyboard,
    };
  }

  /** Une action du joueur. Retourne le verdict pour que l'UI puisse réagir. */
  input(action: Action, now: number): Outcome {
    if (this.phase !== "playing") return { kind: "pending" };
    if (action.kind === "key") this.usedKeyboard = true;
    this.record(action, now);

    const { outcome, progress } = resolveAction(
      this.round,
      this.progress,
      action,
      this.elapsed(now),
      this.rule.judge,
    );
    this.progress = progress;

    if (outcome.kind === "survive") this.survive(now);
    else if (outcome.kind === "death") this.die(outcome, now);
    return outcome;
  }

  /**
   * Journalise l'entrée sous une forme rejouable.
   *
   * On enregistre l'INDEX de la pièce, jamais des coordonnées d'écran : le
   * serveur reconstruit la scène depuis la graine et n'a aucune idée de la
   * résolution du joueur.
   */
  private record(action: Action, now: number): void {
    const t = Math.round(now - this.runStart);
    if (this.log.length > 3900) return;
    if (action.kind === "click") {
      if (action.ent) this.log.push({ t, k: "c", i: action.ent.idx });
      else this.log.push({ t, k: "x", x: Math.round(action.x), y: Math.round(action.y) });
    } else if (action.kind === "key") {
      this.log.push({ t, k: "k", key: action.key });
    } else {
      this.log.push({ t, k: "r", key: action.key });
    }
  }

  /** Avance le temps. Retourne le verdict si la manche s'est conclue seule. */
  tick(now: number): Outcome | null {
    if (this.phase === "freeze") {
      if (now >= this.freezeUntil) {
        this.finish(this.lastDeath.cause, this.lastDeath.reason, false);
      }
      return null;
    }
    if (this.phase !== "playing") return null;
    if (this.elapsed(now) < this.round.durationMs) return null;

    const outcome = resolveTimeout(this.round, this.progress);
    if (outcome.kind === "survive") this.survive(now);
    else if (outcome.kind === "death") this.die(outcome, now);
    return outcome;
  }
}
