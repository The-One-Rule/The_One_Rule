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
import { MOTIFS, MOTIFS_REGLE } from "../src/engine/motifs";
import { mulberry32, rShuffle } from "../src/engine/rng";
import { applyRule, draftShared, poolMulti } from "../src/engine/multiround";
import {
  draftImposteur,
  dureeImposteur,
  IMPOSTEUR_MANCHES,
  SANS_REGLE,
} from "../src/engine/imposteur";
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
  ROOKIE_BONUS_LIVES,
  ROTATION_GRACE_FACTOR,
  STATS_MIN_SAMPLES,
} from "../shared/protocol";
import type { PlayerStats, RoomSettings, RoundOutcome } from "../shared/protocol";

/**
 * Pool de règles multijoueur.
 *
 * Deux exclusions, chacune pour une impossibilité matérielle :
 *   · LA MAIN GAUCHE (watchRelease) — recevoir « tiens ESPACE » par rotation
 *     au milieu d'une manche est injouable ;
 *   · LA VOYELLE — elle ne piège que sur des consignes clavier, or le tirage
 *     multijoueur est tactile (voir draftShared). La garder donnerait à son
 *     porteur une règle qui ne peut jamais le piéger : un avantage gratuit
 *     et invisible, pire qu'une règle dure.
 */
export const MULTI_RULES: OneRule[] = ONE_RULES.filter(
  (r) => !r.watchRelease && r.id !== "voyelle",
);

/**
 * Le pool de règles d'un salon, selon ce que ses joueurs peuvent faire.
 *
 * LA MAIN GAUCHE reste exclue dans les deux cas : tenir ESPACE en recevant la
 * consigne par rotation est injouable même avec un clavier.
 *
 * LA VOYELLE, elle, dépend du salon. Elle ne piège que sur des consignes
 * clavier ; dans un salon tactile elle ne peut donc jamais piéger son porteur,
 * ce qui en fait un avantage gratuit et invisible — la famille de défauts de
 * la décision n°1. Dès que la table entière a un clavier, elle redevient une
 * vraie contrainte et rentre au pool.
 */
export const multiRulesFor = (clavier: boolean): OneRule[] =>
  clavier ? ONE_RULES.filter((r) => !r.watchRelease) : MULTI_RULES;

/**
 * Décalage de graine pour le tirage des règles.
 *
 * Le même nombre sert déjà à tirer les scènes (`draftShared`). Deux usages
 * d'une même graine se corrèlent : ici sans conséquence visible, mais c'est
 * exactement le genre de couplage qui rend un défaut indébuggable six mois
 * plus tard. Une constante suffit à les séparer.
 */
const SEL_REGLES = 0x9e3779b9 | 0;
/** Séparé du tirage des règles : même graine, autre usage, sans corrélation. */
const SEL_IMPOSTEUR = 0x51edbeef | 0;

export interface SeatStats {
  /** Première réaction de chaque manche réussie. On garde les mesures, pas
   *  une moyenne courante : la médiane a besoin de la distribution. */
  reactions: number[];
  trapsAvoided: number;
  streak: number;
  bestStreak: number;
  /** Morts sur SA PROPRE regle unique — voir `MOTIFS_REGLE`. */
  rulebreaks: number;
}

/**
 * Une ÉQUIPE — l'unité qui possède les vies et qui meurt.
 *
 * En solo, chaque joueur est une équipe d'un seul membre. Ce n'est pas un
 * artifice : c'est ce qui permet à tout le reste — élimination, courbe de
 * tension, duel, vainqueur — de ne connaître QUE des équipes, sans un seul
 * branchement de mode dans les chemins chauds. Le mode existant devient le cas
 * particulier, donc il ne peut pas régresser.
 */
export interface Team {
  /** Index dans l'ordre de constitution. */
  id: number;
  /** LA réserve. En duo, une faute de l'un la vide pour les deux. */
  lives: number;
  eliminated: boolean;
  /** Identifiants des joueurs, un en solo, deux en duo. */
  members: string[];
}

