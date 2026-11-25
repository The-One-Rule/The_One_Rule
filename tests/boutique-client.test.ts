/**
 * Le service CLIENT de la boutique du compte (`src/compte/boutique.ts`) et la
 * lecture de la collection (`collectionDuCompte`).
 *
 * Doctrine de `src/compte/` : rien ne lève, l'absence de compte n'appelle
 * personne, une panne rend `null`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectionDuCompte, reinitialise } from "../src/compte";
import {
  acheteSurLeCompte,
  boutiqueDuCompte,
  importeAppareil,
  nouvelleCleAchat,
  porteSurLeCompte,
} from "../src/compte/boutique";
import { signeJeton } from "../server/jeton";

const SECRET = "secret-de-test-assez-long-pour-ne-pas-etre-ridicule";
const CLE = "oneRule.compte.v1";
const U1 = "00000000-0000-4000-8000-000000000001";

let stock: Record<string, string>;
let appels: Array<{ url: string; methode: string; corps: unknown; auth: string | undefined }>;

function repond(f: (url: string) => Response): void {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    appels.push({
      url,
      methode: init.method ?? "GET",
      corps: init.body ? JSON.parse(String(init.body)) : undefined,
      auth: (init.headers as Record<string, string> | undefined)?.Authorization,
    });
    return f(url);
  }));
}

beforeEach(() => {
  stock = {};
  appels = [];
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stock[k] ?? null,
    setItem: (k: string, v: string) => void (stock[k] = v),
    removeItem: (k: string) => void delete stock[k],
  });
  reinitialise();
});
afterEach(() => vi.unstubAllGlobals());

const connecte = () => {
  stock[CLE] = signeJeton({ sub: U1, psd: "PIERRE", gly: 3, vj: 0 }, SECRET, Date.now());
  reinitialise();
};

describe("boutique du compte — client", () => {
  it("sans compte, AUCUN appel réseau, et null", async () => {
    repond(() => Response.json({}));
    expect(await boutiqueDuCompte()).toBeNull();
    expect(await acheteSurLeCompte("neon", nouvelleCleAchat())).toBeNull();
    expect(await collectionDuCompte()).toBeNull();
    expect(appels).toHaveLength(0);
  });

  it("lit l'état, et écarte ce qui n'est pas une forme valide", async () => {
    connecte();
    repond(() => Response.json({ boutique: { pieces: 50, porte: "craie", possedes: ["sticker", "<script>"] } }));
    expect(await boutiqueDuCompte()).toEqual({ pieces: 50, porte: null, possedes: ["sticker"] });
    expect(appels[0]!.auth).toMatch(/^Bearer /);
  });

  it("achète avec la clé fournie, et un refus est une ISSUE lisible", async () => {
    connecte();
    repond(() => Response.json({ achat: { issue: "pauvre", manque: 100, pieces: 50, porte: null, possedes: ["sticker"] } }));
    const cle = nouvelleCleAchat();
    const r = await acheteSurLeCompte("neon", cle);
    expect(r).toMatchObject({ issue: "pauvre", manque: 100 });
    expect(appels[0]).toMatchObject({ url: "/api/boutique?a=achete", methode: "POST", corps: { skin: "neon", cle } });
  });

  it("un code de style mal formé ne part pas", async () => {
    connecte();
    repond(() => Response.json({}));
    expect(await acheteSurLeCompte("../neon", nouvelleCleAchat())).toBeNull();
    expect(await porteSurLeCompte("NEON")).toBeNull();
    expect(appels).toHaveLength(0);
  });

  it("une panne ou un réseau coupé rendent null, sans lever", async () => {
    connecte();
    repond(() => new Response("", { status: 500 }));
    expect(await importeAppareil("app-1", 10, [])).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("réseau"); }));
    expect(await boutiqueDuCompte()).toBeNull();
  });

  it("importe le portefeuille de l'appareil et relit l'issue", async () => {
    connecte();
    repond(() => Response.json({ import: { issue: "deja", pieces: 300, porte: null, possedes: ["sticker"] } }));
    expect(await importeAppareil("app-1", 300, ["sticker"])).toEqual({ issue: "deja", pieces: 300, porte: null, possedes: ["sticker"] });
    expect(appels[0]!.corps).toEqual({ appareil: "app-1", pieces: 300, possedes: ["sticker"] });
  });

  it("la collection du compte passe par la route moi", async () => {
    connecte();
    const collection = { cartes: [], chapitres: [], meilleurs: [{ mode: "daily", valeur: 12, valeur2: 1 }], statistique: null };
    repond(() => Response.json({ collection }));
    expect(await collectionDuCompte()).toEqual(collection);
    expect(appels[0]!.url).toBe("/api/moi?a=collection");
  });
});
