/**
 * La revendication, côté serveur.
 *
 * Deux choses s'y jouent, et aucune ne fait de bruit quand elle rate :
 *
 *   · la FUSION doit être une union et un maximum, sinon un carnet rétrécit
 *     en silence et personne ne le voit avant qu'un joueur ne cherche une
 *     règle qu'il sait avoir jouée ;
 *   · les agrégats arrivent d'un client et ne sont PAS vérifiables. Il faut
 *     donc les borner — un endpoint public doit refuser ce qu'il n'attend pas,
 *     y compris un carnet de dix mille entrées et une série de mille ans.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { litAgregats, traite } from "../api/moi";
import { DepotMemoire, nouvelId, utilisateurNeuf } from "../api/_depot";
import { signeJeton } from "../server/jeton";
import { decoupe } from "../shared/jeton";
import { agregatsVides } from "../shared/compte";
import type { Agregats } from "../shared/compte";
import { GLYPH_COUNT } from "../src/net/glyph";

const ENV = {
  TOR_AUTH_SECRET: "secret-de-test-assez-long-pour-ne-pas-etre-ridicule",
  TOR_APP_URL: "https://www.theonerule.party",
  SUPABASE_URL: "https://exemple.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "cle",
};

let depot: DepotMemoire;
let id: string;

beforeEach(async () => {
  depot = new DepotMemoire();
  id = nouvelId();
  await depot.cree(utilisateurNeuf(id, Date.now()), { fournisseur: "google", idExterne: "g1" });
});

const jeton = (sur: { sub?: string; psd?: string; gly?: number; vj?: number } = {}): string =>
  signeJeton({ sub: id, psd: "", gly: 0, vj: 0, ...sur }, ENV.TOR_AUTH_SECRET);

const appel = (
  chemin: string,
  opts: { jeton?: string | null; corps?: unknown; methode?: string } = {},
): Promise<Response> => {
  const j = opts.jeton === undefined ? jeton() : opts.jeton;
  return traite(
    new Request(`https://www.theonerule.party/api/moi${chemin}`, {
      method: opts.methode ?? (opts.corps !== undefined ? "POST" : "GET"),
      headers: j ? { Authorization: `Bearer ${j}` } : {},
      body: opts.corps !== undefined ? JSON.stringify(opts.corps) : undefined,
    }),
    ENV,
    depot,
  );
};

const agregats = (sur: Partial<Agregats> = {}): Agregats => ({ ...agregatsVides(), ...sur });

/* ------------------------------------------------------------------ *
 * Accès
 * ------------------------------------------------------------------ */

describe("accès", () => {
  it("sans jeton, rien", async () => {
    expect((await appel("", { jeton: null })).status).toBe(401);
  });

  it("avec un jeton frelaté, rien", async () => {
    expect((await appel("", { jeton: "a.b.c" })).status).toBe(401);
  });

  it("un jeton d'une génération révoquée n'ouvre plus rien", async () => {
    await depot.revoque(id);
    expect((await appel("", { jeton: jeton({ vj: 0 }) })).status).toBe(401);
    expect((await appel("", { jeton: jeton({ vj: 1 }) })).status).toBe(200);
  });

  it("un compte supprimé n'existe plus", async () => {
    await depot.supprime(id);
    expect((await appel("")).status).toBe(401);
  });

  it("sans configuration, la route se déclare indisponible", async () => {
    const res = await traite(
      new Request("https://x.test/api/moi"),
      { ...ENV, TOR_AUTH_SECRET: "" },
      depot,
    );
    expect(res.status).toBe(503);
  });
});

/* ------------------------------------------------------------------ *
 * Fusion
 * ------------------------------------------------------------------ */

