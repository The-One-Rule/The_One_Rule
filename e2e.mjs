/**
 * Bout en bout, un seul processus : le serveur est importé (il ouvre son port),
 * trois vrais clients WebSocket jouent un match court.
 * ALICE joue juste · BOB clique tout · CHLOE ne répond jamais.
 */
process.env.PORT = "8797";
import WebSocket from "ws";
import { setTimeout as sleep } from "node:timers/promises";
await import("./server/index.ts");
const { buildMultiRound } = await import("./src/engine/multiround.ts");
const { ONE_RULES } = await import("./src/engine/rules/index.ts");

function client(name, key) {
  const ws = new WebSocket("ws://localhost:8797");
  const c = { name, key, ws, id: "", room: null, seed: 0, rules: {}, verdicts: [], ended: null, offset: 0, emotes: [], chats: [], errors: [] };
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.t === "welcome") c.id = m.id;
    if (m.t === "pong") c.offset = m.serverNow - (m.sent + Date.now()) / 2;
    if (m.t === "room") c.room = m;
    if (m.t === "match_start") { c.seed = m.seed; c.rules = m.rules; }
    if (m.t === "round") {
      if (m.rules) c.rules = m.rules;
      const rule = ONE_RULES.find((r) => r.id === c.rules[c.id]);
      if (!rule || name === "CHLOE") return;
      const round = buildMultiRound(c.seed, m.idx, rule);
      const at = () => Date.now() + c.offset;
      setTimeout(() => {
        if (name === "BOB") { ws.send(JSON.stringify({ t: "input", round: m.idx, at: at(), action: { k: "c", i: 0 } })); return; }
        if (round.steps.length === 0) return; // piège : silence
        round.steps.forEach((st, k) => {
          const a = st.kind === "click" ? { k: "c", i: st.idx }
            : st.kind === "key" ? { k: "k", key: st.key }
            : { k: "c", i: Math.max(0, round.ents.findIndex((e) => st.kind !== "clickAnyExcept" || e.color !== st.color)) };
          setTimeout(() => ws.send(JSON.stringify({ t: "input", round: m.idx, at: at(), action: a })), k * 55);
        });
      }, 230);
    }
    if (m.t === "verdict") c.verdicts.push(m);
    if (m.t === "match_end") c.ended = m;
    if (m.t === "emote") c.emotes.push(m);
    if (m.t === "chat") c.chats.push(m);
    if (m.t === "error") c.errors.push(m);
  });
  return new Promise((res) => ws.on("open", () => { ws.send(JSON.stringify({ t: "hello", v: 1, name, key })); setTimeout(() => res(c), 120); }));
}

const [alice, bob, chloe] = await Promise.all([client("ALICE"), client("BOB"), client("CHLOE")]);
for (const c of [alice, bob, chloe]) for (let i = 0; i < 4; i++) { c.ws.send(JSON.stringify({ t: "ping", sent: Date.now() })); await sleep(25); }

alice.ws.send(JSON.stringify({ t: "create" }));
await sleep(150);
bob.ws.send(JSON.stringify({ t: "join", code: alice.room.code }));
chloe.ws.send(JSON.stringify({ t: "join", code: alice.room.code }));
await sleep(200);
alice.ws.send(JSON.stringify({ t: "start" }));

// BOB (erreurs) et CHLOE (timeouts) tombent ; dès qu'ALICE est seule, le
// serveur envoie match_end immédiatement — plus besoin de leave forcé.
const t0 = Date.now();
while (!alice.ended && Date.now() - t0 < 40000) await sleep(250);

let fails = 0;
const ok = (b, msg) => { console.log((b ? "ok  " : "FAIL") + " " + msg); if (!b) fails++; };
ok(!!alice.ended, "match_end reçu sans leave forcé (fin immédiate au dernier survivant)");
const last = alice.verdicts[alice.verdicts.length - 1];
ok(alice.verdicts.length >= 3, `manches jouées : ${alice.verdicts.length}`);
ok(bob.verdicts.length === alice.verdicts.length, "verdicts identiques chez tous les clients");
const bobP = last?.players.find((p) => p.name === "BOB");
const chloeP = last?.players.find((p) => p.name === "CHLOE");
ok(bobP && bobP.lives === 0, `BOB éliminé (vies=${bobP?.lives})`);
ok(chloeP && chloeP.lives === 0, `CHLOE éliminée par timeouts (vies=${chloeP?.lives})`);
const aliceP = last?.players.find((p) => p.name === "ALICE");
ok(aliceP && aliceP.lives > 0, `ALICE en vie (vies=${aliceP?.lives}, score=${aliceP?.score})`);
// Les pièges sont probabilistes (~10-20 % des manches) : sur un match court il
// peut n'y en avoir aucun. Le comportement lui-même est couvert par les tests
// unitaires de MatchLogic ; ici on ne fait que le signaler s'il a eu lieu.
const trapDodged = alice.verdicts.some((v) => Object.values(v.outcomes).some((o) => o.kind === "survive" && o.trap));
console.log("info " + (trapDodged ? "un piège a été déjoué pendant ce match" : "aucun piège tiré sur ce match court (normal)"));
ok(Math.abs(alice.offset) < 50, `offset d'horloge plausible en local (${alice.offset.toFixed(1)} ms)`);

