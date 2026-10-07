/**
 * @vitest-environment jsdom
 *
 * La file d'envoi des performances.
 *
 * Trois défauts mesurés dans le code, pas à l'écran :
 *
 *   1. `enfile` jetait toute entrée du même jour pour pousser la dernière —
 *      un 23 écrasait un 34, et `vide()` après connexion posait 23.
 *   2. Deux `vide()` concurrents, ou un `ecrit(restants)` pendant une
 *      `enfile`, perdaient le journal qui venait d'arriver.
 *   3. Un 200 `enregistre: false` était recollé en refus — toast pour une
 *      non-amélioration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signeJeton } from "../server/jeton";
import type { Envoi, Resultat } from "../src/compte/file";
import type { LoggedInput } from "../src/engine/verify";

const SECRET = "secret-de-test-assez-long-pour-ne-pas-etre-ridicule";

const jeton = (): string =>
  signeJeton({ sub: "u1", psd: "PIERRE", gly: 0, vj: 0 }, SECRET);

const journal = (marque: number): LoggedInput[] => [{ t: marque, k: "c", i: 0 }];

function envoi(partie: Partial<Envoi> & Pick<Envoi, "valeur" | "inputs">): Envoi {
  return {
    mode: "daily",
    jour: 300,
    pose: partie.pose ?? Date.now(),
    valeur2: partie.valeur2 ?? 8000,
    ...partie,
  };
}

/**
 * L'ancienne `enfile` : jeter le même jour, pousser le dernier.
 * Gardée ICI pour que le test ait des dents — si on la recole, 34 disparaît.
 */
function enfileAncien(f: Envoi[], e: Envoi): Envoi[] {
  return [...f.filter((x) => !(x.mode === e.mode && x.jour === e.jour)), e];
}

