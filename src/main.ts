import "./style.css";

import {
  DAILY_ESSAIS,
  GRACE_ROUNDS,
  DAILY_LENGTH,
  PACE_CHOICES,
  PACE_DEFAULT,
  PACE_LABELS,
  TIER_NAMES,
  windowMs,
} from "./engine/difficulty";
import { mulberry32 } from "./engine/rng";
import { FIELD_H, FIELD_W } from "./engine/types";
import { ONE_RULES, withoutHold, withoutInk } from "./engine/rules";
import { PALIER, PALIER_MAX, pileEscalade, pileA } from "./engine/escalade";
import type { Action, OneRule, Outcome, Round } from "./engine/types";

import { dailySeed, dayIndex, ruleOfDay, tomorrowRule, trainingRule } from "./game/daily";
import * as ESC from "./game/escalier";
import { exploitDuRun } from "./render/exploit";
import { actionsDeFin } from "./render/finactions";
import { dessineCarte, donneesCarte } from "./render/partage";
import { estMaitrisee, resteAMaitriser } from "./game/maitrise";
import { classementDuJour } from "./compte";
import { etatCarte } from "./render/carte";
import type { EtatCarte } from "./render/carte";
import * as P from "./game/progress";
import * as F from "./render/flammes";
import { toucheAcceptable } from "./game/dejoue";
import { doitDemanderAvis, nettoieAvis } from "./game/avis";
import type { NoteAvis } from "./game/avis";
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
import { scoreDuJour, vueDuJour } from "./render/jour";
import { MEILLEUR_CONNU, vueBut } from "./render/but";
import {
  cacheMicro,
  cachePastille,
  cacheToast,
  montreMicro,
  montrePastille,
  montreToast,
} from "./render/micro";
import { cibleDe, pilote } from "./game/attract";
import { ecranAuChargement, ecranDe, estAdressable } from "./route";
import type { EcranId } from "./route";
import { pendantRetour, poseAdresse, poseArrivee } from "./histoire";
import { tempsDeLecture } from "./game/lecture";
import { echelleMaitrise, franchies, lisRun } from "./game/echelle";
import { SERIE_EPREUVE } from "./game/echelle";
import type { CaseMaitrise } from "./game/echelle";
import { MANCHES_MAITRISE } from "./game/maitrise";
import { familleDe, parFamille, tauxPiege } from "./game/famille";
import { cleEntrainement, cleEscalade } from "./game/perfs";
import {
  CHRONO_PIEGE_MS,
  REGLE_TUTO,
  TEMPS_JOUES,
  jugeClic,
  jugeDejoue,
  mancheDe,
} from "./game/onboarding";
import type { MancheTuto, Temps } from "./game/onboarding";
import { cleanEnv } from "./env";
import {
  changeIdentite,
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
import { enfile, estRefusReel, vide } from "./compte/file";
import type { Resultat } from "./compte/file";
import type { RetourConnexion } from "./compte";
import { revendiqueSiNecessaire, signeAffiche, synchronise } from "./compte/revendication";
import { glyphFromIndex, glyphSvg } from "./net/glyph";
import { composePhrase, poseDebout } from "./i18n";
import { RESERVE_AIDE_TUTO, RESERVE_HUD_MULTI } from "./render/orientation";
import { musicApi, setEnabled, setMusicEnabled, sfx, unlock } from "./audio";
import { flush, initAnalytics, setAnalyticsEnabled, track } from "./analytics";
import { initMulti, readInvite } from "./multi";
import {
  appliqueLangue,
  CHAINES,
  estLang,
  jetons,
  langue,
  libelleCompte,
  accrocheDuJour,
  briefDeRegle,
  libelleQuete,
  nomAllure,
  nomDeRegle,
  t,
  traduisMotif,
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
// Le terrain de JEU peut se mettre debout sur un téléphone tenu droit ; celui
// de l'attract, non. Voir `render/orientation.ts`.
scene.permetPortrait = true;
scene.resize();
poseDebout(scene.debout);
const appEl = $("app");
let gutters = false;
let lastKey = "";
/** La bande basse réservée aux plaques du multi debout — voir la boucle. */
let reserveMulti = 0;
/**
 * L'appareil a-t-il un pointeur grossier, même à côté d'une souris ?
 *
 * `TOUCH_ONLY` répond « SEULEMENT du tactile » et décide du pool de consignes.
 * Le bouton DÉJOUER pose une autre question : peut-on le toucher du pouce ? Un
 * portable à écran tactile dit oui ici et non là-bas, et c'est juste.
 */
const TACTILE =
  typeof matchMedia !== "undefined" && matchMedia("(any-pointer: coarse)").matches;

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
  // Le texte suit le terrain : debout, « à gauche » se dit « en haut ».
  poseDebout(scene.debout);
  if (session) poseDejoue();
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
   *
   * Les plaques ne sont plus jamais dans le flex : colonnes (`has-gutters`)
   * ou calque `#liveHud`. `offsetHeight` d'un abspos n'est PAS zéro ; l'ajouter
   * au canvas déjà plein recréerait la boucle de gouttières.
   */
  const hHorsFlux = cv.clientHeight;
  /*
   * ⚠️ LA DÉCISION SE PREND SANS LA RÉSERVE, et c'est la décision n°2 : la
   * réserve n'existe QUE hors colonnes, donc la compter ici ferait décider sur
   * une grandeur que la décision modifie. `stableGutter` répond toujours à la
   * même question — « quelle gouttière produirait le mode colonnes ? ».
   */
  const next = wantsColumns(
    stableGutter(cv.clientWidth, hHorsFlux, scene.debout ? "portrait" : "paysage"),
    gutters,
  );
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
  "fiche",
  "escalier",
  "solo",
  "brief",
  "over",
  "codex",
  "compte",
  "classement",
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
/*
 * L'ESCALIER — trois variables, et chacune répond à une question différente.
 *
 * `escalierRegle` : de quelle règle on regarde la montée.
 * `palierVu`      : quel palier la colonne de droite détaille (≠ celui où l'on
 *                   est : on peut relire un palier déjà franchi).
 * `palierEnCours` : le palier que le RUN EN COURS joue. `null` partout
 *                   ailleurs, et c'est ce qui garantit qu'un entraînement
 *                   ordinaire garde exactement le comportement d'avant.
 *
 * ⚠️ `palierDemande` est un ARMEMENT À USAGE UNIQUE, consommé par `openBrief`.
 * Sans lui, il faudrait que chaque chemin menant au brief pense à remettre
 * `palierEnCours` à zéro — et le prochain chemin oublierait. C'est la leçon du
 * REJOUER muet : le garde-fou appartient au point de passage COMMUN.
 */
let escalierRegle: OneRule | null = null;
let palierVu = 1;
let palierEnCours: number | null = null;
let palierDemande: number | null = null;
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
/**
 * Le boot du compte. On n'attend PAS ça pour afficher ni pour rejoindre
 * un salon (décision n°12). On l'attend AVANT de lancer un run du jour
 * quand on est connecté : sinon un navigateur neuf joue trois essais
 * pendant que la sync n'a pas encore recollé le « 0 / 3 » de l'autre
 * appareil.
 */
let compteBootFini = false;
let attenteCompte = false;
let bootCompte: Promise<void> | null = null;

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
  "fiche",
  "brief",
  "over",
  "codex",
  "compte",
  "classement",
  "reglages",
]);

/* ------------------------------------------------------------------ *
 * LE MODE ATTRACT — « LE CHAMP, PLEIN ÉCRAN : LE FOND EST LE JEU »
 *
 * ⚠️ **118 NOUVEAUX VISITEURS SUR 159 — 74 % — REPARTENT SANS LANCER UNE SEULE
 * PARTIE**, médiane 6 secondes. L'accueil ne montrait aucun jeu, et un jeu de
 * réflexes se comprend en deux secondes de vidéo, pas en trois lignes de texte.
 *
 * ⚠️ **CE N'EST PAS UNE IMITATION.** La première tentative dessinait cinq
 * formes à la main dans une bande de 108 px — rapporté : « la démo est mal
 * faite ». Ici tourne une VRAIE `Session`, avec le vrai `buildRound`, dessinée
 * par le vrai `SceneRenderer` sur son propre canvas. Il n'y a plus rien à tenir
 * d'accord avec le jeu, parce que c'est le jeu : le jour où une règle change,
 * la démo change avec, sans qu'on y pense.
 *
 * ⚠️ **ELLE N'ÉCRIT RIEN.** Pas de `finishRun`, pas de carnet, pas de records,
 * aucune analytique. Une partie qui tourne toute seule ne doit rien laisser
 * derrière elle — sinon les compteurs du joueur monteraient pendant qu'il lit
 * la page.
 *
 * ⚠️ **ET ELLE NE COÛTE RIEN EN JEU.** Elle est peinte par la boucle de jeu et
 * seulement quand `screen === "home"`, comme le battement de lecture : une
 * application n'a qu'une horloge, et un décor ne doit jamais pouvoir disputer
 * ses images au jeu.
 * ------------------------------------------------------------------ */

/** L'allure de la démo : la plus lente, pour qu'on ait le temps de LIRE. */
const ATTRACT_ALLURE = 2;

/**
 * ⚠️ **LA DÉMO NE MONTE PAS EN DIFFICULTÉ, ET C'EST UN RÉGLAGE DE VITESSE.**
 *
 * Elle tournait jusqu'à la mort. Or c'est une VRAIE `Session` : sa fenêtre
 * rétrécit manche après manche, et la main, qui parcourt son trajet dans une
 * fraction de cette fenêtre, accélère avec elle. Un run qui tient bien finissait
 * donc en curseur qui se téléporte — exactement ce qui a été rapporté.
 *
 * Dix manches gardent la fenêtre entre 8000 et 4400 ms (allure 2), c'est-à-dire
 * lisible d'un bout à l'autre. Et `FORCED_TRAP_ROUNDS` pose ses pièges aux
 * manches 2, 5 et 9 : la borne est APRÈS les trois, donc on ne coupe rien de ce
 * que la démo existe pour montrer. Elle repart alors sur une autre règle, ce
 * qui vaut mieux qu'une onzième manche de la même.
 */
const ATTRACT_MANCHES = 10;

let attract: {
  session: Session;
  scene: SceneRenderer;
  /** D'où vient le curseur — le déplacement doit être continu d'une manche à l'autre. */
  main: { x: number; y: number } | null;
  /** La manche a-t-elle déjà reçu son clic ? Une seule action par manche. */
  agi: boolean;
  /** Le verdict à afficher, et jusqu'à quand. */
  verdict: { texte: string; jusqua: number } | null;
} | null = null;

/**
 * (Re)démarre la partie de démonstration.
 *
 * ⚠️ La graine change à chaque fois : deux visites ne montrent pas la même
 * suite de manches. Une démo identique à chaque chargement se reconnaît, et ce
 * qu'on reconnaît on cesse de le regarder.
 */
function lanceAttract(): void {
  const cvs = $<HTMLCanvasElement>("attractCvs");
  const scene = attract?.scene ?? new SceneRenderer(cvs);
  const graine = (Math.random() * 2 ** 31) | 0;
  /*
   * ⚠️ UNE RÈGLE QUI PIÈGE, TOUJOURS.
   *
   * Sept règles sur seize ne posent aucun piège, et la densité du catalogue est
   * de 5,4 % de manches piégeuses. Tirer au hasard donnerait donc, une fois sur
   * deux, une démo qui ne montre JAMAIS ce qui distingue ce jeu — c'est-à-dire
   * une démo pour rien. On tire parmi celles qui piègent, et `FORCED_TRAP_ROUNDS`
   * garantit un piège dès les premières manches.
   */
  const piegeuses = ONE_RULES.filter((r) => r.traps && estJouableIci(r));
  const regle = piegeuses[Math.abs(graine) % piegeuses.length] ?? ONE_RULES[0]!;
  attract = {
    session: new Session({
      mode: "training",
      rule: regle,
      rng: mulberry32(graine),
      now: performance.now(),
      seed: graine,
      touchOnly: TOUCH_ONLY,
      pace: ATTRACT_ALLURE,
      longueur: ATTRACT_MANCHES,
    }),
    scene,
    main: null,
    agi: false,
    verdict: null,
  };
  peintReglAttract(regle);
}

/** Le coin haut gauche : la carte de la règle, et son nom. */
function peintReglAttract(regle: OneRule): void {
  $("attractCarte").innerHTML = carteVignette(regle.id);
  $("attractRegleLabel").textContent = t("attractRegle");
  $("attractRegleNom").textContent = nomDeRegle(regle.id, regle.name);
}

/**
 * Une image de la démo. Appelée par la boucle de jeu, uniquement sur l'accueil.
 */
function imageAttract(now: number): void {
  /*
   * ⚠️ UN ONGLET CACHÉ NE COMPOSE PAS. Peindre quand même ouvrirait une
   * deuxième horloge (ou ferait tourner une Session pour rien). Au retour,
   * `tick(now)` expire la manche et `lanceAttract()` reprend.
   */
  if (document.visibilityState === "hidden") return;
  if (!attract) return;
  const { session: sess, scene: sc } = attract;

  /*
   * ⚠️ ELLE NE MEURT PAS, ELLE RECOMMENCE.
   *
   * Un run de démonstration finit toujours par tomber — l'échauffement ne
   * protège que trois manches. Montrer l'écran de mort n'apprendrait rien de
   * plus et couperait la seule chose qu'on veut faire voir : que ça tourne.
   */
  if (sess.phase !== "playing") {
    lanceAttract();
    return;
  }

  const ratio = sess.ratio(now);

  // La main.
  const g = pilote(sess.round, ratio, attract.main);
  if (g.curseur) attract.main = g.curseur;
  if (g.clique && !attract.agi) {
    attract.agi = true;
    const cible = cibleDe(sess.round);
    const issue = sess.input(
      cible
        ? { kind: "click", ent: cible, x: cible.x, y: cible.y }
        : { kind: "key", key: "A" },
      now,
    );
    if (issue.kind === "survive") {
      attract.verdict = { texte: t("attractTenu"), jusqua: now + 700 };
    }
  }
  const avant = sess.round;
  sess.tick(now);
  if (sess.round !== avant) {
    // Manche suivante : la main repart de là où elle était, et le droit d'agir
    // se rouvre. Sans cette remise à zéro, une seule manche serait jouée.
    attract.agi = false;
    if (avant.trap && sess.phase === "playing") {
      attract.verdict = { texte: t("attractPiege"), jusqua: now + 1100 };
    }
  }

  /*
   * ⚠️ SUR TÉLÉPHONE ON ZOOME, ON N'ÉTEINT PAS.
   *
   * Quinze pièces à 375 px font ~13 px : illisibles. Le zoom est indépendant
   * de `SANS_DEMO` (mouvement réduit) — les deux questions n'ont rien à voir.
   * `fieldRect()` reste la seule conversion du curseur, donc il suit.
   */
  const tel = typeof matchMedia === "function" && matchMedia("(max-width: 899px)").matches;
  if (tel) {
    const c = g.cible;
    sc.cadrer(c ? c.x : FIELD_W / 2, c ? c.y : FIELD_H / 2, 2);
  } else {
    sc.cadrer(FIELD_W / 2, FIELD_H / 2, 1);
  }

  peintAttract(now, ratio, g);
  sc.draw({ round: sess.round, rule: sess.rule, now, ratio });
}

/** Ce que la démo écrit autour du champ. */
function peintAttract(now: number, ratio: number, g: ReturnType<typeof pilote>): void {
  if (!attract) return;
  const sess = attract.session;

  /*
   * ⚠️ LA CONSIGNE SE COMPOSE, ELLE NE SE LIT PAS.
   *
   * `round.text` est le français CANONIQUE — il sert au MENTEUR à emprunter une
   * phrase plausible, pas à l'affichage. Le rendre tel quel afficherait du
   * français à un joueur anglais, sur la seule page qu'il lira jamais.
   * `composePhrase` fait ce que le HUD fait en jeu.
   */
  $("attractInstr").textContent = composePhrase(sess.round.phrase, sess.round.text);
  const barre = $("attractChrono");
  barre.style.transform = `scaleX(${1 - ratio})`;
  const chaud = ratio > CRITICAL_RATIO;
  barre.classList.toggle("est-chaud", chaud);

  const v = attract.verdict && now < attract.verdict.jusqua ? attract.verdict.texte : "";
  $("attractVerdict").textContent = v;

  /*
   * « DÉMO · MANCHE 7 » puis « PERSONNE NE JOUE ICI ».
   *
   * ⚠️ La seconde ligne compte autant que la première : sans elle, un visiteur
   * qui bouge sa souris ou son doigt et ne voit rien répondre croit que le
   * site est cassé. La phrase nomme les deux, pas seulement la souris.
   */
  const meta = $("attractMeta");
  meta.textContent = "";
  meta.append(
    t("attractManche")(sess.level),
    document.createElement("br"),
    t("attractPersonne"),
  );

  /*
   * LE CURSEUR, en pixels d'écran.
   *
   * ⚠️ `fieldRect()` est la SEULE source de la conversion, et c'est délibéré :
   * c'est déjà elle qui décide où le renderer pose les pièces. Refaire le
   * calcul à partir de la taille du canvas donnerait un curseur décalé dès que
   * la gouttière change — et un curseur qui ne pointe pas la pièce qu'il vise
   * enseigne un geste faux.
   */
  const cur = $("attractCurseur");
  if (g.curseur) {
    const r = attract.scene.fieldRect();
    const x = r.x + (g.curseur.x / FIELD_W) * r.w;
    const y = r.y + (g.curseur.y / FIELD_H) * r.h;
    cur.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    cur.classList.remove("hidden");
  } else {
    cur.classList.add("hidden");
  }

  // La chaleur : le cadre bat, et il rougit quand ça tourne mal.
  const boite = $("attract");
  boite.style.setProperty("--attract-heat", String(Math.round(ratio * 20) / 20));
  $("attractChaleur").classList.toggle("est-chaud", chaud);
}

/** La démo suit l'écran : elle ne tourne QUE sur l'accueil. */
/*
 * ⚠️ **LE FOND DE NUIT EST LE REPLI DU MOUVEMENT RÉDUIT, PLUS DU TÉLÉPHONE.**
 *
 * Directive récente : l'accueil montre le vrai attract partout, y compris
 * sous 900 px — 74 % des nouveaux repartent sans jouer, et une nuit animée
 * à la place du jeu ne leur dit rien. Quinze pièces illisibles se règlent
 * par un zoom (`cadrer`), pas en éteignant la démo.
 *
 * `prefers-reduced-motion` reste le cas où une `Session` + un canvas qui
 * bougent sont un coût sans bénéfice : on pose alors `.attract--nuit`.
 * L'ancienne justification « fond de nuit sur téléphone » reste vraie pour
 * CE repli-là, et pour lui seulement.
 *
 * ⚠️ Le seuil est décidé **ici et nulle part ailleurs**, et la feuille de
 * style se contente de suivre la classe. Une media query de largeur qui
 * redéciderait la nuit afficherait un fond sous une partie qui tourne, ou
 * l'inverse.
 */
/*
 * ⚠️ `matchMedia` PEUT MANQUER, ET SON ABSENCE VAUT « GRAND ÉCRAN / DÉMO ON ».
 *
 * Aucun navigateur en service ne s'en passe, mais le harnais de test monte
 * l'application dans un DOM simulé qui, lui, ne l'implémente pas — et un décor
 * n'a jamais le droit d'empêcher le jeu de démarrer. C'est la même doctrine que
 * le moteur sonore, qui reste jouable sur un WebAudio incomplet.
 *
 * Le repli est un objet inerte plutôt qu'un `if` à chaque usage : le reste du
 * code lit `SANS_DEMO.matches` et s'abonne, sans jamais avoir à savoir.
 */
const SANS_DEMO: Pick<MediaQueryList, "matches" | "addEventListener"> =
  typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false, addEventListener: () => {} };

function attractSuitEcran(id: ScreenId): void {
  $("attract").classList.toggle("attract--nuit", SANS_DEMO.matches);
  if (id !== "home" || SANS_DEMO.matches) {
    attract = null;
    return;
  }
  if (!attract) lanceAttract();
}

// Pivoter le téléphone, ou étirer la fenêtre : on repasse par le même chemin.
SANS_DEMO.addEventListener("change", () => attractSuitEcran(screen));

/**
 * `day` n'est plus une constante de session.
 *
 * Un onglet laissé ouvert après minuit UTC jouait encore la graine d'hier
 * et l'affichait comme aujourd'hui : `day = dayIndex()` ne courait qu'au
 * chargement. Chaque écran qui LIT le jour passe ici d'abord.
 *
 * ⚠️ PAS pendant une partie (`id === null`) NI sur l'écran de fin : le run
 * qui vient de se terminer appartient au jour de sa GRAINE, pas à l'horloge
 * du moment où on montre le score.
 */
function rafraichitJour(): void {
  day = dayIndex();
  const s = P.load();
  ensureDay(s, day);
  P.save(s);
}

/**
 * Le run du jour est-il épuisé, à l'instant du lancement ?
 *
 * ⚠️ LE GARDE APPARTIENT À `startRun` / `lanceRun`, PAS AUX BOUTONS.
 * `vueDuJour().verrouille` était posé sur COMMENCER et REJOUER, jamais
 * sur le lancement lui-même. Un bouton actif par erreur, un ESPACE, une
 * sync qui n'a pas encore recollé les essais : le quatrième run partait.
 */
function jourDuRunClos(): boolean {
  if (pendingMode !== "daily" || challenge || ranked) return false;
  rafraichitJour();
  return vueDuJour(P.load(), day).verrouille;
}

/**
 * Repeint l'écran visible s'il lit les chiffres que la sync / la file
 * viennent de bouger.
 *
 * `ouvreCompte` peignait tout de suite et n'attendait pas `synchronise()`.
 * `demarreCompte` ne repeignait que l'accueil. `finishRun` faisait
 * `void synchronise()` sans rien remettre à jour. Le joueur voyait un
 * profil désynchronisé alors que le pont de données avait déjà fait son
 * travail.
 */
function repeintChiffres(): void {
  if (screen === "compte") renderCompte();
  else if (screen === "home") renderHome();
  else if (screen === "solo") renderSolo();
  else if (screen === "classement") renderClassement();
  else if (screen === "over" && lastRun?.mode === "daily") renderPodium("daily");
}

function show(id: ScreenId): void {
  /*
   * Quitter le brief ANNULE le battement de lecture.
   *
   * `show` est le passage obligé de tout changement d'écran : le brancher ici
   * plutôt que sur le bouton RETOUR couvre aussi les sorties qu'on n'a pas
   * prévues — une invitation qui arrive, un retour à l'accueil. Sans ça, le
   * rebours continuerait de courir et lancerait un run par-dessus l'écran où
   * le joueur vient d'aller.
   *
   * `id === null` est l'écran de jeu, donc l'arrivée normale : le battement
   * s'y est déjà terminé de lui-même, et `annuleLecture` n'y a rien à faire.
   */
  if (lecture && id !== null) annuleLecture();
  /*
   * Le jour se relit ICI, pas une fois au chargement. Sauf le jeu et
   * l'écran de fin : voir `rafraichitJour`.
   */
  if (id !== null && id !== "over") rafraichitJour();
  cacheMicro();
  cachePastille();
  cacheToast();
  screen = id;
  for (const s of SCREENS) $(s).classList.toggle("hidden", s !== id);
  // Le bouton DÉJOUER ne vit que sur l'écran de jeu : quitter la partie le
  // retire, quel que soit le chemin de sortie.
  if (id !== null) $("btnDejouer").classList.add("hidden");
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
  /*
   * LA BARRE DE NAVIGATION suit exactement les mêmes écrans que la barre
   * haute — donc jamais l'écran de jeu.
   *
   * Elle vit en absolu dans `#app`, hors flux : elle ne peut pas prendre un
   * pixel au terrain, et la taille du champ EST du gameplay. Le `hidden` est
   * là pour le clavier et les lecteurs d'écran, pas pour la géométrie.
   */
  $("nav").classList.toggle("hidden", !barre);
  if (barre) {
    poseBarre();
    majNav();
  }
  attractSuitEcran(id);
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
  // `null` est l'écran de PARTIE : il a une adresse lui aussi, sans quoi le
  // bouton précédent sauterait par-dessus la partie comme si elle n'avait pas
  // eu lieu.
  poseAdresse(id ?? "partie");
}

/* ------------------------------------------------------------------ *
 * L'ADRESSE SUIT L'ÉCRAN
 *
 * Demandé par Pierre : « chaque partie du site a une page différente ». Et,
 * dans le même message : « pas de bouton pour revenir en arrière pour taper le
 * code d'un salon, juste direct au menu ».
 *
 * ⚠️ CE SONT DEUX SYMPTÔMES DU MÊME MANQUE : l'application ne savait pas d'où
 * l'on venait. Chaque RETOUR portait une destination écrite en dur —
 * `btnMultiJoinBack` faisait `exitToMenu(); show("home")`, donc il ne revenait
 * pas, il éjectait. Une histoire de navigation répond aux deux d'un coup.
 *
 * La table des adresses est dans `route.ts`, pure et testée ; le compteur de
 * pas et le dialogue avec `history` sont dans `histoire.ts`, parce que le
 * multijoueur en a besoin lui aussi et qu'un compteur par module se
 * désynchroniserait au premier écran de salon.
 * ------------------------------------------------------------------ */

window.addEventListener("popstate", () => {
  const cible = ecranDe(location.pathname) ?? "home";
  pendantRetour(() => {
    /*
     * ⚠️ REVENIR EN ARRIÈRE PENDANT UNE PARTIE, C'EST L'ABANDONNER.
     *
     * C'est déjà ce que fait ÉCHAP. Mais `abandon()` appelait `backHome()`,
     * donc `show("home")`, puis `return` — l'URL était déjà reculée
     * (`/entrainement`, `/solo`…) et `poseAdresse` est inerte pendant
     * `enRetour`. L'écran disait accueil, la barre d'adresse autre chose.
     *
     * On tue la session SANS changer d'écran, puis on SUIT l'adresse.
     */
    if (session) {
      session = null;
      challenge = null;
      ranked = null;
      musicApi.stop();
      $("ghost").classList.add("hidden");
      hud.setRule(null);
      hud.clearRound();
      hud.hideStamp();
    }
    /*
     * ⚠️ ET QUITTER LE SALON EN PARTANT, SINON ON Y RESTE ASSIS.
     *
     * Le salon est un état RÉSEAU, pas seulement un écran : sortir sans
     * prévenir laisserait un siège occupé par quelqu'un qui n'est plus là.
     * Pendant un match, `screen` est `null` : `isPlayingMulti()` le voit.
     */
    if (
      (multi.isPlayingMulti() || screen === "multi-lobby" || screen === "multi-end") &&
      cible !== "multi-lobby"
    ) {
      multi.exitToMenu();
    }
    suitAdresse(cible);
  });
});

/**
 * Ouvre l'écran que l'adresse désigne, et le PEINT.
 *
 * `show()` ne suffit pas — c'est le bug d'arrivée à froid. Le bouton
 * précédent doit faire la même chose, sinon un retour sur `/cartes`
 * montrerait une grille vide.
 *
 * ⚠️ `/partie` ne restaure PAS le run : il n'existe plus. On retombe sur
 * SOLO, le parent, plutôt que sur un canvas mort.
 *
 * ⚠️ `/multi` au retour ne reclique PAS `#btnMulti` : ce clic ouvre
 * l'identité si le nom manque, ou relance `openJoin`. On montre l'écran.
 */
function suitAdresse(cible: EcranId): void {
  if (cible === "partie") {
    renderSolo();
    show("solo");
    return;
  }
  if (cible === "multi-join") {
    show("multi-join");
    return;
  }
  if (cible === "home") {
    renderHome();
    show("home");
    return;
  }
  if (estAdressable(cible)) {
    ouvreAdresse(cible);
    return;
  }
  show(cible as Exclude<EcranId, "partie">);
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
  rafraichitJour();
  const s = P.load();

  /*
   * LA LANGUE D'ABORD, LE RESTE ENSUITE.
   *
   * `appliqueLangue` appelle `poseLangue`, et tout ce qui suit lit `t()`. Posée
   * APRÈS les appels au HUD, elle les laissait peindre dans la langue
   * PRÉCÉDENTE : mesuré, l'intitulé du pied affichait « BEST » une fois passé
   * en français, et « RECORD » une fois passé en anglais — un cran de retard à
   * chaque bascule, qui ne se rattrapait qu'au repeint suivant.
   */
  const lang: Lang = estLang(s.lang) ? s.lang : "fr";
  const c = compte();
  appliqueLangue(document, lang, {
    compte: libelleCompte(lang, c ? c.pseudo : null),
  });

  hud.setRule(null);
  hud.clearRound();
  hud.setMeta("");
  hud.setFooter(0, P.recordDeSonAllure(s), "—");

  /*
   * ⚠️ LE SALON HORS LIGNE SE DIT SUR SA CARTE, PLUS EN HAUT DE PAGE.
   *
   * L'ancien accueil affichait « SERVEUR DE SALONS HORS LIGNE » sous la moitié
   * MULTI de la faille, c'est-à-dire une panne annoncée à l'arrivée, à tout le
   * monde, y compris à qui n'a jamais joué. Le bouton reste désactivé — ça, ça
   * n'est pas négociable — mais l'information descend sur la carte, où elle
   * répond à quelqu'un qui vient de s'y intéresser.
   *
   * ⚠️ ET LA LIGNE « RUN DU JOUR : LE MENTEUR » A DISPARU AVEC LA FAILLE. Elle
   * nommait la règle du jour AVANT que le joueur ait cliqué quoi que ce soit :
   * la carte DU JOUR porte désormais le RECORD à battre, qui donne envie sans
   * rien brûler.
   */
  if (!multi.available) $("profMultiNote").textContent = TEXTES[lang].multiOff;
  $<HTMLButtonElement>("btnMulti").disabled = !multi.available;

  /*
   * L'accent va au multijoueur SEULEMENT si le run du jour est fait.
   *
   * Un écran a une action évidente, et elle ne peut pas être un bouton mort ;
   * mais elle ne peut pas non plus envoyer un nouveau venu vers le seul mode
   * irréversible du jeu. Tant qu'il reste quelque chose à faire en solo,
   * l'accent y va.
   */
  /*
   * L'OBJECTIF — le record à battre, donné avant le bouton.
   *
   * ⚠️ IL PREND LA PLACE DU CHAPO, il ne s'y ajoute pas. Mesuré : sur 375×812,
   * la faille finissait déjà à y=818 pour 812 de haut — six pixels, c'est-à-dire
   * pile à la limite. Un bloc AJOUTÉ coûtait 135 px et repoussait le bas de
   * MULTI à 142 px sous la ligne de flottaison. Même famille de faute que le
   * bandeau de mesure, qui a coûté 76 % d'entrées.
   */
  peintBut(monScoreDuJour(s), recordDuJour);
  /*
   * Le record du JOUR se charge après coup, et ne bloque rien.
   *
   * Il vient du classement, donc du réseau : l'accueil doit s'afficher sans
   * l'attendre. On peint d'abord avec ce qu'on a, on repeint quand il arrive —
   * et s'il ne répond jamais (comptes non configurés, réseau coupé, personne
   * n'a encore joué aujourd'hui), le repli d'entraînement reste à l'écran.
   */
  void rafraichitClassement();

  /*
   * ⚠️ LA FAILLE A QUITTÉ L'ACCUEIL.
   *
   * Elle désignait la porte à prendre en donnant l'accent à SOLO ou à MULTI
   * selon que le run du jour était fait. La rangée de profondeur ne fonctionne
   * pas ainsi : aucune de ses cinq cartes ne porte l'accent, parce qu'elles
   * viennent APRÈS le centre de gravité et n'ont pas le droit de disputer
   * l'attention à PLAY. La réponse par défaut est PLAY, toujours.
   */

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
  // Le multi ne se repeint pas tout seul : ses ecrans attendent le serveur.
  multi.onLangue();
  if (screen === "codex") renderCodex();
  /*
   * Le mode attract non plus : son intitulé et son nom de règle sont posés une
   * fois au lancement. C'est exactement par là que les six émotes du multi
   * étaient restées françaises.
   */
  if (attract) peintReglAttract(attract.session.rule);
}

