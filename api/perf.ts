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
 * Cette route REMPLIT la table (POST) et en SERT le classement (GET ?a=top).
 * Les deux vivent ici parce qu'ils partagent la clé de comparabilité : les
 * séparer aurait fait exister deux endroits où l'écrire, et deux endroits où
 * se tromper.
 *
 * ⚠️ LA LIMITE DE FOND N'A PAS DISPARU. `verifyRun` prouve qu'un journal est
 * COHÉRENT, pas qu'un humain l'a produit : la graine du jour étant publique et
 * déterministe, on peut chercher un journal optimal hors ligne et y injecter
 * des délais d'apparence humaine. Le classement QUOTIDIEN borne le mal — une
 * graine ne vaut d'être forgée que 24 h, et la contrainte d'unicité de la
 * table impose une soumission par compte et par jour. Un classement permanent
 * n'aurait pas cette borne, et c'est pourquoi il n'en existe pas.
 */

import { verifyRun } from "../src/engine/verify";
import type { LoggedInput, RunClaim } from "../src/engine/verify";
import { analyseReactions } from "../src/ranked/antibot";
import { dailySeed, ruleOfDay } from "../src/game/daily";
import { cleDuJour } from "../src/game/perfs";
import { VERSION_CONTENU } from "../src/engine/version";
import { consomme } from "./_debit";
import { depotConfigure } from "./_depot";
import type { Depot, Perf } from "./_depot";
import { jetonDeLaRequete, verifieJeton } from "./_jeton";
import { cleanEnv } from "../src/env";

export const config = { runtime: "edge" };

/** Même plafond que `api/ranked.ts` : un journal de 40 manches y tient large. */
const MAX_BODY = 120_000;

/**
 * TROIS, et un plafond bas.
 *
 * Le podium s'arrête au troisième parce qu'un classement mondial complet n'est
 * pas défendable ici : la graine du jour est forgeable hors ligne, et une liste
 * longue multiplie les places qui valent d'être forgées. Trois places, un rang
 * personnel, et la comparaison redevient sociale plutôt que technique.
 *
 * Le plafond borne aussi ce qu'un appelant peut réclamer : sans lui, `?n=10000`
 * ferait payer à la base une requête que personne n'a demandée.
 */
