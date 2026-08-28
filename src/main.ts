import "./style.css";

import {
  DAILY_LENGTH,
  PACE_CHOICES,
  PACE_DEFAULT,
  PACE_LABELS,
  TIER_NAMES,
  windowMs,
} from "./engine/difficulty";
import { mulberry32 } from "./engine/rng";
import { ONE_RULES, withoutHold } from "./engine/rules";
import type { Action, OneRule, Outcome } from "./engine/types";

import { dailySeed, dayIndex, ruleOfDay, tomorrowRule, trainingRule } from "./game/daily";
import * as P from "./game/progress";
import { bump, claimAll, ensureDay, viewQuests } from "./game/quests";
import { Session } from "./game/session";
import type { Mode } from "./game/session";
import type { LoggedInput } from "./engine/verify";
import {
  challengeUrl,
  ghostDone,
  ghostFinal,
  ghostLevelAt,
  readChallenge,
  ruleOfReplay,
} from "./game/replay";
import type { Replay } from "./game/replay";
import { divisionOf } from "./ranked/elo";
import { findMatch, rankedAvailable, submitRun } from "./ranked/client";
import type { Opponent } from "./ranked/client";

import { Hud } from "./render/hud";
import { fillOptions } from "./render/option";
import { colorHex, SceneRenderer } from "./render/scene";
import { stableGutter, wantsColumns } from "./render/layout";
import { cleanEnv } from "./env";
import { musicApi, setEnabled, setMusicEnabled, sfx, unlock } from "./audio";
import { flush, initAnalytics, setAnalyticsEnabled, track } from "./analytics";
import { initMulti, readInvite } from "./multi";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/**
 * Téléphone : on retire les consignes clavier du tirage. Perdre une manche
 * qu'on ne pouvait matériellement pas jouer est la pire chose qu'un jeu de
 * réflexes puisse faire.
 */
const TOUCH_ONLY =
  typeof matchMedia !== "undefined" && matchMedia("(hover: none) and (pointer: coarse)").matches;

/** Le clavier est un organe de jeu. Dès qu'une saisie a le focus, plus aucune
 *  touche ne l'atteint — pas même l'espace. */
const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

const hud = new Hud();
const cv = $<HTMLCanvasElement>("cv");
const scene = new SceneRenderer(cv);
const appEl = $("app");
let gutters = false;
let lastKey = "";
/** Verrou anti-oscillation de la mise en page — voir syncField(). */
let lastGutterToggle = -Infinity;
let gutterRecheck: ReturnType<typeof setTimeout> | null = null;
const GUTTER_LOCK_MS = 450;
/**
 * Recalcule la transformation, puis publie le champ pour le CSS.
 *
 * L'écriture est conditionnée à un changement réel : écrire des variables
 * depuis un ResizeObserver qui observe la même boîte est le plus court chemin
 * vers une boucle de mise en page.
 */
function syncField(): void {
  scene.resize();
  const f = scene.fieldRect();
  const a = appEl.getBoundingClientRect();
  const c = cv.getBoundingClientRect();
  const top = Math.round(c.top - a.top + f.y);
  const left = Math.round(c.left - a.left + f.x);
  const gw = Math.round(f.x);
  const key = `${top}|${left}|${gw}|${Math.round(f.w)}|${Math.round(f.h)}`;
  if (key === lastKey) return;
  lastKey = key;
  appEl.style.setProperty("--field-top", `${top}px`);
  appEl.style.setProperty("--field-left", `${left}px`);
  appEl.style.setProperty("--field-w", `${Math.round(f.w)}px`);
  appEl.style.setProperty("--field-h", `${Math.round(f.h)}px`);
  appEl.style.setProperty("--gutter-w", `${gw}px`);
  /*
   * La décision « colonnes latérales ou bandeau du bas » ne doit PAS se prendre
   * sur la gouttière courante.
   *
   * En bandeau, les plaques sont dans le flux : elles prennent de la hauteur,
   * la scène rétrécit, la gouttière s'élargit. En colonnes, elles sortent du
   * flux : la scène grandit, la gouttière se réduit. Décider sur cette
   * grandeur, c'est mesurer ce que la décision vient de changer — les deux
   * états se répondent, la mise en page clignote, et le navigateur finit par
   * abandonner des notifications de redimensionnement en laissant la géométrie
   * figée sur une valeur fausse. C'est ce qui rendait les pièces invisibles,
   * puis les plaques tantôt sur les côtés, tantôt en bas, sans logique visible.
   *
   * Élargir la bande ou temporiser ne faisait qu'amortir une boucle qui n'a pas
   * lieu d'exister. On calcule donc la gouttière que produirait TOUJOURS le mode
   * colonnes, en reconstituant la hauteur de scène plaques hors flux. Cette
   * grandeur est la même dans les deux états : la boucle est rompue par
   * construction, plus par tempérament.
   */
  const platesEl = $("plates");
  const dansLeFlux = !gutters && !platesEl.classList.contains("hidden");
  const hHorsFlux = cv.clientHeight + (dansLeFlux ? platesEl.offsetHeight : 0);
  const next = wantsColumns(stableGutter(cv.clientWidth, hHorsFlux), gutters);
  if (next === gutters) return;

  /*
   * Bascule DIFFÉRÉE, jamais abandonnée.
   *
   * Première version de ce verrou : on jetait la bascule quand elle arrivait
   * trop tôt. Or syncField() ne tourne que sur événement — ResizeObserver ou
   * resize de fenêtre. Une bascule jetée n'était donc reprise par personne, et
   * la mise en page restait coincée dans le mauvais état : colonnes latérales
   * conservées alors que la gouttière était retombée à ~10 px, donc plaques
   * rognées par l'`overflow: hidden` de la colonne.
   *
   * On réarme donc une vérification pour la fin du verrou. La terminaison est
   * toujours garantie — une bascule ne peut pas en déclencher une autre dans
   * la même rafale de mesures — mais aucune transition n'est perdue.
   */
  const attente = GUTTER_LOCK_MS - (performance.now() - lastGutterToggle);
  if (attente > 0) {
    if (gutterRecheck === null) {
      gutterRecheck = setTimeout(() => {
        gutterRecheck = null;
        syncField();
      }, attente);
    }
    return;
  }
  lastGutterToggle = performance.now();
  gutters = next;
  appEl.classList.toggle("has-gutters", next);
}

const SCREENS = [
  "home",
  "brief",
  "over",
  "codex",
  "multi-id",
  "multi-join",
  "multi-lobby",
  "multi-end",
] as const;
type ScreenId = (typeof SCREENS)[number] | null;

let screen: ScreenId = "home";
let session: Session | null = null;
let pendingRule: OneRule | null = null;
let pendingMode: Mode = "daily";
let spaceDown = false;
/** Dernière règle servie à l'entraînement — pour ne pas la resservir aussitôt. */
let derniereEntrainement: string | null = null;
/** Dernier run terminé : la session est libérée dès la fin, mais l'écran
 *  de fin et le partage doivent encore pouvoir s'y référer. */
