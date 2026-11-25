/**
 * La collection EN BASE : projection du carnet, records, statistique, et
 * l'identifiant de compte devenu UUID (migrations 0006 à 0009).
 */
import { describe, expect, it } from "vitest";
import { traite as moi } from "../api/moi";
import { DepotMemoire, nouvelId, utilisateurNeuf } from "../api/_depot";
import type { Perf } from "../api/_depot";
import { projette } from "../api/_projection";
import { agregatsVides, estIdCompte, idCompte } from "../shared/compte";
import type { Agregats } from "../shared/compte";
import { decoupe } from "../shared/jeton";
import { signeJeton } from "../server/jeton";
import { estMaitrisee } from "../src/game/maitrise";
import { ONE_RULES } from "../src/engine/rules";

const SECRET = "secret-de-test-assez-long-pour-ne-pas-etre-ridicule";
const ENV = { TOR_AUTH_SECRET: SECRET, SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "cle" };
const ag = (carnet: Agregats["carnet"]): Agregats => ({ ...agregatsVides(), carnet });

describe("identifiant de compte", () => {
  it("nouvelId rend un UUID, la forme que la colonne exige", () => {
    expect(estIdCompte(nouvelId())).toBe(true);
  });

  it("l'ancienne forme u_<32 hex> se lit comme l'UUID qu'elle était", () => {
    expect(idCompte("u_0123456789abcdef0123456789abcdef")).toBe("01234567-89ab-cdef-0123-456789abcdef");
    // Tout le reste passe tel quel : ce n'est pas un validateur.
    for (const x of ["u_1", "abc", "u_0123456789ABCDEF0123456789ABCDEF", "01234567-89ab-cdef-0123-456789abcdef"]) {
      expect(idCompte(x)).toBe(x);
    }
  });

  it("⚠️ un jeton émis AVANT la migration désigne le même compte qu'après", () => {
    const vieux = signeJeton({ sub: "u_0123456789abcdef0123456789abcdef", psd: "", gly: 0, vj: 0 }, SECRET);
    expect(decoupe(vieux)!.revendications.sub).toBe("01234567-89ab-cdef-0123-456789abcdef");
  });

  it("un jeton à l'ancienne forme ouvre toujours la route moi", async () => {
    const id = "01234567-89ab-4def-8123-456789abcdef";
    const depot = new DepotMemoire();
    await depot.cree(utilisateurNeuf(id, Date.now()), { fournisseur: "google", idExterne: "g" });
    const vieux = signeJeton({ sub: `u_${id.replace(/-/g, "")}`, psd: "", gly: 0, vj: 0 }, SECRET);
    const res = await moi(new Request("https://x/api/moi", { headers: { Authorization: `Bearer ${vieux}` } }), ENV, depot);
    expect(res.status).toBe(200);
    expect((await res.json()).moi.id).toBe(id);
  });
});

describe("projection du carnet", () => {
  it("une carte par règle connue, la maîtrise jugée par estMaitrisee", () => {
    const carnet: Agregats["carnet"] = {
      sang: { best: 20, cleared: true, pieges: 3, runs: 4, etoiles: [3, 3, 2, 1, 1] },
      azur: { best: 4, cleared: false },
      "sang+pointe": { best: 9, cleared: false },
      inconnue: { best: 1, cleared: false },
    };
    const p = projette(ag(carnet));
    expect(p.cartes.map((c) => c.regle).sort()).toEqual(["azur", "sang"]);
    for (const c of p.cartes) {
      const regle = ONE_RULES.find((r) => r.id === c.regle)!;
      expect(c.maitrisee).toBe(estMaitrisee(regle, carnet[c.regle] as never));
    }
    expect(p.cartes.find((c) => c.regle === "sang")).toEqual({ regle: "sang", meilleur: 20, pieges: 3, runs: 4, maitrisee: true });
    // Un chapitre n'existe en base qu'une fois entamé (une étoile au moins).
    expect(p.chapitres).toEqual([{ regle: "sang", etoiles: [3, 3, 2, 1, 1] }]);
  });

  it("les valeurs hors domaine sont bornées, jamais transmises telles quelles", () => {
    const p = projette(ag({ sang: { best: -5, cleared: false, pieges: 1e9, etoiles: [9, -1, 2] } }));
    expect(p.cartes[0]).toMatchObject({ meilleur: 0, pieges: 100_000 });
    expect(p.chapitres[0]!.etoiles).toEqual([3, 0, 2, 0, 0]);
  });
});

describe("collection en base", () => {
  it("la projection suit les agrégats, au maximum, et la route moi la rend", async () => {
    const depot = new DepotMemoire();
    const id = nouvelId();
    await depot.cree(utilisateurNeuf(id, Date.now()), { fournisseur: "google", idExterne: "g" });
    await depot.majAgregats(id, 0, ag({ sang: { best: 7, cleared: false, pieges: 2, etoiles: [3, 0, 0, 0, 0] } }));
    // Une projection moins bonne (un vieil appareil) ne fait rien reculer.
    await depot.majAgregats(id, 1, ag({ sang: { best: 3, cleared: false, pieges: 5, etoiles: [1, 2, 0, 0, 0] } }));
    const j = signeJeton({ sub: id, psd: "", gly: 0, vj: 0 }, SECRET);
    const res = await moi(new Request("https://x/api/moi?a=collection", { headers: { Authorization: `Bearer ${j}` } }), ENV, depot);
    const c = (await res.json()).collection;
    expect(c.cartes).toEqual([{ regle: "sang", meilleur: 7, pieges: 5, runs: 0, maitrisee: false }]);
    expect(c.chapitres).toEqual([{ regle: "sang", etoiles: [3, 2, 0, 0, 0], numero: 1, termine: false }]);
  });

  it("record et statistique ne se nourrissent que du rejoué, et le douteux n'est jamais un record", async () => {
    const depot = new DepotMemoire();
    const id = nouvelId();
    await depot.cree(utilisateurNeuf(id, Date.now()), { fournisseur: "google", idExterne: "g" });
    const perf = (valeur: number, jour: number, verdictBot = "humain"): Perf => ({
      utilisateurId: id, mode: "daily", cle: `daily|j:${jour}`, versionContenu: "v", jour,
      graine: 1, regle: "sang", valeur, valeur2: 1000, verdictBot, creeLe: 0,
    });
    await depot.posePerf(perf(12, 1));
    await depot.posePerf(perf(8, 1)); // moins bien, même jour : non écrit, mais compté
    await depot.posePerf(perf(5, 2)); // autre jour, moins bien : le record ne recule pas
    await depot.posePerf(perf(40, 3, "douteux"));
    const c = await depot.collection(id);
    expect(c.meilleurs).toEqual([{ mode: "daily", valeur: 12, valeur2: 1000 }]);
    expect(c.statistique).toEqual({ runsVerifies: 4, joursClasses: 3 });
  });
});
