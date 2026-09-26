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
import { ONE_RULES, withoutHold, withoutInk } from "./rules";
import { combineRules } from "./rules/combine";
import { pileA, pileEscalade } from "./escalade";
import { buildRound } from "./round";
import {
  INSTRUCTIONS,
  INSTRUCTIONS_SOLO,
  TOUCH_INSTRUCTIONS,
  TOUCH_INSTRUCTIONS_SOLO,
} from "./instructions";
import { resolveAction, resolveTimeout } from "./resolve";
import { DAILY_LENGTH, GRACE_ROUNDS, pardonnable } from "./difficulty";
import type { Action, Entity, OneRule, Round, RoundProgress } from "./types";

/** Une entrée journalisée. `t` est en ms depuis le début du run. */
export type LoggedInput =
  | { t: number; k: "c"; i: number | null } // clic : index de la pièce, ou null pour le vide
  | { t: number; k: "x"; x: number; y: number } // clic hors pièce, position conservée
  | { t: number; k: "k"; key: string } // touche
  | { t: number; k: "r"; key: string } // relâchement
  | { t: number; k: "l"; i: number | null }; // lever (MAINTENIR, GLISSER)

export interface RunClaim {
  seed: number;
  ruleId: string;
  mode: "daily" | "training" | "ranked" | "escalade";
  inputs: LoggedInput[];
  /**
   * ESCALADE : ce que l'appareil du joueur savait jouer.
   *
   * La pile de regles est tiree d'un flux derive de la graine, mais FILTREE
   * par les capacites de l'appareil : un telephone ne peut pas tenir ESPACE
   * (`withoutHold`), et le mode motifs rend LE DALTONIEN inerte
   * (`withoutInk`). Si le serveur rejouait avec un autre filtre, il tirerait
   * une AUTRE pile — et rejetterait tous les runs.
   *
   * ⚠️ Ces deux drapeaux entrent donc dans la cle de comparabilite : un run
   * joue sans les regles a maintien n'est pas la meme epreuve, et il ne se
   * compare qu'a ses semblables. Les declarer ne donne aucun avantage — cela
   * change la pile, pas sa difficulte — mais cela change a QUI on se compare.
   */
  capacites?: { maintien: boolean; encre: boolean; clavier?: boolean };
  /**
   * Le catalogue de consignes du run. 2 = le catalogue du solo élargi
   * (double appui, MAINTENIR, GLISSER). ABSENT VAUT 1 : un run d'un client
   * d'avant l'ouverture se rejoue sur l'ancien catalogue.
   */
  catalogue?: number;
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
    case "l": {
      if (input.i === null) return { kind: "lift", ent: null, x: Number.NaN, y: Number.NaN };
      const ent = ents[input.i];
      if (!ent) return null;
      return { kind: "lift", ent, x: ent.x, y: ent.y };
    }
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

  /*
   * ESCALADE : la pile, tiree du MEME flux derive que le jeu.
   *
   * `seed ^ 0x5eca1ade` — le decalage existe pour ne pas consommer le flux
   * des manches, qui doit rester identique a une graine donnee. Reproduire ce
   * detail est ce qui rend le run rejouable ici.
   */
  const pile =
    claim.mode === "escalade"
      ? pileEscalade(mulberry32(claim.seed ^ 0x5eca1ade), (r) => {
          if (claim.capacites?.maintien === false && withoutHold(r) !== r) return false;
          if (claim.capacites?.encre === false && withoutInk(r) !== r) return false;
          return true;
        })
      : null;
  if (pile && pile.length === 0) return fail("pile d'escalade vide");

  const rng = mulberry32(claim.seed);
  const limited = claim.mode !== "training";
  const maxRounds = limited ? DAILY_LENGTH : 400;
  const grace = limited ? GRACE_ROUNDS : 0;

  let level = 0;
  let traps = 0;
  const reactions: number[] = [];
  let roundStart = 0;
  /*
   * ⚠️ LE TÉLÉPHONE NE JOUE PAS LES MÊMES MANCHES, et le rejeu doit le savoir.
   *
   * Le client tire au doigt dans `TOUCH_INSTRUCTIONS` et remplace une règle à
   * maintien (`withoutHold`) ou d'encre (`withoutInk`). Le rejeu tirait
   * toujours dans le catalogue complet, sous la règle brute : mesuré sur 200
   * graines, les manches divergeaient dès la manche 3 (au plus tard la 7) —
   * chaque run du jour joué au téléphone était rejoué sur d'AUTRES manches,
   * et son score vérifié était faux. ABSENT VAUT CLAVIER : un client d'avant
   * ce correctif est rejoué comme avant, rien ne change pour lui.
   */
  const solo = claim.catalogue === 2;
  const pool =
    claim.capacites?.clavier === false
      ? solo
        ? TOUCH_INSTRUCTIONS_SOLO
        : TOUCH_INSTRUCTIONS
      : solo
        ? INSTRUCTIONS_SOLO
        : INSTRUCTIONS;
  let regleSeule: OneRule = rule;
  if (claim.capacites?.maintien === false) regleSeule = withoutHold(regleSeule);
  if (claim.capacites?.encre === false) regleSeule = withoutInk(regleSeule);

  /** La regle du palier : la pile combinee en escalade, la regle seule sinon. */
  const regleA = (lvl: number): OneRule => (pile ? combineRules(pileA(pile, lvl)) : regleSeule);

  let round: Round = buildRound(rng, level, regleA(level), pool);
  let progress: RoundProgress = { step: 0 };
  let cursor = 0;

  const nextRound = (at: number): void => {
    round = buildRound(rng, level, regleA(level), pool);
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

    /*
     * Le juge vient de la REGLE DU PALIER, pas du champ `ruleId`.
     *
     * Avec `rule.judge`, un run d'escalade etait juge sous une seule regle —
     * celle annoncee dans la reclamation — au lieu de la pile reellement
     * tenue. Mesure : le meme journal donnait 3 sous « sang » et 12 sous
     * « jumeau ». Autrement dit, le joueur choisissait sa propre contrainte
     * en remplissant un champ.
     */
    const res = resolveAction(round, progress, action, next.t - roundStart, regleA(level).judge);
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
      /*
       * ⚠️ LA MEME LOI QUE `Session.die`, ET ELLE VIENT DU MEME ENDROIT.
       *
       * L'echauffement pardonne une mort — sauf une violation de MAINTIEN, qui
       * decrit un etat et non un geste (voir `pardonnable`). Ecrire la
       * condition ici plutot que de l'importer la ferait diverger du client, et
       * le symptome serait un score refuse par le serveur alors que l'ecran
       * venait de le valider : le seul defaut que ce depot tient pour fatal.
       */
      if (level < grace && pardonnable(regleA(level), action)) {
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
