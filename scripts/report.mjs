#!/usr/bin/env node
/**
 * Rapport de rétention.
 *
 *   node scripts/report.mjs events.ndjson
 *   vercel logs --output raw | node scripts/report.mjs
 *
 * Sort les quatre chiffres qui décident du passage de la Porte 1, plus de quoi
 * diagnostiquer si les seuils ne sont pas atteints. Aucune dépendance.
 */
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

const GATES = { d1: 0.3, d7: 0.12, sessionMs: 4 * 60_000, share: 0.05 };

const src = process.argv[2] ? createReadStream(process.argv[2]) : process.stdin;
const rl = createInterface({ input: src, crlfDelay: Infinity });

/** @type {Map<string, {first:number, days:Set<number>, sessions:number[], shares:number, runs:number, sent:number}>} */
const users = new Map();
const runs = [];
let shares = 0;

/**
 * Entonnoir social. Les trois crans se comptent séparément parce qu'ils
 * échouent pour des raisons différentes, et que la réparation n'est pas la
 * même : personne n'envoie (le jeu ne donne pas envie d'être montré),
 * personne n'ouvre (l'objet partagé est mauvais), personne ne joue après
 * avoir ouvert (l'écran d'annonce fait fuir).
 */
const social = { duelSent: 0, duelOpened: 0, duelPlayed: 0, inviteSent: 0, inviteOpened: 0 };

for await (const line of rl) {
  const start = line.indexOf("{");
  if (start < 0) continue;
  let e;
  try {
    e = JSON.parse(line.slice(start));
  } catch {
    continue;
  }
  if (!e || typeof e.id !== "string" || typeof e.ev !== "string") continue;

  let u = users.get(e.id);
  if (!u) {
    u = { first: e.day, days: new Set(), sessions: [], shares: 0, runs: 0, sent: 0 };
    users.set(e.id, u);
  }
  u.first = Math.min(u.first, e.day);
  u.days.add(e.day);

  if (e.ev === "visit_end" && typeof e.ms === "number") u.sessions.push(e.ms);
  if (e.ev === "share") {
    u.shares++;
    shares++;
  }
  if (e.ev === "run_end") {
    u.runs++;
    runs.push(e);
  }

  if (e.ev === "duel_sent") {
    social.duelSent++;
    u.sent++;
  }
  if (e.ev === "duel_opened") social.duelOpened++;
  if (e.ev === "run_start" && e.duel === true) social.duelPlayed++;
  if (e.ev === "invite_sent") {
    social.inviteSent++;
    u.sent++;
  }
  if (e.ev === "invite_opened") social.inviteOpened++;
}

const pct = (x) => (x * 100).toFixed(1) + " %";
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mmss = (ms) => `${Math.floor(ms / 60000)} min ${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")} s`;

/**
 * Rétention Dn : parmi les joueurs dont la cohorte a EU LE TEMPS d'atteindre
 * le jour n, la part qui était active ce jour-là. Sans ce filtre, les cohortes
 * récentes écrasent artificiellement le chiffre vers le bas.
 */
const maxDay = Math.max(...[...users.values()].flatMap((u) => [...u.days]), 0);
function retention(n) {
  const eligible = [...users.values()].filter((u) => u.first + n <= maxDay);
  if (!eligible.length) return { rate: NaN, base: 0 };
  const back = eligible.filter((u) => u.days.has(u.first + n)).length;
  return { rate: back / eligible.length, base: eligible.length };
}

const sessions = [...users.values()].flatMap((u) => u.sessions);
const shareRate = runs.length ? shares / runs.length : 0;
const d1 = retention(1);
const d7 = retention(7);

const verdict = (ok) => (ok ? "OK  " : "SOUS");
const line = (label, value, ok, base) =>
  `  ${verdict(ok)} ${label.padEnd(24)} ${String(value).padStart(12)}${base ? `   (n=${base})` : ""}`;