/**
 * L'écran SOLO : les trois modes, et ce qui les entoure.
 *
 * Tout ce qui vivait sous la ligne de flottaison de l'accueil est ici — série,
 * quêtes, carnet — là où il a la place d'exister et où on vient le chercher.
 */
function renderSolo(): void {
  rafraichitJour();
  const s = P.load();

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
  // « FAIT » dès que le run est TERMINÉ, sans attendre l'épuisement des
  // essais : c'est l'accomplissement qu'on annonce, pas la consommation.
  const vj = vueDuJour(s, day);
  if (vj.acquis || vj.verrouille) chip(`${j.jourFait(day)} <b>${t("faitMaj")}</b>`);
  else chip(`${j.aujourdhui} <b>${nomDeRegle(rule.id, rule.name)}</b>`);

  renderQuests("homeQuests");

  const neuf = s.recent.length === 0;
  /*
   * La PRIORITÉ des quatre états vit dans `render/jour.ts`, pur et testé.
   *
   * Elle était écrite ici, en ternaires, et elle s'est trompée : en passant à
   * trois essais, tout dépendait de « combien il en reste » et l'état TERMINÉ
   * avait disparu — un joueur qui finissait les quarante manches lisait
   * « 2 ESSAIS RESTANTS ». La même famille que `plate.ts`, un cran plus loin.
   */
  const vue = vueDuJour(s, day);
  $<HTMLButtonElement>("btnDaily").disabled = vue.verrouille;

  /*
   * L'état va dans `.card__state`, jamais dans le textContent de la carte :
   * l'écrire sur le bouton effacerait son titre et sa description.
   */
  $("cardDailyDesc").textContent =
    vue.etat === "vierge" || vue.etat === "reste"
      ? accrocheDuJour(rule.id, day)
      : t("dailyFait");
  $("cardDailyState").textContent =
    vue.etat === "termine"
      ? t("dailyTermine")(s.daily.score)
      : vue.etat === "epuise"
        ? t("dailyEpuise")(s.daily.score)
        : vue.etat === "vierge"
          ? t("dailyUnEssai")
          : t("dailyEssaisRestants")(vue.restants);

  /*
   * CE QUI RESTE À FAIRE AUJOURD'HUI.
   *
   * Un joueur qui a bouclé son run du jour lisait « FAIT » et rien d'autre :
   * un cul-de-sac, sur l'écran même qui existe pour donner envie de rejouer.
   *
   * ⚠️ Le bloc ne PARAÎT que quand la journée est close — sinon il dirait ce
   * qu'il reste à faire à quelqu'un qui n'a rien fait, ce qui est le contraire
   * d'un accomplissement.
   *
   * ⚠️ Et il ne répète PAS les cartes : escalade et entraînement sont trois
   * centimètres plus haut. Il ne porte que ce qu'aucune carte ne dit — QUELLE
   * règle travailler, et ce qui vient demain.
   */
  const journeeClose = vue.acquis || vue.verrouille;
  $("soloReste").classList.toggle("hidden", !journeeClose);
  if (journeeClose) {
    $("soloResteFait").textContent = vue.acquis
      ? t("resteFait")(s.daily.score, DAILY_LENGTH)
      : t("resteEpuise")(s.daily.score);

    /*
     * TRAVAILLER LA RÈGLE DU JOUR — la seule ligne de l'écran qui DÉSIGNE un
     * exercice. Elle ouvre la FICHE et non l'exercice : la fiche dit ce qui
     * manque, et c'est elle qui lance. Même geste que « celle qui te résiste ».
     *
     * ⚠️ Elle se tait si la règle n'est pas au carnet : `ouvreFiche` refuse une
     * règle jamais rencontrée (décision n°7), donc un bouton mort. Le cas est
     * réel — on peut épuiser ses essais sans jamais finir une manche.
     */
    const auCarnet = !!s.encountered[rule.id];
    const b = $("btnResteTravailler");
    b.classList.toggle("hidden", !auCarnet);
    if (auCarnet) {
      const cases = franchies(echelleMaitrise(rule, s.encountered[rule.id]));
      b.textContent = t("resteTravailler")(nomDeRegle(rule.id, rule.name), cases);
    }

    // DEMAIN : le même geste que l'écran de fin, qui l'annonce déjà.
    const demain = tomorrowRule(day);
    $("soloDemain").textContent = nomDeRegle(demain.id, demain.name);
  }

  $("cardEscaladeState").textContent = t("escaladeEtat");
  $("cardTrainingState").textContent = neuf
    ? t("trainingNeuf")
    : t("trainingRecord")(P.recordDeSonAllure(s));

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
  const suivant =
    neuf || vue.etat === "termine" || vue.etat === "epuise" ? "btnTraining" : "btnDaily";
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
  poseInter("btnSound", s.sound);
  poseInter("btnMusic", s.music);
  appliqueMotifs(s.daltonien);
  refreshMetricsButton();
  renderAllureDefaut();
  renderDejoue();
}

/**
 * Le bloc DÉJOUER des réglages.
 *
 * Un téléphone n'a pas de lettre, un PC n'a pas de pouce : chaque ligne ne
 * paraît que là où elle règle quelque chose. Un appareil hybride (écran
 * tactile ET clavier) voit les deux, et c'est juste — il peut se servir des
 * deux.
 */
function renderDejoue(): void {
  const d = P.load().dejoue;
  poseInter("btnDejoue", d.on);
  $("rglDejoueTouche").classList.toggle("hidden", TOUCH_ONLY);
  $("rglDejoueCote").classList.toggle("hidden", !TACTILE);
  if (!captureTouche) $("btnDejoueTouche").textContent = d.touche;
  for (const [id, cote] of [
    ["btnDejoueGauche", "gauche"],
    ["btnDejoueDroite", "droite"],
  ] as const) {
    const b = $(id);
    b.classList.toggle("is-on", d.cote === cote);
    b.setAttribute("aria-pressed", String(d.cote === cote));
  }
}

/** Vrai pendant qu'on attend la lettre qui remplacera la touche du déjouage. */
let captureTouche = false;

function finCapture(): void {
  captureTouche = false;
  $("btnDejoueTouche").classList.remove("is-capture");
  renderDejoue();
}

$("btnDejoue").addEventListener("click", () => {
  P.mutate((st) => {
    st.dejoue.on = !st.dejoue.on;
  });
  sfx.ui();
  renderDejoue();
});
$("btnDejoueTouche").addEventListener("click", () => {
  sfx.ui();
  captureTouche = true;
  const b = $("btnDejoueTouche");
  b.classList.add("is-capture");
  b.textContent = t("dejoueCapture");
});
$("btnDejoueTouche").addEventListener("blur", () => {
  if (captureTouche) finCapture();
});
/*
 * ⚠️ EN PHASE DE CAPTURE, ET AVANT TOUT LE RESTE.
 * Le gestionnaire du jeu écoute la même fenêtre : sans `stopImmediatePropagation`
 * ÉCHAP ramènerait à l'accueil au lieu d'annuler la saisie.
 */
window.addEventListener(
  "keydown",
  (e) => {
    if (!captureTouche) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Escape") {
      finCapture();
      return;
    }
    if (!toucheAcceptable(e.key)) {
      sfx.grace();
      return;
    }
    P.mutate((st) => {
      st.dejoue.touche = e.key.toUpperCase();
    });
    sfx.ui();
    finCapture();
  },
  true,
);
for (const [id, cote] of [
  ["btnDejoueGauche", "gauche"],
  ["btnDejoueDroite", "droite"],
] as const) {
  $(id).addEventListener("click", () => {
    P.mutate((st) => {
      st.dejoue.cote = cote;
    });
    sfx.ui();
    renderDejoue();
  });
}

/*
 * ⚠️ UN INTERRUPTEUR NE S'ÉCRIT PAS EN `textContent`.
 *
 * Il porte deux `<i>` — la face ON et la face OFF, toutes deux visibles — et
 * une écriture les détruirait. C'est exactement le piège des cartes de
 * l'accueil (`tests/cartes.test.ts`), payé une fois de plus au même endroit :
 * un élément à enfants ne se met à jour que par sa CLASSE.
 *
 * Et il annonce son état aux lecteurs d'écran par `aria-checked`, que la
 * couleur ne dit pas.
 */
function poseInter(id: string, on: boolean): void {
  const b = $(id);
  b.classList.toggle("is-on", on);
  b.setAttribute("aria-checked", String(on));
}

/**
 * L'allure par défaut de l'entraînement, réglée ICI.
 *
 * Elle n'existait que dans le brief, donc introuvable : un joueur qui trouve
 * le jeu trop rapide n'a aucune raison d'aller la chercher au moment précis
 * où il vient de choisir une règle. Le défaut du joueur est 2 (DÉBUT), et
 * c'est le chiffre que ce réglage sert à défaire.
 */
function renderAllureDefaut(): void {
  const current = P.load().trainingPace;
  const hote = $("rglAllure");
  // De la plus LENTE à la plus rapide : une jauge qui descend de gauche à
  // droite se lit à l'envers. `PACE_CHOICES` les donne dans l'autre sens.
  const lentesDabord = [...PACE_CHOICES].sort((a, b) => b - a);
  fillOptions(
    hote,
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
  for (const btn of Array.from(hote.children)) {
    btn.addEventListener("click", () => {
      sfx.ui();
      P.mutate((st) => {
        st.trainingPace = Number((btn as HTMLElement).dataset.value);
      });
      renderAllureDefaut();
    });
  }
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
  poseInter("btnMotifs", on);
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
      const avant = nomAllure(current, PACE_LABELS[current] ?? String(current));
      sfx.ui();
      P.mutate((st) => {
        st.trainingPace = v;
      });
      renderPace();
      if (v !== current) {
        montreToast(
          t("toastAllure"),
          `${avant} → ${nomAllure(v, PACE_LABELS[v] ?? String(v))}`,
        );
      }
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
  const maitrisees = ONE_RULES.filter((r) => estMaitrisee(r, s.encountered[r.id])).length;
  /*
   * DEUX ENTRÉES, UNE GRILLE. La maquette dessinait un écran TRAINING séparé.
   * Deux listes de règles se contrediraient : on change le CADRE, pas la
   * collection. CARTES lit « COLLECTION · 5 / 16 » ; TRAINING lit
   * « MAÎTRISE TES RÈGLES » et pose le filtre À MATER.
   */
  const stat = CHAINES[langue()];
  if (codexVue === "training") {
    $("codexEyebrow").textContent = stat["carte.training.titre"];
    $("codexTitre").textContent = t("salleTitre");
  } else {
    $("codexEyebrow").textContent = stat["carnet.collection"];
    $("codexTitre").textContent = `${vues} / ${ONE_RULES.length}`;
  }
  $("codexProgress").textContent = t("carnetProgres")(vues, ONE_RULES.length, maitrisees);

  /* ---------------------------------------------------------------- *
   * LA SALLE DE TRAVAIL — filtres, et la règle qui résiste
   * ---------------------------------------------------------------- */

  const rencontrees = ONE_RULES.filter((r) => !!s.encountered[r.id]);
  const aMater = rencontrees.filter((r) => !estMaitrisee(r, s.encountered[r.id]));

  /*
   * CELLE QUI TE RÉSISTE : la plus retentée parmi celles qui manquent.
   *
   * On départage sur le nombre de cases franchies — à runs égaux, celle dont
   * on est le plus loin. C'est la seule ligne de l'écran qui DÉSIGNE un
   * exercice au lieu d'en proposer seize, et c'est ce qui évite au joueur
   * d'avoir à choisir avant de savoir quoi choisir.
   */
  const resiste = [...aMater].sort((x, y) => {
    const rx = s.encountered[x.id]?.runs ?? 0;
    const ry = s.encountered[y.id]?.runs ?? 0;
    if (rx !== ry) return ry - rx;
    return (
      franchies(echelleMaitrise(x, s.encountered[x.id])) -
      franchies(echelleMaitrise(y, s.encountered[y.id]))
    );
  })[0];

  // Elle ne paraît qu'au-delà d'un run : à zéro, « celle qui te résiste »
  // désignerait une règle qu'on vient de croiser une fois.
  const recResiste = resiste ? s.encountered[resiste.id] : undefined;
  const montreResiste = !!resiste && (recResiste?.runs ?? 0) >= 2;
  $("resiste").classList.toggle("hidden", !montreResiste);
  if (montreResiste && resiste) {
    $<HTMLImageElement>("resisteImg").src = `/cartes/${resiste.id}.png`;
    $("resisteNom").textContent = nomDeRegle(resiste.id, resiste.name);
    $("resisteNote").textContent = t("resisteNote")(
      recResiste?.runs ?? 0,
      franchies(echelleMaitrise(resiste, recResiste)),
    );
    $("btnResiste").textContent = t("resisteBouton");
    $("btnResiste").dataset.regle = resiste.id;
  }

  /*
   * Les filtres portent leur COMPTE : « À MATER · 3 » répond déjà à la question
   * qu'on venait poser, même sans cliquer.
   *
   * Ils n'apparaissent qu'à partir de deux règles rencontrées : à une seule,
   * trois boutons pour trier un élément se lisent comme une fonctionnalité qui
   * ne sert à rien.
   */
  /*
   * DEUX GROUPES DE FILTRES, et ils répondent à deux questions différentes :
   * « quel genre de règle ? » (la famille) et « où j'en suis ? » (l'avancement).
   *
   * Un seul filtre actif à la fois, quel que soit le groupe : deux filtres qui
   * se composent demanderaient au joueur de tenir un état en tête, sur un écran
   * qui existe justement pour lui éviter ça.
   */
  const fam = parFamille();
  const verrouillees = ONE_RULES.length - rencontrees.length;
  const hote = $("filtres");
  hote.classList.toggle("hidden", rencontrees.length < 2);
  hote.innerHTML = "";
  const groupes: ReadonlyArray<ReadonlyArray<readonly [Filtre, string]>> = [
    [
      ["toutes", t("filtreToutes")(ONE_RULES.length)],
      ["interdit", t("filtreInterdits")(fam.interdit.length)],
      ["deformation", t("filtreDeformations")(fam.deformation.length)],
      ["contrainte", t("filtreContraintes")(fam.contrainte.length)],
    ],
    [
      ["amater", t("filtreAMater")(aMater.length)],
      ["maitrisees", t("filtreMaitrisees")(maitrisees)],
      ["verrouillees", t("filtreVerrouillees")(verrouillees)],
    ],
  ];
  for (const groupe of groupes) {
    const g = document.createElement("div");
    g.className = "filtres__groupe";
    for (const [id, libelle] of groupe) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `filtre${filtre === id ? " is-on" : ""}`;
      b.textContent = libelle;
      b.setAttribute("aria-pressed", String(filtre === id));
      b.addEventListener("click", () => {
        filtre = id;
        sfx.ui();
        renderCodex();
      });
      g.appendChild(b);
    }
    hote.appendChild(g);
  }

  // Ce que le joueur n'a pas encore vu — et qui ne s'obtient qu'en jouant.
  $("codexJamais").textContent = t("salleJamaisVues")(ONE_RULES.length - vues);
  $("codexJamais").classList.toggle("hidden", vues === 0);

  const visibles = ONE_RULES.filter((r) => passeFiltre(r, s, filtre));
  $("codexRien").textContent = t("filtreRien");
  $("codexRien").classList.toggle("hidden", visibles.length > 0 || filtre === "toutes");

  /*
   * LE CARNET EST DEVENU UNE COLLECTION.
   *
   * C'était une liste de lignes ; c'est une grille de cartes. Le changement
   * n'est pas décoratif : une liste se consulte, une collection se COMPLÈTE, et
   * c'est la seule chose que les joueurs ont réclamée qui manquait vraiment —
   * mesuré, les pièces ne s'achètent rien et 15 % seulement valident une quête.
   *
   * Le compteur compte désormais les MAÎTRISÉES et non les « tenues » : c'est
   * le même objectif que l'entraînement ciblé, donc le même nombre partout.
   */
  /*
   * LA BARRE LATÉRALE : le compte, et une case par règle.
   *
   * Seize cases colorées par leur état donnent l'avancement de toute la
   * collection d'un coup d'œil — c'est ce que le compteur textuel ne peut pas
   * faire. Elle n'apparaît qu'en large ; le CSS s'en charge, pas le JS.
   */
  $("codexbarTotal").innerHTML = "";
  const tot = document.createElement("span");
  $("codexbarTotal").append(String(vues), tot);
  tot.textContent = ` / ${ONE_RULES.length}`;
  const jauge = $("codexbarJauge");
  jauge.innerHTML = "";
  for (const r of ONE_RULES) {
    const i = document.createElement("i");
    const e = etatCarte(franchies(echelleMaitrise(r, s.encountered[r.id])));
    if (e !== "verrouillee") i.className = `est-${e === "parfaite" ? "parfaite" : e === "maitrisee" ? "maitrisee" : "decouverte"}`;
    jauge.appendChild(i);
  }

  // Le mur de cartes verrouillées devient une invitation quand il est TOTAL.
  $("codexVide").textContent = t("codexVide");
  $("codexVideBox").classList.toggle("hidden", vues > 0);
  /* À zéro règle, le mur de seize barres se lit comme une fonctionnalité
     cassée. L'invitation suffit — une carte se débloque en jouant. */
  list.classList.toggle("hidden", vues === 0);

  for (const r of vues === 0 ? [] : visibles) {
    const rec = s.encountered[r.id];
    const cases = echelleMaitrise(r, rec);
    const n = franchies(cases);
    const etat = etatCarte(n);
    const carte = document.createElement("article");
    // « NOUVELLE » est un badge TRANSITOIRE : la règle a été découverte au
    // dernier run. Il tombe dès qu'on rejoue, et c'est voulu — c'est un
    // événement, pas un état.
    const neuve = r.id === derniereDecouverte;
    carte.className = `carte is-${etat}${neuve ? " is-neuve" : ""}`;
    /*
     * L'ILLUSTRATION EST UNE IMAGE, et la carte VERROUILLÉE n'en charge aucune.
     *
     * La censure REMPLACE la scène, elle ne la couvre pas : un emblème caché
     * sous un voile se lirait en ouvrant l'inspecteur, et tout le catalogue
     * avec — la décision n°7 tenue jusque dans le HTML, et maintenant jusque
     * dans les requêtes réseau.
     */
    const verrou = etat === "verrouillee";
    const vue = verrou
      ? `<div class="carte__censure" aria-hidden="true"><span class="carte__interro">?</span></div>`
      : `<img class="carte__img" src="/cartes/${r.id}.png" width="64" height="64" alt="" loading="lazy" decoding="async" />`;
    /*
     * TROIS ZONES, comme la maquette : la FAMILLE et l'avancement en bandeau,
     * la scène au milieu, le NOM et l'ÉTAT en pied. Le cadre entier prend la
     * couleur de l'état, donc une grille de seize se lit de loin sans lire un
     * seul mot.
     */
    carte.innerHTML =
      `<div class="carte__tete">` +
      `<span class="carte__famille"></span>` +
      `<span class="carte__cases"></span>` +
      `</div>` +
      `<div class="carte__vue">${vue}</div>` +
      `<div class="carte__pied">` +
      `<h3 class="carte__nom"></h3>` +
      `<p class="carte__etat"></p>` +
      `</div>`;
    carte.querySelector<HTMLElement>(".carte__famille")!.textContent = verrou
      ? "? ? ?"
      : NOM_FAMILLE[familleDe(r)]();
    carte.querySelector<HTMLElement>(".carte__cases")!.textContent = verrou ? "—" : `${n}/6`;
    carte.querySelector<HTMLElement>(".carte__nom")!.textContent = verrou
      ? t("pickVerrouille")
      : nomDeRegle(r.id, r.name);
    carte.querySelector<HTMLElement>(".carte__etat")!.textContent = verrou
      ? t("carteVerrouillee")
      : neuve
        ? t("carteNouvelle")
        : ETIQUETTE_ETAT[etat]();
    /*
     * Une carte RENCONTRÉE s'ouvre ; une verrouillée ne bouge pas.
     *
     * Un bouton qui ne fait rien se lit comme un bug, et une fiche vide
     * brûlerait la surprise (décision n°7). On ne rend donc cliquable que ce
     * qui a quelque chose à raconter.
     */
    if (etat !== "verrouillee") {
      carte.classList.add("is-ouvrable");
      carte.setAttribute("role", "button");
      carte.setAttribute("tabindex", "0");
      carte.addEventListener("click", () => ouvreFiche(r));
      carte.addEventListener("keydown", (ev) => {
        const e = ev as KeyboardEvent;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ouvreFiche(r);
        }
      });
    }
    list.appendChild(carte);
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

const nomFournisseur = (f: string): string =>
  f === "google" ? t("cptGoogle") : f === "discord" ? t("cptDiscord") : f.toUpperCase();

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
  rafraichitJour();
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
  /*
   * CONNECTE : le NOM est le titre, et il n'y en a pas deux.
   *
   * Un « MON COMPTE » pose au-dessus de « PIERRE » repete la meme chose deux
   * fois et repousse d'autant les chiffres, qui sont ce qu'on vient voir. Le
   * titre et le chapo ne servent donc que l'etat ANONYME, ou il faut d'abord
   * dire a quoi sert un compte.
   */
  $("compteTitre").classList.toggle("hidden", connecte);
  $("compteLede").classList.toggle("hidden", connecte);
  $("compteTitre").textContent = connecte ? t("compteTitreConnecte") : t("compteTitreAnonyme");

  /*
   * La REPARTITION de la collection, et une case par regle.
   *
   * C'est la meme jauge que la barre laterale du carnet : un seul objet a
   * apprendre, et il dit la meme chose aux deux endroits.
   */
  const etats = ONE_RULES.map((r) =>
    etatCarte(franchies(echelleMaitrise(r, s.encountered[r.id]))),
  );
  // ⚠️ Pas `compte` : ce nom est deja celui de l'etat du COMPTE, importe de
  // `./compte`. Le masquer ici cassait `c.pseudo` vingt lignes plus bas.
  const combien = (e: EtatCarte): number => etats.filter((x) => x === e).length;
  const jaugeCpt = $("cptJauge");
  jaugeCpt.innerHTML = "";
  for (const e of etats) {
    const i = document.createElement("i");
    if (e !== "verrouillee") {
      i.className = `est-${e === "parfaite" ? "parfaite" : e === "maitrisee" ? "maitrisee" : "decouverte"}`;
    }
    jaugeCpt.appendChild(i);
  }
  $("cptRepartition").textContent = t("cptRepartition")(
    combien("parfaite"),
    combien("maitrisee"),
    combien("decouverte") + combien("encours"),
    combien("verrouillee"),
  );

  /** Une cellule de la grille de chiffres — quatre faits, aucun jugement. */
  const grille = (hote: HTMLElement, cellules: ReadonlyArray<readonly [string, string]>): void => {
    hote.innerHTML = "";
    for (const [valeur, label] of cellules) {
      const cel = document.createElement("div");
      cel.className = "cpt__cel";
      cel.innerHTML = `<b class="cpt__val"></b><span class="cpt__lab"></span>`;
      cel.querySelector<HTMLElement>(".cpt__val")!.textContent = valeur;
      cel.querySelector<HTMLElement>(".cpt__lab")!.textContent = label;
      hote.appendChild(cel);
    }
  };

  const vues = ONE_RULES.filter((r) => !!s.encountered[r.id]).length;
  const maitriseesN = combien("maitrisee") + combien("parfaite");
  const monRecord = P.recordDeSonAllure(s);

  if (connecte) {
    $("compteLede").textContent = t("cptEnregistre");
    $("cptSigne").innerHTML = glyphSvg(signeAffiche(s), 34);
    $("cptNom").textContent = c.pseudo || t("cptSansNom");
    /*
     * ⚠️ Le FOURNISSEUR n'est pas affiché, et c'est un manque assumé.
     *
     * La maquette montre « CONNECTÉ · GOOGLE », mais le jeton ne porte pas le
     * fournisseur : `EtatCompte` a le pseudo, le glyphe et la péremption, rien
     * de plus. L'afficher demanderait une revendication de plus dans le JWT —
     * donc de toucher aussi le serveur de salons, qui le vérifie. Deviner
     * serait pire que se taire.
     */
    $("cptVia").textContent = t("cptConnecte");
    grille($("cptGrille"), [
      [String(monRecord), t("cptMeilleur")],
      [`${vues} / ${ONE_RULES.length}`, t("cptRegleCarnet")],
      [String(maitriseesN), t("cptMaitrisees")],
      [t("cptEnJours")(s.streak.count), t("cptSerieEnCours")],
    ]);

    /*
     * LE RUN DU JOUR est le seul resultat OPPOSABLE a quelqu'un d'autre.
     *
     * C'est la decision n°14 rendue visible : ce qui est opposable est REJOUE
     * par le serveur, le reste est une declaration de l'appareil. Le badge ne
     * parait donc que si le serveur a bien rejoue ce run — sinon on affiche le
     * score sans le presenter comme une preuve.
     */
    const mienDuJourHaut = monScoreDuJour(s);
    $("cptJourVal").textContent = mienDuJourHaut != null
      ? t("cptJourFait")(mienDuJourHaut)
      : t("cptJourRien");
    $("cptJourNote").textContent = "";
    $("cptOpposable").classList.add("hidden");
    void classementDuJour(day).then((cl) => {
      if (screen !== "compte" || !cl) return;
      const moi = cl.moi ?? cl.top?.find((e) => e.moi) ?? null;
      if (!moi) return;
      $("cptJourNote").textContent = t("cptJourRang")(moi.rang);
      $("cptOpposable").classList.remove("hidden");
    });

    const hote = $("compteIdentite");
    hote.innerHTML = "";
    hote.appendChild(ligneCompte(t("cptCarnet"), t("cptRegles")(vues, ONE_RULES.length)));
    hote.appendChild(
      ligneCompte(t("cptSerie"), t("cptJours")(s.streak.count)),
    );
    /*
     * ⚠️ UNE SEULE SOURCE POUR « TON RECORD ».
     *
     * La grille du haut lit `recordDeSonAllure`. Cette ligne lisait
     * `s.bestTraining` — l'allure de référence, où un joueur à DÉBUT a 0
     * alors que son vrai record est 40. Le libellé ne nomme pas l'allure
     * de référence, donc ce n'est pas le chiffre de `bestTraining`.
     */
    hote.appendChild(ligneCompte(t("cptRecordEntrainement"), t("cptManches")(monRecord)));

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
    const jourDemande = day;
    void mesPerfs().then((perfs) => {
      if (screen !== "compte" || jourDemande !== day) return;
      /*
       * ⚠️ ON NE GARDE QUE LE RUN DU JOUR, et les deux lignes le disent.
       *
       * Elles comptaient et comparaient TOUTES les performances, tous modes
       * confondus, sous des intitules qui annoncent « RUN DU JOUR ». La table
       * ne contient aujourd'hui que du run du jour — `enfile` n'enregistre que
       * ce mode — donc rien ne se voyait ; mais le jour ou l'entrainement y
       * entrerait, l'ecran aurait affiche un record d'entrainement sous
       * l'etiquette du jour. C'est le chiffre faux que `render/but.ts` existe
       * pour interdire, laisse en clair a deux lignes de la mention qui dit
       * qu'on ne melange pas les epreuves.
       *
       * ⚠️ L'ÉCART SE CALCULE CONTRE LA PERF DU MÊME JOUR, jamais le max
       * de carrière. Un 40 d'hier sous « meilleur run du jour » à côté d'un
       * 12 d'aujourd'hui est le même chiffre faux, juste déplacé.
       */
      const duJour = perfs.filter((p) => p.mode === "daily");
      if (!duJour.length) return;
      hote.appendChild(ligneCompte(t("cptRunsEnregistres"), `${duJour.length}`));
      const aujourdHui = duJour.filter((p) => p.jour === jourDemande);
      if (!aujourdHui.length) return;
      const meilleur = aujourdHui.reduce((m, p) => (p.valeur > m.valeur ? p : m));
      hote.appendChild(ligneCompte(t("cptMeilleurRun"), t("cptManches")(meilleur.valeur)));
      /*
       * ⚠️ ET ON SIGNALE L'ECART AVEC LE CHIFFRE LOCAL.
       *
       * C'est exactement ce que Pierre a vu : « 34 aujourd'hui » plus haut sur
       * le meme ecran — son score LOCAL — et « meilleur run du jour : 23 »
       * ici, qui vient du serveur. Sans cette ligne, les deux chiffres se
       * contredisent en silence et le joueur conclut que le classement est
       * casse.
       */
      const mienDuJour = monScoreDuJour(P.load()) ?? 0;
      if (mienDuJour > meilleur.valeur) {
        hote.appendChild(ligneCompte(t("cptEcart"), t("cptEcartQuoi")));
      }
    });
    return;
  }

  /*
   * ANONYME : le titre porte SON chiffre.
   *
   * « GARDE CE 31 » dit ce qu'un compte sert a faire ; « cree un compte » ne
   * dit que ce qu'on lui demande. Et sans chiffre — un joueur qui n'a encore
   * rien fait — la promesse porte sur la progression plutot que sur un zero.
   */
  $("compteTitre").textContent =
    monRecord > 0 ? t("cptGarde")(monRecord) : t("cptGardeRien");
  /*
   * ⚠️ Trois libelles COURTS ici, longs dans la grille du connecte.
   *
   * L'anonyme les met sur UNE rangee — mesure a 375 px : « MEILLEUR SCORE » et
   * « REGLES AU CARNET » repliaient la troisieme cellule sur sa propre ligne.
   * C'est la quatrieme fois que ce projet paie un libelle long dans une barre
   * segmentee ; le remede est toujours de raccourcir le mot, pas la barre.
   */
  grille($("cptGrilleAnon"), [
    [String(monRecord), t("cptCourtRecord")],
    [String(vues), t("cptCourtCartes")],
    [t("cptEnJours")(s.streak.count), t("cptCourtSerie")],
  ]);
  $("compteLede").textContent = t("cptSansCompte");

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
    annule: t("cptErrAnnule"),
    echec: t("cptErrEchange"),
    etat_invalide: t("cptErrExpire"),
    banni: t("cptErrSuspendu"),
    indisponible: t("cptErrNonConfig"),
  };
  $("compteQuoi").textContent = t("cptCeQuiSerait");

  const rangee = $("compteFournisseurs");
  rangee.innerHTML = "";
  for (const f of fournisseursDispo ?? []) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = nomFournisseur(f);
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
      ? (RAISONS[retourCompte.code] ?? t("cptErrRetour")(retourCompte.code))
      : "";
  err.classList.toggle("hidden", !vide && !refus);
  err.textContent = refus || (vide ? t("compteIndispo") : "");
}

async function ouvreCompte(): Promise<void> {
  await chargeFournisseurs();
  /*
   * Doctrine n°12 : un échec réseau n'empêche PAS d'afficher. On peint
   * local tout de suite, on repeint quand `synchronise()` revient — si
   * l'on est encore sur cet écran.
   */
  rafraichitJour();
  renderCompte();
  show("compte");
  await synchronise();
  if (screen === "compte") renderCompte();
}

/**
 * L'endpoint de mesure, lu UNE fois.
 *
 * Hissé au niveau du module parce que deux endroits en dépendent désormais :
 * l'initialisation, et la décision de proposer le bandeau après la première
 * partie. `cleanEnv` reste indispensable — un BOM devant l'URL rend chaque
 * envoi silencieusement 404 (piège déjà payé, voir `setupAnalytics`).
 */
