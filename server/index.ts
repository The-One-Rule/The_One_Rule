/**
 * Serveur de salons — Node + ws.
 *
 * Rôles, et rien d'autre :
 *   · tenir les salons (code à 4 lettres, lien partageable)
 *   · faire AUTORITÉ sur le temps : chaque manche a un startAt et une
 *     deadline sur l'horloge serveur, les clients s'y calent par ping
 *   · juger les inputs via MatchLogic et diffuser les verdicts
 *
 * Tout ce qui est jeu (scènes, règles, pièges) vit dans le moteur partagé :
 * le serveur ne transmet jamais une scène, seulement des graines, des index
 * et des dates.
 *
 * L'état et les manches sont dans `salon.ts`. Le fil est dans `messages/`.
 * Ce fichier ne fait qu'ouvrir le port, la sonde, et s'arrêter proprement.
 *
 * Lancement : npm run server   (PORT=8787 par défaut)
 *
 * Exploitation : sonde `GET /health` pour l'hébergeur, et `ALLOWED_ORIGINS`
 * (liste séparée par des virgules) pour la liste blanche des origines.
 */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { originAllowed, parseOrigins } from "./origin";
import { PHOTO_MAX } from "../shared/profil";
import { MAX_PLAYERS } from "../shared/protocol";
import { MULTI_RULES } from "./match";
import { windowMs } from "../src/engine/difficulty";
import { branche } from "./messages/index";
import {
  INSTANCE,
  STARTED_AT,
  clients,
  erreursRattrapees,
  rooms,
} from "./salon";

const PORT = Number(process.env.PORT) || 8787;
const ALLOWED_ORIGINS = parseOrigins(process.env.ALLOWED_ORIGINS);
const PRODUCTION = process.env.NODE_ENV === "production";

/* ------------------------------------------------------------------ *
 * Serveur HTTP porteur.
 *
 * On ne laisse pas `ws` ouvrir le port lui-même : un `WebSocketServer` créé
 * avec `port` répond 400 à toute requête non-upgrade. La sonde de l'hébergeur
 * échouerait donc en boucle, et la machine serait redémarrée sans fin sans
 * qu'on comprenne pourquoi — le multijoueur, lui, marcherait très bien.
 * ------------------------------------------------------------------ */
const httpServer = createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0];
  if (path !== "/health") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  let players = 0;
  for (const room of rooms.values()) players += room.clients.size;
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(
    JSON.stringify({
      ok: true,
      instance: INSTANCE,
      rooms: rooms.size,
      players,
      uptime: Math.round((Date.now() - STARTED_AT) / 1000),
      demarre: new Date(STARTED_AT).toISOString(),
      memoireMo: Math.round(process.memoryUsage().rss / 1048576),
      connexions: clients.size,
      image: process.env.FLY_IMAGE_REF ?? null,
      erreurs: erreursRattrapees,
    }),
  );
});

const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: ({ origin }: { origin: string }) =>
    originAllowed(origin, ALLOWED_ORIGINS, PRODUCTION),
  maxPayload: PHOTO_MAX + 1024,
  perMessageDeflate: { threshold: 256, serverNoContextTakeover: true, clientNoContextTakeover: true },
});

branche(wss);

/* Heartbeat : une connexion morte silencieusement ne doit pas geler un salon. */
const heartbeat = setInterval(() => {
  for (const c of clients) {
    if (!c.alive) {
      clients.delete(c);
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, 15_000);

let closing = false;
function shutdown(): void {
  if (closing) return;
  closing = true;
  clearInterval(heartbeat);
  for (const room of rooms.values()) {
    if (room.timer) clearTimeout(room.timer);
    for (const c of room.clients.values()) {
      if (c.graceTimer) clearTimeout(c.graceTimer);
    }
  }
  for (const ws of wss.clients) ws.close(1001, "shutdown");
  wss.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

httpServer.listen(PORT, () => {
  const origins =
    ALLOWED_ORIGINS.length > 0
      ? `origines autorisées : ${ALLOWED_ORIGINS.join(", ")}`
      : PRODUCTION
        ? "ATTENTION : ALLOWED_ORIGINS vide en production — toute connexion navigateur sera refusée"
        : "origines : toutes (hors production)";
  console.log(
    `THE ONE RULE — serveur de salons sur ws://localhost:${PORT} · sonde GET /health\n` +
      `${MULTI_RULES.length} règles en rotation · ${MAX_PLAYERS} joueurs max · fenêtre lvl0 ${windowMs(0)} ms\n` +
      origins,
  );
});
