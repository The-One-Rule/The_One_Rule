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

/**
 * Entonnoir du COMPTE — vu, cliqué, lié.
 *
 * Trois crans, et on compte des JOUEURS et non des affichages : l'invitation
 * peut apparaître à chaque fin de run, donc un compte d'affichages dirait
 * surtout combien de fois les gens ont joué.
 *
 * Ce que ce bloc existe pour trancher : tous les testeurs ont RÉCLAMÉ un
 * compte, ce qui n'est pas la même chose que d'en créer un. Ce projet a déjà
 * vu une demande unanime — le partage de score — rester à 0 % d'usage réel.
 * On ne conclura donc rien de la demande, seulement de ces trois nombres.
 */
const compte = { vu: 0, parti: 0, lie: 0 };

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
    u = { first: e.day, days: new Set(), sessions: [], shares: 0, runs: 0, sent: 0,
          starts: 0, regles: new Set(),
          voitCompte: false, partCompte: false, aCompte: false };
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

  /*
   * On compte les runs LANCÉS, pas seulement terminés.
   *
   * `run_end` rate celui qui ferme l'onglet en pleine partie — or c'est
   * précisément la population qu'on cherche à comprendre. Un joueur qui lance
   * et abandonne A essayé le jeu ; le confondre avec celui qui n'a jamais
   * cliqué mélange deux problèmes qui ne se réparent pas au même endroit.
   */
  if (e.ev === "run_start") {
    u.starts++;
    if (typeof e.rule === "string") u.regles.add(e.rule);
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

  // Un joueur compte UNE fois par cran, pas une fois par affichage.
  if (e.ev === "compte_invite" && !u.voitCompte) {
    u.voitCompte = true;
    compte.vu++;
  }
  if (e.ev === "compte_start" && !u.partCompte) {
    u.partCompte = true;
    compte.parti++;
  }
  if (e.ev === "compte_lie" && !u.aCompte) {
    u.aCompte = true;
    compte.lie++;
  }
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

/** Un rapport de deux nombres, ou un tiret quand le dénominateur est nul. */
const ratio = (a, b) => (b ? pct(a / b) : "—");

/* ------------------------------------------------------------------ *
 * ENTONNOIR D'ENTRÉE — le chiffre qui commande tous les autres
 *
 * Relevé des jours 238-245 : 106 joueurs sur 139 — 76 % — n'avaient JAMAIS
 * lancé une partie. Tant que ce nombre ne bouge pas, toutes les métriques de
 * jeu décrivent les 24 % qui restent.
 *
 * Il n'était pas calculé ici, et c'est ce qui a permis à une cause bête de
 * survivre : le bandeau de mesure s'affichait à l'ARRIVÉE, faisait 27 % d'un
 * écran de téléphone, et `elementFromPoint` au centre de la faille rendait le
 * BANDEAU — les deux portes SOLO et MULTI étaient inertes tant qu'il était là.
 * Il est parti sur l'écran de fin depuis. Ce bloc existe pour dire si ça a
 * suffi.
 * ------------------------------------------------------------------ */
const tous = [...users.values()];
const aLance = tous.filter((u) => u.starts > 0);
const aFini = tous.filter((u) => u.runs > 0);
const aRejoue = tous.filter((u) => u.starts > 1);
const revenus = tous.filter((u) => u.days.size > 1);

console.log("\nENTONNOIR D'ENTRÉE");
console.log(`  arrivés                ${String(tous.length).padStart(7)}   joueur(s)`);
console.log(`  ont lancé une partie   ${String(aLance.length).padStart(7)}   ${ratio(aLance.length, tous.length).padStart(7)} des arrivés`);
console.log(`  ont fini une partie    ${String(aFini.length).padStart(7)}   ${ratio(aFini.length, aLance.length).padStart(7)} de ceux qui ont lancé`);
console.log(`  ont RELANCÉ            ${String(aRejoue.length).padStart(7)}   ${ratio(aRejoue.length, aLance.length).padStart(7)} de ceux qui ont lancé`);
console.log(`  revenus un autre jour  ${String(revenus.length).padStart(7)}   ${ratio(revenus.length, tous.length).padStart(7)} des arrivés`);
console.log("");
const jamais = tous.length - aLance.length;
console.log(`  ⇒ ${jamais} joueur(s) ne cliquent JAMAIS sur JOUER — ${ratio(jamais, tous.length)} des arrivés.`);
console.log("");
console.log("  Ce nombre-là ne se répare pas avec l'onboarding : personne n'a encore");
console.log("  atteint le jeu. C'est la page d'accueil, la vitesse de chargement, ou");
console.log("  quelque chose qui bloque le clic. À comparer aux 76,3 % des jours 238-245.");
console.log("");
console.log(`  Le second cran, lui, EST l'onboarding : ${ratio(aRejoue.length, aLance.length)} de ceux qui`);
console.log("  lancent une partie en relancent une seconde.");

/* ------------------------------------------------------------------ *
 * DISTRIBUTION DES RUNS — jamais la moyenne
 *
 * Une moyenne de « runs par joueur » est un mensonge quand deux joueurs font
 * 438 des 572 runs : elle décrit un joueur médian qui n'existe pas. Ce qu'on
 * veut savoir est s'il y a une population moyenne, ou seulement un noyau et
 * une falaise.
 * ------------------------------------------------------------------ */
const PALIERS = [
  ["0 run  (arrivé, jamais joué)", (n) => n === 0],
  ["1 run", (n) => n === 1],
  ["2-3 runs", (n) => n >= 2 && n <= 3],
  ["4-5 runs", (n) => n >= 4 && n <= 5],
  ["6-10 runs", (n) => n >= 6 && n <= 10],
  ["11-20 runs", (n) => n >= 11 && n <= 20],
  ["20+ runs", (n) => n > 20],
];

console.log("\nDISTRIBUTION DES RUNS LANCÉS");
for (const [label, test] of PALIERS) {
  const dedans = tous.filter((u) => test(u.starts));
  if (!tous.length) break;
  const part = dedans.length / tous.length;
  const bar = "█".repeat(Math.round(part * 40));
  console.log(
    `  ${label.padEnd(30)} ${String(dedans.length).padStart(5)}  ${pct(part).padStart(7)}  ${bar}`,
  );
}

/*
 * La part des runs portée par les plus gros joueurs.
 *
 * C'est ce qui dit si un chiffre agrégé est lisible. À 76 % du volume porté
 * par deux personnes, « runs par joueur » et « score médian » décrivent ces
 * deux personnes et personne d'autre.
 */
const parVolume = tous.map((u) => u.starts).sort((a, b) => b - a);
const volume = parVolume.reduce((a, b) => a + b, 0);
const top2 = parVolume.slice(0, 2).reduce((a, b) => a + b, 0);
const top5 = parVolume.slice(0, 5).reduce((a, b) => a + b, 0);
if (volume) {
  console.log("");
  console.log(`  les 2 plus gros joueurs portent ${ratio(top2, volume)} des runs lancés`);
  console.log(`  les 5 plus gros joueurs portent ${ratio(top5, volume)} des runs lancés`);
  if (top2 / volume > 0.5) {
    console.log("");
    console.log("  ⚠️ Plus de la moitié du volume vient de deux personnes. Toute moyenne");
    console.log("  calculée sur ce relevé les décrit, elles, et pas les autres.");
  }
}

/* ------------------------------------------------------------------ *
 * DÉCOUVERTE DES RÈGLES — la matière première des cartes
 *
 * Le carnet ne se remplit qu'en rencontrant des règles, et la collection n'a
 * de sens que si cette rencontre arrive. Combien de règles un joueur voit-il
 * réellement ?
 * ------------------------------------------------------------------ */
const vues = aLance.map((u) => u.regles.size).sort((a, b) => a - b);
if (vues.length) {
  console.log("\nRÈGLES RENCONTRÉES (parmi ceux qui ont lancé)");
  console.log(`  médiane                ${String(median(vues)).padStart(7)}   règle(s)`);
  console.log(`  maximum                ${String(vues[vues.length - 1]).padStart(7)}   règle(s)`);
  const une = vues.filter((v) => v <= 1).length;
  console.log(`  n'en ont vu qu'une     ${String(une).padStart(7)}   ${ratio(une, vues.length).padStart(7)}`);
}

/* ---- entonnoir social : décide de ce qu'on construit ensuite ---- */
const inviters = [...users.values()].filter((u) => u.sent > 0).length;
const sentTotal = social.duelSent + social.inviteSent;
const openedTotal = social.duelOpened + social.inviteOpened;

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
console.log("");
console.log("ENTONNOIR DU COMPTE");
console.log(`  invitation vue         ${String(compte.vu).padStart(7)}   joueur(s)`);
console.log(`  parti se connecter     ${String(compte.parti).padStart(7)}   ${ratio(compte.parti, compte.vu).padStart(7)} de ceux qui l'ont vue`);
console.log(`  compte lié             ${String(compte.lie).padStart(7)}   ${ratio(compte.lie, compte.parti).padStart(7)} de ceux qui sont partis`);
console.log("");
console.log("  Les trois crans échouent pour des raisons différentes, et la réparation");
console.log("  n'est pas la même : personne ne voit l'invitation (elle est trop discrète,");
console.log("  ou les comptes ne sont pas configurés) · on la voit sans partir (la");
console.log("  promesse ne vaut pas le détour) · on part sans revenir (le fournisseur");
console.log("  ou le retour est cassé — et là c'est un BUG, pas un arbitrage).");
console.log("");
console.log("  ⚠️ Tous les testeurs ont RÉCLAMÉ un compte. Ce n'est pas la même chose que");
console.log("  d'en créer un : le partage de score aussi était réclamé, et il est resté à");
console.log("  0 %. Ne conclure que de ces trois nombres, jamais de la demande.");
if (compte.parti > 0 && compte.lie === 0) {
  console.log("");
  console.log("  ⇒ Des joueurs sont partis se connecter et AUCUN n'est revenu avec un");
  console.log("    compte. Ce n'est pas un signal produit, c'est une panne : vérifier");
  console.log("    l'URI de retour déclarée chez Google et Discord, et /api/auth?a=fournisseurs.");
}
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
} else if (Number.isNaN(d7.rate)) {
  /*
   * Le cas qui manquait, et c'était le pire des trois.
   *
   * `d7.rate` vaut NaN tant qu'aucun joueur n'a sept jours d'ancienneté — et
   * `NaN < 0.12` est FAUX. Le rapport tombait donc dans la branche finale et
   * annonçait « D7 tenu » pour un D7 qu'il n'avait jamais mesuré, en
   * concluant « ne rien construire de social ». Une absence de mesure
   * transformée en feu vert, dans le seul document censé arbitrer.
   */
  console.log("  · Les liens circulent, mais le D7 n'est pas ENCORE MESURABLE : il faut");
  console.log("    une cohorte de sept jours d'ancienneté. Ne conclus rien sur le social");
  console.log("    tant que cette ligne affiche « — » : reviens quand elle porte un chiffre.");
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

/*
 * Le même découpage, JOUR PAR JOUR.
 *
 * Les totaux ci-dessus mentent dès qu'un déploiement tombe au milieu de la
 * fenêtre — et c'est le cas ordinaire, pas l'exception. Constaté : sur trois
 * jours agrégés, les morts au temps ressortaient à 41,4 %, contre 39,4 % au
 * relevé précédent, ce qui donnait un correctif inefficace. Découpés, les
 * mêmes données disaient 52,7 % la veille du déploiement et 31,1 % le
 * lendemain. Et LE SANG passait de 96,8 % des runs à 29,7 %.
 *
 * Une moyenne qui enjambe un correctif ne mesure plus rien. Cette section
 * existe pour que la ligne du déploiement se voie à l'œil nu.
 */
const parJour = new Map();
for (const r of runs) {
  if (r.day === undefined) continue;
  const j = parJour.get(r.day) ?? { n: 0, causes: {}, regles: new Set(), sang: 0 };
  j.n++;
  j.causes[r.cause ?? "?"] = (j.causes[r.cause ?? "?"] ?? 0) + 1;
  if (r.rule) {
    j.regles.add(r.rule);
    if (r.rule === "sang") j.sang++;
  }
  parJour.set(r.day, j);
}

if (parJour.size > 1) {
  console.log("\nPAR JOUR — cherche la marche d'escalier, c'est là qu'un correctif a atterri");
  console.log("  jour    runs   timeout    wrong    macro   règles   LE SANG");
  for (const [jour, j] of [...parJour].sort((a, b) => a[0] - b[0])) {
    const p = (c) => pct((j.causes[c] ?? 0) / j.n).padStart(7);
    console.log(
      `  ${String(jour).padEnd(7)} ${String(j.n).padStart(4)}  ${p("timeout")}  ${p("wrong")}  ${p("macro")}` +
        `   ${String(j.regles.size).padStart(4)}   ${pct(j.sang / j.n).padStart(7)}`,
    );
  }
}

console.log("\nDIFFICULTÉ PAR RÈGLE UNIQUE (score médian)");
for (const [rule, scores] of Object.entries(byRule).sort((a, b) => median(a[1]) - median(b[1]))) {
  console.log(`  ${rule.padEnd(16)} ${String(median(scores)).padStart(5)}   (n=${scores.length})`);
}

console.log(
  "\nCe rapport ne mesure pas la perception d'équité — le seul risque fatal du projet.\n" +
    "Elle se récolte en parlant à cinq testeurs : « le jeu triche » ou « j'ai mal joué » ?\n",
);