const ENDPOINT_MESURE = cleanEnv(import.meta.env.VITE_COLLECT_URL as string | undefined);

/**
 * LA MESURE SE DEMANDE APRÈS LA PREMIÈRE PARTIE, PLUS À L'ARRIVÉE.
 *
 * Ce que ça change pour la collecte : RIEN. `metrics.on` vaut déjà `true` par
 * défaut et le bandeau ne conditionnait aucune collecte — il informait, et
 * offrait un refus. Les deux restent vrais, une minute plus tard, sur un écran
 * où le joueur n'a plus rien à faire d'autre. Le réglage MESURE des réglages
 * n'a pas bougé non plus : le refus reste accessible en permanence.
 *
 * ⚠️ L'arbitrage JURIDIQUE reste celui de Pierre. Ce qui est mesuré ici est un
 * fait de produit — 76 % des joueurs n'ont jamais lancé une partie, et cet
 * objet couvrait 27 % de l'écran devant les deux portes du jeu.
 *
 * Une seule sollicitation par écran : quand le bandeau paraît, l'invitation au
 * compte attend le run suivant. Deux demandes empilées sur l'écran de fin, ce
 * serait exactement le mur qu'on vient de retirer de l'accueil.
 */
/** La note choisie, tant que l'avis de cet écran n'est pas clos. */
let avisNote: NoteAvis | null = null;

/** L'avis, une fois dans la vie du joueur — voir `game/avis.ts`. */
function proposeAvis(mesureDemandee: boolean): boolean {
  const s = P.load();
  const boite = $("avis");
  const montrer = doitDemanderAvis({
    runsAcheves: s.recent.length,
    dejaVu: !!s.avisVu,
    mesureOn: s.metrics.on,
    mesureDemandee,
    collecte: !!ENDPOINT_MESURE,
  });
  if (!montrer) {
    boite.classList.add("hidden");
    return false;
  }
  // Vu dès qu'il paraît : répondu ou non, il ne reviendra pas.
  P.mutate((st) => {
    st.avisVu = true;
  });
  avisNote = null;
  boite.classList.remove("hidden");
  $("avisPlus").classList.add("hidden");
  $("avisMerci").classList.add("hidden");
  boite.querySelector(".avis__notes")!.classList.remove("hidden");
  $<HTMLTextAreaElement>("avisTexte").value = "";
  return true;
}

function closAvis(): void {
  avisNote = null;
  $("avisPlus").classList.add("hidden");
  $("avis").querySelector(".avis__notes")!.classList.add("hidden");
  $("avisMerci").classList.remove("hidden");
}

for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>(".avis__note"))) {
  b.addEventListener("click", () => {
    const note = Number(b.dataset.note) as NoteAvis;
    sfx.ui();
    // La note part TOUT DE SUITE : un joueur qui ferme l'onglet après son tap
    // a quand même répondu.
    track("avis", { note });
    avisNote = note;
    for (const autre of Array.from(document.querySelectorAll(".avis__note"))) {
      autre.classList.toggle("is-on", autre === b);
    }
    $("avisPlus").classList.remove("hidden");
  });
}
$("btnAvisEnvoyer").addEventListener("click", () => {
  const texte = nettoieAvis($<HTMLTextAreaElement>("avisTexte").value);
  if (texte && avisNote !== null) track("avis_mot", { note: avisNote, texte });
  sfx.ui();
  closAvis();
});
$("btnAvisNon").addEventListener("click", () => {
  sfx.ui();
  closAvis();
});

function proposeMesure(): boolean {
  const s = P.load();
  if (s.metrics.asked || !ENDPOINT_MESURE) return false;
  $("notice").classList.remove("hidden");
  return true;
}

/**
 * LE PODIUM DU JOUR, sur l'écran de fin.
 *
 * Il ne paraît qu'après un RUN DU JOUR — c'est le seul mode dont deux
 * résultats se comparent, puisque tout le monde y joue la même graine et la
 * même règle.
 *
 * ⚠️ IL SE TAIT PLUTÔT QUE DE MONTRER UN CADRE VIDE. Un déploiement sans
 * comptes, un réseau coupé, une base lente ou simplement personne qui a encore
 * joué aujourd'hui : dans tous ces cas `classementDuJour` rend `null` ou une
 * liste vide, et l'écran n'affiche rien. Un tableau vide se lirait comme un
 * chargement raté, et le joueur n'a rien à réparer.
 *
 * Il est appelé sans être attendu : l'écran de fin s'affiche tout de suite, le
 * podium s'y ajoute quand il arrive. Le faire attendre retarderait le seul
 * écran que le joueur veut voir vite — celui qui dit REJOUER.
 */
function renderPodium(mode: Mode): void {
  if (mode !== "daily") {
    $("podium").classList.add("hidden");
    return;
  }
  peintPodium("podium", "over");
}

/**
 * Le podium, dans le conteneur demandé.
 *
 * Deux écrans l'affichent — la fin d'un run du jour, et le mur des records —
 * et un rendu écrit deux fois finit par diverger. Le conteneur porte donc son
 * identifiant en préfixe (`podiumListe`, `murPodiumListe`), et l'écran attendu
 * garde la garde contre une réponse qui arrive après un changement d'écran.
 *
 * @param quoi l'identifiant du bloc, aussi préfixe de ses enfants
 * @param ecran l'écran sur lequel la réponse a encore un sens
 */
function peintPodium(quoi: string, ecran: ScreenId): void {
  const boite = $(quoi);
  boite.classList.add("hidden");
  const enfant = (n: string): string => (quoi === "podium" ? `podium${n}` : `${quoi}${n}`);

  const jourDemande = day;
  void classementDuJour(jourDemande).then((c) => {
    // L'écran a pu changer, ou le joueur relancer, pendant l'appel : on ne
    // peint que si l'on est encore là où on a demandé.
    if (!c || screen !== ecran || jourDemande !== day) return;
    if (!c.top.length) return;

    const liste = $(enfant("Liste"));
    liste.innerHTML = "";
    for (const e of c.top) {
      const li = document.createElement("li");
      li.className = "podium__ligne" + (e.moi ? " is-moi" : "");
      li.innerHTML =
        `<span class="podium__rang"></span>` +
        `<span class="podium__glyphe"></span>` +
        `<span class="podium__nom"></span>` +
        `<span class="podium__score"></span>`;
      li.querySelector<HTMLElement>(".podium__rang")!.textContent = t("rangEme")(e.rang);
      li.querySelector<HTMLElement>(".podium__glyphe")!.innerHTML = glyphSvg(
        glyphFromIndex(e.glyphe),
        16,
      );
      // `textContent` et jamais `innerHTML` : un pseudo vient d'un joueur.
      li.querySelector<HTMLElement>(".podium__nom")!.textContent = e.pseudo || t("cptSansNom");
      li.querySelector<HTMLElement>(".podium__score")!.textContent = String(e.valeur);
      liste.appendChild(li);
    }

    /*
     * La ligne du dessous dit ce qui manque, pas ce qui va bien : hors du
     * podium on lit son rang, sans compte on lit comment y entrer, et sur le
     * podium on ne lit rien de plus — la ligne accentuée l'a déjà dit.
     */
    const moi = $(enfant("Moi"));
    moi.textContent = c.moi
      ? t("podiumRang")(c.moi.rang, c.moi.valeur)
      : estConnecte()
        ? ""
        : t("podiumAbsent");
    boite.classList.remove("hidden");
  });
}


/**
 * LE MUR DES RECORDS.
 *
 * Le podium existait, mais il ne paraissait que sur l'écran de FIN, après un
 * run du jour. Or 106 joueurs sur 139 n'ont jamais lancé une partie : ils ne
 * l'ont donc jamais vu, et c'est justement à eux qu'il servirait. Le porter
 * là où l'on décide de jouer est le levier nommé dans la mémoire du dépôt.
 *
 * ⚠️ AUCUNE INFRASTRUCTURE INVENTÉE. Trois sources, toutes existantes :
 * `vueBut` pour le record à battre et son épreuve, `recordDeSonAllure` pour
 * celui du joueur, et `classementDuJour` pour le podium — la même route que
 * l'écran de fin. Rien d'autre n'est affiché, parce que rien d'autre n'est
 * vrai.
 */
function renderClassement(): void {
  rafraichitJour();
  const s = P.load();
  /*
   * ⚠️ LES DEUX CHIFFRES, ET C'EST LE MODULE QUI CHOISIT.
   *
   * Le mur passait ici `recordDeSonAllure` — le record d'ENTRAINEMENT — alors
   * que sa cible vient du classement du JOUR des que celui-ci repond. Il
   * comparait donc un record fait a une allure choisie sur une regle choisie
   * au meilleur du jour, ou tout le monde joue la meme graine et la meme
   * regle : « il te manque 170 manches » ne voulait rien dire.
   */
  // Il DEMANDE, au lieu de lire un cache que lui-meme ne remplissait jamais.
  // On peint tout de suite avec ce qu'on a, on repeint quand la reponse arrive.
  void rafraichitClassement();
  const siennes = { jour: monScoreDuJour(s), entrainement: P.recordDeSonAllure(s) };
  const vue = vueBut(siennes, recordDuJour);
  const mien = vue.sien ?? 0;

  $("murCibleQuoi").textContent =
    vue.cible.source === "jour" ? t("murDuJour") : t("murEntrainement");
  $("murCibleVal").textContent = String(vue.cible.score);
  $("murCibleNote").textContent =
    vue.cible.source === "jour" ? t("murDuJourNote") : t("murEntrainementNote");

  $("murMien").textContent = mien > 0 ? String(mien) : t("murRien");
  /*
   * La JAUGE est décorative, et la phrase dit le même fait en chiffres : rien
   * ne se perd si le mouvement est coupé. Elle est bornée à 1 — un joueur qui
   * dépasse la cible ne doit pas voir une barre qui sort de son cadre.
   */
  const part = vue.cible.score > 0 ? Math.min(1, mien / vue.cible.score) : 0;
  $("murJauge").style.transform = `scaleX(${part.toFixed(3)})`;
  /*
   * ⚠️ LE JEU NE DIT JAMAIS À QUELQU'UN QU'IL EST MOINS BON QUE CE QU'IL FAIT.
   * Au-dessus de la cible, la phrase le constate ; en dessous, elle chiffre ce
   * qui manque, ce qui est une consigne et pas un jugement ; et sans record du
   * tout, elle n'oppose rien — comparer un joueur neuf à 201 est un mur.
   */
  $("murEcart").textContent =
    mien <= 0
      ? t("murPremier")
      : vue.depasse
        ? t("murDevant")
        : t("murManque")(vue.cible.score - mien);

  peintPodium("murPodium", "classement");
}

/**
 * L'invitation de l'écran de fin.
 *
 * Elle ne s'affiche que quand les trois conditions sont réunies : les comptes
 * existent, le joueur n'en a pas, et il y a quelque chose à perdre. Sans la
 * troisième, l'invitation serait une réclame ; avec elle, c'est une
 * information.
 */
function renderInvite(score: number, record: boolean, mesureDemandee = false): void {
  const boite = $("compteInvite");
  const montrer =
    !mesureDemandee && comptesPossibles() && !estConnecte() && !inviteEcartee && score > 0;
  boite.classList.toggle("hidden", !montrer);
  if (!montrer) return;

  // Le CHIFFRE, pas la fonctionnalité. « Créer un compte » est abstrait ;
  // « ce 23 » ne l'est pas.
  const texte = $("compteInviteText");
  texte.innerHTML = record ? t("cptRecordLocal") : t("cptManchesLocal");
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
  return {
    ...s.rule,
    brief: `${nomDeRegle(nouvelle.id, nouvelle.name)} — ${briefDeRegle(nouvelle.id, nouvelle.brief)}`,
  };
}

/* ------------------------------------------------------------------ *
 * CHOISIR SA RÈGLE — entraînement uniquement
 *
 * La boucle que ça referme : on rencontre LE GAUCHER en multijoueur, on se
 * fait massacrer, la règle entre au carnet, on va la travailler seul, on
 * revient. L'entraînement cesse d'être un tutoriel pour devenir un outil.
 *
 * UNE SEULE GRILLE, pas un filtre PLUS une grille : le choix est unique, donc
 * le mécanisme doit l'être. Un sélecteur de source (« rencontrées » /
 * « maîtrisées ») posé à côté d'une grille de règles, ce sont deux façons de
 * répondre à la même question, et l'écran cesse de dire ce qu'il fait.
 *
 * Les règles jamais rencontrées restent VISIBLES et verrouillées. C'est ce qui
 * rend le compteur lisible plutôt que triste — un joueur du premier jour n'a
 * qu'une règle au carnet, et une grille à un seul bouton se lit comme une
 * fonctionnalité cassée, pas comme une progression. Le carnet fait déjà
 * exactement ça avec ses « — — — — » (décision n°7 : on ne brûle pas la
 * surprise du run du jour).
 * ------------------------------------------------------------------ */
function renderPick(): void {
  const s = P.load();
  const boite = $("briefPick");
  const grille = $("pickGrid");
  grille.innerHTML = "";

  /*
   * RIEN À CHOISIR ? PAS DE SÉLECTEUR.
   *
   * Un joueur qui n'a encore rencontré aucune règle voyait douze barres
   * censurées, un seul bouton actif, et une ligne qui lui disait d'aller
   * débloquer des règles ailleurs. Trois défauts d'un coup :
   *
   *   · un sélecteur à une seule option n'est pas un sélecteur — c'est
   *     exactement la « fonctionnalité cassée » que la grille visible était
   *     censée éviter, retournée contre elle-même ;
   *   · la ligne MENTAIT : c'est l'entraînement LUI-MÊME qui débloque une
   *     règle, en la jouant. L'envoyer ailleurs était faux, et faux au pire
   *     endroit — l'entraînement est le mode vers lequel on pousse les
   *     nouveaux (« COMMENCE ICI · TU NE PERDS RIEN ») ;
   *   · « 0 / 12 DÉCOUVERTES » comme toute première chose lue.
   *
   * Le seuil est UN : dès qu'une règle est au carnet, choisir « celle que je
   * viens de me prendre » est exactement la boucle qu'on cherche à créer.
   */
  /*
   * DEUX COMPTAGES, parce que ce sont DEUX QUESTIONS.
   *
   *   · `jouables` — « y a-t-il quelque chose à choisir ICI ? » Une règle
   *     rencontrée sur un PC puis descendue par le compte sur un téléphone
   *     (LA MAIN GAUCHE, qui demande de tenir ESPACE) n'y est pas jouable :
   *     compter les rencontrées rouvrirait la grille sur une seule barre
   *     censurée et un bouton, le défaut qu'on vient de corriger.
   *
   *   · `rencontrees` — « où j'en suis dans le catalogue ? » Celui-là ignore
   *     l'appareil, comme le carnet : une règle découverte l'est pour de bon.
   *
   * Les avoir confondus donnait une ligne absurde — « 3 DÉCOUVERTES ·
   * 3 MAÎTRISÉES » avec quatre règles au carnet, et à un cran de plus on
   * pouvait afficher PLUS de maîtrisées que de découvertes.
   */
  const jouables = ONE_RULES.filter((r) => !!s.encountered[r.id] && estJouableIci(r)).length;
  if (jouables === 0) {
    boite.classList.add("hidden");
    return;
  }
  const rencontrees = ONE_RULES.filter((r) => !!s.encountered[r.id]).length;

  const puce = (
    libelle: string,
    opts: { on: boolean; verrou?: boolean; maitrisee?: boolean; aria?: string; sur?: () => void },
  ): void => {
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "pick__chip" +
      (opts.on ? " is-on" : "") +
      (opts.verrou ? " is-locked" : "") +
      (opts.maitrisee ? " is-mastered" : "");
    b.textContent = libelle;
    b.disabled = !!opts.verrou;
    if (opts.aria) b.setAttribute("aria-label", opts.aria);
    b.setAttribute("aria-pressed", opts.on ? "true" : "false");
    if (opts.sur) b.addEventListener("click", opts.sur);
    grille.appendChild(b);
  };

  const choisit = (id: string | null): void => {
    sfx.ui();
    P.mutate((st) => {
      st.trainingRegle = id;
    });
    // Rouvrir le brief plutôt que repeindre à la main : c'est lui qui décide
    // du nom, du texte, de l'avertissement de touche maintenue et du bouton.
    openBrief("training");
  };

  puce(t("pickAleatoire"), {
    on: s.trainingRegle === null,
    sur: () => choisit(null),
  });

  let maitrisees = 0;
  for (const r of ONE_RULES) {
    const rec = s.encountered[r.id];
    const nom = nomDeRegle(r.id, r.name);
    const maitrisee = estMaitrisee(r, rec);
    if (maitrisee) maitrisees++;
    /*
     * Une règle rencontrée mais injouable ici — LA MAIN GAUCHE sur un
     * téléphone — reste VERROUILLÉE plutôt que d'être masquée : la faire
     * disparaître du compteur ferait croire à un carnet incomplet, et
     * l'afficher cliquable promettrait une partie qu'on ne peut pas jouer.
     */
    const dispo = !!rec && estJouableIci(r);
    puce(dispo ? nom : t("pickVerrouille"), {
      on: s.trainingRegle === r.id,
      verrou: !dispo,
      maitrisee,
      aria: dispo ? nom : undefined,
      sur: dispo ? () => choisit(r.id) : undefined,
    });
  }

  $("pickCount").textContent = t("pickCompte")(rencontrees, ONE_RULES.length, maitrisees);

  /*
   * L'aide dit ce qu'il RESTE à faire, pas ce qui est fait.
   *
   * « MAÎTRISÉE » se lit sur la puce ; ce qu'un joueur cherche à savoir, c'est
   * combien il lui manque. Et sur une règle qui piège, ce qui manque le plus
   * souvent n'est pas des manches — c'est le piège lui-même, qui est
   * précisément ce que l'entraînement doit apprendre.
   */
  const choisieMaintenant = s.trainingRegle
    ? ONE_RULES.find((r) => r.id === s.trainingRegle)
    : undefined;
  const aide = $("pickHint");
  if (!choisieMaintenant) {
    aide.textContent = t("pickAideAleatoire");
  } else if (estMaitrisee(choisieMaintenant, s.encountered[choisieMaintenant.id])) {
    aide.textContent = t("pickMaitrisee");
  } else {
    const reste = resteAMaitriser(choisieMaintenant, s.encountered[choisieMaintenant.id]);
    const bouts: string[] = [];
    if (reste.manches > 0) bouts.push(t("pickResteManches")(reste.manches));
    if (reste.piege) bouts.push(t("pickRestePiege"));
    // « MAÎTRISÉE : 6 MANCHES » se lisait comme un constat — le mot d'état en
    // tête d'une ligne qui énonce ce qui MANQUE. L'intitulé dit donc l'intention.
    aide.textContent = bouts.length
      ? t("pickPourMaitriser")(bouts.join(" · "))
      : t("pickAideChoisie")(nomDeRegle(choisieMaintenant.id, choisieMaintenant.name));
  }

  boite.classList.remove("hidden");
}

/* ------------------------------------------------------------------ *
 * Lancement d'un run
 * ------------------------------------------------------------------ */
function openBrief(mode: Mode): void {
  rafraichitJour();
  const s = P.load();
  pendingMode = mode;
  /*
   * ⚠️ LE PALIER SE CONSOMME ICI, ET NULLE PART AILLEURS.
   *
   * `openBrief` est le passage obligé de tout lancement solo. Y consommer
   * l'armement garantit deux choses d'un coup : un run lancé depuis l'escalier
   * porte son palier, et TOUT autre run — entraînement libre, run du jour,
   * escalade, défi — repart forcément à `null`. Répartir cette remise à zéro
   * sur chaque porte serait la faute du REJOUER muet, à l'identique : la
   * prochaine porte oublierait de la poser.
   */
  palierEnCours = mode === "training" ? palierDemande : null;
  palierDemande = null;

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
    /*
     * LE CHOIX DU JOUEUR D'ABORD, le tirage ensuite.
     *
     * Trois garde-fous avant de l'honorer, et chacun a sa raison : la règle
     * doit exister (une sauvegarde peut nommer une règle retirée du
     * catalogue), avoir été RENCONTRÉE (sinon le verrouillage ne verrouille
     * rien, et il est toute la valeur du dispositif), et être jouable ici —
     * LA MAIN GAUCHE demande de tenir ESPACE, ce qu'un téléphone ne peut pas.
     * Un choix invalide ne bloque personne : on retombe sur le tirage.
     */
    const choisie = s.trainingRegle
      ? ONE_RULES.find(
          (r) =>
            r.id === s.trainingRegle && !!s.encountered[r.id] && estJouableIci(r),
        )
      : undefined;
    pendingRule =
      choisie ??
      trainingRule({
        duJour: ruleOfDay(day).id,
        connues: new Set(Object.keys(s.encountered)),
        derniere: derniereEntrainement,
        sansMaintien: TOUCH_ONLY,
        rng: Math.random,
      });
    derniereEntrainement = pendingRule.id;
  }

  $("briefMeme").classList.toggle("hidden", mode !== "daily");
  {
    const reglage = s.dejoue;
    const bd = $("briefDejoue");
    bd.classList.toggle("hidden", mode !== "training" || !reglage.on);
    bd.textContent = t("briefDejoue")(TOUCH_ONLY ? null : reglage.touche);
  }
  $("briefEyebrow").textContent =
    mode === "daily" ? t("modeDaily")(day) : mode === "escalade" ? t("modeEscalade") : t("modeTraining");
  $("briefName").textContent =
    mode === "escalade" ? t("briefUneDePlus") : nomDeRegle(pendingRule.id, pendingRule.name);
  $("briefText").textContent =
    mode === "escalade"
      ? t("briefEscalade")(PALIER)
      : briefDeRegle(pendingRule.id, pendingRule.brief);

  // La grille ne vit QUE sur l'entraînement : le run du jour et l'escalade
  // n'offrent aucun choix de règle, et en montrer un là serait un mensonge.
  if (mode === "training") renderPick();
  else $("briefPick").classList.add("hidden");

  /*
   * LES TROIS CHIFFRES DU RUN DU JOUR.
   *
   * Ils REMPLACENT la ligne « 40 manches » plutot que de s'y ajouter : le
   * brief est une annonce, pas un tableau de bord.
   *
   * ⚠️ ECHAUFFEMENT est celui qui manquait. Mesure : 76 morts a la manche 3
   * sur 572 runs, plus du double de n'importe quelle autre manche — pendant
   * trois manches on APPREND au joueur que se tromper ne coute rien, puis le
   * message disparait en silence et la manche suivante tue. Le dire avant vaut
   * mieux que le decouvrir en mourant.
   */
  const stats = $("briefStats");
  stats.classList.toggle("hidden", mode !== "daily");
  if (mode === "daily") {
    stats.innerHTML = "";
    const vj = vueDuJour(s, day);
    for (const [val, lab] of [
      [String(DAILY_LENGTH), t("briefLongueur")],
      [`${vj.restants} / ${DAILY_ESSAIS}`, t("briefEssais")],
      [String(GRACE_ROUNDS), t("briefEchauffement")],
    ] as const) {
      const cel = document.createElement("div");
      cel.className = "briefstats__cel";
      cel.innerHTML = `<b class="briefstats__val"></b><span class="briefstats__lab"></span>`;
      cel.querySelector<HTMLElement>(".briefstats__val")!.textContent = val;
      cel.querySelector<HTMLElement>(".briefstats__lab")!.textContent = lab;
      stats.appendChild(cel);
    }
  }

  const warn = $("briefWarn");
  const hold = mode !== "escalade" && pendingRule.watchRelease === " ";
  const lines: string[] = [];
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

  /*
   * LA JOURNÉE CLOSE VERROUILLE AUSSI LE BRIEF.
   *
   * `vueDuJour().verrouille` était appliqué sur `#btnDaily` (l'écran SOLO) et
   * sur `#btnAgain` (l'écran de fin), mais PAS ici — or `navDaily` ouvre ce
   * brief directement, sans passer par l'un ni l'autre. Le quatrième essai
   * partait donc par la barre du bas, avec « 0 / 3 ESSAIS » affiché juste
   * au-dessus d'un COMMENCER parfaitement actif.
   *
   * Mesuré en jouant les trois essais : le brief s'ouvrait, le bouton lançait,
   * la manche démarrait.
   *
   * C'est la même faute que le REJOUER muet, à l'envers : là un bouton
   * promettait ce que la fonction refusait, ici il autorise ce que la règle
   * interdit. Le garde-fou appartient au point de passage COMMUN — le brief —
   * et non à chacune des portes qui y mènent, dont la prochaine oubliera de le
   * poser.
   */
  const closeJour = mode === "daily" && !challenge && vueDuJour(s, day).verrouille;
  const go = $<HTMLButtonElement>("btnGo");
  go.disabled = closeJour;
  if (closeJour) go.textContent = t("goReviensDemain");

  renderPace();
  show("brief");
}


/** Vrai dès que la fin de l'échauffement a été annoncée, pour ce run-là. */
let finEchauffementDite = false;

/*
 * CE QUE LE DERNIER RUN A ÉTÉ — retenu pour l'écran de fin et pour la carte.
 *
 * `palierEnCours` reste posé jusqu'au prochain `openBrief`, mais s'y fier
 * depuis l'écran de fin ferait dépendre l'affichage d'un état qu'un autre
 * chemin peut effacer entre-temps. On fige les deux valeurs au moment où le
 * run se termine, comme `lastRun` fige déjà le reste — c'est la même leçon que
 * « une valeur mémorisée doit l'être à un instant où l'on sait ce qu'elle
 * vaut ».
 */
let palierDuDernierRun: ESC.Palier | undefined;
let avanceDuRun = 0;

/**
 * LE BATTEMENT DE LECTURE, entre COMMENCER et la première consigne.
 *
 * Mesuré avant : **50 ms**. Le joueur cliquait, et l'instant d'après une
 * consigne lui demandait d'agir en moins d'une seconde et demie, sa règle
 * réduite à trois mots dans le bandeau. Rapporté comme « jeté dans la fosse
 * aux lions ». Le multijoueur avait déjà résolu ça (`COUNTDOWN_MS`, « c'est le
 * temps de LIRE sa règle ») ; le solo n'avait rien.
 *
 * ⚠️ Il est porté par la BOUCLE DE JEU, pas par un `setTimeout`. Deux raisons :
 * le filet de `smoke.test.ts` déroule des frames et ne verrait jamais une
 * minuterie, et une minuterie continuerait de courir sur un onglet qui ne
 * compose pas — le joueur reviendrait sur un run déjà commencé sans lui.
 *
 * Le joueur reste sur le BRIEF pendant ce temps : sa règle y est déjà en grand
 * avec son explication. Aucun panneau de plus à entretenir, et comme le brief
 * est un écran de menu, `fieldRect()` n'est pas touché (décision n°10).
 */
let lecture: { jusqua: number; maintien: boolean; libelle: string } | null = null;

/**
 * @param avecLecture Faux pour une REVANCHE de duel, qui repart de l'écran de
 * fin sans repasser par le brief : y faire courir un rebours poserait le
 * décompte sur un bouton invisible, donc une pause de plusieurs secondes où
 * l'écran ne dit rien. Le joueur vient de jouer cette règle exacte — il n'a
 * rien de neuf à lire.
 */
function startRun(avecLecture = true): void {
  if (!pendingRule) return;
  /*
   * ⚠️ Un second appel pendant le battement le RELANCERAIT.
   *
   * ESPACE et ENTRÉE lancent aussi depuis le brief, et rien n'empêche d'appuyer
   * pendant le rebours. Le second appel relirait `bouton.textContent` pour
   * mémoriser le libellé — sauf qu'il vaut alors « 3 ». Le bouton COMMENCER
   * serait remplacé par un chiffre, et le resterait.
   */
  if (lecture) return;
  /*
   * NAVIGATEUR NEUF + COMPTE : la sync n'a pas encore écrit les essais.
   *
   * `demarreCompte` est lancé sans être attendu — c'est juste pour
   * l'accueil et le salon (n°12). Le run du jour, lui, se compare : on
   * attend que le compte ait parlé, puis on relance. Un échec réseau
   * pose `compteBootFini` quand même, et on joue en local.
   */
  if (
    pendingMode === "daily" &&
    !challenge &&
    !ranked &&
    estConnecte() &&
    !compteBootFini &&
    bootCompte
  ) {
    if (attenteCompte) return;
    attenteCompte = true;
    $<HTMLButtonElement>("btnGo").disabled = true;
    void bootCompte.finally(() => {
      attenteCompte = false;
      startRun(avecLecture);
    });
    return;
  }
  if (jourDuRunClos()) {
    openBrief("daily");
    return;
  }
  if (pendingRule.watchRelease === " " && !spaceDown) {
    $("briefWarn").textContent = t("briefEspace");
    $("briefWarn").classList.remove("hidden");
    return;
  }
  unlock();
  if (!avecLecture) {
    lanceRun();
    return;
  }
  const s = P.load();
  const bouton = $<HTMLButtonElement>("btnGo");
  bouton.disabled = true;
  bouton.classList.add("btn--lecture");
  lecture = {
    // La règle du BRIEF, et elle seule. En escalade, celles qui s'ajoutent
    // ensuite ont déjà leur annonce en jeu (`regleAjoutee`), et la pile n'est
    // tirée qu'au lancement — la recalculer ici la ferait diverger du run.
    jusqua: performance.now() + tempsDeLecture(pendingRule, s),
    maintien: pendingRule.watchRelease === " ",
    // On MÉMORISE le libellé plutôt que de le recalculer : trois endroits
    // l'écrivent (entraînement, maintien, défi), et un quatrième calcul
    // finirait par diverger des trois autres.
    libelle: bouton.textContent ?? "",
  };
  majLecture(performance.now());
}

/** Le rebours à l'écran, et le départ quand il tombe à zéro. */
function majLecture(now: number): void {
  if (!lecture) return;
  /*
   * ⚠️ Une règle à MAINTIEN se surveille pendant le battement.
   *
   * LA MAIN GAUCHE demande de tenir ESPACE. Le contrôle se faisait au clic ;
   * avec trois secondes d'attente, on peut relâcher entre-temps et entrer en
   * partie sans maintien — donc mourir sur-le-champ sans comprendre.
   */
  if (lecture.maintien && !spaceDown) {
    annuleLecture();
    $("briefWarn").textContent = t("briefEspace");
    $("briefWarn").classList.remove("hidden");
    return;
  }
  const reste = lecture.jusqua - now;
  if (reste <= 0) {
    const b = $<HTMLButtonElement>("btnGo");
    b.disabled = false;
    b.classList.remove("btn--lecture");
    /*
     * ⚠️ ON REND SON LIBELLE AU BOUTON — LA FIN NORMALE L'OUBLIAIT.
     *
     * Seul `annuleLecture` le restituait, c'est-a-dire seulement sur une sortie
     * PREMATUREE. Un rebours mene a son terme laissait donc « 1 » sur le
     * bouton, pour de bon. Releve en deroulant la boucle image par image :
     *
     *     brief:START | +800ms:3 | +1600ms:2 | +2400ms:1 | +3200ms:1 (en jeu)
     *
     * Invisible pendant la partie — le brief est masque — et efface au brief
     * suivant, puisque `openBrief` reecrit le libelle. D'ou une panne qui ne se
     * declenche que par un chemin : lancer, laisser le rebours finir, revenir
     * au brief, relancer, puis ECHAP pendant CE rebours-la. `startRun` avait
     * memorise `bouton.textContent` — qui valait « 1 » — et `annuleLecture`
     * le restituait fidelement. Bouton bloque sur un chiffre.
     *
     * C'est la meme racine que le bug deja documente sur ESPACE : celui-la
     * avait ete ferme du cote de l'appel en trop, pas du cote de la cause. La
     * regle du depot le disait pourtant — « une valeur memorisee doit l'etre a
     * un instant ou l'on sait ce qu'elle vaut ». On garantit donc qu'au repos
     * le bouton ne porte JAMAIS un chiffre, ce qui rend la memorisation
     * toujours vraie.
     */
    b.textContent = lecture.libelle;
    lecture = null;
    lanceRun();
    return;
  }
  $("btnGo").textContent = String(Math.ceil(reste / 1000));
}

