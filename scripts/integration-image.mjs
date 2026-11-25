#!/usr/bin/env node
/**
 * L'IMAGE DU SERVEUR DE SALONS, LANCÉE POUR DE VRAI — phase 5, point 32.
 *
 *   node scripts/integration-image.mjs                       reconstitue l'image
 *   node scripts/integration-image.mjs --url http://hote:8080  sonde un serveur lancé
 *
 * Le risque d'intégration le plus cher déjà payé : un import vers un fichier
 * ABSENT de la liste `COPY` du Dockerfile passe tsc, les tests et le build, et
 * TUE l'instance au démarrage — Fly répond 502, ce qui se lit « le serveur est
 * tombé » (30/08/2026). `tests/image.test.ts` le garde en lisant les imports ;
 * rien ne CONSTRUISAIT ni ne LANÇAIT l'image.
 *
 * Sans `--url`, le script la reconstitue SANS Docker, à l'identique de ce que
 * le Dockerfile copie : il LIT ses lignes `COPY`, recopie exactement ces
 * chemins dans un dossier vide, installe comme l'image (`npm ci --omit=dev
 * --ignore-scripts`), lance sa commande `CMD` en `NODE_ENV=production`, puis :
 *
 *   1. `/health` répond `ok` ;
 *   2. une socket d'une origine AUTORISÉE ouvre un salon (hello → welcome →
 *      create → room avec un code) ; une origine INCONNUE est refusée — c'est
 *      la liste blanche de production, celle qui casse le multi en silence sur
 *      un nouveau domaine (§10) ;
 *   3. `SIGTERM` ferme la socket avec 1001 et le processus sort avec 0 — le
 *      départ propre que Fly déclenche à chaque déploiement.
 *
 * Avec `--url` (la CI, sur la VRAIE image Docker), il fait 1 et 2.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import WebSocket from "ws";

const ORIGINE = "https://integration.theonerule.test";
const PROTOCOLE = Number(/PROTOCOL_VERSION\s*=\s*(\d+)/.exec(readFileSync("shared/protocol.ts", "utf8"))?.[1]);
const urlDonnee = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : null;

let echecs = 0;
const dit = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) echecs++;
  return ok;
};

/** Attendre une condition, borné — jamais une durée devinée. */
async function attends(f, ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      if (await f()) return true;
    } catch {
      /* pas encore prêt */
    }
    await sleep(200);
  }
  return false;
}

/** hello → welcome → create → room. Rend le code du salon, ou null. */
function ouvreUnSalon(base, origine) {
  return new Promise((resolve) => {
    const ws = new WebSocket(base.replace(/^http/, "ws"), { headers: { Origin: origine } });
    const fin = (v) => {
      clearTimeout(t);
      try {
        ws.close();
      } catch {
        /* déjà fermée */
      }
      resolve(v);
    };
    const t = setTimeout(() => fin(null), 5000);
    ws.on("error", () => fin(null));
    ws.on("unexpected-response", () => fin(null));
    ws.on("open", () => ws.send(JSON.stringify({ t: "hello", v: PROTOCOLE, name: "INTEGRATION", key: "cle-integration" })));
    ws.on("message", (brut) => {
      const m = JSON.parse(String(brut));
      if (m.t === "welcome") ws.send(JSON.stringify({ t: "create" }));
      if (m.t === "room" && m.code) fin(m.code);
    });
  });
}

async function sonde(base) {
  const sante = await attends(async () => (await fetch(`${base}/health`)).ok, 20_000);
  dit(sante, `/health répond (${base})`);
  if (!sante) return false;
  const h = await (await fetch(`${base}/health`)).json();
  dit(h.ok === true, `/health dit ok (salons ${h.rooms}, joueurs ${h.players})`);
  const code = await ouvreUnSalon(base, ORIGINE);
  dit(typeof code === "string" && code.length === 4, `une origine autorisée ouvre un salon (code ${code})`);
  const refuse = await ouvreUnSalon(base, "https://intrus.example");
  dit(refuse === null, "une origine inconnue est refusée (liste blanche de production)");
  return true;
}