const TOP_DEFAUT = 3;
const TOP_MAX = 20;

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

  /* ------------------------------------------------------------------ *
   * LE CLASSEMENT DU JOUR — lecture
   *
   * Le jeton est FACULTATIF ici, et c'est délibéré : le podium se regarde sans
   * compte, comme le jeu se joue sans compte (décision n°12). Un jeton valide
   * ajoute seulement deux choses — sa propre ligne marquée dans le podium, et
   * son rang quand on n'y est pas.
   * ------------------------------------------------------------------ */
  if (req.method === "GET" && new URL(req.url).searchParams.get("a") === "top") {
    const url = new URL(req.url);
    /*
     * ⚠️ `Number("")` VAUT ZERO, ET `??` NE LE VOIT PAS.
     *
     * `searchParams.get` rend la chaine VIDE pour `?jour=`, pas `null` : le
     * `??` ne se declenche donc pas, et `Number("")` donne 0 — un entier
     * valide. La route servait alors le classement du jour 0 (le 1er janvier
     * 2026), c'est-a-dire un tableau vide, sans jamais signaler d'erreur. Une
     * mauvaise reponse silencieuse est pire qu'un 400.
     */
    const brutJour = url.searchParams.get("jour");
    const jour = brutJour === null || brutJour === "" ? jourDe(maintenant) : Number(brutJour);
    if (!Number.isInteger(jour)) return json({ error: "jour" }, 400);

    /*
     * ⚠️ ET `Math.max(1, Math.min(N, NaN))` VAUT NaN.
     *
     * `?n=abc` donnait NaN, que les deux bornes laissent passer telles quelles
     * — `Math.min` et `Math.max` propagent NaN. La limite partait donc NaN
     * jusqu'au depot : `LIMIT NaN` cote Supabase, `slice(0, NaN)` en memoire,
     * soit un classement vide dans un cas et une requete refusee dans l'autre.
     * On borne donc APRES avoir verifie que c'est un nombre.
     */
    const brutN = Number(url.searchParams.get("n") ?? TOP_DEFAUT);
    const limite = Number.isFinite(brutN)
      ? Math.max(1, Math.min(TOP_MAX, Math.trunc(brutN)))
      : TOP_DEFAUT;
    const cle = cleDuJour(jour);

    // Un jeton illisible ou périmé ne fait PAS échouer la lecture : il rend
    // simplement le classement anonyme. Absent vaut anonyme, partout.
    const r = await verifieJeton(jetonDeLaRequete(req), secret, maintenant);
    const moiId = r?.sub;

    const top = await depot.classement(cle, limite, moiId);
    let moi: { rang: number; valeur: number; valeur2: number } | null = null;
    if (moiId && !top.some((e) => e.moi)) {
      /*
       * Hors du podium : on ne calcule son rang que dans ce cas.
       *
       * Un joueur qui EST dans le podium y lit déjà son rang ; lancer le
       * comptage quand même doublerait les requêtes de tous ceux qu'on veut
       * justement récompenser.
       */
      const miennes = (await depot.mesPerfs(moiId, 40)).find((x) => x.cle === cle);
      if (miennes) {
        moi = {
          rang: await depot.rangDe(cle, miennes.valeur, miennes.valeur2),
          valeur: miennes.valeur,
          valeur2: miennes.valeur2,
        };
      }
    }
    return json({ jour, top, moi });
  }

  /* ------------------------------------------------------------------ *
   * LA RÉPARTITION DU JOUR — lecture, anonyme
   *
   * Sert le rang anonyme du rival (`game/rival.ts`). Des SCORES et rien
   * d'autre : aucun pseudo, aucune durée, aucun identifiant — un score nu ne
   * désigne personne. Sans jeton, comme le podium (n°12).
   * ------------------------------------------------------------------ */
  if (req.method === "GET" && new URL(req.url).searchParams.get("a") === "repartition") {
    const brutJour = new URL(req.url).searchParams.get("jour");
    const jour = brutJour === null || brutJour === "" ? jourDe(maintenant) : Number(brutJour);
    if (!Number.isInteger(jour)) return json({ error: "jour" }, 400);
    const scores = await depot.scoresDuJour(cleDuJour(jour));
    return json({ jour, scores });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);

  const r = await verifieJeton(jetonDeLaRequete(req), secret, maintenant);
  if (!r) return json({ error: "jeton" }, 401);

  const u = await depot.parId(r.sub);
  if (!u || u.supprimeLe) return json({ error: "inconnu" }, 401);
  if (u.banniLe) return json({ error: "banni" }, 403);
  if (u.versionJeton !== r.vj) return json({ error: "revoque" }, 401);

  const debit = await consomme(env, "perf", u.id);
  if (!debit.ok) return json({ error: "trop de requetes" }, 429);

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

  /*
   * Ce que l'appareil savait jouer. Chaque drapeau n'est lu que s'il vaut
   * exactement `false` : absent ou douteux vaut « clavier, maintien, encre »,
   * c'est-à-dire le rejeu d'avant. Le déclarer ne donne aucun avantage — il
   * change les manches rejouées, pas leur difficulté.
   */
  const cap = (corps.capacites ?? {}) as Record<string, unknown>;
  const claim: RunClaim = {
    seed: graine,
    ruleId: regle.id,
    mode: "daily",
    inputs: (corps.inputs ?? []) as LoggedInput[],
    capacites: {
      clavier: cap.clavier !== false,
      maintien: cap.maintien !== false,
      encre: cap.encre !== false,
      lettres: cap.lettres !== false,
    },
    // Seules valeurs connues ; tout le reste vaut l'ancien catalogue.
    catalogue: corps.catalogue === 3 ? 3 : corps.catalogue === 2 ? 2 : undefined,
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

  /*
   * Le cumul de suspicion.
   *
   * On n'écarte PAS le run et on ne sanctionne personne : `analyseReactions`
   * est un test statistique, et un joueur exceptionnel peut le déclencher.
   * On compte, c'est tout — un tricheur occasionnel finit par se voir, et la
   * décision reste humaine. C'est aussi ce qui permettra de choisir plus tard
   * en regardant des chiffres plutôt qu'en devinant.
   */
  if (bot.verdict !== "humain") {
    await depot.leveDrapeau(u.id).catch(() => undefined);
  }

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