/** Retour au brief sans lancer : sortie d'écran, ou maintien relâché. */
function annuleLecture(): void {
  if (!lecture) return;
  const { libelle } = lecture;
  lecture = null;
  const b = $<HTMLButtonElement>("btnGo");
  b.disabled = false;
  b.classList.remove("btn--lecture");
  b.textContent = libelle;
}

function lanceRun(): void {
  if (!pendingRule) return;
  /*
   * Un onglet laissé sur le brief après minuit UTC ne doit plus lancer
   * la graine d'hier. On relit le jour ICI, et on aligne la règle sur
   * la graine — sinon le brief dirait LE SANG et le run jouerait LA POINTE.
   */
  if (pendingMode === "daily" && !challenge && !ranked) {
    rafraichitJour();
    pendingRule = regleJouableIci(ruleOfDay(day));
    /*
     * ⚠️ LE POINT DE PASSAGE COMMUN. La lecture a pu durer 3 s, pendant
     * lesquelles la sync recollait « 0 / 3 ». Sans cette garde, le
     * rebours mènerait un quatrième essai. `startRun` a déjà refusé
     * avant le battement ; on refuse encore ICI, parce que la REVANCHE
     * et la fin du rebours arrivent sans y repasser.
     */
    if (vueDuJour(P.load(), day).verrouille) {
      openBrief("daily");
      return;
    }
  }
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
   * LE RECORD D'AVANT, photographié au lancement.
   *
   * Le pied compare le score courant à ce chiffre pour annoncer le
   * dépassement en direct. Le lire à chaque image donnerait le même résultat
   * aujourd'hui — `majCarnet` n'écrit qu'à la fin du run — mais ferait
   * dépendre l'annonce d'un détail d'ordonnancement qui peut changer. Une
   * photo dit ce qu'on compare.
   */
  recordAvantRun =
    pendingMode === "daily" ? (s.daily.score ?? 0) : P.recordDeSonAllure(s);
  pastilleDite = false;
  /**
   * Le palier joué par ce run, s'il y en a un. Lu une fois, utilisé partout.
   *
   * ⚠️ UN DÉFI ET UN MATCH CLASSÉ N'EN ONT JAMAIS, quoi qu'il reste d'armé.
   * `openBrief` remet `palierEnCours` à zéro sur tout autre lancement — mais
   * la REVANCHE d'un duel appelle `startRun(false)` directement depuis l'écran
   * de fin, sans repasser par le brief. Sans cette garde, enchaîner un palier
   * puis un duel ferait jouer le duel sur la longueur et la cadence du palier,
   * c'est-à-dire une partie qui ne se compare plus à celle de l'adversaire —
   * le seul défaut que ce dépôt tient pour fatal.
   */
  const palier =
    challenge || ranked || palierEnCours === null ? undefined : ESC.palierN(palierEnCours);
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
    /*
     * L'ALLURE D'UN PALIER PRIME SUR LA PRÉFÉRENCE DU JOUEUR.
     *
     * C'est le sens même de la montée : le palier 11 EST le passage à × 1,0.
     * La laisser au réglage global rendrait quatre volées identiques et
     * viderait l'escalier de sa moitié.
     */
    pace: challenge ? PACE_DEFAULT : (palier?.allure ?? s.trainingPace),
    pile,
    // Les deux leviers du palier. Absents ailleurs — donc `maxRounds` et
    // `buildRound` répondent exactement ce qu'ils répondaient hier.
    longueur: palier?.manches,
    forcePiege: palier ? (l) => ESC.piegeIci(palier, l) : undefined,
    /*
     * DÉJOUER — entraînement seulement, et jamais sur un défi : un duel rejoue
     * la graine d'un autre, et la lettre réservée changerait ses manches. La
     * `Session` refuse d'elle-même tous les autres modes.
     */
    dejoue: !challenge && !ranked && s.dejoue.on,
    toucheDejoue: s.dejoue.touche,
  });
  finEchauffementDite = false;
  hud.setRule(session.rule);
  peintPuces(session);
  hud.hideStamp();
  hud.setFooter(
    0,
    pendingMode === "daily"
      ? DAILY_LENGTH
      : pendingMode === "escalade"
        ? // Le chiffre de droite est ce qu'on VISE : le plafond de règles.
          PALIER_MAX
        : // Sur un palier, ce qu'on vise est le palier — pas son record
          // d'entraînement, qui a été fait à une autre allure et sans cadence.
          (palier?.manches ?? P.recordDeSonAllure(s)),
    pendingMode === "daily" ? t("piedDaily")(day) : pendingMode === "escalade" ? t("modeEscalade") : t("modeTraining"),
    pendingMode === "daily" ? t("piedSur") : pendingMode === "escalade" ? t("piedRegles") : t("piedRecord"),
  );
  $("ghost").classList.toggle("hidden", !challenge);
  show(null);
  /*
   * LA CARTE EST POSEE AVANT LA PREMIERE MANCHE, PAS PENDANT.
   *
   * `majGouttieres()` ne tournait qu'au CHANGEMENT de manche (`key !==
   * lastRoundKey`), et `lastRoundKey` vient d'etre remis a vide : la gouttiere
   * apparaissait donc a la premiere manche, c'est-a-dire une fois la partie
   * lancee et le chrono parti. Rapporte en soiree : « souvent la carte
   * apparait APRES que la partie ait commence, ca change la dimension et c'est
   * tres perturbant ».
   *
   * L'appeler ici la pose pendant que l'ecran s'ouvre, avant que la moindre
   * consigne s'affiche. La geometrie du champ est donc etablie AVANT le premier
   * geste — et c'est tout ce qui compte, puisque la taille du champ est du
   * gameplay (n°10).
   *
   * Rien n'est calcule deux fois : la boucle ne rappellera `majGouttieres()`
   * qu'au changement de manche, comme avant.
   */
  majGouttieres();
  poseDejoue();
  sfx.runStart();
  musicApi.start();
  // `duel` distingue un défi relevé d'un entraînement ordinaire : les deux
  // arrivent ici en mode "training", et sans ce drapeau le dernier cran de
  // l'entonnoir social est illisible.
  track("run_start", { mode: pendingMode, rule: pendingRule.id, day, duel: !!challenge });
}

/* ------------------------------------------------------------------ *
 * LA BARRE DE NAVIGATION — cinq destinations, JOUER au milieu
 *
 * JOUER est surélevée parce que c'est la réponse par défaut : elle ne doit pas
 * se chercher. Les quatre autres sont des détours qu'on prend en connaissance
 * de cause.
 * ------------------------------------------------------------------ */

/** Ce que la barre annonce, recalculé à chaque changement d'écran. */
/*
 * LA BARRE REMONTE SUR LARGE — et c'est un DÉPLACEMENT, pas un doublon.
 *
 * Sur téléphone, la navigation est une barre BASSE : hors flux dans `#app`,
 * donc elle ne peut pas rogner le terrain, et elle reste sous le pouce. Sur
 * écran large elle rejoint la barre du haut, à côté de l'enseigne — c'est la
 * vue 22/27, et c'est aussi la seule place qui ne coûte rien à la hauteur, la
 * ressource rare du bureau (mesuré : la faille finissait à 906 pour 860).
 *
 * ⚠️ UN SEUL JOUER, ET UN SEUL DE CHAQUE. On DÉPLACE les mêmes éléments, on
 * n'en déclare pas une seconde série pour le bureau. Deux rendus du même
 * bouton, ce sont deux gestionnaires à garder d'accord — et le jour où l'un
 * change, l'autre ment. C'est la faute du « filtre PLUS la grille ».
 *
 * `.nav__centre` (JOUER et « ta règle t'attend ») sort du `#nav` pour se poser
 * APRÈS le compte, à droite : c'est l'ordre de la maquette, et il ne
 * s'obtiendrait pas par `order` puisque les deux vivent dans des parents
 * différents.
 *
 * Idempotent : on ne touche au DOM que si le parent n'est pas déjà le bon.
 * Même précaution que `show()`, qui reparente déjà `#topbar` à chaque écran.
 */
const LARGE = window.matchMedia?.("(min-width: 900px)") ?? null;

function poseBarre(): void {
  const large = LARGE?.matches ?? false;
  const nav = $("nav");
  const centre = document.querySelector<HTMLElement>(".nav__centre");
  const rangee = document.querySelector<HTMLElement>(".topbar__row");
  const gauche = document.querySelector<HTMLElement>(".topbar__left");
  const droite = document.querySelector<HTMLElement>(".topbar__right");
  if (!centre || !rangee || !gauche || !droite) return;

  if (large) {
    /*
     * ⚠️ TROIS ENFANTS DANS LA RANGÉE, PAS QUATRE. Elle est une grille
     * `auto 1fr auto` : un quatrième enfant se replie sur une seconde ligne et
     * la barre passe de 56 à 110 px de haut — mesuré, avec le JOUER remonté
     * au-dessus du cadre. `.topbar__left` déménage donc dans le groupe de
     * droite plutôt que de rester un enfant de plus.
     *
     * Et c'est l'ORDRE DU DOCUMENT qui place — enseigne, destinations, le
     * reste. Aucun `order` : le dépôt en a déjà payé deux.
     */
    if (nav.parentElement !== rangee || nav.nextElementSibling !== droite) {
      rangee.insertBefore(nav, droite);
    }
    if (gauche.parentElement !== droite) droite.insertBefore(gauche, droite.firstChild);
    if (centre.parentElement !== droite) droite.appendChild(centre);
  } else {
    if (nav.parentElement !== appEl) appEl.insertBefore(nav, appEl.firstChild);
    if (gauche.parentElement !== rangee) rangee.insertBefore(gauche, rangee.firstChild);
    if (centre.parentElement !== nav) {
      // Au milieu des cinq : c'est la grille `1fr 1fr 82px 1fr 1fr` qui le
      // place, donc il doit revenir à son rang exact.
      nav.insertBefore(centre, nav.children[2] ?? null);
    }
  }
  appEl.classList.toggle("barre-haute", large);
}

/*
 * ⚠️ DEUX DECLENCHEURS, ET AUCUN N'EST DE TROP.
 *
 * `matchMedia` est le bon signal — il ne se declenche qu'au franchissement du
 * seuil. Mais il ne suffit pas : mesure dans le volet, un changement de
 * viewport peut ne PAS emettre l'evenement, et surtout `show()` — l'autre
 * chemin — n'est pas appele quand on redimensionne une fenetre. Un joueur qui
 * reduit son navigateur garderait la barre en haut, sans barre basse et sans
 * JOUER sous le pouce.
 *
 * Le second declencheur est sans risque : `poseBarre` est idempotente, elle ne
 * touche au DOM que si le parent n'est pas deja le bon. Et elle ne decide
 * jamais sur une grandeur qu'elle modifie — le parent d'un noeud hors flux ne
 * change pas la largeur de la fenetre, donc pas d'oscillation possible.
 */
LARGE?.addEventListener("change", () => poseBarre());
window.addEventListener("resize", () => poseBarre());

function majNav(): void {
  const s = P.load();
  const vue = vueDuJour(s, day);

  // MULTI se grise plutôt que de disparaître : un trou dans une barre de
  // cinq se lit comme une panne, un bouton éteint se lit comme un état.
  $<HTMLButtonElement>("navMulti").disabled = !multi.available;

  /*
   * La pastille du run du jour : il reste quelque chose à y faire aujourd'hui.
   *
   * Elle s'éteint dès que le run est TERMINÉ ou les essais épuisés — c'est la
   * même vue que la carte SOLO, donc les deux ne peuvent pas se contredire.
   */
  $("navDaily").classList.toggle("a-faire", !vue.acquis && !vue.verrouille);
  /*
   * Le COMPTEUR de cartes et la PASTILLE du jour vivent dans la destination
   * elle-meme (`CARTES 7/16`, `DAILY •`), comme dans la source de la maquette.
   * Ils ne paraissent qu'en large : dans la barre basse, une case n'a pas la
   * place d'un second mot.
   */
  const vues = ONE_RULES.filter((r) => !!s.encountered[r.id]).length;
  $("navCartesCompte").textContent = `${vues}/${ONE_RULES.length}`;
  $("navDailyPoint").textContent = !vue.acquis && !vue.verrouille ? "•" : "";

  // « TA RÈGLE T'ATTEND » n'a de sens que pour qui a déjà une règle au carnet :
  // à zéro, il n'y a rien qui attende, et la phrase promettrait du vide.
  const aUneRegle = ONE_RULES.some((r) => !!s.encountered[r.id]);
  $("navAttend").textContent = aUneRegle ? t("navAttend") : "";

  // La destination courante se lit, comme dans la maquette. FICHE reste
  // sous CARTES ou TRAINING selon le cadre qui l'a ouverte.
  const sousCodex = screen === "codex" || screen === "fiche";
  $("navCartes").classList.toggle("is-on", sousCodex);
  $("navDaily").classList.toggle(
    "is-on",
    (screen === "brief" || screen === "over") && pendingMode === "daily",
  );
  $("navMulti").classList.toggle(
    "is-on",
    screen === "multi-join" ||
      screen === "multi-id" ||
      screen === "multi-lobby" ||
      screen === "multi-end",
  );
  $("navClassement").classList.toggle("is-on", screen === "classement");
}

$("navCartes").addEventListener("click", () => {
  sfx.ui();
  ouvreCodex("collection", "nav");
});

$("navClassement").addEventListener("click", () => {
  sfx.ui();
  renderClassement();
  show("classement");
});

$("navJouer").addEventListener("click", () => {
  sfx.ui();
  // La MÊME porte que JOUER sur l'accueil, première arrivée comprise : deux
  // chemins vers la première partie finiraient par diverger.
  if (estNouveau()) {
    ouvreOnboarding();
    return;
  }
  openBrief("training");
});

$("navDaily").addEventListener("click", () => {
  sfx.ui();
  openBrief("daily");
});

$("navMulti").addEventListener("click", () => {
  sfx.ui();
  $("btnMulti").dispatchEvent(new MouseEvent("click", { bubbles: true }));
});

/* ------------------------------------------------------------------ *
 * LA FICHE D'UNE CARTE — rendre la maîtrise ACTIONNABLE
 *
 * « 3 / 6 » dit où l'on en est ; « il te manque 4 manches à l'allure normale »
 * dit quoi faire. C'est toute la différence entre un thermomètre et une liste
 * de courses, et c'est pourquoi la jauge n'est pas un pourcentage.
 * ------------------------------------------------------------------ */

/**
 * LE RECORD DU RUN DU JOUR, tenu une fois pour la session.
 *
 * Il vient du classement — donc vérifié par le serveur, qui a rejoué le
 * journal — et il change chaque jour. C'est la meilleure cible qu'on puisse
 * donner : vivante, opposable, et bien plus atteignable qu'un record de tous
 * les temps.
 */
let recordDuJour: number | null = null;
/** Horodatage du dernier appel ABOUTI — voir `rafraichitClassement`. */
let recordDuJourVu = 0;
/** La demande EN VOL, partagee — voir `rafraichitClassement`. */
let demandeClassement: Promise<void> | null = null;

/**
 * Au-dela de ce delai, le classement est redemande a l'ouverture d'un ecran
 * qui l'affiche. Trente secondes : assez court pour qu'un run qu'on vient de
 * poser apparaisse en revenant, assez long pour qu'aller-retourner entre deux
 * ecrans ne fasse pas une requete par clic.
 */
const FRAICHEUR_CLASSEMENT_MS = 30_000;

/**
 * ⚠️ LE CLASSEMENT SE REDEMANDE. IL NE SE DEMANDAIT QU'UNE FOIS.
 *
 * SYMPTOME RAPPORTE : « le classement ne se met pas a jour, ni pour le compte
 * ni pour le classement ».
 *
 * LA CAUSE, exactement : l'ancien code posait un drapeau
 * `recordDuJourDemande` a la PREMIERE peinture de l'accueil et ne le levait
 * jamais. Or la condition etait `recordDuJour === null && !demande` — donc
 * quand la reponse revenait VIDE, ce qui est le cas tous les matins avant que
 * quiconque ait joue, le cache restait nul ET le drapeau restait pose. Plus
 * aucune demande de toute la session.
 *
 * Enchainement vecu : on ouvre le jeu le matin, personne n'a joue, on joue son
 * run du jour, il part au serveur, il est accepte — et l'accueil continue
 * d'afficher « PERSONNE N'A ENCORE JOUE » et le mur son repli d'entrainement,
 * jusqu'au rechargement de la page.
 *
 * Et le MUR ne demandait rien du tout : il lisait ce cache sans jamais le
 * remplir, donc il n'affichait le classement que si l'accueil l'avait obtenu
 * avant lui.
 *
 * `force` sert aux evenements qui RENDENT le cache faux : une performance
 * acceptee, une connexion. La fraicheur sert au reste.
 */
/**
 * ⚠️ CE QUE LE SERVEUR A FAIT DU RUN, DIT AU JOUEUR.
 *
 * SYMPTOME RAPPORTE : « les records des run du jour ne sont toujours pas
 * synchronises, un joueur a fait 40 mais le systeme ne s'est pas mis a jour ».
 * Sa capture le montre : « 34 aujourd'hui » a l'ecran — son score LOCAL — et
 * « meilleur run du jour : 23 » juste en dessous, qui vient du serveur.
 *
 * Les deux chemins d'echec de la soumission etaient MUETS. Un refus 4xx
 * faisait jeter l'entree de la file sans laisser de trace, et un
 * `enregistre: false` revenait dans une reponse 200 que personne ne lisait.
 * Un score pouvait donc se perdre sans que ni le joueur ni nous ne puissions
 * le savoir — et une perte silencieuse ne se signale pas, donc ne se corrige
 * jamais.
 *
 * On ne cache plus rien : accepte, on rafraîchit le classement ; un vrai
 * refus (4xx, journal invalide, jour trop ancien), on le DIT. Un 200
 * `enregistre: false` — `posePerf` n'améliore pas — est silencieux : ce
 * n'est pas une perte, le meilleur est déjà en base. On rafraîchit quand
 * même le classement pour l'afficher.
 */
function traiteEnvois(resultats: readonly Resultat[]): void {
  if (!resultats.length) return;
  const perdus = resultats.filter(estRefusReel);
  for (const r of perdus) {
    track("perf_refusee", { raison: r.refus ?? "?", score: r.score });
  }
  if (perdus.length) {
    montreToast(t("perfRefusee"), perdus[0]!.refus ?? "", 3200);
  }
  /*
   * Un run accepté rend le classement faux. Un 200 `enregistre: false`
   * aussi : le meilleur est déjà en base, et c'est LUI qu'il faut afficher.
   * Un vrai refus (4xx), lui, n'a rien posé.
   */
  if (resultats.some((r) => r.enregistre || !estRefusReel(r))) {
    void rafraichitClassement(true);
  }
}

async function rafraichitClassement(force = false): Promise<void> {
  if (!force && Date.now() - recordDuJourVu < FRAICHEUR_CLASSEMENT_MS) return;
  /*
   * ⚠️ ON PARTAGE LA PROMESSE EN VOL, on ne pose pas un booleen.
   *
   * Mesure : avec un simple drapeau, trois ouvertures du mur produisaient
   * CINQ requetes, par paires a 1 et 3 ms d'ecart. Un booleen leve dans un
   * `finally` ne protege pas de deux entrees dans le meme lot de
   * microtaches — et repeindre l'ecran rappelle la fonction, donc les
   * occasions ne manquent pas.
   *
   * Rendre la promesse elle-meme fait attendre le second appelant au lieu de
   * lancer une seconde requete, et la fraicheur mesure alors quelque chose de
   * vrai.
   */
  if (demandeClassement) return demandeClassement;
  demandeClassement = (async () => {
    const c = await classementDuJour(day);
    // ⚠️ On note l'heure meme quand la reponse est VIDE : sans compte
    // configure elle le sera toujours, et redemander a chaque peinture
    // enverrait une requete par changement d'ecran pour rien.
    recordDuJourVu = Date.now();
    const top = c?.top?.[0]?.valeur ?? null;
    recordDuJour = top !== null && top > 0 ? top : null;
    // On repeint l'ecran qui l'affiche, et lui seul.
    if (screen === "home") peintBut(monScoreDuJour(P.load()), recordDuJour);
    else if (screen === "classement") renderClassement();
  })().finally(() => {
    demandeClassement = null;
  });
  return demandeClassement;
}

/**
 * Jette le record du jour en memoire pour qu'il soit redemande.
 *
 * Appele apres un run du jour : c'est le seul moment ou la valeur affichee peut
 * etre devenue fausse, puisque le run qu'on vient de finir a pu prendre la tete.
 * Le rechargement lui-meme n'a pas lieu ici — il se fera au prochain rendu de
 * l'accueil, la ou il ne retarde rien.
 */
function oublieRecordDuJour(): void {
  recordDuJour = null;
  recordDuJourVu = 0;
}

/*
 * ⚠️ `regleQuiResiste` A ÉTÉ SUPPRIMÉE : elle ne servait qu'à l'ancien accueil.
 *
 * Le CARNET a sa propre désignation de « celle qui te résiste », calculée sur
 * place et avec un seuil à elle (deux runs, sans quoi une règle croisée une
 * fois passerait pour un échec). Garder la seconde aurait laissé deux formules
 * pour une même question — et ce dépôt a déjà payé trois fois la divergence de
 * deux formules dont une seule tournait.
 */

/*
 * ⚠️ `peintEtat` A ÉTÉ SUPPRIMÉE AVEC L'ANCIEN ACCUEIL.
 *
 * Elle peignait la colonne latérale du desktop : « TA COLLECTION 0 / 16 »,
 * « PAS ENCORE JOUÉ », « 0 J », « 0 / 3 QUÊTES », plus la carte à mater. Quatre
 * compteurs et une carte — c'est-à-dire, pour le seul public qui n'a encore
 * rien, un mur de zéros. C'était le défaut relevé en arrivant sur le site avec
 * une sauvegarde vide, et la maquette le remplace par la rangée de PROFONDEUR :
 * cinq portes qui disent ce qu'on peut FAIRE plutôt que ce qu'on n'a pas.
 *
 * Rien n'est perdu de ce qu'elle disait : la collection a son écran, la série
 * et les quêtes vivent sur SOLO et sur l'écran de fin, la carte à mater est sur
 * le carnet (`#resiste`), et le record du jour a rejoint la carte DU JOUR.
 */

/**
 * LE RECORD DU JOUR, SUR LA CARTE « DU JOUR ».
 *
 * ⚠️ **LE BLOC D'OBJECTIF A DISPARU AVEC L'ANCIEN ACCUEIL**, et son chiffre ne
 * devait pas disparaître avec lui. Il occupait le haut de la page et arbitrait
 * avec le chapo — arbitrage qui n'a plus lieu d'être : la nouvelle composition
 * montre le chapo ET les cinq portes, il n'y a plus de place à se disputer.
 *
 * Ce que le chiffre disait reste vrai et reste utile : un record du JOUR est
 * vérifié (`verifyRun` a rejoué le journal), vivant — il change chaque jour —
 * et bien plus atteignable qu'un record de tous les temps. Il se pose donc sur
 * la carte qui parle de ce mode, là où il répond à une question qu'on se pose
 * déjà : « ça vaut quoi, aujourd'hui ? »
 *
 * ⚠️ La carte GARDE sa note par défaut quand le classement se tait — sans
 * comptes configurés, `classementDuJour` rend `null` pour tout le monde et tous
 * les jours. Un « — » à la place d'un chiffre se lirait comme une panne.
 */
function peintBut(sien: number | null, duJour: number | null): void {
  const but = vueBut({ jour: sien, entrainement: 0 }, duJour, "aucun");
  const note = $("profJourNote");
  if (!but.cible) return;
  note.textContent = but.depasse
    ? t("profJourBattu")(but.cible.score)
    : t("profJourRecord")(but.cible.score);
}

/**
 * Ce que le joueur a fait AU RUN DU JOUR aujourd'hui, ou `null`.
 *
 * `s.daily.score` porte le meilleur des trois essais — c'est un MAXIMUM depuis
 * qu'un second essai raté effaçait un bon premier. Il ne vaut que pour la
 * journée en cours : au changement de jour, `s.daily.day` ne correspond plus et
 * le chiffre d'hier n'a plus rien à comparer.
 */
function monScoreDuJour(s: P.Save): number | null {
  return scoreDuJour(s, day);
}

/** La règle dont la fiche est ouverte — pour que RETOUR sache d'où l'on vient. */
let ficheRegle: OneRule | null = null;

/**
 * Le filtre de la collection, qui en fait une SALLE DE TRAVAIL.
 *
 * ⚠️ Une seule grille, pas un filtre PLUS une grille. La maquette dessinait un
 * écran TRAINING séparé avec sa propre liste de règles — mais la collection en
 * a déjà une, et deux façons de répondre à « quelle règle travailler ? »
 * finissent par se contredire. Les filtres se posent donc SUR la grille
 * existante : c'est le même objet qu'on regarde autrement.
 */
type Filtre =
  /** Par FAMILLE — ce que la règle fait. */
  | "toutes"
  | "interdit"
  | "deformation"
  | "contrainte"
  /** Par AVANCEMENT — où j'en suis. */
  | "amater"
  | "maitrisees"
  | "verrouillees";
let filtre: Filtre = "toutes";

/**
 * D'où l'on ouvre la collection, et sous quel cadre.
 *
 * TRAINING et CARTES partagent la même grille (une seule liste de règles).
 * Le cadre change, le RETOUR aussi : depuis la barre on rentre à l'accueil,
 * depuis SOLO on y retourne. Un RETOUR unique mentirait une fois sur deux.
 */
type CodexVue = "collection" | "training";
let codexVue: CodexVue = "collection";
let codexDepuis: "nav" | "solo" = "nav";

function ouvreCodex(vue: CodexVue, depuis: "nav" | "solo" = "nav"): void {
  codexVue = vue;
  codexDepuis = depuis;
  if (vue === "training") {
    const s = P.load();
    const aMater = ONE_RULES.filter(
      (r) => !!s.encountered[r.id] && !estMaitrisee(r, s.encountered[r.id]),
    );
    filtre = aMater.length ? "amater" : "toutes";
  } else {
    filtre = "toutes";
  }
  renderCodex();
}

/** Une règle passe-t-elle le filtre courant ? */
function passeFiltre(r: OneRule, s: P.Save, f: Filtre): boolean {
  const rec = s.encountered[r.id];
  switch (f) {
    case "toutes":
      return true;
    case "interdit":
    case "deformation":
    case "contrainte":
      return familleDe(r) === f;
    case "verrouillees":
      return !rec;
    case "maitrisees":
      return !!rec && estMaitrisee(r, rec);
    case "amater":
      return !!rec && !estMaitrisee(r, rec);
  }
}

/**
 * L'étiquette de chaque état de carte.
 *
 * Une TABLE et non des ternaires : cinq états qui se lisent en cascade se
 * comportent faux tôt ou tard, et `Record<EtatCarte, …>` refuse de compiler le
 * jour où un état s'ajoute sans son libellé.
 */
const ETIQUETTE_ETAT: Record<EtatCarte, () => string> = {
  verrouillee: () => t("carteVerrouillee"),
  decouverte: () => t("carteDecouverte"),
  encours: () => t("carteEnCours"),
  maitrisee: () => t("carteMaitrisee"),
  parfaite: () => t("carteParfaite"),
};

/**
 * La règle découverte au DERNIER run — pour le badge « NOUVELLE ».
 *
 * Transitoire par construction : elle vit en mémoire, pas dans la sauvegarde.
 * Un badge « nouvelle » qui survivrait à une session cesserait de dire
 * « regarde ça » pour dire « c'est son nom ».
 */
let derniereDecouverte: string | null = null;

const NOM_FAMILLE = {
  interdit: () => t("famInterdit"),
  deformation: () => t("famDeformation"),
  contrainte: () => t("famContrainte"),
} as const;

/** Le libellé d'une case, composé de son identifiant. */
function libelleCase(c: CaseMaitrise): string {
  switch (c.id) {
    case "rencontree":
      return t("casRencontree");
    case "piege":
      return t("casPiege");
    case "serie":
      return t("casSerie")(SERIE_EPREUVE);
    case "allure15":
      return t("casAllure")(nomAllure(1.5, PACE_LABELS[1.5] ?? ""), MANCHES_MAITRISE);
    case "allure10":
      return t("casAllure")(nomAllure(PACE_DEFAULT, PACE_LABELS[PACE_DEFAULT] ?? ""), MANCHES_MAITRISE);
    case "allure08":
      return t("casAllure")(nomAllure(0.8, PACE_LABELS[0.8] ?? ""), MANCHES_MAITRISE);
    case "sansFaute":
      return t("casSansFaute")(MANCHES_MAITRISE);
  }
}

/**
 * La PREMIÈRE case non franchie, et ce qu'elle demande.
 *
 * Une seule phrase, jamais la liste de tout ce qui manque : six choses à faire
 * ne se retiennent pas, une seule se fait. C'est aussi elle qui décide de
 * l'allure que propose le bouton.
 */
function prochaineCase(cases: CaseMaitrise[]): { c: CaseMaitrise; allure: number } | null {
  const c = cases.find((x) => !x.faite);
  if (!c) return null;
  const allure =
    c.id === "allure15" ? 1.5 : c.id === "allure08" ? 0.8 : PACE_DEFAULT;
  return { c, allure };
}

