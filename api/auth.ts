/**
 * Connexion — fonction Vercel (runtime Node).
 *
 * Google et Discord, rien d'autre. Aucun mot de passe n'est stocké, donc
 * aucun secret à protéger, aucun flux de réinitialisation à écrire, et une
 * seule tape pour l'utilisateur — ce qui compte, parce que la fenêtre de
 * conversion se compte en secondes.
 *
 * TROIS PARTIS PRIS QUI MÉRITENT LEUR EXPLICATION :
 *
 *   · Le jeton revient dans le FRAGMENT de l'URL (`#compte=…`), jamais dans la
 *     query. Un fragment ne quitte pas le navigateur : il n'apparaît ni dans
 *     les journaux du serveur, ni dans le `Referer`, ni dans l'historique des
 *     proxys. Le client le lit et l'efface aussitôt.
 *
 *   · L'état anti-CSRF est SIGNÉ, pas stocké. Une fonction Vercel n'a pas de
 *     mémoire entre deux requêtes, et poser une ligne en base pour trente
 *     secondes de validité serait une table de plus pour rien.
 *
 *   · Sans configuration, tout répond « comptes indisponibles » et le jeu
 *     tourne exactement comme avant. C'est la dégradation prévue partout dans
 *     ce chantier : une panne d'authentification ne doit jamais bloquer un
 *     chemin de jeu.
 */

import { b64url, deB64url } from "../shared/jeton.js";
import { nouvelId, utilisateurNeuf } from "./_depot.js";
import { depotConfigure } from "./_depot-prisma.js";
import type { Depot, Lien, Utilisateur } from "./_depot.js";
import { jetonDeLaRequete, signeJeton, verifieJeton, verifieJetonRenouvelable } from "./_jeton.js";
import { cleanEnv } from "../src/env.js";

// Runtime NODE (le défaut de Vercel) : le dépôt ouvre une connexion
// PostgreSQL par Prisma, ce que le runtime edge ne sait pas faire (ADR 0012).

/* ------------------------------------------------------------------ *
 * Fournisseurs
 * ------------------------------------------------------------------ */

interface Fournisseur {
  autorisation: string;
  jeton: string;
  portee: string;
  /** Extrait l'identifiant stable du compte chez le fournisseur. */
  identifie(acces: string, reponse: Record<string, unknown>): Promise<string | null>;
}

/**
 * L'`id_token` de Google est lu SANS vérifier sa signature, et c'est correct :
 * il arrive en réponse TLS directe à une requête que nous avons authentifiée
 * avec notre secret client. Il n'a traversé aucun tiers. Vérifier la signature
 * imposerait d'aller chercher et de mettre en cache les clés publiques de
 * Google pour ne rien apprendre de plus.
 */
function sujetDeIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  const charge = idToken.split(".")[1];
  if (!charge) return null;
  const brut = deB64url(charge);
  if (!brut) return null;
  try {
    const o = JSON.parse(new TextDecoder().decode(brut)) as Record<string, unknown>;
    return typeof o.sub === "string" && o.sub ? o.sub : null;
  } catch {
    return null;
  }
}

