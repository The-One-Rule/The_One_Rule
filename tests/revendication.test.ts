/**
 * @vitest-environment jsdom
 *
 * La revendication de bout en bout — le tour complet, sans imitation.
 *
 * `tests/moi.test.ts` éprouve le serveur, `tests/compte.test.ts` éprouve la
 * fusion pure. Aucun des deux ne parcourt la CHAÎNE : sauvegarde locale →
 * `agregatsDe` → POST → `litAgregats` → `fusionne` → `vue` → `appliqueMoi` →
 * `appliqueAgregats` → `localStorage`.
 *
 * Or c'est exactement là que se loge le symptôme rapporté après déploiement :
 * « la série et le carnet ne se conservent pas ». Chaque maillon est vert,
 * donc si la chaîne perd quelque chose, c'est à une jonction — et une jonction
 * n'appartient à aucun des deux tests existants.
 *
 * Le `fetch` est détourné vers le VRAI handler `api/moi.ts` avec un dépôt en
 * mémoire : rien n'est simulé côté serveur.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { traite } from "../api/moi";
import { DepotMemoire, nouvelId, utilisateurNeuf } from "../api/_depot";
import { signeJeton } from "../server/jeton";

const ENV = {
  TOR_AUTH_SECRET: "secret-de-test-assez-long-pour-ne-pas-etre-ridicule",
  DATABASE_URL: "postgresql://test@127.0.0.1:1/aucune",
};

let depot: DepotMemoire;
let idCompte: string;

/** Le serveur, atteint par `fetch` comme en production. */
function brancheServeur(): void {
  vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url instanceof Request ? url.url : url);
    if (!u.includes("/api/moi")) return new Response("non", { status: 404 });
    const abs = u.startsWith("http") ? u : `https://www.theonerule.party${u}`;
    return traite(new Request(abs, init), ENV, depot);
  });
}

/** Un appareil : modules frais, `localStorage` propre, jeton posé. */
async function appareil(jeton: string) {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("oneRule.compte.v1", jeton);
  const P = await import("../src/game/progress");
  const compte = await import("../src/compte/index");
  const revendication = await import("../src/compte/revendication");
  return { P, compte, revendication };
}

beforeEach(async () => {
  depot = new DepotMemoire();
  idCompte = nouvelId();
  await depot.cree(utilisateurNeuf(idCompte, Date.now()), {
    fournisseur: "google",
    idExterne: "g1",
  });
  brancheServeur();
});

const jetonPour = (vj = 0): string =>
  signeJeton({ sub: idCompte, psd: "", gly: 0, vj }, ENV.TOR_AUTH_SECRET);

describe("un appareil qui se connecte", () => {
  it("téléverse son carnet et sa série", async () => {
    const { P, revendication } = await appareil(jetonPour());

    P.mutate((s) => {
      s.encountered = {
        sang: { best: 23, cleared: true, pieges: 4 },
        jumeau: { best: 9, cleared: false },
      };
      s.streak = { ...s.streak, count: 6, lastDay: 300 };
      s.bestTraining = 31;
      s.ranked.name = "PIERRE";
    });

    const issue = await revendication.revendiqueSiNecessaire();
    expect(issue.quoi, JSON.stringify(issue)).toBe("faite");

    const u = (await depot.parId(idCompte))!;
    expect(u.agregats.carnet.sang).toEqual({ best: 23, cleared: true, pieges: 4 });
    // Une entrée d'avant le compteur de pièges monte à zéro plutôt que de
    // remonter `undefined` : absent vaut zéro, comme partout ailleurs.
    expect(u.agregats.carnet.jumeau).toEqual({ best: 9, cleared: false, pieges: 0 });
    expect(u.agregats.serie.count).toBe(6);
    expect(u.pseudo).toBe("PIERRE");
  });

  it("ne revendique qu'UNE fois", async () => {
    const { P, revendication } = await appareil(jetonPour());
    P.mutate((s) => {
      s.encountered = { sang: { best: 5, cleared: false } };
    });

    expect((await revendication.revendiqueSiNecessaire()).quoi).toBe("faite");
    expect(P.load().compte.revendiquePar).toBe(idCompte);
    expect((await revendication.revendiqueSiNecessaire()).quoi).toBe("deja");
  });

  it("ne perd RIEN localement en revendiquant", async () => {
    const { P, revendication } = await appareil(jetonPour());
    P.mutate((s) => {
      s.encountered = { sang: { best: 23, cleared: true, pieges: 2 } };
      s.streak = { ...s.streak, count: 6, lastDay: 300 };
      s.bestTraining = 31;
    });

    await revendication.revendiqueSiNecessaire();

    const apres = P.load();
    expect(apres.encountered.sang).toEqual({ best: 23, cleared: true, pieges: 2 });
    expect(apres.streak.count).toBe(6);
    expect(apres.bestTraining).toBe(31);
  });
});