function ouvreFiche(r: OneRule): void {
  const s = P.load();
  const rec = s.encountered[r.id];
  // Une règle jamais rencontrée n'a pas de fiche : elle n'a rien à raconter,
  // et tout ce qu'elle dirait brûlerait la surprise (décision n°7).
  if (!rec) return;
  ficheRegle = r;
  sfx.ui();

  const cases = echelleMaitrise(r, rec);
  const n = franchies(cases);

  $("ficheVue").innerHTML =
    `<img class="fiche__img" src="/cartes/${r.id}.png" width="64" height="64" alt="" />`;
  const taux = tauxPiege(r);
  $("ficheFamille").textContent =
    NOM_FAMILLE[familleDe(r)]() + (taux !== null ? `  ·  ${t("ficheTaux")(`${taux.toFixed(1)} %`)}` : "");
  $("ficheNom").textContent = nomDeRegle(r.id, r.name);
  $("ficheBrief").textContent = briefDeRegle(r.id, r.brief);
  $("ficheMaitrise").textContent = t("ficheMaitrise")(n);

  // Trois chiffres, et aucun n'est un jugement : ce sont des faits sur ce que
  // le joueur a déjà fait sous cette règle.
  const chiffres = $("ficheChiffres");
  chiffres.innerHTML = "";
  for (const [label, valeur] of [
    [t("ficheMeilleur"), String(rec.best)],
    [t("ficheSerie"), String(rec.serie ?? 0)],
    [t("fichePieges"), String(rec.pieges ?? 0)],
  ] as const) {
    const cel = document.createElement("div");
    cel.className = "fiche__cel";
    cel.innerHTML = `<b class="fiche__val"></b><span class="fiche__lab"></span>`;
    cel.querySelector<HTMLElement>(".fiche__val")!.textContent = valeur;
    cel.querySelector<HTMLElement>(".fiche__lab")!.textContent = label;
    chiffres.appendChild(cel);
  }

  const liste = $("ficheCases");
  liste.innerHTML = "";
  const suivante = prochaineCase(cases);
  for (const c of cases) {
    const li = document.createElement("li");
    const encours = !c.faite && suivante?.c.id === c.id;
    li.className = `cas${c.faite ? " is-faite" : ""}${encours ? " is-encours" : ""}`;
    li.innerHTML = `<span class="cas__puce" aria-hidden="true"></span><span class="cas__texte"></span><span class="cas__reste"></span>`;
    li.querySelector<HTMLElement>(".cas__texte")!.textContent = libelleCase(c);
    li.querySelector<HTMLElement>(".cas__reste")!.textContent =
      c.faite || c.reste === null ? "" : String(c.reste);
    liste.appendChild(li);
  }

  $("ficheManque").textContent = !suivante
    ? t("ficheRienNeManque")
    : suivante.c.id === "piege"
      ? t("ficheManquePiege")
      : suivante.c.id === "serie"
        ? t("ficheManqueSerie")(suivante.c.reste ?? 0)
        : suivante.c.id === "sansFaute"
          ? t("ficheManqueSansFaute")(MANCHES_MAITRISE)
          : t("ficheManqueManches")(
              suivante.c.reste ?? 0,
              nomAllure(suivante.allure, String(suivante.allure)),
            );

  /*
   * LE BOUTON PORTE L'ALLURE DE LA PROCHAINE CASE.
   *
   * C'est le raccord de toute la boucle : on rencontre une règle en jouant,
   * elle entre au carnet, sa fiche dit ce qui manque, et le bouton ouvre
   * exactement l'exercice qui le comble. Sans ça, la fiche serait un tableau
   * de bord — quelque chose qu'on consulte au lieu de quelque chose qu'on
   * utilise.
   */
  const btn = $<HTMLButtonElement>("btnFicheTrain");
  const allure = suivante?.allure ?? PACE_DEFAULT;
  btn.textContent = t("ficheEntraine")(nomAllure(allure, String(allure)));
  btn.dataset.allure = String(allure);

  /*
   * LA MONTÉE, ET CE QU'ELLE ANNONCE.
   *
   * Le bouton porte l'avancement plutôt qu'un simple nom : « 8 / 20 PALIERS »
   * dit à la fois où on en est et qu'il y a un ailleurs. À zéro, il invite.
   */
  const e = P.escalierDe(s, r.id);
  $("btnFicheEsc").textContent =
    e.palier > 0
      ? `${t("escTitre")} · ${t("escProgres")(e.palier, ESC.PALIER_SOMMET)}`
      : t("escOuvrir");

  show("fiche");
}

/*
 * TRAVAILLER CELLE-LÀ — le raccourci qui évite de choisir.
 *
 * Il ouvre la FICHE plutôt que l'exercice : la fiche dit d'abord ce qui manque
 * et à quelle allure, et c'est elle qui lance. Sauter directement au brief
 * ferait perdre la seule explication du parcours.
 */
$("btnResiste").addEventListener("click", () => {
  const id = $("btnResiste").dataset.regle;
  const r = ONE_RULES.find((x) => x.id === id);
  if (r) ouvreFiche(r);
});

$("btnFicheTrain").addEventListener("click", () => {
  if (!ficheRegle) return;
  sfx.ui();
  const allure = Number($("btnFicheTrain").dataset.allure ?? PACE_DEFAULT);
  const id = ficheRegle.id;
  P.mutate((st) => {
    // On pose l'allure ET la règle : l'exercice doit être celui que la fiche
    // vient d'annoncer, sinon le bouton ment.
    st.trainingPace = allure;
    st.trainingRegle = id;
  });
  openBrief("training");
});

$("btnFicheEsc").addEventListener("click", () => {
  if (ficheRegle) ouvreEscalier(ficheRegle);
});

$("btnFicheBack").addEventListener("click", () => {
  sfx.ui();
  renderCodex();
});

/* ------------------------------------------------------------------ *
 * L'ESCALIER D'UNE RÈGLE — vingt paliers, quatre volées
 *
 * Demandé par Pierre : « tu cliques sur la carte et tu arrives sur une autre
 * page avec des escaliers qui représentent chaque palier jusqu'à la maîtrise ».
 *
 * Ce que ça règle, et qui était mesuré : l'entraînement libre n'a PAS de but.
 * On y meurt à la même difficulté à la première partie et à la centième, et
 * 538 des 572 runs relevés y ont été joués — c'est-à-dire que le mode le plus
 * pratiqué du jeu est celui qui ne mène nulle part.
 *
 * Toute la logique vit dans `game/escalier.ts`, pur et testé. Ici, on peint.
 * ------------------------------------------------------------------ */

/** La carte d'une règle, à la taille de l'escalier. */
function ouvreEscalier(r: OneRule): void {
  const s = P.load();
  // Décision n°7 : une règle jamais rencontrée n'a rien à montrer, et sa
  // montée dirait déjà ce qu'elle interdit.
  if (!s.encountered[r.id]) return;
  escalierRegle = r;
  sfx.ui();
  const e = P.escalierDe(s, r.id);
  // On ouvre SUR le palier courant, jamais sur le premier : c'est la marche
  // qu'on vient chercher. Au sommet, on ouvre sur la dernière.
  palierVu = Math.min(ESC.PALIER_SOMMET, e.palier + 1);
  $("escBoite").classList.remove("est-detail");
  renderEscalier();
  show("escalier");
  escVersIci();
}

function renderEscalier(): void {
  const r = escalierRegle;
  if (!r) return;
  const s = P.load();
  const e = P.escalierDe(s, r.id);
  const courant = ESC.palierCourant(e);

  $("btnEscBackTxt").textContent = t("escRetour");
  $("escOu").textContent = `${nomDeRegle(r.id, r.name)} · ${t("escProgres")(
    e.palier,
    ESC.PALIER_SOMMET,
  )}`;

  $("escVue").innerHTML = carteVignette(r.id);

  const vol = courant ? ESC.VOLEES.find((v) => v.id === courant.volee)! : ESC.VOLEES[3]!;
  $("escVolee").textContent = t("escVolee")(
    vol.n,
    t("escVoleeNom")(vol.id),
    t("allureTxt")(vol.allure),
  );
  // Ce que la PROCHAINE marche ajoute — pas ce que la dernière a ajouté : on
  // regarde vers le haut. Au sommet, la montée n'ajoute plus rien.
  $("escAjout").textContent = courant
    ? (() => {
        const a = ESC.ajoutDuPalier(courant.n);
        return t("escAjout")(a.id, a.valeur);
      })()
    : t("escFiniNote");

  // La jauge : une case par palier.
  const jauge = $("escJauge");
  jauge.innerHTML = "";
  for (const pal of ESC.PALIERS) {
    const li = document.createElement("li");
    if (pal.n <= e.palier) li.className = "est-franchi";
    else if (courant && pal.n === courant.n) li.className = "est-ici";
    jauge.appendChild(li);
  }
  $("escVers").textContent = courant
    ? t("escVersSommet")(courant.n, ESC.PALIER_SOMMET)
    : t("escFini");

  /*
   * LA LISTE DESCEND — le sommet en haut, la première marche en bas.
   *
   * C'est un escalier : on le monte. L'intitulé d'une volée ouvre le groupe
   * qu'il nomme, donc il se pose au-dessus de son palier LE PLUS HAUT, ce qui
   * dans cet ordre veut dire avant lui.
   */
  const liste = $("escListe");
  liste.innerHTML = "";
  let ici: HTMLElement | null = null;
  for (const pal of [...ESC.PALIERS].reverse()) {
    const v = ESC.VOLEES.find((x) => x.id === pal.volee)!;
    if (pal.n % 5 === 0) {
      const tete = document.createElement("li");
      tete.className = "esc__vol";
      tete.innerHTML = `<span></span><span></span>`;
      const sp = tete.querySelectorAll("span");
      sp[0]!.innerHTML = "<b></b>";
      sp[0]!.querySelector("b")!.textContent = t("escVolee")(
        v.n,
        t("escVoleeNom")(v.id),
        t("allureTxt")(v.allure),
      );
      sp[1]!.textContent = t("escVoleeNote")(v.id);
      liste.appendChild(tete);
    }

    const franchi = pal.n <= e.palier;
    const estIci = !!courant && pal.n === courant.n;
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.className =
      "esc__marche" +
      (franchi ? " est-franchi" : "") +
      (estIci ? " est-ici" : "") +
      (pal.n === ESC.PALIER_SOMMET ? " est-sommet" : "");
    /*
     * ⚠️ ON NE PEUT PAS OUVRIR UN PALIER QU'ON N'A PAS ATTEINT.
     *
     * Pas par avarice : sa fiche dit ce qu'il ajoute, donc l'ouvrir montrerait
     * d'un coup toute la progression à venir. C'est la même doctrine que le
     * carnet (n°7) — on n'explique que ce qui a été rencontré.
     */
    b.disabled = !franchi && !estIci;
    b.innerHTML = `<span class="esc__num"></span><span class="esc__nom"></span><span class="esc__cout"></span>`;
    /*
     * \u26a0\ufe0f LE NUM\u00c9RO RESTE, M\u00caME UNE FOIS LE PALIER FRANCHI.
     *
     * Premier essai : la coche REMPLA\u00c7AIT le num\u00e9ro. Relev\u00e9 \u00e0 l'\u00e9cran, la
     * vol\u00e9e 1 devenait cinq lignes sans identit\u00e9 \u2014 or c'est par son num\u00e9ro
     * qu'on d\u00e9signe un palier, \u00e0 soi comme \u00e0 quelqu'un d'autre, et c'est ce
     * num\u00e9ro que le bouton REPRENDRE reprend. La coche s'ajoute donc \u00e0 la
     * colonne de droite plut\u00f4t que d'effacer la gauche.
     */
    b.querySelector<HTMLElement>(".esc__num")!.textContent = String(pal.n).padStart(2, "0");
    b.querySelector<HTMLElement>(".esc__nom")!.textContent = estIci
      ? t("escTuEsIci")
      : pal.n === ESC.PALIER_SOMMET
        ? t("escSommet")
        : pal.n === ESC.PALIER_MAITRISE
          ? t("escMaitrisee")
          : (() => {
              /*
               * ⚠️ UNE MARCHE QUI N'AJOUTE QUE DE LA DURÉE NE SE NOMME PAS.
               *
               * Relevé à l'écran : la volée 1 alignait trois marches portant
               * mot pour mot « 2 manches de plus à tenir. ». Trois lignes
               * identiques dans une liste se lisent comme un bug d'affichage,
               * pas comme une progression — et elles répétaient de surcroît la
               * colonne de droite, qui dit déjà « 10 MANCHES ».
               *
               * La phrase reste sur la FICHE du palier, où elle est le seul
               * texte et où elle répond à « qu'est-ce qui change ? ». Ici, le
               * chiffre est le contenu entier de la marche. La maquette ne les
               * nomme pas non plus.
               */
              const a = ESC.ajoutDuPalier(pal.n);
              return a.id === "duree" || a.id === "depart"
                ? ""
                : t("escAjout")(a.id, a.valeur);
            })();
    b.querySelector<HTMLElement>(".esc__cout")!.textContent =
      estIci && e.meilleur > 0
        ? `${e.meilleur} / ${pal.manches}`
        : franchi
          ? `✓ ${t("escManches")(pal.manches)}`
          : t("escManches")(pal.manches);
    b.addEventListener("click", () => {
      palierVu = pal.n;
      sfx.ui();
      $("escBoite").classList.add("est-detail");
      renderPalier();
    });
    li.appendChild(b);
    liste.appendChild(li);
    if (estIci) ici = b;
  }

  /*
   * LE TOTAL EST CALCULÉ, JAMAIS ÉCRIT.
   *
   * La maquette annonce « 371 MANCHES » sous une colonne qui en fait 396 : elle
   * se contredit, comme les documents de ce dépôt le font régulièrement (§2).
   * Un total dérivé ne peut pas mentir, et il suit le jour où un palier change.
   */
  $("escTotal").innerHTML = `<span></span><span></span>`;
  const tot = $("escTotal").querySelectorAll("span");
  tot[0]!.textContent = t("escTotal");
  tot[1]!.textContent = t("escTotalVal")(
    ESC.totalManches(),
    ESC.minutesDeMontee(windowMs),
  );
  $("escNote").textContent = t("escNote");

  renderPalier();
  /*
   * ⚠️ ON AMÈNE LA MARCHE COURANTE EN VUE, ET **APRÈS** `show`.
   *
   * Mesuré : sans ça, l'écran s'ouvre sur le SOMMET — donc sur les douze
   * marches qu'on ne peut pas encore jouer — et la marche courante est à
   * 922 px dans une fenêtre de 812. La liste descend, c'est le prix de
   * l'escalier ; l'amener en vue est ce qui le rend gratuit.
   *
   * Et le premier essai ne marchait pas : `renderEscalier` tourne pendant que
   * `#escalier` porte encore `hidden`, et `scrollIntoView` sur un élément non
   * affiché ne fait rien — silencieusement, comme toujours. `escVersIci`
   * s'appelle donc depuis `ouvreEscalier`, une fois l'écran montré.
   */
  marcheIci = ici;
}

/** La marche « TU ES ICI » du dernier rendu, à amener en vue une fois affichée. */
let marcheIci: HTMLElement | null = null;

function escVersIci(): void {
  marcheIci?.scrollIntoView({ block: "center" });
}

function renderPalier(): void {
  const r = escalierRegle;
  if (!r) return;
  const s = P.load();
  const e = P.escalierDe(s, r.id);
  const pal = ESC.palierN(palierVu);
  if (!pal) return;
  const v = ESC.VOLEES.find((x) => x.id === pal.volee)!;
  const franchi = pal.n <= e.palier;
  const ajout = ESC.ajoutDuPalier(pal.n);

  $("palVolee").textContent = t("escVolee")(v.n, t("escVoleeNom")(v.id), t("allureTxt")(v.allure));
  $("palNom").textContent = t("escSurN")(pal.n, ESC.PALIER_SOMMET);
  /*
   * La jauge du palier ne dit quelque chose QUE sur celui qu'on joue :
   * `meilleur` décrit le palier courant et lui seul (voir `fusionneEscalier`).
   * L'afficher sur un palier franchi collerait un chiffre qui n'est pas le
   * sien.
   */
  const enCours = !franchi && e.palier + 1 === pal.n;
  $("palEssai").textContent = franchi
    ? "\u2713"
    : enCours && e.meilleur > 0
      ? `${e.meilleur} / ${pal.manches}`
      : t("escManches")(pal.manches);

  $("palAjoutTitre").textContent = t("escAjoutTitre");
  $("palAjout").textContent = t("escAjout")(ajout.id, ajout.valeur);

  const chiffres = $("palChiffres");
  chiffres.innerHTML = "";
  for (const [label, valeur, danger] of [
    [t("escTenir"), String(pal.manches), false],
    [t("escAllure"), `\u00d7 ${t("allureTxt")(pal.allure)}`, false],
    // ⚠️ Sans effet sur une règle qui ne piège pas : sept sur seize n'en posent
    // aucun, et annoncer « 1 SUR 5 » à celles-là serait une promesse fausse.
    [t("escPieges"), r.traps ? t("escPiegesVal")(pal.cadence) : t("escPiegesVal")(0), false],
    [t("escMorts"), "0", true],
  ] as const) {
    const cel = document.createElement("div");
    cel.className = "pal__cel";
    cel.innerHTML = `<b class="pal__val"></b><span class="pal__lab"></span>`;
    const b = cel.querySelector<HTMLElement>(".pal__val")!;
    b.textContent = valeur;
    if (danger) b.classList.add("est-danger");
    cel.querySelector<HTMLElement>(".pal__lab")!.textContent = label;
    chiffres.appendChild(cel);
  }

  $("palMeilleur").innerHTML = `<span></span><b></b>`;
  const m = $("palMeilleur").querySelectorAll("span, b");
  m[0]!.textContent = t("escMeilleurEssai");
  m[1]!.textContent =
    enCours && e.essais > 0 ? t("escMeilleurVal")(e.meilleur, e.essais) : t("escAucunEssai");

  const go = $<HTMLButtonElement>("btnPalGo");
  // Un palier franchi se rejoue — c'est un exercice, pas un jeton à consommer
  // — mais le libellé ne promet plus de le franchir.
  go.textContent = franchi || e.essais > 0 ? t("escReprendre")(pal.n) : t("escLancer");
  /*
   * ⚠️ UN BOUTON DIT CE QU'IL FAIT, JAMAIS UNE RÈGLE DU JEU.
   *
   * Premier essai : ce bouton portait « UN PALIER RATÉ SE REJOUE · TU NE
   * REDESCENDS JAMAIS ». Une phrase de trente-neuf caractères sur un bouton
   * fantôme, c'est-à-dire un avertissement déguisé en action — on ne sait plus
   * si on le presse pour accepter quelque chose. La phrase est allée sous la
   * montée, où elle répond à la vraie question ; le bouton, lui, revient.
   */
  /*
   * \u26a0\ufe0f `\u2039` ET NON `\u25c2` : DM MONO NE PORTE PAS LE TRIANGLE PLEIN.
   *
   * Mesur\u00e9 au canvas \u2014 largeur du glyphe dans \u00ab DM Mono \u00bb seule, contre la
   * pile compl\u00e8te : `\u25c2` retombait sur la mono du syst\u00e8me. La fl\u00e8che se
   * dessinait donc dans une AUTRE police que le mot qu'elle accompagne, et
   * son rendu changeait d'un appareil \u00e0 l'autre. C'est ce que le d\u00e9p\u00f4t a d\u00e9j\u00e0
   * tranch\u00e9 pour les pictogrammes des portes \u2014 \u00ab le rendu d'un emoji change
   * d'un syst\u00e8me \u00e0 l'autre \u00bb \u2014 appliqu\u00e9 \u00e0 un chevron.
   */
  $("btnPalBack").textContent = `\u2039 ${t("escRetour")}`;
}

$("btnEscBack").addEventListener("click", () => {
  sfx.ui();
  // Sur téléphone, le détail est une VUE de cet écran : le retour revient
  // d'abord à la montée, et seulement ensuite à la collection.
  if ($("escBoite").classList.contains("est-detail")) {
    $("escBoite").classList.remove("est-detail");
    return;
  }
  renderCodex();
});

$("btnPalBack").addEventListener("click", () => {
  sfx.ui();
  $("escBoite").classList.remove("est-detail");
});

$("btnPalGo").addEventListener("click", () => {
  if (!escalierRegle) return;
  sfx.ui();
  const id = escalierRegle.id;
  const n = palierVu;
  P.mutate((st) => {
    // Le brief tire sa règle de `trainingRegle` : on la pose, comme le fait la
    // fiche. L'allure, elle, ne passe PAS par `trainingPace` — c'est une
    // préférence du joueur, et un palier ne doit pas la réécrire dans son dos.
    st.trainingRegle = id;
  });
  palierDemande = n;
  openBrief("training");
});

/* ------------------------------------------------------------------ *
 * LA PREMIÈRE ARRIVÉE — six temps, et le piège est la leçon
 *
 * Rapporté par Pierre : ses camarades ont adoré mais n'ont pas compris, et il
 * était à côté pour expliquer. Tant qu'un humain compense, on ne sait pas si le
 * jeu s'explique.
 *
 * ⚠️ Les temps 3 et 5 se jouent sur le VRAI terrain — `show(null)`, le vrai
 * canvas, le vrai `scene.hit()`. Un tutoriel qui simule le jeu enseigne un jeu
 * qui n'existe pas. L'aide est un calque HORS FLUX posé sur la scène, donc
 * `fieldRect()` ne bouge pas (décision n°10).
 * ------------------------------------------------------------------ */
/**
 * Le tutoriel en cours. `manche` vaut `null` pendant la RESPIRATION qui suit un
 * temps réussi : le terrain se vide, la ligne d'aide dit ce qui vient de se
 * passer, puis `suite` ouvre le temps d'après. Tout est porté par la boucle de
 * jeu, jamais par un `setTimeout` — un décor ne court pas sur un onglet qui ne
 * compose pas, et `smoke.test.ts` déroule les images à la main.
 */
let tuto: {
  temps: Temps;
  manche: MancheTuto | null;
  debut: number;
  suite: { a: number; faire: () => void } | null;
} | null = null;

/** La respiration entre deux temps : assez pour lire une ligne, pas plus. */
const TUTO_RESPIRE_MS = 1400;

function regleTuto(): OneRule {
  // Le tutoriel enseigne LE SANG : la couleur est le canal perceptif le plus
  // rapide, on la VOIT sans la chercher. C'est la seule règle facile qui
  // piège, et un tutoriel doit être facile ET piéger.
  return ONE_RULES.find((r) => r.id === REGLE_TUTO) ?? ONE_RULES[0]!;
}

/** La lettre du déjouage telle que le joueur la tape, ou `null` au pouce. */
function toucheTuto(): string | null {
  return TOUCH_ONLY ? null : P.load().dejoue.touche;
}

/** Ouvre un temps : on est sur le vrai terrain, avec la vraie règle au bandeau. */
function joueTemps(n: Temps): void {
  const m = mancheDe(n);
  tuto = { temps: n, manche: m, debut: performance.now(), suite: null };
  hud.setRule(regleTuto());
  hud.hideStamp();
  hud.clearRound();
  hud.setMeta(t("tutoEtape")(n, TEMPS_JOUES.length));
  hud.setFooter(0, 0, "—");
  $("tuto").classList.remove("hidden");
  if (n === 1) poseAideTuto(t("tutoObeis"), t("tutoSansChrono"));
  else if (n === 2) poseAideTuto(t("tutoRelis"), t("tutoRalenti"));
  else poseAideTuto(t("tutoDejoue")(toucheTuto()), t("tutoDejoueNote"));
  show(null);
  poseDejoue();
}

function poseAideTuto(aide: string, note: string): void {
  $("tutoAide").textContent = aide;
  $("tutoNote").textContent = note;
}

/** Un temps est gagné : on dit pourquoi, le terrain se vide, puis on enchaîne. */
function reussitTemps(aide: string, note: string, faire: () => void): void {
  if (!tuto) return;
  tuto.manche = null;
  tuto.suite = { a: performance.now() + TUTO_RESPIRE_MS, faire };
  hud.clearRound();
  poseAideTuto(aide, note);
}

function fermeTuto(): void {
  tuto = null;
  $("tuto").classList.add("hidden");
  $("btnDejouer").classList.add("hidden");
  hud.setRule(null);
  hud.setMeta("");
  hud.clearRound();
}

/** Après le temps 2 : la règle entre au carnet. */
function apresPiege(): void {
  // La première carte se débloque en JOUANT, pas en lisant.
  P.recordRun(REGLE_TUTO, 0, false, 1);
  // Le raccourci désactivé dans les réglages ? On ne l'enseigne pas.
  if (P.load().dejoue.on) joueTemps(3);
  else finitOnboarding(false);
}

/**
 * Un clic pendant un temps.
 *
 * ⚠️ Rien ne TUE ici, et c'est le sujet : une erreur est NOMMÉE et la manche
 * reprend. Un tutoriel qui punit renvoie le joueur au menu avec la même
 * incompréhension.
 */
function tutoClic(idx: number | null): void {
  if (!tuto?.manche) return;
  const m = tuto.manche;
  const verdict = jugeClic(m, idx);

  if (tuto.temps === 1) {
    if (verdict === "juste") {
      sfx.success(1);
      reussitTemps(t("tutoOui"), t("tutoOuiNote"), () => joueTemps(2));
      return;
    }
    // « Raté » n'apprend rien ; « ta règle interdit le rouge » apprend la
    // règle au moment exact où elle vient de servir.
    sfx.fail();
    poseAideTuto(verdict === "interdit" ? t("tutoInterdit") : t("tutoPasCelleLa"), t("tutoSansChrono"));
    return;
  }

  // Temps 2 et 3 : TOUT clic est une faute, y compris celui que la consigne demande.
  sfx.fail();
  poseAideTuto(t("tutoInterdit"), tuto.temps === 2 ? t("tutoRienFaire") : t("tutoDejoueNote"));
  tuto.debut = performance.now();
}

/** DÉJOUER pendant le tutoriel — la touche ou le bouton. */
function tutoDejoue(): void {
  if (!tuto?.manche) return;
  if (jugeDejoue(tuto.manche) === "pasUnPiege") {
    sfx.fail();
    poseAideTuto(t("tutoPasUnPiege"), t("tutoSansChrono"));
    return;
  }
  const t0 = performance.now();
  sfx.trapAvoided();
  scene.burstScreen("#CFC9F2");
  scene.flashViolet(t0);
  attiseFlammes(1);
  vibrePiegeDejoue();
  const temps = tuto.temps;
  reussitTemps(t("tutoDejoueBravo"), t("tutoPret"), () =>
    temps === 2 ? apresPiege() : finitOnboarding(false),
  );
}

/** Le piège se gagne aussi en LAISSANT le chrono s'écouler. */
function majTuto(now: number): void {
  if (!tuto) return;
  if (tuto.suite) {
    if (now >= tuto.suite.a) {
      const faire = tuto.suite.faire;
      tuto.suite = null;
      faire();
    }
    return;
  }
  if (!tuto.manche || tuto.temps === 1) return;
  if (now - tuto.debut < CHRONO_PIEGE_MS) return;
  // Le son du piège DÉJOUÉ, pas celui d'une manche réussie.
  sfx.trapAvoided();
  attiseFlammes(0.6);
  if (tuto.temps === 2) {
    reussitTemps(t("tutoRienFaitBravo"), t("tutoRienFaitNote"), apresPiege);
  } else {
    reussitTemps(t("tutoRienFaitBravo"), t("tutoPret"), () => finitOnboarding(false));
  }
}

/**
 * Un joueur VRAIMENT neuf — jamais rencontré une seule règle.
 *
 * ⚠️ Deux conditions et non une. `onboarded` est absent des sauvegardes déjà
 * écrites, donc il vaut faux pour TOUT LE MONDE, y compris pour quelqu'un qui a
 * deux cents manches au compteur. Sans la seconde condition, le déploiement
 * renverrait tous les habitués au tutoriel.
 */
function estNouveau(): boolean {
  const s = P.load();
  return !s.onboarded && Object.keys(s.encountered).length === 0;
}

function ouvreOnboarding(): void {
  track("onb_start", {});
  joueTemps(1);
}

/**
 * Sortie — par PASSER (ou ÉCHAP), ou au terme du dernier temps.
 *
 * ⚠️ AU TERME, LA PARTIE DÉMARRE. Pas de menu, pas de brief à relire : le joueur
 * vient de jouer trois manches sous LE SANG, il sait ce qu'il fait. Le
 * battement de lecture du brief lui laisse quand même voir sa règle.
 */
function finitOnboarding(passe: boolean): void {
  fermeTuto();
  P.mutate((st) => {
    st.onboarded = true;
  });
  track(passe ? "onb_skip" : "onb_done", {});
  if (passe) {
    renderHome();
    show("home");
    return;
  }
  openBrief("training");
  startRun();
}

$("btnTutoPasser").addEventListener("pointerdown", (ev) => {
  ev.preventDefault();
  sfx.ui();
  finitOnboarding(true);
});

/* ------------------------------------------------------------------ *
 * Le mode classé
 * ------------------------------------------------------------------ */
