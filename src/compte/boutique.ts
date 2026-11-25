/**
 * La boutique du COMPTE — le service client de `api/boutique.ts`.
 *
 * Même doctrine que le reste de `src/compte/` : AUCUNE fonction ne lève, une
 * panne ou une absence de compte rend `null`, et le jeu continue exactement
 * comme avant (décision n°12). Les formes viennent de `shared/boutique.ts`, la
 * même source que la route : le client et le serveur lisent une réponse avec
 * la même fonction.
 *
 * ⚠️ AUCUN ÉCRAN NE L'APPELLE, et c'est une décision (25/11/2026), pas un oubli. La
 * boutique que le jeu lit est celle de l'APPAREIL (`st.coins`,
 * `st.boutique`) ; faire du compte la source du solde est un choix de produit
 * qui a un coût écrit dans docs/BASE-DE-DONNEES.md (§ « Ce qui reste à
 * trancher ») — en particulier, une monnaie qui DÉCROÎT ne fusionne pas par
 * maximum comme le carnet. Ce module est la porte ; l'ouvrir est un geste à
 * part.
 */

import { cleanEnv } from "../env";
import {
  appareilValide,
  codeSkinValide,
  litEtatBoutique,
  litReponseAchat,
} from "../../shared/boutique";
import type { EtatBoutiqueCompte, ReponseAchat, ReponseImport } from "../../shared/boutique";
import { compte } from "./index";

const POINT = cleanEnv(import.meta.env.VITE_BOUTIQUE_URL as string | undefined) ?? "/api/boutique";

async function appel(chemin: string, corps?: unknown): Promise<Record<string, unknown> | null> {
  try {
    const jeton = compte()?.jeton;
    if (!jeton) return null;
    const res = await fetch(`${POINT}${chemin}`, {
      method: corps === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton}` },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    // Un refus d'ACHAT est une issue (200) ; tout autre statut est une panne.
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Le solde et les styles du compte, ou `null` (anonyme, hors ligne, sans comptes). */
export async function boutiqueDuCompte(): Promise<EtatBoutiqueCompte | null> {
  const r = await appel("");
  return r ? litEtatBoutique(r.boutique) : null;
}

/**
 * Une clé d'achat neuve. À GARDER le temps de l'achat : c'est en la rejouant
 * telle quelle, après une coupure, qu'on obtient le même achat et non un
 * second débit.
 */
export const nouvelleCleAchat = (): string => crypto.randomUUID();

/** Achète un style sur le compte. `null` = pas de réponse (à retenter avec la MÊME clé). */
export async function acheteSurLeCompte(skin: string, cle: string): Promise<ReponseAchat | null> {
  if (!codeSkinValide(skin)) return null;
  const r = await appel("?a=achete", { skin, cle });
  return r ? litReponseAchat(r.achat) : null;
}

/** Porte un style possédé par le compte. */
export async function porteSurLeCompte(skin: string): Promise<EtatBoutiqueCompte | null> {
  if (!codeSkinValide(skin)) return null;
  const r = await appel("?a=porte", { skin });
  return r ? litEtatBoutique(r.boutique) : null;
}

/**
 * Fait entrer le portefeuille de CET appareil dans le compte. Le serveur ne
 * le crédite qu'une fois par appareil : rappeler ne double rien.
 */
export async function importeAppareil(
  appareil: string,
  pieces: number,
  possedes: readonly string[],
): Promise<ReponseImport | null> {
  if (!appareilValide(appareil)) return null;
  const r = await appel("?a=importe", { appareil, pieces, possedes });
  if (!r || !r.import || typeof r.import !== "object") return null;
  const i = r.import as Record<string, unknown>;
  const etat = litEtatBoutique(i);
  const issue = i.issue === "ok" || i.issue === "deja" ? i.issue : "inconnu";
  return etat ? { ...etat, issue } : null;
}
