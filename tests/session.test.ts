/**
 * LA SESSION DU COMPTE — côté client.
 *
 * Rapporté par Pierre : « ça demande de se connecter alors que je suis déjà
 * connecté … les comptes restent affichés en haut mais ne sont pas réellement
 * connectés ». Deux défauts, et ce fichier tient les deux :
 *
 *   · un jeton PÉRIMÉ était jeté au chargement, alors qu'il pouvait encore
 *     s'échanger contre un neuf : revenir après une journée déconnectait en
 *     silence ;
 *   · `compte()` ne relisait l'expiration qu'au PREMIER appel : un onglet resté
 *     ouvert plus de 24 h se croyait connecté avec un jeton refusé partout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { compte, rafraichit, reinitialise, sessionRecuperable } from "../src/compte";
import { signeJeton } from "../server/jeton";
import { DUREE_JETON_MS, FENETRE_RENOUVELLEMENT_MS } from "../shared/jeton";

const SECRET = "secret-de-test-assez-long-pour-ne-pas-etre-ridicule";
const CLE = "oneRule.compte.v1";
const JOUR = 86_400_000;
const frappe = { sub: "u1", psd: "PIERRE", gly: 3, vj: 0 };

let stock: Record<string, string>;
beforeEach(() => {
  stock = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stock[k] ?? null,
    setItem: (k: string, v: string) => void (stock[k] = v),
    removeItem: (k: string) => void delete stock[k],
  });
  reinitialise();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("un jeton périmé mais renouvelable", () => {
  it("n'est plus jeté au chargement : il sert à se renouveler", () => {
    const maintenant = Date.now();
    stock[CLE] = signeJeton(frappe, SECRET, maintenant - DUREE_JETON_MS - 2 * JOUR);
    expect(compte(maintenant)).toBeNull(); // il n'ouvre rien d'autre
    expect(stock[CLE]).toBeDefined();
    expect(sessionRecuperable(maintenant)).toBe(true);
  });

  it("au-delà de la fenêtre, il est jeté : là, il faut se reconnecter", () => {
    const maintenant = Date.now();
    stock[CLE] = signeJeton(frappe, SECRET, maintenant - DUREE_JETON_MS - FENETRE_RENOUVELLEMENT_MS - JOUR);
    expect(compte(maintenant)).toBeNull();
    expect(stock[CLE]).toBeUndefined();
    expect(sessionRecuperable(maintenant)).toBe(false);
  });

  it("rafraichit l'échange contre un neuf, et le compte revient", async () => {
    const maintenant = Date.now();
    const vieux = signeJeton(frappe, SECRET, maintenant - DUREE_JETON_MS - 2 * JOUR);
    stock[CLE] = vieux;
    const neuf = signeJeton(frappe, SECRET, maintenant);
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${vieux}`);
      return Response.json({ jeton: neuf });
    });
    vi.stubGlobal("fetch", f);
    await rafraichit(maintenant);
    expect(f).toHaveBeenCalledTimes(1);
    expect(compte()?.pseudo).toBe("PIERRE");
    expect(stock[CLE]).toBe(neuf);
    expect(sessionRecuperable()).toBe(false);
  });

  it("un refus (révoqué, supprimé) déconnecte pour de bon", async () => {
    const maintenant = Date.now();
    stock[CLE] = signeJeton(frappe, SECRET, maintenant - DUREE_JETON_MS - 2 * JOUR);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "revoque" }, { status: 401 })));
    await rafraichit(maintenant);
    expect(stock[CLE]).toBeUndefined();
    expect(sessionRecuperable(maintenant)).toBe(false);
  });

  it("hors ligne, rien n'est perdu : on réessaiera", async () => {
    const maintenant = Date.now();
    stock[CLE] = signeJeton(frappe, SECRET, maintenant - DUREE_JETON_MS - 2 * JOUR);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("réseau"); }));
    await rafraichit(maintenant);
    expect(stock[CLE]).toBeDefined();
    expect(sessionRecuperable(maintenant)).toBe(true);
  });
});

describe("un onglet resté ouvert", () => {
  it("⚠️ compte() relit l'expiration : il ne se croit plus connecté avec un jeton mort", () => {
    const maintenant = Date.now();
    stock[CLE] = signeJeton(frappe, SECRET, maintenant);
    expect(compte(maintenant)?.pseudo).toBe("PIERRE");
    // Le même onglet, 25 heures plus tard, sans rechargement.
    expect(compte(maintenant + DUREE_JETON_MS + 3_600_000)).toBeNull();
    expect(sessionRecuperable(maintenant + DUREE_JETON_MS + 3_600_000)).toBe(true);
  });

  it("un jeton frais loin de sa fin ne coûte aucune requête", async () => {
    const maintenant = Date.now();
    stock[CLE] = signeJeton(frappe, SECRET, maintenant);
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await rafraichit(maintenant);
    expect(f).not.toHaveBeenCalled();
  });
});
