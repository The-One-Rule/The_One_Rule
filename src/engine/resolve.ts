import { MOTIFS } from "./motifs";
import type { Action, Entity, Outcome, Round, RoundProgress, Step } from "./types";

/**
 * Une action satisfait-elle une etape ?
 *
 * Exportee pour etre eprouvee directement : c'est le predicat que le client
 * ET le serveur appliquent, donc le seul endroit ou une divergence de
 * jugement pourrait naitre. Le tester a travers une manche entiere reviendrait
 * a le tester par accident.
 */
export function stepMatches(step: Step, action: Action): boolean {
  switch (step.kind) {
    case "click":
    case "hold":
      // L'APPUI d'un maintien est un clic sur la pièce ; c'est le lever qui
      // conclut (voir `resolveAction`).
      return action.kind === "click" && action.ent?.idx === step.idx;
    case "drop":
      return action.kind === "lift" && action.ent?.idx === step.idx;
    case "clickAny":
      return action.kind === "click";
    case "clickAnyExcept":
      return action.kind === "click" && (!action.ent || action.ent.color !== step.color);
    case "key":
      // `keyAlt` : la seconde lettre acceptee, identique pour tous. Voir
      // le commentaire de `Want` dans `engine/types.ts`.
      return (
        action.kind === "key" &&
        (action.key === step.key || (step.keyAlt !== undefined && action.key === step.keyAlt))
      );
  }
}

function wrongReason(step: Step, action: Action, ents: Entity[]): string {
  if (step.kind === "drop") {
    return action.kind === "lift" ? MOTIFS.lacheAilleurs : MOTIFS.fallaitGlisser;
  }
  if (step.kind === "key") {
    if (action.kind === "click") return MOTIFS.fallaitTaper;
    return MOTIFS.mauvaiseTouche;
  }
  if (action.kind === "key") return MOTIFS.fallaitCliquer;
  if (step.kind === "clickAnyExcept") return MOTIFS.couleurInterdite;
  if (action.kind === "click" && !action.ent) return MOTIFS.leVide;
  return ents.length > 2 ? MOTIFS.mauvaiseForme : MOTIFS.mauvaiseCible;
}

/**
 * Verdict d'une action. Ordre de priorité strict :
 *   1. la règle unique prime sur tout
 *   2. une manche sans étape (piège ou "ne fais rien") : toute action tue
 *   3. correspondance avec l'étape courante
 */
export function resolveAction(
  round: Round,
  progress: RoundProgress,
  action: Action,
  elapsedMs: number,
  judge: (action: Action, ctx: { round: Round; elapsedMs: number }) => string | null,
): { outcome: Outcome; progress: RoundProgress } {
  const violation = judge(action, { round, elapsedMs });
  if (violation) {
    return { outcome: { kind: "death", cause: "macro", reason: violation }, progress };
  }

  // un relâchement de touche n'est jamais une réponse : seule la règle unique s'en soucie
  if (action.kind === "release") return { outcome: { kind: "pending" }, progress };

  /*
   * LE LEVER n'est une réponse que pour deux étapes : conclure un maintien
   * commencé, ou poser un glisser. Partout ailleurs — un clic ordinaire se
   * lève aussi — il est ignoré, comme un relâchement de touche.
   */
  if (action.kind === "lift") {
    const courante = round.steps[progress.step];
    if (courante?.kind === "hold" && progress.holdAt !== undefined) {
      if (elapsedMs - progress.holdAt < courante.ms) {
        return {
          outcome: { kind: "death", cause: "wrong", reason: MOTIFS.lacheTot },
          progress: { step: progress.step },
        };
      }
      return avance(round, progress.step);
    }
    if (courante?.kind !== "drop") return { outcome: { kind: "pending" }, progress };
  }

  if (round.steps.length === 0) {
    return {
      outcome: {
        kind: "death",
        cause: "wrong",
        reason: round.trap
          ? MOTIFS.piegeRate
          : MOTIFS.rienFaire,
      },
      progress,
    };
  }

  const step = round.steps[progress.step]!;
  // Un second appui pendant un maintien : le doigt a quitté la pièce.
  if (step.kind === "hold" && progress.holdAt !== undefined) {
    return {
      outcome: { kind: "death", cause: "wrong", reason: MOTIFS.lacheTot },
      progress,
    };
  }
  if (!stepMatches(step, action)) {
    return {
      outcome: { kind: "death", cause: "wrong", reason: wrongReason(step, action, round.ents) },
      progress,
    };
  }
  // L'appui d'un maintien : on note l'instant, on attend le lever.
  if (step.kind === "hold") {
    return { outcome: { kind: "pending" }, progress: { step: progress.step, holdAt: elapsedMs } };
  }
  return avance(round, progress.step);
}

function avance(round: Round, step: number): { outcome: Outcome; progress: RoundProgress } {
  const next = { step: step + 1 };
  if (next.step >= round.steps.length) {
    return { outcome: { kind: "survive", trap: round.trap }, progress: next };
  }
  return { outcome: { kind: "pending" }, progress: next };
}

/**
 * Un lever répondrait-il à quelque chose à cet instant ?
 *
 * Vrai pour conclure un maintien commencé ou poser un glisser. Partout
 * ailleurs `resolveAction` l'ignore — c'est ce qui permet au client de ne pas
 * l'envoyer, et au solo de ne pas le journaliser.
 */
export function leverAttendu(round: Round, progress: RoundProgress): boolean {
  const st = round.steps[progress.step];
  return (st?.kind === "hold" && progress.holdAt !== undefined) || st?.kind === "drop";
}

/** Verdict quand la fenêtre expire sans que la manche soit résolue. */
export function resolveTimeout(round: Round, progress: RoundProgress): Outcome {
  if (round.steps.length === 0) return { kind: "survive", trap: round.trap };
  // Un maintien en cours quand la fenêtre se ferme : tenu trop tard.
  if (progress.step > 0 || progress.holdAt !== undefined) {
    return { kind: "death", cause: "timeout", reason: MOTIFS.sequence };
  }
  return { kind: "death", cause: "timeout", reason: MOTIFS.temps };
}
