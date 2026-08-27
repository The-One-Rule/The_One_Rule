import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { ALLOWED, dayKey } from "../api/collect";
import { EVENT_NAMES } from "../src/analytics";

/* ------------------------------------------------------------------ *
 * Le collecteur d'événements
 *
 * Ce qui est en jeu ici n'est pas la mesure elle-même, c'est qu'elle SURVIVE :
 * la version précédente écrivait dans des logs éphémères, ce qui rendait un D7
 * impossible à calculer sans qu'aucun test ne s'en plaigne.
 * ------------------------------------------------------------------ */

function post(body: unknown): Request {
  return new Request("https://exemple.test/api/collect", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const lot = (...evs: string[]) => ({
  id: "abc123",
  day: 3,
  batch: evs.map((ev) => ({ ev, ts: 1 })),
});

/** Branche un Upstash factice et rend la liste des appels réseau effectués. */
function upstash(status = 200) {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "jeton");
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response("[]", { status }));
  });
  return calls;
}

const bodyOf = (call: { init: RequestInit }) => JSON.parse(String(call.init.body));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("collecteur d'événements", () => {
  it("pousse tout le lot en un seul aller-retour", async () => {
    // Le quota gratuit se compte en commandes, pas en octets : un RPUSH par
    // événement épuiserait la réserve d'une soirée de test.
    const calls = upstash();
    const res = await handler(post(lot("first_open", "run_end")));

    expect(res.status).toBe(204);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://redis.test/pipeline");
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: "Bearer jeton" });

    const [push, expire] = bodyOf(calls[0]!);
    expect(push[0]).toBe("RPUSH");
    expect(push).toHaveLength(4); // commande, clé, deux lignes
    expect(expire[0]).toBe("EXPIRE");
    expect(expire[1]).toBe(push[1]); // l'expiration porte sur la clé qu'on vient d'écrire
  });

  it("écrit des lignes que le rapport sait relire", async () => {
    // scripts/report.mjs n'exige que trois champs : id, ev, day. S'ils
    // disparaissent, la mesure devient silencieusement inexploitable.
    const calls = upstash();
    await handler(post(lot("visit_end")));

    const line = JSON.parse(bodyOf(calls[0]!)[0][2]);
    expect(line).toMatchObject({ id: "abc123", day: 3, ev: "visit_end" });
    expect(typeof line.at).toBe("number");
  });

  it("découpe le stockage par jour de réception", () => {
    // Clé de rangement, sans rapport avec le `day` d'un événement, qui est
    // l'âge du joueur et sert aux cohortes.
    expect(dayKey(Date.UTC(2026, 7, 13, 22, 57))).toBe("ev:2026-08-13");
    expect(dayKey(Date.UTC(2026, 7, 14, 0, 1))).toBe("ev:2026-08-14");
  });

  it("n'écrit rien quand aucun événement n'est reconnu", async () => {
    const calls = upstash();
    const res = await handler(post(lot("steal_everything")));
    expect(res.status).toBe(204);
    expect(calls).toHaveLength(0);
  });

  it("accepte exactement les événements que le client sait émettre", async () => {
    // La liste blanche est volontairement recopiée ici plutôt qu'importée de
    // src/ : api/ est compilé pour le runtime edge et ne doit pas tirer le jeu
    // derrière lui. Le prix de cette duplication, c'est ce test.
    //
    // Ce qu'il protège est une panne muette : un nom ajouté à EventName mais
    // oublié dans ALLOWED part du navigateur, reçoit un 204, et n'arrive
    // jamais. Ça ne se voit qu'en cherchant les chiffres, une semaine trop tard.
    expect([...ALLOWED].sort()).toEqual([...EVENT_NAMES].sort());
  });

  it("laisse passer l'entonnoir social jusqu'au stockage", async () => {
    // Le bout en bout des quatre événements qui décident du prochain chantier.
    const calls = upstash();
    await handler(post(lot("duel_sent", "duel_opened", "invite_sent", "invite_opened")));

    const lignes = bodyOf(calls[0]!)[0]
      .slice(2)
      .map((l: string) => JSON.parse(l).ev);
    expect(lignes).toEqual(["duel_sent", "duel_opened", "invite_sent", "invite_opened"]);
  });

  it("répond 204 même quand le stockage tombe", async () => {
    // Perdre une mesure ne doit jamais remonter jusqu'au joueur, sinon le
    // client réessaie et double les événements.
    const calls = upstash(500);
    const res = await handler(post(lot("run_end")));
    expect(res.status).toBe(204);
    expect(calls).toHaveLength(1);
  });

  it("accepte les DEUX conventions de nommage Upstash", async () => {
    // Vercel n'injecte pas les mêmes noms selon le chemin d'installation :
    // l'intégration Marketplace « Upstash for Redis » pose KV_REST_API_*,
    // l'intégration Upstash directe pose UPSTASH_REDIS_REST_*. N'en lire
    // qu'un seul produit une panne muette — 204 rendu, rien stocké, D7
    // incalculable, et ça ne se voit qu'en cherchant les chiffres.
    vi.stubEnv("KV_REST_API_URL", "https://marketplace.test");
    vi.stubEnv("KV_REST_API_TOKEN", "jeton-kv");
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response("[]", { status: 200 }));
    });

    const res = await handler(post(lot("first_open")));
    expect(res.status).toBe(204);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://marketplace.test/pipeline");
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: "Bearer jeton-kv" });
  });

  it("retombe sur les logs quand Upstash n'est pas configuré", async () => {
    // Le cas du développement local : la collecte reste utilisable, sans mémoire.
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", () => Promise.reject(new Error("aucun réseau attendu")));

    const res = await handler(post(lot("first_open")));
    expect(res.status).toBe(204);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0]![0]))).toMatchObject({ ev: "first_open" });
  });

  it("refuse ce qu'un endpoint public ne doit pas accepter", async () => {
    expect((await handler(new Request("https://exemple.test/api/collect"))).status).toBe(405);
    const mauvais = new Request("https://exemple.test/api/collect", { method: "POST", body: "{" });
    expect((await handler(mauvais)).status).toBe(400);
    expect((await handler(post({ id: 7, day: 1, batch: [] }))).status).toBe(400);
  });
});
