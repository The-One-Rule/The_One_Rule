/**
 * Match coop — PURE.
 *
 * Une vague, plusieurs clics par joueur, une vie commune, un score de groupe.
 * Le chemin classique de `MatchLogic` NE BRANCHE PAS ici : réutiliser
 * `input()` figerait le siège dès le premier outcome, et le mode serait
 * injouable.
 *
 * Aucune socket, aucun timer, aucune horloge interne : le transport vit
 * dans `server/index.ts`. Le rassemblement (need 2/3) se clôt par
 * `cloreCharge(elapsedMs)` que le transport appelle à T0+400 ms.
 */

import type { Action, Entity, OneRule } from "../src/engine/types";
import {
  attribueReglesCoop,
  COOP_RASSEMBLEMENT_MS,
  draftCoop,
  dureeVague,
  jugerClic,
  viesInitialesCoop,
} from "../src/engine/coop";
import type { NeedCoop } from "../src/engine/coop";
import { EMPTY_STATS } from "../shared/protocol";
import type { PlayerStats } from "../shared/protocol";

export type ClicCoop =
  | { kind: "pris"; i: number; score: number; vies: number }
  | { kind: "interdit"; i: number; score: number; vies: number }
  | { kind: "charge"; i: number; n: number; need: NeedCoop; debutMs: number };

export type ClotureCharge =
  | { kind: "pris"; i: number; score: number; vies: number }
  | { kind: "rate"; i: number; need: NeedCoop };

interface Charge {
  need: NeedCoop;
  debutMs: number;
  sieges: Set<string>;
}

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
  needs = new Map<number, NeedCoop>();
  private readonly rules: Map<string, OneRule>;
  private readonly actifs: Set<string>;
  private readonly charges = new Map<number, Charge>();
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
    this.charges.clear();
    const draft = draftCoop(this.seed, this.roundIdx);
    this.ents = draft.ents;
    this.needs = draft.needs;
    this.durationMs = dureeVague(this.seed, this.roundIdx);
    this.ouvert = true;
    this.miroir();
    return { idx: this.roundIdx, durationMs: this.durationMs };
  }

  toutPris(): boolean {
    return this.ents.length > 0 && this.consumed.size >= this.ents.length;
  }

  needOf(i: number): NeedCoop {
    return this.needs.get(i) ?? 1;
  }

  /**
   * Un clic, PAS un outcome de manche.
   *
   * ⚠️ NE PAS FIGER SUR UN OUTCOME. `MatchLogic.input` fait
   * `if (!st || st.outcome) return null` dès le premier geste : ici un
   * joueur clique PLUSIEURS fois par vague. Poser cette garde sur ce
   * chemin rend le coop injouable — le test du second clic tombe.
   *
   * Licite : le siège entre dans le rassemblement. Need atteint → +need
   * au score, consumed. Sinon : charge ouverte, la pièce RESTE.
   * Interdit : −1 vie IMMÉDIAT, le siège ne compte pas.
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

    let ch = this.charges.get(i);
    if (!ch) {
      ch = { need: this.needOf(i), debutMs: elapsedMs, sieges: new Set() };
      this.charges.set(i, ch);
    }
    if (ch.sieges.has(playerId)) return null;
    ch.sieges.add(playerId);

    if (ch.sieges.size >= ch.need) {
      this.charges.delete(i);
      this.consumed.add(i);
      this.score += ch.need;
      this.miroir();
      return { kind: "pris", i, score: this.score, vies: this.vies };
    }

    return { kind: "charge", i, n: ch.sieges.size, need: ch.need, debutMs: ch.debutMs };
  }

  /**
   * Clôture d'une charge à T0+400 ms (ou plus tard). PURE : le transport
   * fournit `elapsedMs`. Trop tôt et need non atteint → null. Licites
   * insuffisants → pas de point, pas de vie, la pièce RESTE cliquable.
   */
  cloreCharge(i: number, elapsedMs: number): ClotureCharge | null {
    if (!this.ouvert) return null;
    if (this.consumed.has(i)) return null;
    const ch = this.charges.get(i);
    if (!ch) return null;
    if (ch.sieges.size >= ch.need) {
      this.charges.delete(i);
      this.consumed.add(i);
      this.score += ch.need;
      this.miroir();
      return { kind: "pris", i, score: this.score, vies: this.vies };
    }
    if (elapsedMs < ch.debutMs + COOP_RASSEMBLEMENT_MS) return null;
    this.charges.delete(i);
    return { kind: "rate", i, need: ch.need };
  }

  entityOf(_playerId: string, entIdx: number | null): Entity | null {
    if (entIdx === null || this.consumed.has(entIdx)) return null;
    return this.ents.find((e) => e.idx === entIdx) ?? null;
  }

  closeVague(): { matchOver: boolean } {
    this.ouvert = false;
    this.charges.clear();
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