export interface Seat {
  id: string;
  /**
   * Vies du joueur — MIROIR de celles de son équipe.
   *
   * Le fil porte les vies par JOUEUR (`PlayerPublic.lives`), et les deux
   * partenaires affichent donc le même nombre : c'est exactement ce qu'on veut
   * leur faire lire. Le champ reste ici pour ne pas toucher au protocole, mais
   * l'AUTORITÉ est `Team.lives` — ne jamais l'écrire directement, passer par
   * `perdUneVie`.
   */
  lives: number;
  /** L'équipe à laquelle ce siège appartient. */
  team: number;
  score: number;
  /** index dans l'ordre des sièges — la rotation tourne sur cet ordre */
  seat: number;
  eliminated: boolean;
  /**
   * Coupé, siège gardé le temps du sursis de reconnexion.
   *
   * Un absent ne joue AUCUNE manche : sans ça, il perdait une vie par timeout
   * toutes les ~1,5 s et se trouvait éliminé en cinq secondes, donc bien avant
   * d'avoir pu revenir — et à deux joueurs son élimination terminait le match
   * pour tout le monde. Le sursis ne servait alors strictement à rien.
   *
   * Absent n'est pas battu : c'est une pause, pas un verdict.
   */
  away: boolean;
  /** Première partie : une vie de plus, annoncée publiquement. */
  rookie: boolean;
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
  return { reactions: [], trapsAvoided: 0, streak: 0, bestStreak: 0, rulebreaks: 0 };
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
  /**
   * Le pool de règles, permuté pour CE match.
   *
   * Il ne l'était pas, et le défaut était invisible à la lecture : `rulesAt`
   * indexait `MULTI_RULES` directement par `(siège + shift)`, sans jamais
   * toucher à la graine — alors que le commentaire de la méthode annonçait
   * « fonction pure de (graine, manche, siège) ». Le siège 0 recevait donc
   * `MULTI_RULES[0]`, c'est-à-dire LE SANG, à la manche 0 de CHAQUE match, à
   * vie. Et comme le siège est l'ordre d'arrivée, l'hôte l'avait toujours.
   *
   * Mesuré sur cinq graines différentes avant correctif : attribution
   * rigoureusement identique les cinq fois. Rapporté depuis le jeu — « le sang
   * qui revient plusieurs fois d'affilé ». C'est la même maladie que la boucle
   * fermée de l'entraînement au jour 2, sur l'autre chemin.
   *
   * La permutation est tirée une fois, dans le constructeur : `rulesAt` est
   * appelée à chaque manche et à chaque reconnexion, et `rShuffle` rend une
   * COPIE — `MULTI_RULES` reste intact d'un match à l'autre.
   */
  private readonly pool: OneRule[];
  /**
   * Le salon joue-t-il au clavier ?
   *
   * Vrai seulement si TOUS les sièges l'ont annoncé, et figé au lancement : un
   * arrivant en cours de match devient spectateur, donc l'effectif assis ne
   * bouge plus et le tirage ne peut pas changer sous les pieds des joueurs.
   * Le client le reçoit dans `match_start` — il ne le déduit pas.
   */
  readonly clavier: boolean;
  /** Fenêtre réelle : courbe moteur × speed × tension, bornée par MIN/MAX_ROUND_MS. */
  private roundDurationMs = 0;
  private shared: SharedRound | null = null;
  private states = new Map<string, PlayerRoundState>();

  /**
   * Les équipes. Une par joueur en solo, une pour deux en duo.
   *
   * L'autorité sur les vies et sur l'élimination est ICI, jamais sur le siège.
   */
  readonly teams: Team[];
  /** Duo : les sièges sont appariés deux à deux et partagent tout. */
  readonly duo: boolean;
  /**
   * Mode imposteur, lu UNE FOIS au constructeur et figé.
   *
   * Une mutation de `settings.mode` après coup ne doit rien changer : le
   * rythme, le secret et l'absence d'élimination appartiennent au match, pas
   * au salon qui survit après.
   */
  readonly imposteur: boolean;
  /** Siège sans règle. Null hors imposteur. Ne voyage JAMAIS en public. */
  readonly imposteurId: string | null;
  /** La règle commune — traps: true, une pour tout le monde. */
  readonly regleCommune: OneRule | null;
  /**
   * Journal des dix manches. Lot 3 s'en servira ; ici on stocke, on ne
   * rejoue rien à l'écran.
   */
  readonly journal: Record<string, RoundOutcome>[] = [];

