/**
 * Le compte de celui qui le demande — fonction edge Vercel.
 *
 * ⚠️ CE QUI ARRIVE ICI N'EST PAS VÉRIFIÉ, ET C'EST ASSUMÉ.
 *
 * Les agrégats — carnet, série, records — sont des AFFIRMATIONS du client. Ils
 * ne sont pas rejoués, ils ne peuvent pas l'être : ils résument des parties
 * jouées avant que le compte n'existe, dont personne n'a gardé le journal.
 *
 * C'est acceptable parce qu'ils ne servent qu'au joueur lui-même : son carnet,
 * sa série, ses records personnels. Ce serait inacceptable pour un classement,
 * et c'est pourquoi ils n'y entreront JAMAIS. Une performance opposable à
 * autrui est rejouée par `verifyRun` et rangée ailleurs (voir `api/perf.ts`) ;
 * ces deux chemins ne doivent pas se confondre, sous peine de faire démarrer
 * chaque historique sur des faits invérifiables.
 *
 * Reste donc à borner : un endpoint public doit refuser tout ce qu'il
 * n'attend pas, y compris un carnet de dix mille entrées.
 */

import {
  agregatsVides,
  apparenceAutorisee,
  fusionne,
  litApparence,
  normalisePseudo,
} from "../shared/compte";
import type { Agregats, CarnetEntree } from "../shared/compte";
import { consomme } from "./_debit";
import { depotConfigure } from "./_depot";
import type { Depot, Utilisateur } from "./_depot";
import { jetonDeLaRequete, signeJeton, verifieJeton } from "./_jeton";
import { GLYPH_COUNT } from "../src/net/glyph";
import { cleanEnv } from "../src/env";

/**
 * Nettoie `parAllure` : des clés d'allure connues, des entiers bornés.
 *
 * On ne fait pas confiance au client, donc on RECONSTRUIT plutôt que de
 * recopier — et une clé inventée ne doit pas pouvoir gonfler l'objet stocké.
 */
function allures(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== "object") return out;
  for (const [cle, brut] of Object.entries(v as Record<string, unknown>)) {
    if (!/^\d+(\.\d+)?$/.test(cle)) continue;
    const n = entier(brut, MAX_VALEUR);
    if (n > 0) out[cle] = n;
  }
  return out;
}

export const config = { runtime: "edge" };

/* ------------------------------------------------------------------ *
 * Bornes
 * ------------------------------------------------------------------ */

const MAX_BODY = 32_000;
/** Douze règles au catalogue ; on laisse de la marge sans ouvrir la porte. */
const MAX_CARNET = 64;
/** Une clé par mode × régime × version. Quelques dizaines suffisent longtemps. */
const MAX_RECORDS = 128;
const MAX_CLE = 96;
/** Un run du jour fait 40 manches ; l'entraînement n'est pas borné, mais pas infini. */
const MAX_VALEUR = 100_000;
const MAX_SERIE = 3650;

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const entier = (v: unknown, max: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, Math.floor(n)));
};

/**
 * Lit des agrégats venus du client.
 *
 * Tout ce qui dépasse est TRONQUÉ, jamais refusé : renvoyer une erreur ferait
 * échouer la revendication d'un joueur pour une clé qu'il n'a pas écrite
 * lui-même, et la revendication est le moment le plus fragile du parcours. On
 * garde ce qui a du sens et on jette le reste en silence.
 */
