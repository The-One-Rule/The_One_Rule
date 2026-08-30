/**
 * Enregistrement d'une performance — fonction edge Vercel.
 *
 * PRINCIPE, hérité de `api/ranked.ts` : le serveur ne fait jamais confiance à
 * un score. Il reçoit un JOURNAL D'ENTRÉES, le rejoue avec le moteur pur, et
 * le score est ce que le rejeu produit. C'est pour ça que `src/engine/` n'a
 * jamais eu le droit de toucher au DOM ni à l'horloge.
 *
 * SEUL LE RUN DU JOUR EST ACCEPTÉ, et ce n'est pas une limitation temporaire :
 *
 *   · c'est le seul mode dont deux résultats se comparent directement — même
 *     graine, même règle, même suite de manches pour tout le monde ;
 *   · l'escalade demanderait d'étendre `verify.ts` aux PILES de règles, et de
 *     transmettre le filtre de capacités de l'appareil, qui change la pile
 *     tirée. C'est un chantier, pas un paramètre ;
 *   · l'entraînement se joue à allure libre : un chiffre y est un record
 *     personnel, jamais une performance opposable ;
 *   · le multijoueur n'est pas classable tant que les salons sont privés à
 *     code — deux amis y produisent cent victoires en une soirée.
 *
 * Escalade et entraînement continuent donc de vivre dans les AGRÉGATS
 * (`api/moi.ts`), explicitement non vérifiables et réservés au joueur
 * lui-même. Les deux chemins ne doivent pas se confondre : c'est ce qui
 * garantit qu'un futur classement ne partira pas de faits invérifiables.
 *
 * ⚠️ Aucun classement n'est servi ici. Cette route REMPLIT la table ; rien ne
 * la lit encore hormis l'historique personnel de son propre auteur.
 */

import { verifyRun } from "../src/engine/verify";
import type { LoggedInput, RunClaim } from "../src/engine/verify";
import { analyseReactions } from "../src/ranked/antibot";
import { dailySeed, ruleOfDay } from "../src/game/daily";
import { cleDuJour } from "../src/game/perfs";
import { VERSION_CONTENU } from "../src/engine/version";
import { depotConfigure } from "./_depot";
import type { Depot, Perf } from "./_depot";
import { jetonDeLaRequete, verifieJeton } from "./_jeton";
import { cleanEnv } from "../src/env";

export const config = { runtime: "edge" };

/** Même plafond que `api/ranked.ts` : un journal de 40 manches y tient large. */
const MAX_BODY = 120_000;

/**
 * Fenêtre d'acceptation, en jours.
 *
 * On refuse un jour futur — sinon n'importe qui calcule la graine de demain
 * (elle est déterministe et publique) et joue son run à l'avance, tranquille.
 * On tolère deux jours de retard : un joueur peut finir son run juste après
 * minuit UTC, ou l'avoir gardé dans sa file d'attente hors ligne.
 */
const RETARD_MAX = 2;

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** L'index de jour courant, en UTC — la même origine que `game/daily.ts`. */
const EPOCH = Date.UTC(2026, 0, 1);
const jourDe = (maintenant: number): number =>
  Math.floor((Date.UTC(
    new Date(maintenant).getUTCFullYear(),
    new Date(maintenant).getUTCMonth(),
    new Date(maintenant).getUTCDate(),
  ) - EPOCH) / 86_400_000);

export async function traite(
  req: Request,
  env: Record<string, string | undefined>,
  depotInjecte?: Depot,
  maintenant: number = Date.now(),
): Promise<Response> {
  const secret = cleanEnv(env.TOR_AUTH_SECRET);
  const depot = depotInjecte ?? depotConfigure(env);
  if (!secret || !depot) return json({ disponible: false }, 503);
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const r = await verifieJeton(jetonDeLaRequete(req), secret, maintenant);
  if (!r) return json({ error: "jeton" }, 401);

  const u = await depot.parId(r.sub);
  if (!u || u.supprimeLe) return json({ error: "inconnu" }, 401);
  if (u.banniLe) return json({ error: "banni" }, 403);
  if (u.versionJeton !== r.vj) return json({ error: "revoque" }, 401);

  const brut = await req.text();
  if (brut.length > MAX_BODY) return json({ error: "too large" }, 413);
  let corps: Record<string, unknown>;
  try {
    corps = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    return json({ error: "bad json" }, 400);
  }

  if (corps.mode !== "daily") return json({ error: "mode non enregistrable" }, 400);

  /* --- le jour, et ce qu'il impose --- */
  const jour = Number(corps.jour);
  if (!Number.isInteger(jour)) return json({ error: "jour" }, 400);
  const aujourdhui = jourDe(maintenant);
  if (jour > aujourdhui) return json({ error: "jour futur" }, 400);
  if (aujourdhui - jour > RETARD_MAX) return json({ error: "jour trop ancien" }, 400);

  /*
   * La graine et la règle ne sont PAS lues du corps : elles se recalculent.
   *
   * Les accepter du client laisserait choisir sa partie — essayer des graines
   * jusqu'à en trouver une facile, puis annoncer celle-là. Le run du jour n'a
   * de sens que parce qu'il est identique pour tout le monde (décision n°11
   * de CLAUDE.md), et c'est ici que cette propriété se défend.
   */
  const graine = dailySeed(jour);
  const regle = ruleOfDay(jour);

  const claim: RunClaim = {
    seed: graine,
    ruleId: regle.id,
    mode: "daily",
    inputs: (corps.inputs ?? []) as LoggedInput[],
  };

  const v = verifyRun(claim);
  if (!v.ok) return json({ error: "run invalide", raison: v.reason }, 400);

  /*
   * Le contrôle d'automatisation tourne sur les délais issus du REJEU, jamais
   * sur des chiffres envoyés par le client.
   *
   * ⚠️ Sa portée est limitée, et il faut le dire : il repère un script qui
   * joue en direct, pas un journal forgé hors ligne. La graine du jour étant
   * publique et déterministe, quelqu'un peut chercher un journal optimal à
   * l'avance et y injecter des délais d'apparence humaine — `verifyRun`
   * validera, parce que le journal est authentique. Le rejeu prouve la
   * cohérence, pas qu'un humain était là. C'est la limite de fond de tout jeu
   * web, et c'est la raison pour laquelle un classement mondial n'est pas la
   * bonne première forme.
   */
  const bot = analyseReactions(v.reactions);

  const perf: Perf = {
    utilisateurId: u.id,
    mode: "daily",
    cle: cleDuJour(jour),
    versionContenu: VERSION_CONTENU,
    jour,
    graine,
    regle: regle.id,
    valeur: v.score,
    // Le départage : à 40 manches bouclées, c'est la durée qui sépare.
    valeur2: Math.round(v.durationMs),
    verdictBot: bot.verdict,
    creeLe: maintenant,
  };

  const ecrit = await depot.posePerf(perf);

  return json({
    enregistre: ecrit,
    score: v.score,
    cleared: v.cleared,
    cause: v.cause,
    traps: v.trapsSurvived,
    dureeMs: perf.valeur2,
    verdict: bot.verdict,
  });
}

export default (req: Request): Promise<Response> =>
  traite(req, process.env as Record<string, string | undefined>);
