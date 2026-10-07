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
import { codeAmiValide } from "../shared/amis";

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

/* ------------------------------------------------------------------ *
 * Le contrat PostgREST des autres méthodes (audit T1).
 *
 * Ce que ces tests figent, c'est la REQUÊTE : un filtre oublié ici — le
 * `verdict_bot` du classement, la révision de la fusion — ne casse rien de
 * visible et ne se voit qu'en production.
 * ------------------------------------------------------------------ */

describe("DepotSupabase — classement", () => {
  it("ne sert que du vérifié et de l'humain, dans l'ordre de l'index", async () => {
    const appels = enregistre(() =>
      new Response(
        JSON.stringify([
          { valeur: 30, valeur2: 9000, utilisateur_id: "u1", utilisateur: { pseudo: "LEA", apparence: { glyphe: 7 } } },
          { valeur: 30, valeur2: 9500, utilisateur_id: "u2", utilisateur: { pseudo: "SAM", apparence: {} } },
        ]),
        { status: 200 },
      ),
    );
    const top = await depot().classement("jour:280:v", 3, "u2");
    const q = appels[0]!.chemin;
    expect(q).toContain("cle=eq.jour:280:v");
    expect(q).toContain("verifiee=is.true");
    expect(q).toContain("verdict_bot=eq.humain");
    expect(q).toContain("order=valeur.desc,valeur2.asc");
    expect(top.map((e) => [e.rang, e.pseudo, e.glyphe, e.moi])).toEqual([
      [1, "LEA", 7, false],
      [2, "SAM", 0, true],
    ]);
  });
});

describe("DepotSupabase — fusion des agrégats", () => {
  it("écrit SOUS CONDITION de révision, et dit quand un autre a écrit avant", async () => {
    let lignes = "[{}]";
    const appels = enregistre(() => new Response(lignes, { status: 200 }));
    expect(await depot().majAgregats("u1", 4, { carnet: {}, serie: { count: 0, lastDay: -99 }, records: {} })).toBe(true);
    expect(appels[0]!.methode).toBe("PATCH");
    expect(appels[0]!.chemin).toBe("utilisateur?id=eq.u1&revision=eq.4");
    expect(JSON.parse(appels[0]!.corps!).revision).toBe(5);
    lignes = "[]"; // la révision a bougé entre-temps : aucune ligne touchée
    expect(await depot().majAgregats("u1", 4, { carnet: {}, serie: { count: 0, lastDay: -99 }, records: {} })).toBe(false);
  });
});

describe("DepotSupabase — code ami", () => {
  it("rend le code déjà posé sans en écrire un autre", async () => {
    const appels = enregistre(() => new Response(JSON.stringify([{ code_ami: "BCDFGH" }]), { status: 200 }));
    expect(await depot().codeAmi("u1", () => 0.5)).toBe("BCDFGH");
    expect(appels.filter((a) => a.methode === "PATCH")).toHaveLength(0);
  });

  it("une collision sur l'index unique (409) fait tirer un autre code", async () => {
    let patchs = 0;
    enregistre((a) => {
      if (a.methode === "GET") return new Response(JSON.stringify([{ code_ami: null }]), { status: 200 });
      patchs++;
      return patchs === 1 ? new Response("", { status: 409 }) : new Response("[{}]", { status: 200 });
    });
    let n = 0;
    const code = await depot().codeAmi("u1", () => ((n++ * 0.37) % 1));
    expect(patchs).toBe(2);
    expect(codeAmiValide(code), `code mal formé : ${code}`).toBe(code);
  });
});

describe("DepotSupabase — amitiés et comptes", () => {
  it("lie dans les DEUX sens, en une seule requête", async () => {
    const appels = enregistre();
    await depot().lie("a", "b");
    const p = appels[0]!;
    expect(p.methode).toBe("POST");
    expect(JSON.parse(p.corps!)).toEqual([
      { utilisateur_id: "a", ami_id: "b" },
      { utilisateur_id: "b", ami_id: "a" },
    ]);
  });

  it("un lien de plateforme refusé fait échouer la création — pas de session sans lien", async () => {
    enregistre((a) =>
      a.chemin.startsWith("lien_plateforme")
        ? new Response("", { status: 409 })
        : new Response("[]", { status: 201 }),
    );
    const neuf = {
      id: "u9", pseudo: "", apparence: {}, agregats: { carnet: {}, serie: { count: 0, lastDay: -99 }, records: {} },
      revision: 0, versionJeton: 0, drapeaux: 0, creeLe: 0, banniLe: null, supprimeLe: null,
    };
    await expect(depot().cree(neuf as never, { fournisseur: "google", idExterne: "x" })).rejects.toThrow(/lien/);
  });
});
