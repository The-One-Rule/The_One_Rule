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
  /**
   * Score du run, pour ne pas jeter un 34 au profit d'un 23.
   *
   * Absent des files écrites avant : sans lui on ne COMPARE pas, on GARDE
   * les deux et `posePerf` départage. Voir `nouveauGagne`.
   */
  valeur?: number;
  /** Durée du run en ms — départage à score égal, même ordre que `posePerf`. */
  valeur2?: number;
  /**
   * Ce que l'appareil savait jouer : sans ça, le serveur rejouait un run de
   * téléphone sur les manches du clavier. Absent des files écrites avant —
   * elles sont rejouées comme avant.
   */
  capacites?: { clavier: boolean; maintien: boolean; encre: boolean; lettres?: boolean };
  /** Le catalogue de consignes du run (voir `RunClaim.catalogue`). */
  catalogue?: number;
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
 * `true` si `nouveau` doit remplacer `ancien`, `false` s'il faut garder
 * `ancien`, `null` si on ne peut pas trancher — alors on garde les deux et
 * `posePerf` départage.
 *
 * Même ordre que `posePerf` : score décroissant, puis durée croissante.
 */
export function nouveauGagne(nouveau: Envoi, ancien: Envoi): boolean | null {
  if (nouveau.valeur == null || ancien.valeur == null) return null;
  if (nouveau.valeur !== ancien.valeur) return nouveau.valeur > ancien.valeur;
  if (nouveau.valeur2 == null || ancien.valeur2 == null) return null;
  if (nouveau.valeur2 !== ancien.valeur2) return nouveau.valeur2 < ancien.valeur2;
  return false;
}

function memeCase(a: Envoi, b: Envoi): boolean {
  return a.mode === b.mode && a.jour === b.jour;
}

function empreinte(e: Envoi): string {
  return `${e.mode}|${e.jour}|${e.pose}|${e.inputs.length}|${e.valeur ?? ""}|${JSON.stringify(e.inputs)}`;
}

/**
 * Une case (mode+jour) ne garde que le MEILLEUR journal, dès qu'on peut
 * comparer. Incomparables : on les laisse tous — envoyer un 23 par-dessus
 * un 34 sans score connu les ferait tous les deux partir, et `posePerf`
 * retient le meilleur.
 */
function fusionneMeilleurs(liste: Envoi[]): Envoi[] {
  const out: Envoi[] = [];
  for (const e of liste) {
    const i = out.findIndex((x) => memeCase(x, e));
    if (i < 0) {
      out.push(e);
      continue;
    }
    const gagne = nouveauGagne(e, out[i]!);
    if (gagne === true) out[i] = e;
    else if (gagne === null) out.push(e);
  }
  return out;
}

/**
 * Met un run en file.
 *
 * Appelée même quand le joueur n'a PAS de compte : s'il en crée un dans la
 * foulée — et c'est exactement le moment où l'invitation le lui propose — son
 * run part au premier vidage. Sans ça, l'invitation lui promettrait
 * d'enregistrer une performance déjà perdue.
 *
 * ⚠️ ON NE REMPLACE PAS UN 34 PAR UN 23. L'ancienne version jetait toute
 * entrée du même jour pour pousser la dernière : le troisième essai raté
 * effaçait le journal du meilleur, et `vide()` après connexion posait 23.
 */
export function enfile(e: Envoi): void {
  ecrit(fusionneMeilleurs([...lit(), e]));
}

export interface Resultat {
  enregistre: boolean;
  score: number;
  cleared: boolean;
  dureeMs: number;
  verdict: string;
  /**
   * POURQUOI LE SERVEUR A REFUSÉ — un vrai refus seulement.
   *
   * Un 4xx (journal invalide, jour trop ancien) porte ce champ. Un 200
   * `enregistre: false` ne le porte PAS : `posePerf` n'améliore pas, le
   * meilleur est déjà en base, ce n'est pas une perte.
   */
  refus?: string;
}

/**
 * Un 200 `enregistre: false` n'est PAS un refus.
 *
 * Recoller `refus = "non enregistre"` sur tout `false` faisait toaster une
 * non-amélioration — le joueur lisait que son 34 était perdu, alors que le
 * serveur gardait déjà un 40, ou le même 34.
 */
export function estRefusReel(r: Resultat): boolean {
  return Boolean(r.refus);
}

/** La promesse en vol — un seul passage à la fois, comme `rafraichitClassement`. */
let enVol: Promise<Resultat[]> | null = null;

/**
 * Vide la file. Renvoie les résultats obtenus.
 *
 * Sans compte, on ne tente rien et on ne jette rien : la file attend.
 *
 * Un refus du serveur (400) RETIRE l'entrée — le run est invalide ou trop
 * ancien, le réessayer indéfiniment ne ferait que garder une file pleine. Une
 * panne réseau, elle, la conserve : la distinction est tout l'intérêt d'avoir
 * une file plutôt qu'un envoi.
 *
 * ⚠️ UN SEUL PASSAGE À LA FOIS. Deux `vide()` dans le même lot de microtâches
 * liraient la même file, l'enverraient deux fois, et le second `ecrit(restants)`
 * écraserait une `enfile` arrivée entre-temps.
 */
export function vide(): Promise<Resultat[]> {
  if (!compte()) return Promise.resolve([]);
  if (enVol) return enVol;
  enVol = videUne().finally(() => {
    enVol = null;
  });
  return enVol;
}

async function videUne(): Promise<Resultat[]> {
  const f = lit();
  if (!f.length) return [];

  const lot = new Set(f.map(empreinte));
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
        body: JSON.stringify({ mode: e.mode, jour: e.jour, inputs: e.inputs, capacites: e.capacites, catalogue: e.catalogue }),
      });
      if (res.ok) {
        const r = (await res.json()) as Resultat;
        // ⚠️ On ne recolle PAS un refus sur `enregistre: false` : c'est
        // `posePerf` qui n'améliore pas, pas un rejet.
        resultats.push(r);
        continue; // envoyé : on ne le remet pas
      }
      // 4xx = ce run ne sera jamais accepté. 5xx et le reste = on réessaiera.
      if (res.status >= 500 || res.status === 401) {
        restants.push(e);
      } else {
        /*
         * ⚠️ ON JETTE, MAIS ON LE DIT. Le run est refusé pour de bon — journal
         * incohérent, jour trop ancien, mode non enregistrable. Le laisser
         * partir sans un mot, c'est perdre le score de quelqu'un en silence.
         */
        let raison = `HTTP ${res.status}`;
        try {
          const b = (await res.json()) as { error?: string; raison?: string };
          raison = b.raison ?? b.error ?? raison;
        } catch {
          /* corps illisible : le code de statut suffira */
        }
        resultats.push({
          enregistre: false,
          score: 0,
          cleared: false,
          dureeMs: 0,
          verdict: "",
          refus: raison,
        });
      }
    } catch {
      restants.push(e); // hors ligne
    }
  }

  /*
   * Relire AVANT d'écrire : une `enfile` pendant le fetch n'est pas dans
   * `restants`, et un `ecrit(restants)` seul l'écraserait.
   */
  const reprises = lit().filter((x) => !lot.has(empreinte(x)));
  ecrit(fusionneMeilleurs([...restants, ...reprises]));
  return resultats;
}

/** Tests et diagnostic. */
export const enAttente = (): number => lit().length;

/** Tests : ce que la file enverrait, sans la vider. */
export const fileCourante = (): Envoi[] => lit().map((e) => ({ ...e, inputs: e.inputs.slice() }));
