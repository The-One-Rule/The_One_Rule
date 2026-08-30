/**
 * La route de connexion.
 *
 * Ce qui est réellement en jeu ici n'est pas « est-ce que OAuth marche » —
 * c'est que TOUTES les sorties de secours mènent au même endroit : le joueur
 * joue. Un déploiement sans secret, un fournisseur qui répond mal, un refus
 * de l'utilisateur, un état rejoué : aucun de ces cas ne doit produire une
 * page d'erreur, un blocage, ou pire, un compte à moitié créé.
 *
 * On exerce la VRAIE route (`traite`), avec un dépôt en mémoire et un `fetch`
 * simulé. `api/collect.ts` a montré le coût de tester une imitation : le
 * maillon non exercé de la chaîne ne se voit qu'au moment où l'on cherche les
 * chiffres, une semaine trop tard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { traite } from "../api/auth";
import { DepotMemoire } from "../api/_depot";
import { verifieJeton } from "../server/jeton";
import { decoupe } from "../shared/jeton";

const ENV = {
  TOR_AUTH_SECRET: "secret-de-test-assez-long-pour-ne-pas-etre-ridicule",
  TOR_APP_URL: "https://www.theonerule.party",
  SUPABASE_URL: "https://exemple.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "cle-de-service",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  DISCORD_CLIENT_ID: "discord-id",
  DISCORD_CLIENT_SECRET: "discord-secret",
};

let depot: DepotMemoire;

const req = (chemin: string, init: RequestInit = {}): Request =>
  new Request(`https://www.theonerule.party/api/auth${chemin}`, init);

const appel = (chemin: string, init: RequestInit = {}, env = ENV): Promise<Response> =>
  traite(req(chemin, init), env, depot);

/** Un `id_token` Google : seule sa charge est lue, jamais sa signature. */
const idToken = (sub: string): string => {
  const b64 = (s: string): string =>
    btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64('{"alg":"RS256"}')}.${b64(JSON.stringify({ sub }))}.signature`;
};

/** Récupère l'état signé que `start` a mis dans l'URL du fournisseur. */
async function etatDeStart(f = "google"): Promise<string> {
  const res = await appel(`?a=start&f=${f}`);
  const url = new URL(res.headers.get("location")!);
  return url.searchParams.get("state")!;
}

const fragment = (res: Response): string =>
  new URL(res.headers.get("location")!).hash.replace("#compte=", "");

beforeEach(() => {
  depot = new DepotMemoire();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ *
 * Sans configuration — le cas le plus important
 * ------------------------------------------------------------------ */

describe("déploiement sans comptes", () => {
  it("annonce simplement qu'il n'y en a pas", async () => {
    const res = await traite(req("?a=fournisseurs"), {}, undefined);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ disponible: false });
  });

  it("un retour de connexion ramène au jeu, jamais sur une erreur", async () => {
    // Un joueur qui atterrit là ne doit pas voir une page morte : il doit se
    // retrouver dans le jeu, anonyme, et pouvoir jouer.
    const res = await traite(req("?a=callback&code=x&state=y"), {}, undefined);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/#compte=indisponible");
  });

  it("un secret manquant suffit à tout désactiver", async () => {
    const res = await appel("?a=fournisseurs", {}, { ...ENV, TOR_AUTH_SECRET: "" });
    expect(res.status).toBe(503);
  });

  it("aucun fournisseur configuré désactive tout, même avec un secret", async () => {
    const res = await appel(
      "?a=fournisseurs",
      {},
      { ...ENV, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", DISCORD_CLIENT_ID: "", DISCORD_CLIENT_SECRET: "" },
    );
    expect(res.status).toBe(503);
  });
});

/* ------------------------------------------------------------------ *
 * Départ
 * ------------------------------------------------------------------ */

describe("départ vers le fournisseur", () => {
  it("liste les fournisseurs réellement branchés", async () => {
    const res = await appel("?a=fournisseurs");
    expect(await res.json()).toEqual({ disponible: true, fournisseurs: ["discord", "google"] });
  });

  it("ne liste pas un fournisseur à moitié configuré", async () => {
    const res = await appel("?a=fournisseurs", {}, { ...ENV, DISCORD_CLIENT_SECRET: "" });
    expect((await res.json()).fournisseurs).toEqual(["google"]);
  });

  it("redirige avec les bons paramètres", async () => {
    const res = await appel("?a=start&f=google");
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location")!);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("google-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://www.theonerule.party/api/auth?a=callback",
    );
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("ne demande à Discord que « identify »", async () => {
    // Une portée qu'on ne sait pas justifier est une portée qui fait hésiter
    // à cliquer — et l'e-mail n'est stocké nulle part, donc le demander
    // serait doublement gratuit.
    const res = await appel("?a=start&f=discord");
    expect(new URL(res.headers.get("location")!).searchParams.get("scope")).toBe("identify");
  });

  it("refuse un fournisseur inconnu", async () => {
    expect((await appel("?a=start&f=facebook")).status).toBe(404);
  });
});

/* ------------------------------------------------------------------ *
 * Retour
 * ------------------------------------------------------------------ */

describe("retour du fournisseur", () => {
  const googleRepond = (sub: string): void => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ access_token: "at", id_token: idToken(sub) }),
      ),
    );
  };

  it("crée un compte et rend un jeton lisible par les salons", async () => {
    googleRepond("google-utilisateur-1");
    const res = await appel(`?a=callback&code=abc&state=${encodeURIComponent(await etatDeStart())}`);
    expect(res.status).toBe(302);

    const jeton = decodeURIComponent(fragment(res));
    // Vérifié avec la primitive de l'AUTRE back-end : c'est ce jeton-là que
    // le serveur de salons devra accepter.
    const r = verifieJeton(jeton, ENV.TOR_AUTH_SECRET);
    expect(r).not.toBeNull();
    expect(r!.sub).toMatch(/^u_[0-9a-f]{32}$/);
    expect(r!.psd).toBe("");
    expect(r!.vj).toBe(0);
  });

  it("un second passage du même compte ne crée PAS un doublon", async () => {
    googleRepond("google-utilisateur-1");
    const un = await appel(`?a=callback&code=a&state=${encodeURIComponent(await etatDeStart())}`);
    const deux = await appel(`?a=callback&code=b&state=${encodeURIComponent(await etatDeStart())}`);
    const idUn = decoupe(decodeURIComponent(fragment(un)))!.revendications.sub;
    const idDeux = decoupe(decodeURIComponent(fragment(deux)))!.revendications.sub;
    expect(idDeux).toBe(idUn);
  });

  it("deux fournisseurs différents donnent deux comptes différents", async () => {
    // Le rattachement de plusieurs plateformes à UN compte est une
    // fonctionnalité en soi ; par défaut, deux liens distincts sont deux
    // identités distinctes, et surtout pas une fusion implicite.
    googleRepond("meme-identifiant");
    const g = await appel(`?a=callback&code=a&state=${encodeURIComponent(await etatDeStart("google"))}`);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("users/@me")
          ? Response.json({ id: "meme-identifiant" })
          : Response.json({ access_token: "at" }),
      ),
    );
    const d = await appel(`?a=callback&code=b&state=${encodeURIComponent(await etatDeStart("discord"))}`);
    expect(decoupe(decodeURIComponent(fragment(d)))!.revendications.sub).not.toBe(
      decoupe(decodeURIComponent(fragment(g)))!.revendications.sub,
    );
  });

  it("un refus de l'utilisateur ramène au jeu sans drame", async () => {
    const res = await appel("?a=callback&error=access_denied");
    expect(fragment(res)).toBe("annule");
  });

  it("refuse un état forgé, absent ou modifié", async () => {
    const bon = await etatDeStart();
    for (const etat of ["", "n-importe-quoi", bon.slice(0, -2) + "xx", bon.replace(/^./, "z")]) {
      const res = await appel(`?a=callback&code=abc&state=${encodeURIComponent(etat)}`);
      expect(fragment(res), etat.slice(0, 12)).toBe("etat_invalide");
    }
  });

  it("un fournisseur qui répond mal ne crée aucun compte", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("non", { status: 500 })));
    const res = await appel(`?a=callback&code=abc&state=${encodeURIComponent(await etatDeStart())}`);
    expect(fragment(res)).toBe("echec");
  });

  it("un fournisseur qui répond sans identifiant ne crée aucun compte", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ access_token: "at" })));
    const res = await appel(`?a=callback&code=abc&state=${encodeURIComponent(await etatDeStart())}`);
    expect(fragment(res)).toBe("echec");
  });

  it("un compte banni n'obtient pas de jeton", async () => {
    googleRepond("banni");
    await appel(`?a=callback&code=a&state=${encodeURIComponent(await etatDeStart())}`);
    const u = (await depot.parLien({ fournisseur: "google", idExterne: "banni" }))!;
    await depot.cree({ ...u, banniLe: Date.now() }, { fournisseur: "google", idExterne: "banni" });
    const res = await appel(`?a=callback&code=b&state=${encodeURIComponent(await etatDeStart())}`);
    expect(fragment(res)).toBe("banni");
  });
});

/* ------------------------------------------------------------------ *
 * Rafraîchissement et révocation
 * ------------------------------------------------------------------ */

describe("rafraîchissement", () => {
  const connecte = async (sub = "u1"): Promise<string> => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ access_token: "at", id_token: idToken(sub) })),
    );
    const res = await appel(`?a=callback&code=a&state=${encodeURIComponent(await etatDeStart())}`);
    return decodeURIComponent(fragment(res));
  };

  const avec = (jeton: string): RequestInit => ({
    method: "POST",
    headers: { Authorization: `Bearer ${jeton}` },
  });

  it("rend un jeton frais", async () => {
    const jeton = await connecte();
    const res = await appel("?a=refresh", avec(jeton));
    expect(res.status).toBe(200);
    expect(verifieJeton((await res.json()).jeton, ENV.TOR_AUTH_SECRET)).not.toBeNull();
  });

  it("refuse sans jeton, et refuse un jeton frelaté", async () => {
    expect((await appel("?a=refresh", { method: "POST" })).status).toBe(401);
    expect((await appel("?a=refresh", avec("pas-un-jeton"))).status).toBe(401);
  });

  it("la révocation ferme le rafraîchissement — c'est LE contrôle de révocation", async () => {
    // Le serveur de salons ne peut pas faire cette vérification (il n'a pas de
    // base). La durée de vie du jeton est donc la fenêtre de révocation en
    // multi, et ce contrôle-ci est le seul qui la referme pour de bon.
    const jeton = await connecte();
    expect((await appel("?a=revoke", avec(jeton))).status).toBe(200);
    expect((await appel("?a=refresh", avec(jeton))).status).toBe(401);
    expect((await appel("?a=revoke", avec(jeton))).status).toBe(401);
  });

  it("un compte supprimé ne se rafraîchit plus", async () => {
    const jeton = await connecte("a-supprimer");
    const sub = decoupe(jeton)!.revendications.sub;
    await depot.supprime(sub);
    expect((await appel("?a=refresh", avec(jeton))).status).toBe(401);
  });

  it("le rafraîchissement n'accepte pas GET", async () => {
    expect((await appel("?a=refresh")).status).toBe(404);
  });
});
