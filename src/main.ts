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
import { ONE_RULES, withoutHold, withoutInk } from "./engine/rules";
import { PALIER, PALIER_MAX, pileEscalade } from "./engine/escalade";
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
import {
  compte,
  connexion,
  deconnexion,
  estConnecte,
  fournisseurs,
  litRetourConnexion,
  mesPerfs,
  rafraichit,
  supprimeCompte,
} from "./compte";
import { enfile, vide } from "./compte/file";
import type { RetourConnexion } from "./compte";
import { revendiqueSiNecessaire, signeAffiche, synchronise } from "./compte/revendication";
import { glyphSvg } from "./net/glyph";
import { musicApi, setEnabled, setMusicEnabled, sfx, unlock } from "./audio";
import { flush, initAnalytics, setAnalyticsEnabled, track } from "./analytics";
import { initMulti, readInvite } from "./multi";
import {
  appliqueLangue,
  estLang,
  etatSolo,
  jetons,
  libelleCompte,
  accrocheDuJour,
  briefDeRegle,
  libelleQuete,
  nomAllure,
  t,
  TEXTES,
} from "./i18n";
import type { Lang } from "./i18n";

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
  "solo",
  "brief",
  "over",
  "codex",
  "compte",
  "reglages",
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
/**
 * Les ecrans qui portent la barre haute.
 *
 * Pas ceux du multijoueur : ils ont leur propre navigation, et un MENU global
 * y ferait quitter un salon d'un clic — depuis un ecran ou l'on est en train
 * de s'installer avec des amis. C'est un chemin qu'on ne coupe pas.
 */
const AVEC_BARRE: ReadonlySet<string> = new Set([
  "home",
  "solo",
  "brief",
  "over",
  "codex",
  "compte",
  "reglages",
]);

