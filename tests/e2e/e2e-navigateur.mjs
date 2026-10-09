/**
 * BOUT EN BOUT, AVEC UN VRAI NAVIGATEUR — phase 3, points 19 et 20 ; phase 4, point 22.
 *
 * `e2e.mjs` pilote des sockets BRUTES : il prouve ce que fait le SERVEUR, et
 * rien de ce que fait le client. Or les deux correctifs de l'audit sur la
 * reprise de siège vivent des deux côtés — `attemptRejoin`, `departSubi`,
 * `remplace`, l'écouteur `storage` de `progress.ts` — et la moitié client
 * n'était exercée par aucun test. Ici, c'est le VRAI bundle (Vite en dev) qui
 * tourne dans Chromium, et le serveur de salons tourne dans ce processus.
 *
 * ⚠️ UNE COUPURE NE SE SIMULE PAS AVEC `context.setOffline`. Mesuré : une
 * socket déjà ouverte vers localhost survit dix secondes hors ligne, le siège
 * reste `connected: true` et le client ne voit rien. Le navigateur parle donc
 * à un RELAIS TCP (`relais`), et c'est lui qu'on tranche : il détruit les
 * connexions en cours et refuse les nouvelles, exactement ce qu'un tunnel de
 * métro fait à un téléphone.
 *
 * Lancement : `npm run e2e:navigateur`. Comme l'e2e : SEUL sur la machine.
 */
import net from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const PORT_SALONS = 8798;
const PORT_RELAIS = 8799;
const PORT_VITE = 5199;
process.env.PORT = String(PORT_SALONS);
// Lue par Vite à la compilation (voir §10) : elle doit précéder `createServer`.
process.env.VITE_WS_URL = `ws://localhost:${PORT_RELAIS}`;

const { default: WebSocket } = await import("ws");
const { createServer } = await import("vite");
const { chromium } = await import("playwright-core");
await import("../../server/index.ts");
const { RECONNECT_GRACE_MS } = await import("../../shared/protocol.ts");
const { FENETRE_REPRISE_MS } = await import("../../src/net/reprise.ts");

/* ------------------------------------------------------------------ *
 * Journal : même doctrine que `e2e.mjs`, chaque assertion porte son numéro.
 * ------------------------------------------------------------------ */
const T0 = Date.now();
const ms = () => String(Date.now() - T0).padStart(6, " ");
let numero = 0;
let echecs = 0;
function ok(cond, quoi) {
  numero += 1;
  const n = String(numero).padStart(3, "0");
  if (cond) console.log(`  ✓ [${n}] ${ms()} ms  ${quoi}`);
  else {
    echecs += 1;
    console.error(`  ✗ [${n}] ${ms()} ms  ${quoi}`);
  }
  return cond;
}

/** Attendre qu'une condition devienne vraie, borné, sans durée devinée. */
async function attends(cond, maxMs, pas = 100) {
  const fin = Date.now() + maxMs;
  while (Date.now() < fin) {
    if (await cond()) return true;
    await sleep(pas);
  }
  return !!(await cond());
}

/* ------------------------------------------------------------------ *
 * LE RELAIS — un câble qu'on peut couper.
 * ------------------------------------------------------------------ */
const relais = (() => {
  let coupe = false;
  const paires = new Set();
  const serveur = net.createServer((entree) => {
    if (coupe) {
      entree.destroy();
      return;
    }
    const sortie = net.connect(PORT_SALONS, "127.0.0.1");
    const paire = { entree, sortie };
    paires.add(paire);
    const fin = () => {
      entree.destroy();
      sortie.destroy();
      paires.delete(paire);
    };
    entree.on("error", fin).on("close", fin);
    sortie.on("error", fin).on("close", fin);
    entree.pipe(sortie);
    sortie.pipe(entree);
  });
  return {
    ecoute: () => new Promise((r) => serveur.listen(PORT_RELAIS, "127.0.0.1", r)),
    /** Tranche tout ce qui passe, et refuse ce qui voudrait passer. */
    coupe() {
      coupe = true;
      for (const { entree, sortie } of paires) {
        entree.destroy();
        sortie.destroy();
      }
      paires.clear();
    },
    retablit() {
      coupe = false;
    },
    ferme: () => new Promise((r) => serveur.close(r)),
  };
})();
await relais.ecoute();

