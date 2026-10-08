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
  /** L'URL telle qu'émise, avant décodage : c'est là qu'on voit l'échappement. */
  brut: string;
  corps: string | null;
  entetes: Record<string, string>;
}

/** Remplace `fetch` ; `repond` choisit la réponse de chaque requête. */
function enregistre(repond: (a: Appel) => Response = () => new Response("[]", { status: 200 })): Appel[] {
  const appels: Appel[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const brut = String(url).replace("https://base.test/rest/v1/", "");
    const a: Appel = {
      methode: init.method ?? "GET",
      chemin: decodeURIComponent(brut),
      brut,
      corps: typeof init.body === "string" ? init.body : null,
      entetes: (init.headers ?? {}) as Record<string, string>,
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

/* ------------------------------------------------------------------ *
 * Phase 3, point 16 : les seize méthodes qui restaient sans test.
 * ------------------------------------------------------------------ */

/** Une ligne `utilisateur` telle que PostgREST la rend. */
const ligne = (o: Record<string, unknown> = {}) => ({
  id: "u1",
  pseudo: "LEA",
  apparence: { glyphe: 3 },
  agregats: {},
  revision: 2,
  version_jeton: 1,
  drapeaux: 0,
  cree_le: "2026-10-01T00:00:00Z",
  banni_le: null,
  supprime_le: null,
  ...o,
});
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });

describe("DepotSupabase — lectures d'utilisateur", () => {
  it("parId lit la ligne, et un compte supprimé vaut « inconnu »", async () => {
    enregistre(() => json([ligne()]));
    const u = await depot().parId("u1");
    expect(u?.pseudo).toBe("LEA");
    expect(u?.revision).toBe(2);
    expect(u?.versionJeton).toBe(1);
    enregistre(() => json([ligne({ supprime_le: "2026-10-02T00:00:00Z" })]));
    expect(await depot().parId("u1")).toBeNull();
  });

  it("⚠️ un identifiant porteur de syntaxe PostgREST est échappé, jamais interprété", async () => {
    const appels = enregistre(() => json([]));
    await depot().parId("u1&supprime_le=is.null");
    expect(appels[0]!.brut).toBe("utilisateur?id=eq.u1%26supprime_le%3Dis.null&limit=1");
  });

  it("parLien suit le lien, puis lit l'utilisateur", async () => {
    const appels = enregistre((a) =>
      a.chemin.startsWith("lien_plateforme") ? json([{ utilisateur_id: "u7" }]) : json([ligne({ id: "u7" })]),
    );
    const u = await depot().parLien({ fournisseur: "discord", idExterne: "123" });
    expect(u?.id).toBe("u7");
    expect(appels[0]!.chemin).toContain("fournisseur=eq.discord&id_externe=eq.123");
  });

  it("parCodeAmi cherche par le code", async () => {
    const appels = enregistre(() => json([ligne()]));
    await depot().parCodeAmi("BCDFGH");
    expect(appels[0]!.chemin).toBe("utilisateur?code_ami=eq.BCDFGH&limit=1");
  });
});

describe("DepotSupabase — écritures d'utilisateur", () => {
  it("majIdentite n'écrit que le pseudo et l'apparence", async () => {
    const appels = enregistre();
    await depot().majIdentite("u1", "LEA", { glyphe: 4 });
    expect(appels[0]!.methode).toBe("PATCH");
    expect(JSON.parse(appels[0]!.corps!)).toEqual({ pseudo: "LEA", apparence: { glyphe: 4 } });
  });

  it("revoque monte la version du jeton d'un cran", async () => {
    const appels = enregistre((a) => (a.methode === "GET" ? json([ligne({ version_jeton: 4 })]) : json([])));
    expect(await depot().revoque("u1")).toBe(5);
    expect(JSON.parse(appels.find((a) => a.methode === "PATCH")!.corps!)).toEqual({ version_jeton: 5 });
  });

  it("leveDrapeau compte un drapeau de plus", async () => {
    const appels = enregistre((a) => (a.methode === "GET" ? json([ligne({ drapeaux: 2 })]) : json([])));
    expect(await depot().leveDrapeau("u1")).toBe(3);
    expect(JSON.parse(appels.find((a) => a.methode === "PATCH")!.corps!)).toEqual({ drapeaux: 3 });
  });

  it("touche ne fait jamais échouer l'appelant (vu_le n'est qu'une trace)", async () => {
    enregistre(() => new Response("", { status: 500 }));
    await expect(depot().touche("u1")).resolves.toBeUndefined();
  });
});

describe("DepotSupabase — performances", () => {
  it("mesPerfs borne la limite et relit chaque champ", async () => {
    const appels = enregistre(() =>
      json([
        {
          utilisateur_id: "u1", mode: "daily", cle: "k", version_contenu: "v", jour: 280, graine: 9,
          regle: "sang", valeur: 14, valeur2: 30000, verdict_bot: null, cree_le: "2026-10-01T00:00:00Z",
        },
      ]),
    );
    const [p] = await depot().mesPerfs("u1", 9999);
    expect(appels[0]!.chemin).toContain("limit=200");
    expect(p).toMatchObject({ jour: 280, valeur: 14, valeur2: 30000, verdictBot: "humain" });
    await depot().mesPerfs("u1", -3);
    expect(appels[1]!.chemin).toContain("limit=1");
  });

  it("scoresDuJour ne sert que du vérifié et de l'humain", async () => {
    const appels = enregistre(() => json([{ valeur: 30 }, { valeur: 12 }]));
    expect(await depot().scoresDuJour("k")).toEqual([30, 12]);
    expect(appels[0]!.chemin).toContain("verifiee=is.true&verdict_bot=eq.humain");
  });

  it("rangDe COMPTE ceux qui font strictement mieux, avec le départage de l'index", async () => {
    const appels = enregistre(
      () => new Response(null, { status: 206, headers: { "content-range": "0-0/41" } }),
    );
    expect(await depot().rangDe("k", 14, 30000)).toBe(42);
    expect(appels[0]!.methode).toBe("HEAD");
    expect(appels[0]!.chemin).toContain("or=(valeur.gt.14,and(valeur.eq.14,valeur2.lt.30000))");
    enregistre(() => new Response(null, { status: 206, headers: { "content-range": "*/0" } }));
    expect(await depot().rangDe("k", 14, 30000)).toBe(1);
  });

  it("perfsDepuis sans identifiant n'interroge pas la base", async () => {
    const appels = enregistre();
    expect(await depot().perfsDepuis([], 270)).toEqual([]);
    expect(appels).toHaveLength(0);
  });

  it("⚠️ perfsDepuis cite chaque identifiant et retire les guillemets qu'il porterait", async () => {
    const appels = enregistre(() => json([]));
    await depot().perfsDepuis(["u1", 'u"2'], 270.9);
    expect(appels[0]!.chemin).toContain('utilisateur_id=in.("u1","u2")');
    expect(appels[0]!.chemin).toContain("jour=gte.270");
  });
});

describe("DepotSupabase — amis et demandes", () => {
  it("amisDe suit la clé étrangère nommée, et écarte un ami supprimé", async () => {
    const appels = enregistre(() =>
      json([
        { ami: { id: "a", pseudo: "SAM", apparence: {}, code_ami: "BCDFGH", supprime_le: null } },
        { ami: { id: "b", pseudo: "", apparence: {}, code_ami: null, supprime_le: "2026-10-01" } },
        { ami: null },
      ]),
    );
    const amis = await depot().amisDe("u1");
    expect(appels[0]!.chemin).toContain("utilisateur!amitie_ami_id_fkey");
    expect(amis.map((a) => a.id)).toEqual(["a"]);
  });

  it("delie défait les DEUX sens", async () => {
    const appels = enregistre();
    await depot().delie("a", "b");
    expect(appels[0]!.methode).toBe("DELETE");
    expect(appels[0]!.chemin).toContain(
      "or=(and(utilisateur_id.eq.a,ami_id.eq.b),and(utilisateur_id.eq.b,ami_id.eq.a))",
    );
  });

  it("une demande reçue suit l'expéditeur, une demande envoyée suit le destinataire", async () => {
    const appels = enregistre(() => json([]));
    await depot().demandesVers("u1");
    await depot().demandesDe("u1");
    expect(appels[0]!.chemin).toContain("a_id=eq.u1");
    expect(appels[0]!.chemin).toContain("demande_ami_de_id_fkey");
    expect(appels[1]!.chemin).toContain("de_id=eq.u1");
    expect(appels[1]!.chemin).toContain("demande_ami_a_id_fkey");
  });

  it("demande ignore un doublon, et ne se pose jamais vers soi", async () => {
    const appels = enregistre();
    await depot().demande("a", "a");
    expect(appels).toHaveLength(0);
    await depot().demande("a", "b");
    expect(appels[0]!.entetes.Prefer).toBe("resolution=ignore-duplicates");
    expect(JSON.parse(appels[0]!.corps!)).toEqual([{ de_id: "a", a_id: "b" }]);
  });

  it("retireDemande ne touche qu'un sens", async () => {
    const appels = enregistre();
    await depot().retireDemande("a", "b");
    expect(appels[0]!.chemin).toBe("demande_ami?de_id=eq.a&a_id=eq.b");
  });
});

describe("DepotSupabase — une base en panne ne se tait jamais", () => {
  /*
   * ⚠️ Chaque méthode (sauf `touche`, documentée) doit LEVER sur un statut
   * inattendu. Une écriture qui échoue en silence est exactement la famille
   * de l'audit : rien ne casse, la donnée manque.
   */
  const panne = () => enregistre((a) => (a.methode === "GET" ? json([ligne()]) : new Response("", { status: 500 })));
  const ecritures: Array<[string, () => Promise<unknown>]> = [
    ["majAgregats", () => depot().majAgregats("u1", 1, { carnet: {}, serie: { count: 0, lastDay: -99 }, records: {} })],
    ["majIdentite", () => depot().majIdentite("u1", "X", { glyphe: 0 })],
    ["revoque", () => depot().revoque("u1")],
    ["leveDrapeau", () => depot().leveDrapeau("u1")],
    ["lie", () => depot().lie("a", "b")],
    ["delie", () => depot().delie("a", "b")],
    ["demande", () => depot().demande("a", "b")],
    ["retireDemande", () => depot().retireDemande("a", "b")],
    ["supprime", () => depot().supprime("u1")],
  ];
  for (const [nom, appel] of ecritures) {
    it(`${nom} lève sur un 500`, async () => {
      panne();
      await expect(appel()).rejects.toThrow();
    });
  }

  const lectures: Array<[string, () => Promise<unknown>]> = [
    ["parId", () => depot().parId("u1")],
    ["mesPerfs", () => depot().mesPerfs("u1", 5)],
    ["classement", () => depot().classement("k", 3)],
    ["scoresDuJour", () => depot().scoresDuJour("k")],
    ["rangDe", () => depot().rangDe("k", 1, 1)],
    ["amisDe", () => depot().amisDe("u1")],
    ["demandesVers", () => depot().demandesVers("u1")],
    ["perfsDepuis", () => depot().perfsDepuis(["u1"], 1)],
  ];
  for (const [nom, appel] of lectures) {
    it(`${nom} lève sur un 500`, async () => {
      enregistre(() => new Response("", { status: 500 }));
      await expect(appel()).rejects.toThrow();
    });
  }
});
