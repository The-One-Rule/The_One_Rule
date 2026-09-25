/**
 * LES AMIS — côté client.
 *
 * Même contrat que le reste de `compte/` : aucune fonction ne lève, un échec
 * rend `null` ou une cause, et rien de ce qui est ici n'est sur un chemin de
 * jeu (décision n°12). Sans compte, l'écran montre une invitation ; sans
 * comptes au déploiement, il se tait.
 */
import { cleanEnv } from "../env";
import { codeAmiValide } from "../../shared/amis";
import type { LigneAmi } from "../../shared/amis";
import { compte } from "./index";

const POINT = cleanEnv(import.meta.env.VITE_AMIS_URL as string | undefined) ?? "/api/amis";

export interface Cercle {
  code: string;
  jour: number;
  amis: LigneAmi[];
}

/** Ce qui peut empêcher d'ajouter un ami — chacune a sa phrase à l'écran. */
export type RefusAmi = "code" | "soi" | "inconnu" | "plein" | "reseau";

async function appel(
  methode: "GET" | "POST",
  action?: string,
  corps?: unknown,
): Promise<{ ok: true; cercle: Cercle } | { ok: false; refus: RefusAmi }> {
  const jeton = compte()?.jeton;
  if (!jeton) return { ok: false, refus: "reseau" };
  try {
    const r = await fetch(action ? `${POINT}?a=${action}` : POINT, {
      method: methode,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton}` },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    const j = (await r.json().catch(() => ({}))) as Partial<Cercle> & { error?: string };
    if (r.ok && typeof j.code === "string" && Array.isArray(j.amis)) {
      return { ok: true, cercle: { code: j.code, jour: Number(j.jour), amis: j.amis } };
    }
    const e = j.error;
    return { ok: false, refus: e === "code" || e === "soi" || e === "inconnu" || e === "plein" ? e : "reseau" };
  } catch {
    return { ok: false, refus: "reseau" };
  }
}

/** Son cercle, ou `null` : hors ligne, anonyme, déploiement sans comptes. */
export async function cercle(): Promise<Cercle | null> {
  const r = await appel("GET");
  return r.ok ? r.cercle : null;
}

/**
 * Ajoute un ami. Le code est relu ICI d'abord : une faute de frappe se dit
 * sans aller-retour, et avec la même phrase que le serveur aurait rendue.
 */
export async function ajouteAmi(saisie: string): Promise<{ ok: true; cercle: Cercle } | { ok: false; refus: RefusAmi }> {
  const code = codeAmiValide(saisie);
  if (!code) return { ok: false, refus: "code" };
  return appel("POST", "ajoute", { code });
}

export async function retireAmi(code: string): Promise<Cercle | null> {
  const r = await appel("POST", "retire", { code });
  return r.ok ? r.cercle : null;
}
