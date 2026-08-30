/**
 * L'URI de retour du fournisseur — et sa seule raison d'exister.
 *
 * Google REFUSE d'enregistrer une URI de redirection qui porte une query
 * string : la console répond « Invalid Redirect: cannot contain a query
 * string » et il n'y a aucun contournement côté client. Or tout le reste de
 * `api/auth.ts` s'adresse par `?a=…`, ce qui donnait
 * `…/api/auth?a=callback` — impossible à déclarer.
 *
 * D'où ce point d'entrée dédié, sans paramètre : `…/api/authcb`. Il ne fait
 * rien d'autre que rappeler `traite` avec l'action forcée, pour qu'il n'existe
 * qu'UNE implémentation du retour. Un second chemin qui referait le travail
 * finirait par diverger — et le symptôme serait une connexion qui marche chez
 * l'un et pas chez l'autre.
 *
 * `?a=callback` reste accepté sur `api/auth.ts` : c'est le chemin que les
 * tests exercent, et le retirer ne gagnerait rien.
 */

import { traite } from "./auth";

export const config = { runtime: "edge" };

export default (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  url.searchParams.set("a", "callback");
  // La requête est un GET sans corps : la reconstruire sur une nouvelle URL
  // est sans effet de bord.
  return traite(new Request(url, req), process.env as Record<string, string | undefined>);
};