/* ------------------------------------------------------------------ *
 * L'HÔTE — une socket brute : il crée, règle et lance. Il ne joue pas.
 * ------------------------------------------------------------------ */
function hote(nom) {
  const ws = new WebSocket(`ws://localhost:${PORT_SALONS}`);
  const h = { ws, id: "", room: null, rooms: [], verdicts: [], debut: false };
  ws.on("message", (brut) => {
    const m = JSON.parse(String(brut));
    if (m.t === "welcome") h.id = m.id;
    if (m.t === "room") {
      h.room = m;
      h.rooms.push({ at: Date.now(), players: m.players.map((p) => ({ id: p.id, connected: p.connected })) });
    }
    if (m.t === "match_start") h.debut = true;
    if (m.t === "verdict") h.verdicts.push({ at: Date.now(), idx: m.idx, outcomes: m.outcomes });
  });
  h.pret = new Promise((r) =>
    ws.on("open", () => {
      ws.send(JSON.stringify({ t: "hello", v: 1, name: nom, glyph: 0, key: `cle-${nom}`, reprise: true }));
      r();
    }),
  );
  h.envoie = (m) => ws.send(JSON.stringify(m));
  h.siege = (id) => h.room?.players.find((p) => p.id === id) ?? null;
  return h;
}

async function salonOuvert(nom) {
  const h = hote(nom);
  await h.pret;
  await attends(() => h.id !== "", 3000);
  h.envoie({ t: "create" });
  await attends(() => !!h.room?.code, 3000);
  // Lent et généreux : la coupure doit tomber EN PLEINE partie, pas après.
  h.envoie({ t: "settings", settings: { speed: 1.7, lives: 5 } });
  return h;
}

/* ------------------------------------------------------------------ *
 * Le front, et le navigateur.
 * ------------------------------------------------------------------ */
// La racine du dépôt, lue depuis CE fichier : le scénario se lance aussi
// d'ailleurs que la racine (`npx tsx tests/e2e/e2e-navigateur.mjs` depuis un
// sous-dossier), et Vite servirait sinon le mauvais index.html.
const RACINE = fileURLToPath(new URL("../../", import.meta.url));
const vite = await createServer({
  root: RACINE,
  server: { port: PORT_VITE, strictPort: true },
  logLevel: "warn",
});
await vite.listen();
// `CHROMIUM_PATH` : un Chrome du système (la CI, un poste sans navigateur
// Playwright). Absent, `playwright-core` prend le sien.
const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const SITE = `http://localhost:${PORT_VITE}`;

/** Un contexte = un appareil : son `localStorage`, donc son anonId, sa clé. */
async function appareil() {
  const ctx = await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1280, height: 800 } });
  const erreurs = [];
  ctx.on("weberror", (e) => erreurs.push(String(e.error())));
  return { ctx, erreurs };
}

const etat = (page) =>
  page.evaluate(() => {
    const vis = (id) => {
      const el = document.getElementById(id);
      return !!el && !el.classList.contains("hidden") && !el.closest(".hidden");
    };
    return {
      coupure: vis("coupure"),
      ecrans: [...document.querySelectorAll(".screen")].filter((e) => !e.classList.contains("hidden")).map((e) => e.id),
      erreur: vis("multiJoinErr") ? document.getElementById("multiJoinErr").textContent : "",
      code: document.getElementById("multiCode")?.value ?? "",
      // Le crochet de dev rend « idle » hors d'une manche multi en cours.
      enJeu: window.__tor?.joueMulti?.() !== "idle",
    };
  });

/** Le siège de l'invité, vu par l'hôte : le seul qui n'est pas lui. */
const invite = (h) => h.room?.players.find((p) => p.id !== h.id) ?? null;

/* ================================================================== *
 * 19 — LA COUPURE RÉSEAU, en pleine partie.
 * ================================================================== */
