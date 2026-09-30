#!/usr/bin/env node
/**
 * Vérifie qu'UNE SEULE instance sert les salons.
 *
 *   node scripts/check-salons.mjs https://the-one-rule-salons.fly.dev
 *
 * Les salons vivent dans la mémoire du processus. Deux instances derrière la
 * même URL = deux jeux de salons disjoints : le joueur routé sur la mauvaise
 * ne trouvera JAMAIS le code de son ami, et le jeu lui répond « SALON
 * INTROUVABLE », ce qui ressemble à une faute de frappe. Personne ne soupçonne
 * l'hébergement.
 *
 * C'est arrivé en production : Fly provisionne deux machines par défaut pour la
 * haute disponibilité, et `min_machines_running = 1` dans fly.toml est un
 * MINIMUM, pas un plafond. Les deux étaient dans la même région — ce n'est donc
 * même pas une question de distance, juste de répartition de charge.
 *
 * Lecture seule : on ne fait que sonder /health.
 */

const base = process.argv[2]?.replace(/\/+$/, "");
if (!base) {
  console.error("usage : node scripts/check-salons.mjs https://ton-app.fly.dev");
  process.exit(2);
}

const TIRS = 14;
const vus = new Map(); // instance → nombre de réponses
/** La dernière réponse de chaque instance : son état de santé. */
const etats = new Map();

for (let i = 0; i < TIRS; i++) {
  try {
    const res = await fetch(base + "/health", { cache: "no-store" });
    if (!res.ok) {
      console.error(`✗ /health a répondu ${res.status} ${res.statusText}`);
      process.exit(1);
    }
    const j = await res.json();
    // `instance` est le marqueur fiable. Sur un serveur antérieur à son ajout,
    // on retombe sur l'uptime : deux machines démarrées à des instants
    // différents produisent deux séries qui s'entrelacent.
    const cle = j.instance ?? `uptime~${Math.round((j.uptime ?? 0) / 5)}`;
    vus.set(cle, (vus.get(cle) ?? 0) + 1);
    etats.set(cle, j);
  } catch (err) {
    console.error(`✗ ${base}/health injoignable : ${String(err)}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 150));
}

const n = vus.size;
console.log(`\nSondage de ${base} — ${TIRS} appels\n`);
for (const [k, c] of vus) console.log(`  ${String(c).padStart(3)} réponses   instance ${k}`);

/*
 * L'ÉTAT DE CHAQUE INSTANCE — de quoi diagnostiquer « ça déconnecte tout
 * seul » sans accès à la machine. Un serveur récent expose son démarrage, sa
 * mémoire, son image et les exceptions rattrapées ; un serveur plus ancien
 * n'a que l'uptime, et on le dit.
 */
let alerte = false;
for (const [k, j] of etats) {
  const min = Math.round((j.uptime ?? 0) / 60);
  console.log(`\n  instance ${k}`);
  console.log(`     en marche depuis ${min} min${j.demarre ? ` (démarrée ${j.demarre})` : ""}`);
  if (j.memoireMo !== undefined) console.log(`     mémoire ${j.memoireMo} Mo · ${j.connexions} connexions · ${j.rooms} salons`);
  if (j.image) console.log(`     image ${j.image}`);
  if (j.erreurs === undefined) {
    console.log("     (serveur antérieur au diagnostic : redéployer pour voir erreurs et mémoire)");
  } else if (j.erreurs > 0) {
    alerte = true;
    console.log(`  ⚠  ${j.erreurs} exception(s) rattrapée(s) depuis le démarrage — voir \`fly logs\` (minuterie_error, fermeture_error, crash_evite)`);
  }
  if (min < 15) {
    alerte = true;
    console.log("  ⚠  démarrée il y a moins de 15 min : un déploiement récent, ou un REDÉMARRAGE (plantage, mémoire). Tous les salons ont alors été perdus.");
  }
  if (j.memoireMo > 400) {
    alerte = true;
    console.log("  ⚠  plus de 400 Mo pour une machine de 512 : risque d'arrêt par manque de mémoire.");
  }
}
if (alerte) console.log("");

if (n === 1) {
  console.log("\n  OK  une seule instance : les codes de salon résoudront pour tout le monde.\n");
  process.exit(0);
}

console.log(
  `\n  ÉCHEC  ${n} instances répondent derrière la même URL.\n` +
    "     Les salons vivent en mémoire : deux joueurs routés sur des instances\n" +
    "     différentes ne se verront jamais, et l'un des deux lira\n" +
    "     « SALON INTROUVABLE » sans qu'aucune erreur n'apparaisse nulle part.\n\n" +
    "     Réparation immédiate :\n" +
    "         fly scale count 1 --app <ton-app>\n\n" +
    "     Ne remonte pas en échelle tant que les salons ne sont pas dans un\n" +
    "     stockage partagé : le nombre de machines est une décision de jeu ici,\n" +
    "     pas une décision d'exploitation.\n",
);
process.exit(1);