describe("un SECOND appareil, le même compte", () => {
  it("récupère le carnet et la série du premier", async () => {
    // C'est toute la promesse du chantier, et le symptôme rapporté porte
    // exactement là-dessus.
    const un = await appareil(jetonPour());
    un.P.mutate((s) => {
      s.encountered = {
        sang: { best: 23, cleared: true, pieges: 5 },
        pointe: { best: 14, cleared: false },
      };
      s.streak = { ...s.streak, count: 6, lastDay: 300 };
      s.bestTraining = 31;
    });
    await un.revendication.revendiqueSiNecessaire();

    const deux = await appareil(jetonPour());
    // Appareil neuf : rien en local avant la revendication.
    expect(Object.keys(deux.P.load().encountered)).toEqual([]);

    const issue = await deux.revendication.revendiqueSiNecessaire();
    expect(issue.quoi, JSON.stringify(issue)).toBe("faite");

    const s = deux.P.load();
    expect(s.encountered.sang, "le carnet du premier appareil doit descendre").toEqual({
      best: 23,
      cleared: true,
      pieges: 5,
    });
    expect(s.encountered.pointe?.best).toBe(14);
    expect(s.streak.count, "la série doit descendre").toBe(6);
    expect(s.bestTraining, "le record doit descendre").toBe(31);
  });

  it("n'écrase pas ce que le premier avait de plus", async () => {
    const un = await appareil(jetonPour());
    un.P.mutate((s) => {
      s.encountered = { sang: { best: 40, cleared: true, pieges: 7 } };
      s.streak = { ...s.streak, count: 9, lastDay: 300 };
    });
    await un.revendication.revendiqueSiNecessaire();

    const deux = await appareil(jetonPour());
    deux.P.mutate((s) => {
      s.encountered = { sang: { best: 3, cleared: false, pieges: 3 } };
      s.streak = { ...s.streak, count: 1, lastDay: 301 };
    });
    await deux.revendication.revendiqueSiNecessaire();

    const u = (await depot.parId(idCompte))!;
    /*
     * ⚠️ LES PIÈGES SE FUSIONNENT AU MAXIMUM, alors qu'ils s'ADDITIONNENT en
     * local. L'asymétrie est le point : 7 et 3 donnent 7, jamais 10. Sommer
     * doublerait le compteur d'un joueur qui synchronise deux fois ou qui joue
     * sur deux appareils, et « maîtrisée » se déclencherait tout seul.
     *
     * On peut donc sous-compter en changeant d'appareil — jamais gonfler, et
     * jamais perdre. C'est le même marché que `best` juste à côté.
     */
    expect(u.agregats.carnet.sang).toEqual({ best: 40, cleared: true, pieges: 7 });
    expect(u.agregats.serie.count).toBe(9);
    expect(deux.P.load().encountered.sang!.best).toBe(40);
  });

  it("un appareil déjà rattaché resynchronise sans revendiquer", async () => {
    const un = await appareil(jetonPour());
    un.P.mutate((s) => {
      s.encountered = { sang: { best: 12, cleared: false } };
    });
    await un.revendication.revendiqueSiNecessaire();

    // Le compte gagne quelque chose ailleurs, entre-temps.
    const u = (await depot.parId(idCompte))!;
    await depot.majAgregats(idCompte, u.revision, {
      ...u.agregats,
      carnet: { ...u.agregats.carnet, gaucher: { best: 30, cleared: true } },
    });

    const moi = await un.compte.profil();
    expect(moi).not.toBeNull();
    un.revendication.appliqueSiConnu(moi!);
    expect(un.P.load().encountered.gaucher?.best).toBe(30);
  });
});