function show(id: ScreenId): void {
  screen = id;
  for (const s of SCREENS) $(s).classList.toggle("hidden", s !== id);
  /*
   * La barre haute vit HORS FLUX et disparait pendant la partie.
   *
   * `id === null` est l'ecran de jeu : rien ne doit alors surplomber la
   * scene, et surtout rien ne doit la rogner — la taille du champ est du
   * gameplay (CLAUDE.md §6 n°10).
   */
  const barre = id !== null && AVEC_BARRE.has(id);
  /*
   * LA BARRE VIT DANS L'ECRAN, PAS AU-DESSUS DE LUI.
   *
   * Elle etait posee en absolu dans `#app`, alors que c'est `.screen` qui
   * defile : elle restait donc collee en haut pendant que le contenu glissait
   * dessous. Rapporte tel quel — « quand je scrolle il reste affiche en haut
   * et ca rend mal ».
   *
   * Un enfant en position absolue d'un conteneur qui defile SUIT le
   * defilement — seuls `fixed` et `sticky` y echappent. La deplacer dans
   * l'ecran actif suffit donc, sans un seul ecouteur de defilement : elle
   * remonte avec le reste et sort du cadre.
   *
   * Le `padding-top` de `.has-topbar` reste : il reserve la place qu'elle
   * occupe en haut du contenu, sinon le premier element passerait dessous.
   */
  const bar = $("topbar");
  bar.classList.toggle("hidden", !barre);
  appEl.classList.toggle("has-topbar", barre);
  const hote = barre && id !== null ? $(id) : appEl;
  /*
   * `prepend` et non `appendChild` : depuis que la barre vit DANS le flux de
   * l'ecran, « ajoutee a la fin » veut dire « posee en bas ». Mesuree a
   * y=788 sur un ecran de 812 avant correction.
   */
  if (bar.parentElement !== hote) hote.prepend(bar);
  // Sur l'accueil, MENU n'a nulle part ou aller.
  $("btnTopMenu").classList.toggle("hidden", id === "home");
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

/**
 * L'accueil : UN objet fendu en deux, et rien d'autre.
 *
 * Il portait quatre cartes de mode, un logo, 39 mots d'explication, la série,
 * les quêtes et le carnet. Mesuré sur mobile 375x812 : 1271 px de contenu,
 * première chose cliquable à y=465 — 57 % de l'écran à franchir avant de
 * pouvoir agir — et la série, les quêtes et le carnet entièrement sous la
 * ligne de flottaison, c'est-à-dire toute la mécanique de rétention invisible.
 *
 * L'état du run du jour reste ICI, sur le bouton SOLO. C'est le seul mode à un
 * essai par jour et le porteur de la série : le ranger d'un cran sans rien en
 * dire aurait été le seul vrai coût de ce découpage.
 */
function renderHome(): void {
  const s = P.load();
  ensureDay(s, day);
  P.save(s);

  hud.setRule(null);
  hud.clearRound();
  hud.setMeta("");
  hud.setFooter(0, s.bestTraining, "—");

  const rule = ruleOfDay(day);
  const lang: Lang = estLang(s.lang) ? s.lang : "fr";
  const c = compte();
  appliqueLangue(document, lang, {
    compte: libelleCompte(lang, c ? c.pseudo : null),
  });

  $("soloEtat").textContent = etatSolo(lang, {
    played: s.daily.played,
    score: s.daily.score,
    ruleName: rule.name,
    streak: s.streak.count,
  });

  $("cardMultiState").textContent = multi.available
    ? TEXTES[lang].multiOk
    : TEXTES[lang].multiOff;
  $<HTMLButtonElement>("btnMulti").disabled = !multi.available;

  /*
   * L'accent va au multijoueur SEULEMENT si le run du jour est fait.
   *
   * Un écran a une action évidente, et elle ne peut pas être un bouton mort ;
   * mais elle ne peut pas non plus envoyer un nouveau venu vers le seul mode
   * irréversible du jeu. Tant qu'il reste quelque chose à faire en solo,
   * l'accent y va.
   */
  const versMulti = s.daily.played && multi.available;
  $("btnSolo").classList.toggle("faille__zone--primary", !versMulti);
  $("btnMulti").classList.toggle("faille__zone--primary", versMulti);

  appliqueMotifs(s.daltonien);
  setEnabled(s.sound);
  setMusicEnabled(s.music);

  /*
   * Le bouton de compte n'apparaît QUE si des comptes existent réellement sur
   * ce déploiement. Un bouton qui mène à « indisponible » est pire que pas de
   * bouton : il annonce une fonctionnalité que le jeu ne tient pas.
   */
  $("btnTopCompte").classList.toggle("hidden", !comptesPossibles());
}

function choisitLangue(lang: Lang): void {
  const s = P.load();
  if (s.lang === lang) return;
  s.lang = lang;
  P.save(s);
  sfx.ui();
  renderHome();
}

/**
 * L'écran SOLO : les trois modes, et ce qui les entoure.
 *
 * Tout ce qui vivait sous la ligne de flottaison de l'accueil est ici — série,
 * quêtes, carnet — là où il a la place d'exister et où on vient le chercher.
 */
function renderSolo(): void {
  const s = P.load();
  ensureDay(s, day);
  P.save(s);

  const rule = ruleOfDay(day);

  const strip = $("homeStreak");
  strip.innerHTML = "";
  const chip = (html: string, hot = false): void => {
    const el = document.createElement("span");
    el.className = "chip" + (hot ? " chip--hot" : "");
    el.innerHTML = html;
    strip.appendChild(el);
  };
  const j = jetons();
  chip(`${j.serie} <b>${s.streak.count}</b>`, s.streak.count >= 3);
  chip(`${j.pieces} <b>${s.coins}</b>`);
  chip(`${j.regles} <b>${Object.keys(s.encountered).length}/${ONE_RULES.length}</b>`);
  // Le nom de la règle ne se traduit pas : « LE SANG » est un nom, et son
  // identifiant est la clé du carnet et de la comparabilité.
  if (s.daily.played) chip(`${j.jourFait(day)} <b>${t("faitMaj")}</b>`);
  else chip(`${j.aujourdhui} <b>${rule.name}</b>`);

  renderQuests("homeQuests");

  const neuf = s.recent.length === 0;
  $<HTMLButtonElement>("btnDaily").disabled = s.daily.played;

  /*
   * L'état va dans `.card__state`, jamais dans le textContent de la carte :
   * l'écrire sur le bouton effacerait son titre et sa description.
   */
  $("cardDailyDesc").textContent = s.daily.played
    ? t("dailyFait")
    : accrocheDuJour(rule.id, day);
  $("cardDailyState").textContent = s.daily.played
    ? t("dailyRevient")(s.daily.score)
    : t("dailyUnEssai");
  $("cardEscaladeState").textContent = t("escaladeEtat");
  $("cardTrainingState").textContent = neuf
    ? t("trainingNeuf")
    : t("trainingRecord")(s.bestTraining);

  /*
   * Un nouveau venu ne doit PAS voir le run du jour comme action évidente.
   *
   * C'est le seul mode irréversible du jeu — un essai par jour — et il suppose
   * de connaître la mécanique. Le mettre en avant à quelqu'un qui arrive, c'est
   * lui tendre un piège : constaté sur un vrai testeur, qui l'a brûlé en
   * quinze secondes sans avoir compris la règle unique.
   *
   * L'accent va donc à l'entraînement, qui pardonne et qui enseigne.
   */
  const suivant = neuf ? "btnTraining" : s.daily.played ? "btnTraining" : "btnDaily";
  for (const id of ["btnDaily", "btnTraining", "btnEscalade"]) {
    $(id).classList.toggle("card--primary", id === suivant);
  }

  $("btnRanked").classList.toggle("hidden", !rankedAvailable());
  $("cardRankedState").textContent = `${divisionOf(s.ranked.rating).name} · ${s.ranked.rating}`;
}

/**
 * Les libellés des réglages.
 *
 * Ils étaient rafraîchis par `renderHome` du temps où ils vivaient dans son
 * pied. Depuis qu'ils ont leur écran, c'est lui qui les porte — sinon SON et
 * MUSIQUE affichent l'état d'avant le dernier changement, ce qui est
 * exactement le genre de mensonge qu'un bouton bascule ne pardonne pas.
 */
function renderReglages(): void {
  const s = P.load();
  $("btnSound").textContent = `${t("prefSon")} : ${s.sound ? t("on") : t("off")}`;
  $("btnMusic").textContent = `${t("prefMusique")} : ${s.music ? t("on") : t("off")}`;
  appliqueMotifs(s.daltonien);
  refreshMetricsButton();
}

/**
 * Pose le second canal partout où il doit l'être.
 *
 * Trois surfaces, et trois seulement — le reste du jeu porte DÉJÀ un second
 * canal et n'a rien à changer : les plaques distinguent vivant et mort par un
 * remplissage plein contre un liseré, le verdict de fin porte le mot autant
 * que le filet, et l'état critique parle à l'oreille (`sfx.urgent`) au même
 * seuil qu'à l'œil.
 *
 * Restaient les pièces — la trame du canevas — et la frise de fin de run, qui
 * est une suite de carrés de couleur pure sans aucune autre marque. La classe
 * sur `#app` laisse la feuille de style traiter la seconde.
 */
function appliqueMotifs(on: boolean): void {
  scene.daltonien = on;
  appEl.classList.toggle("is-motifs", on);
  $("btnMotifs").textContent = `${t("prefMotifs")} : ${on ? t("on") : t("off")}`;
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
    // Le libellé est recomposé depuis l'identifiant : `q.label` est le
    // français canonique du moteur de quêtes, qui ignore les langues.
    row.querySelector<HTMLElement>(".quest__label")!.textContent = libelleQuete(
      q.id,
      q.target,
      q.label,
    );
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
      label: nomAllure(v, PACE_LABELS[v] ?? String(v)),
      hint: `${Math.round(windowMs(10) * v)} MS`,
      level: i + 1,
      steps: lentesDabord.length,
      icon: "bars" as const,
      selected: v === current,
      aria: `${nomAllure(v, PACE_LABELS[v] ?? String(v))} — ${Math.round(windowMs(10) * v)} ms`,
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
  const ref = nomAllure(PACE_DEFAULT, PACE_LABELS[PACE_DEFAULT] ?? "NORMAL");
  hint.textContent =
    current === PACE_DEFAULT
      ? t("allureRef")
      : current > PACE_DEFAULT
        ? t("alluurePlus")(ref)
        : t("allureMoins")(ref);
}

function renderCodex(): void {
  const s = P.load();
  const list = $("codexList");
  list.innerHTML = "";

  /*
   * L'avancement, en tête du carnet.
   *
   * C'est la question qu'on vient y poser — « combien m'en reste-t-il ? » — et
   * il fallait compter les lignes soi-même. Les deux nombres existaient déjà :
   * l'accueil affiche le premier dans ses puces, et le second se lit dans le
   * même objet. Aucune donnée nouvelle, seulement dite à l'endroit où elle
   * répond à quelque chose.
   */
  const vues = ONE_RULES.filter((r) => !!s.encountered[r.id]).length;
  const tenues = ONE_RULES.filter((r) => s.encountered[r.id]?.cleared).length;
  $("codexProgress").textContent =
    t("carnetProgres")(vues, ONE_RULES.length, tenues);
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
        ? t("carnetTenu")(rec.best)
        : t("carnetMeilleur")(rec.best)
      : t("carnetJamais");
    /*
     * L'explication n'apparaît QUE pour une règle déjà rencontrée.
     *
     * Le carnet sert à réviser ce qu'on a affronté — pas à lire d'avance ce
     * qui nous attend. La surprise du run du jour est le seul contenu neuf du
     * jeu, et la brûler ici la brûlerait partout.
     */
    row.querySelector<HTMLElement>(".codexrow__brief")!.textContent = rec
      ? briefDeRegle(r.id, r.brief)
      : "";
    list.appendChild(row);
  }
  show("codex");
}

