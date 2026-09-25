import { pickInstruction } from "./instructions";
import { place } from "./scene";
import { FORCED_TRAP_ROUNDS, fenetreAllure, plancherParGeste, windowForSteps } from "./difficulty";
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
  /**
   * QUAND FORCER UN PIÈGE — l'ESCALIER d'entraînement, et lui seul.
   *
   * Par défaut c'est `FORCED_TRAP_ROUNDS`, la constante d'origine : les manches
   * 2, 5 et 9, les mêmes pour tout le monde depuis toujours. Le run du jour, le
   * multijoueur, le classé et le rejeu serveur ne passent JAMAIS d'argument ici
   * — donc rien de ce qui se compare ne change, et `verifyRun` continue de
   * reconstruire exactement les manches qu'il reconstruisait hier.
   *
   * ⚠️ C'est un PLANCHER, jamais un plafond : quand la fonction dit non, on ne
   * bride rien, la règle continue de piéger naturellement dès qu'une consigne
   * tombe dessus. Brider demanderait de REFUSER des consignes, donc de changer
   * les scènes, donc de faire d'un palier un jeu différent de celui qu'il
   * prétend entraîner.
   */
  forcePiege: (level: number) => boolean = (l) => FORCED_TRAP_ROUNDS.has(l),
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
  const wantsTrap = rule.traps && forcePiege(level);
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

  const steps = trap ? [] : compile(want);

  let round: Round = {
    instructionId: instr.id,
    text: draft.text,
    phrase: draft.phrase,
    sousPhrase: draft.sousPhrase,
    sub: draft.sub,
    glyph: draft.glyph,
    colorWord: draft.colorWord,
    ents,
    steps,
    trap,
    originalWant: trap ? want : undefined,
    // Le temps suit le travail demandé : une séquence de trois clics n'est pas
    // une manche à un clic. Un piège n'en demande aucun, donc rien à ajouter.
    durationMs: Math.round(fenetreAllure(windowForSteps(level, steps.length), pace)),
  };

  if (rule.transform) round = rule.transform(round, rng, level);
  /*
   * APRES la regle, jamais avant : c'est la deformation qui peut rendre le
   * compte intenable, et une regle ne connait pas les autres. Voir
   * `plancherParGeste`.
   */
  return { ...round, durationMs: plancherParGeste(round.durationMs, round.steps.length) };
}