  constructor(
    seed: number,
    playerIds: string[],
    settings: RoomSettings = DEFAULT_SETTINGS,
    /** Sièges qui jouent leur première partie — une vie de plus chacun. */
    rookies: ReadonlySet<string> = new Set(),
    /** Tous les sièges ont un clavier : le pool s'élargit. Défaut prudent. */
    clavier = false,
    /** DUO : deux joueurs par équipe, une seule réserve de vies. */
    duo = false,
  ) {
    this.seed = seed;
    this.settings = settings;
    this.clavier = clavier;
    this.imposteur = settings.mode === "imposteur";
    this.duo = this.imposteur ? false : duo;
    this.imposteurId = null;
    this.regleCommune = null;
    if (this.imposteur) {
      /*
       * UNE règle, tirée SEULEMENT parmi celles qui piègent.
       *
       * Le pool salon (clavier / tactile) reste le filtre d'appareil : LA
       * VOYELLE n'entre que si tout le monde a un clavier, sinon elle serait
       * inerte — décision n°1. `SANS_REGLE` n'est pas dans ce pool.
       */
      const piegeuses = multiRulesFor(clavier).filter((r) => r.traps);
      this.pool = rShuffle(mulberry32(seed ^ SEL_REGLES), piegeuses);
      this.regleCommune = this.pool[0]!;
      const rngImp = mulberry32(seed ^ SEL_IMPOSTEUR);
      this.imposteurId = playerIds[Math.floor(rngImp() * playerIds.length)] ?? null;
    } else {
      this.pool = rShuffle(mulberry32(seed ^ SEL_REGLES), multiRulesFor(clavier));
    }

    /*
     * Appariement : deux sièges consécutifs par équipe.
     *
     * L'ordre des sièges est l'ordre d'ARRIVÉE, donc on apparie les gens dans
     * l'ordre où ils sont entrés. C'est le seul appariement qu'on puisse
     * défendre sans classement ni historique : au moins il est prévisible, et
     * deux amis qui rejoignent l'un après l'autre se retrouvent ensemble.
     */
    this.teams = [];
    for (let i = 0; i < playerIds.length; i += this.duo ? 2 : 1) {
      const membres = playerIds.slice(i, i + (this.duo ? 2 : 1));
      const bonus = membres.some((id) => rookies.has(id)) ? ROOKIE_BONUS_LIVES : 0;
      /*
       * Un impair joue SEUL, avec une réserve réduite.
       *
       * Cinq joueurs font deux duos et un orphelin. Le laisser dehors serait
       * exclure justement la personne qu'on risque de perdre ; lui laisser la
       * réserve entière serait un avantage net, puisqu'une équipe de deux la
       * vide avec deux sources d'erreur au lieu d'une. La moitié arrondie au
       * supérieur rétablit à peu près la parité — 2 sur 3, 3 sur 5.
       *
       * Ce n'est pas exact et ça ne peut pas l'être : deux joueurs ne font pas
       * exactement deux fois plus de fautes qu'un seul. C'est un point à
       * regarder en soirée, pas un calcul à raffiner sur le papier.
       */
      const seul = this.duo && membres.length === 1;
      const base = seul ? Math.ceil(settings.lives / 2) : settings.lives;
      this.teams.push({
        id: this.teams.length,
        lives: base + bonus,
        eliminated: false,
        members: membres,
      });
    }

    this.seats = playerIds.map((id, i) => {
      const team = this.teams.findIndex((t) => t.members.includes(id));
      return {
        id,
        lives: this.teams[team]!.lives,
        team,
        score: 0,
        seat: i,
        eliminated: false,
        away: false,
        rookie: rookies.has(id),
        stats: emptySeatStats(),
      };
    });
  }