/* ------------------------------------------------------------------ *
 * Compte
 * ------------------------------------------------------------------ */

/**
 * Les fournisseurs branchés sur ce déploiement, relevés une fois.
 *
 * `null` = pas encore demandé, `[]` = comptes indisponibles. La distinction
 * compte : tant qu'on ne sait pas, on ne montre RIEN. Proposer d'enregistrer
 * une performance sur un déploiement sans comptes serait une promesse rompue,
 * et c'est le piège de confiance le plus facile à commettre ici.
 */
let fournisseursDispo: string[] | null = null;
/**
 * Ce que le retour du fournisseur a donné, gardé pour l'écran de compte.
 *
 * Déclaré ICI et non au point d'appel : `renderCompte` le lit, et une `const`
 * posée plus bas dans le module ne serait accessible que par chance — au
 * premier appel qui remonterait, ce serait une zone morte temporelle.
 */
let retourCompte: RetourConnexion = { quoi: "aucun" };
/** Refusée une fois, l'invitation ne revient pas de la session. */
let inviteEcartee = false;

const NOM_FOURNISSEUR: Record<string, string> = {
  google: "CONTINUER AVEC GOOGLE",
  discord: "CONTINUER AVEC DISCORD",
};

async function chargeFournisseurs(): Promise<string[]> {
  if (fournisseursDispo === null) fournisseursDispo = await fournisseurs();
  return fournisseursDispo;
}

const comptesPossibles = (): boolean => (fournisseursDispo?.length ?? 0) > 0;

function ligneCompte(quoi: string, valeur: string, signe?: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "account__ligne";
  el.innerHTML = `<span class="account__quoi"></span><span class="account__valeur"></span>`;
  el.querySelector<HTMLElement>(".account__quoi")!.textContent = quoi;
  const cible = el.querySelector<HTMLElement>(".account__valeur")!;
  // Le signe est du SVG que nous produisons ; le texte, lui, vient du joueur
  // et n'est jamais injecté en HTML. Voir tests/invariants-compte.test.ts.
  if (signe) cible.innerHTML = signe;
  cible.appendChild(document.createTextNode(valeur));
  return el;
}

