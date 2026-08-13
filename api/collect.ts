/**
 * Collecteur d'événements — fonction serverless Vercel.
 *
 * Écrit une ligne NDJSON par événement dans les logs. C'est volontairement
 * rustique : à ce stade du projet, un log drain gratuit suffit largement et
 * ne coûte ni base de données ni maintenance. Quand le volume le justifiera,
 * remplacer `sink()` par une écriture Postgres ou KV — c'est la seule
 * fonction à changer.
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

const ALLOWED = new Set([
  "first_open",
  "day_return",
  "visit_end",
  "run_start",
  "run_end",
  "quest_complete",
  "share",
  "optout",
]);

/** Garde-fous : un endpoint public doit refuser tout ce qu'il n'attend pas. */
const MAX_BATCH = 50;
const MAX_BODY = 16_000;

function sink(line: string): void {
  console.log(line);
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
  for (const e of payload.batch.slice(0, MAX_BATCH)) {
    if (!e || typeof e.ev !== "string" || !ALLOWED.has(e.ev)) continue;
    const out: Record<string, unknown> = { id, day, ev: e.ev, at: received };
    for (const [k, v] of Object.entries(e)) {
      if (k === "ev" || k === "ts") continue;
      const c = clean(v);
      if (c !== undefined) out[k] = c;
    }
    sink(JSON.stringify(out));
  }

  // 204 : le client n'attend rien et ne doit rien avoir à traiter
  return new Response(null, { status: 204 });
}
