/**
 * LE CONTRAT DU DÉPÔT — la même suite, sur les DEUX dépôts.
 *
 * Avant Prisma, la production tournait sur des fonctions SQL et les tests sur
 * `DepotMemoire`, qui en recopiait la loi : « les tests passent sur le dépôt
 * qui ne tourne pas » (CLAUDE.md §9, payé deux fois). Ici chaque scénario est
 * écrit UNE fois et passe sur les deux : une divergence fait tomber l'un des
 * deux, et c'est le seul filet qui le voie.
 *
 * `DepotPrisma` tourne contre un VRAI PostgreSQL quand `TOR_BASE_TEST_URL` est
 * posée. ⚠️ CETTE BASE EST EFFACÉE : le schéma `public` est détruit puis
 * reconstruit depuis `prisma/migrations/`, dans l'ordre — ce que
 * `prisma migrate deploy` ferait sur une base neuve. Dans le flux de
 * VÉRIFICATION, `TOR_BASE_EXIGEE=1` la rend obligatoire (un service PostgreSQL
 * y est fourni) : sans elle, la moitié qui compte ne tournerait pas, et le
 * vert mentirait. Le flux qui déploie les SALONS, lui, ne touche pas la base
 * et ne l'exige pas.
 *
 * Les tests de CONCURRENCE ne tournent que sur PostgreSQL : le dépôt en
 * mémoire est atomique par construction (aucun `await` entre lire et écrire),
 * il ne prouve rien sur les verrous.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DepotMemoire, utilisateurNeuf } from "../api/_depot";
import { DepotPrisma, clientPour } from "../api/_depot-prisma";
import type { Depot, Perf } from "../api/_depot";
import { agregatsVides } from "../shared/compte";
import type { Agregats } from "../shared/compte";
import { ONE_RULES } from "../src/engine/rules";
import { SKINS } from "../src/game/boutique";
import { CHAPITRES } from "../src/game/parcours";

const URL_BASE = process.env.TOR_BASE_TEST_URL?.trim() || null;

if (process.env.TOR_BASE_EXIGEE === "1" && !URL_BASE) {
  throw new Error("TOR_BASE_TEST_URL manquante alors que TOR_BASE_EXIGEE=1 : le contrat ne tournerait que sur le dépôt en mémoire");
}

const MIGRATIONS = join(__dirname, "..", "prisma", "migrations");
/**
 * `TOR_BASE_JUSQUA=<migration>` arrête la reconstruction APRÈS elle : c'est
 * ainsi qu'on prouve que le code tourne sur la base d'AVANT une migration
 * (l'ordre « code d'abord, puis migration » du déploiement, docs §8).
 */
const JUSQUA = process.env.TOR_BASE_JUSQUA?.trim() || null;

/** Reconstruit la base depuis les migrations, comme `migrate deploy` sur une base neuve. */
async function reconstruit(url: string): Promise<void> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("drop schema if exists public cascade; create schema public;");
    for (const d of readdirSync(MIGRATIONS, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort()) {
      await c.query(readFileSync(join(MIGRATIONS, d, "migration.sql"), "utf8"));
      if (d === JUSQUA) break;
    }
  } finally {
    await c.end();
  }
}

/** Vide ce qui appartient aux joueurs ; le catalogue reste. */
async function vide(url: string): Promise<void> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query(`truncate utilisateur, lien_plateforme, performance, statistique, meilleur_score, amitie,
      demande_ami, skin_utilisateur, achat, mouvement_pieces, carte_utilisateur, progression_chapitre cascade`);
  } finally {
    await c.end();
  }
}

async function sql<T = Record<string, unknown>>(texte: string, valeurs: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: URL_BASE! });
  await c.connect();
  try {
    return (await c.query(texte, valeurs)).rows as T[];
  } finally {
    await c.end();
  }
}