let lastRun: {
  end: NonNullable<Session["end"]>;
  rule: OneRule;
  mode: Mode;
  seed: number;
} | null = null;
/** Défi reçu par lien : on rejoue exactement la même partie contre ce run. */
let challenge: Replay | null = null;
let ghostLead = false;
/** Match classé en cours : adversaire servi par le serveur, ou null si file vide. */
let ranked: { opponent: Opponent | null; seed: number; ruleId: string } | null = null;
let queueing = false;
/** Dernier point cliqué : sert d'origine aux particules de réussite. */
let lastClick = { x: 500, y: 210, color: "#EFEAE0" };
let day = dayIndex();

/* ------------------------------------------------------------------ *
 * Écrans
 * ------------------------------------------------------------------ */
function show(id: ScreenId): void {
  screen = id;
  for (const s of SCREENS) $(s).classList.toggle("hidden", s !== id);
  multi.onScreen(id);
}

/*
 * Revenir du multijoueur repeint l'accueil.
 *
 * `exitToMenu(); show("home")` — le chemin de QUITTER, de RETOUR et de la fin
 * de match — n'appelait pas `renderHome()`. On retrouvait donc un accueil figé
 * sur l'état d'avant : le compteur de parties multi venait d'augmenter, la
 * carte du jour pouvait avoir changé de statut, et rien de tout cela
 * n'apparaissait avant un rechargement. Afficher l'accueil, c'est le rendre.
 */
const multi = initMulti((id) => {
  if (id === "home") renderHome();
  show(id);
}, hud);

function renderHome(): void {
  const s = P.load();
  ensureDay(s, day);
  P.save(s);

  const rule = ruleOfDay(day);
  hud.setRule(null);
  hud.clearRound();
  hud.setMeta("");
  hud.setFooter(0, s.bestTraining, "—");

  const strip = $("homeStreak");
  strip.innerHTML = "";
  const chip = (html: string, hot = false): void => {
    const el = document.createElement("span");
    el.className = "chip" + (hot ? " chip--hot" : "");
    el.innerHTML = html;
    strip.appendChild(el);
  };
  chip(`SÉRIE <b>${s.streak.count}</b>`, s.streak.count >= 3);
  chip(`PIÈCES <b>${s.coins}</b>`);
  chip(`RÈGLES <b>${Object.keys(s.encountered).length}/${ONE_RULES.length}</b>`);
  if (s.daily.played) chip(`JOUR ${day} <b>FAIT</b>`);
  else chip(`AUJOURD'HUI <b>${rule.name}</b>`);

  renderQuests("homeQuests");

  const neuf = s.recent.length === 0;
  const btn = $<HTMLButtonElement>("btnDaily");
  btn.disabled = s.daily.played;

  /*
   * L'état va dans `.card__state`, jamais dans le textContent de la carte :
   * l'écrire sur le bouton effacerait son titre et sa description.
   */
  // L'accroche taquine la règle du jour ; l'état dit ce qui est en jeu.
  $("cardDailyDesc").textContent = s.daily.played
    ? "C'est fait pour aujourd'hui."
    : teaserDuJour(rule.id, day);
  $("cardDailyState").textContent = s.daily.played
    ? `${s.daily.score} MANCHES · REVIENS DEMAIN`
    : "UN SEUL ESSAI";
  $("cardTrainingState").textContent = neuf
    ? "COMMENCE ICI · TU NE PERDS RIEN"
    : `RECORD · ${s.bestTraining} MANCHES`;
  $("cardMultiState").textContent = multi.available
    ? "DE 2 À 10 JOUEURS"
    : "SERVEUR DE SALONS HORS LIGNE";
  $<HTMLButtonElement>("btnMulti").disabled = !multi.available;

  /*
   * Un écran a UNE action évidente, et elle ne peut pas être un bouton mort.
   *
   * Le run du jour gardait l'accent même une fois joué : l'œil était appelé
   * vers le seul bouton désactivé de la page, et rien ne disait quoi faire
   * ensuite. L'accent passe donc au premier mode encore disponible.
   */
  /*
   * Un nouveau venu ne doit PAS voir le run du jour comme action évidente.
   *
   * C'est le seul mode irréversible du jeu — un essai par jour — et il suppose
   * de connaître la mécanique. Le mettre en avant à quelqu'un qui arrive, c'est
   * lui tendre un piège : constaté sur un vrai testeur, qui l'a brûlé en
   * quinze secondes sans avoir compris la règle unique.
   *
   * L'accent va donc à l'entraînement, qui pardonne et qui enseigne. Le run du
   * jour reste accessible, il cesse seulement d'être ce vers quoi l'œil est
   * appelé.
   */
  const suivant = neuf
    ? "btnTraining"
    : s.daily.played
      ? multi.available
        ? "btnMulti"
        : "btnTraining"
      : "btnDaily";
  for (const id of ["btnDaily", "btnMulti", "btnTraining"]) {
    $(id).classList.toggle("card--primary", id === suivant);
  }

  $("btnRanked").classList.toggle("hidden", !rankedAvailable());
  $("cardRankedState").textContent = `${divisionOf(s.ranked.rating).name} · ${s.ranked.rating}`;
  $("btnSound").textContent = `SON : ${s.sound ? "ON" : "OFF"}`;
  $("btnMusic").textContent = `MUSIQUE : ${s.music ? "ON" : "OFF"}`;
  setEnabled(s.sound);
  setMusicEnabled(s.music);
}

/**
 * Liste des quêtes du jour, dans le conteneur demandé.
 *
 * Deux écrans l'affichent : l'accueil, où elle dit ce qu'il reste à faire, et
 * la fin de run, où elle dit ce que le run vient de faire bouger. `fresh`
 * porte les quêtes validées à l'instant — sans elles, « QUÊTES VALIDÉES ·
 * +30 PIÈCES » ne désigne rien.
 */
function renderQuests(hostId: string, fresh: readonly string[] = []): void {
  const s = P.load();
  const list = $(hostId);
  list.innerHTML = "";
  for (const q of viewQuests(s, day)) {
    const row = document.createElement("div");
    row.className =
      "quest" + (q.done ? " is-done" : "") + (fresh.includes(q.id) ? " is-fresh" : "");
    row.innerHTML =
      `<span class="quest__box"></span><span class="quest__label"></span>` +
      `<span class="quest__val">${Math.min(q.value, q.target)}/${q.target} · +${q.reward}</span>`;
    row.querySelector<HTMLElement>(".quest__label")!.textContent = q.label;
    list.appendChild(row);
  }
}

/**
 * Choix de l'allure, sur l'écran d'annonce et pour l'ENTRAÎNEMENT seulement.
 *
 * La courbe de difficulté suppose un joueur qui a automatisé la vérification
 * de sa règle unique ; un débutant ne l'a pas encore, et il meurt avant de
 * l'acquérir. L'entraînement est l'endroit prévu pour combler ce trou — et le
 * seul : le run du jour reste identique pour tout le monde.
 */