  /** L'équipe d'un siège. */
  teamOf(seat: Seat): Team {
    return this.teams[seat.team]!;
  }

  /**
   * Retire une vie à l'ÉQUIPE, et répercute sur ses membres.
   *
   * Point unique de vérité : `Seat.lives` et `Seat.eliminated` ne sont que des
   * miroirs, parce que le protocole transporte les vies par joueur. Les écrire
   * ailleurs ferait diverger ce que le serveur juge de ce que l'écran montre.
   */
  private perdUneVie(seat: Seat): void {
    const t = this.teamOf(seat);
    t.lives--;
    if (t.lives <= 0) t.eliminated = true;
    for (const s of this.seats) {
      if (s.team !== t.id) continue;
      s.lives = Math.max(0, t.lives);
      s.eliminated = t.eliminated;
    }
  }

  /** Équipes encore en lice. C'est l'unité qui compte pour la fin du match. */
  get teamsAlive(): Team[] {
    return this.teams.filter((t) => !t.eliminated);
  }

  /**
   * Attribution des règles à une manche donnée.
   *
   * Chaque siège reçoit une règle différente tant que le pool le permet, et
   * l'attribution TOURNE d'un cran toutes les `rotationEvery` manches : au
   * moment où un joueur a intégré sa contrainte, elle change de mains.
   *
   * L'index parcourt `this.pool` — le pool PERMUTÉ pour ce match — et non
   * `MULTI_RULES`. C'est toute la différence entre « ta règle dépend de ton
   * ordre d'arrivée, à vie » et « ta règle change à chaque partie ». Le
   * décalage d'un cran par rotation est conservé : c'est lui qui fait passer
   * une contrainte de mains, et il garde son sens dans un pool permuté.
   *
   * L'attribution est TRANSMISE, pas recalculée par le client (`msg.rules`,
   * voir `server/index.ts`). Elle peut donc changer sans risque de désaccord
   * entre les deux — un aperçu qui contredirait le verdict serait le seul
   * défaut tenu pour fatal.
   */
  rulesAt(idx: number): Map<string, OneRule> {
    if (this.imposteur && this.regleCommune) {
      const out = new Map<string, OneRule>();
      for (const s of this.seats) {
        out.set(s.id, s.id === this.imposteurId ? SANS_REGLE : this.regleCommune);
      }
      return out;
    }
    const every = Math.max(1, this.settings.rotationEvery);
    const shift = Math.floor(idx / every);
    const out = new Map<string, OneRule>();
    for (const s of this.seats) {
      /*
       * L'index parcourt l'ÉQUIPE, pas le siège.
       *
       * En solo les deux coïncident — un joueur, une équipe — donc rien ne
       * change. En duo, les deux partenaires reçoivent la même règle : c'est
       * ce qui leur permet de se surveiller mutuellement, et ce qui rend une
       * faute de l'un compréhensible pour l'autre. Sans ça, chacun jouerait
       * une contrainte que son partenaire n'aurait aucune raison de connaître.
       */
      const rule = this.pool[(s.team + shift) % this.pool.length]!;
      out.set(s.id, rule);
    }
    return out;
  }

  /**
   * Attribution PUBLIQUE : tout le monde porte l'id de la règle commune,
   * imposteur compris. C'est ce qui voyage dans `match_start.rules` et
   * `PlayerPublic.ruleId`. `rulesAt` reste l'autorité interne.
   */
  reglesPubliques(idx: number): Record<string, string> {
    const out: Record<string, string> = {};
    if (this.imposteur && this.regleCommune) {
      const id = this.regleCommune.id;
      for (const s of this.seats) out[s.id] = id;
      return out;
    }
    for (const [pid, rule] of this.rulesAt(idx)) out[pid] = rule.id;
    return out;
  }

