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
  } catch (err) {
    console.error(`✗ ${base}/health injoignable : ${String(err)}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 150));
}

const n = vus.size;
console.log(`\nSondage de ${base} — ${TIRS} appels\n`);
for (const [k, c] of vus) console.log(`  ${String(c).padStart(3)} réponses   instance ${k}`);

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
