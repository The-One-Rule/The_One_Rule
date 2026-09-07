/**
 * Duel asynchrone.
 *
 * Un vrai 1v1 temps réel exigerait de trouver un adversaire de niveau en
 * moins de quinze secondes. Avec la population d'un lancement, la file est
 * vide et le mode meurt en trois jours.
 *
 * On enregistre donc le run : la graine, la règle, et l'instant auquel chaque
 * manche a été franchie. L'adversaire rejoue exactement la même partie avec
 * cette progression affichée à côté de la sienne, en direct. La sensation est
 * à peu près celle d'un duel, et ça fonctionne dès le premier joueur, sans
 * serveur, sans compte et sans appariement.
 *
 * Le tout tient dans une URL.
 */

import { ONE_RULES } from "../engine/rules";
import type { OneRule } from "../engine/types";

export interface Replay {
  /** version du format, pour pouvoir migrer sans casser les vieux liens */
  v: 1;
  /** graine du run — identique pour les deux joueurs */
  seed: number;
  ruleId: string;
  /** instants cumulés, en ms, auxquels chaque manche a été franchie */
  splits: number[];
  /** pseudo court, facultatif */
  who?: string;
}

const B36 = 36;

/**
 * Plafond de manches dans un lien de défi.
 *
 * Le run du jour en fait 40 ; l'entraînement peut aller plus loin, mais pas
 * de trois ordres de grandeur. 500 laisse toute la marge d'un run réel et
 * ferme la porte à un lien fabriqué.
 */
const MAX_SPLITS = 500;

/* base64url sans dépendance, robuste à l'UTF-8 */
const toB64 = (s: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromB64 = (s: string): string => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/**
 * Les splits sont stockés en DELTAS et au centième de seconde.
 * Un run de 40 manches passe ainsi d'environ 300 caractères à moins de 120 —
 * l'URL doit tenir dans un message sans être tronquée par le client.
 */
export function encodeReplay(r: Replay): string {
  const deltas: string[] = [];
  let prev = 0;
  for (const s of r.splits) {
    deltas.push(Math.max(0, Math.round((s - prev) / 10)).toString(B36));
    prev = s;
  }
  const who = (r.who ?? "").slice(0, 12).replace(/[|]/g, "");
  return toB64(["1", r.seed.toString(B36), r.ruleId, who, deltas.join(".")].join("|"));
}

export function decodeReplay(payload: string): Replay | null {
  try {
    const parts = fromB64(payload).split("|");
    if (parts.length < 5 || parts[0] !== "1") return null;

    const seed = parseInt(parts[1]!, B36);
    const ruleId = parts[2]!;
    if (!Number.isFinite(seed) || !ONE_RULES.some((r) => r.id === ruleId)) return null;

    const splits: number[] = [];
    let acc = 0;
    const deltas = parts[4]!.split(".");
    // Un run honnête ne dépasse pas MAX_SPLITS manches. Le fragment d'URL, lui,
    // accepte des mégaoctets : sans plafond, un lien forgé fait construire un
    // tableau immense au destinataire, que `ghostLevelAt` parcourt à CHAQUE
    // image. Le jeu se fige chez celui qui a cliqué, sans rien avoir fait.
    if (deltas.length > MAX_SPLITS) return null;
    for (const d of deltas) {
      if (d === "") continue;
      const n = parseInt(d, B36);
      if (!Number.isFinite(n) || n < 0) return null;
      acc += n * 10;
      splits.push(acc);
    }
    // un run doit progresser : des splits non croissants signalent un lien trafiqué
    for (let i = 1; i < splits.length; i++) if (splits[i]! < splits[i - 1]!) return null;

    return { v: 1, seed, ruleId, splits, who: parts[3] || undefined };
  } catch {
    return null;
  }
}

export const ruleOfReplay = (r: Replay): OneRule | undefined =>
  ONE_RULES.find((x) => x.id === r.ruleId);

/** Niveau atteint par le fantôme à l'instant `ms` du run. */
export function ghostLevelAt(r: Replay, ms: number): number {
  let n = 0;
  while (n < r.splits.length && r.splits[n]! <= ms) n++;
  return n;
}

export const ghostFinal = (r: Replay): number => r.splits.length;

/** Le fantôme s'est-il arrêté ? (sa dernière manche est derrière nous) */
export const ghostDone = (r: Replay, ms: number): boolean =>
  r.splits.length === 0 || ms > r.splits[r.splits.length - 1]!;

export function challengeUrl(r: Replay): string {
  /*
   * ⚠️ LA RACINE, PAS L'ÉCRAN COURANT — voir `inviteUrl`. Un défi se copie
   * depuis l'écran de FIN, dont l'adresse est « /fin » : le lien aurait
   * emmené l'ami sur un écran de fin sans run, c'est-à-dire un cadre vide.
   */
  const base = typeof location !== "undefined" ? location.origin + "/" : "";
  return `${base}#d=${encodeReplay(r)}`;
}

/** Lit un défi dans le fragment d'URL, puis le retire de la barre d'adresse. */
export function readChallenge(): Replay | null {
  if (typeof location === "undefined") return null;
  const m = /[#&]d=([A-Za-z0-9\-_]+)/.exec(location.hash);
  if (!m) return null;
  const replay = decodeReplay(m[1]!);
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch {
    /* environnement sans history */
  }
  return replay;
}