type Fabrique = () => Promise<Depot>;
const FABRIQUES: Array<[string, Fabrique]> = [["mémoire", async () => new DepotMemoire()]];
if (URL_BASE) {
  FABRIQUES.push(["postgres", async () => {
    await vide(URL_BASE);
    return new DepotPrisma(clientPour(URL_BASE));
  }]);
  beforeAll(() => reconstruit(URL_BASE), 60_000);
  afterAll(() => clientPour(URL_BASE).$disconnect());
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const lien = (x: string) => ({ fournisseur: "google", idExterne: `g-${x}` });
const cle = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;

const perf = (u: string, valeur: number, valeur2: number, extra: Partial<Perf> = {}): Perf => ({
  utilisateurId: u,
  mode: "daily",
  cle: "daily|v|j:300",
  versionContenu: "v",
  jour: 300,
  graine: 7,
  regle: "sang",
  valeur,
  valeur2,
  verdictBot: "humain",
  creeLe: 0,
  ...extra,
});

const carnet = (c: Agregats["carnet"]): Agregats => ({ ...agregatsVides(), carnet: c });

describe.each(FABRIQUES)("le dépôt (%s)", (nom, fabrique) => {
  let d: Depot;
  beforeEach(async () => {
    d = await fabrique();
  });
  const cree = async (...ids: string[]) => {
    for (const id of ids) await d.cree(utilisateurNeuf(id, 0), lien(id));
  };

  describe("comptes", () => {
    it("crée le compte et son lien ; le même lien rend le compte existant", async () => {
      const u = await d.cree({ ...utilisateurNeuf(A, 0), pseudo: "LÉA" }, lien(A));
      expect(u.id).toBe(A);
      expect(u.pseudo).toBe("LÉA");
      const encore = await d.cree(utilisateurNeuf(B, 0), lien(A));
      expect(encore.id).toBe(A);
      expect(await d.parId(B)).toBeNull();
      expect((await d.parLien(lien(A)))?.id).toBe(A);
      expect(await d.parLien(lien("x"))).toBeNull();
      expect(await d.parId("pas-un-uuid")).toBeNull();
    });

    it("offre le style par défaut à la création", async () => {
      await cree(A);
      expect(await d.boutique(A)).toEqual({ pieces: 0, porte: null, possedes: ["sticker"] });
    });

    it("les agrégats s'écrivent sous compare-and-swap", async () => {
      await cree(A);
      const a = carnet({ sang: { best: 4, cleared: false } } as Agregats["carnet"]);
      expect(await d.majAgregats(A, 0, a)).toBe(true);
      expect(await d.majAgregats(A, 0, a)).toBe(false);
      const u = await d.parId(A);
      expect(u?.revision).toBe(1);
      expect(u?.agregats.carnet.sang?.best).toBe(4);
      expect(await d.majAgregats(D, 0, a)).toBe(false);
    });

    it("identité, révocation et drapeaux", async () => {
      await cree(A);
      await d.majIdentite(A, "SAM", { glyphe: 12, carte: "sang" });
      const u = await d.parId(A);
      expect(u?.pseudo).toBe("SAM");
      expect(u?.apparence).toMatchObject({ glyphe: 12, carte: "sang" });
      expect(await d.revoque(A)).toBe(1);
      expect(await d.revoque(A)).toBe(2);
      expect(await d.revoque(D)).toBe(0);
      expect(await d.leveDrapeau(A)).toBe(1);
      expect(await d.leveDrapeau(D)).toBe(0);
    });
  });

  describe("projections du carnet", () => {
    it("rangées au MAXIMUM : une écriture plus faible ne fait rien reculer", async () => {
      await cree(A);
      await d.majAgregats(A, 0, carnet({
        sang: { best: 16, cleared: true, pieges: 2, runs: 5, etoiles: [3, 3, 3, 2, 1] },
        gaucher: { best: 3, cleared: false },
      } as Agregats["carnet"]));
      await d.majAgregats(A, 1, carnet({
        sang: { best: 2, cleared: false, pieges: 9, runs: 1, etoiles: [1, 0, 3, 3, 0] },
      } as Agregats["carnet"]));
      const col = await d.collection(A);
      expect(col.cartes.map((c) => c.regle)).toEqual(["gaucher", "sang"]);
      expect(col.cartes.find((c) => c.regle === "sang")).toMatchObject({ meilleur: 16, pieges: 9, runs: 5 });
      expect(col.chapitres).toEqual([{ regle: "sang", numero: 1, etoiles: [3, 3, 3, 3, 1], termine: true }]);
    });

    it("une règle inconnue du catalogue reste dans les agrégats, hors projection", async () => {
      await cree(A);
      expect(await d.majAgregats(A, 0, carnet({ inventee: { best: 3, cleared: false } } as Agregats["carnet"]))).toBe(true);
      expect((await d.collection(A)).cartes).toEqual([]);
      expect((await d.parId(A))?.agregats.carnet.inventee?.best).toBe(3);
    });
  });

  describe("performances — l'opposable", () => {
    it("améliorer, jamais remplacer par moins bien ; la statistique compte tout", async () => {
      await cree(A);
      expect(await d.posePerf(perf(A, 22, 9000))).toBe(true);
      expect(await d.posePerf(perf(A, 10, 1))).toBe(false);
      expect(await d.posePerf(perf(A, 22, 8000))).toBe(true);
      expect(await d.posePerf(perf(A, 22, 8500))).toBe(false);
      const col = await d.collection(A);
      expect(col.meilleurs).toEqual([{ mode: "daily", valeur: 22, valeur2: 8000 }]);
      expect(col.statistique).toEqual({ runsVerifies: 4, joursClasses: 1 });
      expect((await d.mesPerfs(A, 10)).map((p) => [p.valeur, p.valeur2, p.graine])).toEqual([[22, 8000, 7]]);
    });

    it("le classement : vérifié, humain, valeur puis durée ; le rang se compte", async () => {
      await cree(A, B, C, D);
      await d.majIdentite(B, "BOB", { glyphe: 3 });
      await d.posePerf(perf(A, 20, 500));
      await d.posePerf(perf(B, 20, 400));
      await d.posePerf(perf(C, 30, 900));
      await d.posePerf(perf(D, 99, 1, { verdictBot: "douteux" }));
      const top = await d.classement("daily|v|j:300", 10, B);
      expect(top.map((e) => [e.rang, e.valeur, e.valeur2, e.moi])).toEqual([
        [1, 30, 900, false],
        [2, 20, 400, true],
        [3, 20, 500, false],
      ]);
      expect(top[1]).toMatchObject({ pseudo: "BOB", glyphe: 3 });
      expect(Object.keys(top[0]!).sort()).toEqual(["glyphe", "moi", "pseudo", "rang", "valeur", "valeur2"]);
      expect(await d.rangDe("daily|v|j:300", 20, 500)).toBe(3);
      expect(await d.rangDe("daily|v|j:300", 25, 0)).toBe(2);
      expect(await d.scoresDuJour("daily|v|j:300")).toEqual([30, 20, 20]);
      // Le douteux est GARDÉ, jamais promu record.
      expect((await d.collection(D)).meilleurs).toEqual([]);
    });

    it("les performances des amis : le run du jour, humain, depuis un jour", async () => {
      await cree(A, B);
      await d.posePerf(perf(A, 5, 1, { jour: 290, cle: "daily|v|j:290" }));
      await d.posePerf(perf(A, 6, 1));
      await d.posePerf(perf(B, 7, 1, { verdictBot: "douteux" }));
      const l = await d.perfsDepuis([A, B, "nimporte"], 295);
      expect(l.map((p) => [p.utilisateurId, p.valeur, p.jour])).toEqual([[A, 6, 300]]);
      expect(await d.perfsDepuis([], 0)).toEqual([]);
    });
  });

  describe("amis", () => {
    it("le code ami : attribué une fois, unique, retenté sur collision", async () => {
      await cree(A, B);
      // Le même hasard pour les deux : le second tombe sur le code du premier.
      const fixe = () => {
        let n = 0;
        return () => (n++ < 6 ? 0.1 : 0.9);
      };
      const ca = await d.codeAmi(A, fixe());
      expect(await d.codeAmi(A, fixe())).toBe(ca);
      const cb = await d.codeAmi(B, fixe());
      expect(cb).not.toBe(ca);
      expect((await d.parCodeAmi(ca))?.id).toBe(A);
      expect(await d.parCodeAmi("ZZZZZZ")).toBeNull();
    });

    it("demander, se croiser, accepter, retirer, délier", async () => {
      await cree(A, B, C);
      expect(await d.demandeAmi(A, A, 50, 30)).toBe("soi");
      expect(await d.demandeAmi(A, B, 50, 30)).toBe("demande");
      expect(await d.demandeAmi(A, B, 50, 30)).toBe("demande");
      expect((await d.demandesVers(B)).map((x) => x.id)).toEqual([A]);
      expect((await d.demandesDe(A)).map((x) => x.id)).toEqual([B]);
      // La demande croisée vaut accord.
      expect(await d.demandeAmi(B, A, 50, 30)).toBe("lie");
      expect(await d.demandeAmi(A, B, 50, 30)).toBe("deja");
      expect((await d.amisDe(A)).map((x) => x.id)).toEqual([B]);
      expect((await d.amisDe(B)).map((x) => x.id)).toEqual([A]);
      expect(await d.demandesVers(B)).toEqual([]);
      // On n'accepte que ce qu'on a REÇU.
      expect(await d.demandeAmi(A, C, 50, 30)).toBe("demande");
      expect(await d.accepteAmi(A, C, 50)).toBe("inconnu");
      await d.retireDemande(A, C);
      expect(await d.demandesVers(C)).toEqual([]);
      await d.delie(B, A);
      expect(await d.amisDe(A)).toEqual([]);
      expect(await d.amisDe(B)).toEqual([]);
    });

    it("les plafonds : amis des DEUX côtés, demandes envoyées et reçues", async () => {
      await cree(A, B, C, D);
      expect(await d.demandeAmi(A, B, 1, 30)).toBe("demande");
      expect(await d.accepteAmi(B, A, 1)).toBe("lie");
      expect(await d.demandeAmi(C, A, 1, 30)).toBe("demande");
      expect(await d.accepteAmi(A, C, 1)).toBe("plein");
      expect(await d.demandeAmi(D, C, 50, 1)).toBe("demande");
      expect(await d.demandeAmi(D, B, 50, 1)).toBe("plein");
      expect(await d.demandeAmi(B, C, 50, 1)).toBe("plein");
    });
  });

  describe("boutique du compte", () => {
    it("importer une fois par appareil, acheter, rejouer, porter", async () => {
      await cree(A);
      const imp = await d.importeBoutique(A, "app-1", 400, ["bonbon", "inventé"]);
      expect(imp).toEqual({ pieces: 400, porte: null, possedes: ["sticker", "bonbon"], issue: "ok" });
      expect((await d.importeBoutique(A, "app-1", 400, [])).issue).toBe("deja");

      const ach = await d.acheteSkin(A, "neon", cle(1));
      expect(ach).toMatchObject({ issue: "ok", pieces: 250, porte: "neon" });
      expect(ach.possedes).toEqual(["sticker", "neon", "bonbon"]);
      expect(await d.acheteSkin(A, "neon", cle(1))).toMatchObject({ issue: "ok", rejoue: true, pieces: 250 });
      expect(await d.acheteSkin(A, "neon", cle(2))).toMatchObject({ issue: "deja", pieces: 250 });
      expect(await d.acheteSkin(A, "craie", cle(3))).toMatchObject({ issue: "pauvre", manque: 350, pieces: 250 });
      expect((await d.acheteSkin(A, "inconnu", cle(4))).issue).toBe("inconnu");

      expect(await d.porteSkin(A, "bonbon")).toBe(true);
      expect((await d.boutique(A))?.porte).toBe("bonbon");
      expect(await d.porteSkin(A, "pixel")).toBe(false);
    });

    it("un compte inconnu n'a pas de boutique", async () => {
      expect(await d.boutique(D)).toBeNull();
      expect((await d.acheteSkin(D, "neon", cle(1))).issue).toBe("inconnu");
      expect((await d.importeBoutique(D, "x", 10, [])).issue).toBe("inconnu");
      expect(await d.porteSkin(D, "sticker")).toBe(false);
    });
  });

  describe("suppression", () => {
    it("tout ce qui est personnel part ; le lien aussi, pour de bon", async () => {
      await cree(A, B);
      await d.majAgregats(A, 0, carnet({ sang: { best: 9, cleared: true, etoiles: [1, 1, 1, 1, 1] } } as Agregats["carnet"]));
      await d.posePerf(perf(A, 9, 9));
      await d.demandeAmi(A, B, 50, 30);
      await d.demandeAmi(B, A, 50, 30);
      await d.codeAmi(A, () => 0.5);
      await d.importeBoutique(A, "app", 300, []);
      await d.acheteSkin(A, "neon", cle(5));

      await d.supprime(A);
      expect(await d.parId(A)).toBeNull();
      expect(await d.parLien(lien(A))).toBeNull();
      expect(await d.classement("daily|v|j:300", 10)).toEqual([]);
      expect(await d.amisDe(B)).toEqual([]);
      expect(await d.boutique(A)).toBeNull();
      expect(await d.collection(A)).toEqual({ cartes: [], chapitres: [], meilleurs: [], statistique: null });
      // Le même fournisseur peut recréer un compte NEUF : rien n'est ressuscité.
      const neuf = await d.cree(utilisateurNeuf(C, 0), lien(A));
      expect(neuf.id).toBe(C);
      await d.supprime(D);
    });
  });

  // ------------------------------------------------------------------
  // Ce que seule une vraie base peut dire.
  // ------------------------------------------------------------------
  if (nom !== "postgres") return;

  describe("propre à PostgreSQL", () => {
    it("la bannière suit `apparence.carte`, dans la même écriture", async () => {
      await cree(A);
      await d.majIdentite(A, "", { glyphe: 0, carte: "azur" });
      const [r] = await sql<{ code: string | null }>(
        "select r.code from utilisateur u left join carte c on c.id = u.carte_banniere_id left join regle r on r.id = c.regle_id where u.id = $1", [A]);
      expect(r?.code).toBe("azur");
      await d.majIdentite(A, "", { glyphe: 0, carte: "inventee" });
      const [s] = await sql<{ b: string | null }>("select carte_banniere_id b from utilisateur where id = $1", [A]);
      expect(s?.b).toBeNull();
    });

    it("l'historique d'achats et le grand livre SURVIVENT à la suppression", async () => {
      await cree(A);
      await d.importeBoutique(A, "app", 300, []);
      await d.acheteSkin(A, "neon", cle(6));
      await d.supprime(A);
      const [n] = await sql<{ achats: number; mouvements: number; somme: number }>(
        "select (select count(*)::int from achat where utilisateur_id = $1) achats, (select count(*)::int from mouvement_pieces where utilisateur_id = $1) mouvements, (select coalesce(sum(delta), 0)::int from mouvement_pieces where utilisateur_id = $1) somme",
        [A]);
      expect(n).toEqual({ achats: 1, mouvements: 2, somme: 150 });
      const [u] = await sql<{ pieces: number; pseudo: string }>("select pieces, pseudo from utilisateur where id = $1", [A]);
      // Le grand livre dit vrai : somme(delta) = solde.
      expect(u).toEqual({ pieces: 150, pseudo: "" });
      // Et RIEN de personnel ne reste, table par table.
      for (const t of ["lien_plateforme", "performance", "statistique", "meilleur_score", "carte_utilisateur", "progression_chapitre", "skin_utilisateur"]) {
        expect(await sql(`select 1 from ${t} where utilisateur_id = $1`, [A]), t).toEqual([]);
      }
    });

    it("le catalogue en base suit le code (toutes migrations appliquées)", async () => {
      const regles = await sql<{ code: string; piege: boolean; maintien: boolean }>(
        "select code, piege, maintien from regle where retire_le is null order by code");
      expect(regles).toEqual(
        ONE_RULES.map((r) => ({ code: r.id, piege: r.traps, maintien: !!r.watchRelease })).sort((a, b) => (a.code < b.code ? -1 : 1)));
      const skins = await sql<{ code: string; prix: number }>("select code, prix from skin where retire_le is null order by ordre");
      expect(skins).toEqual(SKINS.map((x) => ({ code: x.id, prix: x.prix })));
      const chapitres = await sql<{ code: string }>(
        "select r.code from chapitre c join regle r on r.id = c.regle_id join mode_jeu m on m.id = c.mode_jeu_id where m.code = 'parcours' order by c.numero");
      expect(chapitres.map((c) => c.code)).toEqual([...CHAPITRES]);
    });

    /*
     * ⚠️ UNE COURSE NE SE GAGNE PAS À COUP SÛR. Jouée une fois, chacune de ces
     * courses passait AUSSI sans son verrou, deux fois sur trois (mesuré en
     * retirant chaque verrou) : la première transaction finissait souvent
     * avant que la seconde ne lise. Chaque course est donc rejouée TOURS fois
     * sur des comptes neufs ; sans verrou, la fenêtre est alors rencontrée.
     */
    const TOURS = 25;
    const neufs = async (n: number): Promise<string[]> => {
      const ids = Array.from({ length: n }, () => crypto.randomUUID());
      for (const id of ids) await d.cree(utilisateurNeuf(id, 0), lien(id));
      return ids;
    };

    it("CONCURRENCE — deux demandes croisées simultanées valent accord, jamais deux en attente", async () => {
      for (let t = 0; t < TOURS; t++) {
        const [x, y] = (await neufs(2)) as [string, string];
        const issues = await Promise.all([d.demandeAmi(x, y, 50, 30), d.demandeAmi(y, x, 50, 30)]);
        expect(issues.sort()).toEqual(["demande", "lie"]);
        expect(await d.demandesVers(x)).toEqual([]);
        expect(await d.demandesVers(y)).toEqual([]);
      }
    }, 60_000);

    it("CONCURRENCE — deux acceptations simultanées ne dépassent jamais le plafond", async () => {
      for (let t = 0; t < TOURS; t++) {
        const [x, y, z] = (await neufs(3)) as [string, string, string];
        await d.demandeAmi(y, x, 1, 30);
        await d.demandeAmi(z, x, 1, 30);
        const issues = await Promise.all([d.accepteAmi(x, y, 1), d.accepteAmi(x, z, 1)]);
        expect(issues.sort()).toEqual(["lie", "plein"]);
        expect((await d.amisDe(x)).length).toBe(1);
      }
    }, 60_000);

    it("CONCURRENCE — le même achat envoyé deux fois ne débite qu'une fois", async () => {
      for (let t = 0; t < TOURS; t++) {
        const [x] = (await neufs(1)) as [string];
        await d.importeBoutique(x, "app", 200, []);
        const r = await Promise.all([d.acheteSkin(x, "neon", cle(7)), d.acheteSkin(x, "neon", cle(7))]);
        expect(r.map((v) => v.issue)).toEqual(["ok", "ok"]);
        expect((await d.boutique(x))?.pieces).toBe(50);
        expect(await sql("select 1 from achat where utilisateur_id = $1", [x])).toHaveLength(1);
      }
    }, 60_000);

    it("CONCURRENCE — deux connexions simultanées sur le même lien : un seul compte", async () => {
      for (let t = 0; t < TOURS; t++) {
        const l = { fournisseur: "google", idExterne: `course-${t}` };
        const r = await Promise.all([
          d.cree(utilisateurNeuf(crypto.randomUUID(), 0), l),
          d.cree(utilisateurNeuf(crypto.randomUUID(), 0), l),
        ]);
        expect(r[0]!.id).toBe(r[1]!.id);
      }
      expect(await sql("select 1 from utilisateur u join lien_plateforme l on l.utilisateur_id = u.id where l.id_externe like 'course-%'")).toHaveLength(TOURS);
      expect(await sql("select 1 from utilisateur u left join lien_plateforme l on l.utilisateur_id = u.id where l.utilisateur_id is null")).toHaveLength(0);
    }, 60_000);

    it("CONCURRENCE — deux écritures à la même révision : une seule passe", async () => {
      for (let t = 0; t < TOURS; t++) {
        const [x] = (await neufs(1)) as [string];
        const r = await Promise.all([
          d.majAgregats(x, 0, carnet({ sang: { best: 1, cleared: false } } as Agregats["carnet"])),
          d.majAgregats(x, 0, carnet({ azur: { best: 1, cleared: false } } as Agregats["carnet"])),
        ]);
        expect(r.filter(Boolean)).toHaveLength(1);
        expect((await d.parId(x))?.revision).toBe(1);
        expect((await d.collection(x)).cartes).toHaveLength(1);
      }
    }, 60_000);

    it("CONCURRENCE — deux runs du jour simultanés : le meilleur reste, les deux comptent", async () => {
      for (let t = 0; t < TOURS; t++) {
        const [x] = (await neufs(1)) as [string];
        await Promise.all([d.posePerf(perf(x, 10, 5)), d.posePerf(perf(x, 12, 5))]);
        const col = await d.collection(x);
        expect(col.meilleurs[0]?.valeur).toBe(12);
        expect(col.statistique).toEqual({ runsVerifies: 2, joursClasses: 1 });
      }
    }, 60_000);
  });
});