// Débit emotes : le salon existe encore après match_end.
alice.emotes.length = 0;
bob.ws.send(JSON.stringify({ t: "emote", k: 0 }));
bob.ws.send(JSON.stringify({ t: "emote", k: 1 }));
await sleep(200);
ok(alice.emotes.length === 1, `débit emote : 1 reçue sur 2 rapides (got ${alice.emotes.length})`);
ok(alice.emotes[0]?.playerId === bob.id, "emote porte l'id de BOB");
await sleep(1600);
bob.ws.send(JSON.stringify({ t: "emote", k: 2 }));
await sleep(200);
ok(alice.emotes.length === 2, `débit emote : 2e acceptée après cooldown (got ${alice.emotes.length})`);
ok(alice.emotes[1]?.playerId === bob.id && alice.emotes[1]?.k === 2, "3e emote : bon playerId et k");

// Chat : coupe, débit silencieux, trim, kick.
alice.chats.length = 0;
bob.ws.send(JSON.stringify({ t: "chat", text: "x".repeat(300) }));
await sleep(200);
ok(alice.chats.length === 1, `chat long : 1 message reçu (got ${alice.chats.length})`);
ok(alice.chats[0]?.text?.length === 140, `chat coupé à 140 (got ${alice.chats[0]?.text?.length})`);
ok(alice.chats[0]?.playerId === bob.id && alice.chats[0]?.name === "BOB", "chat porte playerId et name de BOB");

await sleep(800);
alice.chats.length = 0;
bob.ws.send(JSON.stringify({ t: "chat", text: "un" }));
bob.ws.send(JSON.stringify({ t: "chat", text: "deux" }));
await sleep(200);
ok(alice.chats.length === 1, `débit chat : 1 reçu sur 2 rapides (got ${alice.chats.length})`);

await sleep(800);
alice.chats.length = 0;
bob.ws.send(JSON.stringify({ t: "chat", text: " " }));
await sleep(200);
ok(alice.chats.length === 0, "chat espace seul : ignoré");

bob.errors.length = 0;
bob.ws.send(JSON.stringify({ t: "kick", playerId: alice.id }));
await sleep(200);
ok(alice.room?.players?.some((p) => p.id === alice.id), "kick non-hôte : ALICE toujours dans le salon");
ok(bob.errors.some((e) => e.code === "not_host"), "kick non-hôte : BOB reçoit not_host");

const chloeClosed = new Promise((res) => chloe.ws.once("close", () => res(true)));
alice.ws.send(JSON.stringify({ t: "kick", playerId: chloe.id }));
await Promise.race([chloeClosed, sleep(800).then(() => false)]);
await sleep(150);
ok(
  chloe.ws.readyState === WebSocket.CLOSED || chloe.ws.readyState === WebSocket.CLOSING,
  "hôte exclut CHLOÉ : connexion fermée",
);
ok(!alice.room?.players?.some((p) => p.id === chloe.id), "hôte exclut CHLOÉ : absente du room suivant");