export function litAgregats(brut: unknown): Agregats {
  const a = agregatsVides();
  if (!brut || typeof brut !== "object") return a;
  const o = brut as Record<string, unknown>;

  if (o.carnet && typeof o.carnet === "object") {
    for (const [id, v] of Object.entries(o.carnet as Record<string, unknown>).slice(0, MAX_CARNET)) {
      if (typeof id !== "string" || !id || id.length > 32) continue;
      const e = (v ?? {}) as Partial<CarnetEntree>;
      a.carnet[id] = {
        best: entier(e.best, MAX_VALEUR),
        cleared: e.cleared === true,
        // Un champ ajouté après coup DOIT être listé ici : ce nettoyage
        // RECONSTRUIT l'entrée, il ne la recopie pas. C'est voulu — on ne fait
        // pas confiance à ce que le client envoie — mais ça veut dire qu'un
        // oubli ne casse rien et se voit seulement au moment où un joueur
        // change d'appareil et retrouve un compteur à zéro.
        pieges: entier(e.pieges, MAX_VALEUR),
      };
      /*
       * Les trois champs de l'échelle de maîtrise. Sans eux, un joueur qui
       * change d'appareil retrouve ses cases à zéro — et rien ne l'avertit.
       *
       * Posés seulement s'ils portent quelque chose : « absent vaut zéro » est
       * la doctrine du carnet, et un objet vide sur chaque entrée ne dirait
       * rien de plus que son absence.
       */
      const pa = allures(e.parAllure);
      if (Object.keys(pa).length) a.carnet[id]!.parAllure = pa;
      const ru = entier(e.runs, MAX_VALEUR);
      if (ru) a.carnet[id]!.runs = ru;
      const se = entier(e.serie, MAX_VALEUR);
      if (se) a.carnet[id]!.serie = se;
      if (e.sansFaute === true) a.carnet[id]!.sansFaute = true;
    }
  }

  if (o.serie && typeof o.serie === "object") {
    const s = o.serie as Record<string, unknown>;
    a.serie = { count: entier(s.count, MAX_SERIE), lastDay: entier(s.lastDay, MAX_SERIE * 10) };
  }

  if (o.records && typeof o.records === "object") {
    for (const [cle, v] of Object.entries(o.records as Record<string, unknown>).slice(0, MAX_RECORDS)) {
      if (typeof cle !== "string" || !cle || cle.length > MAX_CLE) continue;
      a.records[cle] = entier(v, MAX_VALEUR);
    }
  }

  return a;
}

/* ------------------------------------------------------------------ *
 * Écriture concurrente
 * ------------------------------------------------------------------ */

/**
 * Fusionne et écrit, en réessayant si quelqu'un est passé entre-temps.
 *
 * La fusion étant une union et un maximum, refaire un tour ne peut RIEN
 * détruire : c'est ce qui rend cette boucle sûre plutôt que délicate, et c'est
 * la raison pour laquelle la règle « jamais une affectation » n'est pas un
 * détail de style.
 *
 * Trois tentatives : au-delà, ce n'est plus de la concurrence, c'est une
 * panne, et insister ne ferait que tenir la fonction ouverte.
 */
async function fusionneEtEcrit(
  depot: Depot,
  id: string,
  apport: Agregats,
): Promise<Utilisateur | null> {
  for (let essai = 0; essai < 3; essai++) {
    const u = await depot.parId(id);
    if (!u) return null;
    const cible = fusionne(u.agregats, apport);
    if (await depot.majAgregats(id, u.revision, cible)) {
      return { ...u, agregats: cible, revision: u.revision + 1 };
    }
  }
  return depot.parId(id);
}

/* ------------------------------------------------------------------ *
 * Vues
 * ------------------------------------------------------------------ */

const vue = (u: Utilisateur) => ({
  id: u.id,
  pseudo: u.pseudo,
  glyphe: typeof u.apparence.glyphe === "number" ? u.apparence.glyphe : 0,
  apparence: u.apparence,
  agregats: u.agregats,
  creeLe: u.creeLe,
});

async function jetonPour(u: Utilisateur, secret: string, maintenant: number): Promise<string> {
  return signeJeton(
    {
      sub: u.id,
      psd: u.pseudo,
      gly: typeof u.apparence.glyphe === "number" ? u.apparence.glyphe : 0,
      vj: u.versionJeton,
    },
    secret,
    maintenant,
  );
}

/* ------------------------------------------------------------------ *
 * Route
 * ------------------------------------------------------------------ */

