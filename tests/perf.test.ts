/**
 * L'enregistrement d'une performance.
 *
 * Ce que ce fichier défend tient en une phrase : **le client ne choisit ni sa
 * partie, ni son score.**
 *
 * Le score vient du REJEU, jamais du corps de la requête — c'est l'héritage
 * de `api/ranked.ts`. Mais il y a un piège de plus, propre au run du jour :
 * si la graine et la règle étaient lues du corps, n'importe qui pourrait
 * essayer des graines jusqu'à en trouver une facile et annoncer celle-là. Le
 * run du jour n'a de sens que parce qu'il est identique pour tout le monde
 * (décision n°11 de CLAUDE.md), et c'est cette route qui doit le défendre.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { traite } from "../api/perf";
import { DepotMemoire, nouvelId, utilisateurNeuf } from "../api/_depot";
import { signeJeton } from "../server/jeton";
import { mulberry32 } from "../src/engine/rng";
import { buildRound } from "../src/engine/round";
import { DAILY_LENGTH } from "../src/engine/difficulty";
import { dailySeed, ruleOfDay } from "../src/game/daily";
import { cleDuJour } from "../src/game/perfs";
import type { LoggedInput } from "../src/engine/verify";

const ENV = {
  TOR_AUTH_SECRET: "secret-de-test-assez-long-pour-ne-pas-etre-ridicule",
  DATABASE_URL: "postgresql://test@127.0.0.1:1/aucune",
};

/** Le jour 300 tombe le 28 octobre 2026 ; on fige « maintenant » dessus. */
const JOUR = 300;
const MAINTENANT = Date.UTC(2026, 0, 1) + JOUR * 86_400_000 + 12 * 3_600_000;

let depot: DepotMemoire;
let id: string;

beforeEach(async () => {
  depot = new DepotMemoire();
  id = nouvelId();
  await depot.cree(utilisateurNeuf(id, MAINTENANT), { fournisseur: "google", idExterne: "g1" });
});

const jeton = (sur: Record<string, unknown> = {}): string =>
  signeJeton({ sub: id, psd: "", gly: 0, vj: 0, ...sur }, ENV.TOR_AUTH_SECRET, MAINTENANT);

const appel = (corps: unknown, opts: { jeton?: string | null } = {}): Promise<Response> => {
  const j = opts.jeton === undefined ? jeton() : opts.jeton;
  return traite(
    new Request("https://www.theonerule.party/api/perf", {
      method: "POST",
      headers: j ? { Authorization: `Bearer ${j}` } : {},
      body: JSON.stringify(corps),
    }),
    ENV,
    depot,
    MAINTENANT,
  );
};

/**
 * Un joueur qui joue correctement le run d'un jour donné.
 *
 * Repris de `tests/ranked.test.ts` : il obéit à la consigne SANS enfreindre
 * la règle unique, attend 430 ms sous LA SECONDE — qui interdit d'agir avant
 * 400 — et choisit une pièce autorisée sur une consigne libre.
 */
function joueLeJour(jour: number, arrete = DAILY_LENGTH, reaction = 300): LoggedInput[] {
  const seed = dailySeed(jour);
  const rule = ruleOfDay(jour);
  const rng = mulberry32(seed);
  const inputs: LoggedInput[] = [];
  let t = 0;

  for (let level = 0; level < arrete; level++) {
    const round = buildRound(rng, level, rule);
    const attente = Math.max(reaction, rule.id === "seconde" ? 430 : 0);
    const at = t + Math.min(attente, round.durationMs - 40);

    if (round.steps.length === 0) {
      t += round.durationMs;
      continue;
    }
    const permis = (i: number, quand: number): boolean =>
      rule.judge(
        { kind: "click", ent: round.ents[i]!, x: round.ents[i]!.x, y: round.ents[i]!.y },
        { round, elapsedMs: quand - t },
      ) === null;

    let k = 0;
    for (const step of round.steps) {
      const quand = at + k * 40;
      if (step.kind === "click") inputs.push({ t: quand, k: "c", i: step.idx });
      else if (step.kind === "clickAny" || step.kind === "clickAnyExcept") {
        const ok = round.ents.findIndex(
          (e, i) => permis(i, quand) && (step.kind === "clickAny" || e.color !== step.color),
        );
        inputs.push({ t: quand, k: "c", i: ok >= 0 ? ok : 0 });
      } else inputs.push({ t: quand, k: "k", key: (step as { key: string }).key });
      k++;
    }
    t = at + (round.steps.length - 1) * 40 + 1;
  }
  return inputs;
}

const corpsDuJour = (jour = JOUR, arrete = DAILY_LENGTH) => ({
  mode: "daily",
  jour,
  inputs: joueLeJour(jour, arrete),
});

/* ------------------------------------------------------------------ *
 * Accès
 * ------------------------------------------------------------------ */

describe("accès", () => {
  it("sans jeton, rien", async () => {
    expect((await appel(corpsDuJour(), { jeton: null })).status).toBe(401);
  });

  it("sans configuration, la route se déclare indisponible", async () => {
    const res = await traite(
      new Request("https://x.test/api/perf", { method: "POST", body: "{}" }),
      { ...ENV, TOR_AUTH_SECRET: "" },
      depot,
      MAINTENANT,
    );
    expect(res.status).toBe(503);
  });

  it("un jeton révoqué n'enregistre rien", async () => {
    await depot.revoque(id);
    expect((await appel(corpsDuJour())).status).toBe(401);
  });
});

/* ------------------------------------------------------------------ *
 * Le client ne choisit pas sa partie
 * ------------------------------------------------------------------ */

