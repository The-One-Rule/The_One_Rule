/**
 * Les amis — fonction edge Vercel.
 *
 *   GET                 → son code, le classement de son cercle (soi compris),
 *                         les demandes reçues et envoyées
 *   POST ?a=ajoute      → { code } : DEMANDE — ou lie, si l'autre avait déjà
 *                         demandé (deux demandes croisées valent accord)
 *   POST ?a=accepte     → { code } : accepte une demande reçue
 *   POST ?a=refuse      → { code } : refuse une demande reçue, sans le dire
 *   POST ?a=annule      → { code } : retire sa propre demande
 *   POST ?a=retire      → { code } : délie deux amis
 *
 * ⚠️ AJOUTER NE LIE PLUS. Rapporté par Pierre : « si on veut ajouter
 * quelqu'un en ami on ne lui demande même pas l'autorisation ». Un code se
 * recopie, se montre, se devine sur un écran ; être ajouté par un inconnu,
 * c'est lui ouvrir ses scores de la semaine. L'amitié naît de l'ACCEPTATION.
 * Un refus ne se dit pas à celui qui a demandé : sa demande disparaît
 * simplement, comme partout ailleurs — dire « refusé » ferait du refus un
 * geste social qui coûte, et on accepterait par gêne.
 *
 * ⚠️ LE JETON EST OBLIGATOIRE ICI, et ça ne contredit pas la décision n°12 :
 * une liste d'amis EST un compte — elle doit survivre à un changement
 * d'appareil, sinon elle n'est qu'un carnet d'adresses local. Aucune
 * fonctionnalité de JEU n'en dépend : sans compte, on joue, on entre dans un
 * salon, on regarde le podium du jour. On n'a juste pas d'amis enregistrés.
 *
 * Ce qu'un ami voit de l'autre est ce que le podium du jour publie déjà —
 * pseudo, signe, carte — plus ses scores du jour REJOUÉS. Jamais les
 * agrégats (affirmations du client, décision n°14), jamais l'identifiant de
 * compte : le CODE sert de poignée, et c'est lui qu'on a choisi de donner.
 */

import { cleDuJour } from "../src/game/perfs";
import { cleanEnv } from "../src/env";
import {
  classementDesAmis,
  codeAmiValide,
  JOURS_COMPARES,
  MAX_AMIS,
  MAX_DEMANDES,
  semaineDe,
} from "../shared/amis";
import type { Demandeur, LigneAmi, Participant } from "../shared/amis";
import { carteValide } from "../shared/profil";
import { consomme } from "./_debit";
import { depotConfigure } from "./_depot";
import type { Ami, Depot, Perf, Utilisateur } from "./_depot";
import { jetonDeLaRequete, verifieJeton } from "./_jeton";
import { litObjet } from "./_corps";

export const config = { runtime: "edge" };

/** La fenêtre lue pour « meilleur » : un mois. Assez pour dire quelque chose, assez court pour rester une requête. */
const FENETRE_JOURS = 30;

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** L'index de jour courant, en UTC — la même origine que `game/daily.ts` et `api/perf.ts`. */
const EPOCH = Date.UTC(2026, 0, 1);
const jourDe = (maintenant: number): number => {
  const d = new Date(maintenant);
  return Math.floor(
    (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - EPOCH) / 86_400_000,
  );
};

/** Ce que le cercle publie d'une personne. La liste des clés est gardée par un test. */
function participant(
  qui: { id: string; code: string | null; pseudo: string; apparence: Utilisateur["apparence"] },
  perfs: readonly Perf[],
  jour: number,
  moi: boolean,
): Participant {
  const siennes = perfs.filter((p) => p.utilisateurId === qui.id && p.cle === cleDuJour(p.jour ?? -1));
  const auj = siennes.find((p) => p.jour === jour);
  return {
    code: qui.code ?? "",
    pseudo: qui.pseudo,
    glyphe: Number(qui.apparence.glyphe ?? 0),
    carte: carteValide(qui.apparence.carte) ?? null,
    moi,
    aujourdhui: auj ? { valeur: auj.valeur, valeur2: auj.valeur2 } : null,
    semaine: semaineDe(siennes, jour, cleDuJour, JOURS_COMPARES),
    meilleur: siennes.length ? Math.max(...siennes.map((p) => p.valeur)) : null,
  };
}

/** Ce qu'une demande publie de son auteur — la liste des clés est gardée par un test. */
const demandeur = (a: Ami): Demandeur => ({
  code: a.code ?? "",
  pseudo: a.pseudo,
  glyphe: Number(a.apparence.glyphe ?? 0),
  carte: carteValide(a.apparence.carte) ?? null,
});

/** L'état complet de l'écran des amis. */
async function etat(depot: Depot, u: Utilisateur, code: string, jour: number, issue?: "demande" | "lie") {
  const [amis, recues, envoyees] = await Promise.all([
    cercle(depot, u, code, jour),
    depot.demandesVers(u.id),
    depot.demandesDe(u.id),
  ]);
  return {
    code,
    jour,
    amis,
    recues: recues.map(demandeur),
    envoyees: envoyees.map(demandeur),
    ...(issue ? { issue } : {}),
  };
}

async function cercle(depot: Depot, u: Utilisateur, code: string, jour: number): Promise<LigneAmi[]> {
  const amis: Ami[] = await depot.amisDe(u.id);
  const perfs = await depot.perfsDepuis([u.id, ...amis.map((a) => a.id)], jour - FENETRE_JOURS + 1);
  return classementDesAmis([
    participant({ id: u.id, code, pseudo: u.pseudo, apparence: u.apparence }, perfs, jour, true),
    ...amis.map((a) => participant(a, perfs, jour, false)),
  ]);
}