// Reprise de siège après coupure — le cas NORMAL sur mobile.
//
// Avant : l'identifiant était attribué par connexion, donc ws.close()
// déclenchait forfeit() et revenir donnait une identité neuve, c'est-à-dire un
// siège de spectateur. Une bascule d'application éliminait définitivement.
{
  const dora = await client("DORA", "cle-stable-dora");
  dora.ws.send(JSON.stringify({ t: "create" }));
  await sleep(200);
  const code = dora.room.code;
  const emil = await client("EMIL", "cle-stable-emil");
  emil.ws.send(JSON.stringify({ t: "join", code }));
  await sleep(200);
  dora.ws.send(JSON.stringify({ t: "start" }));
  await sleep(3600); // compte à rebours + une manche entamée

  const avant = emil.room?.players?.find((p) => p.name === "EMIL");
  const idAvant = emil.id;
  emil.ws.close();
  await sleep(400);

  const vuParDora = dora.room?.players?.find((p) => p.name === "EMIL");
  ok(!!vuParDora, "siège gardé pendant la coupure (EMIL toujours listé)");
  ok(vuParDora?.connected === false, "EMIL apparaît déconnecté aux autres");

  const emil2 = await client("EMIL", "cle-stable-emil");
  emil2.ws.send(JSON.stringify({ t: "join", code }));
  await sleep(400);
  ok(emil2.id === idAvant, `siège repris : même identifiant (${idAvant} → ${emil2.id})`);
  const apres = emil2.room?.players?.find((p) => p.id === emil2.id);
  ok(apres?.spectator === false, "EMIL rejoue, il n'est PAS spectateur");
  ok(
    apres && avant && apres.lives <= avant.lives && apres.lives > 0,
    `vies conservées (${avant?.lives} → ${apres?.lives})`,
  );

  // Une clé différente ne doit RIEN pouvoir reprendre.
  const voleur = await client("VOLEUR", "cle-inconnue");
  voleur.ws.send(JSON.stringify({ t: "join", code }));
  await sleep(300);
  ok(voleur.id !== idAvant, "une autre clé ne reprend pas le siège d'EMIL");

  for (const c of [dora, emil2, voleur]) c.ws.close();
  await sleep(200);
}

// Messages malformés : le serveur doit survivre.
//
// `decodeClient` ne valide que la présence d'un `t`. Un `input` sans `action`
// levait un TypeError dans le gestionnaire `message`, et une exception non
// capturée dans un écouteur Node tue le processus — donc TOUS les salons de
// l'instance, depuis une seule socket. Ce test est la régression : si le
// serveur meurt ici, plus rien ne répond ensuite et /health tombe avec.
alice.ws.send(JSON.stringify({ t: "create" }));
await sleep(150);
alice.ws.send(JSON.stringify({ t: "start" }));
await sleep(3200); // COUNTDOWN_MS + marge : il faut une manche OUVERTE pour atteindre le code fautif
const malformes = [
  { t: "input", round: 0, at: 0 },                          // action absente : le crasheur
  { t: "input", round: 0, at: 0, action: null },
  { t: "input", round: 0, at: 0, action: {} },
  { t: "input", round: 0, at: 0, action: { k: "c", i: "__proto__" } },
  { t: "input", round: 0, at: 0, action: { k: "c", i: 1e9 } },
  { t: "input", round: 0, at: 0, action: { k: "k" } },
  { t: "settings", settings: "pas un objet" },
  { t: "emote", k: "beaucoup" },
  { t: "watch" },
  { t: "join" },
  { t: "kick" },
  { t: "hello", v: 1, glyph: { shape: "banane", color: 999, pattern: -1 } },
];
for (const m of malformes) {
  alice.ws.send(JSON.stringify(m));
  await sleep(20);
}
await sleep(200);
const surviving = await fetch(`http://127.0.0.1:${process.env.PORT}/health`)
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);
ok(surviving?.ok === true, `serveur vivant après ${malformes.length} messages malformés`);
ok(alice.ws.readyState === WebSocket.OPEN, "socket d'ALICE toujours ouverte après les malformés");
alice.ws.send(JSON.stringify({ t: "leave" }));
await sleep(150);

// Sonde de l'hébergeur. Elle doit répondre SUR LE MÊME PORT que la WebSocket,
// sinon la machine est déclarée morte en boucle alors que le jeu tourne.
const health = await fetch(`http://127.0.0.1:${process.env.PORT}/health`)
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);
ok(health?.ok === true, `sonde /health : 200 (rooms=${health?.rooms}, players=${health?.players})`);
ok(typeof health?.uptime === "number", `sonde /health : uptime présent (${health?.uptime}s)`);
const notFound = await fetch(`http://127.0.0.1:${process.env.PORT}/`)
  .then((r) => r.status)
  .catch(() => 0);
ok(notFound === 404, `hors /health : 404 et non 200 (got ${notFound})`);

console.log(fails === 0 ? "E2E OK" : `E2E : ${fails} échec(s)`);
process.exit(fails === 0 ? 0 : 1);
