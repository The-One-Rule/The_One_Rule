/**
 * `DepotSupabase` — LE dépôt de production, jusqu'ici sans un seul test.
 *
 * Tous les autres tests passent par `DepotMemoire`, et l'audit d'architecture
 * a trouvé deux endroits où les deux implémentations divergeaient : les tests
 * passaient sur celle qui ne tourne pas. Ici, `fetch` est remplacé par un
 * enregistreur : on vérifie les requêtes PostgREST réellement émises.
 *
 * DENTS : retirer le `DELETE performance` de `supprime` fait tomber le
 * premier test.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DepotSupabase } from "../api/_depot";

interface Appel {
  methode: string;
  chemin: string;
  corps: string | null;
}

/** Remplace `fetch` ; `repond` choisit la réponse de chaque requête. */
function enregistre(repond: (a: Appel) => Response = () => new Response("[]", { status: 200 })): Appel[] {
  const appels: Appel[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const a: Appel = {
      methode: init.method ?? "GET",
      chemin: decodeURIComponent(String(url).replace("https://base.test/rest/v1/", "")),
      corps: typeof init.body === "string" ? init.body : null,
    };
    appels.push(a);
    return repond(a);
  });
  return appels;
}

afterEach(() => vi.unstubAllGlobals());

const depot = () => new DepotSupabase("https://base.test", "cle");

describe("DepotSupabase.posePerf", () => {
  const perf = {
    utilisateurId: "u1",
    mode: "daily",
    cle: "jour:280:v",
    versionContenu: "v",
    jour: 280,
    graine: 1,
    regle: "sang",
    valeur: 14,
    valeur2: 30_000,
    verdictBot: "humain",
    creeLe: 0,
  };

  it("⚠️ à score égal, une durée plus courte remplace — l'ordre de DepotMemoire", async () => {
    // L'insertion bute sur l'unicité (409), puis la mise à jour conditionnelle.
    const appels = enregistre((a) =>
      a.methode === "POST" ? new Response("", { status: 409 }) : new Response("[{}]", { status: 200 }),
    );
    expect(await depot().posePerf(perf)).toBe(true);
    const maj = appels.find((a) => a.methode === "PATCH")!;
    expect(maj.chemin).toContain("or=(valeur.lt.14,and(valeur.eq.14,valeur2.gt.30000))");
  });
});

describe("DepotSupabase.supprime", () => {
  it("⚠️ retire les performances : la cascade ne joue pas sur une suppression logique", async () => {
    const appels = enregistre();
    await depot().supprime("u1");
    const perfs = appels.find((a) => a.methode === "DELETE" && a.chemin.startsWith("performance?"));
    expect(perfs, "les scores d'un compte supprimé resteraient sur le podium").toBeDefined();
    expect(perfs!.chemin).toBe("performance?utilisateur_id=eq.u1");
  });

  it("échoue au lieu de se taire quand le code ami n'a pas pu être effacé", async () => {
    enregistre((a) =>
      a.methode === "PATCH" && a.corps?.includes("code_ami")
        ? new Response("", { status: 500 })
        : new Response("[]", { status: 200 }),
    );
    await expect(depot().supprime("u1")).rejects.toThrow(/code/);
  });
});
