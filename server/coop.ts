/**
 * Match coop — PURE.
 *
 * Une vague, plusieurs clics par joueur, une vie commune, un score de groupe.
 * Le chemin classique de `MatchLogic` NE BRANCHE PAS ici : réutiliser
 * `input()` figerait le siège dès le premier outcome, et le mode serait
 * injouable.
 *
 * Aucune socket, aucun timer, aucune horloge interne : le transport vit
 * dans `server/index.ts`.
 */

import type { Action, Entity, OneRule } from "../src/engine/types";
import {
  attribueReglesCoop,
  draftCoop,
  dureeVague,
  jugerClic,
  viesInitialesCoop,
} from "../src/engine/coop";
import { EMPTY_STATS } from "../shared/protocol";
import type { PlayerStats } from "../shared/protocol";

export type ClicCoop =
  | { kind: "pris"; i: number; score: number; vies: number }
  | { kind: "interdit"; i: number; score: number; vies: number };

export interface SiegeCoop {
  id: string;
  lives: number;
  score: number;
  eliminated: boolean;
  spectator: boolean;
  rookie: boolean;
  ruleId: string;
}

export class MatchCoop {
  readonly seed: number;
  readonly seats: SiegeCoop[];
  roundIdx = -1;
  durationMs = 0;
  vies: number;
  score = 0;
  consumed = new Set<number>();
  ents: Entity[] = [];
  private readonly rules: Map<string, OneRule>;
  private readonly actifs: Set<string>;
  private ouvert = false;

  constructor(seed: number, playerIds: readonly string[]) {
    this.seed = seed;
    this.rules = attribueReglesCoop(seed, playerIds);
    this.vies = viesInitialesCoop(playerIds.length);
    this.actifs = new Set(playerIds);
    this.seats = playerIds.map((id) => ({
      id,
      lives: this.vies,
      score: 0,
      eliminated: false,
      spectator: false,
      rookie: false,
      ruleId: this.rules.get(id)?.id ?? "",
    }));
  }

  regleDe(playerId: string): OneRule | undefined {
    return this.rules.get(playerId);
  }

  reglesPubliques(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const s of this.seats) out[s.id] = s.ruleId;
    return out;
  }

  statsOf(_playerId: string): PlayerStats {
    return { ...EMPTY_STATS };
  }

  openVague(): { idx: number; durationMs: number } {
    this.roundIdx += 1;
    this.consumed = new Set();
    this.ents = draftCoop(this.seed, this.roundIdx).ents;
    this.durationMs = dureeVague(this.seed, this.roundIdx);
    this.ouvert = true;
    this.miroir();
    return { idx: this.roundIdx, durationMs: this.durationMs };
  }

  toutPris(): boolean {
    return this.ents.length > 0 && this.consumed.size >= this.ents.length;
  }

  /**
   * Un clic, PAS un outcome de manche.
   *
   * ⚠️ NE PAS FIGER SUR UN OUTCOME. `MatchLogic.input` fait
   * `if (!st || st.outcome) return null` dès le premier geste : ici un
   * joueur clique PLUSIEURS fois par vague. Poser cette garde sur ce
   * chemin rend le coop injouable — le test du second clic tombe.
   */
  inputCoop(
    playerId: string,
    vagueIdx: number,
    action: Action,
    elapsedMs: number,
  ): ClicCoop | null {
    if (vagueIdx !== this.roundIdx || !this.ouvert) return null;
    if (!this.actifs.has(playerId)) return null;
    if (elapsedMs < 0 || elapsedMs > this.durationMs) return null;

    const rule = this.rules.get(playerId);
    if (!rule) return null;
    if (action.kind !== "click") return null;
    if (!action.ent) return null;

    const i = action.ent.idx;
    if (this.consumed.has(i)) return null;

    const visibles = this.ents.filter((e) => !this.consumed.has(e.idx));
    const cible = visibles.find((e) => e.idx === i);
    if (!cible) return null;

    const vu: Action = { kind: "click", ent: cible, x: cible.x, y: cible.y };
    const verdict = jugerClic(rule, vu, visibles, elapsedMs, this.durationMs);
    if (verdict === "vide") return null;

    if (verdict === "interdit") {
      this.vies = Math.max(0, this.vies - 1);
      this.miroir();
      return { kind: "interdit", i, score: this.score, vies: this.vies };
    }

    this.consumed.add(i);
    this.score += 1;
    this.miroir();
    return { kind: "pris", i, score: this.score, vies: this.vies };
  }

  entityOf(_playerId: string, entIdx: number | null): Entity | null {
    if (entIdx === null || this.consumed.has(entIdx)) return null;
    return this.ents.find((e) => e.idx === entIdx) ?? null;
  }

  closeVague(): { matchOver: boolean } {
    this.ouvert = false;
    return { matchOver: this.vies <= 0 };
  }

  setAway(playerId: string, away: boolean): void {
    if (away) this.actifs.delete(playerId);
    else this.actifs.add(playerId);
  }

  forfeit(playerId: string): void {
    this.actifs.delete(playerId);
  }

  private miroir(): void {
    for (const s of this.seats) {
      s.lives = this.vies;
      s.score = this.score;
    }
  }
}