function renderCompte(): void {
  const s = P.load();
  const c = compte();
  const connecte = c !== null;

  $("compteAnon").classList.toggle("hidden", connecte);
  $("compteConnecte").classList.toggle("hidden", !connecte);
  // Rouvrir l'écran DÉSARME la suppression : une confirmation qui survit à une
  // sortie et un retour n'est plus une confirmation.
  suppressionArmee = false;
  $("compteDanger").classList.add("hidden");
  $("btnCompteSupprimer").textContent = t("compteSupprimer");
  $("compteTitre").textContent = connecte ? t("compteTitreConnecte") : t("compteTitreAnonyme");

  if (connecte) {
    $("compteLede").textContent =
      "Ta progression est enregistrée. Elle te suivra sur tes autres appareils.";
    const hote = $("compteIdentite");
    hote.innerHTML = "";
    const vues = ONE_RULES.filter((r) => !!s.encountered[r.id]).length;
    hote.appendChild(ligneCompte(t("cptNom"), c.pseudo || t("cptSansNom"), glyphSvg(signeAffiche(s), 18)));
    hote.appendChild(ligneCompte(t("cptCarnet"), t("cptRegles")(vues, ONE_RULES.length)));
    hote.appendChild(
      ligneCompte(t("cptSerie"), t("cptJours")(s.streak.count)),
    );
    hote.appendChild(ligneCompte(t("cptRecordEntrainement"), t("cptManches")(s.bestTraining)));

    /*
     * L'historique des runs du jour, chargé après coup.
     *
     * Il vient du serveur et il est VÉRIFIÉ : chaque ligne a été rejouée par
     * `verifyRun`, le score n'est pas celui que le navigateur a annoncé. C'est
     * la seule chose de cet écran qui soit opposable à quelqu'un d'autre — et
     * c'est aussi ce qui rendra un classement possible sans repartir de faits
     * invérifiables. Ne pas le confondre avec les trois lignes du dessus, qui
     * sont des affirmations de l'appareil.
     */
    void mesPerfs().then((perfs) => {
      if (screen !== "compte" || !perfs.length) return;
      hote.appendChild(
        ligneCompte(t("cptRunsEnregistres"), `${perfs.length}`),
      );
      const meilleur = perfs.reduce((m, p) => (p.valeur > m.valeur ? p : m));
      hote.appendChild(ligneCompte(t("cptMeilleurRun"), t("cptManches")(meilleur.valeur)));
    });
    return;
  }

  $("compteLede").textContent =
    "Le jeu marche sans. Un compte ne sert qu'à garder ce que tu fais quand tu changes de navigateur ou d'appareil.";

  /*
   * La raison d'un retour raté, montrée plutôt qu'avalée.
   *
   * `litRetourConnexion` efface le fragment de l'URL dès qu'il l'a lu — c'est
   * nécessaire, un jeton n'a rien à faire dans une barre d'adresse. Mais quand
   * le retour ÉCHOUE, ça effaçait aussi la seule trace exploitable, et il ne
   * restait plus que « ça ne marche pas ». Les trois causes ne se réparent
   * pas au même endroit, donc les distinguer vaut le peu de place que ça prend.
   */
  const RAISONS: Record<string, string> = {
    annule: "CONNEXION ANNULÉE.",
    echec: "LE FOURNISSEUR A REFUSÉ L'ÉCHANGE. VÉRIFIE L'URI DE RETOUR DÉCLARÉE CHEZ LUI.",
    etat_invalide: "LIEN DE RETOUR EXPIRÉ OU ROUVERT DEUX FOIS. RÉESSAIE.",
    banni: "CE COMPTE EST SUSPENDU.",
    indisponible: "LES COMPTES NE SONT PAS CONFIGURÉS SUR CE DÉPLOIEMENT.",
  };
  $("compteQuoi").textContent =
    "CE QUI SERAIT ENREGISTRÉ : TON CARNET, TA SÉRIE ET TES RECORDS. RIEN D'AUTRE.";

  const rangee = $("compteFournisseurs");
  rangee.innerHTML = "";
  for (const f of fournisseursDispo ?? []) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = NOM_FOURNISSEUR[f] ?? f.toUpperCase();
    b.addEventListener("click", () => {
      track("compte_start", { f });
      sfx.ui();
      connexion(f);
    });
    rangee.appendChild(b);
  }
  const err = $("compteErr");
  const vide = (fournisseursDispo ?? []).length === 0;
  const refus =
    retourCompte.quoi === "refus"
      ? (RAISONS[retourCompte.code] ?? `RETOUR REFUSÉ (${retourCompte.code}).`)
      : "";
  err.classList.toggle("hidden", !vide && !refus);
  err.textContent = refus || (vide ? t("compteIndispo") : "");
}

async function ouvreCompte(): Promise<void> {
  await chargeFournisseurs();
  renderCompte();
  show("compte");
}

/**
 * L'invitation de l'écran de fin.
 *
 * Elle ne s'affiche que quand les trois conditions sont réunies : les comptes
 * existent, le joueur n'en a pas, et il y a quelque chose à perdre. Sans la
 * troisième, l'invitation serait une réclame ; avec elle, c'est une
 * information.
 */
