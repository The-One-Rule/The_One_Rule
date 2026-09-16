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
      return action.kind === "click" && action.ent?.idx === step.idx;
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
  if (!stepMatches(step, action)) {
    return {
      outcome: { kind: "death", cause: "wrong", reason: wrongReason(step, action, round.ents) },
      progress,
    };
  }

  const next = { step: progress.step + 1 };
  if (next.step >= round.steps.length) {
    return { outcome: { kind: "survive", trap: round.trap }, progress: next };
  }
  return { outcome: { kind: "pending" }, progress: next };
}

/**
 * DÉJOUER — le raccourci de l'abstention. Entraînement SEULEMENT.
 *
 * Rapporté par le jury Ystart : « l'écran ne rien faire gâche le peps, ça doit
 * aller vite ». Mesuré : un piège dure TOUTE sa fenêtre — c'est la seule façon
 * de savoir que le joueur a tenu — donc le meilleur geste du jeu, résister, se
 * payait du plus long temps mort.
 *
 * Le joueur peut désormais DIRE qu'il a vu que la bonne réponse était de ne
 * rien faire. Deux cas, et un seul verdict chacun :
 *
 *   · la manche ne demandait AUCUN geste (piège, « NE FAIS RIEN », « NE CLIQUE
 *     PAS ») → il a raison, la manche se termine tout de suite ;
 *   · la manche demandait un geste → il s'est trompé, c'était une consigne
 *     légitime.
 *
 * ⚠️ **DÉJOUER NE SAUVE JAMAIS UNE MANCHE QUE L'ATTENTE AURAIT PERDUE.** Il ne
 * réussit que là où `resolveTimeout` aurait aussi rendu une survie : il
 * avance l'instant, il ne change aucune issue. C'est ce qui le rend
 * inoffensif pour les records — le score maximal atteignable est le même avec
 * ou sans lui — et `tests/dejoue.test.ts` le vérifie sur des milliers de
 * manches.
 *
 * ⚠️ **IL N'EST PAS DANS `resolveAction`, ET C'EST DÉLIBÉRÉ.** `resolveAction`
 * est partagé avec `verifyRun`, qui rejoue les journaux du run du jour — où le
 * temps départage les ex æquo. Un « déjouer » connu du moteur partagé
 * laisserait un journal forgé gagner du temps sur l'épreuve qui se compare.
 * Le raccourci vit donc dans la `Session` d'entraînement, et nulle part
 * ailleurs.
 *
 * ⚠️ Aucune règle unique ne le juge : ce n'est pas un GESTE de jeu (un clic,
 * une touche, un relâchement), c'est une déclaration. LA SECONDE interdit
 * d'agir avant 400 ms ; déjouer un piège à 100 ms ne lui fait rien, puisque
 * sur un piège l'abstention était de toute façon la bonne réponse.
 */
export function resoudreDejoue(round: Round): Outcome {
  if (round.steps.length === 0) return { kind: "survive", trap: round.trap };
  return { kind: "death", cause: "wrong", reason: MOTIFS.dejoueATort };
}

/** Verdict quand la fenêtre expire sans que la manche soit résolue. */
export function resolveTimeout(round: Round, progress: RoundProgress): Outcome {
  if (round.steps.length === 0) return { kind: "survive", trap: round.trap };
  if (progress.step > 0) return { kind: "death", cause: "timeout", reason: MOTIFS.sequence };
  return { kind: "death", cause: "timeout", reason: MOTIFS.temps };
}