function renderPace(): void {
  const box = $("briefPace");
  const hint = $("briefPaceHint");
  /*
   * Pas d'allure sur un DUEL, même s'il passe par le mode entraînement.
   *
   * Un duel se compare aux temps de passage d'un fantôme : élargir sa fenêtre
   * rendrait la comparaison fausse sans que personne ne le voie. Le lien de
   * défi n'aurait plus le même sens des deux côtés.
   */
  const isTraining = pendingMode === "training" && !challenge;
  box.classList.toggle("hidden", !isTraining);
  hint.classList.toggle("hidden", !isTraining);
  if (!isTraining) return;

  const current = P.load().trainingPace;
  const opts = $("optPace");
  /*
   * Chaque allure porte SA fenêtre, plutôt qu'une ligne qui n'annonçait que
   * celle du choix courant. On compare les trois d'un coup d'œil, ce qui est
   * la seule question qu'on se pose ici : « combien de temps j'aurai ».
   *
   * Les allures sont rangées de la plus lente à la plus rapide — `PACE_CHOICES`
   * les donne dans l'autre sens, et une jauge qui descend de gauche à droite
   * se lit à l'envers.
   */
  const lentesDabord = [...PACE_CHOICES].sort((a, b) => b - a);
  fillOptions(
    opts,
    lentesDabord.map((v, i) => ({
      value: String(v),
      label: PACE_LABELS[v] ?? String(v),
      hint: `${Math.round(windowMs(10) * v)} MS`,
      level: i + 1,
      steps: lentesDabord.length,
      icon: "bars" as const,
      selected: v === current,
      aria: `${PACE_LABELS[v] ?? v} — ${Math.round(windowMs(10) * v)} millisecondes à la manche 10`,
    })),
  );
  for (const btn of Array.from(opts.children)) {
    btn.addEventListener("click", () => {
      const v = Number((btn as HTMLElement).dataset.value);
      sfx.ui();
      P.mutate((st) => {
        st.trainingPace = v;
      });
      renderPace();
    });
  }

  // La ligne ne porte plus le chiffre — il est sur chaque bouton. Elle dit ce
  // qu'aucune jauge ne peut dire : à quoi sert l'allure choisie, et laquelle
  // des trois compte pour le record.
  const ref = PACE_LABELS[PACE_DEFAULT] ?? "NORMAL";
  hint.textContent =
    current === PACE_DEFAULT
      ? "ALLURE DE RÉFÉRENCE · C'EST ELLE QUI INSCRIT LE RECORD"
      : current > PACE_DEFAULT
        ? `PLUS DE TEMPS POUR APPRENDRE · LE RECORD NE S'INSCRIT QU'EN ${ref}`
        : `MOINS DE TEMPS QUE LA RÉFÉRENCE · LE RECORD NE S'INSCRIT QU'EN ${ref}`;
}

function renderCodex(): void {
  const s = P.load();
  const list = $("codexList");
  list.innerHTML = "";
  for (const r of ONE_RULES) {
    const rec = s.encountered[r.id];
    const row = document.createElement("div");
    row.className = "codexrow" + (rec ? (rec.cleared ? " is-cleared" : "") : " is-locked");
    row.innerHTML =
      `<span class="codexrow__head">` +
      `<span class="codexrow__name"></span>` +
      `<span class="codexrow__score"></span>` +
      `</span>` +
      `<span class="codexrow__brief"></span>`;
    row.querySelector<HTMLElement>(".codexrow__name")!.textContent = rec ? r.name : "— — — — —";
    row.querySelector<HTMLElement>(".codexrow__score")!.textContent = rec
      ? rec.cleared
        ? `TENU · ${rec.best}`
        : `MEILLEUR ${rec.best}`
      : "JAMAIS RENCONTRÉE";
    /*
     * L'explication n'apparaît QUE pour une règle déjà rencontrée.
     *
     * Le carnet sert à réviser ce qu'on a affronté — pas à lire d'avance ce
     * qui nous attend. La surprise du run du jour est le seul contenu neuf du
     * jeu, et la brûler ici la brûlerait partout.
     */
    row.querySelector<HTMLElement>(".codexrow__brief")!.textContent = rec ? r.brief : "";
    list.appendChild(row);
  }
  show("codex");
}

/**
 * Accroches du run du jour, par règle.
 *
 * Une carte doit donner envie, pas expliquer : « 40 manches, un seul essai,
 * même partie pour tout le monde » se lit comme une notice. Ces lignes
 * taquinent la contrainte du jour sans la révéler — le nom de la règle, lui,
 * reste caché jusqu'à l'écran d'annonce.
 *
 * Deux par règle, choisies par l'index du jour : tout le monde voit la même,
 * et elle change d'un jour à l'autre.
 */
const TEASERS: Record<string, [string, string]> = {
  sang: ["Aujourd'hui, évite de voir rouge.", "Le rouge ne te veut aucun bien."],
  pointe: ["Méfie-toi de ce qui pique.", "Les angles ne sont pas tes amis."],
  voyelle: ["Certaines lettres se retiennent.", "L'alphabet a ses interdits."],
  colosse: ["La taille, ça compte. En mal.", "Les gros ennuis sont les plus visibles."],
  gaucher: ["La gauche est un terrain miné.", "Un côté de l'écran te déteste."],
  seconde: ["La patience paie. Littéralement.", "Ne te précipite surtout pas."],
  eclair: ["Lis vite. Très vite.", "Ça passe, et c'est parti."],
  menteur: ["Ne crois pas tout ce que tu lis.", "Quelqu'un te raconte des histoires."],
  daltonien: ["Fais confiance aux mots, pas à tes yeux.", "Tes yeux vont te trahir."],
  jumeau: ["Une fois ne suffira pas.", "Tout est à refaire. Deux fois."],
  acceleration: ["Prends une inspiration avant.", "Ce sera plus court que prévu."],
  mainGauche: ["Prévois une main de libre.", "Tu vas tenir quelque chose."],
};

const teaserDuJour = (ruleId: string, jour: number): string => {
  const paire = TEASERS[ruleId];
  return paire ? paire[jour % 2 === 0 ? 0 : 1] : "Une règle t'attend.";
};

/**
 * N'a jamais terminé un run.
 *
 * `recent` reçoit le score de CHAQUE run achevé, quel qu'en soit le mode :
 * une liste vide veut donc dire « ce joueur n'a encore rien joué jusqu'au
 * bout ». C'est le signal le plus proche de ce qu'on veut savoir, et il ne
 * demande aucun champ de plus.
 */
const jamaisJoue = (): boolean => P.load().recent.length === 0;

