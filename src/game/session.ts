import { DAILY_LENGTH, GRACE_ROUNDS, isTierBoundary, pardonnable, tierOf } from "../engine/difficulty";
import { INSTRUCTIONS, TOUCH_INSTRUCTIONS } from "../engine/instructions";
import { buildRound } from "../engine/round";
import { combineRules } from "../engine/rules/combine";
import { pileA } from "../engine/escalade";
import { resolveAction, resolveTimeout, resoudreDejoue } from "../engine/resolve";
import type { Action, Instruction, OneRule, Outcome, Rng, Round, RoundProgress } from "../engine/types";
import type { LoggedInput } from "../engine/verify";

export type Mode = "daily" | "training" | "ranked" | "escalade";
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
  /** Manches terminées par le raccourci DÉJOUER. Toujours 0 hors entraînement. */
  dejoues: number;
  /** Dont celles qui étaient de vrais PIÈGES — le geste que le jeu existe pour apprendre. */
  piegesDejoues: number;
}

const FREEZE_MS = 520;

/**
 * Orchestrateur d'un run. Ne connaît pas le DOM et ne lit jamais l'horloge :
 * l'appelant lui passe `now`. Un run est donc rejouable à l'identique.
 */
export class Session {
  readonly mode: Mode;
  /**
   * La pile de règles du run.
   *
   * Un seul élément partout sauf en ESCALADE, où elle est tirée d'avance et
   * se révèle par paliers. La garder ici plutôt que dans le mode permet à tout
   * le reste — `buildRound`, `resolveAction`, `verify.ts`, le bandeau — de
   * continuer à ne connaître qu'UNE règle : c'est `combineRules` qui fait le
   * pont, et c'est ce qui a évité de toucher au moteur.
   */
  readonly pile: readonly OneRule[];
  /** La composée du palier courant. Recalculée seulement quand le palier change. */
  private _rule!: OneRule;
  /** Règle qui vient d'être ajoutée, à annoncer une fois. Remise à null après. */
  regleAjoutee: OneRule | null = null;
  /**
   * La dernière règle acquise, elle CONSERVÉE.
   *
   * C'est celle dont le bandeau montre l'explication : les précédentes, on les
   * a tenues huit manches au moins, on les a automatisées. La nouvelle est la
   * seule qu'on doive encore relire — et la ligne de brief est unique et de
   * hauteur fixe, donc il faut choisir laquelle y mettre.
   */
  derniereAjoutee: OneRule | null = null;
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
  /** Multiplicateur de fenêtre — 1 hors entraînement, toujours. */
  readonly pace: number;
  /** ESCALIER : manches à tenir. `undefined` = la borne du mode. */
  private readonly longueur?: number;
  /** ESCALIER : cadence de pièges forcés. `undefined` = `FORCED_TRAP_ROUNDS`. */
  private readonly forcePiege?: (level: number) => boolean;
  /** Le raccourci DÉJOUER est-il permis dans ce run ? Jamais hors entraînement. */
  readonly dejoueActif: boolean;
  /** Lettre retirée du tirage parce qu'elle déjoue. `undefined` partout ailleurs. */
  readonly toucheReservee?: string;
  dejoues = 0;
  piegesDejoues = 0;

  private runStart: number;

  /**
   * La règle en vigueur À CETTE MANCHE.
   *
   * Un accesseur et non un champ : en escalade elle change au palier. Elle
   * n'est recomposée que dans `majRegle`, pas à chaque lecture — `buildRound`
   * et `resolveAction` l'interrogent plusieurs fois par manche, et
   * `combineRules` alloue.
   */
  get rule(): OneRule {
    return this._rule;
  }

  /** Nombre de règles tenues à cette manche — c'est le score de l'escalade. */
  get paliers(): number {
    return pileA(this.pile, this.level).length;
  }

  /**
   * Les règles RÉELLEMENT tenues, une par une.
   *
   * ⚠️ `rule` rend leur COMPOSÉE, dont l'identifiant est fabriqué par
   * `combineRules` en collant les autres avec des `+` — « azur+pointe+voyelle
   * +colosse ». C'est un identifiant de calcul, pas une règle du catalogue, et
   * tout ce qui le traite comme tel se casse : une carte cherchée à
   * `/cartes/azur+pointe+voyelle+colosse.png` rend une image morte, et une
   * entrée de carnet écrite sous ce nom est un fantôme qui compte dans les
   * totaux et voyage jusqu'au compte.
   *
   * Cet accesseur existe pour que l'appelant puisse toujours redescendre aux
   * VRAIES règles.
   */
  get reglesTenues(): readonly OneRule[] {
    return pileA(this.pile, this.level);
  }