  rotationJustHappened(idx: number): boolean {
    if (this.imposteur) return false;
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
    /*
     * La tension se compte en ÉQUIPES.
     *
     * En solo, une équipe par joueur : les chiffres sont identiques à avant, et
     * les tests de la courbe le vérifient. En duo, la vis doit se resserrer
     * quand une ÉQUIPE tombe — pas quand un partenaire tombe, sinon un duo
     * amputé déclencherait à lui seul l'apnée du duel alors que quatre
     * personnes jouent encore.
     */
    const seats = this.teams.length;
    const alive = this.teamsAlive.length;
    const eliminated = seats - alive;
    /*
     * Duel : resserré, mais plus étranglé.
     *
     * 0,55 poussait la fenêtre au plancher — et le plancher lui-même était à
     * 520 ms, sous le seuil de 700 ms que ce projet reconnaît comme celui du
     * jouable. Rapporté en soirée : « les joueurs ont à peine le temps de lire
     * et comprendre leur règle avant que la situation soit terminée ». Une
     * apnée doit se sentir, pas rendre la manche illisible.
     */
    if (alive === 2 && eliminated > 0) return 0.7;
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
    this.shared = this.imposteur && this.regleCommune
      ? draftImposteur(this.seed, this.roundIdx, this.regleCommune, poolMulti(this.clavier))
      : draftShared(this.seed, this.roundIdx, poolMulti(this.clavier));
    this.states.clear();
    const rules = this.rulesAt(this.roundIdx);
    for (const s of this.alive) {
      // Un absent n'a pas d'état : closeRound le verra donc « idle », sans
      // perte de vie ni rupture de série. C'est ce qui rend le sursis de
      // reconnexion réellement utile.
      if (s.away) continue;
      const round = applyRule(this.shared, rules.get(s.id)!, this.seed);
      this.states.set(s.id, { round, progress: { step: 0 }, outcome: null, firstInputMs: null });
    }

    // Tempo serveur : la courbe de base du moteur, le réglage salon, puis la
    // tension dramatique — le tout borné des deux côtés. Aucune combinaison de
    // réglages ne doit produire une manche injouable ni une manche bavarde.
    // Plancher d'abord, plafond ensuite ; comme MIN < MAX, l'ordre est sans
    // effet, il est fixé pour la lecture.
    // input() borne sur roundDurationMs — même fenêtre pour juger et afficher.
    /*
     * La première manche sous une règle NEUVE respire.
     *
     * Lire un nom de règle ne suffit pas, il faut l'appliquer — et cette
     * manche-là demandait le même effort conscient qu'à un débutant, souvent
     * au plancher de vitesse. C'est la cause principale des pertes de vies
     * relevées en soirée.
     */
    const grace = this.rotationJustHappened(this.roundIdx) ? ROTATION_GRACE_FACTOR : 1;
    this.roundDurationMs = this.imposteur
      ? dureeImposteur(this.shared.durationMs)
      : Math.min(
          MAX_ROUND_MS,
          Math.max(
            MIN_ROUND_MS,
            Math.round(
              this.shared.durationMs * this.settings.speed * this.tensionAt(this.roundIdx) * grace,
            ),
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
    if (elapsedMs < 0 || elapsedMs > this.durationFor(st)) return null;

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

  /**
   * Fenêtre RÉELLE d'un joueur, sa règle comprise.
   *
   * `roundDurationMs` part de la manche partagée et vaut donc pour tout le
   * monde — c'est elle qui fixe l'échéance diffusée. Mais une règle peut
   * déformer la durée : L'ACCÉLÉRATION retranche 30 % dans `applyRule`, et
   * cette déformation n'était lue nulle part côté serveur. Son porteur avait
   * donc une règle qui ne pouvait jamais l'atteindre — un avantage gratuit et
   * invisible, exactement ce qui avait fait sortir LA VOYELLE du pool.
   *
   * On rejoue la même formule que `openRound`, mais sur la durée personnelle.
   */
  private durationFor(st: PlayerRoundState): number {
    if (this.imposteur) return dureeImposteur(st.round.durationMs);
    return Math.min(
      MAX_ROUND_MS,
      Math.max(
        MIN_ROUND_MS,
        Math.round(st.round.durationMs * this.settings.speed * this.tensionAt(this.roundIdx)),
      ),
    );
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
        /*
         * CHAQUE mort coûte une vie à la réserve commune.
         *
         * Si les deux partenaires tombent la même manche, l'équipe en perd
         * deux. C'est la lecture la plus dure et la plus claire de « une erreur
         * d'un membre affecte directement son partenaire » — et c'est elle qui
         * donne sa valeur à la coordination : se rattraper l'un l'autre change
         * réellement l'issue.
         *
         * Imposteur : une « mort » n'est qu'une ligne au journal. Personne
         * n'est éliminé, les vies ne bougent pas.
         */
        if (!this.imposteur) this.perdUneVie(s);
        s.stats.streak = 0;
        /*
         * Mourir sur SA PROPRE regle n'est pas la meme faute que rater une
         * cible ou laisser filer le temps : c'est la moitie non copiable du
         * jeu. On compte donc a part, ici et pas dans le client — deux
         * clients qui observent des fenetres differentes decerneraient des
         * titres differents sur le meme ecran.
         */
        if (MOTIFS_REGLE.includes(out.reason)) s.stats.rulebreaks++;
      }
      outcomes.set(s.id, out);
    }

    const alive = this.alive;
    /*
     * La fin se compte en ÉQUIPES, pas en joueurs.
     *
     * En solo chaque joueur est son équipe, donc rien ne change. En duo, un
     * partenaire survivant ne suffit pas à finir le match : il reste deux
     * équipes tant que deux réserves tiennent. C'est ce qui fait qu'un duo
     * amputé continue de jouer — et c'est exactement le moment intéressant.
     */
    const equipes = this.teamsAlive;
    const rec: Record<string, RoundOutcome> = {};
    for (const [id, o] of outcomes) rec[id] = o;
    this.journal.push(rec);
    const matchOver = this.imposteur
      ? this.roundIdx >= IMPOSTEUR_MANCHES - 1
      : equipes.length === 0 || (this.teams.length > 1 && equipes.length <= 1) || alive.length === 0;
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
      rulebreaks: s.stats.rulebreaks,
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

  /**
   * Marque un siège absent (coupure) ou de retour.
   *
   * Le serveur est seul à savoir qui est connecté ; MatchLogic reste pure et
   * se contente d'obéir. Un siège absent est sauté à l'ouverture des manches,
   * mais il compte toujours parmi les vivants : une coupure ne doit pas
   * déclencher la fin de match par « dernier survivant ».
   */
  setAway(playerId: string, away: boolean): void {
    const s = this.seats.find((x) => x.id === playerId);
    if (s && !s.eliminated) s.away = away;
  }

  /** Départ anticipé : le siège reste (les règles ne re-tournent pas), la vie s'arrête. */
  forfeit(playerId: string): void {
    const s = this.seats.find((x) => x.id === playerId);
    if (!s || s.eliminated) return;
    s.eliminated = true;
    const st = this.states.get(playerId);
    if (st && !st.outcome) st.outcome = { kind: "death", reason: MOTIFS.parti };

    /*
     * Un départ élimine le SIÈGE ; l'ÉQUIPE ne tombe que si plus personne n'y
     * joue.
     *
     * En solo les deux coïncident, donc rien ne change — c'est ce que
     * vérifient les tests de la courbe de tension, qui simulent leurs
     * éliminations par des forfaits.
     *
     * En duo, c'est un vrai choix : le partenaire resté continue avec la
     * réserve commune, telle qu'elle est. On ne lui rend pas les vies déjà
     * perdues, et on ne le punit pas non plus du départ de l'autre. Un duo
     * amputé qui s'accroche est exactement le moment qu'on veut voir.
     */
    const t = this.teamOf(s);
    const restants = this.seats.filter((x) => x.team === t.id && !x.eliminated);
    if (restants.length === 0) {
      t.lives = 0;
      t.eliminated = true;
      s.lives = 0;
    }
  }
}