/**
 * Une règle qui exige une touche maintenue est INJOUABLE sans clavier.
 *
 * LA MAIN GAUCHE demande de garder ESPACE enfoncée toute la partie. Sur un
 * téléphone, `startRun()` refuse donc de lancer — « APPUIE SUR ESPACE ET
 * GARDE-LA ENFONCÉE POUR LANCER » — devant un écran qui n'a pas de touche
 * ESPACE. Le run du jour tirant dans les douze règles, un jour sur douze
 * aucun joueur mobile ne pouvait jouer. Et la lever sans plus serait pire :
 * la règle ne juge que sur un relâchement d'ESPACE, donc elle serait
 * parfaitement inerte — un avantage gratuit et invisible, exactement ce que
 * le catalogue s'interdit.
 *
 * C'est la décision déjà prise deux fois ailleurs, pour le même motif : les
 * consignes clavier sortent du tirage tactile (`TOUCH_ONLY`), et LA MAIN
 * GAUCHE sort du pool multijoueur. Elle sort donc aussi du tirage solo quand
 * l'appareil ne peut pas la tenir.
 *
 * Le remplacement est DÉTERMINISTE — la règle suivante du catalogue qui n'a
 * pas de contrainte de maintien — pour que deux téléphones aient la même
 * règle le même jour, et donc des scores encore comparables entre eux.
 */
const regleJouableIci = (rule: OneRule): OneRule => (TOUCH_ONLY ? withoutHold(rule) : rule);

/* ------------------------------------------------------------------ *
 * Lancement d'un run
 * ------------------------------------------------------------------ */
function openBrief(mode: Mode): void {
  const s = P.load();
  pendingMode = mode;

  if (mode === "daily") {
    pendingRule = regleJouableIci(ruleOfDay(day));
  } else {
    pendingRule = trainingRule({
      duJour: ruleOfDay(day).id,
      connues: new Set(Object.keys(s.encountered)),
      derniere: derniereEntrainement,
      sansMaintien: TOUCH_ONLY,
      rng: Math.random,
    });
    derniereEntrainement = pendingRule.id;
  }

  $("briefEyebrow").textContent = mode === "daily" ? `RUN DU JOUR · #${day}` : "ENTRAÎNEMENT";
  $("briefName").textContent = pendingRule.name;
  $("briefText").textContent = pendingRule.brief;

  const warn = $("briefWarn");
  const hold = pendingRule.watchRelease === " ";
  const lines: string[] = [];
  if (mode === "daily") lines.push(`${DAILY_LENGTH} MANCHES · UN SEUL ESSAI PAR JOUR`);
  if (hold) lines.push("APPUIE SUR ESPACE ET GARDE-LA ENFONCÉE");
  warn.textContent = lines.join(" · ");
  warn.classList.toggle("hidden", lines.length === 0);

  /*
   * Un nouveau venu qui choisit le run du jour le perd en quinze secondes.
   *
   * Constaté sur un vrai testeur : il a cliqué RUN DU JOUR en arrivant, n'a
   * rien lu, et a brûlé son unique essai avant d'avoir compris la mécanique.
   * L'avertissement existait DÉJÀ sur cet écran — il ne l'a pas lu. En ajouter
   * un deuxième ne répare rien : un texte qu'on ne lit pas ne devient pas
   * lisible parce qu'on le répète.
   *
   * On ne bloque donc pas, on OFFRE l'autre chemin au moment exact du choix,
   * et on met l'enjeu sur le bouton lui-même plutôt que dans une ligne au
   * -dessus. Pour tous les autres, l'écran ne change pas d'un pixel.
   */
  const neuf = mode === "daily" && jamaisJoue();
  const btnTry = $<HTMLButtonElement>("btnBriefTraining");
  btnTry.classList.toggle("hidden", !neuf);
  $("btnGo").textContent = hold
    ? "MAINTIENS ESPACE"
    : neuf
      ? "COMMENCER · UN SEUL ESSAI"
      : "COMMENCER";
  $("btnGo").classList.toggle("btn--primary", !neuf);
  btnTry.classList.toggle("btn--primary", neuf);

  renderPace();
  show("brief");
}

function startRun(): void {
  if (!pendingRule) return;
  if (pendingRule.watchRelease === " " && !spaceDown) {
    $("briefWarn").textContent = "APPUIE SUR ESPACE ET GARDE-LA ENFONCÉE POUR LANCER";
    $("briefWarn").classList.remove("hidden");
    return;
  }
  unlock();
  const s = P.load();
  // Un duel rejoue la graine de l'adversaire : les deux joueurs affrontent
  // exactement la même suite de manches, sinon la comparaison ne vaut rien.
  const seed = ranked
    ? ranked.seed
    : challenge
      ? challenge.seed
      : pendingMode === "daily"
        ? dailySeed(day)
        : (Math.random() * 2 ** 31) | 0;
  const rng = mulberry32(seed);

  runId++;
  lastRoundKey = "";
  ghostLead = false;
  session = new Session({
    mode: pendingMode,
    rule: pendingRule,
    rng,
    now: performance.now(),
    seed,
    touchOnly: TOUCH_ONLY,
    // Un duel rejoue la partie d'un adversaire et se compare à ses temps de
    // passage : il garde l'allure de référence, quoi qu'ait choisi le joueur.
    pace: challenge ? PACE_DEFAULT : s.trainingPace,
  });
  hud.setRule(pendingRule);
  hud.hideStamp();
  hud.setFooter(
    0,
    pendingMode === "daily" ? DAILY_LENGTH : s.bestTraining,
    pendingMode === "daily" ? `JOUR #${day}` : "ENTRAÎNEMENT",
    pendingMode === "daily" ? "SUR" : "RECORD",
  );
  $("ghost").classList.toggle("hidden", !challenge);
  show(null);
  sfx.runStart();
  musicApi.start();
  // `duel` distingue un défi relevé d'un entraînement ordinaire : les deux
  // arrivent ici en mode "training", et sans ce drapeau le dernier cran de
  // l'entonnoir social est illisible.
  track("run_start", { mode: pendingMode, rule: pendingRule.id, day, duel: !!challenge });
}

/* ------------------------------------------------------------------ *
 * Le mode classé
 * ------------------------------------------------------------------ */
