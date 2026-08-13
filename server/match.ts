/**
 * Logique d'un match multijoueur — PURE.
 *
 * Aucune socket, aucun timer, aucune horloge interne : le transport (ws) et
 * l'ordonnancement vivent dans server/index.ts, et cette classe reçoit le
 * temps en paramètre. C'est la même discipline que `engine/` — et pour la
 * même raison : tout ce qui décide d'une victoire doit être rejouable dans
 * un test.
 */

import { ONE_RULES } from "../src/engine/rules";
import { applyRule, draftShared } from "../src/engine/multiround";
import { resolveAction, resolveTimeout } from "../src/engine/resolve";
import type { SharedRound } from "../src/engine/multiround";
import type { Action, OneRule, Round, RoundProgress } from "../src/engine/types";
import {
  DEFAULT_SETTINGS,
  EMPTY_STATS,
  INTERLUDE_DUEL_MS,
  INTERLUDE_ELIM_MS,
  INTERLUDE_LIFE_MS,
  INTERLUDE_MS,
  MAX_ROUND_MS,
  MIN_ROUND_MS,
  STATS_MIN_SAMPLES,
} from "../shared/protocol";
import type { PlayerStats, RoomSettings, RoundOutcome } from "../shared/protocol";

/**
 * Pool multijoueur : LA MAIN GAUCHE en est exclue. Recevoir « garde ESPACE
 * enfoncé » par rotation au milieu d'une manche est injouable — on ne peut
 * pas commencer à tenir une touche qu'on ne tenait pas déjà.
 */
export const MULTI_RULES: OneRule[] = ONE_RULES.filter((r) => !r.watchRelease);

export interface SeatStats {
  /** Première réaction de chaque manche réussie. On garde les mesures, pas
   *  une moyenne courante : la médiane a besoin de la distribution. */
  reactions: number[];
  trapsAvoided: number;
  streak: number;
  bestStreak: number;
}

export interface Seat {
  id: string;
  lives: number;
  score: number;
  /** index dans l'ordre des sièges — la rotation tourne sur cet ordre */
  seat: number;
  eliminated: boolean;
  stats: SeatStats;
}

export interface PlayerRoundState {
  round: Round;
  progress: RoundProgress;
  /** verdict figé dès qu'il tombe : les inputs suivants sont ignorés */
  outcome: RoundOutcome | null;
  /** Premier geste de la manche (ms) — null si silence total. */
  firstInputMs: number | null;
}

function emptySeatStats(): SeatStats {
  return { reactions: [], trapsAvoided: 0, streak: 0, bestStreak: 0 };
}