async function openRanked(): Promise<void> {
  if (queueing) return;
  const s = P.load();
  if (!s.ranked.name) {
    const asked = prompt(t("promptPseudo"), "")?.trim();
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
  $("briefName").textContent = nomDeRegle(rule.id, rule.name);
  $("briefText").textContent = briefDeRegle(rule.id, rule.brief);
  const warn = $("briefWarn");
  warn.textContent = offer.opponent
    ? t("rankedContre")(offer.opponent.name, offer.opponent.rating, offer.opponent.score)
    : t("rankedEtalon");
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
    // ⚠️ `res.reasons` vient de `verifyRun` et reste FRANÇAIS : ce sont des
    // diagnostics d'anti-triche (« rejeu non convergent »), pas de l'interface.
    // Le mode classé est masqué en production, et le jour où il s'ouvrira ils
    // seront à structurer comme les motifs de mort.
    box.innerHTML =
      `<span class="rank__delta">${t("rankedControle")(res.verdict)}</span><br>` +
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
      (c.promoted ? `<br>${t("rankedPromotion")}` : "") +
      (c.floored ? `<br>${t("rankedPlancher")}` : "")
    : `<span class="rank__delta">${res.score}</span>${t("rankedRunEtalon")(res.me.rating)}`;
  if (c?.promoted) sfx.win();
}

/* ------------------------------------------------------------------ *
 * Fin d'un run
 * ------------------------------------------------------------------ */
function finishRun(): void {
  if (!session?.end) return;
  const { end, rule, mode } = session;
  const pace = session.pace;
  /*
   * ⚠️ UNE PARTIE JOUÉE AVEC LE DÉJOUAGE NE DEVIENT PAS UN DÉFI.
   * Avec une lettre réservée, ses manches ne sont plus celles de sa graine ;
   * et un déjouage avance les temps de passage que le fantôme rejouerait.
   */
  const defiFidele = !session.toucheReservee && end.dejoues === 0;
  lastRun = { end, rule, mode, seed: session.seed };
  // Les VRAIES règles de la pile, avant que la session ne soit libérée.
  const reglesTenues = session.reglesTenues;
  palierDuDernierRun = palierEnCours !== null ? ESC.palierN(palierEnCours) : undefined;

  /** L'état de la règle AVANT ce run — voir la note dans la mutation. */
  let avant: P.RuleRecord | undefined;

  const s = P.mutate((st) => {
    ensureDay(st, day);
    // La MÊME formule que `recordRun`, et une seule fois écrite : les deux
    // copies avaient chacune leur `pieges` à tenir à jour, et seule celle-ci
    // tourne vraiment.
    /*
     * Ce que ce run apprend sur la règle, pour l'échelle de maîtrise.
     *
     * Tout se lit dans les MARQUES que le moteur produisait déjà — 🟩 propre,
     * 🟦 piège déjoué, 🟨 faute d'échauffement, 🟥 la mort. Rien n'a été ajouté
     * au moteur : une progression qui demande d'instrumenter le chemin chaud
     * est une progression qu'on paie à chaque manche.
     */
    /*
     * ⚠️ LA PHOTO D'AVANT, prise ICI et nulle part ailleurs.
     *
     * `majCarnet` remplace l'entrée : après elle, il n'y a plus aucun moyen de
     * savoir ce que ce run a fait avancer. Et c'est exactement la question à
     * laquelle l'écran de fin doit répondre — « qu'est-ce que je viens de
     * gagner ? ». Le score seul n'y répond pas : il dit ce qu'on a fait, pas ce
     * qu'on a acquis.
     */
    avant = st.encountered[rule.id] ? { ...st.encountered[rule.id]! } : undefined;
    /*
     * ⚠️ **UN RUN DE PALIER NOURRIT L'ESCALIER, JAMAIS CE QUI JUGE.**
     *
     * Une règle, une seule, et c'est celle qui rend le mode inoffensif : le
     * palier écrit `best` et `pieges` — des faits — et rien d'autre. Il
     * n'écrit ni `parAllure`, ni `serie`, ni `sansFaute` (les cases de
     * l'échelle de maîtrise), ni `recent`, ni le moindre record.
     *
     * Pourquoi. Un palier n'est PAS un run d'entraînement : sa longueur est
     * bornée, son allure est imposée, sa cadence de pièges est forcée, et
     * jusqu'au palier 10 le jeu lui annonce ses pièges. Quinze manches tenues
     * là ne prouvent pas ce que quinze manches tenues en entraînement libre
     * prouvent — et « MAÎTRISÉE » deviendrait atteignable sur un échafaudage.
     * C'est la décision n°14 : ce qui est opposable est rejoué, le reste ne
     * doit jamais se confondre avec.
     *
     * Le passage de `run` à `undefined` suffit à tout suspendre d'un coup :
     * `majCarnet` n'écrit ces quatre champs QUE s'il le reçoit. Un jour où un
     * cinquième champ s'ajoutera là-dedans, il sera couvert sans qu'on y pense.
     */
    /*
     * ⚠️ **L'ESCALADE N'ÉCRIT PAS SA COMPOSÉE AU CARNET.**
     *
     * `session.rule` y rend la composée de la pile, dont l'identifiant est
     * « azur+pointe+voyelle+colosse ». Écrite telle quelle, elle créait une
     * entrée FANTÔME : absente du catalogue, donc invisible dans la collection,
     * mais bien comptée dans `Object.keys(s.encountered)` — le nombre de règles
     * rencontrées, la jauge du compte, le seuil « ce joueur connaît le jeu » de
     * l'accueil — et expédiée au compte, où elle occupait une place sur les 64
     * que `api/moi.ts` accepte. Une seule partie d'escalade suffisait.
     *
     * Ce qu'un run d'escalade prouve VRAIMENT, c'est qu'on a rencontré chacune
     * des règles tenues. On les inscrit donc une par une, sans rien d'autre :
     * ni `best` — un score d'escalade se compte en RÈGLES tenues, pas en
     * manches, et le poser sous une règle le rendrait incomparable au reste —
     * ni les pièges, qu'on ne saurait pas attribuer entre quatre règles.
     */
    if (mode === "escalade") {
      for (const r of reglesTenues) {
        st.encountered[r.id] = P.majCarnet(st.encountered[r.id], 0, false, 0, undefined);
      }
    }

    /*
     * ⚠️ **LES COMPTEURS DE QUÊTES PASSENT AVANT TOUTE SORTIE DE MODE.**
     *
     * Rapporté : « j'ai déjoué des pièges mais ma to-do list ne s'est pas mise
     * à jour dans l'escalade, alors que ça me le valide en entraînement ». Bug
     * introduit au commit précédent : le retour anticipé de l'escalade — posé
     * pour empêcher sa règle COMPOSÉE d'entrer au carnet — sautait du même coup
     * les cinq `bump`, qui sont plus bas dans la fonction.
     *
     * Or ils ne dépendent d'aucun mode : un piège déjoué est un piège déjoué,
     * une manche tenue est une manche tenue. Les remonter ici les met hors de
     * portée du prochain `return` qu'on ajoutera — et il y en aura un.
     */
    bump(st, "runs", 1);
    bump(st, "traps", end.trapsSurvived);
    bump(st, "rounds", end.score);
    bump(st, "best", end.score, "max");
    if (!end.usedKeyboard) bump(st, "noKey", end.score, "max");

    const surPalier = palierEnCours !== null;
    /*
     * ⚠️ ET ON S'ARRÊTE LÀ POUR L'ESCALADE.
     *
     * Sans ce retour, la ligne d'en dessous réécrirait `st.encountered` sous
     * l'identifiant de la COMPOSÉE, et le fantôme reviendrait par la porte
     * qu'on vient de fermer. Le reste de la mutation — `recent`, les records
     * d'entraînement — ne la concerne pas davantage : un score d'escalade se
     * compte en RÈGLES tenues, pas en manches, et sa clé de comparabilité est
     * `cleEscalade`, jamais celle d'une règle.
     */
    if (mode === "escalade") {
      st.recent = [...st.recent, end.score].slice(-5);
      P.inscritRecord(st, cleEscalade(), session!.paliers);
      return;
    }

    /*
     * ⚠️ LA MONTÉE D'AVANT SE LIT AVANT `majCarnet`, PAS APRÈS.
     *
     * Elle se lisait après, sur l'entrée que `majCarnet` venait de rendre — ce
     * qui marche tant que `majCarnet` recopie le champ, et rate en silence dès
     * qu'il l'oublie. C'est exactement ce qui s'est produit, et le symptôme
     * était « impossible d'aller au-delà de l'étape 2 ».
     *
     * `majCarnet` porte désormais le champ, donc les deux lectures donneraient
     * le même résultat. On garde quand même celle-ci : elle ne DÉPEND plus de
     * ce que fait la fonction d'à côté, et c'est la même précaution que la
     * photo d'`avant` prise deux lignes plus haut.
     */
    const monteeAvant = st.encountered[rule.id]?.escalier ?? ESC.ESCALIER_VIERGE;
    st.encountered[rule.id] = P.majCarnet(
      st.encountered[rule.id],
      end.score,
      end.cleared,
      end.trapsSurvived,
      surPalier ? undefined : { allure: pace, ...lisRun(end.marks) },
    );
    if (surPalier) {
      st.encountered[rule.id]!.escalier = ESC.majEscalier(monteeAvant, end.score);
    } else {
      // `recent` calibre la quête de performance et la médiane de l'écran de
      // fin. Un palier plafonné à cinq manches la ferait mentir vers le bas,
      // et un palier de cinquante vers le haut.
      st.recent = [...st.recent, end.score].slice(-5);
    }

    if (mode === "daily") {
      /*
       * LE MEILLEUR DES ESSAIS, jamais le dernier.
       *
       * `st.daily = {…}` écrasait le score : avec trois essais, un second run
       * raté aurait effacé un bon premier. C'est la même loi que le carnet et
       * que la fusion des comptes — un maximum, jamais une affectation.
       *
       * Et surtout, le SERVEUR fait déjà ça : `posePerf` améliore et ne
       * remplace pas. Garder le dernier ici ferait afficher à la carte SOLO un
       * chiffre différent de celui du classement, pour le même joueur et le
       * même jour.
       */
      st.daily = P.majJour(st.daily, day, end.score, end.cleared);
      // AVOIR JOUÉ suffit à la quête de présence ; TERMINER reste un exploit et
      // se compte à part. Voir la note de `game/quests.ts`.
      bump(st, "dailyPlayed", 1);
      if (end.cleared) bump(st, "dailyCleared", 1);
      // Idempotent par jour : `touchStreak` sort sans rien faire quand
      // `lastDay` est déjà aujourd'hui, donc trois essais ne triplent rien.
      P.touchStreak(st, day);
    } else {
      /*
       * ⚠️ CHAQUE ALLURE INSCRIT SON RECORD, sous SA clé.
       *
       * `inscritRecord` existait — avec sa clé de comparabilité, sa loi du
       * maximum et sa passerelle vers le compte — et n'était appelée de NULLE
       * PART. `s.records` n'était donc rempli que par une fusion de compte,
       * jamais en jouant. Du code mort qui ressemblait à une fonctionnalité
       * livrée, la même famille que `changeIdentite`.
       *
       * Ça n'a commencé à mordre qu'hier : l'allure par défaut d'un joueur neuf
       * est passée à DÉBUT, donc son `bestTraining` — qui ne s'écrit qu'à
       * l'allure de référence — ne bougeait plus jamais. Il n'avait aucun
       * record, sur aucun écran.
       */
      // ⚠️ Un palier n'inscrit AUCUN record : il est plafonné, donc son score
      // n'est pas un score mais une cible atteinte. Poser 50 comme record
      // d'entraînement à × 0,8 comparerait deux épreuves différentes.
      if (!surPalier) P.inscritRecord(st, cleEntrainement(pace), end.score);
      if (pace === PACE_DEFAULT && !surPalier) {
        // Un record obtenu en DÉCOUVERTE ne se compare pas à un record obtenu
        // en RAPIDE. `bestTraining` reste l'allure de référence et rien
        // d'autre : trois écrans et la passerelle du compte en dépendent.
        st.bestTraining = Math.max(st.bestTraining, end.score);
      }
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
    const duree = session.log.length ? session.log[session.log.length - 1]!.t : 0;
    enfile({
      mode: "daily",
      jour: day,
      inputs: session.log,
      pose: Date.now(),
      valeur: end.score,
      valeur2: duree,
    });
    /*
     * Le run qui vient de finir a pu prendre la tête du classement : la valeur
     * en mémoire n'est plus sûre, on la jette. Sans cela, l'accueil continuait
     * d'annoncer le record d'avant — y compris quand c'est le joueur lui-même
     * qui venait de le battre, ce qui est le pire moment pour se taire.
     */
    oublieRecordDuJour();
    /*
     * ⚠️ **LE PODIUM SE REPEINT UNE FOIS LE SCORE PARTI, PAS AVANT.**
     *
     * Rapporté deux fois : « le record ne s'actualise pas dans le classement
     * exactement au moment où je termine la run ». C'était une COURSE, et elle
     * était perdue d'avance : `vide()` envoie la performance au serveur, et
     * `renderPodium` allait lire `?a=top` dans la foulée — donc presque
     * toujours AVANT que le POST n'ait abouti. L'écran de fin affichait le
     * classement d'il y a une seconde, celui qui ne contient pas encore le run
     * qu'on vient de faire.
     *
     * On attend donc l'envoi. `vide()` rend une promesse ; on la suit, et on ne
     * repeint que si le joueur est encore sur cet écran-là.
     *
     * ⚠️ Un échec ne repeint rien, et c'est juste : hors ligne ou sans compte,
     * le score n'est PAS au classement, et l'y afficher serait un mensonge que
     * le prochain chargement démentirait.
     *
     * `traiteEnvois` dit un refus au joueur et force le rechargement du
     * classement dès qu'un run est accepté.
     */
    void vide().then((r) => {
      traiteEnvois(r);
      repeintChiffres();
    });
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
   * On repeint quand elle revient : c'est l'écran visible qui lisait encore
   * les chiffres d'avant.
   */
  void synchronise().then(() => {
    repeintChiffres();
  });

  track("run_end", {
    mode,
    rule: rule.id,
    score: end.score,
    cause: end.cause,
    cleared: end.cleared,
    traps: end.trapsSurvived,
    dejoues: end.dejoues,
    piegesDejoues: end.piegesDejoues,
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
  const ancien = recordAvantRun;
  const battu = !challenge && mode !== "ranked" && ancien > 0 && end.score > ancien;
  const verdict = $("verdict");
  $("over").classList.toggle("is-win", end.cleared);
  $("over").classList.toggle("is-record", battu);
  verdict.classList.toggle("is-win", end.cleared);
  verdict.textContent = battu
    ? t("finBattu")
    : end.cleared
      ? t("finTenu")
      : end.cause === "macro"
        ? t("finRegleEnfreinte")
        : mode === "daily"
          ? t("finRompu")
          : t("finElimine");
  // Le motif vient du moteur, donc en français canonique : c'est ici, au
  // dernier moment, qu'il passe dans la langue du joueur.
  $("because").textContent = traduisMotif(end.reason);
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
  /*
   * SUR UN PALIER, LE CHIFFRE SE LIT CONTRE SA CIBLE.
   *
   * « 11 » ne dit rien ; « 11 / 15 MANCHES » dit exactement ce qui manque, et
   * « PALIER 8 FRANCHI » dit qu'on monte. C'est la seule chose que cet écran
   * doit apprendre au joueur d'un palier — le reste (record, médiane) parle
   * d'une autre épreuve.
   */
  const palFini = palierDuDernierRun;
  $("tally").textContent = String(mode === "escalade" ? paliers : end.score);
  $("tallyLabel").textContent =
    mode === "escalade"
      ? t("finReglesTenues")(paliers, end.score)
      : palFini
        ? end.cleared
          ? t("escFranchi")(palFini.n)
          : t("escRate")(end.score, palFini.manches)
        : end.cleared
          ? t("finSansFaute")
          : mode === "daily"
            ? t("finSurTotal")(DAILY_LENGTH)
            : t("finManchesTenues");
  renderMarks($("marks"), end.marks);

  /*
   * LES TROIS REPERES — ce qui transforme un nombre en resultat.
   *
   * « 23 » ne dit rien tout seul : ni si c'est bien, ni si l'on progresse. La
   * maquette le situe entre TON RECORD, TA MEDIANE et le MEILLEUR CONNU, et
   * c'est le bon triptyque — le premier dit le progres, le second l'ordinaire,
   * le troisieme l'horizon.
   *
   * ⚠️ Le record montre celui d'AVANT ce run, photographie au lancement
   * (`recordAvantRun`) : afficher celui d'apres reviendrait, quand on vient de
   * le battre, a se comparer a soi-meme et a n'annoncer aucun progres.
   *
   * La mediane vient des cinq derniers runs — `recent`, deja tenu pour la quete
   * de performance. Elle se tait sous trois runs : une mediane sur deux valeurs
   * n'est pas une mediane, c'est la moyenne de deux hasards.
   */
  const recents = s.recent;
  const triees = [...recents].sort((a, b) => a - b);
  const mediane = triees.length >= 3 ? triees[Math.floor(triees.length / 2)]! : null;
  const morceaux: string[] = [];
  /*
   * ⚠️ Chaque repere se TAIT quand il n'a rien a dire.
   *
   * « TON RECORD · 0 » a un joueur qui n'a pas encore de record ne le situe
   * pas : il lui apprend qu'il part de zero, au moment precis ou il vient de
   * jouer. Meme raison pour la mediane sous trois runs. Le meilleur connu,
   * lui, existe toujours — c'est l'horizon, pas une donnee personnelle.
   */
  /*
   * L'EXPLOIT — et le repère qu'il REMPLACE.
   *
   * Un run qui bat le record ne doit pas afficher « TON RECORD · 23 » sous
   * « TU AS BATTU TON RECORD » : les deux lignes se contredisent à un
   * centimètre d'intervalle, et la seconde a déjà dit le chiffre. Le bandeau
   * prend donc la place du repère plutôt que de s'y ajouter.
   *
   * ⚠️ Trois modes n'ont PAS de record personnel à battre, et aucun pour la
   * même raison — voir `render/exploit.ts`. Le calcul est là-bas, pur et
   * testé ; ici on ne fait que peindre ce qu'il décide.
   */
  const comparable =
    mode !== "daily" && palFini === undefined && !challenge && mode !== "ranked";
  const exploit = exploitDuRun(end.score, recordAvantRun, comparable);
  const boiteEx = $("exploit");
  boiteEx.classList.toggle("hidden", exploit.id === "rien");
  if (exploit.id !== "rien") {
    $("exploitTitre").textContent =
      exploit.id === "record" ? t("finRecordTitre") : t("finEgaleTitre");
    $("exploitAncien").textContent = t("finRecordAncien")(exploit.ancien);
    // Vide sur un record ÉGALÉ : « +0 » se lirait comme un progrès nul, alors
    // que refaire son meilleur score n'en est pas un et n'est pas un échec.
    $("exploitAvance").textContent =
      exploit.avance > 0 ? t("finRecordAvance")(exploit.avance) : "";
  }

  if (recordAvantRun > 0 && exploit.id === "rien") {
    morceaux.push(t("finReperRecord")(recordAvantRun));
  }
  if (mediane !== null) morceaux.push(t("finReperMediane")(mediane));
  morceaux.push(t("finReperMeilleur")(MEILLEUR_CONNU.score));
  $("reperes").textContent = morceaux.join(" · ");
  // La carte de partage reprend l'écart : elle n'a pas à le recalculer, deux
  // jugements finiraient par diverger.
  avanceDuRun = exploit.avance;

  /*
   * LA LEGENDE DE LA FRISE.
   *
   * La frise etait la seule surface du jeu a ne dire son affaire QUE par la
   * teinte — le mode motifs lui avait deja donne des silhouettes, mais rien ne
   * disait ce que chacune veut dire. On la nomme, avec la meme silhouette que
   * la frise juste au-dessus.
   *
   * Seules les marques PRESENTES sont legendees : une legende qui annonce une
   * chute sur un run sans faute decrit un autre run que celui qu'on vient de
   * jouer.
   */
  const vues = new Set(end.marks);
  const leg: string[] = [];
  for (const [m, cle] of [
    ["🟩", "finLegTenue"],
    ["🟦", "finLegPiege"],
    ["🟨", "finLegFaute"],
    ["🟥", "finLegChute"],
  ] as const) {
    if (vues.has(m)) leg.push(`${SILHOUETTE[m]!.glyphe} ${t(cle)}`);
  }
  $("marksLegende").textContent = leg.join("   ");

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
      ? t("defiGagne")(end.score, target)
      : tie
        ? t("defiEgalite")(target)
        : t("defiPerdu")(end.score, target);
    if (won) sfx.win();
  } else if (mode === "daily") {
    teaser.innerHTML = `DEMAIN<b></b>`;
    const demain = tomorrowRule(day);
    teaser.querySelector("b")!.textContent = nomDeRegle(demain.id, demain.name);
    teaser.classList.remove("hidden");
  } else {
    /*
     * La serie a sa TUILE (voir `bilan`) : la redire en phrase ferait deux
     * lignes pour un chiffre, sur l'ecran le plus charge du jeu.
     */
    teaser.classList.add("hidden");
  }

  /*
   * LE BILAN EN TROIS TUILES — quetes, serie, carnet.
   *
   * Les trois grandeurs qu'un run fait bouger en dehors du score, et les seules
   * que le joueur suit d'une partie a l'autre. Elles etaient dispersees : les
   * quetes en liste, la serie en phrase, le carnet nulle part — il fallait
   * quitter l'ecran pour savoir ou l'on en etait de la collection.
   *
   * ⚠️ Des CHIFFRES, pas des barres : trois jauges cote a cote se comparent
   * alors qu'elles ne mesurent pas la meme chose. « 5 / 16 » et « 4 J » ne
   * vivent pas sur la meme echelle.
   */
  const quetes = viewQuests(s, day);
  const quetesFaites = quetes.filter((q) => q.done).length;
  const carnetVues = ONE_RULES.filter((r) => !!s.encountered[r.id]).length;
  const bilan = $("bilan");
  bilan.innerHTML = "";
  for (const [valeur, libelle] of [
    [`${quetesFaites}/${quetes.length}`, t("bilanQuetes")],
    [t("finJours")(s.streak.count), t("bilanSerie")],
    [`${carnetVues}/${ONE_RULES.length}`, t("bilanCarnet")],
  ] as const) {
    const cel = document.createElement("div");
    cel.className = "bilan__cel";
    cel.innerHTML = `<b class="bilan__val"></b><span class="bilan__lab"></span>`;
    cel.querySelector<HTMLElement>(".bilan__val")!.textContent = valeur;
    cel.querySelector<HTMLElement>(".bilan__lab")!.textContent = libelle;
    bilan.appendChild(cel);
  }

  // Un duel se rejoue à volonté : c'est la même partie, la comparaison reste
  // valable. Le run du jour, lui, reste à un seul essai.
  /*
   * REJOUER reste ouvert tant qu'un essai demeure.
   *
   * C'est le seul endroit où les trois essais se vivent : proposer de revenir
   * demain juste après un run raté à quatre manches était la fin de partie la
   * plus fréquente du jeu, et la plus décourageante.
   */
  /*
   * CE QUE L'ÉCRAN PROPOSE — décidé une fois, dans `render/finactions.ts`.
   *
   * Cinq boutons s'affichaient en toutes circonstances, et seuls deux
   * changeaient d'état. Après un palier, quatre n'avaient aucun sens et le
   * cinquième portait un mot faux : « REJOUER » lançait le palier SUIVANT.
   */
  const essaisRestants = mode === "daily" ? vueDuJour(s, day).restants : 0;
  const suiteMontee = palFini
    ? ESC.palierCourant(P.escalierDe(s, rule.id))
    : undefined;
  const actes = actionsDeFin({
    mode,
    duel: !!challenge,
    surPalier: palFini !== undefined,
    palierFranchi: end.cleared,
    palierSuivant: suiteMontee !== undefined,
    essaisRestants,
    duelPossible: end.splits.length >= 3 && defiFidele,
  });

  const again = $<HTMLButtonElement>("btnAgain");
  again.disabled = actes.bloquee;
  again.textContent =
    actes.principale === "matchSuivant"
      ? t("goMatchSuivant")
      : actes.principale === "revanche"
        ? t("goRevanche")
        : actes.principale === "suivant"
          ? t("finPalierSuivant")(suiteMontee?.n ?? 0)
          : actes.principale === "reprendre"
            ? t("finPalierReprendre")(palFini?.n ?? 0)
            : actes.principale === "demain"
              ? t("goReviensDemain")
              : // « · R » est un raccourci CLAVIER : au doigt, c'est du bruit.
                TOUCH_ONLY
                ? t("goRejouer").replace(/\s*·\s*R$/, "")
                : t("goRejouer");

  $("btnVersEscalier").classList.toggle("hidden", !actes.escalier);
  $("btnVersEscalier").textContent = t("finVersEscalier");
  $("btnShare").classList.toggle("hidden", !actes.partage);
  $("btnShareCarte").classList.toggle("hidden", !actes.partage);
  $("btnDuel").classList.toggle("hidden", !actes.duel);
  $("btnShareCarte").textContent = t("finCarte");

  /*
   * L'invitation à enregistrer.
   *
   * Posée APRÈS les boutons, donc après `btnAgain` : elle ne doit ni décaler
   * ni retarder l'action évidente de cet écran, qui est de relancer.
   */
  const recordBattu = battu;
  // Le bandeau de mesure d'abord, une seule fois dans la vie du joueur ; il
  // fait céder l'invitation au compte pour ce run-là.
  const mesureDemandee = proposeMesure();
  // L'avis cède au bandeau de mesure, et l'invitation au compte cède aux deux :
  // une seule sollicitation par écran.
  const avisDemande = proposeAvis(mesureDemandee);
  renderInvite(end.score, recordBattu, mesureDemandee || avisDemande);
  renderPodium(mode);
  /*
   * ⚠️ NI « CE QUE CE RUN A FAIT AVANCER », NI « RÈGLE DÉCOUVERTE » EN ESCALADE.
   *
   * Les deux blocs décrivent l'échelle de maîtrise d'UNE règle. L'escalade en
   * tient jusqu'à quatre : en désigner une serait arbitraire, et leur passer la
   * composée revenait à afficher une carte qui n'existe pas — l'image morte
   * rapportée au playtest. Ils se taisent, comme le podium se tait plutôt que
   * de montrer un cadre vide.
   */
  const avance =
    mode === "escalade"
      ? { franchi: false, nom: "" }
      : peintAvance(rule, avant, s, pace, end.score);
  if (mode === "escalade") {
    $("avance").classList.add("hidden");
    $("decouverte").classList.add("hidden");
  }

  hud.hideStamp();
  hud.setRule(null);
  /*
   * ⚠️ **LA MUSIQUE S'ARRÊTE AVEC LE RUN, PAS AVEC L'ÉCRAN.**
   *
   * Rapporté : « la musique dans le mode escalier continue même lorsque le
   * palier est fini ». Elle ne s'arrêtait que dans `backHome()`, c'est-à-dire
   * quand on QUITTE — donc elle courait sur tout l'écran de fin, et sur le
   * suivant si l'on relançait. Le défaut se voit surtout sur un palier, qui se
   * termine net à sa cible au lieu de s'achever sur une mort.
   *
   * Elle accompagne une partie ; il n'y a plus de partie.
   */
  musicApi.stop();
  show("over");
  if (avance.franchi) {
    montreMicro({
      kind: "maitrise",
      eyebrow: t("microMaitrisee"),
      nom: avance.nom,
      quoi: t("microMaitriseQuoi"),
      stop: true,
      ms: 2400,
    });
  }
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
/**
 * LES GOUTTIERES DU SOLO — ta carte a gauche, ce run a droite.
 *
 * ⚠️ Elles vivent HORS FLUX, dans la meme bande que les plaques du
 * multijoueur : elles ne rognent pas le champ, et la taille du champ est du
 * gameplay. Elles ne paraissent que quand la gouttiere est assez large — c'est
 * `has-gutters`, decide par la geometrie et pas par le mode.
 *
 * Elles se rafraichissent A CHAQUE MANCHE et pas a chaque image : la seule
 * chose qui bouge est la liste des marques, et repeindre soixante fois par
 * seconde ce qui change une fois toutes les deux secondes est du travail rendu
 * au ramasse-miettes sur le chemin le plus chaud du jeu.
 */
/**
 * Le but chiffré d'un entraînement CIBLÉ, ou `null` s'il n'y en a pas.
 *
 * Ciblé veut dire : le mode est l'entraînement, une règle a été choisie
 * (par la fiche ou la salle de travail), et c'est bien celle qu'on joue. Un
 * entraînement au hasard n'a pas de but — il sert à découvrir, pas à valider.
 */
/**
 * Puces d'interdit — seulement dès que l'escalade en tient DEUX.
 *
 * Une seule règle tient dans le bandeau. Deux deviennent des puces sous
 * la consigne, fusionnées à `#sub` : zéro pixel de terrain.
 */
function peintPuces(s: Session): void {
  if (s.mode !== "escalade" || s.paliers < 2) {
    hud.setPuces([]);
    return;
  }
  hud.setPuces(pileA(s.pile, s.level).map((r) => t("puceDe")(r.id)));
}

function objectifExercice(): number | null {
  if (!session || session.mode !== "training") return null;
  // Un palier porte SON but, qui n'est pas celui de l'échelle de maîtrise.
  if (palierEnCours !== null) return ESC.palierN(palierEnCours)?.manches ?? null;
  const choisie = P.load().trainingRegle;
  if (!choisie || session.rule.id !== choisie) return null;
  return MANCHES_MAITRISE;
}

/**
 * LA VIGNETTE D'UNE CARTE — la même image que partout ailleurs.
 *
 * Cinq surfaces montrent déjà une carte (collection, fiche, gouttière, « celle
 * qui te résiste », l'état à mater) et chacune écrivait sa propre balise. Une
 * sixième et une septième arrivent avec l'écran de fin : autant écrire la
 * forme une fois. Le jour où les cartes changent de dossier ou de dimensions,
 * il n'y aura qu'un endroit à corriger.
 */
function carteVignette(ruleId: string): string {
  /*
   * ⚠️ UNE PILE D'ESCALADE N'A PAS DE CARTE — et elle en demandait une.
   *
   * Rapporté en playtest : « dans l'escalade, lorsqu'il y a le récap, les
   * cartes qui s'affichent sont buguées à la fin ». `combineRules` fabrique
   * l'identifiant de la composée en collant les autres avec des `+`, donc
   * l'écran allait chercher `/cartes/azur+pointe+voyelle+colosse.png` : 404, et
   * un rectangle mort à la place de l'illustration.
   *
   * On ne rend RIEN plutôt qu'une image cassée. Le bloc qui l'entoure a déjà
   * son texte, et un cadre vide se lit comme un chargement raté — c'est
   * exactement pourquoi le podium se tait quand il n'a rien à montrer.
   */
  if (!ONE_RULES.some((r) => r.id === ruleId)) return "";
  return `<img class="vignette" src="/cartes/${ruleId}.png" width="64" height="64" alt="" decoding="async" />`;
}

function majGouttieres(): void {
  const el = $("gout");
  if (!session) {
    el.classList.add("hidden");
    return;
  }
  const r = session.rule;
  const rec = P.load().encountered[r.id];
  const cases = echelleMaitrise(r, rec);

  /*
   * UNE CARTE PARFAITE N'A PLUS RIEN A DIRE — la gouttiere s'efface.
   *
   * Tout ce que porte cette colonne est une PROGRESSION : la jauge de
   * maitrise, et la ligne « ce run fait avancer telle case ». Sur une carte
   * parfaite les six cases sont franchies, `prochaineCase` ne rend rien, et la
   * note tombe deja sur « rien a avancer » — on affichait donc une colonne
   * entiere pour annoncer qu'elle ne sert a rien, a cote du terrain, pendant
   * toute la partie.
   *
   * Demande en soiree, et c'est la bonne lecture : ce qui est acquis n'a plus
   * besoin d'etre suivi. La carte reste consultable dans la collection, ou
   * elle est justement montree comme parfaite.
   *
   * ⚠️ La colonne DROITE (les marques de ce run) disparait avec elle, et c'est
   * assume : elle redit ce que le pied et l'ecran de fin portent deja, alors
   * que la gauche etait la seule raison d'ouvrir cette bande.
   */
  if (etatCarte(franchies(cases)) === "parfaite") {
    el.classList.add("hidden");
    return;
  }

  el.classList.remove("hidden");

  $<HTMLImageElement>("goutImg").src = `/cartes/${r.id}.png`;
  $("goutNom").textContent = nomDeRegle(r.id, r.name);
  const jauge = $("goutJauge");
  jauge.innerHTML = "";
  for (const c of cases) {
    const i = document.createElement("i");
    if (c.faite) i.className = "is-on";
    jauge.appendChild(i);
  }
  // La PROCHAINE case, celle que ce run peut faire tomber. C'est la seule
  // ligne de l'ecran qui relie le geste en cours a la collection.
  const suivante = prochaineCase(cases);
  $("goutNote").textContent = suivante
    ? t("goutFaitAvancer")(libelleCase(suivante.c))
    : t("goutRienAAvancer");

  /*
   * Les marques du moteur, telles quelles : 🟩 propre, 🟦 piege dejoue,
   * 🟨 faute d'echauffement. Aucune donnee nouvelle — c'est ce que l'ecran de
   * fin affiche deja, montre pendant au lieu d'apres.
   */
  const marques = $("goutMarques");
  marques.innerHTML = "";
  for (const m of session.marks.slice(-40)) {
    const i = document.createElement("i");
    i.className = m === "🟦" ? "est-piege" : m === "🟨" ? "est-faute" : "est-tenue";
    marques.appendChild(i);
  }

  // Le fantome d'un defi : ou en est l'adversaire, et qui mene.
  const f = $("goutFantome");
  f.classList.toggle("hidden", !challenge);
  if (challenge) {
    $("goutFantomeQui").textContent = challenge.who ?? "";
    $("goutFantomeEtat").textContent = String(session.level);
  }
}

/**
 * CE QUE CE RUN A FAIT AVANCER.
 *
 * La question à laquelle l'écran de fin doit répondre est « qu'est-ce que je
 * viens de gagner ? ». Le score seul n'y répond pas : il dit ce qu'on a FAIT,
 * pas ce qu'on a ACQUIS — et c'est la différence entre « j'ai joué à TOR » et
 * « je suis en train de maîtriser TOR ».
 *
 * ⚠️ Il se TAIT quand le run n'a rien fait avancer. Un bloc qui annonce une
 * progression nulle est pire que pas de bloc : il transforme un run ordinaire
 * en échec.
 *
 * @param avant l'entrée de carnet AVANT ce run — `majCarnet` l'a remplacée
 * depuis, et sans cette photo il n'y a plus aucun moyen de savoir ce qui a bougé
 */
function peintAvance(
  regle: OneRule,
  avant: P.RuleRecord | undefined,
  apres: P.Save,
  allure: number,
  score: number,
): { franchi: boolean; nom: string } {
  const rec = apres.encountered[regle.id];
  const echelle = echelleMaitrise(regle, rec);
  const casesAvant = franchies(echelleMaitrise(regle, avant));
  const casesApres = franchies(echelle);
  /*
   * Le total vient de l'ECHELLE, jamais d'un 6 ecrit ici. Elle en produit six
   * aujourd'hui ; le jour ou elle en produira dix — l'escalier de maitrise est
   * au programme — cette jauge suivra sans qu'on y pense, et une jauge qui
   * ment sur son propre total est pire que pas de jauge.
   */
  const totalCases = echelle.length;

  /*
   * UNE RÈGLE DÉCOUVERTE est un événement à part : c'est une carte de plus dans
   * la collection, et la seule chose du jeu qui ne se rejoue pas. On l'annonce
   * séparément, pas comme un progrès parmi d'autres.
   */
  const neuve = !avant && !!rec;
  derniereDecouverte = neuve ? regle.id : derniereDecouverte;
  const vues = ONE_RULES.filter((r) => !!apres.encountered[r.id]).length;
  $("decouverte").classList.toggle("hidden", !neuve);
  if (neuve) {
    $("decouverteCarte").innerHTML = carteVignette(regle.id);
    $("decouverteNom").textContent = nomDeRegle(regle.id, regle.name);
    $("decouverteNote").textContent = t("decouverteNote")(score, vues, ONE_RULES.length);
  }

  // Ce qui a bougé, dans l'ordre où ça compte : une case franchie d'abord, les
  // pièges ensuite, le record d'allure en dernier.
  const piegesGagnes = (rec?.pieges ?? 0) - (avant?.pieges ?? 0);
  const cleAllure = String(allure);
  const allureAvant = avant?.parAllure?.[cleAllure] ?? 0;
  const allureApres = rec?.parAllure?.[cleAllure] ?? 0;
  const morceaux: string[] = [];
  if (casesApres > casesAvant) morceaux.push(t("avanceCase"));
  if (piegesGagnes > 0) morceaux.push(t("avancePieges")(piegesGagnes));
  if (allureApres > allureAvant) {
    morceaux.push(t("avanceManches")(allureApres, nomAllure(allure, String(allure))));
  }

  // Une règle NEUVE a déjà son annonce : répéter « une case de plus » sous
  // elle dirait deux fois la même chose.
  const montre = morceaux.length > 0 && !neuve;
  const bloc = $("avance");
  bloc.classList.toggle("hidden", !montre);
  /*
   * ⚠️ LA CARTE A CHANGÉ D'ÉTAT — l'aboutissement de la boucle longue.
   *
   * Franchir une case est un progrès parmi d'autres. Passer de EN COURS à
   * MAÎTRISÉE, ou de MAÎTRISÉE à PARFAITE, est autre chose : c'est le moment
   * où « je me suis fait avoir par cette règle » devient « je la tiens ». Le
   * bloc le dit alors AVANT le reste, et prend l'accent.
   *
   * Le même bloc, pas un second : deux annonces empilées sur l'écran de fin
   * diraient deux fois qu'on a progressé, et la seconde volerait la première.
   */
  const etatAvant = etatCarte(casesAvant);
  const etatApres = etatCarte(casesApres);
  const franchi =
    etatApres !== etatAvant && (etatApres === "maitrisee" || etatApres === "parfaite");
  bloc.classList.toggle("is-franchi", montre && franchi);
  const nom = nomDeRegle(regle.id, regle.name);
  if (!montre) return { franchi: false, nom };
  $("avanceCarte").innerHTML = carteVignette(regle.id);
  /*
   * LES SIX CASES, ET CELLES QUE CE RUN VIENT DE FAIRE TOMBER.
   *
   * Le bloc disait « MAÎTRISE 3 / 6 » en toutes lettres ; la maquette le montre.
   * Une case NEUVE se distingue d'une case déjà acquise — c'est la seule chose
   * que cet écran ait à célébrer, et un compteur qui passe de 2 à 3 ne la
   * montre pas.
   */
  const jauge = $("avanceJauge");
  jauge.innerHTML = "";
  for (let i = 0; i < totalCases; i++) {
    const c = document.createElement("i");
    /*
     * Trois etats, et une CLASSE pour chacun — pas deux classes et un implicite.
     * Une case acquise et une case vide sont toutes deux « sans est-neuve » :
     * les distinguer par leur rang en CSS (`nth-child`) marcherait aujourd'hui
     * et se tromperait le jour ou l'echelle change de longueur.
     */
    if (i >= casesApres) c.className = "est-vide";
    else if (i >= casesAvant) c.className = "est-neuve";
    else c.className = "est-faite";
    jauge.appendChild(c);
  }
  $("avanceRegle").textContent = franchi
    ? t(etatApres === "parfaite" ? "avanceParfaite" : "avanceMaitrisee")(nom)
    : t("avanceRegle")(nom, casesApres);
  $("avanceQuoi").textContent = morceaux.join(" ");
  const btn = $("btnAvanceTrain");
  btn.textContent = t("avanceTravailler")(nom);
  btn.dataset.regle = regle.id;
  return { franchi, nom };
}

$("btnAvanceTrain").addEventListener("click", () => {
  const id = $("btnAvanceTrain").dataset.regle;
  const r = ONE_RULES.find((x) => x.id === id);
  // On ouvre la FICHE : elle dit ce qui manque et à quelle allure, et c'est
  // elle qui lance. Le même chemin que « celle qui te résiste ».
  if (r) ouvreFiche(r);
});

/**
 * LE PIÈGE DÉJOUÉ — DU SON ET UNE VIBRATION, PLUS UN PANNEAU.
 *
 * Il y avait ici une annonce écrite : « TU N'AS RIEN FAIT · PIÈGE DÉJOUÉ », la
 * consigne qui piégeait, et l'avancement de la carte. Elle a d'abord été
 * déplacée hors du terrain parce qu'elle le recouvrait, puis retirée : demandé
 * après essai, « juste un petit retour haptique suffit ».
 *
 * C'est le bon arbitrage, et il tient en une phrase : le joueur qui vient de
 * NE RIEN FAIRE sait déjà pourquoi. Lui expliquer son propre geste au moment où
 * la manche suivante s'ouvre, c'est occuper les deux secondes pendant
 * lesquelles il doit lire autre chose. Le retour doit se sentir, pas se lire.
 *
 * Restent trois canaux, tous instantanés et tous hors du chemin de lecture :
 * `sfx.trapAvoided()` (le seul son de félicitation du jeu), le flash violet et
 * la secousse du canvas, et cette vibration.
 */

/**
 * Vibration courte, si l'appareil sait le faire.
 *
 * ⚠️ Silencieuse en cas d'échec, et jamais conditionnée à autre chose que la
 * présence de l'API : `navigator.vibrate` n'existe pas sur iOS et lève sur
 * certains navigateurs de bureau quand la page n'a pas encore reçu de geste.
 * Un retour d'agrément ne doit jamais pouvoir interrompre une manche.
 *
 * Deux impulsions brèves séparées d'une pause, comme les deux notes montantes
 * du son : c'est le même événement, dit deux fois au même rythme.
 */
function vibrePiegeDejoue(): void {
  try {
    navigator.vibrate?.([18, 40, 26]);
  } catch {
    /* appareil sans vibreur, ou geste utilisateur pas encore reçu */
  }
}

function react(outcome: Outcome, comboBefore: number, manche: Round): void {
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
      // Tenu jusqu'au bout : le feu s'attise, moins qu'un déjouage déclaré.
      attiseFlammes(0.6);
      vibrePiegeDejoue();
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
    outcome.cause === "macro"
      ? t("tamponInfraction")
      : outcome.cause === "timeout"
        ? t("tamponLent")
        : t("tamponRate"),
  );
}

/**
 * DÉJOUER — le joueur DIT qu'il a vu qu'il ne fallait rien faire.
 *
 * Le verdict est celui du moteur (`Session.dejouer`) ; ici on ne fait que le
 * faire SENTIR. Une réussite est la célébration du piège déjoué, en plus fort :
 * c'est le seul geste du jeu qui prouve qu'on a lu la règle au lieu d'attendre
 * que le temps passe. Un « NE FAIS RIEN » déjoué a droit au même éclat, plus
 * discret — ce n'était pas un piège, mais c'était bien vu.
 */
function dejoue(): void {
  if (!session || session.phase !== "playing" || !session.dejoueActif) return;
  const combo = session.level;
  const manche = session.round;
  const out = session.dejouer(performance.now());
  if (out.kind !== "survive") {
    react(out, combo, manche);
    return;
  }
  const t0 = performance.now();
  if (out.trap) sfx.trapAvoided();
  else sfx.success(combo);
  scene.burstScreen(out.trap ? "#CFC9F2" : "#8F86C9");
  scene.flashViolet(t0);
  scene.kick(t0, out.trap ? 0.6 : 0.3);
  attiseFlammes(out.trap ? 1 : 0.5);
  vibrePiegeDejoue();
  appEl.classList.remove("a-dejoue");
  void appEl.offsetWidth;
  appEl.classList.add("a-dejoue");
}

/**
 * Pose le bouton DÉJOUER dans la plus grande place libre À CÔTÉ du terrain.
 *
 * ⚠️ JAMAIS SUR LE TERRAIN. Un bouton posé sur le champ volerait des pièces,
 * et la taille du champ est du gameplay (n°10) : il se loge donc dans ce que
 * le terrain laisse libre, et le champ ne bouge pas d'un pixel qu'il soit là
 * ou non. Trois places, par ordre de préférence :
 *
 *   1. la gouttière latérale du côté choisi, quand elle est assez large — le
 *      pouce y tombe sans quitter le bord ;
 *   2. la bande sous le terrain, dans le coin du côté choisi ;
 *   3. à défaut, par-dessus le tiers du pied de ce côté.
 *
 * ⚠️ PAS À CHAQUE IMAGE, et jamais avant `scene.resize()`. Premier essai
 * mémoïsé sur la clé de `syncField` et appelé par la boucle : au lancement, la
 * boîte du canvas avait déjà grandi (606 → 710 px) mais le terrain calculé
 * datait encore de l'ancienne taille — le bouton s'est posé 53 px trop haut,
 * SUR le terrain, et la mémoïsation l'y a gardé. Mesuré à 375 × 812. Il est
 * donc appelé par `syncField` après le redimensionnement, et aux changements
 * d'état (lancement, fin, écran, côté), avec un `resize` explicite.
 */
function poseDejoue(): void {
  const b = $("btnDejouer");
  const voir =
    TACTILE &&
    screen === null &&
    (!!session?.dejoueActif || (tuto !== null && tuto.temps === 3 && P.load().dejoue.on));
  const cote = P.load().dejoue.cote;
  b.classList.toggle("hidden", !voir);
  b.classList.toggle("dejoue--gauche", cote === "gauche");
  if (!voir) return;

  scene.resize();
  const MARGE = 8;
  const MIN = 60;
  const f = scene.fieldRect();
  const a = appEl.getBoundingClientRect();
  const c = cv.getBoundingClientRect();
  const cx = c.left - a.left;
  const cy = c.top - a.top;
  const libreG = f.x;
  const libreD = c.width - f.x - f.w;
  const libreSous = c.height - f.y - f.h;
  const lateral = cote === "gauche" ? libreG : libreD;
  let x: number, y: number, w: number, h: number;
  let forme: "haut" | "large";
  /*
   * Debout, le terrain laisse ~66 px de chaque côté à 375 px : assez pour un
   * doigt (44 px, `--tap`), pas pour la marge du cas général. La bande
   * latérale n'a donc que 5 px d'air — c'est elle que le pouce trouve sans
   * regarder, et la hauteur compense la largeur.
   */
  if (lateral >= 56) {
    forme = "haut";
    w = Math.min(lateral - 10, 104);
    h = Math.max(MIN, Math.min(f.h * 0.42, 220));
    x = cote === "gauche" ? cx + (libreG - w) / 2 : cx + f.x + f.w + (libreD - w) / 2;
    y = cy + f.y + f.h - h;
  } else if (libreSous >= MIN + 2 * MARGE) {
    forme = "large";
    h = Math.min(libreSous - 2 * MARGE, 76);
    w = Math.min(c.width * 0.46, 200);
    y = cy + f.y + f.h + MARGE;
    x = cote === "gauche" ? cx + MARGE : cx + c.width - MARGE - w;
  } else {
    forme = "large";
    const p = $("foot").getBoundingClientRect();
    h = p.height;
    w = p.width / 3;
    y = p.top - a.top;
    x = cote === "gauche" ? p.left - a.left : p.right - a.left - w;
  }
  b.classList.toggle("dejoue--haut", forme === "haut");
  b.style.left = `${Math.round(x)}px`;
  b.style.top = `${Math.round(y)}px`;
  b.style.width = `${Math.round(w)}px`;
  b.style.height = `${Math.round(h)}px`;
}

$("btnDejouer").addEventListener("pointerdown", (ev) => {
  ev.preventDefault();
  unlock();
  if (tuto) tutoDejoue();
  else dejoue();
});

function send(action: Action): void {
  if (!session || session.phase !== "playing") return;
  const combo = session.level;
  // Même capture que dans la boucle : `input` peut conclure la manche, et
  // `survive()` ouvre la suivante avant de rendre son verdict.
  const manche = session.round;
  react(session.input(action, performance.now()), combo, manche);
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

  // Le tutoriel d'abord : pendant ses deux temps joués, aucune session
  // n'existe et c'est lui qui juge.
  if (tuto?.manche) {
    const { x, y } = scene.toField(e.clientX, e.clientY);
    scene.flash(x, y, performance.now());
    const ent = scene.hit(tuto.manche.round.ents, x, y);
    if (ent) scene.burst(x, y, colorHex(ent.color), 10, 190);
    tutoClic(ent ? ent.idx : null);
    return;
  }

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

$("cv").addEventListener("pointermove", (ev) => {
  if (!multi.isPlayingMulti()) return;
  const { x, y } = scene.toField((ev as PointerEvent).clientX, (ev as PointerEvent).clientY);
  multi.sendCursor(x, y);
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
    // Le clavier respecte l'état du bouton, comme R le fait pour `btnAgain` :
    // sans cette garde, ESPACE relançait un run du jour dont les trois essais
    // étaient consommés, en contournant le verrou posé sur COMMENCER.
    if ((e.key === " " || e.key === "Enter") && !$<HTMLButtonElement>("btnGo").disabled) {
      startRun();
    }
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

  if (multi.observeTouche(e.key)) {
    e.preventDefault();
    return;
  }

  if (e.key === " ") return; // espace = touche de maintien, jamais une réponse
  if (tuto) {
    if (e.key === "Escape") finitOnboarding(true);
    else if (e.key.length === 1 && e.key.toUpperCase() === P.load().dejoue.touche && P.load().dejoue.on) tutoDejoue();
    return;
  }
  if (e.key === "Escape") {
    abandon();
    return;
  }
  if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
    // La touche du déjouage n'est jamais une réponse : elle est sortie du
    // tirage, donc aucune consigne ne peut la demander.
    if (session?.dejoueActif && e.key.toUpperCase() === session.toucheReservee) {
      dejoue();
      return;
    }
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

/*
 * ⚠️ LE MEME OBSERVATEUR PLACE LA BARRE.
 *
 * `matchMedia` et l'evenement `resize` sont les bons signaux, mais aucun des
 * deux n'est garanti : mesure dans le volet du navigateur, passer de 1280 a
 * 375 n'en emettait AUCUN — la barre restait en haut, sans barre basse et sans
 * JOUER sous le pouce. Un evenement dispatche a la main la remettait
 * correctement, donc le code etait juste et c'est le signal qui manquait.
 *
 * `ResizeObserver` sur le canvas est le chemin auquel ce depot fait deja
 * confiance pour les gouttieres, et il observe une boite qui suit la fenetre.
 * `poseBarre` etant idempotente, l'y accrocher ne coute rien.
 */
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => syncField()).observe(cv);
  /*
   * ⚠️ ON OBSERVE `#app`, PAS LE CANVAS.
   *
   * Le canvas est masqué sur les écrans de menu : sa boîte ne change donc pas
   * quand la fenêtre change, et l'observateur ne se déclenche jamais là où la
   * barre doit bouger. Mesuré — passer de 1280 à 375 sur l'accueil laissait la
   * barre en haut, sans barre basse et sans JOUER sous le pouce.
   *
   * `#app` suit la fenêtre sur tous les écrans, y compris les menus. Et
   * `poseBarre` étant idempotente, l'observer ne coûte rien : elle ne touche
   * au DOM que si le parent n'est pas déjà le bon.
   */
  new ResizeObserver(() => poseBarre()).observe(appEl);
}
window.addEventListener("resize", () => syncField());
window.visualViewport?.addEventListener("resize", () => {
  syncField();
  poseBarre();
});
syncField();
/*
 * ⚠️ QUITTER LA FENETRE RELACHE LA BARRE — et il faut le DIRE au run.
 *
 * On remettait le drapeau a faux sans envoyer d'action : la barre etait donc
 * levee pour de bon, et comme aucun `keyup` ne surviendrait plus jamais, LA
 * MAIN GAUCHE devenait inerte pour le reste du run. Meme trou que l'echauffement
 * qui pardonnait, par un autre chemin.
 *
 * ⚠️ Ce n'est PAS la decision n°4 (« une coupure n'est pas une defaite ») : elle
 * protege le joueur d'un incident RESEAU, pas de sa propre main. Changer
 * d'onglet en pleine manche, c'est cesser de jouer — la manche serait perdue au
 * chrono de toute facon. Et l'action part dans le journal, donc `verifyRun`
 * juge exactement ce que l'ecran a montre.
 */
window.addEventListener("blur", () => {
  const tenait = spaceDown;
  spaceDown = false;
  if (!tenait) return;
  if (session?.phase === "playing") send({ kind: "release", key: " " });
  else if (multi.isPlayingMulti()) sendOrMulti({ kind: "release", key: " " });
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
  // Un défi se joue sans le raccourci : voir `lanceRun`.
  $("briefDejoue").classList.add("hidden");
  pendingMode = "training";
  pendingRule = rule;
  $("briefEyebrow").textContent = r.who ? t("defiDe")(r.who.toUpperCase()) : t("defiRecu");
  $("briefName").textContent = nomDeRegle(rule.id, rule.name);
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
    // Revanche : même graine, même règle, sinon on ne compare plus rien. Et
    // SANS battement de lecture — on repart de l'écran de fin, où le bouton qui
    // porte le rebours n'est pas affiché.
    startRun(false);
    return;
  }
  /*
   * LE RUN DU JOUR SE REJOUE TANT QU'IL RESTE UN ESSAI.
   *
   * Rapporté du playtest : « le bouton pour rejouer qui bug en silence, par
   * exemple sur la run du jour en solo ». C'était exact, et la faute était
   * ici : cette ligne sortait sans rien faire.
   *
   * La cause est un ajout fait à moitié. Les trois essais quotidiens
   * (`DAILY_ESSAIS`) ont rendu le bouton ACTIF tant qu'un essai demeure — il
   * n'est désactivé qu'à zéro, et il affiche « REJOUER » — mais `replay()` a
   * gardé le garde-fou de l'époque où le run du jour ne se jouait qu'une fois.
   * Les deux moitiés se contredisaient : le bouton promettait, la fonction
   * refusait, et rien ne le disait. Le pire des trois états — un refus muet se
   * lit comme un jeu cassé, pas comme une règle.
   *
   * On repasse par l'annonce, comme l'entraînement et pour la même raison :
   * enchaîner sans revoir sa règle unique était déjà un bug corrigé.
   * `essaisDuJour` reste seul juge du droit à rejouer, et il est déjà appliqué
   * sur le bouton — inutile de le redire ici, ce serait une seconde moitié de
   * plus à tenir d'accord avec la première.
   */
  /*
   * ⚠️ REJOUER SUR UN PALIER REPREND LA MONTÉE, PAS LE PALIER JOUÉ.
   *
   * On relit l'état APRÈS coup plutôt que de réutiliser `palierEnCours` : un
   * palier qui vient d'être franchi doit enchaîner sur le SUIVANT, un palier
   * raté doit se reprendre. Les deux cas se déduisent de la sauvegarde, et
   * s'en déduire évite d'avoir à distinguer une victoire d'un échec ici — ce
   * que `majEscalier` a déjà tranché une fois.
   */
  if (palierEnCours !== null && escalierRegle) {
    const e = P.escalierDe(P.load(), escalierRegle.id);
    const suite = ESC.palierCourant(e);
    if (suite) {
      palierDemande = suite.n;
      openBrief("training");
      return;
    }
    // Au sommet : il n'y a plus de palier à jouer, on rend la montée.
    ouvreEscalier(escalierRegle);
    return;
  }
  openBrief(pendingMode === "daily" ? "daily" : "training");
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
/*
 * LES DEUX PORTES DE JEU PASSENT PAR LA PREMIÈRE ARRIVÉE.
 *
 * Elle n'est PAS déclenchée à l'arrivée sur le site, et c'est délibéré : le
 * joueur doit avoir choisi de jouer. Un tutoriel imposé avant même qu'on ait vu
 * de quoi il s'agit, c'est reproduire la faute du bandeau de mesure — un objet
 * posé entre le visiteur et les portes, qui a coûté 76 % d'entrées.
 *
 * L'accueil vend, la première partie enseigne.
 */

/*
 * ------------------------------------------------------------------
 * OÙ LE VISITEUR S'ARRÊTE — le premier geste, et lui seul.
 * ------------------------------------------------------------------
 *
 * Le chiffre qui domine toute la mesure : 74 % des nouveaux (118 sur 159)
 * repartent sans lancer une seule partie, médiane 6 secondes, la moitié en
 * moins de 5. On savait QUAND ils partaient, jamais D'OÙ — et « il n'a rien
 * trouvé à cliquer » se répare à l'opposé de « il a cliqué et s'est ravisé ».
 *
 * ⚠️ UN SEUL événement par visite, le PREMIER. Un accueil qui rapporte chaque
 * clic produit surtout du bruit de navigation, et la question posée ici tient
 * en un geste : celui qui suit l'arrivée. Croisé avec `visit_end`, il dit si
 * l'écran a échoué à proposer, ou à convaincre.
 *
 * Posé en CAPTURE sur `#home` : les boutons de l'accueil arrêtent leur clic
 * (`stopPropagation` dans la faille), et une écoute en bouillonnement en
 * manquerait une partie — c'est-à-dire précisément les portes du jeu.
 */
let premierClicFait = false;
$("home").addEventListener(
  "click",
  (e) => {
    if (premierClicFait) return;
    premierClicFait = true;
    const el = e.target as HTMLElement | null;
    const cible = el?.closest<HTMLElement>("button,a,[role=button]");
    track("accueil_premier_clic", {
      // L'identifiant quand il existe, la classe sinon : un clic dans le vide
      // est une information, pas une absence de donnée.
      quoi: cible?.id || cible?.className.split(" ")[0] || "(vide)",
      neuf: Object.keys(P.load().encountered).length === 0,
      // Depuis combien de temps la page est ouverte : une hésitation de dix
      // secondes et un clic immédiat ne se lisent pas pareil.
      ms: Math.round(performance.now()),
    });
  },
  true,
);

$("btnPlay").addEventListener("click", () => {
  sfx.ui();
  if (estNouveau()) {
    ouvreOnboarding();
    return;
  }
  openBrief("training");
});
/* ------------------------------------------------------------------ *
 * LA PROFONDEUR — les cinq portes du bas de l'accueil
 *
 * ⚠️ ELLES REMPLACENT LA FAILLE, ET C'EST UN ÉLARGISSEMENT. L'objet fendu
 * n'offrait que SOLO et MULTI, et « SOLO » cachait derrière lui trois modes
 * qu'un nouveau venu ne pouvait pas deviner — mesuré au playtest : 538 runs
 * d'entraînement contre 13 du run du jour et 18 d'escalade. Les cinq modes se
 * nomment désormais eux-mêmes.
 *
 * ⚠️ AUCUNE NE PORTE L'ACCENT. Elles viennent APRÈS le centre de gravité et
 * n'ont pas le droit de lui disputer l'attention : PLAY reste la réponse par
 * défaut, elles sont des détours qu'on prend en connaissance de cause.
 * ------------------------------------------------------------------ */

$("profJour").addEventListener("click", () => {
  sfx.ui();
  /*
   * ⚠️ ELLE OUVRE L'ÉCRAN SOLO, PAS DIRECTEMENT L'ANNONCE.
   *
   * Deux raisons, et la seconde est un bug évité de justesse. D'abord ce que
   * l'écran porte : combien d'essais il reste aujourd'hui, la série, les
   * quêtes — tout ce qu'on veut savoir AVANT de brûler un des trois essais.
   * Sauter au brief les cacherait au moment précis où ils comptent.
   *
   * Ensuite : depuis que l'accueil n'a plus de bouton SOLO, c'est la SEULE
   * porte vers cet écran. Le faire sauter le rendait inatteignable — un écran
   * entier orphelin, que seule son adresse `/solo` aurait encore ouvert.
   */
  renderSolo();
  show("solo");
});

$("profClassement").addEventListener("click", () => {
  sfx.ui();
  renderClassement();
  show("classement");
});

$("profEscalade").addEventListener("click", () => {
  sfx.ui();
  openBrief("escalade");
});

$("profCartes").addEventListener("click", () => {
  sfx.ui();
  renderCodex();
});




$("btnResteTravailler").addEventListener("click", () => {
  // La FICHE, pas l'exercice : elle dit ce qui manque, et c'est elle qui lance.
  ouvreFiche(ruleOfDay(day));
});

$("btnCodex").addEventListener("click", () => ouvreCodex("collection", "solo"));
$("btnCodexVide").addEventListener("click", () => {
  sfx.ui();
  if (estNouveau()) {
    ouvreOnboarding();
    return;
  }
  openBrief("training");
});

/*
 * LE MUR s'ouvre depuis SOLO — c'est-a-dire la ou l'on decide de jouer.
 *
 * Le podium ne paraissait que sur l'ecran de FIN, apres un run du jour : 106
 * joueurs sur 139 n'ont jamais lance une partie, donc ne l'ont jamais vu. Ce
 * sont eux qu'un record a battre concerne.
 */
$("btnMur").addEventListener("click", () => {
  sfx.ui();
  renderClassement();
  show("classement");
});
$("btnMurBack").addEventListener("click", () => {
  sfx.ui();
  renderSolo();
  show("solo");
});
$("btnMurJouer").addEventListener("click", () => {
  sfx.ui();
  // Le RUN DU JOUR : c'est l'epreuve du podium juste au-dessus. Envoyer vers
  // l'entrainement proposerait de battre un chiffre dans un autre mode, ce que
  // tout ce module existe pour interdire.
  openBrief("daily");
});
$("btnCodexBack").addEventListener("click", () => {
  sfx.ui();
  if (codexDepuis === "solo") {
    renderSolo();
    show("solo");
    return;
  }
  renderHome();
  show("home");
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
    danger.textContent = t("cptSupprimerAvert1") + t("cptSupprimerAvert2");
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

/*
 * CHANGER DE NOM — depuis le compte, sur l'écran qui sait déjà le faire.
 *
 * Rapporté par Pierre : « impossible de changer nom après connexion ». Deux
 * défauts se cachaient derrière, et le second est le pire :
 *
 * 1. le nom n'était saisissable QUE sur le chemin du multijoueur, donc un
 *    joueur solo qui se connectait arrivait avec un pseudo VIDE — vérifié en
 *    production, le classement rendait `{"rang":1,"pseudo":"",…}` ;
 * 2. `changeIdentite` existait, avec sa route serveur complète, et n'était
 *    appelée de NULLE PART.
 *
 * On rouvre l'écran NOM ET SIGNE du multi plutôt que d'en bâtir un second :
 * deux champs de nom finiraient par diverger, et c'est là que vivent déjà la
 * grille des signes et la limite de quatorze caractères.
 */
$("btnCompteNom").addEventListener("click", () => {
  sfx.ui();
  // On repasse par `ouvreCompte` plutôt que de rappeler `show` : c'est le
  // point d'entrée unique de cet écran, et `tests/invariants-compte` vérifie
  // qu'il le reste — le compte ne doit jamais s'ouvrir autrement que par un
  // clic délibéré.
  multi.ouvreIdentite(() => void ouvreCompte());
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
  poseInter("btnSound", s.sound);
  sfx.ui();
});

$("btnMusic").addEventListener("click", () => {
  const s = P.mutate((st) => {
    st.music = !st.music;
  });
  setMusicEnabled(s.music);
  poseInter("btnMusic", s.music);
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
  const text = t("partageTexte")(lastRun.end.score, nomDeRegle(lastRun.rule.id, lastRun.rule.name), url);
  try {
    if (TOUCH_ONLY && navigator.share) await navigator.share({ text });
    else await navigator.clipboard.writeText(text);
    // Après le partage, jamais avant : un `navigator.share` annulé lève, et
    // compter l'intention comme un envoi gonflerait le haut de l'entonnoir
    // exactement là où on cherche à savoir si le bas se remplit.
    track("duel_sent", { rule: lastRun.rule.id, score: lastRun.end.score });
    montreToast(t("toastLien"), url);
  } catch {
    /* partage annulé */
  }
});

/* ------------------------------------------------------------------ *
 * LA CARTE DE PARTAGE
 *
 * ⚠️ **LE PARTAGE TEXTE EST À 0 % SUR TROIS RELEVÉS ET 203 JOUEURS** — jour 2
 * (14 joueurs), jour 3 (50), jours 238-245 (139). Le bouton existait à chaque
 * fois. Ce n'est donc pas un creux : c'est une fonctionnalité que personne
 * n'utilise, et la répéter plus fort ne changerait rien.
 *
 * L'hypothèse qu'on teste ici : ce qui manquait n'est pas le bouton mais
 * l'OBJET. Trois lignes de texte et quatre carrés d'emoji, collés dans une
 * conversation, ne se distinguent d'aucun autre message. Une image se
 * reconnaît, et surtout elle porte l'adresse du jeu sur elle — ce que le texte
 * ne faisait que sur le lien de DÉFI, jamais sur le partage de score.
 *
 * ⚠️ **LE BOUTON TEXTE RESTE.** Il coûte une ligne, il marche partout, et
 * remplacer une chose à 0 % par une autre sans garder la première rendrait la
 * comparaison impossible : `share` et `share_carte` sont deux événements, et
 * c'est le rapport qui tranchera.
 * ------------------------------------------------------------------ */

/**
 * Fabrique l'image et la propose.
 *
 * Trois issues, dans cet ordre : le partage natif avec le FICHIER quand le
 * navigateur l'accepte (le seul chemin qui envoie vraiment l'image), le
 * téléchargement sinon, et un message honnête si même ça échoue. On ne retombe
 * PAS sur le partage texte : le joueur a demandé une carte, lui envoyer trois
 * lignes à la place serait un refus déguisé en succès.
 */
async function partageCarte(): Promise<void> {
  if (!lastRun) return;
  const btn = $<HTMLButtonElement>("btnShareCarte");
  const rendre = (cle: "finCartePrete" | "finCarteRatee"): void => {
    btn.textContent = t(cle);
    setTimeout(() => (btn.textContent = t("finCarte")), 1800);
  };

  const { end, rule, mode } = lastRun;
  const d = donneesCarte({
    mode: mode === "escalade" || mode === "ranked" || mode === "daily" ? mode : "training",
    jour: day,
    regle: nomDeRegle(rule.id, rule.name),
    score: end.score,
    cleared: end.cleared,
    marks: end.marks,
    allure: P.load().trainingPace,
    palier: palierDuDernierRun
      ? { n: palierDuDernierRun.n, manches: palierDuDernierRun.manches }
      : undefined,
    avance: avanceDuRun,
    url: location.protocol === "file:" ? "theonerule.party" : location.origin,
  });

  try {
    /*
     * ⚠️ ON ATTEND LES POLICES.
     *
     * Un canvas qui dessine avant que « Inter » et « JetBrains Mono » soient
     * prêtes retombe sur la police système SANS ERREUR — l'image part, et elle
     * est hors marque. C'est la même famille que les emoji écartés des
     * pictogrammes de l'accueil : un rendu qui change d'un appareil à l'autre
     * n'est pas un effet, c'est un bug.
     */
    await document.fonts?.ready;
    const cvs = document.createElement("canvas");
    dessineCarte(cvs, d);
    const blob = await new Promise<Blob | null>((res) => cvs.toBlob(res, "image/png"));
    if (!blob) {
      rendre("finCarteRatee");
      return;
    }
    const fichier = new File([blob], `the-one-rule-${end.score}.png`, { type: "image/png" });

    /*
     * ⚠️ **SUR ORDINATEUR, ON COPIE — ON N'OUVRE PAS LE PANNEAU DE WINDOWS.**
     *
     * Rapporté : « le bouton partager et carte à partager ouvrent des trucs sur
     * Windows alors qu'il faut que ça soit juste copier-coller ». C'est exact et
     * c'est le bon reproche : `navigator.share` ouvre la feuille système, qui
     * demande de CHOISIR une application avant même de savoir ce qu'on partage.
     * Sur un téléphone c'est le geste naturel — c'est comme ça qu'on envoie
     * quoi que ce soit. Sur un ordinateur, c'est une boîte de dialogue de plus
     * entre le joueur et son ami.
     *
     * Le partage natif est donc réservé au TACTILE. Ailleurs, l'image va dans
     * le presse-papiers, et il n'y a plus qu'à coller.
     */
    if (TOUCH_ONLY && navigator.canShare?.({ files: [fichier] }) && navigator.share) {
      await navigator.share({ files: [fichier], text: `${d.slogan} · ${d.url}` });
      // Après coup, jamais avant : un partage annulé lève, et compter
      // l'intention comme un envoi gonflerait exactement le chiffre qu'on
      // cherche à lire.
      track("share_carte", { mode, rule: rule.id, score: end.score, voie: "natif" });
      rendre("finCartePrete");
      return;
    }

    /*
     * L'IMAGE DANS LE PRESSE-PAPIERS. `ClipboardItem` accepte un blob PNG, et
     * c'est exactement ce que le joueur veut : coller dans une conversation.
     *
     * ⚠️ Le téléchargement reste le REPLI, pas le chemin normal : il n'est
     * atteint que si le navigateur refuse l'écriture d'image (Firefox, ou une
     * page sans interaction récente). Un fichier dans « Téléchargements » est
     * mieux que rien, mais c'est un détour.
     */
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      track("share_carte", { mode, rule: rule.id, score: end.score, voie: "presse-papiers" });
      rendre("finCartePrete");
      return;
    } catch {
      /* le navigateur refuse l'image : on tombe sur le fichier */
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fichier.name;
    a.click();
    // L'objet URL est retenu par le navigateur tant qu'on ne le révoque pas ;
    // à 1080×1080 ça finit par peser sur un onglet qui reste ouvert.
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    track("share_carte", { mode, rule: rule.id, score: end.score, voie: "fichier" });
    rendre("finCartePrete");
  } catch {
    /*
     * Un partage ANNULÉ passe par ici comme un échec de rendu, et c'est
     * volontairement indiscernable : dans les deux cas le joueur n'a rien
     * envoyé, et lui afficher « CARTE IMPOSSIBLE » après une annulation
     * volontaire est moins grave que de compter l'annulation comme un envoi.
     */
    rendre("finCarteRatee");
  }
}

$("btnVersEscalier").addEventListener("click", () => {
  if (!escalierRegle) return;
  sfx.ui();
  ouvreEscalier(escalierRegle);
});

$("btnShareCarte").addEventListener("click", () => {
  sfx.ui();
  void partageCarte();
});

$("btnShare").addEventListener("click", async () => {
  if (!lastRun) return;
  const { end, rule, mode } = lastRun;
  const head =
    mode === "daily" ? t("partageTitreJour")(day) : t("partageTitreEntrainement");
  const tail = end.cleared ? t("partageTenu")(DAILY_LENGTH) : t("partageRompu")(end.score);
  const text = `${head}\n${nomDeRegle(rule.id, rule.name)}\n${marksToString(end.marks)}\n${tail}`;
  try {
    // Même règle que la carte : le panneau système sur téléphone, le
    // presse-papiers partout ailleurs.
    if (TOUCH_ONLY && navigator.share) await navigator.share({ text });
    else await navigator.clipboard.writeText(text);
    track("share", { mode, rule: rule.id, score: end.score });
    montreToast(t("toastLien"), text.split("\n")[0] ?? "");
  } catch {
    /* partage annulé */
  }
});

/* ------------------------------------------------------------------ *
 * Boucle
 * ------------------------------------------------------------------ */
let lastRoundKey = "";
let runId = 0;
/* ------------------------------------------------------------------ *
 * Les flammes — voir `render/flammes.ts`
 *
 * Le calque ne coûte rien quand il ne brûle pas : il est masqué et la boucle
 * ne le touche plus dès que la grille est éteinte. Hors d'une partie solo,
 * l'ardeur tombe à zéro et le feu s'éteint de lui-même en une seconde — il ne
 * se coupe pas net, ce qui se lirait comme un bug.
 * ------------------------------------------------------------------ */
const flammesCv = $<HTMLCanvasElement>("flammes");
const flammesCtx = flammesCv.getContext("2d");
const FLAMMES_COUPEES =
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** La planche de sprites, une fois TEINTÉE. `null` tant qu'elle n'est pas prête. */
let planche: HTMLCanvasElement | null = null;
let flammesVisibles = false;
let flammesGeoDans = 0;
let braises: F.Braise[] = [];
let champFeu: F.Rect = { x: 0, y: 0, w: 0, h: 0 };
/** La ligne d'où monte le feu du bas : le haut du pied. */
let socleFeu = 0;
let zonesLisibles: F.Rect[] = [];
/** L'éclat d'un piège déjoué : 1 → 0 en ~800 ms. */
let feuRafale = 0;

/**
 * Charge la planche et la TEINT aux couleurs du jeu.
 *
 * ⚠️ La planche d'origine est rose-magenta ; l'identité du jeu est violette
 * (`--signal`, `--signal-pale`). On ne repeint pas image par image : un filtre
 * de teinte, une seule fois, dans un canvas hors écran. Le dessin par image ne
 * coûte donc rien de plus qu'un `drawImage`.
 *
 * Si le navigateur ignore `filter` (le repli le plus probable), le voile
 * `source-atop` suffit à ramener la flamme dans la famille violette : elle
 * sera moins nuancée, jamais rose.
 */
function chargePlanche(): void {
  const img = new Image();
  img.decoding = "async";
  img.src = F.PLANCHE.fichier;
  img.onload = () => {
    const off = document.createElement("canvas");
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const c = off.getContext("2d");
    if (!c) return;
    c.imageSmoothingEnabled = false;
    /*
     * ⚠️ MESURÉ, PAS ESTIMÉ. Les pixels opaques de la planche sont à ~325°
     * (magenta) et `--signal` est à 249° : la rotation vaut donc −76°. Le
     * premier essai à −96° donnait des flammes BLEUES — visible tout de suite
     * à l'écran, et hors de l'identité du jeu.
     */
    c.filter = "hue-rotate(-76deg) saturate(0.86) brightness(1.08)";
    c.drawImage(img, 0, 0);
    c.filter = "none";
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = "rgba(145, 132, 217, 0.28)";
    c.fillRect(0, 0, off.width, off.height);
    planche = off;
  };
}
if (!FLAMMES_COUPEES) chargePlanche();

/**
 * Mesure où est le terrain, et ce qu'il ne faut jamais couvrir.
 *
 * ⚠️ Relue quatre fois par seconde, pas à chaque manche : la consigne change de
 * hauteur d'une manche à l'autre (une ou deux lignes) et le HUD l'écrit APRÈS
 * le changement de manche — une mesure prise à cet instant lirait la consigne
 * précédente, et le feu mordrait sur la nouvelle.
 */
function geometrieFeu(): void {
  const a = appEl.getBoundingClientRect();
  if (flammesCv.width !== Math.round(a.width) || flammesCv.height !== Math.round(a.height)) {
    flammesCv.width = Math.max(1, Math.round(a.width));
    flammesCv.height = Math.max(1, Math.round(a.height));
  }
  const rel = (el: Element): F.Rect => {
    const r = el.getBoundingClientRect();
    return { x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height };
  };
  const c = rel(cv);
  const f = scene.fieldRect();
  champFeu = { x: c.x + f.x, y: c.y + f.y, w: f.w, h: f.h };
  zonesLisibles = [];
  for (const id of ["instr", "sub", "bandRule", "bandVies", "foot"]) {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().width > 0) zonesLisibles.push(rel(el));
  }
  /*
   * ⚠️ LE FEU DU BAS MONTE DU HAUT DU PIED, pas du bas du calque : sous le
   * pied, il est découpé, donc invisible. Mesuré au premier rendu — toutes les
   * flammes du bas étaient perdues, et il ne restait que les deux côtés.
   */
  const pied = document.getElementById("foot");
  socleFeu = pied && pied.getBoundingClientRect().height > 0 ? rel(pied).y : a.height;
}

function majFlammes(now: number): void {
  if (FLAMMES_COUPEES || !flammesCtx) return;
  const ardeur =
    session && screen === null && session.phase === "playing"
      ? Math.min(1, F.ardeurDe(session.level, GRACE_ROUNDS) + feuRafale * 0.45)
      : 0;
  feuRafale = Math.max(0, feuRafale - 0.02);

  if (ardeur <= 0) {
    if (flammesVisibles) {
      flammesVisibles = false;
      flammesCv.classList.add("hidden");
      flammesCtx.clearRect(0, 0, flammesCv.width, flammesCv.height);
    }
    return;
  }
  if (!flammesVisibles) {
    flammesVisibles = true;
    flammesCv.classList.remove("hidden");
    flammesGeoDans = 0;
  }
  if (flammesGeoDans-- <= 0) {
    geometrieFeu();
    flammesGeoDans = 15;
    braises = F.braisesPour(
      { w: flammesCv.width, h: flammesCv.height },
      champFeu,
      ardeur,
      socleFeu,
    );
  }
  if (!planche) return;

  const ctx = flammesCtx;
  ctx.clearRect(0, 0, flammesCv.width, flammesCv.height);
  ctx.save();
  /*
   * ⚠️ LE DÉCOUPAGE EST LA GARANTIE, pas le placement.
   *
   * Les flammes sont posées hors du terrain, mais elles ONDULENT et montent :
   * une langue peut dépasser. Le découpage — tout le calque SAUF le terrain et
   * ce qui se lit — la rogne au pixel. Aucune pièce ne peut donc être couverte,
   * quelle que soit la hauteur du feu (n°5 et n°10).
   */
  ctx.beginPath();
  ctx.rect(0, 0, flammesCv.width, flammesCv.height);
  ctx.rect(champFeu.x, champFeu.y, champFeu.w, champFeu.h);
  for (const z of zonesLisibles) ctx.rect(z.x, z.y, z.w, z.h);
  ctx.clip("evenodd");

  ctx.imageSmoothingEnabled = false;
  // L'éclat d'un piège déjoué : le feu blanchit un instant.
  ctx.globalAlpha = Math.min(1, 0.82 + feuRafale * 0.18);
  for (const b of braises) {
    const { sx, sy } = F.imageDe(b, now);
    const h = b.h * (1 + feuRafale * 0.35);
    // La largeur suit le DESSIN, pas l'image de la planche : voir `BOITE`.
    const w = (h * F.BOITE.w) / F.BOITE.h;
    ctx.drawImage(
      planche,
      sx + F.BOITE.x,
      sy + F.BOITE.y,
      F.BOITE.w,
      F.BOITE.h,
      b.x - w / 2,
      b.y - h,
      w,
      h,
    );
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Le feu s'embrase : un piège vient d'être déjoué. */
function attiseFlammes(force: number): void {
  feuRafale = Math.min(1, feuRafale + force);
}

/** Le record du joueur AVANT le run en cours — photographié au lancement. */
let recordAvantRun = 0;
/** La pastille de dépassement ne flash qu'une fois par run. */
let pastilleDite = false;
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

  /*
   * La démo de l'accueil, et RIEN d'autre quand on y est.
   *
   * Elle est peinte par cette boucle plutôt que par la sienne : une
   * application n'a qu'une horloge, et un décor ne doit jamais pouvoir
   * disputer ses images au jeu. Le test `screen === "home"` suffit à la
   * couper — l'accueil est en `display: none` dès qu'on joue.
   */
  if (screen === "home") imageAttract(now);
  majFlammes(now);

  /*
   * TOUT CE QUI N'EST PAS UNE PARTIE SOLO RÉSERVE UNE BANDE BASSE : les plaques
   * d'un salon, ou la ligne d'aide et PASSER du tutoriel.
   *
   * ⚠️ DANS LES DEUX SENS depuis le bug rapporté par Pierre — « le canvas est
   * traversé par les glyphes des joueurs ». Mesuré à 1280 × 800 : 152 px de
   * terrain sous les plaques. Voir `RESERVE_HUD_MULTI`.
   *
   * ⚠️ SAUF EN COLONNES : quand `has-gutters` est posé, les plaques vivent dans
   * les gouttières latérales et ne touchent plus le champ — y réserver une
   * bande lui volerait de la hauteur pour rien.
   *
   * Le test ne dépend ni de la manche ni de l'interlude : la réserve est posée
   * à l'entrée sur l'écran de jeu et ne bouge plus jusqu'à la sortie.
   */
  {
    // Hors de l'écran de jeu, la réserve se RELÂCHE : sinon elle survit au
    // match et rogne un champ que plus personne ne regarde — mesuré, un champ
    // de 31 px sur l'écran de fin d'un salon.
    const r =
      screen !== null || session || gutters
        ? 0
        : tuto
          ? RESERVE_AIDE_TUTO
          : RESERVE_HUD_MULTI;
    if (r !== reserveMulti) {
      reserveMulti = r;
      scene.poseReserveBas(r);
      syncField();
    }
  }

  // Le battement de lecture du solo, avant tout le reste : tant qu'il court,
  // aucune session n'existe encore.
  if (lecture) majLecture(now);
  if (tuto) majTuto(now);

  let multiDraw: ReturnType<typeof multi.syncFrame> = null;

  if (session) {
    const combo = session.level;
    /*
     * ⚠️ ON CAPTURE LA MANCHE AVANT LE `tick`.
     *
     * `survive()` ouvre la manche SUIVANTE avant de rendre son verdict : au
     * moment où `react` s'exécute, `session.round` est déjà la manche d'après.
     * Le retour du piège déjoué affichait donc la consigne de la manche
     * suivante — « la consigne demandait NE FAIS RIEN », vu à l'écran.
     */
    const manche = session.round;
    const outcome = session.tick(now);
    if (outcome) react(outcome, combo, manche);

    if (session.phase === "over") {
      finishRun();
      session = null;
      poseDejoue();
      $("gout").classList.add("hidden");
    } else if (session.phase === "playing") {
      const key = `${session.mode}:${runId}:${session.level}`;
      if (key !== lastRoundKey) {
        lastRoundKey = key;
        urgentDone = false;
        sfx.roundStart();
        majGouttieres();
        /*
         * Le compteur du bandeau, une fois par MANCHE et pas par image.
         * `setPieges` ignore une valeur inchangee, donc rien n'est reecrit
         * tant qu'aucun piege n'est tombe.
         */
        hud.setPieges(session.trapsSurvived);
        /*
         * L'EXERCICE EST VALIDÉ, et il se dit à l'instant où il tombe.
         *
         * On l'apprenait sur l'écran de fin, donc une fois mort — alors que
         * c'est l'aboutissement de la boucle longue : on s'est fait avoir par
         * une règle, on est venu la travailler, et voilà. L'annonce passe par
         * le même canal que « règle ajoutée » : rien de neuf à l'écran, et
         * elle s'efface toute seule.
         *
         * ⚠️ L'ÉGALITÉ STRICTE, pas `>=`. Le test tourne à chaque manche
         * nouvelle : avec `>=`, l'annonce reviendrait à toutes les manches
         * suivantes du run.
         */
        const but = objectifExercice();
        if (but !== null && session.level === but) {
          hud.announce(t("exerciceValide"));
          sfx.win();
        }
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
        peintPuces(session);
        const ajoutee = session.regleAjoutee;
        montreMicro({
          kind: "decouverte",
          eyebrow: t("microDecouverte"),
          nom: nomDeRegle(ajoutee.id, ajoutee.name),
          quoi: `${briefDeRegle(ajoutee.id, ajoutee.brief)}\n${t("microCarnet")(session.paliers, PALIER_MAX)}`,
          ms: 1600,
        });
        session.regleAjoutee = null;
        session.tierJustCrossed = false;
      } else if (session.tierJustCrossed) {
        session.tierJustCrossed = false;
        hud.announce(TIER_NAMES[session.tier] ?? "");
      } else if (session.graceJustEnded && !finEchauffementDite) {
        // Une seule fois par run : la boucle passe ici soixante fois par
        // seconde, et relancer l'annonce à chaque image la figerait.
        finEchauffementDite = true;
        /*
         * ⚠️ UN TOAST, PAS UN PLEIN CADRE.
         *
         * Rapporté par Pierre : « l'image qui apparaît quand l'échauffement
         * est fini, supprime-la ou fais quelque chose de différent, ce n'est
         * pas agréable ». Il avait raison, et pour une raison mesurable : le
         * plein cadre arrivait PENDANT une manche — la seule annonce du jeu à
         * le faire. Les autres micro-états tombent dans un interlude, où il
         * n'y a rien à regarder. Celle-ci couvrait la scène au moment précis
         * où le joueur venait d'apprendre qu'une erreur coûte désormais une
         * vie, c'est-à-dire au pire moment pour lui prendre les yeux.
         *
         * Le toast dit la même chose : deux secondes, en bas, hors du champ,
         * et `pointer-events: none` — il ne peut ni cacher le terrain ni
         * intercepter un clic.
         */
        montreToast(t("echauffementFini"), t("microEchauffementQuoi"), 2000);
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
      musicApi.level(session.level, session.pace);
      if (challenge) updateGhost(session.runTime(now), session.level);
      /*
       * LE PIED DIT LE DEPASSEMENT DE RECORD, EN DIRECT.
       *
       * Il affichait « TON RECORD · 23 » pendant qu'on venait de faire 24 : le
       * seul instant du run qui vaut d'etre vecu passait sans un mot, et on
       * l'apprenait sur l'ecran de fin, une fois mort.
       *
       * ⚠️ Pas pour le RUN DU JOUR : sa case du milieu dit « SUR 40 », c'est
       * la longueur de l'epreuve et non un record. Et pas non plus quand le
       * record de reference est nul — « +1 SUR TON MIEUX » a un joueur qui
       * n'a encore rien fait ne compare rien.
       */
      const recAv = recordAvantRun;
      if (session.mode !== "daily" && recAv > 0 && session.level > recAv) {
        hud.setFooterRecord(session.level, session.level - recAv, t("modeTraining"));
        if (!pastilleDite) {
          pastilleDite = true;
          montrePastille(t("pastilleRecord")(session.level), t("pastilleSur")(session.level - recAv));
        }
      } else {
        const st = P.load();
        const ciblePied =
          session.mode === "daily"
            ? DAILY_LENGTH
            : session.mode === "escalade"
              ? PALIER_MAX
              : session.mode === "training" && Number.isFinite(session.maxRounds)
                ? session.maxRounds
                : P.recordDeSonAllure(st);
        hud.setFooter(
          session.level,
          ciblePied,
          session.mode === "daily"
            ? t("piedDaily")(day)
            : session.mode === "escalade"
              ? t("modeEscalade")
              : t("modeTraining"),
          session.mode === "daily"
            ? t("piedSur")
            : session.mode === "escalade"
              ? t("piedRegles")
              : t("piedRecord"),
        );
      }
      /*
       * L'OBJECTIF DE L'EXERCICE, dans la case META du bandeau.
       *
       * Un entraînement CIBLÉ — la fiche a posé la règle et l'allure — a un
       * but chiffré : `MANCHES_MAITRISE` manches à cette allure, c'est-à-dire
       * une case de l'échelle. Rien ne le disait pendant le run, donc on ne
       * savait pas qu'on y était presque.
       *
       * ⚠️ ZÉRO PIXEL AJOUTÉ, et c'est la condition. La case META existe déjà
       * et ne sert que pendant l'échauffement, c'est-à-dire trois manches sur
       * un run entier. Un bandeau qui grossit rogne la scène, et la taille du
       * champ EST du gameplay (n°10). L'échauffement garde la priorité : lui
       * dire qu'une erreur ne coûte rien prime sur lui dire où il en est.
       */
      const cible = objectifExercice();
      const pieges =
        window.innerWidth >= 900 && session.trapsSurvived > 0
          ? t("hudPieges")(session.trapsSurvived)
          : "";
      /*
       * L'ANNONCE DU PIÈGE — volées 2 et 3 basse de l'escalier, jamais ailleurs.
       *
       * ⚠️ Elle croise la décision n°5 (« le piège n'est révélé qu'après la
       * mort »), et c'est délibéré : la justification complète est dans
       * `game/escalier.ts`, § `Annonce`. En deux lignes — n°5 protège
       * l'ÉPREUVE, et elle n'est levée sur aucun mode dont un résultat se
       * compare ; l'escalier est un APPRENTISSAGE, et l'échafaudage est retiré
       * au palier 11, soit avant le 15 qui déclare la maîtrise.
       *
       * ⚠️ ELLE PASSE DEVANT L'OBJECTIF, JAMAIS DEVANT L'ÉCHAUFFEMENT. Trois
       * choses se disputent une seule case, et l'ordre n'est pas libre : « une
       * erreur ne coûte rien » change ce qu'on risque, « ce tour est un
       * piège » change ce qu'on fait, « il te reste 4 manches » ne change que
       * ce qu'on espère.
       */
      const palRun = palierEnCours !== null ? ESC.palierN(palierEnCours) : undefined;
      const annonce =
        palRun !== undefined &&
        session.round.trap &&
        ESC.annonceIci(palRun.annonce, session.level);
      hud.setMeta(
        session.inGrace
          ? t("echauffement")
          : annonce
            ? t("escAnnonce")
            : cible !== null && session.level < cible
              ? t("objectifReste")(cible - session.level)
              : pieges,
      );
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
  if (tuto?.manche) {
    /*
     * Le tutoriel se dessine AVANT la session parce qu'il n'y en a aucune.
     *
     * `ratio` reste indéfini au temps 3 : la barre de temps ne descend pas,
     * et c'est exactement ce qu'on promet à l'écran — « le chrono est
     * désactivé ». Au temps 5 elle descend, lentement, et c'est elle qui
     * valide en arrivant au bout.
     */
    const m = tuto.manche;
    const chrono = tuto.temps !== 1;
    hud.updateRound(m.round, now - tuto.debut, chrono ? Math.min(1, (now - tuto.debut) / CHRONO_PIEGE_MS) : 0);
    scene.draw({
      round: m.round,
      rule: regleTuto(),
      now,
      ratio: chrono ? Math.min(1, (now - tuto.debut) / CHRONO_PIEGE_MS) : undefined,
    });
  } else if (tuto) {
    // La respiration entre deux temps : le terrain reste, vide.
    scene.draw({ round: null, rule: regleTuto(), now });
  } else if (session) {
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
      needs: multiDraw.needs,
      charges: multiDraw.charges,
    });
    multi.paintCursors(now, scene.fieldRect());
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
  const endpoint = ENDPOINT_MESURE;

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

  /*
   * ⚠️ LE BANDEAU NE S'AFFICHE PLUS À L'ARRIVÉE. Voir `proposeMesure()`.
   *
   * Il s'affichait ici, donc avant la première partie. Mesuré sur 139 joueurs
   * réels : 106 — soit 76 % — n'ont JAMAIS lancé une partie. Et mesuré sur un
   * 375×812, le bandeau fait 223 px, soit 27 % de l'écran ; `elementFromPoint`
   * au centre de la faille rend le BANDEAU et non le bouton, donc les deux
   * portes SOLO et MULTI sont inertes tant qu'il est là.
   *
   * Ce n'est pas une preuve de causalité, mais c'est le seul objet qui se
   * tient entre l'arrivée et le jeu, et il tue la seule chose qu'un inconnu
   * regarde en premier.
   */
  refreshMetricsButton();
}

function refreshMetricsButton(): void {
  poseInter("btnMetrics", P.load().metrics.on);
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
  try {
    await rafraichit();
    await chargeFournisseurs();
    // Le bouton de compte dépend de ce qu'on vient d'apprendre : l'accueil a
    // déjà été peint sans lui, il faut le repeindre — et l'écran d'arrivée
    // n'est pas forcément l'accueil (adresse `/solo`, `/compte`, `/classement`).
    repeintChiffres();

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
    /*
     * Une perf du jour VÉRIFIÉE dit qu'au moins un essai a été consommé.
     *
     * Les agrégats peuvent porter `essais: 0` à côté d'un score (champ
     * ajouté après). Sur un navigateur neuf, ça rendait trois essais
     * alors que l'autre appareil affichait « 0 / 3 ».
     */
    const jour = dayIndex();
    const perfs = await mesPerfs();
    const preuve = perfs.find((p) => p.mode === "daily" && p.jour === jour);
    if (preuve) P.mutate((st) => P.posePreuveDuJour(st, jour, preuve.valeur));
    // Ce qui attendait dans la file part maintenant : un run joué hors ligne,
    // ou joué avant que le compte n'existe.
    traiteEnvois(await vide());
    // Se connecter change ce que le classement peut nous dire — ne serait-ce que
    // pour marquer notre propre ligne — et un run en attente vient peut-etre
    // d'entrer dans la table.
    await rafraichitClassement(true);
    repeintChiffres();
  } finally {
    compteBootFini = true;
  }
}

renderHome();

/*
 * L'ADRESSE DÉCIDE DE L'ÉCRAN D'ARRIVÉE.
 *
 * ⚠️ Les écrans CONTEXTUELS retombent sur leur parent, et une adresse inconnue
 * sur l'accueil — voir `route.ts`. Un salon sans code, une fiche sans règle ou
 * un écran de fin sans run sont des cadres vides ; les montrer se lirait comme
 * un chargement raté, et le joueur n'aurait rien à réparer.
 *
 * `replaceState` et non `pushState` : la première entrée de l'histoire doit
 * être celle où l'on est, sinon le tout premier appui sur PRÉCÉDENT ferait
 * sortir du site alors qu'on vient d'arriver.
 */
/**
 * Ouvrir un écran depuis son ADRESSE.
 *
 * ⚠️ **`show()` NE SUFFIT PAS, ET C'ÉTAIT LE BUG.** Montrer un écran ne le
 * PEINT pas : chaque bouton de la barre fait `renderX(); show("x")`, et le
 * démarrage n'appelait que la seconde moitié. Arriver directement sur `/solo`
 * ou `/cartes` donnait donc un écran aux données vides — un cadre qui a l'air
 * cassé, ce qui est exactement ce que le repli sur le parent existe pour
 * éviter.
 *
 * Cette table dit, pour chaque adresse ouvrable à froid, ce que fait le bouton
 * correspondant. Les écrans absents d'ici ne sont pas adressables : `route.ts`
 * les a déjà fait retomber sur leur parent avant qu'on arrive.
 */
function ouvreAdresse(id: EcranId): void {
  switch (id) {
    case "solo":
      renderSolo();
      show("solo");
      return;
    case "codex":
      renderCodex();
      return;
    case "classement":
      renderClassement();
      show("classement");
      return;
    case "compte":
      // `renderCompte()` ne montre pas l'écran — seul `ouvreCompte` le fait.
      // Un retour ou une arrivée à froid sur `/compte` peignait un cadre
      // caché et laissait l'accueil visible.
      void ouvreCompte();
      return;
    case "reglages":
      renderReglages();
      show("reglages");
      return;
    case "multi-join":
      // Le multi a sa propre porte : elle décide seule entre l'écran du nom et
      // celui du code, selon que le joueur s'est déjà nommé.
      $("btnMulti").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return;
    default:
      /*
       * ⚠️ L'ACCUEIL PASSE QUAND MÊME PAR `show`, ET CE N'EST PAS REDONDANT.
       *
       * `renderHome()` a déjà peint son contenu — mais `show` est le seul
       * endroit qui prévient le reste : la barre haute, la barre du bas, et
       * surtout le MODE ATTRACT, qui ne démarre que là. Sans cet appel, on
       * arrivait sur un accueil dont le champ ne tournait pas : canvas resté à
       * sa taille intrinsèque de 300 × 150, consigne vide, aucune règle
       * annoncée. Rien dans la console, parce que rien n'avait échoué — la
       * démo n'avait simplement jamais été lancée.
       */
      show("home");
      return;
  }
}

/*
 * Et le multi PAR-DESSUS, une fois seulement.
 *
 * `createMulti()` s'exécute pendant l'évaluation du module, donc AVANT que
 * `renderHome()` n'ait posé la langue enregistrée : tout ce qu'il peint à
 * l'initialisation le fait en français, quelle que soit la langue du joueur.
 * Mesuré : les six boutons d'émote restaient « SALUT · BRAVO · HA ! » dans un
 * salon anglais, et rien ne les repeignait tant qu'on ne touchait pas au
 * sélecteur FR/EN. Un défaut invisible au premier chargement, qui ne se voit
 * qu'en jeu.
 */
multi.onLangue();

/*
 * LE NOM VALIDÉ REJOINT LE COMPTE — quel que soit l'écran d'où l'on venait.
 *
 * C'était le défaut de fond derrière « impossible de changer nom après
 * connexion » : l'écran d'identité n'écrivait que la sauvegarde locale. Un
 * joueur connecté se renommait donc pour lui seul, et le classement — la seule
 * surface où son nom est vu par d'autres — gardait l'ancien, ou rien du tout.
 *
 * Posé ici plutôt que sur le bouton de l'écran COMPTE : le multijoueur aussi
 * fait passer par cet écran, et un nom changé avant d'entrer dans un salon doit
 * suivre de la même façon. Un seul chemin, donc un seul comportement.
 *
 * ⚠️ L'ÉCHEC N'EST PAS BLOQUANT, et c'est la doctrine n°12 : aucune
 * fonctionnalité de jeu ne dépend du compte. Le nom est déjà écrit localement
 * quand on arrive ici — le multijoueur marchera. Le serveur, lui, rattrapera au
 * prochain rafraîchissement de jeton.
 */
multi.onIdentite((nom, glyphe) => {
  if (!estConnecte()) return;
  void changeIdentite(nom, glyphe).then((moi) => {
    if (!moi) {
      // On ne le dit QUE si le joueur regarde l'écran du compte : ailleurs, ce
      // serait une alerte sur un problème qui ne l'empêche de rien faire.
      if (screen !== "compte") return;
      $("compteDanger").textContent = t("cptNomRate");
      $("compteDanger").classList.remove("hidden");
      return;
    }
    if (screen === "compte") renderCompte();
  });
});

bootCompte = demarreCompte();

const invite = readInvite();

// Un lien de défi ouvre directement l'annonce de la règle : celui qui clique
// vient pour affronter quelqu'un, pas pour lire un menu.
const incoming = readChallenge();
/*
 * PAR OÙ L'ON ENTRE — et l'ordre EST la priorité.
 *
 * ⚠️ **CETTE LIGNE ÉCRASAIT L'ADRESSE, ET C'ÉTAIT LE BUG RAPPORTÉ** : « quand
 * je tape ma propre url vers une page du site elle me ramène directement à la
 * page principale ». Le `else show("home")` date d'avant le routeur, quand le
 * site n'avait qu'une seule adresse. Le bloc qui ouvre l'écran demandé
 * s'exécutait plus haut dans le fichier — donc AVANT celui-ci — et se faisait
 * piétiner à chaque chargement, en silence.
 *
 * Mesuré côté serveur pour écarter la piste : `/solo` répond bien 200, sert
 * l'application, et le bundle déployé contient le routage. Le défaut était
 * entièrement ici.
 *
 * Les trois entrées, dans l'ordre où elles priment :
 *
 *   1. un lien de DÉFI ouvre directement l'annonce de la règle — celui qui
 *      clique vient affronter quelqu'un, pas lire un menu ;
 *   2. un lien d'INVITATION ouvre le salon, pour la même raison ;
 *   3. sinon, l'ADRESSE décide. Elle ne vient pas d'un lien reçu mais de ce que
 *      le joueur a tapé ou mis en favori : c'est un choix, et il passe après un
 *      lien qu'on lui a envoyé mais avant le réglage par défaut.
 *
 * ⚠️ `poseArrivee` dans TOUS les cas, y compris les deux premiers : la première
 * entrée de l'histoire doit être celle où l'on est, sinon le premier appui sur
 * PRÉCÉDENT fait sortir du site alors qu'on vient d'arriver.
 */
const arrivee = ecranAuChargement(location.pathname);
poseArrivee(arrivee);
if (incoming) loadChallenge(incoming);
else if (invite && multi.available) multi.openFromInvite(invite);
else ouvreAdresse(arrivee);
requestAnimationFrame(loop);
