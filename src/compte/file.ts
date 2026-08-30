/**
 * La file d'envoi des performances — PERSISTÉE.
 *
 * C'est la différence avec `src/analytics/`, et elle est structurante : la
 * file d'événements de mesure vit en mémoire, parce que perdre un événement
 * est sans conséquence. Perdre le run du jour de quelqu'un ne l'est pas. Le
 * joueur ferme l'onglet dans la seconde qui suit la fin d'un run — c'est même
 * le comportement le plus courant — donc une file en mémoire perdrait
 * exactement les envois qui comptent.
 *
 * Elle vit donc dans `localStorage`, et se vide à la prochaine ouverture.
 *
 * Aucune fonction ne lève. Un envoi impossible n'est pas une défaite : il
 * attend.
 */

import { compte } from "./index";
import { cleanEnv } from "../env";
import type { LoggedInput } from "../engine/verify";

const CLE = "oneRule.envois.v1";
const POINT = cleanEnv(import.meta.env.VITE_PERF_URL as string | undefined) ?? "/api/perf";

/**
 * Plafond de la file.
 *
 * Un run du jour par jour, et on tolère deux jours de retard côté serveur :
 * au-delà de quelques entrées, ce qui reste ne sera de toute façon plus
 * accepté. Le plafond existe pour qu'un `localStorage` ne gonfle pas
 * indéfiniment chez quelqu'un qui joue hors ligne pendant des semaines.
 */
const MAX_FILE = 8;

export interface Envoi {
  mode: "daily";
  jour: number;
  inputs: LoggedInput[];
  /** Horodatage local de la mise en file — sert à jeter ce qui est périmé. */
  pose: number;
}

function lit(): Envoi[] {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return [];
    const a = JSON.parse(brut) as unknown;
    return Array.isArray(a) ? (a as Envoi[]) : [];
  } catch {
    return [];
  }
}

function ecrit(f: Envoi[]): void {
  try {
    if (f.length) localStorage.setItem(CLE, JSON.stringify(f.slice(-MAX_FILE)));
    else localStorage.removeItem(CLE);
  } catch {
    /* navigation privée, ou quota : on joue quand même */
  }
}

/**
 * Met un run en file.
 *
 * Appelée même quand le joueur n'a PAS de compte : s'il en crée un dans la
 * foulée — et c'est exactement le moment où l'invitation le lui propose — son
 * run part au premier vidage. Sans ça, l'invitation lui promettrait
 * d'enregistrer une performance déjà perdue.
 */
export function enfile(e: Envoi): void {
  const f = lit().filter((x) => !(x.mode === e.mode && x.jour === e.jour));
  f.push(e);
  ecrit(f);
}

export interface Resultat {
  enregistre: boolean;
  score: number;
  cleared: boolean;
  dureeMs: number;
  verdict: string;
}

/**
 * Vide la file. Renvoie les résultats obtenus.
 *
 * Sans compte, on ne tente rien et on ne jette rien : la file attend.
 *
 * Un refus du serveur (400) RETIRE l'entrée — le run est invalide ou trop
 * ancien, le réessayer indéfiniment ne ferait que garder une file pleine. Une
 * panne réseau, elle, la conserve : la distinction est tout l'intérêt d'avoir
 * une file plutôt qu'un envoi.
 */
export async function vide(): Promise<Resultat[]> {
  if (!compte()) return [];
  const f = lit();
  if (!f.length) return [];

  const restants: Envoi[] = [];
  const resultats: Resultat[] = [];

  for (const e of f) {
    try {
      const jeton = compte()?.jeton;
      if (!jeton) {
        restants.push(e);
        continue;
      }
      const res = await fetch(POINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ mode: e.mode, jour: e.jour, inputs: e.inputs }),
      });
      if (res.ok) {
        resultats.push((await res.json()) as Resultat);
        continue; // envoyé : on ne le remet pas
      }
      // 4xx = ce run ne sera jamais accepté. 5xx et le reste = on réessaiera.
      if (res.status >= 500 || res.status === 401) restants.push(e);
    } catch {
      restants.push(e); // hors ligne
    }
  }

  ecrit(restants);
  return resultats;
}

/** Tests et diagnostic. */
export const enAttente = (): number => lit().length;