/** Médiane arrondie ; le tableau ne doit pas être vide. */
function medianMs(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return Math.round(sorted[mid]!);
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export class MatchLogic {
  readonly seed: number;
  readonly seats: Seat[];
  readonly settings: RoomSettings;
  roundIdx = -1;
  /** Fenêtre réelle : courbe moteur × speed × tension, bornée par MIN/MAX_ROUND_MS. */
  private roundDurationMs = 0;
  private shared: SharedRound | null = null;
  private states = new Map<string, PlayerRoundState>();

  constructor(seed: number, playerIds: string[], settings: RoomSettings = DEFAULT_SETTINGS) {
    this.seed = seed;
    this.settings = settings;
    this.seats = playerIds.map((id, i) => ({
      id,
      lives: settings.lives,
      score: 0,
      seat: i,
      eliminated: false,
      stats: emptySeatStats(),
    }));
  }

  /**
   * Attribution des règles à une manche donnée.
   *
   * Chaque siège reçoit une règle différente tant que le pool le permet, et
   * l'attribution TOURNE d'un cran toutes les `rotationEvery` manches : au
   * moment où un joueur a intégré sa contrainte, elle change de mains.
   * Fonction pure de (graine, manche, siège) : serveur et clients calculent
   * la même chose sans échange.
   */
  rulesAt(idx: number): Map<string, OneRule> {
    const every = Math.max(1, this.settings.rotationEvery);
    const shift = Math.floor(idx / every);
    const out = new Map<string, OneRule>();
    for (const s of this.seats) {
      const rule = MULTI_RULES[(s.seat + shift) % MULTI_RULES.length]!;
      out.set(s.id, rule);
    }
    return out;
  }

  rotationJustHappened(idx: number): boolean {
    const every = Math.max(1, this.settings.rotationEvery);
    return idx > 0 && idx % every === 0;
  }

  get alive(): Seat[] {
    return this.seats.filter((s) => !s.eliminated);
  }

  /**
   * Courbe de tension du match. Lit l'état vivant du match, pas seulement
   * l'index : c'est voulu, la pression doit venir des chutes.
   *
   *   · départ « bavard » : ×1,45 (~2,2 s) — assez lent pour lâcher un mot au
   *     chat quand on est confiant
   *   · chaque élimination resserre la vis, à plein juste avant le duel
   *   · duel final (2 vivants après au moins une élimination) : ×0,55, apnée
   *
   * Le facteur décroît AUSSI doucement avec l'index (×1,45 → ×0,9) pour qu'un
   * 1v1 pur, sans élimination intermédiaire, accélère quand même.
   */
  tensionAt(idx: number): number {
    const seats = this.seats.length;
    const alive = this.alive.length;
    const eliminated = seats - alive;
    if (alive === 2 && eliminated > 0) return 0.55;
    const warm = Math.max(0.9, 1.45 - idx * 0.02);
    // Diviseur `seats - 3` et non `seats - 2` : le terme doit atteindre son
    // maximum au dernier état AVANT le duel, soit 3 vivants. Calé sur 2
    // vivants, il ne serait jamais atteint — cet état part toujours dans la
    // branche duel au-dessus. Propriété qui en découle, et qui est testée :
    // le dernier état avant duel vaut 1,10 quel que soit l'effectif.
    const elim = seats > 3 ? Math.min(1, eliminated / (seats - 3)) * 0.35 : 0;
    return Math.max(0.7, warm - elim);
  }

  /** Ouvre la manche suivante. Retourne sa durée (le serveur fixe l'échéance). */
  openRound(): { idx: number; durationMs: number } {
    this.roundIdx++;
    this.shared = draftShared(this.seed, this.roundIdx);
    this.states.clear();
    const rules = this.rulesAt(this.roundIdx);
    for (const s of this.alive) {
      const round = applyRule(this.shared, rules.get(s.id)!, this.seed);
      this.states.set(s.id, { round, progress: { step: 0 }, outcome: null, firstInputMs: null });
    }

    // Tempo serveur : la courbe de base du moteur, le réglage salon, puis la
    // tension dramatique — le tout borné des deux côtés. Aucune combinaison de
    // réglages ne doit produire une manche injouable ni une manche bavarde.
    // Plancher d'abord, plafond ensuite ; comme MIN < MAX, l'ordre est sans
    // effet, il est fixé pour la lecture.
    // input() borne sur roundDurationMs — même fenêtre pour juger et afficher.
    this.roundDurationMs = Math.min(
      MAX_ROUND_MS,
      Math.max(
        MIN_ROUND_MS,
        Math.round(this.shared.durationMs * this.settings.speed * this.tensionAt(this.roundIdx)),
      ),
    );
    return { idx: this.roundIdx, durationMs: this.roundDurationMs };
  }

  /**
   * Un input d'un joueur, à `elapsedMs` du départ de la manche.
   *
   * Le serveur est le SEUL juge : le client affiche son propre verdict en
   * anticipation, mais c'est ce retour qui fait foi et qui décrémente les
   * vies. Un input après verdict ou hors manche est ignoré sans erreur —
   * c'est le cas normal d'un paquet en retard, pas une triche.
   */
  input(playerId: string, roundIdx: number, action: Action, elapsedMs: number): RoundOutcome | null {
    if (roundIdx !== this.roundIdx || !this.shared) return null;
    const st = this.states.get(playerId);
    if (!st || st.outcome) return null;
    if (elapsedMs < 0 || elapsedMs > this.roundDurationMs) return null;

    // Le temps de réaction, c'est le PREMIER geste de la manche. Sur une
    // séquence, l'horodatage du dernier pas mesure l'exécution, pas le réflexe.
    // Ne pas re-borner elapsedMs ici : server/index.ts fait déjà autorité.
    if (st.firstInputMs === null) st.firstInputMs = elapsedMs;

    const rule = this.rulesAt(this.roundIdx).get(playerId)!;
    const res = resolveAction(st.round, st.progress, action, elapsedMs, rule.judge);
    st.progress = res.progress;

    if (res.outcome.kind === "survive") {
      st.outcome = { kind: "survive", trap: st.round.trap };
    } else if (res.outcome.kind === "death") {
      st.outcome = { kind: "death", reason: res.outcome.reason };
    }
    return st.outcome;
  }

  /** Reconstruit une entité par index — le fil ne transporte jamais de scène. */
  entityOf(playerId: string, entIdx: number | null) {
    if (entIdx === null) return null;
    return this.states.get(playerId)?.round.ents[entIdx] ?? null;
  }

  /**
   * Clôture de la manche à l'échéance : verdict de chacun, vies, éliminations.
   */
  closeRound(): {
    outcomes: Map<string, RoundOutcome>;
    matchOver: boolean;
    winnerId: string | null;
    interludeMs: number;
  } {
    const outcomes = new Map<string, RoundOutcome>();
    for (const s of this.seats) {
      const st = this.states.get(s.id);
      // Un joueur tombé PENDANT la manche (forfait, déconnexion) doit encore
      // apparaître mort dans ce verdict : sa chute est le spectacle, les
      // autres doivent la voir. `idle` est réservé aux morts des manches
      // précédentes et aux spectateurs.
      if (s.eliminated && st?.outcome?.kind === "death") {
        outcomes.set(s.id, st.outcome);
        s.stats.streak = 0;
        continue;
      }
      if (s.eliminated || !st) {
        outcomes.set(s.id, { kind: "idle" });
        continue;
      }
      let out = st.outcome;
      if (!out) {
        const timeout = resolveTimeout(st.round, st.progress);
        out =
          timeout.kind === "survive"
            ? { kind: "survive", trap: st.round.trap }
            : { kind: "death", reason: timeout.kind === "death" ? timeout.reason : "" };
      }
      if (out.kind === "survive") {
        s.score++;
        s.stats.streak++;
        s.stats.bestStreak = Math.max(s.stats.bestStreak, s.stats.streak);
        if (out.trap) s.stats.trapsAvoided++;
        if (st.firstInputMs !== null) s.stats.reactions.push(st.firstInputMs);
      } else if (out.kind === "death") {
        s.lives--;
        if (s.lives <= 0) s.eliminated = true;
        s.stats.streak = 0;
      }
      outcomes.set(s.id, out);
    }

    const alive = this.alive;
    // Fin immédiate au dernier survivant : cycle party game, écran de fin
    // tout de suite. On ne fait PLUS jouer le vainqueur jusqu'à sa mort —
    // sinon les spectateurs regardent un solo interminable.
    const matchOver = alive.length === 0 || (this.seats.length > 1 && alive.length <= 1);
    const winnerId = matchOver ? this.winner() : null;
    const interludeMs = matchOver ? 0 : this.pauseAfter(alive.length, outcomes);
    return { outcomes, matchOver, winnerId, interludeMs };
  }

  /**
   * Tempo entre manches — chiffres calés sur les seuils kill-cam client
   * (>3500 / >1800 / ≤800). Le client ne lit que nextRoundAt.
   */
  private pauseAfter(aliveCount: number, outcomes: Map<string, RoundOutcome>): number {
    // 1. Duel / apnée : ≤2 vivants APRÈS la manche → toujours 500 ms
    //    même s'il y a eu une mort (les plaques suffisent).
    if (aliveCount <= 2) return INTERLUDE_DUEL_MS;

    // 2. Une élimination cette manche ?
    const elim = [...outcomes].some(([id, o]) => {
      if (o.kind !== "death") return false;
      const s = this.seats.find((x) => x.id === id);
      return !!s?.eliminated;
    });
    if (elim) return INTERLUDE_ELIM_MS;

    // 3. Une mort sans élimination
    const lifeLost = [...outcomes.values()].some((o) => o.kind === "death");
    if (lifeLost) return INTERLUDE_LIFE_MS;

    // 4. Sinon
    return INTERLUDE_MS;
  }

  /** Lecture publique des stats d'un siège — médiane, jamais minimum. */
  statsOf(playerId: string): PlayerStats {
    const s = this.seats.find((x) => x.id === playerId);
    if (!s) return { ...EMPTY_STATS };
    const n = s.stats.reactions.length;
    return {
      reaction: n < STATS_MIN_SAMPLES ? null : medianMs(s.stats.reactions),
      traps: s.stats.trapsAvoided,
      streak: s.stats.streak,
      bestStreak: s.stats.bestStreak,
    };
  }

  /** Le vainqueur : dernier en vie, sinon le plus de vies, sinon le score. */
  winner(): string | null {
    const ranked = [...this.seats].sort(
      (a, b) => Number(b.eliminated === false) - Number(a.eliminated === false) || b.lives - a.lives || b.score - a.score,
    );
    return ranked[0]?.id ?? null;
  }

  /** Départ anticipé : le siège reste (les règles ne re-tournent pas), la vie s'arrête. */
  forfeit(playerId: string): void {
    const s = this.seats.find((x) => x.id === playerId);
    if (s && !s.eliminated) {
      s.lives = 0;
      s.eliminated = true;
      const st = this.states.get(playerId);
      if (st && !st.outcome) st.outcome = { kind: "death", reason: "PARTI" };
    }
  }
}
