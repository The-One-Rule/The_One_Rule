import { pickInstruction } from "./instructions";
import { place } from "./scene";
import { FORCED_TRAP_ROUNDS, windowMs } from "./difficulty";
import type { Entity, Instruction, OneRule, Rng, Round, Step, Want } from "./types";

/** Compile la forme AUTEUR (`Want`) en liste d'étapes uniformes. */
export function compile(want: Want): Step[] {
  switch (want.kind) {
    case "none":
      return [];
    case "click":
      return [{ kind: "click", idx: want.idx }];
    case "clickAny":
      return [{ kind: "clickAny" }];
    case "clickAnyExcept":
      return [{ kind: "clickAnyExcept", color: want.color }];
    case "key":
      return [{ kind: "key", key: want.key }];
    case "sequence":
      return want.idxs.map((idx) => ({ kind: "click", idx }) as Step);
  }
}

/**
 * Assemble une manche.
 *
 * Ordre non négociable :
 *   1. générer         2. placer         3. résoudre la cible positionnelle
 *   4. tester le conflit avec la règle unique    5. compiler    6. déformer
 *
 * Le conflit est testé AVANT la déformation : une déformation ne doit jamais
 * pouvoir créer ou effacer un piège, sinon l'équilibrage devient imprévisible.
 */
export function buildRound(
  rng: Rng,
  level: number,
  rule: OneRule,
  pool?: Instruction[],
  /**
   * Multiplicateur d'allure — ENTRAÎNEMENT uniquement.
   *
   * Posé APRÈS `place()`, donc il ne touche pas au flux du RNG : deux allures
   * produisent exactement les mêmes scènes, seule la fenêtre change. C'est ce
   * qui permet de l'ajouter sans invalider un rejeu ni une graine du jour.
   */
  pace = 1,
): Round {
  /*
   * Piège garanti sur les manches d'ouverture.
   *
   * Mesuré avant correctif : le premier piège tombait à la manche 5 en médiane
   * et à la manche 20 pour un joueur sur dix — une personne sur dix jouait une
   * partie entière sans jamais rencontrer la seule mécanique qui distingue ce
   * jeu. Elle s'ennuyait à juste titre.
   *
   * On retire donc ce moment au hasard : sur deux manches désignées, on tire
   * jusqu'à trouver une consigne qui entre en conflit avec la règle unique.
   * Le tirage reste déterministe (même RNG, même suite), donc le rejeu serveur
   * et le multijoueur restent valides. Les manches choisies tombent pendant
   * l'échauffement : le joueur découvre le piège en le ratant, sans être puni.
   */
  const wantsTrap = rule.traps && FORCED_TRAP_ROUNDS.has(level);
  let instr!: Instruction;
  let draft!: ReturnType<Instruction["gen"]>;
  let ents!: Entity[];
  let want!: Want;
  let trap = false;

  for (let attempt = 0; attempt < (wantsTrap ? 64 : 1); attempt++) {
    instr = pickInstruction(rng, level, pool);
    draft = instr.gen(rng, level);
    ents = place(rng, draft.specs);
    want = draft.wantFrom ? draft.wantFrom(ents) : draft.want;
    trap = rule.forbids(want, ents);
    if (trap || !wantsTrap) break;
  }

  let round: Round = {
    instructionId: instr.id,
    text: draft.text,
    sub: draft.sub,
    glyph: draft.glyph,
    colorWord: draft.colorWord,
    ents,
    steps: trap ? [] : compile(want),
    trap,
    originalWant: trap ? want : undefined,
    durationMs: Math.round(windowMs(level) * pace),
  };

  if (rule.transform) round = rule.transform(round, rng, level);
  return round;
}