console.log("\n19 · coupure réseau, client réel");
{
  const h = await salonOuvert("HOTE19");
  const { ctx, erreurs } = await appareil();
  const page = await ctx.newPage();
  await page.goto(`${SITE}/#j=${h.room.code}`);
  ok(await attends(() => !!invite(h)?.connected, 8000), "l'invité arrive au salon par le lien");
  const idAvant = invite(h)?.id;

  h.envoie({ t: "start" });
  ok(await attends(async () => h.verdicts.length >= 1 && (await etat(page)).enJeu, 15_000), "le match tourne chez l'invité");

  // ── Coupure brève : le client doit revenir SEUL, sur le même siège.
  relais.coupe();
  const tCoupe = Date.now();
  ok(await attends(async () => (await etat(page)).coupure, 3000), "le panneau de coupure paraît (décision n°4 visible)");
  ok(await attends(() => invite(h)?.connected === false, 3000), "le serveur garde le siège, marqué déconnecté");
  // Cinq secondes : un tunnel, un changement de réseau. L'ancien client
  // abandonnait à 1,6 s pour un siège gardé 25 (`net/reprise.ts`).
  await sleep(5000);
  relais.retablit();
  ok(
    await attends(() => invite(h)?.connected === true, 8000),
    `l'invité reprend sa place seul (coupure de ${Date.now() - tCoupe} ms)`,
  );
  ok(invite(h)?.id === idAvant, "MÊME identifiant de siège après la reprise");
  ok(h.room.players.length === 2, "aucun siège fantôme n'a été créé");
  const apres = await etat(page);
  ok(!apres.ecrans.includes("multi-join"), `pas renvoyé à l'écran de saisie (écrans : ${apres.ecrans.join(",") || "jeu"})`);
  ok(await attends(async () => !(await etat(page)).coupure, 3000), "le panneau de coupure s'efface");
  const nVerdicts = h.verdicts.length;
  ok(
    // `idle` est le verdict d'un ABSENT : il faut un vrai jugement de manche.
    await attends(() => h.verdicts.slice(nVerdicts).some((v) => v.outcomes[idAvant] && v.outcomes[idAvant].kind !== "idle"), 15_000),
    "le match juge de nouveau l'invité après la reprise (verdict non « idle »)",
  );

  // ── Coupure longue : les trois essais échouent, la main revient au joueur.
  relais.coupe();
  const tLongue = Date.now();
  ok(
    await attends(async () => (await etat(page)).ecrans.includes("multi-join"), FENETRE_REPRISE_MS + 15_000),
    "coupure longue : le client rend la main après ses essais",
  );
  const fin = await etat(page);
  ok(/CONNEXION PERDUE/.test(fin.erreur), `le motif est dit (« ${fin.erreur} »)`);
  ok(fin.code === h.room.code, `le code est déjà saisi (${fin.code})`);
  const duree = Date.now() - tLongue;
  ok(duree >= FENETRE_REPRISE_MS, `il a essayé tout le calendrier (${duree} ms ≥ ${FENETRE_REPRISE_MS})`);
  ok(duree < RECONNECT_GRACE_MS + 5000, `et pas au-delà du sursis (${duree} ms < ${RECONNECT_GRACE_MS + 5000})`);
  relais.retablit();
  ok(erreurs.length === 0, `aucune erreur de page (${erreurs.join(" | ") || "—"})`);

  h.ws.close();
  await ctx.close();
}

/* ================================================================== *
 * 20 — DEUX ONGLETS DU MÊME APPAREIL.
 * ================================================================== */
