/**
 * Mode imposteur — primitives PURES, hors du catalogue.
 *
 * ⚠️ `SANS_REGLE` n'entre PAS dans `ONE_RULES` : `VERSION_CONTENU` se calcule
 * depuis ce catalogue, et l'y ajouter casserait tous les scores déjà
 * enregistrés. Ce module n'est importé ni par `version.ts`, ni par les
 * consignes, ni par `difficulty.ts`.
 */

import { hashStr, mulberry32 } from "./rng";
import { pickInstruction, TOUCH_INSTRUCTIONS } from "./instructions";
import { place } from "./scene";
import { poidsGestes, windowForSteps } from "./difficulty";
import { compile } from "./round";
import { MAX_ROUND_MS, SPEED_CHOICES } from "../../shared/protocol";
import type { RoundOutcome } from "../../shared/protocol";
import type { Instruction, OneRule, Round, Want } from "./types";
import type { SharedRound } from "./multiround";
import { MOTIFS } from "./motifs";

/** Dix manches, indices 0 à 9. */
export const IMPOSTEUR_MANCHES = 10;

/** Cinq pièges forcés. LOCAL au mode — pas `FORCED_TRAP_ROUNDS`. */
export const IMPOSTEUR_PIEGES: ReadonlySet<number> = new Set([0, 2, 4, 6, 8]);

/** SPEED_CHOICES[0] — libellé salon DÉCOUV. Le rythme appartient au mode. */
export const IMPOSTEUR_VITESSE = SPEED_CHOICES[0];

/** Plancher APRÈS la multiplication. 760×1,7 = 1292 : il ne mord pas ici. */
export const IMPOSTEUR_PLANCHER_MS = 1100;

export const IMPOSTEUR_MIN_JOUEURS = 4;
export const IMPOSTEUR_MAX_ASIS = 8;

/** L'effectif assis autorise-t-il le lancement ? UI et serveur, même règle. */
export function peutLancerImposteur(assis: number): boolean {
  return assis >= IMPOSTEUR_MIN_JOUEURS && assis <= IMPOSTEUR_MAX_ASIS;
}

/**
 * Pas de règle. `forbids` est toujours faux : l'imposteur doit obéir à la
 * consigne, y compris quand elle piège les villageois.
 */
export const SANS_REGLE: OneRule = {
  id: "sansRegle",
  name: "",
  brief: "",
  traps: false,
  forbids: () => false,
  judge: () => null,
};

/**
 * Ce qu'un siège a FAIT, après la manche — identifiant, pas une phrase.
 *
 * Le live ne peut pas s'appuyer sur `RoundOutcome` : le verdict arrive à la
 * clôture. Pendant la manche, c'est `t: "acted"`. Après, le journal peut
 * reconstruire le même binaire sans relire un motif de mort ni un flash
 * piège — ces phrases sont pour l'observation et le vote, pas pour les
 * dix manches.
 *
 *   survive sans piège, ou mort hors temps → agi
 *   survive sur piège, ou mort au temps     → rien
 *   idle (spectateur, déjà hors jeu)        → rien
 */
export type ActeId = "agi" | "rien";

export function acteDe(o: RoundOutcome): ActeId {
  if (o.kind === "survive") return o.trap ? "rien" : "agi";
  if (o.kind === "death") return o.reason === MOTIFS.temps ? "rien" : "agi";
  return "rien";
}

/**
 * Faut-il diffuser `{ t: "acted" }` ?
 *
 * Vrai seulement en imposteur, et seulement si le siège VENAIT d'être
 * vierge et ne l'est plus — le premier geste, pas les suivants.
 * Classique / duo : faux, le spectacle existant ne bouge pas.
 */
export function fautSignalerActe(
  imposteur: boolean,
  viergeAvant: boolean,
  viergeApres: boolean,
): boolean {
  return imposteur && viergeAvant && !viergeApres;
}

/**
 * Durée d'une manche imposteur.
 *
 * vitesse × durée partagée, PUIS le plancher, PUIS le plafond local
 * (`MAX_ROUND_MS`). `tensionAt` n'entre pas : sans élimination elle resterait
 * à 1,45 et tout tapperait le plafond.
 *
 * ⚠️ `windowMs(0)×1,7` ouvre désormais au-dessus de l'ancien plafond 2400,
 * depuis que `MAX_ROUND_MS` est passé à 4000 (playtest 247). Les premières
 * manches ne tapent plus le plafond : 1500×1,7 = 2550.
 */
export function dureeImposteur(durationMs: number): number {
  return Math.min(
    MAX_ROUND_MS,
    Math.max(IMPOSTEUR_PLANCHER_MS, Math.round(durationMs * IMPOSTEUR_VITESSE)),
  );
}