async function openRanked(): Promise<void> {
  if (queueing) return;
  const s = P.load();
  if (!s.ranked.name) {
    const asked = prompt("Ton pseudo pour le classement (14 caractères max) :", "")?.trim();
    if (!asked) return;
    P.mutate((st) => {
      st.ranked.name = asked.slice(0, 14).toUpperCase();
    });
  }

  queueing = true;
  const btn = $<HTMLButtonElement>("btnRanked");
  btn.disabled = true;
  btn.textContent = "RECHERCHE…";

  const me = P.load().ranked;
  const offer = await findMatch(s.anonId, me.name, 0);
  queueing = false;
  btn.disabled = false;
  btn.textContent = "CLASSÉ";

  if (!offer) {
    // Le serveur est absent : on le dit et on n'enferme pas le joueur.
    btn.textContent = "CLASSÉ INDISPONIBLE";
    setTimeout(() => (btn.textContent = "CLASSÉ"), 2200);
    return;
  }

  // Substitution sans risque ici : `sendRanked` transmet l'identifiant de la
  // règle RÉELLEMENT jouée, c'est donc elle que le serveur rejouera.
  const rule = regleJouableIci(ONE_RULES.find((r) => r.id === offer.ruleId)!);
  if (!rule) return;

  ranked = { opponent: offer.opponent, seed: offer.seed, ruleId: offer.ruleId };
  challenge = offer.opponent
    ? { v: 1, seed: offer.seed, ruleId: offer.ruleId, splits: offer.opponent.splits, who: offer.opponent.name }
    : null;
  pendingMode = "ranked";
  pendingRule = rule;

  const div = offer.me.division ?? divisionOf(offer.me.rating);
  $("briefEyebrow").textContent = `CLASSÉ · ${div.name} · ${offer.me.rating}`;
  $("briefName").textContent = rule.name;
  $("briefText").textContent = rule.brief;
  const warn = $("briefWarn");
  warn.textContent = offer.opponent
    ? `CONTRE ${offer.opponent.name} (${offer.opponent.rating}) · IL A TENU ${offer.opponent.score} MANCHES`
    : "AUCUN ADVERSAIRE DISPONIBLE · CE RUN SERVIRA D'ÉTALON AUX SUIVANTS";
  warn.classList.remove("hidden");
  $("btnGo").textContent = rule.watchRelease === " " ? "MAINTIENS ESPACE" : "ENTRER EN LICE";
  renderPace();
  show("brief");
}

async function sendRanked(seed: number, ruleId: string, log: LoggedInput[]): Promise<void> {
  const s = P.load();
  const box = $("rankResult");
  box.classList.remove("hidden");
  box.innerHTML = "ENVOI DU RUN…";

  const res = await submitRun({
    id: s.anonId,
    name: s.ranked.name,
    seed,
    ruleId,
    inputs: log,
    opponentScore: ranked?.opponent?.score,
    opponentRating: ranked?.opponent?.rating,
  });

  if (!res) {
    box.innerHTML = "SERVEUR INJOIGNABLE · RUN NON CLASSÉ";
    return;
  }
  if (res.rejected) {
    // On explique. Un joueur légitime injustement épinglé doit pouvoir
    // comprendre et signaler, pas se heurter à un mur.
    box.innerHTML =
      `<span class="rank__delta">RUN ÉCARTÉ</span>CONTRÔLE : ${res.verdict}<br>` +
      (res.reasons ?? []).map((r) => `· ${r}`).join("<br>");
    return;
  }

  P.mutate((st) => {
    st.ranked.rating = res.me.rating;
    st.ranked.games = res.me.games;
  });

  const c = res.change;
  box.innerHTML = c
    ? `<span class="rank__delta">${c.delta >= 0 ? "+" : ""}${c.delta}</span>` +
      `<b>${res.me.rating}</b> · ${c.division.name}` +
      (c.promoted ? "<br>PROMOTION" : "") +
      (c.floored ? "<br>PLANCHER DE DIVISION : AUCUNE PERTE" : "")
    : `<span class="rank__delta">${res.score}</span>RUN ÉTALON ENREGISTRÉ · <b>${res.me.rating}</b>`;
  if (c?.promoted) sfx.win();
}

/* ------------------------------------------------------------------ *
 * Fin d'un run
 * ------------------------------------------------------------------ */
function finishRun(): void {
  if (!session?.end) return;
  const { end, rule, mode } = session;
  const pace = session.pace;
  lastRun = { end, rule, mode, seed: session.seed };

  const s = P.mutate((st) => {
    ensureDay(st, day);
    const prev = st.encountered[rule.id] ?? { best: 0, cleared: false };
    st.encountered[rule.id] = {
      best: Math.max(prev.best, end.score),
      cleared: prev.cleared || end.cleared,
    };
    st.recent = [...st.recent, end.score].slice(-5);

    bump(st, "runs", 1);
    bump(st, "traps", end.trapsSurvived);
    bump(st, "rounds", end.score);
    bump(st, "best", end.score, "max");
    if (!end.usedKeyboard) bump(st, "noKey", end.score, "max");

    if (mode === "daily") {
      st.daily = { day, played: true, score: end.score, cleared: end.cleared };
      if (end.cleared) bump(st, "dailyCleared", 1);
      P.touchStreak(st, day);
    } else if (pace === PACE_DEFAULT) {
      // Un record obtenu en DÉCOUVERTE ne se compare pas à un record obtenu en
      // RAPIDE. Un chiffre qui mélange les allures ne veut plus rien dire, donc
      // seule l'allure de référence l'inscrit.
      st.bestTraining = Math.max(st.bestTraining, end.score);
    }
  });

  track("run_end", {
    mode,
    rule: rule.id,
    score: end.score,
    cause: end.cause,
    cleared: end.cleared,
    traps: end.trapsSurvived,
  });

  const claimedBefore = P.load().quests.claimed.length;
  const gained = claimGains();
  const claimedAfter = P.load().quests.claimed;
  const fraiches = claimedAfter.slice(claimedBefore);
  for (const id of fraiches) track("quest_complete", { quest: id });
  renderQuests("overQuests", fraiches);

  const verdict = $("verdict");
  verdict.textContent = end.cleared
    ? "TENU"
    : end.cause === "macro"
      ? "RÈGLE UNIQUE ENFREINTE"
      : mode === "daily"
        ? "ROMPU"
        : "ÉLIMINÉ";
  $("because").textContent = end.reason;
  $("tally").textContent = String(end.score);
  $("tallyLabel").textContent = end.cleared
    ? "MANCHES · SANS FAUTE"
    : mode === "daily"
      ? `MANCHES SUR ${DAILY_LENGTH}`
      : "MANCHES TENUES";
  $("marks").textContent = marksToString(end.marks);

  const reward = $("reward");
  reward.classList.toggle("hidden", gained <= 0);
  reward.textContent = gained > 0 ? `QUÊTES VALIDÉES · +${gained} PIÈCES` : "";

  const box = $("rankResult");
  if (mode === "ranked") {
    void sendRanked(session!.seed, rule.id, session!.log);
  } else {
    box.classList.add("hidden");
  }

  const teaser = $("teaser");
  if (challenge) {
    const target = ghostFinal(challenge);
    const won = end.score > target;
    const tie = end.score === target;
    teaser.innerHTML = `DUEL<b></b>`;
    teaser.querySelector("b")!.textContent = won
      ? `GAGNÉ · ${end.score} CONTRE ${target}`
      : tie
        ? `ÉGALITÉ · ${target} PARTOUT`
        : `PERDU · ${end.score} CONTRE ${target}`;
    if (won) sfx.win();
  } else if (mode === "daily") {
    teaser.innerHTML = `DEMAIN<b></b>`;
    teaser.querySelector("b")!.textContent = tomorrowRule(day).name;
    teaser.classList.remove("hidden");
  } else {
    teaser.innerHTML = `SÉRIE EN COURS<b></b>`;
    teaser.querySelector("b")!.textContent = `${s.streak.count} JOUR${s.streak.count > 1 ? "S" : ""}`;
  }

  // Un duel se rejoue à volonté : c'est la même partie, la comparaison reste
  // valable. Le run du jour, lui, reste à un seul essai.
  $<HTMLButtonElement>("btnAgain").disabled = mode === "daily" && !challenge;
  $<HTMLButtonElement>("btnAgain").textContent =
    mode === "ranked"
      ? "MATCH SUIVANT · R"
      : challenge
        ? "REVANCHE · R"
        : mode === "daily"
          ? "REVIENS DEMAIN"
          : "REJOUER · R";
  $<HTMLButtonElement>("btnDuel").disabled = end.splits.length < 3;

  hud.hideStamp();
  hud.setRule(null);
  show("over");
}