console.log("\n20 · deux onglets, un appareil");
{
  // (a) La sauvegarde : chaque onglet garde une copie en mémoire. Sans
  // l'écouteur `storage`, l'onglet A réécrivait SA copie périmée et effaçait
  // en silence ce que B venait d'écrire.
  const { ctx, erreurs } = await appareil();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  await a.goto(`${SITE}/reglages`);
  await b.goto(`${SITE}/reglages`);
  await a.waitForSelector("#btnPhotosAutres", { state: "visible" });
  await b.waitForSelector("#rglTheme [data-value='sombre']", { state: "visible" });
  await b.click("#rglTheme [data-value='sombre']", { force: true });
  await a.click("#btnPhotosAutres", { force: true });
  const save = await a.evaluate(() => JSON.parse(localStorage.getItem("oneRule.save.v1") ?? "{}"));
  ok(save.theme === "sombre", `l'écriture de l'onglet B survit à celle de A (thème « ${save.theme} »)`);
  ok(save.photosAutres === false, "et celle de A est bien écrite aussi");

  // (b) Le même salon ouvert deux fois : la plus récente garde le siège, la
  // plus ancienne le DIT et ne revient pas — sinon les deux se renverraient
  // la place en boucle.
  const h = await salonOuvert("HOTE20");
  await a.goto(`${SITE}/#j=${h.room.code}`);
  ok(await attends(() => !!invite(h)?.connected, 8000), "l'onglet A s'assoit");
  const idA = invite(h)?.id;
  await b.goto(`${SITE}/#j=${h.room.code}`);
  ok(
    await attends(async () => /REPRISE SUR UN AUTRE ÉCRAN/.test((await etat(a)).erreur), 8000),
    "l'onglet A apprend que sa place est reprise ailleurs",
  );
  ok(await attends(async () => (await etat(b)).ecrans.includes("multi-lobby"), 5000), "l'onglet B est au salon");
  ok(invite(h)?.id === idA && invite(h)?.connected === true, "même siège, connecté, tenu par B");
  // Le ping-pong se verrait dans le flux de l'hôte : le siège basculerait.
  const n = h.rooms.length;
  await sleep(6000);
  const bascules = h.rooms.slice(n).filter((r) => r.players.some((p) => p.id === idA && !p.connected)).length;
  ok(bascules === 0, `aucun ping-pong sur 6 s (${bascules} bascule(s))`);
  ok(h.room.players.length === 2, "toujours deux sièges");
  ok(!(await etat(a)).ecrans.includes("multi-lobby"), "l'onglet A ne s'est pas rassis tout seul");
  ok(erreurs.length === 0, `aucune erreur de page (${erreurs.join(" | ") || "—"})`);

  h.ws.close();
  await ctx.close();
}

/* ================================================================== *
 * 22 — LE TERRAIN NE SE PEINT PAS DERRIÈRE UN MENU.
 *
 * Le fond sable des menus recouvre tout le canvas (0 point sur 49 visible,
 * mesuré) ; la boucle le repeignait pourtant 60 fois par seconde. On compte
 * les `clearRect` du canvas de jeu — chaque image en commence une.
 * ================================================================== */
console.log("\n22 · le terrain caché ne coûte rien");
{
  const { ctx, erreurs } = await appareil();
  await ctx.addInitScript(() => {
    window.__peintures = 0;
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...a) {
      if (this.canvas.id === "cv") window.__peintures++;
      return clear.apply(this, a);
    };
  });
  // Point 24 : les extensions NÉGOCIÉES par le navigateur, socket par socket.
  await ctx.addInitScript(() => {
    window.__extensions = [];
    const W = window.WebSocket;
    window.WebSocket = class extends W {
      constructor(...a) {
        super(...a);
        this.addEventListener("open", () => window.__extensions.push(this.extensions));
      }
    };
  });
  const page = await ctx.newPage();
  for (const chemin of ["/", "/solo", "/reglages"]) {
    await page.goto(`${SITE}${chemin}`);
    await page.waitForTimeout(400);
    const avant = await page.evaluate(() => window.__peintures);
    await page.waitForTimeout(1000);
    const n = (await page.evaluate(() => window.__peintures)) - avant;
    ok(n === 0, `${chemin} : ${n} peinture(s) du terrain caché en 1 s`);
  }
  // Et il se peint dès qu'on joue : le salon puis le match.
  const h = await salonOuvert("HOTE22");
  await page.goto(`${SITE}/#j=${h.room.code}`);
  await attends(() => !!invite(h)?.connected, 8000);
  h.envoie({ t: "start" });
  ok(await attends(async () => (await etat(page)).enJeu, 15_000), "le match démarre");
  const avant = await page.evaluate(() => window.__peintures);
  await page.waitForTimeout(1000);
  const n = (await page.evaluate(() => window.__peintures)) - avant;
  ok(n >= 20, `en match, le terrain se peint (${n} images en 1 s)`);
  const ext = await page.evaluate(() => window.__extensions.filter((e) => e !== undefined));
  ok(
    ext.some((e) => e.includes("permessage-deflate")),
    `24 · Chromium négocie la compression avec le serveur de salons (${JSON.stringify(ext)})`,
  );
  ok(erreurs.length === 0, `aucune erreur de page (${erreurs.join(" | ") || "—"})`);
  h.ws.close();
  await ctx.close();
}

await navigateur.close();
await vite.close();
await relais.ferme();
console.log(`\nE2E NAVIGATEUR : ${echecs === 0 ? `${numero} assertions, 0 échec` : `${echecs} échec(s) sur ${numero}`}`);
process.exit(echecs === 0 ? 0 : 1);