/**
 * Scène partagée du mode imposteur.
 *
 * Même discipline que `draftShared` (consigne, place, want) mais un chemin
 * SÉPARÉ : un `if` dans `draftShared` changerait toutes les parties
 * classiques. Sur les indices de `IMPOSTEUR_PIEGES`, on retire jusqu'à ce que
 * la règle COMMUNE interdise la consigne — 64 essais, comme `buildRound`.
 *
 * `tentatives` est un levier de test : le casser à 1 doit faire tomber
 * l'assertion de piège forcé sur au moins une graine.
 */
export function draftImposteur(
  seed: number,
  idx: number,
  rule: OneRule,
  pool?: Instruction[],
  tentatives = 64,
): SharedRound {
  const wantsTrap = IMPOSTEUR_PIEGES.has(idx);
  const essais = wantsTrap ? tentatives : 1;
  const tirage = pool ?? TOUCH_INSTRUCTIONS;
  let last!: SharedRound;

  for (let attempt = 0; attempt < essais; attempt++) {
    const rng = mulberry32(hashStr(`${seed}:${idx}:imp:${attempt}`) ^ seed);
    const instr = pickInstruction(rng, idx, tirage);
    const draft = instr.gen(rng, idx);
    const ents = place(rng, draft.specs);
    const want: Want = draft.wantFrom ? draft.wantFrom(ents) : draft.want;
    last = {
      idx,
      instructionId: instr.id,
      text: draft.text,
      phrase: draft.phrase,
      sousPhrase: draft.sousPhrase,
      sub: draft.sub,
      glyph: draft.glyph,
      colorWord: draft.colorWord,
      ents,
      want,
      durationMs: windowForSteps(idx, poidsGestes(compile(want))),
    };
    if (rule.forbids(want, ents) || !wantsTrap) break;
  }

  return last;
}

/**
 * Scène d'observation : même tirage que la manche jouée, SANS transform.
 *
 * Le pool imposteur n'en a pas aujourd'hui. La coupe reste : un ajout
 * futur (LE MENTEUR, LE JUMEAU) ne doit pas fuiter sur le terrain
 * pendant qu'on cherche qui a triché. Les hachures `rule.zone` ne
 * vivent pas dans le `Round` — c'est le renderer qui les prend sur
 * `rule`, et `renduObserve` lui passe `null`.
 */
export function roundObserve(
  seed: number,
  idx: number,
  rule: OneRule,
  pool?: Instruction[],
): Round {
  const shared = draftImposteur(seed, idx, rule, pool);
  const ents = shared.ents.map((e) => ({ ...e }));
  const trap = rule.forbids(shared.want, ents);
  return {
    instructionId: shared.instructionId,
    text: shared.text,
    phrase: shared.phrase,
    sousPhrase: shared.sousPhrase,
    sub: shared.sub,
    glyph: shared.glyph,
    colorWord: shared.colorWord,
    ents,
    steps: trap ? [] : compile(shared.want),
    trap,
    originalWant: trap ? shared.want : undefined,
    durationMs: shared.durationMs,
  };
}

/** Ce que le renderer a le droit de recevoir pendant l'observation. */
export type RenduObserve = { round: Round; rule: null };

export function renduObserve(round: Round): RenduObserve {
  return { round, rule: null };
}

/**
 * Filet du renderer d'observation.
 *
 * `drawZones` s'exécute dès que `rule.zone` est passé. GAUCHER et ANGLES
 * se liraient alors sans réfléchir. Le test casse en passant la règle
 * complète : ça doit tomber.
 */
export function refuseZoneAuRendu(state: {
  rule: { zone?: unknown; transform?: unknown } | null;
}): void {
  if (state.rule?.zone) throw new Error("zone");
  if (typeof state.rule?.transform === "function") throw new Error("transform");
}

/**
 * Un seul vote, après les dix manches.
 *
 * Majorité STRICTE : voix > effectif/2. Moins, égalité, personne n'a voté :
 * l'accusation n'a pas convaincu, l'imposteur gagne. Un `>=` transformerait
 * 2 voix sur 4 en majorité — le test le refuse.
 */
export type IssueVote = {
  accuseId: string | null;
  vainqueur: "imposteur" | "village";
};

export function issueDuVote(
  voix: ReadonlyMap<string, string>,
  sieges: readonly string[],
  imposteurId: string,
): IssueVote {
  const n = sieges.length;
  const autorises = new Set(sieges);
  const comptes = new Map<string, number>();
  for (const acc of voix.values()) {
    if (!autorises.has(acc)) continue;
    comptes.set(acc, (comptes.get(acc) ?? 0) + 1);
  }
  let top: string | null = null;
  let max = 0;
  let nMax = 0;
  for (const [id, c] of comptes) {
    if (c > max) {
      max = c;
      top = id;
      nMax = 1;
    } else if (c === max) {
      nMax++;
    }
  }
  if (!top || nMax !== 1 || max <= n / 2) {
    return { accuseId: null, vainqueur: "imposteur" };
  }
  return {
    accuseId: top,
    vainqueur: top === imposteurId ? "village" : "imposteur",
  };
}