function claimGains(): number {
  let gained = 0;
  P.mutate((st) => {
    gained = claimAll(st, day);
  });
  return gained;
}

/** 🟩 réussite · 🟦 piège déjoué · 🟨 échauffement · 🟥 fin */
function marksToString(marks: string[]): string {
  if (marks.length <= 24) return marks.join("");
  return marks.slice(0, 12).join("") + " … " + marks.slice(-11).join("");
}

/* ------------------------------------------------------------------ *
 * Entrées
 * ------------------------------------------------------------------ */
/**
 * Réaction sonore et visuelle à un verdict. Les deux origines possibles
 * (une action du joueur, ou l'expiration de la fenêtre) passent par ici :
 * sinon on double le son de mort, ce qui s'entend immédiatement.
 */
function react(outcome: Outcome, comboBefore: number): void {
  if (!session) return;
  /*
   * Un pas intermédiaire ne renvoyait RIEN — ni son, ni particule.
   *
   * Une consigne en plusieurs temps (séquence, ou n'importe quelle consigne
   * portée par LE JUMEAU, qui double toutes les étapes) laissait donc le
   * joueur sans le moindre accusé de réception après son premier geste. Dans
   * une fenêtre d'une seconde et demie, on ne distingue pas « c'est pris » de
   * « le jeu ne m'a pas entendu » : on en conclut que la consigne ne se valide
   * pas alors qu'on la respecte.
   */
  if (outcome.kind === "pending") {
    sfx.step();
    scene.burst(lastClick.x, lastClick.y, lastClick.color, 4, 110);
    return;
  }
  if (outcome.kind === "survive") {
    if (outcome.trap) {
      const t = performance.now();
      sfx.trapAvoided();
      scene.burstScreen("#CFC9F2");
      scene.flashViolet(t);
      scene.kick(t, 0.45);
    } else {
      sfx.success(comboBefore);
      scene.burst(lastClick.x, lastClick.y, lastClick.color, 10, 190);
    }
    return;
  }
  if (outcome.kind !== "death") return;

  // encore en échauffement : la manche est perdue mais le run continue
  if (session.phase === "playing") {
    sfx.grace();
    return;
  }
  sfx.fail();
  musicApi.cut();
  scene.kick(performance.now(), outcome.cause === "macro" ? 1.15 : 0.8);
  hud.showStamp(
    outcome.cause === "macro" ? "INFRACTION" : outcome.cause === "timeout" ? "TROP LENT" : "RATÉ",
  );
}

function send(action: Action): void {
  if (!session || session.phase !== "playing") return;
  const combo = session.level;
  react(session.input(action, performance.now()), combo);
}

/** Route une action vers le multi si un match est actif (et pas de run solo). */
function sendOrMulti(action: Action): void {
  if (session) {
    send(action);
    return;
  }
  if (!multi.isPlayingMulti()) return;
  const r = multi.trySendMultiAction(action);
  if (!r.consumed || !r.feel) return;
  // Même accusé de réception qu'en solo : voir react().
  if (r.feel.kind === "pending") {
    sfx.step();
    scene.burst(lastClick.x, lastClick.y, lastClick.color, 4, 110);
    return;
  }
  if (r.feel.kind === "survive") {
    const now = performance.now();
    if (r.feel.trap) {
      scene.burstScreen("#CFC9F2");
      scene.flashViolet(now);
      scene.kick(now, 0.45);
    } else scene.burst(lastClick.x, lastClick.y, lastClick.color, 10, 190);
  }
}

$("cv").addEventListener("pointerdown", (ev) => {
  const e = ev as PointerEvent;
  e.preventDefault();
  unlock();

  if (session?.phase === "playing") {
    const { x, y } = scene.toField(e.clientX, e.clientY);
    scene.flash(x, y, performance.now());
    const ent = scene.hit(session.round.ents, x, y);
    lastClick = { x, y, color: ent ? colorHex(ent.color) : "#EFEAE0" };
    send({ kind: "click", ent, x, y });
    return;
  }

  if (multi.isPlayingMulti()) {
    const round = multi.peekRound();
    if (!round) return;
    const { x, y } = scene.toField(e.clientX, e.clientY);
    scene.flash(x, y, performance.now());
    const ent = scene.hit(round.ents, x, y);
    lastClick = { x, y, color: ent ? colorHex(ent.color) : "#EFEAE0" };
    sendOrMulti({ kind: "click", ent, x, y });
  }
});

window.addEventListener("keydown", (e) => {
  if (isTyping(e.target)) {
    if (e.key === "Escape") {
      e.preventDefault();
      multi.blurChat();
    }
    return;
  }
  if (e.key === "Enter" && multi.chatAvailable()) {
    e.preventDefault();
    multi.focusChat();
    return;
  }
  if (e.key === " ") {
    e.preventDefault();
    spaceDown = true;
  }
  unlock();

  if (screen === "brief") {
    if (e.key === " " || e.key === "Enter") startRun();
    if (e.key === "Escape") backHome();
    return;
  }
  if (screen === "over") {
    if (e.key.toLowerCase() === "r" && !$<HTMLButtonElement>("btnAgain").disabled) replay();
    if (e.key === "Escape") backHome();
    return;
  }
  if (screen !== null) {
    if (e.key === "Escape") backHome();
    return;
  }

  if (e.key === " ") return; // espace = touche de maintien, jamais une réponse
  if (e.key === "Escape") {
    abandon();
    return;
  }
  if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
    sendOrMulti({ kind: "key", key: e.key.toUpperCase() });
  } else if (e.key.startsWith("Arrow")) {
    e.preventDefault();
    sendOrMulti({ kind: "key", key: e.key });
  }
});

window.addEventListener("keyup", (e) => {
  if (isTyping(e.target)) return;
  if (e.key !== " ") return;
  spaceDown = false;
  if (session?.phase === "playing") send({ kind: "release", key: " " });
  else if (multi.isPlayingMulti()) sendOrMulti({ kind: "release", key: " " });
});

if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => syncField()).observe(cv);
}
window.addEventListener("resize", () => syncField());
window.visualViewport?.addEventListener("resize", () => syncField());
syncField();
window.addEventListener("blur", () => {
  spaceDown = false;
});

/* ------------------------------------------------------------------ *
 * Le fantôme
 * ------------------------------------------------------------------ */
