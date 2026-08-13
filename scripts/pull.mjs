#!/usr/bin/env node
/**
 * Extraction des événements mesurés, vers le rapport.
 *
 *   node scripts/pull.mjs | node scripts/report.mjs
 *   node scripts/pull.mjs > events.ndjson
 *
 * `api/collect.ts` pousse les événements dans des listes Redis, une par jour de
 * réception (`ev:AAAA-MM-JJ`). Ce script les ressort en NDJSON, dans l'ordre,
 * exactement au format que `report.mjs` sait lire — c'est tout l'intérêt de
 * n'avoir jamais stocké autre chose que la ligne brute.
 *
 * Variables attendues : UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN,
 * les mêmes que la fonction de collecte. `vercel env pull` les dépose dans
 * .env.local, que ce script lit tout seul si elles ne sont pas dans
 * l'environnement.
 */

if (!process.env.UPSTASH_REDIS_REST_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* pas de fichier local : on se rabat sur l'environnement */
  }
}

const URL_BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!URL_BASE || !TOKEN) {
  console.error(
    "UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN sont requis.\n" +
      "  vercel env pull .env.local     puis relancer",
  );
  process.exit(1);
}

/** Un aller-retour par appel : le quota gratuit se compte en commandes. */
async function pipeline(commands) {
  const res = await fetch(`${URL_BASE}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    console.error(`Upstash a répondu ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  return res.json();
}

// KEYS plutôt que SCAN : les clés expirent au bout de 40 jours, il y en a donc
// quarante au maximum. Sur un keyspace de cette taille, itérer serait de la
// cérémonie.
const [{ result: keys }] = await pipeline([["KEYS", "ev:*"]]);

if (!keys?.length) {
  console.error("Aucun événement stocké. La collecte a-t-elle déjà tourné ?");
  process.exit(0);
}

keys.sort();
const lists = await pipeline(keys.map((k) => ["LRANGE", k, "0", "-1"]));

let total = 0;
for (const entry of lists) {
  for (const line of entry.result ?? []) {
    process.stdout.write(line + "\n");
    total++;
  }
}

console.error(`${total} événements sur ${keys.length} jour(s) : ${keys[0]} → ${keys.at(-1)}`);