describe("fusion", () => {
  const apport = (best: number, serie: number): Agregats =>
    agregats({
      carnet: { sang: { best, cleared: false } },
      serie: { count: serie, lastDay: 240 },
      records: { "training|pace:1|v:x": best },
    });

  it("absorbe une progression d'appareil", async () => {
    const res = await appel("?a=fusion", { corps: { agregats: apport(23, 4) } });
    expect(res.status).toBe(200);
    const { moi } = await res.json();
    expect(moi.agregats.carnet.sang.best).toBe(23);
    expect(moi.agregats.serie.count).toBe(4);
    expect(moi.agregats.records["training|pace:1|v:x"]).toBe(23);
  });

  it("est idempotente — la rejouer ne change rien", async () => {
    await appel("?a=fusion", { corps: { agregats: apport(23, 4) } });
    const un = await (await appel("")).json();
    await appel("?a=fusion", { corps: { agregats: apport(23, 4) } });
    await appel("?a=fusion", { corps: { agregats: apport(23, 4) } });
    const trois = await (await appel("")).json();
    expect(trois.moi.agregats).toEqual(un.moi.agregats);
  });

  it("ne fait JAMAIS redescendre une valeur", async () => {
    // Le cœur du chantier. Un deuxième appareil en retard ne doit rien pouvoir
    // effacer — et c'est exactement le geste qu'un « set » ferait.
    await appel("?a=fusion", { corps: { agregats: apport(40, 9) } });
    await appel("?a=fusion", { corps: { agregats: apport(3, 1) } });
    const { moi } = await (await appel("")).json();
    expect(moi.agregats.carnet.sang.best).toBe(40);
    expect(moi.agregats.serie.count).toBe(9);
    expect(moi.agregats.records["training|pace:1|v:x"]).toBe(40);
  });

  it("n'additionne pas les séries de deux appareils", async () => {
    await appel("?a=fusion", { corps: { agregats: apport(1, 7) } });
    await appel("?a=fusion", { corps: { agregats: apport(1, 5) } });
    const { moi } = await (await appel("")).json();
    expect(moi.agregats.serie.count).toBe(7);
  });

  it("un corps vide ou absurde ne détruit rien", async () => {
    await appel("?a=fusion", { corps: { agregats: apport(30, 6) } });
    for (const corps of [{}, { agregats: null }, { agregats: "bruit" }, { agregats: [] }]) {
      expect((await appel("?a=fusion", { corps })).status).toBe(200);
    }
    const { moi } = await (await appel("")).json();
    expect(moi.agregats.carnet.sang.best).toBe(30);
  });
});

/* ------------------------------------------------------------------ *
 * Bornes — ce qui arrive du client n'est pas vérifiable
 * ------------------------------------------------------------------ */

describe("bornes sur des agrégats non vérifiables", () => {
  it("tronque un carnet démesuré au lieu de refuser", () => {
    // Tronquer plutôt que refuser : une revendication qui échoue pour une clé
    // que le joueur n'a pas écrite lui-même le priverait de sa progression au
    // moment le plus fragile du parcours.
    const carnet: Record<string, { best: number; cleared: boolean }> = {};
    for (let i = 0; i < 5000; i++) carnet[`regle${i}`] = { best: 1, cleared: false };
    const lu = litAgregats({ carnet });
    expect(Object.keys(lu.carnet).length).toBeLessThanOrEqual(64);
  });

  it("borne les valeurs, refuse les négatives et les non-nombres", () => {
    const lu = litAgregats({
      carnet: { a: { best: 1e12, cleared: true }, b: { best: -5, cleared: "oui" } },
      serie: { count: 999_999, lastDay: -3 },
      records: { x: Infinity, y: NaN, z: "40" },
    });
    expect(lu.carnet.a!.best).toBe(100_000);
    expect(lu.carnet.b!.best).toBe(0);
    // `cleared` n'est vrai que sur un booléen : une chaîne ne débloque rien.
    expect(lu.carnet.b!.cleared).toBe(false);
    expect(lu.serie.count).toBe(3650);
    expect(lu.serie.lastDay).toBe(0);
    // Infinity et NaN valent ZÉRO, pas le plafond : ce ne sont pas de très
    // grands scores, ce sont des non-nombres, et les plafonner reviendrait à
    // récompenser un client qui envoie n'importe quoi.
    expect(lu.records.x).toBe(0);
    expect(lu.records.y).toBe(0);
    expect(lu.records.z).toBe(40);
  });

  it("jette les clés impossibles", () => {
    const lu = litAgregats({
      carnet: { ["x".repeat(40)]: { best: 5, cleared: false }, "": { best: 5, cleared: false } },
      records: { ["y".repeat(200)]: 5 },
    });
    expect(Object.keys(lu.carnet)).toEqual([]);
    expect(Object.keys(lu.records)).toEqual([]);
  });

  it("refuse un corps trop gros", async () => {
    const gros = "x".repeat(40_000);
    const res = await appel("?a=fusion", { corps: { agregats: agregatsVides(), bourrage: gros } });
    expect(res.status).toBe(413);
  });
});

/* ------------------------------------------------------------------ *
 * Identité
 * ------------------------------------------------------------------ */