function updateGhost(runMs: number, mine: number): void {
  if (!challenge) return;
  const target = ghostFinal(challenge);
  const lvl = ghostLevelAt(challenge, runMs);
  const done = ghostDone(challenge, runMs);

  $("ghostNum").textContent = done ? `${lvl} ·` : String(lvl);
  const fill = $("ghostFill");
  fill.style.transform = `scaleX(${target ? Math.min(1, lvl / target) : 0})`;
  fill.style.opacity = done ? "0.4" : "1";

  // Un seul signal, au moment où il bascule devant : répété, il deviendrait
  // du bruit et ne dirait plus rien.
  if (!ghostLead && lvl > mine && !done) {
    ghostLead = true;
    sfx.ghostPass();
  } else if (lvl <= mine) {
    ghostLead = false;
  }
}

function loadChallenge(r: Replay): void {
  // Un défi reçu sur téléphone alors que l'adversaire portait LA MAIN GAUCHE
  // était tout simplement impossible à lancer. La comparaison de scores perd
  // en rigueur avec une autre règle, mais un duel approximatif vaut mieux
  // qu'un bouton COMMENCER qui ne répond pas.
  const rule = regleJouableIci(ruleOfReplay(r)!);
  if (!rule) return;
  // Le cran qui compte : quelqu'un est arrivé PAR un lien de défi. Émis après
  // le décodage, donc jamais sur un lien trafiqué — un lien mort mesure le
  // bruit, pas l'adhésion. Le `run_start` qui suit dira s'il a aussi joué.
  track("duel_opened", { rule: rule.id, target: ghostFinal(r) });
  challenge = r;
  pendingMode = "training";
  pendingRule = rule;
  $("briefEyebrow").textContent = r.who ? `DÉFI DE ${r.who.toUpperCase()}` : "DÉFI REÇU";
  $("briefName").textContent = rule.name;
  $("briefText").textContent = rule.brief;
  const warn = $("briefWarn");
  warn.textContent = `MÊME PARTIE, MÊME ORDRE · L'ADVERSAIRE A TENU ${ghostFinal(r)} MANCHES`;
  warn.classList.remove("hidden");
  $("btnGo").textContent = rule.watchRelease === " " ? "MAINTIENS ESPACE" : "RELEVER LE DÉFI";
  renderPace();
  show("brief");
}

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */
function backHome(): void {
  session = null;
  challenge = null;
  ranked = null;
  multi.exitToMenu();
  musicApi.stop();
  $("ghost").classList.add("hidden");
  hud.setRule(null);
  hud.clearRound();
  hud.hideStamp();
  renderHome();
  show("home");
}

/**
 * ÉCHAP en pleine partie.
 *
 * Elle ne regardait que `session`, qui n'existe qu'en SOLO : en plein match
 * multijoueur, la touche ne faisait donc rien. Or aucun écran n'est ouvert
 * pendant un match — il n'y a ni bouton QUITTER ni menu — et le pied de
 * l'accueil promet « ÉCHAP POUR LE MENU ». On restait enfermé dans le match
 * jusqu'à sa fin, ou jusqu'à fermer l'onglet.
 *
 * `backHome()` passe par `multi.exitToMenu()`, qui quitte le salon proprement
 * côté serveur : le départ est déclaré, il n'est pas subi comme une coupure.
 */
function abandon(): void {
  if (session) {
    session = null;
    backHome();
    return;
  }
  if (multi.isPlayingMulti()) backHome();
}

/**
 * REJOUER · R.
 *
 * Il appelait `startRun()` directement : même règle, et le brief jamais
 * réaffiché. Les deux défauts rapportés au playtest sortent de là — « six ou
 * sept fois d'affilée la même règle », et « il faudrait pouvoir lire la règle
 * avant ». En enchaînant, on ne la revoyait tout simplement plus.
 *
 * L'entraînement repasse donc par l'annonce, qui tire une nouvelle règle. Un
 * DUEL et le CLASSÉ gardent leur chemin : la comparaison n'a de sens que sur
 * la même partie, et pour eux le brief est déjà rejoué par leur propre
 * ouverture.
 */
function replay(): void {
  if (pendingMode === "ranked") {
    void openRanked(); // nouvelle graine, nouvel adversaire : jamais deux fois le même match
    return;
  }
  if (challenge) {
    startRun(); // revanche : même graine, même règle, sinon on ne compare plus rien
    return;
  }
  if (pendingMode === "daily") return;
  openBrief("training");
}

$("btnDaily").addEventListener("click", () => {
  sfx.ui();
  openBrief("daily");
});
$("btnTraining").addEventListener("click", () => {
  sfx.ui();
  openBrief("training");
});
$("btnRanked").addEventListener("click", () => {
  sfx.ui();
  void openRanked();
});
$("btnGo").addEventListener("click", () => startRun());
$("btnBriefTraining").addEventListener("click", () => {
  sfx.ui();
  openBrief("training");
});
$("btnBack").addEventListener("click", () => backHome());
$("btnAgain").addEventListener("click", () => replay());
$("btnHome").addEventListener("click", () => backHome());
$("btnCodex").addEventListener("click", () => renderCodex());
$("btnCodexBack").addEventListener("click", () => backHome());
$("btnSound").addEventListener("click", () => {
  const s = P.mutate((st) => {
    st.sound = !st.sound;
  });
  setEnabled(s.sound);
  $("btnRanked").classList.toggle("hidden", !rankedAvailable());
  $("btnSound").textContent = `SON : ${s.sound ? "ON" : "OFF"}`;
  sfx.ui();
});

$("btnMusic").addEventListener("click", () => {
  const s = P.mutate((st) => {
    st.music = !st.music;
  });
  setMusicEnabled(s.music);
  $("btnMusic").textContent = `MUSIQUE : ${s.music ? "ON" : "OFF"}`;
  sfx.ui();
});

$("btnDuel").addEventListener("click", async () => {
  if (!lastRun) return;
  // Ouvert depuis un fichier local, il n'y a pas d'origine partageable :
  // mieux vaut le dire que produire un lien mort.
  if (location.protocol === "file:") {
    $("btnDuel").textContent = "OUVRE LE JEU EN LIGNE POUR DÉFIER";
    setTimeout(() => ($("btnDuel").textContent = "DÉFIER UN AMI"), 2200);
    return;
  }
  const url = challengeUrl({
    v: 1,
    seed: lastRun.seed,
    ruleId: lastRun.rule.id,
    splits: lastRun.end.splits,
  });
  const text = `Je tiens ${lastRun.end.score} manches sur ${lastRun.rule.name}. Même partie, même ordre. ${url}`;
  try {
    if (navigator.share) await navigator.share({ text });
    else await navigator.clipboard.writeText(text);
    // Après le partage, jamais avant : un `navigator.share` annulé lève, et
    // compter l'intention comme un envoi gonflerait le haut de l'entonnoir
    // exactement là où on cherche à savoir si le bas se remplit.
    track("duel_sent", { rule: lastRun.rule.id, score: lastRun.end.score });
    $("btnDuel").textContent = "LIEN COPIÉ ✓";
    setTimeout(() => ($("btnDuel").textContent = "DÉFIER UN AMI"), 1600);
  } catch {
    /* partage annulé */
  }
});