  constructor(opts: {
    mode: Mode;
    rule: OneRule;
    rng: Rng;
    now: number;
    seed: number;
    touchOnly?: boolean;
    /** Allure — n'a d'effet qu'en entraînement, voir PACE_CHOICES. */
    pace?: number;
    /** ESCALADE : la pile complète, tirée d'avance. Voir engine/escalade.ts. */
    pile?: readonly OneRule[];
    /**
     * ESCALIER : le nombre de manches à tenir, et la cadence de pièges.
     *
     * ⚠️ Les deux sont OPTIONNELS et absents partout ailleurs. C'est la même
     * astuce que l'escalade et que le DUO : le mode existant devient un cas
     * particulier du nouveau, donc aucun branchement de mode n'entre dans un
     * chemin chaud et l'existant ne peut pas régresser. Sans `longueur`,
     * `maxRounds` répond exactement ce qu'il répondait ; sans `forcePiege`,
     * `buildRound` reprend `FORCED_TRAP_ROUNDS`.
     */
    longueur?: number;
    forcePiege?: (level: number) => boolean;
    /**
     * LE RACCOURCI DÉJOUER — voir `resoudreDejoue`.
     *
     * ⚠️ Il ne s'allume qu'en ENTRAÎNEMENT, quoi que l'appelant demande : le
     * run du jour, le classé et l'escalade doivent rester les mêmes épreuves
     * pour tout le monde. Décision de Pierre : « raccourci, et non partout ».
     */
    dejoue?: boolean;
    /**
     * La lettre qui déjoue au clavier, retirée du tirage. Ignorée sur un appareil
     * tactile : le pool n'y contient aucune consigne clavier, et le raccourci y
     * passe par un bouton.
     */
    toucheDejoue?: string;
  }) {
    this.mode = opts.mode;
    this.pile = opts.pile?.length ? opts.pile : [opts.rule];
    this.rng = opts.rng;
    this.seed = opts.seed;
    this.runStart = opts.now;
    // L'allure ne s'applique qu'à l'entraînement : le run du jour et le classé
    // doivent rester identiques pour tout le monde, sinon un score ne se
    // compare plus à rien.
    this.pace = opts.mode === "training" ? (opts.pace ?? 1) : 1;
    /*
     * L'échauffement vaut AUSSI pour l'entraînement.
     *
     * Il était à zéro : le mode censé servir à apprendre tuait à la première
     * faute, alors que le run du jour offrait trois manches de grâce. Le bac à
     * sable était donc strictement plus punitif que l'épreuve — inversé, et
     * c'est ce qui bloquait les débutants avant qu'ils aient pu automatiser la
     * vérification de leur règle unique.
     */
    this.grace = GRACE_ROUNDS;
    this.pool = opts.touchOnly ? TOUCH_INSTRUCTIONS : INSTRUCTIONS;
    this.longueur = opts.longueur;
    this.forcePiege = opts.forcePiege;
    this.dejoueActif = opts.mode === "training" && opts.dejoue === true;
    this.toucheReservee =
      this.dejoueActif && !opts.touchOnly && opts.toucheDejoue
        ? opts.toucheDejoue.toUpperCase()
        : undefined;
    this.majRegle();
    this.nextRound(opts.now);
  }

  /**
   * Recompose la règle du palier courant.
   *
   * Renvoie la règle nouvellement acquise, ou `null` si rien n'a changé —
   * c'est ce qui permet de l'annoncer UNE fois. Hors escalade, la pile ne
   * contient qu'un élément et `combineRules` rend cet élément lui-même : le
   * mode ordinaire ne paie donc rien de tout ça.
   */
  private majRegle(): OneRule | null {
    const avant = this._rule ? pileA(this.pile, this.level - 1).length : 0;
    const tenue = pileA(this.pile, this.level);
    this._rule = combineRules(tenue);
    return tenue.length > avant && avant > 0 ? (tenue[tenue.length - 1] ?? null) : null;
  }