export async function traite(
  req: Request,
  env: Record<string, string | undefined>,
  depotInjecte?: Depot,
): Promise<Response> {
  const secret = cleanEnv(env.TOR_AUTH_SECRET);
  const depot = depotInjecte ?? depotConfigure(env);
  if (!secret || !depot) return json({ disponible: false }, 503);

  const maintenant = Date.now();
  const r = await verifieJeton(jetonDeLaRequete(req), secret, maintenant);
  if (!r) return json({ error: "jeton" }, 401);

  const url = new URL(req.url);
  const action = url.searchParams.get("a");

  let u = await depot.parId(r.sub);
  if (!u || u.supprimeLe) return json({ error: "inconnu" }, 401);
  if (u.banniLe) return json({ error: "banni" }, 403);
  // Un jeton d'une génération révoquée n'ouvre plus rien. Le contrôle vit ici
  // et dans `api/auth.ts` — partout où une base est disponible.
  if (u.versionJeton !== r.vj) return json({ error: "revoque" }, 401);

  /* --- lecture --- */
  if (!action || action === "profil") {
    if (req.method !== "GET") return json({ error: "method" }, 405);
    return json({ moi: vue(u) });
  }

  /*
   * L'historique personnel.
   *
   * On ne rend QUE les performances de celui qui demande. Il n'existe aucune
   * route qui rende celles de quelqu'un d'autre, et ce n'est pas un oubli :
   * une telle route serait un classement, et le périmètre de ce chantier
   * s'arrête avant.
   */
  if (action === "perfs") {
    if (req.method !== "GET") return json({ error: "method" }, 405);
    const perfs = await depot.mesPerfs(u.id, 60);
    return json({
      perfs: perfs.map((p) => ({
        mode: p.mode,
        jour: p.jour,
        regle: p.regle,
        valeur: p.valeur,
        valeur2: p.valeur2,
        // La version de contenu voyage avec : c'est elle qui dira, plus tard,
        // qu'un chiffre d'aujourd'hui ne se compare pas à un chiffre d'après
        // la treizième règle.
        versionContenu: p.versionContenu,
        creeLe: p.creeLe,
      })),
    });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);
  const brut = await req.text();
  if (brut.length > MAX_BODY) return json({ error: "too large" }, 413);
  let corps: Record<string, unknown>;
  try {
    corps = JSON.parse(brut || "{}") as Record<string, unknown>;
  } catch {
    return json({ error: "bad json" }, 400);
  }

  // Seules les ÉCRITURES sont limitées, et le sujet est le compte — jamais une
  // IP : ces routes exigent déjà un jeton, donc le compte est un sujet plus
  // précis et moins intrusif. Voir `api/_debit.ts`.
  const debit = await consomme(env, action, u.id);
  if (!debit.ok) return json({ error: "trop de requetes" }, 429);

  /* --- la revendication : une progression d'appareil rejoint un compte --- */
  if (action === "fusion") {
    const apres = await fusionneEtEcrit(depot, u.id, litAgregats(corps.agregats));
    if (!apres) return json({ error: "inconnu" }, 401);
    u = apres;

    /*
     * Le pseudo et le signe ne s'écrivent QU'À LA PREMIÈRE revendication.
     *
     * Un compte fraîchement lié n'a ni l'un ni l'autre : on prend ceux que le
     * joueur porte déjà en multijoueur, pour que créer un compte ne lui
     * change rien de visible. Mais un second appareil, lui, ne doit pas
     * imposer son nom local à un compte déjà nommé — sinon le simple fait
     * d'ouvrir le jeu ailleurs renommerait le joueur.
     */
    if (!u.pseudo) {
      const pseudo = normalisePseudo(corps.pseudo);
      const apparence = apparenceAutorisee(
        litApparence({ ...u.apparence, glyphe: corps.glyphe }),
        GLYPH_COUNT,
      );
      if (pseudo || apparence.glyphe !== u.apparence.glyphe) {
        await depot.majIdentite(u.id, pseudo || u.pseudo, apparence);
        u = { ...u, pseudo: pseudo || u.pseudo, apparence };
      }
    }

    return json({ moi: vue(u), jeton: await jetonPour(u, secret, maintenant) });
  }

  /* --- renommage et changement de signe --- */
  if (action === "identite") {
    const pseudo = normalisePseudo(corps.pseudo);
    if (!pseudo) return json({ error: "pseudo vide" }, 400);
    const apparence = apparenceAutorisee(
      litApparence({ ...u.apparence, glyphe: corps.glyphe ?? u.apparence.glyphe }),
      GLYPH_COUNT,
    );
    await depot.majIdentite(u.id, pseudo, apparence);
    u = { ...u, pseudo, apparence };
    // Le jeton porte le pseudo et le signe : sans nouveau jeton, le salon
    // continuerait d'annoncer l'ancien nom jusqu'à la péremption.
    return json({ moi: vue(u), jeton: await jetonPour(u, secret, maintenant) });
  }

  /* --- suppression --- */
  if (action === "suppression") {
    /*
     * Effacement LOGIQUE de l'utilisateur, DÉFINITIF des liens et des
     * performances.
     *
     * L'ordre importe : les liens de plateforme partent en premier et pour de
     * bon, sinon se reconnecter avec le même compte Google ressusciterait un
     * compte supprimé — ce qu'une demande de suppression interdit exactement.
     *
     * On révoque dans la foulée : les jetons déjà émis cessent d'ouvrir quoi
     * que ce soit là où une base est disponible. Côté salons, ils restent
     * lisibles jusqu'à leur péremption — au plus 24 h — et c'est le prix
     * assumé d'un serveur de salons sans base.
     */
    await depot.supprime(u.id);
    return json({ supprime: true });
  }

  return json({ error: "action inconnue" }, 404);
}

export default (req: Request): Promise<Response> =>
  traite(req, process.env as Record<string, string | undefined>);
