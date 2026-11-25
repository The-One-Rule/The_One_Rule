/**
 * PHASE 3, POINT 17 — LES ENTRÉES MALFORMÉES.
 *
 * Toute route publique reçoit ce qu'un client modifié veut bien envoyer. La
 * règle tenue ici est simple et sans exception : **un corps malformé rend un
 * refus (4xx) ou un « rien à faire », jamais une erreur 500, jamais une
 * exception.** Une 500 sur une entrée hostile est une porte : elle dit où le
 * code ne vérifie pas.
 *
 * L'audit l'a payé : `verifyRun` levait sur `[null]` (S2), la collecte se
 * laissait réécrire ses propres champs (S5). Ce corpus rejoue la même
 * famille sur CHAQUE fonction edge, avec le vrai dépôt en mémoire derrière.
 *
 * Le serveur de salons a son propre corpus dans l'e2e, où il tourne
 * réellement (scénario « messages malformés »).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { traite as perf } from "../api/perf";
import { traite as moi } from "../api/moi";
import { traite as amis } from "../api/amis";
import { traite as auth } from "../api/auth";
import collect from "../api/collect";
import { DepotMemoire, nouvelId, utilisateurNeuf } from "../api/_depot";
import { signeJeton } from "../server/jeton";

const ENV = {
  TOR_AUTH_SECRET: "secret-de-test-assez-long-pour-ne-pas-etre-ridicule",
  TOR_APP_URL: "https://www.theonerule.party",
  DATABASE_URL: "postgresql://test@127.0.0.1:1/aucune",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
};

/*
 * Le corpus. Chaque entrée est un CORPS BRUT : une chaîne, parce qu'un
 * client hostile n'envoie pas forcément du JSON.
 */
const profond = (n: number): string => "[".repeat(n) + "]".repeat(n);
const CORPS: Array<[string, string]> = [
  ["vide", ""],
  ["JSON coupé", "{"],
  ["null", "null"],
  ["tableau", "[]"],
  ["nombre", "42"],
  ["chaîne", '"x"'],
  ["prototype", '{"__proto__":{"admin":true},"constructor":{"prototype":{"x":1}}}'],
  ["imbrication", profond(500)],
  ["types inversés", '{"jour":"aujourd\'hui","inputs":"tous","mode":["daily"],"code":12,"agregats":"x","pseudo":{}}'],
  ["inputs piégés", '{"mode":"daily","jour":0,"inputs":[null,{"t":"0","k":"c","i":"__proto__"},{"t":1e308,"k":"r","key":{}}]}'],
  ["agrégats piégés", '{"agregats":{"carnet":{"__proto__":{"best":1e999}},"records":[1,2],"serie":"x","jour":{"score":-5}}}'],
  ["pseudo hostile", '{"pseudo":"\\u202eNIMDA\\u0000<script>","glyphe":-1,"carte":"../../etc"}'],
  ["énorme", JSON.stringify({ inputs: Array.from({ length: 50_000 }, (_, t) => ({ t, k: "c", i: 0 })) })],
];

let depot: DepotMemoire;
let id: string;
const MAINTENANT = Date.UTC(2026, 9, 7, 12);

beforeEach(async () => {
  depot = new DepotMemoire();
  id = nouvelId();
  await depot.cree(utilisateurNeuf(id, MAINTENANT), { fournisseur: "google", idExterne: "g1" });
});

const jeton = (): string => signeJeton({ sub: id, psd: "", gly: 0, vj: 0 }, ENV.TOR_AUTH_SECRET, MAINTENANT);

const requete = (chemin: string, corps: string, methode = "POST"): Request =>
  new Request(`https://www.theonerule.party${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton()}` },
    body: methode === "GET" ? undefined : corps,
  });

/** La règle : jamais d'exception, jamais de 5xx. */
async function tenir(nom: string, appel: () => Promise<Response>): Promise<void> {
  let res: Response;
  try {
    res = await appel();
  } catch (e) {
    throw new Error(`${nom} a LEVÉ : ${(e as Error).message}`, { cause: e });
  }
  expect(res.status, `${nom} → ${res.status}`).toBeLessThan(500);
}

describe("aucune fonction edge ne lève sur un corps malformé", () => {
  for (const [nom, corps] of CORPS) {
    it(`perf — ${nom}`, async () => {
      await tenir("perf", () => perf(requete("/api/perf", corps), ENV, depot, MAINTENANT));
    });

    it(`moi — ${nom}`, async () => {
      for (const a of ["fusion", "identite", "inconnue"]) {
        await tenir(`moi?a=${a}`, () => moi(requete(`/api/moi?a=${a}`, corps), ENV, depot, MAINTENANT));
      }
      // Et le compte reste lisible après coup : rien d'hostile n'a été écrit.
      const res = await moi(requete("/api/moi", "", "GET"), ENV, depot, MAINTENANT);
      expect(res.status).toBe(200);
      const vue = (await res.json()) as { moi: { agregats: { carnet: object; records: object } } };
      expect(Object.getPrototypeOf(vue.moi.agregats.carnet)).toBe(Object.prototype);
      expect(Array.isArray(vue.moi.agregats.records)).toBe(false);
    });

    it(`amis — ${nom}`, async () => {
      for (const a of ["ajoute", "accepte", "refuse", "annule", "retire"]) {
        await tenir(`amis?a=${a}`, () => amis(requete(`/api/amis?a=${a}`, corps), ENV, depot, MAINTENANT, () => 0.3));
      }
    });

    it(`collect — ${nom}`, async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      await tenir("collect", () => collect(new Request("https://x/api/collect", { method: "POST", body: corps })));
      vi.restoreAllMocks();
    });
  }
});

describe("l'authentification refuse sans lever", () => {
  const etats = ["", ".", "a.b.c", "%%%", "eyJ9.eyJ9", "x".repeat(5000)];
  for (const etat of etats) {
    it(`retour OAuth avec un état « ${etat.slice(0, 12)} »`, async () => {
      const res = await auth(
        new Request(`https://www.theonerule.party/api/auth?a=callback&code=c&state=${encodeURIComponent(etat)}`),
        ENV,
        depot,
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("#compte=etat_invalide");
    });
  }

  for (const entete of ["", "Bearer", "Bearer ", "Bearer a.b", "Basic xyz", `Bearer ${"a".repeat(10_000)}`]) {
    it(`rafraîchissement avec « ${entete.slice(0, 14)} »`, async () => {
      const res = await auth(
        new Request("https://www.theonerule.party/api/auth?a=refresh", { method: "POST", headers: { Authorization: entete } }),
        ENV,
        depot,
      );
      expect(res.status).toBe(401);
    });
  }
});

describe("les paramètres d'URL hostiles", () => {
  for (const jour of ["abc", "1e9", "-1", "NaN", "0x10", "1.5", "99999999999999999999"]) {
    it(`classement du jour « ${jour} »`, async () => {
      await tenir("perf top", () =>
        perf(new Request(`https://x/api/perf?a=top&jour=${jour}&n=${jour}`), ENV, depot, MAINTENANT),
      );
      await tenir("perf repartition", () =>
        perf(new Request(`https://x/api/perf?a=repartition&jour=${jour}`), ENV, depot, MAINTENANT),
      );
    });
  }
});