/*
 * `maxDay` est un INDEX de jour (jours écoulés depuis l'origine du jeu), pas
 * une durée. L'afficher comme « jours couverts » annonçait « 238 jours » pour
 * un seul joueur vu aujourd'hui. Il reste le bon repère pour l'éligibilité des
 * cohortes — on ne le change pas là — mais pas pour un affichage.
 */
const minDay = Math.min(...[...users.values()].map((u) => u.first), maxDay);
const couverts = users.size ? maxDay - minDay + 1 : 0;

console.log(`\nTHE ONE RULE — rapport de rétention`);
console.log(
  `joueurs uniques : ${users.size}   ·   runs : ${runs.length}   ·   jours couverts : ${couverts}\n`,
);

console.log("PORTE 1");
console.log(line("D1", Number.isNaN(d1.rate) ? "—" : pct(d1.rate), d1.rate >= GATES.d1, d1.base));
console.log(line("D7", Number.isNaN(d7.rate) ? "—" : pct(d7.rate), d7.rate >= GATES.d7, d7.base));
console.log(line("session médiane", sessions.length ? mmss(median(sessions)) : "—", median(sessions) >= GATES.sessionMs, sessions.length));
console.log(line("partages / run", pct(shareRate), shareRate >= GATES.share, runs.length));

const passed = d1.rate >= GATES.d1 && d7.rate >= GATES.d7 && median(sessions) >= GATES.sessionMs;
console.log(`\n  ⇒ ${passed ? "Porte franchie : le ranked peut se construire." : "Porte non franchie : corriger et retester avant toute Phase 2."}`);

/* ---- diagnostic : sert quand un seuil n'est pas atteint ---- */
console.log("\nCOURBE DE RÉTENTION");
for (const n of [1, 2, 3, 5, 7, 10, 14]) {
  const r = retention(n);
  if (!r.base) continue;
  const bar = "█".repeat(Math.round(r.rate * 40));
  console.log(`  J+${String(n).padStart(2)}  ${pct(r.rate).padStart(7)}  ${bar}`);
}

/* ---- entonnoir social : décide de ce qu'on construit ensuite ---- */
const inviters = [...users.values()].filter((u) => u.sent > 0).length;
const sentTotal = social.duelSent + social.inviteSent;
const openedTotal = social.duelOpened + social.inviteOpened;
const ratio = (a, b) => (b ? pct(a / b) : "—");

console.log("\nENTONNOIR SOCIAL");
console.log(`  envoyé            duel ${String(social.duelSent).padStart(5)}   ·   salon ${String(social.inviteSent).padStart(5)}`);
console.log(`  ouvert            duel ${String(social.duelOpened).padStart(5)}   ·   salon ${String(social.inviteOpened).padStart(5)}`);
console.log(`  joué (duel)            ${String(social.duelPlayed).padStart(5)}`);
console.log("");
console.log(`  envois / run           ${ratio(sentTotal, runs.length).padStart(7)}`);
console.log(`  ouverts / envoyés      ${ratio(openedTotal, sentTotal).padStart(7)}`);
console.log(`  joués / ouverts (duel) ${ratio(social.duelPlayed, social.duelOpened).padStart(7)}`);
console.log(`  joueurs qui invitent   ${ratio(inviters, users.size).padStart(7)}   (n=${users.size})`);
console.log("");
console.log("  'ouverts / envoyés' peut dépasser 100 % sans que ce soit une erreur : un lien");
console.log("  envoyé une fois peut être ouvert par plusieurs personnes. C'est même le signal");
console.log("  recherché. 'joueurs qui invitent' est le chiffre à surveiller — la rétention");
console.log("  d'un groupe est celle de la personne qui envoie le lien, pas la moyenne.");

/**
 * Règle de décision écrite AVANT de connaître les chiffres. Sans elle, on
 * construit la table quoi qu'il arrive en rationalisant le résultat après
 * coup — c'est le mode d'échec normal de ce genre de mesure.
 */
