/**
 * La boutique du COMPTE — fonction Vercel (runtime Node).
 *
 *   GET                → { boutique: { pieces, porte, possedes } }
 *   POST ?a=achete     → { skin, cle } : achète (cle = UUID choisi par le
 *                        client ; la rejouer ne débite jamais deux fois)
 *   POST ?a=porte      → { skin } : porte un style possédé
 *   POST ?a=importe    → { appareil, pieces, possedes } : le portefeuille
 *                        d'un appareil rejoint le compte, UNE fois par appareil
 *
 * Chaque écriture est UNE transaction en base (migration 0009) : débit,
 * possession, historique d'achat, grand livre et style porté réussissent
 * ensemble ou pas du tout, sous le verrou du compte.
 *
 * ⚠️ CE QUE CETTE ROUTE N'EST PAS. La boutique que le JEU lit est celle de
 * l'appareil (`src/game/boutique.ts`, `st.coins`), et elle le reste : la
 * décision n°12 interdit qu'une fonctionnalité de jeu dépende du compte. Cette
 * route est la version liée au compte — le client sait l'appeler
 * (`src/compte/boutique.ts`), mais AUCUN écran ne le fait, et c'est DÉCIDÉ
 * (25/11/2026 : la boutique du compte reste côté serveur). La brancher
 * demanderait une décision neuve — voir docs/BASE-DE-DONNEES.md §10.
 *
 * ⚠️ Les pièces importées sont des AFFIRMATIONS du client, comme le carnet
 * (décision n°14). Le grand livre les garantit contre la double comptabilité,
 * pas contre l'invention : rien ici ne doit jamais toucher un classement.
 */

import { cleanEnv } from "../src/env.js";
import {
  appareilValide,
  cleAchatValide,
  codeSkinValide,
  MAX_IMPORT_PIECES,
} from "../shared/boutique.js";
import { consomme } from "./_debit.js";
import { depotConfigure } from "./_depot-prisma.js";
import type { Depot } from "./_depot.js";
import { jetonDeLaRequete, verifieJeton } from "./_jeton.js";
import { litObjet } from "./_corps.js";

// Runtime NODE (le défaut de Vercel) : le dépôt ouvre une connexion
// PostgreSQL par Prisma, ce que le runtime edge ne sait pas faire (ADR 0012).

const MAX_BODY = 2000;
/** Autant de styles qu'un appareil peut en porter, avec de la marge. */
const MAX_STYLES = 32;

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function traite(
  req: Request,
  env: Record<string, string | undefined>,
  depotInjecte?: Depot,
  /** Injectable, comme partout : un jeton se juge à une HEURE. */
  maintenant: number = Date.now(),
): Promise<Response> {
  const secret = cleanEnv(env.TOR_AUTH_SECRET);
  const depot = depotInjecte ?? depotConfigure(env);
  if (!secret || !depot) return json({ disponible: false }, 503);

  const r = await verifieJeton(jetonDeLaRequete(req), secret, maintenant);
  if (!r) return json({ error: "jeton" }, 401);

  const u = await depot.parId(r.sub);
  if (!u || u.supprimeLe) return json({ error: "inconnu" }, 401);
  if (u.banniLe) return json({ error: "banni" }, 403);
  if (u.versionJeton !== r.vj) return json({ error: "revoque" }, 401);

  if (req.method === "GET") {
    const etat = await depot.boutique(u.id);
    return etat ? json({ boutique: etat }) : json({ error: "inconnu" }, 401);
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const brut = await req.text();
  if (brut.length > MAX_BODY) return json({ error: "too large" }, 413);
  const corps = litObjet(brut || "{}");
  if (!corps) return json({ error: "bad json" }, 400);

  const debit = await consomme(env, "boutique", u.id);
  if (!debit.ok) return json({ error: "trop de requetes" }, 429);

  const action = new URL(req.url).searchParams.get("a");

  if (action === "achete") {
    const skin = codeSkinValide(corps.skin);
    const cle = cleAchatValide(corps.cle);
    if (!skin || !cle) return json({ error: "achat" }, 400);
    const rep = await depot.acheteSkin(u.id, skin, cle);
    // Un refus d'achat n'est pas une erreur HTTP : c'est une issue, que
    // l'écran dit (« il te manque 100 »). Seul « inconnu » en est une.
    return json({ achat: rep }, rep.issue === "inconnu" ? 404 : 200);
  }

  if (action === "porte") {
    const skin = codeSkinValide(corps.skin);
    if (!skin) return json({ error: "skin" }, 400);
    if (!(await depot.porteSkin(u.id, skin))) return json({ error: "non possede" }, 409);
    return json({ boutique: await depot.boutique(u.id) });
  }

  if (action === "importe") {
    const appareil = appareilValide(corps.appareil);
    if (!appareil) return json({ error: "appareil" }, 400);
    const n = Number(corps.pieces);
    const pieces = Number.isFinite(n) ? Math.min(MAX_IMPORT_PIECES, Math.max(0, Math.floor(n))) : 0;
    const possedes = Array.isArray(corps.possedes)
      ? corps.possedes.slice(0, MAX_STYLES).map(codeSkinValide).filter((c): c is string => c !== null)
      : [];
    return json({ import: await depot.importeBoutique(u.id, appareil, pieces, possedes) });
  }

  return json({ error: "action inconnue" }, 404);
}

/*
 * Une panne de la base rend une réponse JSON et une ligne de journal, comme
 * `api/perf.ts` : la plateforme n'affiche pas sa page d'erreur au client.
 */
const entree = async (req: Request): Promise<Response> => {
  try {
    return await traite(req, process.env as Record<string, string | undefined>);
  } catch (err) {
    console.error(`boutique_erreur ${err instanceof Error ? err.message : String(err)}`);
    return json({ error: "interne" }, 500);
  }
};

/**
 * Le format `fetch` : en runtime Node, Vercel lirait une fonction exportée
 * seule comme un handler `(req, res)` à la Node, et la requête n'arriverait
 * jamais sous forme de `Request`.
 */
export default { fetch: entree };
