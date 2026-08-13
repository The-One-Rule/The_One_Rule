import "./style.css";

import { DAILY_LENGTH, TIER_NAMES } from "./engine/difficulty";
import { mulberry32 } from "./engine/rng";
import { ONE_RULES } from "./engine/rules";
import type { Action, OneRule, Outcome } from "./engine/types";

import { dailySeed, dayIndex, ruleOfDay, tomorrowRule } from "./game/daily";
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
import { colorHex, SceneRenderer } from "./render/scene";
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
  // Hystérésis. Passer en colonnes sort les plaques du flux, ce qui agrandit
  // la scène, ce qui peut re-déclencher le test : sans marge, la mise en page
  // clignote.
  const next = gutters ? gw >= 110 : gw >= 132;
  if (next !== gutters) {
    gutters = next;
    appEl.classList.toggle("has-gutters", next);
  }
}

const SCREENS = ["home", "brief", "over", "codex", "multi-join", "multi-lobby", "multi-end"] as const;
type ScreenId = (typeof SCREENS)[number] | null;

let screen: ScreenId = "home";
let session: Session | null = null;
let pendingRule: OneRule | null = null;
let pendingMode: Mode = "daily";
let spaceDown = false;
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

const multi = initMulti((id) => show(id), hud);

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

  const list = $("homeQuests");
  list.innerHTML = "";
  for (const q of viewQuests(s, day)) {
    const row = document.createElement("div");
    row.className = "quest" + (q.done ? " is-done" : "");
    row.innerHTML =
      `<span class="quest__box"></span><span class="quest__label"></span>` +
      `<span class="quest__val">${Math.min(q.value, q.target)}/${q.target} · +${q.reward}</span>`;
    row.querySelector<HTMLElement>(".quest__label")!.textContent = q.label;
    list.appendChild(row);
  }

  const btn = $<HTMLButtonElement>("btnDaily");
  btn.disabled = s.daily.played;
  btn.textContent = s.daily.played ? `RUN DU JOUR · FAIT (${s.daily.score})` : "RUN DU JOUR";

  $("btnRanked").classList.toggle("hidden", !rankedAvailable());
  $("btnSound").textContent = `SON : ${s.sound ? "ON" : "OFF"}`;
  $("btnMusic").textContent = `MUSIQUE : ${s.music ? "ON" : "OFF"}`;
  setEnabled(s.sound);
  setMusicEnabled(s.music);
}

function renderCodex(): void {
  const s = P.load();
  const list = $("codexList");
  list.innerHTML = "";
  for (const r of ONE_RULES) {
    const rec = s.encountered[r.id];
    const row = document.createElement("div");
    row.className = "codexrow" + (rec ? (rec.cleared ? " is-cleared" : "") : " is-locked");
    row.innerHTML = `<span class="codexrow__name"></span><span class="codexrow__score"></span>`;
    row.querySelector<HTMLElement>(".codexrow__name")!.textContent = rec ? r.name : "— — — — —";
    row.querySelector<HTMLElement>(".codexrow__score")!.textContent = rec
      ? rec.cleared
        ? `TENU · ${rec.best}`
        : `MEILLEUR ${rec.best}`
      : "JAMAIS RENCONTRÉE";
    list.appendChild(row);
  }
  show("codex");
}

/* ------------------------------------------------------------------ *
 * Lancement d'un run
 * ------------------------------------------------------------------ */
function openBrief(mode: Mode): void {
  const s = P.load();
  pendingMode = mode;

  if (mode === "daily") {
    pendingRule = ruleOfDay(day);
  } else {
    // l'entraînement ne tire que les règles déjà rencontrées : la surprise
    // du run du jour est le seul contenu neuf, il ne faut pas la brûler
    // Nouveau joueur : on ne lui sert pas la règle du jour en entraînement,
    // ce serait brûler le seul contenu neuf de sa journée. Il apprend sur
    // LE SANG, l'interdit le plus lisible du catalogue.
    const known = ONE_RULES.filter((r) => P.isEncountered(s, r.id));
    const pool = known.length ? known : ONE_RULES.filter((r) => r.id === "sang");
    pendingRule = pool[Math.floor(Math.random() * pool.length)]!;
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

  $("btnGo").textContent = hold ? "MAINTIENS ESPACE" : "COMMENCER";
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
  track("run_start", { mode: pendingMode, rule: pendingRule.id, day });
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

  const rule = ONE_RULES.find((r) => r.id === offer.ruleId);
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
    } else {
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
  for (const id of claimedAfter.slice(claimedBefore)) track("quest_complete", { quest: id });

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
  const rule = ruleOfReplay(r);
  if (!rule) return;
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

function abandon(): void {
  if (!session) return;
  session = null;
  backHome();
}

function replay(): void {
  if (pendingMode === "ranked") {
    void openRanked(); // nouvelle graine, nouvel adversaire : jamais deux fois le même match
    return;
  }
  if (pendingMode === "daily" && !challenge) return;
  startRun();
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
    $("btnDuel").textContent = "HORS LIGNE : LIEN IMPOSSIBLE";
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
  const endpoint = import.meta.env.VITE_COLLECT_URL as string | undefined;

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