/*
 * La règle ne se prononce pas sur un échantillon qui ne peut rien dire.
 *
 * Sur un seul visiteur, elle affirmait « personne n'envoie, le jeu ne donne
 * pas envie d'être montré » — une conclusion tirée de n=1. Une règle de
 * décision qui parle trop tôt est pire que pas de règle : elle habille du
 * bruit en signal, et elle le fait précisément au moment où l'on regarde le
 * rapport pour la première fois.
 *
 * 30 joueurs est le plancher en dessous duquel un taux d'envoi n'a pas de
 * sens ; il faut de toute façon 150 à 200 pour un D1 lisible.
 */
const MIN_ECHANTILLON = 30;

console.log("\n  Ce qu'il faut en faire :");
if (users.size < MIN_ECHANTILLON) {
  console.log(`  · Échantillon trop faible pour conclure (${users.size} joueur(s),`);
  console.log(`    il en faut au moins ${MIN_ECHANTILLON} pour l'entonnoir et 150 à 200 pour un D1).`);
  console.log("    La chaîne fonctionne, c'est déjà ce qu'on voulait savoir : laisse-la tourner.");
} else if (!sentTotal) {
  console.log("  · Personne n'envoie. Le problème est EN AMONT du social : le jeu ne donne");
  console.log("    pas envie d'être montré. Une boucle sociale plus riche n'y changera rien.");
} else if (openedTotal / sentTotal < 0.2) {
  console.log("  · On envoie mais on n'ouvre pas. Le problème est l'OBJET PARTAGÉ, pas la");
  console.log("    boucle : partager le piège subi plutôt qu'un score. Quelques heures.");
} else if (social.duelOpened && social.duelPlayed / social.duelOpened < 0.5) {
  console.log("  · On ouvre mais on ne joue pas. Le problème est l'écran d'annonce, pas");
  console.log("    l'envie : trop de lecture entre le clic et la première manche.");
} else if (d7.rate < GATES.d7) {
  console.log("  · Les liens circulent ET sont joués, mais le D7 ne suit pas. C'est");
  console.log("    exactement l'hypothèse de la table asynchrone : l'envie est prouvée,");
  console.log("    il manque la persistance et le groupe. C'est le moment de la construire.");
} else {
  console.log("  · Entonnoir sain et D7 tenu. Ne rien construire de social : finir les");
  console.log("    lots visuels et élargir la cohorte.");
}

const byCause = {};
const byRule = {};
for (const r of runs) {
  byCause[r.cause ?? "?"] = (byCause[r.cause ?? "?"] ?? 0) + 1;
  const k = r.rule ?? "?";
  (byRule[k] ??= []).push(r.score ?? 0);
}

console.log("\nCAUSES DE MORT");
const totalRuns = runs.length || 1;
for (const [c, n] of Object.entries(byCause).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.padEnd(10)} ${pct(n / totalRuns).padStart(7)}`);
}
console.log(
  "\n  Une part élevée de 'macro' est bon signe : les joueurs meurent sur la règle unique,\n" +
    "  donc la mécanique centrale est ce qui les met en difficulté. Une part écrasante de\n" +
    "  'timeout' signifie que le jeu est trop rapide avant d'être intéressant.",
);

console.log("\nDIFFICULTÉ PAR RÈGLE UNIQUE (score médian)");
for (const [rule, scores] of Object.entries(byRule).sort((a, b) => median(a[1]) - median(b[1]))) {
  console.log(`  ${rule.padEnd(16)} ${String(median(scores)).padStart(5)}   (n=${scores.length})`);
}

console.log(
  "\nCe rapport ne mesure pas la perception d'équité — le seul risque fatal du projet.\n" +
    "Elle se récolte en parlant à cinq testeurs : « le jeu triche » ou « j'ai mal joué » ?\n",
);
