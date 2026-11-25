/**
 * La boutique du COMPTE (`api/boutique.ts`), sur le dépôt en mémoire.
 *
 * Le dépôt en mémoire reproduit la loi des fonctions SQL (`boutique_achete`,
 * `boutique_importe`, `boutique_porte` — migration 0009) ; leur exécution sur
 * un vrai PostgreSQL est décrite dans docs/BASE-DE-DONNEES.md.
 *
 * Ce qui compte et que ce fichier exige :
 *   · rejouer la MÊME clé d'achat ne débite jamais deux fois (reprise réseau,
 *     double clic, file persistée) ;
 *   · un import d'appareil n'est crédité qu'UNE fois ;
 *   · on ne porte que ce qu'on possède ;
 *   · l'historique survit à la suppression du compte.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { traite } from "../api/boutique";
import { DepotMemoire, nouvelId, utilisateurNeuf } from "../api/_depot";
import { signeJeton } from "../server/jeton";

const ENV = {
  TOR_AUTH_SECRET: "secret-de-test-assez-long-pour-ne-pas-etre-ridicule",
  DATABASE_URL: "postgresql://test@127.0.0.1:1/aucune",
};
const K1 = "11111111-1111-4111-8111-111111111111";
const K2 = "22222222-2222-4222-8222-222222222222";

let depot: DepotMemoire;
let id: string;

beforeEach(async () => {
  depot = new DepotMemoire();
  id = nouvelId();
  await depot.cree(utilisateurNeuf(id, Date.now()), { fournisseur: "google", idExterne: "g1" });
});

const appel = (action: string | null, corps?: unknown, jeton: string | null = signeJeton({ sub: id, psd: "", gly: 0, vj: 0 }, ENV.TOR_AUTH_SECRET)) =>
  traite(
    new Request(`https://x/api/boutique${action ? `?a=${action}` : ""}`, {
      method: corps === undefined ? "GET" : "POST",
      headers: jeton ? { Authorization: `Bearer ${jeton}` } : {},
      body: corps === undefined ? undefined : JSON.stringify(corps),
    }),
    ENV,
    depot,
  );

describe("boutique du compte — accès", () => {
  it("sans comptes configurés, la route se dit indisponible (et le jeu tourne)", async () => {
    const res = await traite(new Request("https://x/api/boutique"), {}, undefined);
    expect(res.status).toBe(503);
  });

  it("sans jeton, rien", async () => {
    expect((await appel(null, undefined, null)).status).toBe(401);
  });

  it("un compte neuf possède le style offert, et zéro pièce", async () => {
    const res = await appel(null);
    expect(res.status).toBe(200);
    expect((await res.json()).boutique).toEqual({ pieces: 0, porte: null, possedes: ["sticker"] });
  });
});

describe("boutique du compte — achat", () => {
  it("trop pauvre : une ISSUE, pas une erreur, et rien n'est débité", async () => {
    const res = await appel("achete", { skin: "neon", cle: K1 });
    expect(res.status).toBe(200);
    expect((await res.json()).achat).toMatchObject({ issue: "pauvre", manque: 150, pieces: 0 });
  });

  it("achète, porte aussitôt, et la même clé rejouée ne redébite pas", async () => {
    await appel("importe", { appareil: "app-1", pieces: 200, possedes: [] });
    const a = (await (await appel("achete", { skin: "neon", cle: K1 })).json()).achat;
    expect(a).toMatchObject({ issue: "ok", pieces: 50, porte: "neon", possedes: ["sticker", "neon"] });
    const b = (await (await appel("achete", { skin: "neon", cle: K1 })).json()).achat;
    expect(b).toMatchObject({ issue: "ok", rejoue: true, pieces: 50 });
    expect(depot.achats).toHaveLength(1);
  });

  it("racheter un style possédé avec une AUTRE clé : 'deja'", async () => {
    await appel("importe", { appareil: "app-1", pieces: 500, possedes: [] });
    await appel("achete", { skin: "neon", cle: K1 });
    expect((await (await appel("achete", { skin: "neon", cle: K2 })).json()).achat.issue).toBe("deja");
    expect(depot.achats).toHaveLength(1);
  });

  it("un style inconnu : 404 ; une clé ou un code mal formés : 400", async () => {
    expect((await appel("achete", { skin: "dragon", cle: K1 })).status).toBe(404);
    expect((await appel("achete", { skin: "neon", cle: "pas-un-uuid" })).status).toBe(400);
    expect((await appel("achete", { skin: "NE ON", cle: K1 })).status).toBe(400);
  });
});

describe("boutique du compte — import et port", () => {
  it("un appareil n'est crédité qu'UNE fois, quoi qu'il renvoie ensuite", async () => {
    const a = (await (await appel("importe", { appareil: "app-1", pieces: 300, possedes: ["bonbon", "dragon"] })).json()).import;
    expect(a).toMatchObject({ issue: "ok", pieces: 300, possedes: ["sticker", "bonbon"] });
    const b = (await (await appel("importe", { appareil: "app-1", pieces: 300, possedes: [] })).json()).import;
    expect(b).toMatchObject({ issue: "deja", pieces: 300 });
    // Un SECOND appareil s'ajoute : c'est un autre portefeuille.
    const c = (await (await appel("importe", { appareil: "app-2", pieces: 100, possedes: [] })).json()).import;
    expect(c.pieces).toBe(400);
  });

  it("le montant importé est borné, et un appareil mal nommé refusé", async () => {
    const a = (await (await appel("importe", { appareil: "app-1", pieces: 1e12, possedes: [] })).json()).import;
    expect(a.pieces).toBe(1_000_000);
    expect((await appel("importe", { appareil: "../etc", pieces: 1, possedes: [] })).status).toBe(400);
  });

  it("on ne porte que ce qu'on possède", async () => {
    expect((await appel("porte", { skin: "craie" })).status).toBe(409);
    const res = await appel("porte", { skin: "sticker" });
    expect((await res.json()).boutique.porte).toBe("sticker");
  });
});

describe("boutique du compte — suppression", () => {
  it("le compte supprimé perd ses possessions, l'historique d'achats reste", async () => {
    await appel("importe", { appareil: "app-1", pieces: 200, possedes: [] });
    await appel("achete", { skin: "neon", cle: K1 });
    await depot.supprime(id);
    expect(await depot.boutique(id)).toBeNull();
    expect(depot.achats).toEqual([{ id, code: "neon", prix: 150, cle: K1 }]);
  });
});
