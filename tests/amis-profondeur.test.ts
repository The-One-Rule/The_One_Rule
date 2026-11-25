/**
 * PHASE 4, POINT 25 — LA LATENCE D'UNE ROUTE SUIT SA PROFONDEUR.
 *
 * Chaque appel au dépôt est un aller-retour vers Supabase. Ce qui fait
 * attendre le joueur n'est pas leur NOMBRE, c'est la longueur de la chaîne
 * d'appels qui s'attendent l'un l'autre. AJOUTER en enchaînait 11 et ACCEPTER
 * 13 (mesuré à 25 ms par appel : 283 et 335 ms), alors que la plupart sont des
 * lectures indépendantes.
 *
 * Ce test mesure cette profondeur SANS HORLOGE : le proxy retient chaque appel
 * et ne les libère que par VAGUES — tout ce qui a été demandé en même temps
 * part ensemble. Le nombre de vagues est la profondeur, à l'unité près, et ne
 * dépend pas de la machine.
 *
 * Ce qui reste en série l'est pour une raison : `codeAmi` ÉCRIT un code s'il
 * n'y en a pas, donc il attend `parId` (sinon un compte supprimé en recevrait
 * un) ; l'état final relit ce qu'on vient d'écrire ; `perfsDepuis` a besoin de
 * la liste des amis. Éprouvé sur l'ancien code : 11 et 13 vagues, les deux
 * premiers tests tombent.
 */
import { describe, expect, it } from "vitest";
import { traite as amis } from "../api/amis";
import { DepotMemoire, nouvelId, utilisateurNeuf } from "../api/_depot";
import { signeJeton } from "../server/jeton";

const ENV = {
  TOR_AUTH_SECRET: "secret-de-test-assez-long-pour-ne-pas-etre-ridicule",
  SUPABASE_URL: "https://exemple.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "cle",
};
const T = Date.UTC(2026, 9, 8, 12);

function parVagues<D extends object>(cible: D): { depot: D; mesure: (f: () => Promise<unknown>) => Promise<number> } {
  let enAttente: Array<() => void> = [];
  const depot = new Proxy(cible, {
    get(o, nom, recv) {
      const v = Reflect.get(o, nom, recv);
      if (typeof v !== "function") return v;
      return async (...a: unknown[]) => {
        await new Promise<void>((r) => enAttente.push(r));
        return (v as (...x: unknown[]) => unknown).apply(o, a);
      };
    },
  });
  const mesure = async (f: () => Promise<unknown>): Promise<number> => {
    let vagues = 0;
    let fini = false;
    const p = f().finally(() => (fini = true));
    while (!fini) {
      // Un tour de boucle : toutes les promesses prêtes ont avancé, donc tout
      // ce qui pouvait être demandé en même temps l'a été.
      await new Promise((r) => setTimeout(r, 0));
      if (enAttente.length) {
        const l = enAttente;
        enAttente = [];
        vagues++;
        for (const r of l) r();
      }
    }
    await p;
    return vagues;
  };
  return { depot, mesure };
}

async function monde() {
  const memoire = new DepotMemoire();
  const moi = nouvelId();
  await memoire.cree(utilisateurNeuf(moi, T), { fournisseur: "google", idExterne: moi });
  for (let i = 0; i < 5; i++) {
    const id = nouvelId();
    await memoire.cree(utilisateurNeuf(id, T), { fournisseur: "google", idExterne: id });
    await memoire.lie(moi, id);
  }
  const autre = nouvelId();
  await memoire.cree(utilisateurNeuf(autre, T), { fournisseur: "google", idExterne: autre });
  const { depot, mesure } = parVagues(memoire);
  const appel = (action: string | null, code?: string) =>
    amis(
      new Request(`https://x/api/amis${action ? `?a=${action}` : ""}`, {
        method: action ? "POST" : "GET",
        headers: { Authorization: `Bearer ${signeJeton({ sub: moi, psd: "", gly: 0, vj: 0 }, ENV.TOR_AUTH_SECRET, T)}` },
        body: action ? JSON.stringify({ code }) : undefined,
      }),
      ENV,
      depot,
      T,
      () => 0.42,
    );
  return { memoire, moi, autre, appel, mesure };
}

describe("la profondeur des routes d'amis", () => {
  it("AJOUTER : au plus 5 allers-retours en série (11, puis 7, avant la transaction)", async () => {
    const { memoire, autre, appel, mesure } = await monde();
    const code = await memoire.codeAmi(autre, () => 0.7);
    let statut = 0;
    const n = await mesure(async () => (statut = (await appel("ajoute", code)).status));
    expect(statut).toBe(200);
    expect(n).toBeLessThanOrEqual(5);
  });

  it("ACCEPTER : au plus 5 allers-retours en série (13, puis 9, avant la transaction)", async () => {
    const { memoire, moi, autre, appel, mesure } = await monde();
    await memoire.demande(autre, moi);
    const code = await memoire.codeAmi(autre, () => 0.7);
    let statut = 0;
    const n = await mesure(async () => (statut = (await appel("accepte", code)).status));
    expect(statut).toBe(200);
    expect(n).toBeLessThanOrEqual(5);
  });

  it("LIRE : au plus 3 allers-retours en série (4 avant)", async () => {
    const { appel, mesure } = await monde();
    let statut = 0;
    const n = await mesure(async () => (statut = (await appel(null)).status));
    expect(statut).toBe(200);
    expect(n).toBeLessThanOrEqual(3);
  });
});