const FOURNISSEURS: Record<string, Fournisseur> = {
  google: {
    autorisation: "https://accounts.google.com/o/oauth2/v2/auth",
    jeton: "https://oauth2.googleapis.com/token",
    portee: "openid",
    async identifie(_acces, reponse) {
      return sujetDeIdToken(reponse.id_token);
    },
  },
  discord: {
    autorisation: "https://discord.com/oauth2/authorize",
    jeton: "https://discord.com/api/oauth2/token",
    // `identify` seul : on ne demande ni l'e-mail, ni les serveurs, ni rien
    // d'autre. Une portée qu'on ne sait pas justifier est une portée qui fera
    // hésiter à cliquer.
    portee: "identify",
    async identifie(acces) {
      const res = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${acces}` },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return null;
      const o = (await res.json()) as Record<string, unknown>;
      return typeof o.id === "string" && o.id ? o.id : null;
    },
  },
};

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

interface Config {
  secret: string;
  appUrl: string;
  depot: Depot;
  identifiants: Record<string, { id: string; secret: string }>;
}

function litConfig(
  env: Record<string, string | undefined>,
  depotInjecte?: Depot,
): Config | null {
  const secret = cleanEnv(env.TOR_AUTH_SECRET);
  const appUrl = cleanEnv(env.TOR_APP_URL);
  const depot = depotInjecte ?? depotConfigure(env);
  if (!secret || !appUrl || !depot) return null;

  const identifiants: Config["identifiants"] = {};
  const g = [cleanEnv(env.GOOGLE_CLIENT_ID), cleanEnv(env.GOOGLE_CLIENT_SECRET)];
  if (g[0] && g[1]) identifiants.google = { id: g[0], secret: g[1] };
  const d = [cleanEnv(env.DISCORD_CLIENT_ID), cleanEnv(env.DISCORD_CLIENT_SECRET)];
  if (d[0] && d[1]) identifiants.discord = { id: d[0], secret: d[1] };
  if (!Object.keys(identifiants).length) return null;

  return { secret, appUrl: appUrl.replace(/\/+$/, ""), depot, identifiants };
}

/**
 * L'URI de retour déclarée chez le fournisseur.
 *
 * SANS QUERY STRING, et ce n'est pas un choix de style : Google refuse
 * d'enregistrer une URI de redirection qui en porte une (« Invalid Redirect:
 * cannot contain a query string »). D'où `api/authcb.ts`, un point d'entrée
 * dédié qui ne fait que rappeler `traite` avec l'action forcée.
 *
 * Elle doit être déclarée AU CARACTÈRE PRÈS dans les deux consoles : Google
 * et Discord comparent la chaîne exacte, et un `/` de trop suffit à faire
 * échouer l'échange de code avec un message qui ne dit pas lequel des deux
 * côtés a tort.
 */
const redirection = (c: Config): string => `${c.appUrl}/api/authcb`;

/* ------------------------------------------------------------------ *
 * État signé
 * ------------------------------------------------------------------ */

const ENC = new TextEncoder();
const DUREE_ETAT_MS = 10 * 60_000;

async function hmac(secret: string, message: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    "raw",
    ENC.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", cle, ENC.encode(message))));
}

async function faisEtat(c: Config, fournisseur: string, maintenant: number): Promise<string> {
  const charge = `${fournisseur}.${maintenant}.${crypto.randomUUID().slice(0, 8)}`;
  return `${b64url(ENC.encode(charge))}.${await hmac(c.secret, charge)}`;
}

async function litEtat(
  c: Config,
  etat: string | null,
  maintenant: number,
): Promise<{ fournisseur: string } | null> {
  if (!etat) return null;
  const [charge64, sig] = etat.split(".") as [string?, string?];
  if (!charge64 || !sig) return null;
  const brut = deB64url(charge64);
  if (!brut) return null;
  const charge = new TextDecoder().decode(brut);
  // Recalcul puis comparaison : l'état n'est pas un secret, seule son
  // intégrité compte, et la comparaison porte sur une valeur que l'attaquant
  // ne peut pas produire.
  if ((await hmac(c.secret, charge)) !== sig) return null;
  const [fournisseur, emis] = charge.split(".") as [string?, string?];
  if (!fournisseur || !FOURNISSEURS[fournisseur]) return null;
  const t = Number(emis);
  if (!Number.isFinite(t) || maintenant - t > DUREE_ETAT_MS || t - maintenant > 60_000) return null;
  return { fournisseur };
}

/* ------------------------------------------------------------------ *
 * Réponses
 * ------------------------------------------------------------------ */

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const versApp = (c: Config, fragment: string): Response =>
  new Response(null, {
    status: 302,
    headers: { Location: `${c.appUrl}/${fragment}`, "Cache-Control": "no-store" },
  });

/* ------------------------------------------------------------------ *
 * Le jeton d'un utilisateur
 * ------------------------------------------------------------------ */

async function jetonPour(c: Config, u: Utilisateur, maintenant: number): Promise<string> {
  return signeJeton(
    {
      sub: u.id,
      psd: u.pseudo,
      // Le glyphe voyage comme une valeur portée. Le jour où il se possédera,
      // c'est ICI que se posera la vérification — nulle part ailleurs.
      gly: typeof u.apparence.glyphe === "number" ? u.apparence.glyphe : 0,
      vj: u.versionJeton,
    },
    c.secret,
    maintenant,
  );
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

/**
 * Le corps de la route, avec son environnement et son dépôt en paramètres.
 *
 * Exportée pour que les tests exercent le VRAI chemin plutôt qu'une imitation.
 * `api/collect.ts` a montré le coût de l'inverse : un maillon non testé de
 * cette chaîne ne se voit qu'au moment où l'on cherche les chiffres, une
 * semaine trop tard.
 */
export async function traite(
  req: Request,
  env: Record<string, string | undefined>,
  depotInjecte?: Depot,
): Promise<Response> {
  const c = litConfig(env, depotInjecte);
  const url = new URL(req.url);
  const action = url.searchParams.get("a");

  // Sans configuration, les comptes n'existent pas. Ce n'est pas une panne :
  // c'est un déploiement où le jeu tourne sans eux, et il doit tourner.
  if (!c) {
    if (action === "callback") {
      return new Response(null, {
        status: 302,
        headers: { Location: "/#compte=indisponible", "Cache-Control": "no-store" },
      });
    }
    return json({ disponible: false }, 503);
  }

  const maintenant = Date.now();

  /* --- quels fournisseurs sont réellement branchés --- */
  if (action === "fournisseurs") {
    return json({ disponible: true, fournisseurs: Object.keys(c.identifiants).sort() });
  }

  /* --- départ : on envoie chez le fournisseur --- */
  if (action === "start") {
    const nom = url.searchParams.get("f") ?? "";
    const f = FOURNISSEURS[nom];
    const ident = c.identifiants[nom];
    if (!f || !ident) return json({ error: "fournisseur inconnu" }, 404);

    const cible = new URL(f.autorisation);
    cible.searchParams.set("client_id", ident.id);
    cible.searchParams.set("redirect_uri", redirection(c));
    cible.searchParams.set("response_type", "code");
    cible.searchParams.set("scope", f.portee);
    cible.searchParams.set("state", await faisEtat(c, nom, maintenant));
    return new Response(null, {
      status: 302,
      headers: { Location: cible.toString(), "Cache-Control": "no-store" },
    });
  }

  /* --- retour : on échange le code et on frappe le jeton --- */
  if (action === "callback") {
    const etat = await litEtat(c, url.searchParams.get("state"), maintenant);
    const code = url.searchParams.get("code");
    // Un refus de l'utilisateur chez le fournisseur arrive ici comme
    // `error=access_denied`. Ce n'est pas une panne, c'est un « non » : on le
    // ramène au jeu sans rien dire de plus.
    if (url.searchParams.get("error")) return versApp(c, "#compte=annule");
    if (!etat || !code) return versApp(c, "#compte=etat_invalide");

    const f = FOURNISSEURS[etat.fournisseur]!;
    const ident = c.identifiants[etat.fournisseur]!;

    let idExterne: string | null;
    try {
      const res = await fetch(f.jeton, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: ident.id,
          client_secret: ident.secret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirection(c),
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return versApp(c, "#compte=echec");
      const reponse = (await res.json()) as Record<string, unknown>;
      const acces = typeof reponse.access_token === "string" ? reponse.access_token : "";
      idExterne = await f.identifie(acces, reponse);
    } catch {
      return versApp(c, "#compte=echec");
    }
    if (!idExterne) return versApp(c, "#compte=echec");

    const lien: Lien = { fournisseur: etat.fournisseur, idExterne };
    let u: Utilisateur | null;
    try {
      u = await c.depot.parLien(lien);
      if (!u) u = await c.depot.cree(utilisateurNeuf(nouvelId(), maintenant), lien);
      else await c.depot.touche(u.id);
    } catch {
      return versApp(c, "#compte=echec");
    }

    if (u.banniLe) return versApp(c, "#compte=banni");

    return versApp(c, `#compte=${encodeURIComponent(await jetonPour(c, u, maintenant))}`);
  }

  /* --- rafraîchissement : c'est ce qui garde la révocation à 24 h --- */
  if (action === "refresh" && req.method === "POST") {
    // Un jeton PÉRIMÉ depuis moins d'un mois s'échange encore : sans ça, un
    // joueur absent plus d'une journée était déconnecté en silence. La
    // révocation, elle, reste vérifiée en base juste en dessous.
    const r = await verifieJetonRenouvelable(jetonDeLaRequete(req), c.secret, maintenant);
    if (!r) return json({ error: "jeton" }, 401);

    const u = await c.depot.parId(r.sub);
    if (!u || u.supprimeLe) return json({ error: "inconnu" }, 401);
    if (u.banniLe) return json({ error: "banni" }, 403);
    // LE contrôle de révocation. Il n'a lieu qu'ici, et c'est la raison pour
    // laquelle le jeton est court : le serveur de salons, lui, ne peut pas
    // le faire.
    if (u.versionJeton !== r.vj) return json({ error: "revoque" }, 401);

    await c.depot.touche(u.id);
    return json({ jeton: await jetonPour(c, u, maintenant) });
  }

  /* --- se déconnecter partout --- */
  if (action === "revoke" && req.method === "POST") {
    const r = await verifieJeton(jetonDeLaRequete(req), c.secret, maintenant);
    if (!r) return json({ error: "jeton" }, 401);
    const u = await c.depot.parId(r.sub);
    if (!u || u.versionJeton !== r.vj) return json({ error: "jeton" }, 401);
    await c.depot.revoque(r.sub);
    return json({ ok: true });
  }

  return json({ error: "action inconnue" }, 404);
}

const entree = (req: Request): Promise<Response> =>
  traite(req, process.env as Record<string, string | undefined>);

/**
 * Le format `fetch` : en runtime Node, Vercel lirait une fonction exportée
 * seule comme un handler `(req, res)` à la Node, et la requête n'arriverait
 * jamais sous forme de `Request`.
 */
export default { fetch: entree };