async function charge() {
  vi.resetModules();
  localStorage.clear();
  const file = await import("../src/compte/file");
  const compte = await import("../src/compte/index");
  compte.reinitialise();
  return { file, compte };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("enfile garde le MEILLEUR journal du jour", () => {
  it("⚠️ enfile 34 puis 23 sans compte → la file garde 34", async () => {
    const { file } = await charge();
    const j34 = journal(34);
    const j23 = journal(23);
    file.enfile(envoi({ inputs: j34, valeur: 34, pose: 1 }));
    file.enfile(envoi({ inputs: j23, valeur: 23, pose: 2 }));

    const f = file.fileCourante();
    expect(f, "la file s'est vidée").toHaveLength(1);
    expect(f[0]!.valeur, "le 23 a jeté le 34").toBe(34);
    expect(f[0]!.inputs).toEqual(j34);

    /*
     * DENTS : l'ancienne règle (dernier gagne) garderait 23.
     * Si ce `toBe(23)` se met à passer sur `fileCourante`, le correctif est
     * parti.
     */
    const ancien = enfileAncien(
      [envoi({ inputs: j34, valeur: 34, pose: 1 })],
      envoi({ inputs: j23, valeur: 23, pose: 2 }),
    );
    expect(ancien[0]!.valeur, "l'ancienne enfile ne jette plus le dernier ?").toBe(23);
  });

  it("à score égal, la durée plus courte gagne — même ordre que posePerf", async () => {
    const { file } = await charge();
    file.enfile(envoi({ inputs: journal(1), valeur: 40, valeur2: 9000, pose: 1 }));
    file.enfile(envoi({ inputs: journal(2), valeur: 40, valeur2: 5000, pose: 2 }));
    expect(file.fileCourante()[0]!.valeur2).toBe(5000);
    expect(file.fileCourante()[0]!.inputs).toEqual(journal(2));
  });

  it("sans valeur connue, on garde les deux — posePerf départage", async () => {
    const { file } = await charge();
    file.enfile(envoi({ inputs: journal(34), valeur: undefined, pose: 1 }));
    file.enfile(envoi({ inputs: journal(23), valeur: undefined, pose: 2 }));
    expect(file.enAttente()).toBe(2);
  });
});

describe("vide() après connexion envoie de quoi poser 34", () => {
  it("enfile 34 puis 23 sans compte → vide() POST le journal du 34", async () => {
    const { file, compte } = await charge();
    const j34 = journal(34);
    file.enfile(envoi({ inputs: j34, valeur: 34, pose: 1 }));
    file.enfile(envoi({ inputs: journal(23), valeur: 23, pose: 2 }));

    const corps: unknown[] = [];
    vi.stubGlobal("fetch", async (_u: string | URL | Request, init?: RequestInit) => {
      corps.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(
        JSON.stringify({
          enregistre: true,
          score: 34,
          cleared: false,
          dureeMs: 8000,
          verdict: "ok",
        }),
        { status: 200 },
      );
    });

    expect(file.enAttente(), "sans compte la file doit attendre").toBe(1);
    expect(compte.poseJeton(jeton())).toBe(true);
    const r = await file.vide();
    expect(r).toHaveLength(1);
    expect(r[0]!.enregistre).toBe(true);
    expect(corps).toHaveLength(1);
    expect((corps[0] as { inputs: LoggedInput[] }).inputs, "vide() a envoyé le 23").toEqual(j34);
    expect(file.enAttente(), "la file n'a pas été vidée").toBe(0);
  });
});

describe("vide() : un seul passage, et une enfile concurrente survit", () => {
  it("deux vide() partagent la promesse — un seul POST", async () => {
    const { file, compte } = await charge();
    file.enfile(envoi({ inputs: journal(34), valeur: 34, pose: 1 }));
    expect(compte.poseJeton(jeton())).toBe(true);

    let posts = 0;
    let relache!: () => void;
    const barriere = new Promise<void>((r) => {
      relache = r;
    });
    vi.stubGlobal("fetch", async () => {
      posts += 1;
      await barriere;
      return new Response(
        JSON.stringify({
          enregistre: true,
          score: 34,
          cleared: false,
          dureeMs: 1,
          verdict: "ok",
        }),
        { status: 200 },
      );
    });

    const p1 = file.vide();
    const p2 = file.vide();
    expect(p1).toBe(p2);
    relache();
    await p1;
    await p2;
    expect(posts, "deux vide() ont lancé deux POST").toBe(1);
  });

  it("⚠️ un ecrit(restants) n'écrase pas une enfile arrivée pendant le fetch", async () => {
    const { file, compte } = await charge();
    file.enfile(envoi({ inputs: journal(34), valeur: 34, jour: 300, pose: 1 }));
    expect(compte.poseJeton(jeton())).toBe(true);

    let relache!: () => void;
    const barriere = new Promise<void>((r) => {
      relache = r;
    });
    vi.stubGlobal("fetch", async () => {
      await barriere;
      return new Response(
        JSON.stringify({
          enregistre: true,
          score: 34,
          cleared: false,
          dureeMs: 1,
          verdict: "ok",
        }),
        { status: 200 },
      );
    });

    const p = file.vide();
    file.enfile(envoi({ inputs: journal(12), valeur: 12, jour: 301, pose: 99 }));
    relache();
    await p;

    const reste = file.fileCourante();
    expect(
      reste.some((e) => e.jour === 301 && e.valeur === 12),
      "l'enfile du jour 301 a disparu sous ecrit(restants)",
    ).toBe(true);
  });
});

describe("enregistre: false n'est un refus que s'il y a refus", () => {
  const ok = (partie: Partial<Resultat>): Resultat => ({
    enregistre: false,
    score: 23,
    cleared: false,
    dureeMs: 1000,
    verdict: "ok",
    ...partie,
  });

  it("un 200 enregistre:false est silencieux — pas un refus", async () => {
    const { file, compte } = await charge();
    file.enfile(envoi({ inputs: journal(23), valeur: 23, pose: 1 }));
    expect(compte.poseJeton(jeton())).toBe(true);

    vi.stubGlobal("fetch", async () => {
      return new Response(
        JSON.stringify({
          enregistre: false,
          score: 40,
          cleared: false,
          dureeMs: 1000,
          verdict: "ok",
        }),
        { status: 200 },
      );
    });

    const r = await file.vide();
    expect(r).toHaveLength(1);
    expect(r[0]!.enregistre).toBe(false);
    expect(r[0]!.refus, "un 200 false a été recollé en refus").toBeUndefined();
    expect(file.estRefusReel(r[0]!)).toBe(false);

    /*
     * DENTS : l'ancien `if (!r.enregistre) r.refus = r.refus ?? "non enregistre"`
     * ferait passer `estRefusReel` à true, et le toast partirait.
     */
    const colle = { ...r[0]!, refus: r[0]!.refus ?? "non enregistre" };
    expect(file.estRefusReel(colle)).toBe(true);
  });

  it("un 4xx est un vrai refus", async () => {
    const { file, compte } = await charge();
    file.enfile(envoi({ inputs: journal(1), valeur: 1, pose: 1 }));
    expect(compte.poseJeton(jeton())).toBe(true);

    vi.stubGlobal("fetch", async () => {
      return new Response(JSON.stringify({ error: "run invalide", raison: "journal" }), {
        status: 400,
      });
    });

    const r = await file.vide();
    expect(r).toHaveLength(1);
    expect(r[0]!.enregistre).toBe(false);
    expect(r[0]!.refus).toMatch(/journal|invalide|HTTP 400/);
    expect(file.estRefusReel(r[0]!)).toBe(true);
    expect(file.enAttente(), "un 4xx doit quitter la file").toBe(0);
  });

  it("⚠️ un 429 n'est PAS un refus : le run reste dans la file (audit D3)", async () => {
    // `api/perf.ts` répond 429 quand le quota horaire est atteint. Le classer
    // avec les 4xx jetait le score pour toujours.
    const { file, compte } = await charge();
    file.enfile(envoi({ inputs: journal(1), valeur: 1, pose: 1 }));
    expect(compte.poseJeton(jeton())).toBe(true);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "trop de requetes" }), { status: 429 }));

    const r = await file.vide();
    expect(r).toHaveLength(0);
    expect(file.enAttente(), "le run limité en débit a été jeté").toBe(1);
  });

  it("estRefusReel : seulement si refus est porté", async () => {
    const { file } = await charge();
    expect(file.estRefusReel(ok({}))).toBe(false);
    expect(file.estRefusReel(ok({ enregistre: true }))).toBe(false);
    expect(file.estRefusReel(ok({ refus: "jour trop ancien" }))).toBe(true);
  });

  it("⚠️ REJOUER plus faible que le meilleur déjà posé : pas de toast", async () => {
    /*
     * 34 est en base. Le joueur REJOUE, fait 23. `posePerf` rend 200
     * `enregistre: false` sans `refus` — le 34 n'est pas perdu.
     *
     * DENTS : `filter(r => !r.enregistre)` toasterait encore.
     */
    const { file } = await charge();
    const rejouer: Resultat = ok({ enregistre: false, score: 23 });
    expect(file.estRefusReel(rejouer)).toBe(false);
    expect(
      !rejouer.enregistre,
      "l'ancien filtre (tout false) ne toasterait plus ?",
    ).toBe(true);
  });
});