describe("identité", () => {
  it("la première revendication pose le nom et le signe du joueur", async () => {
    // Créer un compte ne doit RIEN changer de visible : on reprend le nom et
    // le signe que le joueur portait déjà en multijoueur.
    const res = await appel("?a=fusion", {
      corps: { agregats: agregatsVides(), pseudo: "pierre", glyphe: 42 },
    });
    const { moi, jeton: frais } = await res.json();
    expect(moi.pseudo).toBe("PIERRE");
    expect(moi.glyphe).toBe(42);
    // Le jeton doit porter le nouveau nom, sinon les salons annonceraient
    // l'ancien jusqu'à la péremption.
    expect(decoupe(frais)!.revendications.psd).toBe("PIERRE");
    expect(decoupe(frais)!.revendications.gly).toBe(42);
  });

  it("un SECOND appareil ne renomme pas le compte", async () => {
    // Sans ce garde, ouvrir le jeu sur un autre navigateur renommerait le
    // joueur avec le nom local de ce navigateur-là.
    await appel("?a=fusion", { corps: { agregats: agregatsVides(), pseudo: "pierre", glyphe: 42 } });
    await appel("?a=fusion", { corps: { agregats: agregatsVides(), pseudo: "autre", glyphe: 7 } });
    const { moi } = await (await appel("")).json();
    expect(moi.pseudo).toBe("PIERRE");
    expect(moi.glyphe).toBe(42);
  });

  it("le renommage explicite, lui, passe", async () => {
    await appel("?a=fusion", { corps: { agregats: agregatsVides(), pseudo: "pierre", glyphe: 1 } });
    const res = await appel("?a=identite", { corps: { pseudo: "  alex ", glyphe: 9 } });
    const { moi } = await res.json();
    expect(moi.pseudo).toBe("ALEX");
    expect(moi.glyphe).toBe(9);
  });

  it("refuse un pseudo vide et borne un glyphe hors vocabulaire", async () => {
    expect((await appel("?a=identite", { corps: { pseudo: "   " } })).status).toBe(400);
    const { moi } = await (
      await appel("?a=identite", { corps: { pseudo: "x", glyphe: GLYPH_COUNT + 99 } })
    ).json();
    expect(moi.glyphe).toBe(0);
  });

  it("conserve les clés d'apparence qu'elle ne connaît pas", async () => {
    // C'est ce qui rendra l'ajout d'habillages de cartes indolore : un client
    // d'une version antérieure ne doit pas effacer ce qu'il ne sait pas
    // afficher.
    const u = (await depot.parId(id))!;
    await depot.majIdentite(id, "PIERRE", { ...u.apparence, glyphe: 3, carte: "nocturne" });
    const { moi } = await (await appel("?a=identite", { corps: { pseudo: "PIERRE" } })).json();
    expect(moi.apparence.carte).toBe("nocturne");
    expect(moi.glyphe).toBe(3);
  });
});

/* ------------------------------------------------------------------ *
 * Suppression
 * ------------------------------------------------------------------ */

describe("suppression", () => {
  it("efface le compte, et le lien de plateforme AVEC", async () => {
    // L'ordre est ce qui compte : garder le lien laisserait une reconnexion
    // avec le même compte Google ressusciter un compte supprimé, ce qu'une
    // demande de suppression interdit exactement.
    await appel("?a=fusion", { corps: { agregats: agregatsVides(), pseudo: "pierre" } });
    const res = await appel("?a=suppression", { corps: {} });
    expect(res.status).toBe(200);

    expect(await depot.parLien({ fournisseur: "google", idExterne: "g1" })).toBeNull();
    expect((await appel("")).status).toBe(401);
  });

  it("emporte les performances — ce sont des données personnelles", async () => {
    await depot.posePerf({
      utilisateurId: id,
      mode: "daily",
      cle: "daily|x",
      versionContenu: "x",
      jour: 240,
      graine: 1,
      regle: "sang",
      valeur: 12,
      valeur2: 0,
      verdictBot: "humain",
      creeLe: Date.now(),
    });
    await appel("?a=suppression", { corps: {} });
    expect(await depot.mesPerfs(id, 10)).toEqual([]);
  });

  it("révoque les jetons déjà émis", async () => {
    const avant = jeton();
    await appel("?a=suppression", { corps: {} });
    expect((await appel("", { jeton: avant })).status).toBe(401);
  });
});

/* ------------------------------------------------------------------ *
 * Drapeaux
 * ------------------------------------------------------------------ */

describe("drapeaux", () => {
  it("se cumulent sans rien sanctionner", async () => {
    // On COMPTE, on ne punit pas : `analyseReactions` est un test statistique
    // et un joueur exceptionnel peut le déclencher. La décision reste humaine.
    expect(await depot.leveDrapeau(id)).toBe(1);
    expect(await depot.leveDrapeau(id)).toBe(2);
    expect((await appel("")).status).toBe(200);
  });

  it("un compte banni n'accède plus à rien", async () => {
    const u = (await depot.parId(id))!;
    await depot.cree({ ...u, banniLe: Date.now() }, { fournisseur: "google", idExterne: "g1" });
    expect((await appel("")).status).toBe(403);
  });
});

/* ------------------------------------------------------------------ *
 * Méthodes
 * ------------------------------------------------------------------ */

describe("méthodes", () => {
  it("le profil se lit en GET, la fusion s'écrit en POST", async () => {
    expect((await appel("", { methode: "POST", corps: {} })).status).toBe(405);
    expect((await appel("?a=fusion", { methode: "GET" })).status).toBe(405);
  });

  it("une action inconnue ne fait rien", async () => {
    expect((await appel("?a=n-importe-quoi", { corps: {} })).status).toBe(404);
  });
});
