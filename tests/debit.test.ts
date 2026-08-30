/**
 * La limitation de débit.
 *
 * ⚠️ L'assertion la plus importante de ce fichier est celle qui vérifie que
 * SANS UPSTASH, TOUT PASSE. Une limitation qui bloquerait par défaut ferait
 * échouer la revendication en développement local et sur tout déploiement
 * sans mesure — c'est-à-dire qu'elle casserait le chantier là où personne ne
 * penserait à regarder.
 *
 * Le sujet est le COMPTE et jamais une IP : `api/collect.ts` ne journalise ni
 * IP, ni user-agent, ni en-tête d'identification, et ce chantier n'est pas
 * l'occasion de commencer. Toutes les routes limitées exigent déjà un jeton,
 * donc le compte est un sujet à la fois plus précis et moins intrusif.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { QUOTAS, consomme } from "../api/_debit";

const AVEC = {
  UPSTASH_REDIS_REST_URL: "https://exemple.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "jeton",
};

afterEach(() => vi.unstubAllGlobals());

/** Simule Upstash : un compteur par clé, comme le ferait INCR. */
function upstash(): { appels: number; cles: Map<string, number> } {
  const etat = { appels: 0, cles: new Map<string, number>() };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      etat.appels++;
      const cmds = JSON.parse(String(init.body)) as string[][];
      const cle = cmds[0]![1]!;
      const n = (etat.cles.get(cle) ?? 0) + 1;
      etat.cles.set(cle, n);
      return Response.json([{ result: n }, { result: 1 }]);
    }),
  );
  return etat;
}

describe("sans Upstash", () => {
  it("tout passe, et rien n'est appelé", async () => {
    const appels = vi.fn();
    vi.stubGlobal("fetch", appels);
    for (let i = 0; i < 200; i++) {
      expect((await consomme({}, "fusion", "u1")).ok).toBe(true);
    }
    expect(appels).not.toHaveBeenCalled();
  });

  it("une configuration à moitié posée ne limite pas non plus", async () => {
    expect((await consomme({ UPSTASH_REDIS_REST_URL: "x" }, "fusion", "u1")).ok).toBe(true);
  });

  it("`reste` vaut -1 quand la limitation est inactive — c'est diagnosticable", async () => {
    expect((await consomme({}, "fusion", "u1")).reste).toBe(-1);
  });
});

describe("avec Upstash", () => {
  it("laisse passer jusqu'au quota, refuse au-delà", async () => {
    upstash();
    const max = QUOTAS.identite!.max;
    for (let i = 0; i < max; i++) {
      expect((await consomme(AVEC, "identite", "u1")).ok, `appel ${i + 1}`).toBe(true);
    }
    expect((await consomme(AVEC, "identite", "u1")).ok).toBe(false);
  });

  it("compte séparément par sujet — un joueur n'en bloque pas un autre", async () => {
    upstash();
    const max = QUOTAS.identite!.max;
    for (let i = 0; i < max + 3; i++) await consomme(AVEC, "identite", "bruyant");
    expect((await consomme(AVEC, "identite", "tranquille")).ok).toBe(true);
  });

  it("compte séparément par action", async () => {
    upstash();
    for (let i = 0; i < QUOTAS.identite!.max + 3; i++) await consomme(AVEC, "identite", "u1");
    expect((await consomme(AVEC, "fusion", "u1")).ok).toBe(true);
  });

  it("une action sans quota n'est pas limitée", async () => {
    const etat = upstash();
    expect((await consomme(AVEC, "action-inconnue", "u1")).ok).toBe(true);
    expect(etat.appels).toBe(0);
  });

  it("une panne d'Upstash laisse passer", async () => {
    // Perdre une protection contre l'abus est préférable à refuser une
    // revendication légitime : c'est la même hiérarchie que partout ailleurs
    // dans ce chantier.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("non", { status: 500 })));
    expect((await consomme(AVEC, "fusion", "u1")).ok).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("réseau"); }));
    expect((await consomme(AVEC, "fusion", "u1")).ok).toBe(true);
  });

  it("un seul aller-retour par appel — le quota gratuit se compte en commandes", async () => {
    const etat = upstash();
    await consomme(AVEC, "fusion", "u1");
    expect(etat.appels).toBe(1);
  });

  it("accepte les deux jeux de noms d'Upstash", async () => {
    // Vercel n'injecte pas les mêmes selon le chemin d'installation, et n'en
    // lire qu'un a déjà produit une panne muette dans ce dépôt.
    const etat = upstash();
    await consomme({ KV_REST_API_URL: "https://x.io", KV_REST_API_TOKEN: "t" }, "fusion", "u1");
    expect(etat.appels).toBe(1);
  });
});