  get maxRounds(): number {
    // Un palier de l'escalier porte sa propre borne : c'est ce qui fait qu'on
    // le FRANCHIT au lieu d'y survivre. Ailleurs, rien n'a bougé — le classé
    // est borné comme le quotidien, deux runs de longueur différente ne se
    // comparant pas, et l'entraînement libre n'a pas de fin.
    if (this.longueur !== undefined) return this.longueur;
    return this.mode === "training" ? Infinity : DAILY_LENGTH;
  }

  get inGrace(): boolean {
    return this.level < this.grace;
  }

  /**
   * La manche où l'échauffement vient de s'arrêter.
   *
   * ⚠️ LA FALAISE, MESURÉE. Sur 569 runs réels, la répartition des morts par
   * manche est : 0 à la manche 0, 0 à la 1, 0 à la 2 — l'échauffement protège
   * — puis **76 à la manche 3**, contre 30 à la 4 et 21 à la 6. La première
   * manche qui compte tue plus du double de n'importe quelle autre.
   *
   * La cause est de conception : pendant trois manches on APPREND au joueur
   * que se tromper ne coûte rien, et le bandeau le lui dit en toutes lettres.
   * Puis le message disparaît en silence et la règle change sans prévenir.
   * L'échauffement n'enseignait pas, il repoussait.
   *
   * On ne touche NI à la courbe de difficulté NI à `GRACE_ROUNDS` : les deux
   * entrent dans `VERSION_CONTENU` et couperaient la comparabilité de tous les
   * scores déjà enregistrés. On annonce le passage, c'est tout — la même
   * doctrine que la rotation de règle en multijoueur, qui coûtait deux tiers
   * des pertes de vies tant qu'elle était muette.
   */
  get graceJustEnded(): boolean {
    return this.grace > 0 && this.level === this.grace;
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
    // L'ordre compte : la règle du palier doit être à jour AVANT de bâtir la
    // manche, sinon le premier tour d'un nouveau palier se jouerait encore
    // sous l'ancienne pile — et le piège annoncé ne serait pas celui posé.
    this.regleAjoutee = this.majRegle();
    if (this.regleAjoutee) this.derniereAjoutee = this.regleAjoutee;
    this.round = buildRound(
      this.rng,
      this.level,
      this.rule,
      this.pool,
      this.pace,
      this.forcePiege,
      this.toucheReservee,
    );
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

  private die(
    outcome: Extract<Outcome, { kind: "death" }>,
    now: number,
    /**
     * L'action fautive, quand il y en a une.
     *
     * ⚠️ Absente sur un dépassement de temps — et c'est juste : `pardonnable`
     * ne refuse le pardon qu'à un relâchement, jamais à l'horloge.
     */
    action?: Action,
  ): void {
    // échauffement : la manche est perdue mais le run continue — sauf pour une
    // violation de MAINTIEN, qui décrit un état et non un geste (voir
    // `pardonnable`, engine/difficulty.ts).
    if (this.inGrace && (!action || pardonnable(this.rule, action))) {
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
      dejoues: this.dejoues,
      piegesDejoues: this.piegesDejoues,
    };
  }

  /**
   * Le raccourci DÉJOUER : « la bonne réponse était de ne rien faire, je l'ai vu ».
   *
   * ⚠️ **HORS DU JOURNAL, ET C'EST VOULU.** `log` est ce que le serveur rejoue
   * pour valider un run du jour ou un match classé ; le déjouage n'existe dans
   * aucun des deux. Un run d'entraînement n'est jamais soumis. L'y écrire
   * obligerait `verifyRun` à connaître une action qui ne doit pas exister de
   * son côté.
   *
   * Une erreur pendant l'échauffement est pardonnée comme les autres : aucune
   * action n'est passée à `die`, donc `pardonnable` n'a rien à refuser.
   */
  dejouer(now: number): Outcome {
    if (this.phase !== "playing" || !this.dejoueActif) return { kind: "pending" };
    const outcome = resoudreDejoue(this.round);
    if (outcome.kind === "survive") {
      this.dejoues++;
      if (this.round.trap) this.piegesDejoues++;
      this.survive(now);
    } else if (outcome.kind === "death") {
      this.die(outcome, now);
    }
    return outcome;
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
    else if (outcome.kind === "death") this.die(outcome, now, action);
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