$("btnShare").addEventListener("click", async () => {
  if (!lastRun) return;
  const { end, rule, mode } = lastRun;
  const head = mode === "daily" ? `THE ONE RULE #${day}` : "THE ONE RULE · ENTRAÎNEMENT";
  const tail = end.cleared ? `TENU · ${DAILY_LENGTH} manches` : `rompu à la manche ${end.score}`;
  const text = `${head}\n${rule.name}\n${marksToString(end.marks)}\n${tail}`;
  try {
    if (navigator.share) await navigator.share({ text });
    else await navigator.clipboard.writeText(text);
    track("share", { mode, rule: rule.id, score: end.score });
    $("btnShare").textContent = "COPIÉ ✓";
    setTimeout(() => ($("btnShare").textContent = "PARTAGER"), 1500);
  } catch {
    /* partage annulé */
  }
});

/* ------------------------------------------------------------------ *
 * Boucle
 * ------------------------------------------------------------------ */
let lastRoundKey = "";
let runId = 0;
let urgentDone = false;

function loop(now: number): void {
  requestAnimationFrame(loop);

  let multiDraw: ReturnType<typeof multi.syncFrame> = null;

  if (session) {
    const combo = session.level;
    const outcome = session.tick(now);
    if (outcome) react(outcome, combo);

    if (session.phase === "over") {
      finishRun();
      session = null;
    } else if (session.phase === "playing") {
      const key = `${session.mode}:${runId}:${session.level}`;
      if (key !== lastRoundKey) {
        lastRoundKey = key;
        urgentDone = false;
        sfx.roundStart();
      }
      if (session.tierJustCrossed) {
        session.tierJustCrossed = false;
        hud.announce(TIER_NAMES[session.tier] ?? "");
      }
      // L'urgence s'entend avant d'être lue : on ne quitte pas la consigne
      // des yeux pour vérifier une barre.
      if (!urgentDone && session.ratio(now) > 0.76 && session.round.steps.length > 0) {
        urgentDone = true;
        sfx.urgent();
      }
      hud.updateRound(session.round, session.elapsed(now), session.ratio(now));
      musicApi.level(session.level);
      if (challenge) updateGhost(session.runTime(now), session.level);
      hud.setFooter(
        session.level,
        session.mode === "daily" ? DAILY_LENGTH : P.load().bestTraining,
        session.mode === "daily" ? `JOUR #${day}` : "ENTRAÎNEMENT",
        session.mode === "daily" ? "SUR" : "RECORD",
      );
      hud.setMeta(session.inGrace ? "ÉCHAUFFEMENT — TU NE PEUX PAS MOURIR" : "");
    }
  } else if (multi.isPlayingMulti()) {
    multiDraw = multi.syncFrame();
    const fx = multi.takeFx();
    if (fx) {
      if (fx.burstScreen) scene.burstScreen("#CFC9F2");
      if (fx.flashViolet) scene.flashViolet(now);
      if (fx.kick != null) scene.kick(now, fx.kick);
    }
  }

  // Le piège n'est révélé qu'une fois la manche perdue : le montrer pendant
  // qu'elle se joue reviendrait à donner la réponse.
  if (session) {
    scene.draw({
      round: session.round,
      rule: session.rule,
      now,
      reveal: session.phase === "freeze" && !!session.round.trap,
      ratio: session.phase === "playing" ? session.ratio(now) : undefined,
    });
  } else if (multiDraw) {
    scene.draw({
      round: multiDraw.round,
      rule: multiDraw.rule,
      now,
      reveal: multiDraw.reveal,
      ratio: multiDraw.ratio,
    });
  } else {
    scene.draw({ round: null, rule: null, now });
  }
}

/* ------------------------------------------------------------------ *
 * Mesure
 *
 * Quatre chiffres, et rien d'autre : D1, D7, durée médiane de session,
 * taux de partage. Ce sont eux qui décident si le projet continue.
 * ------------------------------------------------------------------ */
const visitStart = performance.now();

function setupAnalytics(): void {
  const s = P.load();
  /*
   * L'URL est NETTOYÉE avant usage.
   *
   * Une variable d'environnement traverse des mains et des shells : elle
   * arrive avec un espace, un retour ligne, ou — vécu en production — un BOM
   * UTF-8 collé devant, parce que Windows PowerShell en ajoute un quand il
   * encode une valeur passée par un tube. Le résultat est indétectable :
   * l'endpoint devient "﻿/api/collect", chaque envoi part en 404, le jeu
   * tourne parfaitement et la mesure ne collecte rien pendant des jours.
   *
   * Le bon endroit pour s'en protéger est ici, une fois, plutôt que dans
   * chaque procédure de déploiement.
   */
  const endpoint = cleanEnv(import.meta.env.VITE_COLLECT_URL as string | undefined);

  initAnalytics({
    id: s.anonId,
    day,
    endpoint,
    enabled: s.metrics.on,
  });

  P.mutate((st) => {
    if (st.metrics.firstDay < 0) {
      st.metrics.firstDay = day;
      track("first_open", {});
    } else if (st.metrics.lastDay !== day) {
      // sinceFirst permet de reconstruire la courbe de rétention côté rapport
      track("day_return", {
        sinceFirst: day - st.metrics.firstDay,
        streak: st.streak.count,
      });
    }
    st.metrics.lastDay = day;
  });

  // pagehide plutôt que unload : c'est le seul événement fiable sur mobile
  window.addEventListener("pagehide", () => {
    track("visit_end", { ms: Math.round(performance.now() - visitStart) });
    flush();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  if (!s.metrics.asked && endpoint) $("notice").classList.remove("hidden");
  refreshMetricsButton();
}

function refreshMetricsButton(): void {
  $("btnMetrics").textContent = `MESURE : ${P.load().metrics.on ? "ON" : "OFF"}`;
}

function decideMetrics(on: boolean): void {
  const s = P.mutate((st) => {
    st.metrics.on = on;
    st.metrics.asked = true;
  });
  if (!on) track("optout", {});
  flush();
  setAnalyticsEnabled(on);
  $("notice").classList.add("hidden");
  refreshMetricsButton();
  void s;
}

$("btnMetricsOk").addEventListener("click", () => decideMetrics(true));
$("btnMetricsOff").addEventListener("click", () => decideMetrics(false));
$("btnMetrics").addEventListener("click", () => {
  decideMetrics(!P.load().metrics.on);
  sfx.ui();
});

day = dayIndex();
setupAnalytics();
renderHome();

const invite = readInvite();

// Un lien de défi ouvre directement l'annonce de la règle : celui qui clique
// vient pour affronter quelqu'un, pas pour lire un menu.
const incoming = readChallenge();
if (incoming) loadChallenge(incoming);
else if (invite && multi.available) multi.openFromInvite(invite);
else show("home");
requestAnimationFrame(loop);