export async function traite(
  req: Request,
  env: Record<string, string | undefined>,
  depotInjecte?: Depot,
  maintenant: number = Date.now(),
  hasard: () => number = Math.random,
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

  const jour = jourDe(maintenant);
  const monCode = await depot.codeAmi(u.id, hasard);

  if (req.method === "GET") {
    return json(await etat(depot, u, monCode, jour));
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const debit = await consomme(env, "amis", u.id);
  if (!debit.ok) return json({ error: "trop de requetes" }, 429);

  const brut = await req.text();
  if (brut.length > 1000) return json({ error: "too large" }, 413);
  const corps = litObjet(brut);
  if (!corps) return json({ error: "bad json" }, 400);
  const code = codeAmiValide(corps.code);
  if (!code) return json({ error: "code" }, 400);

  const action = new URL(req.url).searchParams.get("a");
  const autre = await depot.parCodeAmi(code);

  /** Lie deux comptes, plafond vérifié DES DEUX CÔTÉS, et range les demandes. */
  const lieSiPlace = async (x: Utilisateur): Promise<Response | null> => {
    // Le plafond vaut aussi pour L'AUTRE : sinon n'importe qui pourrait
    // gonfler la liste d'un inconnu au-delà de ce qu'elle sait afficher.
    if ((await depot.amisDe(u.id)).length >= MAX_AMIS) return json({ error: "plein" }, 400);
    if ((await depot.amisDe(x.id)).length >= MAX_AMIS) return json({ error: "plein" }, 400);
    await depot.lie(u.id, x.id);
    /*
     * ⚠️ Vérifier PUIS écrire laisse une fenêtre (audit C4) : deux
     * acceptations simultanées passaient toutes deux le contrôle et
     * dépassaient `MAX_AMIS`. On recompte APRÈS avoir lié, et on défait si
     * la limite est franchie. Deux requêtes qui se croisent peuvent alors
     * TOUTES DEUX défaire : c'est un refus de trop, jamais une liste trop
     * longue — le seul sens acceptable pour une limite.
     */
    if ((await depot.amisDe(u.id)).length > MAX_AMIS || (await depot.amisDe(x.id)).length > MAX_AMIS) {
      await depot.delie(u.id, x.id);
      return json({ error: "plein" }, 400);
    }
    await depot.retireDemande(u.id, x.id);
    await depot.retireDemande(x.id, u.id);
    return null;
  };

  if (action === "ajoute") {
    if (code === monCode) return json({ error: "soi" }, 400);
    // Un code inconnu et un compte banni répondent PAREIL : sinon la route
    // dirait à qui essaie des codes lesquels appartiennent à un banni.
    if (!autre || autre.banniLe) return json({ error: "inconnu" }, 404);
    if ((await depot.amisDe(u.id)).some((a) => a.id === autre.id)) {
      return json(await etat(depot, u, monCode, jour, "lie"));
    }
    // DEUX DEMANDES CROISÉES VALENT ACCORD : l'autre m'a déjà demandé, je
    // tape son code — nous voulons la même chose, inutile d'attendre.
    if ((await depot.demandesVers(u.id)).some((a) => a.id === autre.id)) {
      const refus = await lieSiPlace(autre);
      return refus ?? json(await etat(depot, u, monCode, jour, "lie"));
    }
    const envoyees = await depot.demandesDe(u.id);
    if (!envoyees.some((a) => a.id === autre.id)) {
      if (envoyees.length >= MAX_DEMANDES) return json({ error: "plein" }, 400);
      if ((await depot.demandesVers(autre.id)).length >= MAX_DEMANDES) return json({ error: "plein" }, 400);
      await depot.demande(u.id, autre.id);
    }
    /*
     * ⚠️ DEUX DEMANDES CROISÉES ET SIMULTANÉES (audit C4). Chacun a vu
     * « aucune demande reçue » avant que l'autre n'écrive la sienne : sans ce
     * second regard, elles restaient toutes deux en attente, alors que la
     * règle dit que deux demandes croisées valent accord.
     */
    if ((await depot.demandesVers(u.id)).some((a) => a.id === autre.id)) {
      const refus = await lieSiPlace(autre);
      return refus ?? json(await etat(depot, u, monCode, jour, "lie"));
    }
    return json(await etat(depot, u, monCode, jour, "demande"));
  }

  if (action === "accepte") {
    // On n'accepte que ce qu'on a REÇU : sinon « accepter » un code serait
    // exactement l'ajout sans consentement qu'on vient de retirer.
    if (!autre || !(await depot.demandesVers(u.id)).some((a) => a.id === autre.id)) {
      return json({ error: "inconnu" }, 404);
    }
    const refus = await lieSiPlace(autre);
    return refus ?? json(await etat(depot, u, monCode, jour, "lie"));
  }

  if (action === "refuse") {
    if (autre) await depot.retireDemande(autre.id, u.id);
    return json(await etat(depot, u, monCode, jour));
  }

  if (action === "annule") {
    if (autre) await depot.retireDemande(u.id, autre.id);
    return json(await etat(depot, u, monCode, jour));
  }

  if (action === "retire") {
    if (autre) await depot.delie(u.id, autre.id);
    return json(await etat(depot, u, monCode, jour));
  }

  return json({ error: "action inconnue" }, 404);
}

export default (req: Request): Promise<Response> =>
  traite(req, process.env as Record<string, string | undefined>);
