/**
 * Collecteur d'événements — fonction serverless Vercel.
 *
 * Une ligne NDJSON par événement, poussée dans une liste Redis (Upstash, API
 * REST : le runtime edge ne peut pas ouvrir de connexion TCP). Le format de
 * ligne est exactement celui que `scripts/report.mjs` sait lire — c'est la
 * raison de ne pas stocker de structure plus savante.
 *
 * Les premières versions se contentaient de `console.log`, et c'était un piège :
 * les logs d'exécution sont éphémères, donc un D7 était impossible à calculer.
 * Sans Upstash configuré, on retombe sur ce comportement — utilisable en local,
 * mais sans mémoire.
 *
 * Ne journalise jamais d'IP, d'en-tête d'identification ni de user-agent.
 */

interface TrackedEvent {
  ev: string;
  ts: number;
  [k: string]: unknown;
}

interface Payload {
  id: string;
  day: number;
  batch: TrackedEvent[];
}

/**
 * Doit rester synchronisé avec `EventName` dans `src/analytics/index.ts`. Un
 * nom absent d'ici est rejeté **silencieusement** (voir la boucle de `handler`) :
 * l'événement part du navigateur, la réponse est 204, et il n'arrive jamais.
 * C'est la panne la plus coûteuse de cette chaîne, parce qu'elle ne se voit
 * qu'au moment où l'on cherche les chiffres, une semaine trop tard.
 */
export const ALLOWED = new Set([
  "first_open",
  "day_return",
  "visit_end",
  "run_start",
  "run_end",
  "quest_complete",
  "share",
  "duel_sent",
  "duel_opened",
  "invite_sent",
  "invite_opened",
  "optout",
]);

/** Garde-fous : un endpoint public doit refuser tout ce qu'il n'attend pas. */
const MAX_BATCH = 50;
const MAX_BODY = 16_000;

/* ------------------------------------------------------------------ *
 * Stockage
 * ------------------------------------------------------------------ */

/** 40 jours : de quoi calculer un D7 avec de la marge, et rien de plus. */
const TTL_S = 40 * 24 * 60 * 60;

/**
 * Clé du jour de RÉCEPTION. À ne pas confondre avec le champ `day` d'un
 * événement, qui est l'âge du joueur en jours : celui-là sert au calcul des
 * cohortes, celle-ci ne sert qu'à découper le stockage et à le faire expirer.
 */
export const dayKey = (at: number): string => `ev:${new Date(at).toISOString().slice(0, 10)}`;

/**
 * Un seul aller-retour par requête, quel que soit le nombre d'événements :
 * `RPUSH` accepte toutes les lignes d'un coup, et le pipeline y ajoute
 * l'expiration. Le quota gratuit se compte en commandes.
 */
export async function sink(lines: string[], at: number): Promise<void> {
  if (!lines.length) return;
  // Lus à chaque appel plutôt que figés à l'import : c'est ce qui rend la
  // fonction testable sans réinitialiser le module.
  //
  // DEUX jeux de noms, parce que Vercel n'injecte pas les mêmes selon le
  // chemin d'installation : l'intégration Marketplace « Upstash for Redis »
  // pose KV_REST_API_URL / KV_REST_API_TOKEN, l'intégration Upstash directe
  // pose UPSTASH_REDIS_REST_*. Même API REST derrière, seuls les noms changent.
  //
  // N'en lire qu'un seul était une panne muette de plus : sans correspondance,
  // on retombe sur console.log, la fonction répond 204, et il n'y a jamais de
  // D7 — ce qui ne se découvre qu'une semaine trop tard.
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    for (const line of lines) console.log(line);
    return;
  }
  const key = dayKey(at);
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["RPUSH", key, ...lines],
        ["EXPIRE", key, String(TTL_S)],
      ]),
      // Le joueur n'attend pas cette réponse, mais l'instance, elle, la paie :
      // une panne d'Upstash ne doit pas tenir la fonction ouverte.
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
  } catch (err) {
    // Perdre une mesure ne doit jamais casser une partie. On tombe dans les
    // logs — au moins la soirée en cours reste lisible — et on répond 204.
    console.log(`collect_sink_error ${String(err)}`);
    for (const line of lines) console.log(line);
  }
}

function clean(v: unknown): unknown {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.slice(0, 40);
  return undefined;
}

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response("too large", { status: 413 });

  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const id = typeof payload.id === "string" ? payload.id.slice(0, 16) : null;
  const day = Number.isInteger(payload.day) ? payload.day : null;
  if (!id || day === null || !Array.isArray(payload.batch)) {
    return new Response("bad payload", { status: 400 });
  }

  const received = Date.now();
  const lines: string[] = [];
  for (const e of payload.batch.slice(0, MAX_BATCH)) {
    if (!e || typeof e.ev !== "string" || !ALLOWED.has(e.ev)) continue;
    const out: Record<string, unknown> = { id, day, ev: e.ev, at: received };
    for (const [k, v] of Object.entries(e)) {
      if (k === "ev" || k === "ts") continue;
      const c = clean(v);
      if (c !== undefined) out[k] = c;
    }
    lines.push(JSON.stringify(out));
  }
  await sink(lines, received);

  // 204 : le client n'attend rien et ne doit rien avoir à traiter
  return new Response(null, { status: 204 });
}