function renderInvite(score: number, record: boolean): void {
  const boite = $("compteInvite");
  const montrer = comptesPossibles() && !estConnecte() && !inviteEcartee && score > 0;
  boite.classList.toggle("hidden", !montrer);
  if (!montrer) return;

  // Le CHIFFRE, pas la fonctionnalité. « Créer un compte » est abstrait ;
  // « ce 23 » ne l'est pas.
  const texte = $("compteInviteText");
  texte.innerHTML = record
    ? `RECORD PERSONNEL · <b></b>. IL N'EXISTE QUE DANS CE NAVIGATEUR.`
    : `<b></b> MANCHES. CE NAVIGATEUR EST LE SEUL À S'EN SOUVENIR.`;
  texte.querySelector("b")!.textContent = String(score);
  track("compte_invite", { score, record });
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
const regleJouableIci = (rule: OneRule): OneRule => {
  const sansMaintien = TOUCH_ONLY ? withoutHold(rule) : rule;
  // Et en mode daltonien, LE DALTONIEN sort aussi : elle ne serait pas
  // injouable mais INERTE, ce qui est pire — voir `withoutInk`.
  return P.load().daltonien ? withoutInk(sansMaintien) : sansMaintien;
};

/**
 * La même décision, en prédicat.
 *
 * L'escalade CHOISIT ses règles au lieu d'en remplacer une : elle a besoin de
 * savoir si une règle est jouable ici, pas par quoi la remplacer. Dérivé de
 * `regleJouableIci` plutôt que réécrit — deux listes d'exclusions finiraient
 * par diverger, et la divergence donnerait une règle injouable à quelqu'un.
 */
const estJouableIci = (rule: OneRule): boolean => regleJouableIci(rule) === rule;

/**
 * La règle telle que le BANDEAU doit la montrer.
 *
 * Le nom composé tient — mesuré, 45 signes à quatre règles, et la hauteur du
 * bandeau ne bouge pas d'un pixel (56 px), donc le champ ne rétrécit pas.
 * L'explication, elle, ne tient pas : elle vit sur UNE ligne de hauteur fixe,
 * et quatre briefs bout à bout y sont tronqués au premier tiers du premier.
 *
 * On y met donc le brief de la DERNIÈRE règle acquise, préfixé de son nom. Les
 * précédentes ont été tenues huit manches au moins ; celle-ci est la seule
 * qu'on doive encore relire.
 */
function regleAffichee(s: Session): OneRule {
  const nouvelle = s.derniereAjoutee;
  if (!nouvelle || s.pile.length < 2) return s.rule;
  // Le NOM reste francais — c'est un nom — mais son explication suit la langue.
  return { ...s.rule, brief: `${nouvelle.name} — ${briefDeRegle(nouvelle.id, nouvelle.brief)}` };
}

/* ------------------------------------------------------------------ *
 * Lancement d'un run
 * ------------------------------------------------------------------ */
function openBrief(mode: Mode): void {
  const s = P.load();
  pendingMode = mode;

  if (mode === "daily") {
    pendingRule = regleJouableIci(ruleOfDay(day));
  } else if (mode === "escalade") {
    /*
     * Le brief n'annonce que la PREMIÈRE règle.
     *
     * Montrer la pile entière retirerait tout l'intérêt : le mode vit de
     * l'arrivée d'une contrainte de plus quand on croyait avoir compris. Et
     * c'est la même raison qui fait que le carnet « n'explique que les règles
     * rencontrées » — on ne brûle pas la surprise.
     *
     * La règle affichée ici n'est pas tirée : `startRun` retire la pile depuis
     * la graine du run, qui n'existe pas encore. On montre donc l'engagement
     * du mode, pas son contenu.
     */
    pendingRule = ONE_RULES.find(estJouableIci) ?? ONE_RULES[0]!;
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

  $("briefEyebrow").textContent =
    mode === "daily" ? t("modeDaily")(day) : mode === "escalade" ? t("modeEscalade") : t("modeTraining");
  $("briefName").textContent = mode === "escalade" ? t("briefUneDePlus") : pendingRule.name;
  $("briefText").textContent =
    mode === "escalade"
      ? t("briefEscalade")(PALIER)
      : briefDeRegle(pendingRule.id, pendingRule.brief);

  const warn = $("briefWarn");
  const hold = mode !== "escalade" && pendingRule.watchRelease === " ";
  const lines: string[] = [];
  if (mode === "daily") lines.push(t("briefDailyLignes")(DAILY_LENGTH));
  if (mode === "escalade") lines.push(t("briefEscaladeLignes")(PALIER_MAX));
  if (hold) lines.push(t("briefTiens"));
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
    ? t("goMaintiens")
    : neuf
      ? t("goUnSeulEssai")
      : t("goCommencer");
  $("btnGo").classList.toggle("btn--primary", !neuf);
  btnTry.classList.toggle("btn--primary", neuf);

  renderPace();
  show("brief");
}

function startRun(): void {
  if (!pendingRule) return;
  if (pendingRule.watchRelease === " " && !spaceDown) {
    $("briefWarn").textContent = t("briefEspace");
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
  /*
   * La pile de l'escalade est tirée d'un RNG À PART.
   *
   * Le même flux sert à bâtir les manches : y prendre quelques nombres
   * décalerait toute la suite, et le run cesserait d'être rejouable à
   * l'identique par `verify.ts`. Un flux dérivé de la même graine garde le
   * déterminisme sans toucher à l'autre.
   */
  const pile =
    pendingMode === "escalade"
      ? pileEscalade(mulberry32(seed ^ 0x5eca1ade), estJouableIci)
      : undefined;

  session = new Session({
    mode: pendingMode,
    rule: pile?.[0] ?? pendingRule,
    rng,
    now: performance.now(),
    seed,
    touchOnly: TOUCH_ONLY,
    // Un duel rejoue la partie d'un adversaire et se compare à ses temps de
    // passage : il garde l'allure de référence, quoi qu'ait choisi le joueur.
    pace: challenge ? PACE_DEFAULT : s.trainingPace,
    pile,
  });
  hud.setRule(session.rule);
  hud.hideStamp();
  hud.setFooter(
    0,
    pendingMode === "daily"
      ? DAILY_LENGTH
      : pendingMode === "escalade"
        ? // Le chiffre de droite est ce qu'on VISE : le plafond de règles.
          PALIER_MAX
        : s.bestTraining,
    pendingMode === "daily" ? t("piedDaily")(day) : pendingMode === "escalade" ? t("modeEscalade") : t("modeTraining"),
    pendingMode === "daily" ? t("piedSur") : pendingMode === "escalade" ? t("piedRegles") : t("piedRecord"),
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
  btn.textContent = t("rankedRecherche");

  const me = P.load().ranked;
  const offer = await findMatch(s.anonId, me.name, 0);
  queueing = false;
  btn.disabled = false;
  btn.textContent = t("rankedNom");

  if (!offer) {
    // Le serveur est absent : on le dit et on n'enferme pas le joueur.
    btn.textContent = t("rankedIndispo");
    setTimeout(() => (btn.textContent = t("rankedNom")), 2200);
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
  $("briefEyebrow").textContent = t("rankedEyebrow")(div.name, offer.me.rating);
  $("briefName").textContent = rule.name;
  $("briefText").textContent = briefDeRegle(rule.id, rule.brief);
  const warn = $("briefWarn");
  warn.textContent = offer.opponent
    ? `CONTRE ${offer.opponent.name} (${offer.opponent.rating}) · IL A TENU ${offer.opponent.score} MANCHES`
    : "AUCUN ADVERSAIRE DISPONIBLE · CE RUN SERVIRA D'ÉTALON AUX SUIVANTS";
  warn.classList.remove("hidden");
  $("btnGo").textContent = rule.watchRelease === " " ? t("goMaintiens") : t("goEntrer");
  renderPace();
  show("brief");
}

async function sendRanked(seed: number, ruleId: string, log: LoggedInput[]): Promise<void> {
  const s = P.load();
  const box = $("rankResult");
  box.classList.remove("hidden");
  box.innerHTML = t("rankedEnvoi");

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
    box.innerHTML = t("rankedInjoignable");
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

  /*
   * Le run du jour part en file, compte ou pas.
   *
   * Sans compte, il ATTEND — et c'est ce qui rend l'invitation honnête : si le
   * joueur en crée un dans la foulée, ce run-là est enregistré. Lui promettre
   * d'enregistrer une performance déjà perdue serait la promesse rompue la
   * plus facile à commettre ici.
   *
   * Seul le run du jour : c'est le seul mode dont deux résultats se comparent
   * (même graine, même règle pour tout le monde). Voir api/perf.ts.
   */
  if (mode === "daily" && !challenge) {
    enfile({ mode: "daily", jour: day, inputs: session.log, pose: Date.now() });
    void vide();
  }

  /*
   * Le compte apprend ce qui vient de se passer.
   *
   * Sans cet appel, rien de ce qui est joue APRES la connexion ne quitte
   * l'appareil : la revendication ne passe qu'une fois. C'est le bug rapporte
   * apres deploiement — « la serie et le carnet ne se conservent pas ».
   *
   * Non attendu, et sans consequence s'il echoue : la fusion est une union et
   * un maximum, donc le prochain run, ou la prochaine ouverture, rattrapera.
   */
  void synchronise();

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

  /*
   * L'issue se voit avant de se lire.
   *
   * « TENU » et « ÉLIMINÉ » s'affichaient au même gris, dans le même cadre :
   * il fallait lire le mot pour savoir comment le run s'était terminé. C'est
   * l'écran qu'on voit le plus souvent en solo, et le seul qui dise si l'on a
   * réussi. La classe porte l'issue jusqu'à la feuille de style, qui colore la
   * tête entière — le mot reste le même, il n'est plus seul à le dire.
   */
  const verdict = $("verdict");
  $("over").classList.toggle("is-win", end.cleared);
  verdict.classList.toggle("is-win", end.cleared);
  verdict.textContent = end.cleared
    ? "TENU"
    : end.cause === "macro"
      ? "RÈGLE UNIQUE ENFREINTE"
      : mode === "daily"
        ? "ROMPU"
        : "ÉLIMINÉ";
  $("because").textContent = end.reason;
  /*
   * En escalade, le titre est le nombre de RÈGLES tenues, pas de manches.
   *
   * C'est ce qui fait du mode autre chose qu'une variante : « 18 manches » ne
   * veut rien dire hors contexte, « j'ai tenu 3 règles » est un plafond, et un
   * plafond se compare et se raconte. Le taux de partage est à 0 % — c'est
   * peut-être exactement ce qui lui manquait. Le compte de manches reste
   * dessous, il n'est pas perdu.
   */
  const paliers = mode === "escalade" ? session.paliers : 0;
  $("tally").textContent = String(mode === "escalade" ? paliers : end.score);
  $("tallyLabel").textContent =
    mode === "escalade"
      ? t("finReglesTenues")(paliers, end.score)
      : end.cleared
        ? t("finSansFaute")
        : mode === "daily"
          ? t("finSurTotal")(DAILY_LENGTH)
          : t("finManchesTenues");
  renderMarks($("marks"), end.marks);

  const reward = $("reward");
  reward.classList.toggle("hidden", gained <= 0);
  reward.textContent = gained > 0 ? t("quetesValidees")(gained) : "";

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
    teaser.innerHTML = `${t("serieEnCours")}<b></b>`;
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

  /*
   * L'invitation à enregistrer.
   *
   * Posée APRÈS les boutons, donc après `btnAgain` : elle ne doit ni décaler
   * ni retarder l'action évidente de cet écran, qui est de relancer.
   */
  const recordBattu =
    mode !== "daily" && end.score > 0 && end.score >= (s.encountered[rule.id]?.best ?? 0);
  renderInvite(end.score, recordBattu);

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

/**
 * Silhouette de chaque marque, pour le mode motifs.
 *
 * La frise est la seule surface du jeu qui ne dit son affaire QUE par la
 * couleur : quatre carrés, aucune autre marque. Et 🟩 contre 🟥, c'est
 * exactement la paire rouge-vert.
 *
 * Les marques du MODÈLE ne changent pas : elles partent telles quelles dans le
 * texte de partage, où les carrés de couleur sont la convention et où l'on ne
 * contrôle pas la police d'arrivée. Seul l'affichage de l'écran de fin gagne
 * une silhouette — et il garde la couleur, qui reste l'information première
 * pour qui la perçoit.
 */
const SILHOUETTE: Record<string, { glyphe: string; classe: string }> = {
  "🟩": { glyphe: "●", classe: "mark--ok" },
  "🟦": { glyphe: "◆", classe: "mark--trap" },
  "🟨": { glyphe: "▲", classe: "mark--grace" },
  "🟥": { glyphe: "✕", classe: "mark--dead" },
};

/**
 * Écrit la frise dans son conteneur.
 *
 * Hors mode motifs, rien ne change : un simple texte, comme avant. En mode
 * motifs, chaque manche devient un élément pour porter sa silhouette — d'où le
 * passage par le DOM plutôt que par `textContent`.
 */
function renderMarks(host: HTMLElement, marks: string[]): void {
  if (!P.load().daltonien) {
    host.textContent = marksToString(marks);
    return;
  }
  host.innerHTML = "";
  const montre = marks.length <= 24 ? marks : [...marks.slice(0, 12), "…", ...marks.slice(-11)];
  for (const m of montre) {
    const el = document.createElement("span");
    const s = SILHOUETTE[m];
    el.className = "mark" + (s ? ` ${s.classe}` : "");
    el.textContent = s ? s.glyphe : m;
    host.appendChild(el);
  }
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
  $("briefEyebrow").textContent = r.who ? t("defiDe")(r.who.toUpperCase()) : t("defiRecu");
  $("briefName").textContent = rule.name;
  $("briefText").textContent = briefDeRegle(rule.id, rule.brief);
  const warn = $("briefWarn");
  warn.textContent = t("defiMemeOrdre")(ghostFinal(r));
  warn.classList.remove("hidden");
  $("btnGo").textContent = rule.watchRelease === " " ? t("goMaintiens") : t("goDefi");
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
$("btnEscalade").addEventListener("click", () => {
  sfx.ui();
  openBrief("escalade");
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
/*
 * JOUER : le chemin le plus court vers une manche.
 *
 * Il mene a l'ENTRAINEMENT et pas au run du jour — celui-ci est irreversible
 * et suppose de connaitre la mecanique. Le brief reste sur le chemin : c'est
 * la que le joueur lit sa regle unique, et le sauter a deja ete un bug.
 */
$("btnPlay").addEventListener("click", () => {
  sfx.ui();
  openBrief("training");
});
$("btnSolo").addEventListener("click", () => {
  sfx.ui();
  renderSolo();
  show("solo");
});
$("btnCodex").addEventListener("click", () => renderCodex());
$("btnCodexBack").addEventListener("click", () => {
  // Le carnet s'ouvre depuis SOLO : RETOUR doit y ramener, pas remonter d'un
  // cran de plus que celui qu'on a descendu.
  sfx.ui();
  renderSolo();
  show("solo");
});

$("btnTopCompte").addEventListener("click", () => {
  sfx.ui();
  void ouvreCompte();
});
$("btnTopMenu").addEventListener("click", () => {
  sfx.ui();
  backHome();
});
$("btnTopBrand").addEventListener("click", () => {
  if (screen === "home") return;
  sfx.ui();
  backHome();
});
$("btnTopReglages").addEventListener("click", () => {
  sfx.ui();
  renderReglages();
  show("reglages");
});
$("btnLangFr").addEventListener("click", () => choisitLangue("fr"));
$("btnLangEn").addEventListener("click", () => choisitLangue("en"));
$("btnReglagesBack").addEventListener("click", () => backHome());
$("btnCompteBack").addEventListener("click", () => backHome());
$("btnCompteInvite").addEventListener("click", () => {
  // Ouvrir l'écran vaut acceptation de l'invitation : elle ne réapparaîtra
  // plus de la session, qu'on aille au bout ou non. Une invitation qui
  // revient à chaque run est une réclame.
  inviteEcartee = true;
  sfx.ui();
  void ouvreCompte();
});
/**
 * Suppression en deux temps.
 *
 * Le premier clic dit exactement ce qui disparaît, le second l'exécute. Un
 * bouton destructeur qui agit au premier clic est une trappe — et celui-ci
 * est le seul geste irréversible de tout le jeu.
 */
let suppressionArmee = false;
$("btnCompteSupprimer").addEventListener("click", () => {
  const danger = $("compteDanger");
  const bouton = $<HTMLButtonElement>("btnCompteSupprimer");
  sfx.ui();
  if (!suppressionArmee) {
    suppressionArmee = true;
    danger.classList.remove("hidden");
    danger.textContent =
      "TON COMPTE, TON HISTORIQUE ET TES RUNS ENREGISTRÉS SERONT EFFACÉS. " +
      "TA PROGRESSION SUR CET APPAREIL RESTE. C'EST DÉFINITIF.";
    bouton.textContent = t("compteConfirmer");
    return;
  }
  bouton.disabled = true;
  void supprimeCompte().then((fait) => {
    bouton.disabled = false;
    if (!fait) {
      danger.textContent = t("compteSuppressionKo");
      return;
    }
    // Le lien local part avec le compte : cet appareil redevient anonyme, et
    // il pourra revendiquer à nouveau s'il se rattache un jour ailleurs.
    P.mutate((st) => {
      st.compte.revendiquePar = null;
      st.compte.glyphe = null;
    });
    suppressionArmee = false;
    bouton.textContent = t("compteSupprimer");
    danger.classList.add("hidden");
    renderCompte();
  });
});

$("btnCompteQuitter").addEventListener("click", () => {
  deconnexion();
  P.mutate((st) => {
    // La progression LOCALE reste : se déconnecter n'est pas se punir. Seul
    // le lien avec le compte s'efface — et avec lui le droit de revendiquer à
    // nouveau depuis cet appareil, qui a déjà donné ce qu'il avait.
    st.compte.glyphe = null;
  });
  sfx.ui();
  renderCompte();
});
$("btnSound").addEventListener("click", () => {
  const s = P.mutate((st) => {
    st.sound = !st.sound;
  });
  setEnabled(s.sound);
  $("btnRanked").classList.toggle("hidden", !rankedAvailable());
  $("btnSound").textContent = `${t("prefSon")} : ${s.sound ? t("on") : t("off")}`;
  sfx.ui();
});

$("btnMusic").addEventListener("click", () => {
  const s = P.mutate((st) => {
    st.music = !st.music;
  });
  setMusicEnabled(s.music);
  $("btnMusic").textContent = `${t("prefMusique")} : ${s.music ? t("on") : t("off")}`;
  sfx.ui();
});

$("btnMotifs").addEventListener("click", () => {
  const s = P.mutate((st) => {
    st.daltonien = !st.daltonien;
  });
  appliqueMotifs(s.daltonien);
  sfx.ui();
});

$("btnDuel").addEventListener("click", async () => {
  if (!lastRun) return;
  // Ouvert depuis un fichier local, il n'y a pas d'origine partageable :
  // mieux vaut le dire que produire un lien mort.
  if (location.protocol === "file:") {
    $("btnDuel").textContent = t("defierHorsLigne");
    setTimeout(() => ($("btnDuel").textContent = t("defierAmi")), 2200);
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
    $("btnDuel").textContent = t("lienCopie");
    setTimeout(() => ($("btnDuel").textContent = t("defierAmi")), 1600);
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
    $("btnShare").textContent = t("copieOk");
    setTimeout(() => ($("btnShare").textContent = t("partager")), 1500);
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

/* ------------------------------------------------------------------ *
 * La chaleur
 *
 * Une seule grandeur, publiée sur `#app`, que toute la couche d'ambiance
 * consomme en CSS. Elle n'invente rien : elle agrège le temps consommé de la
 * manche en cours et l'avancement de la partie, deux valeurs qui existaient
 * déjà. Le jeu n'en dépend à aucun moment — c'est de la mise en scène.
 *
 * Écrite par crans de 5 % et jamais deux fois de suite à l'identique : écrire
 * une propriété personnalisée invalide le style de tout ce qui l'utilise, et
 * le faire soixante fois par seconde sur une machine modeste coûte plus cher
 * que l'effet ne rapporte.
 * ------------------------------------------------------------------ */
const CRITICAL_RATIO = 0.76;
let heatShown = -1;
let criticalShown = false;

function setHeat(value: number, critical: boolean): void {
  const cran = Math.round(Math.min(1, Math.max(0, value)) * 20) / 20;
  if (cran !== heatShown) {
    heatShown = cran;
    appEl.style.setProperty("--heat", String(cran));
  }
  if (critical !== criticalShown) {
    criticalShown = critical;
    appEl.classList.toggle("is-critical", critical);
  }
}

/**
 * Chaleur d'une manche en cours.
 *
 * Deux termes : le temps qui se referme ici et maintenant — c'est lui qu'on
 * ressent — et la partie qui avance, qui donne une montée de fond sur toute
 * la durée du run. Le premier pèse le double du second.
 */
const heatOf = (ratio: number, level: number): number =>
  Math.min(1, ratio * 0.66 + Math.min(1, level / 30) * 0.34);

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
      /*
       * Une règle qui s'ajoute doit se VOIR, et prime sur le palier de vitesse.
       *
       * C'est une question d'équité, pas de confort : passer sous une deuxième
       * contrainte sans qu'on te le dise, c'est mourir sur un interdit qu'on ne
       * t'a jamais montré. Le bandeau est mis à jour dans la foulée, sinon il
       * continuerait d'afficher l'ancienne pile.
       */
      if (session.regleAjoutee) {
        hud.setRule(regleAffichee(session));
        hud.announce(`+ ${session.regleAjoutee.name}`);
        session.regleAjoutee = null;
        session.tierJustCrossed = false;
      } else if (session.tierJustCrossed) {
        session.tierJustCrossed = false;
        hud.announce(TIER_NAMES[session.tier] ?? "");
      }
      // L'urgence s'entend avant d'être lue : on ne quitte pas la consigne
      // des yeux pour vérifier une barre.
      const ratio = session.ratio(now);
      const aJouer = session.round.steps.length > 0;
      if (!urgentDone && ratio > CRITICAL_RATIO && aJouer) {
        urgentDone = true;
        sfx.urgent();
      }
      // L'œil apprend le même seuil que l'oreille, au même instant.
      setHeat(heatOf(ratio, session.level), ratio > CRITICAL_RATIO && aJouer);
      hud.updateRound(session.round, session.elapsed(now), session.ratio(now));
      musicApi.level(session.level);
      if (challenge) updateGhost(session.runTime(now), session.level);
      hud.setFooter(
        session.level,
        session.mode === "daily" ? DAILY_LENGTH : P.load().bestTraining,
        session.mode === "daily" ? t("piedDaily")(day) : t("modeTraining"),
        session.mode === "daily" ? t("piedSur") : t("piedRecord"),
      );
      hud.setMeta(session.inGrace ? t("echauffement") : "");
    }
  } else if (multi.isPlayingMulti()) {
    multiDraw = multi.syncFrame();
    const fx = multi.takeFx();
    if (fx) {
      if (fx.burstScreen) scene.burstScreen("#CFC9F2");
      if (fx.flashViolet) scene.flashViolet(now);
      if (fx.kick != null) scene.kick(now, fx.kick);
    }
    // Même grammaire en multijoueur : la pause entre deux manches redescend à
    // froid, ce qui rend la reprise plus franche.
    const r = multiDraw?.ratio;
    const enManche = r != null && !!multiDraw?.round;
    setHeat(enManche ? heatOf(r, multi.roundIndex()) : 0, enManche && r > CRITICAL_RATIO);
  } else {
    setHeat(0, false);
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
  $("btnMetrics").textContent = `${t("prefMesure")} : ${P.load().metrics.on ? t("on") : t("off")}`;
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

/*
 * Le compte, s'il y en a un.
 *
 * Deux gestes, tous deux sans conséquence quand ils échouent :
 *
 *   · `litRetourConnexion()` ramasse le jeton que `api/auth.ts` a posé dans le
 *     FRAGMENT au retour du fournisseur, puis l'efface de l'URL. Il n'efface
 *     que son propre paramètre : un lien d'invitation `#j=CODE` peut cohabiter
 *     et `readInvite()` doit encore le trouver juste en dessous.
 *
 *   · `rafraichit()` renouvelle le jeton s'il approche de sa fin. C'est ce qui
 *     donne son sens à la durée de vie de 24 h : le serveur de salons ne peut
 *     pas vérifier une révocation, donc c'est la péremption qui la rend
 *     effective. Lancé sans être attendu — rien ici ne doit retarder
 *     l'affichage, et surtout pas l'ouverture d'un lien d'invitation.
 */
retourCompte = litRetourConnexion();

/**
 * Ce que le compte doit faire au démarrage, en tâche de fond.
 *
 * TOUT est asynchrone et rien n'est attendu : l'accueil s'affiche, le lien
 * d'invitation s'ouvre, la partie se lance. Une panne de compte ne doit
 * jamais retarder d'une frame le chemin « code/lien → rejoindre → jouer ».
 */
async function demarreCompte(): Promise<void> {
  await rafraichit();
  await chargeFournisseurs();
  // Le bouton de compte dépend de ce qu'on vient d'apprendre : l'accueil a
  // déjà été peint sans lui, il faut le repeindre.
  if (screen === "home") renderHome();

  if (!estConnecte()) return;

  /*
   * La revendication.
   *
   * On la tente à CHAQUE ouverture et pas seulement au retour de connexion :
   * un aller-retour raté ne doit pas coûter sa progression à quelqu'un, et
   * elle est idempotente — union et maximum de bout en bout. Le marquage
   * `compte.revendiquePar` fait qu'elle ne s'exécute réellement qu'une fois.
   */
  const issue = await revendiqueSiNecessaire();
  if (issue.quoi === "faite") {
    track("compte_lie", { neuf: retourCompte.quoi === "connecte" });
  } else if (issue.quoi === "deja") {
    // Appareil déjà rattaché : la synchronisation fait monter ce qui a été
    // joué depuis, et descendre ce que les autres appareils ont ajouté. Elle
    // sait aussi ne RIEN faire monter depuis l'appareil d'un autre.
    await synchronise();
  }
  // Ce qui attendait dans la file part maintenant : un run joué hors ligne,
  // ou joué avant que le compte n'existe.
  await vide();
  if (screen === "home") renderHome();
}

renderHome();
void demarreCompte();

const invite = readInvite();

// Un lien de défi ouvre directement l'annonce de la règle : celui qui clique
// vient pour affronter quelqu'un, pas pour lire un menu.
const incoming = readChallenge();
if (incoming) loadChallenge(incoming);
else if (invite && multi.available) multi.openFromInvite(invite);
else show("home");
requestAnimationFrame(loop);
