/**
 * PHASE 3, POINT 18 — DEUX REQUÊTES EN MÊME TEMPS.
 *
 * Une fonction edge n'a pas de verrou : deux requêtes d'un même joueur (deux
 * onglets, un double toucher, une reprise réseau) s'entrelacent à chaque
 * `await`. `Promise.all` reproduit exactement cet entrelacement sur le dépôt en
 * mémoire, sans minuterie et sans hasard — donc ces tests sont déterministes.
 *
 * Ce qu'ils tiennent, chacun prouvé en retirant son correctif :
 *   · deux demandes d'ami CROISÉES et simultanées valent accord (audit C4) ;
 *   · deux acceptations simultanées ne font jamais dépasser `MAX_AMIS` ;
 *   · deux fusions simultanées ne perdent rien (révision optimiste, n°13) ;
 *   · deux soumissions simultanées du run du jour gardent le meilleur.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { traite as amis } from "../api/amis";
import { traite as moi } from "../api/moi";
import { DepotMemoire, nouvelId, utilisateurNeuf } from "../api/_depot";
import type { Perf } from "../api/_depot";
import { signeJeton } from "../server/jeton";
import { MAX_AMIS } from "../shared/amis";
import { agregatsVides } from "../shared/compte";

const ENV = {
  TOR_AUTH_SECRET: "secret-de-test-assez-long-pour-ne-pas-etre-ridicule",
  SUPABASE_URL: "https://exemple.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "cle",
};
const MAINTENANT = Date.UTC(2026, 9, 7, 12);

/*
 * ⚠️ LE DÉPÔT EN MÉMOIRE RÉPOND SANS ATTENDRE, et c'est ce qui rendait le
 * premier jet de ces tests inutile : ils passaient AUSSI sur l'ancien code.
 * Sans vraie attente, la première requête finit presque avant que la seconde
 * ne commence — aucun entrelacement. Une vraie base répond en millisecondes.
 * `lent` fait attendre chaque appel d'un tour de boucle (`setTimeout 0`) : les
 * deux requêtes avancent alors pas à pas, côte à côte, comme en production.
 */
function lent<T extends object>(cible: T): T {
  return new Proxy(cible, {
    get(o, nom, recv) {
      const v = Reflect.get(o, nom, recv);
      if (typeof v !== "function") return v;
      return async (...args: unknown[]) => {
        await new Promise((r) => setTimeout(r, 0));
        return (v as (...a: unknown[]) => unknown).apply(o, args);
      };
    },
  });
}

let memoire: DepotMemoire;
let depot: DepotMemoire;
let hasard = 0;
const tirage = () => ((hasard = (hasard * 9301 + 0.49297) % 1), hasard);

beforeEach(() => {
  memoire = new DepotMemoire();
  depot = lent(memoire);
  hasard = 0.123;
});

async function compte(): Promise<string> {
  const id = nouvelId();
  await depot.cree(utilisateurNeuf(id, MAINTENANT), { fournisseur: "google", idExterne: id });
  return id;
}

const jeton = (id: string) => signeJeton({ sub: id, psd: "", gly: 0, vj: 0 }, ENV.TOR_AUTH_SECRET, MAINTENANT);

function appelAmis(id: string, action: string | null, code?: string): Promise<Response> {
  return amis(
    new Request(`https://x/api/amis${action ? `?a=${action}` : ""}`, {
      method: action ? "POST" : "GET",
      headers: { Authorization: `Bearer ${jeton(id)}` },
      body: action ? JSON.stringify({ code }) : undefined,
    }),
    ENV,
    depot,
    MAINTENANT,
    tirage,
  );
}

const codeDe = (id: string) => depot.codeAmi(id, tirage);

describe("les amis, sous accès concurrent", () => {
  it("⚠️ deux demandes CROISÉES et simultanées nouent l'amitié (audit C4)", async () => {
    const a = await compte();
    const b = await compte();
    const [ca, cb] = [await codeDe(a), await codeDe(b)];
    // Chacun voit « aucune demande reçue », et chacun en pose une.
    await Promise.all([appelAmis(a, "ajoute", cb), appelAmis(b, "ajoute", ca)]);
    expect((await depot.amisDe(a)).map((x) => x.id), "deux demandes croisées sont restées en attente").toEqual([b]);
    expect((await depot.amisDe(b)).map((x) => x.id)).toEqual([a]);
    expect(await depot.demandesVers(a)).toEqual([]);
    expect(await depot.demandesVers(b)).toEqual([]);
  });

  it("⚠️ deux acceptations simultanées ne dépassent jamais MAX_AMIS", async () => {
    const moiId = await compte();
    for (let i = 0; i < MAX_AMIS - 1; i++) await depot.lie(moiId, await compte());
    const x = await compte();
    const y = await compte();
    await depot.demande(x, moiId);
    await depot.demande(y, moiId);
    const [cx, cy] = [await codeDe(x), await codeDe(y)];
    await Promise.all([appelAmis(moiId, "accepte", cx), appelAmis(moiId, "accepte", cy)]);
    expect((await depot.amisDe(moiId)).length).toBeLessThanOrEqual(MAX_AMIS);
  });

  it("deux lectures simultanées ne posent qu'UN code ami", async () => {
    const a = await compte();
    const [r1, r2] = await Promise.all([appelAmis(a, null), appelAmis(a, null)]);
    const c1 = ((await r1.json()) as { code: string }).code;
    const c2 = ((await r2.json()) as { code: string }).code;
    expect(c1).toBe(c2);
  });
});

describe("la fusion des agrégats, sous accès concurrent", () => {
  it("deux appareils qui fusionnent en même temps : rien ne se perd (n°13)", async () => {
    const id = await compte();
    const appel = (carnet: Record<string, unknown>) =>
      moi(
        new Request("https://x/api/moi?a=fusion", {
          method: "POST",
          headers: { Authorization: `Bearer ${jeton(id)}` },
          body: JSON.stringify({ agregats: { ...agregatsVides(), carnet } }),
        }),
        ENV,
        depot,
        MAINTENANT,
      );
    await Promise.all([
      appel({ sang: { best: 14, cleared: false, pieges: 2 } }),
      appel({ pointe: { best: 9, cleared: true, pieges: 0 } }),
    ]);
    const u = await depot.parId(id);
    expect(Object.keys(u!.agregats.carnet).sort()).toEqual(["pointe", "sang"]);
    expect(u!.revision).toBe(2);
  });
});

describe("le run du jour, sous accès concurrent", () => {
  it("deux soumissions simultanées gardent la meilleure, quel que soit l'ordre", async () => {
    const id = await compte();
    const perf = (valeur: number, valeur2: number): Perf => ({
      utilisateurId: id, mode: "daily", cle: "k", versionContenu: "v", jour: 280, graine: 1,
      regle: "sang", valeur, valeur2, verdictBot: "humain", creeLe: MAINTENANT,
    });
    await Promise.all([depot.posePerf(perf(12, 9000)), depot.posePerf(perf(20, 9500)), depot.posePerf(perf(20, 8000))]);
    const [p] = await depot.mesPerfs(id, 5);
    expect([p!.valeur, p!.valeur2]).toEqual([20, 8000]);
  });
});