if (urlDonnee) {
  await sonde(urlDonnee.replace(/\/+$/, ""));
} else {
  // ── Reconstituer l'image : les COPY du Dockerfile, et rien d'autre.
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const copies = [...dockerfile.matchAll(/^COPY\s+(.+?)\s+(\S+)\s*$/gm)].map((m) => m[1].split(/\s+/));
  const cmd = JSON.parse(/^CMD\s+(\[.*\])\s*$/m.exec(dockerfile)[1]);
  const dossier = mkdtempSync(join(tmpdir(), "tor-image-"));
  for (const sources of copies) for (const s of sources) cpSync(s, join(dossier, s), { recursive: true });
  console.log(`image reconstituée dans ${dossier} : ${copies.flat().join(", ")}`);
  const argsNpm = ["ci", "--omit=dev", "--optional=true", "--ignore-scripts", "--no-audit", "--no-fund"];
  if (process.platform === "win32") {
    execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `npm.cmd ${argsNpm.join(" ")}`], {
      cwd: dossier,
      env: { ...process.env, npm_config_optional: "true" },
      stdio: "ignore",
    });
  } else {
    execFileSync("npm", argsNpm, { cwd: dossier, stdio: "ignore" });
  }

  const port = 18080;
  const metricsPort = 18081;
  const proc = spawn(cmd[0], cmd.slice(1), {
    cwd: dossier,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      METRICS_PORT: String(metricsPort),
      ALLOWED_ORIGINS: ORIGINE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let journal = "";
  proc.stdout.on("data", (d) => (journal += d));
  proc.stderr.on("data", (d) => (journal += d));
  let sortie = null;
  proc.on("exit", (code) => (sortie = code));

  const base = `http://127.0.0.1:${port}`;
  // Un serveur qui ne démarre pas n'a pas d'arrêt à éprouver : on dit
  // pourquoi (son journal, où Node nomme le module introuvable) et on sort.
  if (!(await sonde(base))) {
    proc.kill("SIGKILL");
    console.log(`--- journal du serveur ---\n${journal}`);
    rmSync(dossier, { recursive: true, force: true });
    console.log(`\nINTÉGRATION : ${echecs} échec(s)`);
    process.exit(1);
  }

  const metricsReady = await attends(async () => (await fetch(`http://127.0.0.1:${metricsPort}/metrics`)).ok, 5000);
  const metrics = metricsReady
    ? await fetch(`http://127.0.0.1:${metricsPort}/metrics`).then((r) => r.text())
    : null;
  dit(
    metrics?.includes("# TYPE tor_rooms gauge") &&
      metrics.includes("tor_websocket_connections ") &&
      metrics.includes("# TYPE tor_caught_errors_total counter"),
    "le port dédié expose les métriques Prometheus",
  );
  const metricsPublic = await fetch(`${base}/metrics`).then((r) => r.status);
  dit(metricsPublic === 404, "le port public du serveur n'expose pas /metrics");

  // ── L'arrêt propre : une socket ouverte doit recevoir 1001, puis sortie 0.
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: ORIGINE } });
  const fermeture = new Promise((r) => ws.on("close", (code) => r(code)));
  await new Promise((r) => ws.on("open", r));
  proc.kill("SIGTERM");
  const code = await Promise.race([fermeture, sleep(5000).then(() => "rien")]);
  dit(code === 1001, `SIGTERM ferme les sockets en 1001 (reçu ${code})`);
  await attends(() => sortie !== null, 5000);
  dit(sortie === 0, `le processus sort proprement (code ${sortie})`);
  if (echecs) console.log(`--- journal du serveur ---\n${journal}`);
  rmSync(dossier, { recursive: true, force: true });
}

console.log(echecs ? `\nINTÉGRATION : ${echecs} échec(s)` : "\nINTÉGRATION : ok");
process.exit(echecs ? 1 : 0);