describe("ce qui est joué APRÈS la connexion", () => {
  /*
   * Le trou de conception rapporté après déploiement : « la série et le
   * carnet ne se conservent pas ».
   *
   * La revendication avait été conçue comme une MIGRATION unique — elle monte
   * ce que l'appareil avait avant le compte, marque `revendiquePar`, et ne
   * repasse jamais. Il n'existait aucune synchronisation continue. Donc tout
   * ce qui est joué APRÈS la connexion ne quittait plus l'appareil, et un
   * joueur qui se connecte avant de jouer avait un compte vide à vie.
   *
   * C'est le cas le plus courant, pas un cas de bord : on découvre le bouton,
   * on se connecte, PUIS on joue.
   */
  it("remonte au compte", async () => {
    const un = await appareil(jetonPour());
    // Connexion AVANT d'avoir joué : le carnet local est vide.
    expect((await un.revendication.revendiqueSiNecessaire()).quoi).toBe("faite");

    // Puis on joue.
    un.P.mutate((s) => {
      s.encountered = { sang: { best: 18, cleared: false } };
      s.streak = { ...s.streak, count: 3, lastDay: 301 };
    });
    await un.revendication.synchronise();

    const u = (await depot.parId(idCompte))!;
    expect(u.agregats.carnet.sang?.best, "ce qui est joué après doit monter").toBe(18);
    expect(u.agregats.serie.count).toBe(3);
  });

  it("et redescend sur un second appareil", async () => {
    const un = await appareil(jetonPour());
    await un.revendication.revendiqueSiNecessaire();
    un.P.mutate((s) => {
      s.encountered = { sang: { best: 18, cleared: false } };
      s.streak = { ...s.streak, count: 3, lastDay: 301 };
    });
    await un.revendication.synchronise();

    const deux = await appareil(jetonPour());
    await deux.revendication.revendiqueSiNecessaire();
    expect(deux.P.load().encountered.sang?.best).toBe(18);
    expect(deux.P.load().streak.count).toBe(3);
  });

  it("un appareil revendiqué par un AUTRE compte ne fait rien monter", async () => {
    // Le garde du prêt de téléphone doit survivre à la synchronisation
    // continue : sinon la progression d'un ami remonterait dans mon compte à
    // chaque partie, ce qui est pire que le bug d'origine.
    const un = await appareil(jetonPour());
    un.P.mutate((s) => {
      s.encountered = { sang: { best: 40, cleared: true } };
      s.compte.revendiquePar = "u_quelquun_dautre";
    });

    await un.revendication.synchronise();

    const u = (await depot.parId(idCompte))!;
    expect(u.agregats.carnet.sang, "rien ne doit monter").toBeUndefined();
  });

  it("sans compte, la synchronisation ne fait rien et ne lève pas", async () => {
    localStorage.clear();
    vi.resetModules();
    const revendication = await import("../src/compte/revendication");
    await expect(revendication.synchronise()).resolves.toBeUndefined();
  });
});

describe("les pannes ne coûtent rien", () => {
  it("serveur injoignable : rien n'est marqué, on réessaiera", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("hors ligne");
    });
    const { P, revendication } = await appareil(jetonPour());
    P.mutate((s) => {
      s.encountered = { sang: { best: 7, cleared: false } };
    });

    expect((await revendication.revendiqueSiNecessaire()).quoi).toBe("echec");
    // Ni marqué comme revendiqué — sinon la progression serait perdue pour de
    // bon — ni amputé.
    expect(P.load().compte.revendiquePar).toBeNull();
    expect(P.load().encountered.sang!.best).toBe(7);

    brancheServeur();
    expect((await revendication.revendiqueSiNecessaire()).quoi).toBe("faite");
  });

  it("jeton révoqué : on reste anonyme et la progression locale est intacte", async () => {
    await depot.revoque(idCompte);
    const { P, revendication } = await appareil(jetonPour(0));
    P.mutate((s) => {
      s.encountered = { sang: { best: 7, cleared: false } };
    });

    expect((await revendication.revendiqueSiNecessaire()).quoi).toBe("echec");
    expect(P.load().encountered.sang!.best).toBe(7);
  });
});
