/**
 * Détection d'automatisation.
 *
 * Sur un jeu de réflexes classé, quelqu'un finira par écrire quarante lignes
 * qui lisent l'état du jeu et cliquent en vingt millisecondes. Un bot y est
 * invincible, et sans garde-fou le haut du classement lui appartient en une
 * semaine.
 *
 * La signature est pourtant triviale. Un humain a un temps de réaction visuel
 * qui plancher vers 180-220 ms, une dispersion large, et des ratés. Un script
 * répond en 15-40 ms avec un écart-type minuscule et ne se trompe jamais de
 * rythme. C'est un test statistique, pas une course à l'obfuscation : accélérer
 * le bot le rend plus détectable, le ralentir lui fait perdre son avantage.
 *
 * Module pur : il tourne côté serveur, sur les temps issus du REJEU, jamais
 * sur des chiffres envoyés par le client.
 */

export interface BotReport {
  /** 0 = indiscernable d'un humain, 1 = certitude d'automatisation */
  suspicion: number;
  verdict: "humain" | "douteux" | "automatisé";
  median: number;
  mean: number;
  stdev: number;
  /** coefficient de variation : la dispersion relative, très stable chez l'humain */
  cv: number;
  /** part des réactions sous le plancher physiologique */
  belowFloor: number;
  reasons: string[];
}

/**
 * Plancher physiologique du temps de réaction visuel simple, avec une marge
 * généreuse : on ne veut pas accuser un joueur exceptionnel qui anticipe.
 */
const HUMAN_FLOOR_MS = 140;
const MIN_SAMPLES = 8;

const median = (a: number[]): number => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function analyseReactions(reactions: number[]): BotReport {
  const n = reactions.length;
  if (n < MIN_SAMPLES) {
    return {
      suspicion: 0,
      verdict: "humain",
      median: median(reactions),
      mean: 0,
      stdev: 0,
      cv: 0,
      belowFloor: 0,
      reasons: ["échantillon trop court pour conclure"],
    };
  }

  const mean = reactions.reduce((s, x) => s + x, 0) / n;
  const variance = reactions.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  const cv = mean > 0 ? stdev / mean : 0;
  const med = median(reactions);
  const belowFloor = reactions.filter((r) => r < HUMAN_FLOOR_MS).length / n;

  const reasons: string[] = [];
  let suspicion = 0;

  // 1. Trop rapide, structurellement.
  if (med < HUMAN_FLOOR_MS) {
    suspicion += 0.5;
    reasons.push(`médiane ${Math.round(med)} ms sous le plancher humain`);
  } else if (med < 190) {
    suspicion += 0.18;
    reasons.push(`médiane ${Math.round(med)} ms exceptionnellement basse`);
  }

  // 2. Trop régulier. C'est le signal le plus fiable : l'attention humaine
  //    fluctue toujours, un script non.
  if (cv < 0.1) {
    suspicion += 0.45;
    reasons.push(`dispersion quasi nulle (CV ${cv.toFixed(3)})`);
  } else if (cv < 0.18) {
    suspicion += 0.22;
    reasons.push(`dispersion anormalement faible (CV ${cv.toFixed(3)})`);
  }

  // 3. Une proportion notable de réactions physiquement impossibles.
  if (belowFloor > 0.25) {
    suspicion += 0.35;
    reasons.push(`${Math.round(belowFloor * 100)} % des réactions sous ${HUMAN_FLOOR_MS} ms`);
  }

  // 4. Absence totale de queue lente. Un humain a toujours quelques manches
  //    où il hésite ; leur absence sur un long run est très improbable.
  const slow = reactions.filter((r) => r > med * 1.8).length;
  if (n >= 20 && slow === 0) {
    suspicion += 0.15;
    reasons.push("aucune hésitation sur un run long");
  }

  suspicion = Math.min(1, suspicion);
  const verdict = suspicion >= 0.6 ? "automatisé" : suspicion >= 0.32 ? "douteux" : "humain";
  if (!reasons.length) reasons.push("distribution compatible avec un joueur humain");

  return { suspicion, verdict, median: med, mean, stdev, cv, belowFloor, reasons };
}

/**
 * Un run classé n'est retenu que s'il passe le contrôle.
 *
 * Un « douteux » compte pour le joueur mais n'entre pas dans le vivier des
 * fantômes : on évite de faire affronter à tout le monde un run possiblement
 * truqué, sans pour autant sanctionner sur un doute.
 */
export function rankedEligibility(report: BotReport): {
  countsForRating: boolean;
  servableAsGhost: boolean;
} {
  return {
    countsForRating: report.verdict !== "automatisé",
    servableAsGhost: report.verdict === "humain",
  };
}