describe("le client ne choisit ni sa graine ni sa règle", () => {
  it("une graine annoncée dans le corps est IGNORÉE", async () => {
    // Sans ce recalcul, il suffirait d'essayer des graines jusqu'à en trouver
    // une facile — et le run du jour ne voudrait plus rien dire.
    const res = await appel({ ...corpsDuJour(), seed: 42, ruleId: "sang" });
    expect(res.status).toBe(200);
    const perfs = await depot.mesPerfs(id, 10);
    expect(perfs[0]!.graine).toBe(dailySeed(JOUR));
    expect(perfs[0]!.regle).toBe(ruleOfDay(JOUR).id);
  });

  it("un journal joué sur une AUTRE graine ne valide pas", async () => {
    // La preuve que le rejeu porte bien sur la graine du jour : un journal
    // parfait pour un autre jour ne peut pas produire un bon score ici.
    const res = await appel({ mode: "daily", jour: JOUR, inputs: joueLeJour(JOUR - 7) });
    const corps = await res.json();
    // Il peut être accepté (le journal est syntaxiquement valide) mais le
    // score du rejeu sera bien plus bas que 40.
    expect(corps.score ?? 0).toBeLessThan(DAILY_LENGTH);
  });

  it("un score annoncé dans le corps n'existe pas", async () => {
    const res = await appel({ ...corpsDuJour(JOUR, 5), score: 9999, valeur: 9999 });
    const corps = await res.json();
    expect(corps.score).toBeLessThanOrEqual(DAILY_LENGTH);
    expect((await depot.mesPerfs(id, 10))[0]!.valeur).toBe(corps.score);
  });
});

/* ------------------------------------------------------------------ *
 * Le jour
 * ------------------------------------------------------------------ */

describe("le jour", () => {
  it("refuse un jour futur", async () => {
    // La graine de demain est calculable : sans ce refus, on jouerait son run
    // à l'avance, tranquillement.
    const res = await appel(corpsDuJour(JOUR + 1));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("jour futur");
  });

  it("refuse un jour trop ancien", async () => {
    const res = await appel(corpsDuJour(JOUR - 5));
    expect(res.status).toBe(400);
  });

  it("tolère deux jours de retard — file hors ligne, ou minuit UTC", async () => {
    expect((await appel(corpsDuJour(JOUR - 1))).status).toBe(200);
    expect((await appel(corpsDuJour(JOUR - 2))).status).toBe(200);
  });

  it("refuse un jour absent ou absurde", async () => {
    for (const jour of [undefined, null, "hier", 1.5, NaN]) {
      const res = await appel({ mode: "daily", jour, inputs: [] });
      expect(res.status, String(jour)).toBe(400);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Modes
 * ------------------------------------------------------------------ */

describe("modes", () => {
  it("n'accepte QUE le run du jour", async () => {
    // Escalade et entraînement vivent dans les agrégats, non vérifiables et
    // réservés au joueur. Les faire entrer ici ferait démarrer un futur
    // classement sur des faits invérifiables.
    for (const mode of ["escalade", "training", "ranked", "multi", undefined]) {
      const res = await appel({ mode, jour: JOUR, inputs: [] });
      expect(res.status, String(mode)).toBe(400);
    }
  });

  it("refuse GET", async () => {
    const res = await traite(
      new Request("https://x.test/api/perf", { headers: { Authorization: `Bearer ${jeton()}` } }),
      ENV,
      depot,
      MAINTENANT,
    );
    expect(res.status).toBe(405);
  });
});

/* ------------------------------------------------------------------ *
 * Écriture
 * ------------------------------------------------------------------ */

describe("écriture", () => {
  it("range la performance sous la clé du jour", async () => {
    await appel(corpsDuJour());
    const p = (await depot.mesPerfs(id, 10))[0]!;
    expect(p.cle).toBe(cleDuJour(JOUR));
    expect(p.mode).toBe("daily");
    expect(p.jour).toBe(JOUR);
    // La durée sert de départage : à 40 manches bouclées, c'est elle qui
    // sépare deux joueurs.
    expect(p.valeur2).toBeGreaterThan(0);
  });

  it("une seule performance par compte et par jour", async () => {
    await appel(corpsDuJour(JOUR, 10));
    await appel(corpsDuJour(JOUR, 20));
    expect((await depot.mesPerfs(id, 10)).filter((p) => p.jour === JOUR)).toHaveLength(1);
  });

  it("garde la MEILLEURE, jamais la dernière", async () => {
    const bon = await appel(corpsDuJour(JOUR, 20));
    const meilleur = (await bon.json()).score;
    const moins = await appel(corpsDuJour(JOUR, 5));
    expect((await moins.json()).enregistre).toBe(false);
    expect((await depot.mesPerfs(id, 10))[0]!.valeur).toBe(meilleur);
  });

  it("un run bâclé s'enregistre quand même — un score est un score", async () => {
    const res = await appel({ mode: "daily", jour: JOUR, inputs: [] });
    expect(res.status).toBe(200);
    expect((await res.json()).score).toBeGreaterThanOrEqual(0);
  });

  it("un journal non monotone est refusé par le rejeu", async () => {
    const inputs = joueLeJour(JOUR, 10);
    const melange = [...inputs].reverse();
    const res = await appel({ mode: "daily", jour: JOUR, inputs: melange });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("run invalide");
  });

  it("porte la version de contenu — sans quoi l'historique mentirait plus tard", async () => {
    await appel(corpsDuJour(JOUR, 10));
    const p = (await depot.mesPerfs(id, 10))[0]!;
    expect(p.versionContenu).toBeTruthy();
    expect(p.cle).toContain(p.versionContenu);
  });
});
