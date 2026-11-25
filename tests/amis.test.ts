/**
 * LES AMIS.
 *
 * Ce que ce fichier défend :
 *   · un code se dicte, se tape mal, et se lit quand même — ou pas du tout ;
 *   · le classement des amis départage COMME le podium du jour ;
 *   · on ne compare que du REJOUÉ (décision n°14) : ni agrégats, ni runs
 *     douteux, ni une autre version de contenu ;
 *   · rien ne publie un identifiant de compte ;
 *   · une amitié est mutuelle, et un compte supprimé disparaît de partout.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { traite } from "../api/amis";
import { DepotMemoire, nouvelId, utilisateurNeuf } from "../api/_depot";
import type { Perf } from "../api/_depot";
import { signeJeton } from "../server/jeton";
import { cleDuJour } from "../src/game/perfs";
import { VERSION_CONTENU } from "../src/engine/version";
import {
  classementDesAmis,
  codeAmiValide,
  CODE_AMI_ALPHABET,
  MAX_AMIS,
  nouveauCodeAmi,
  semaineDe,
} from "../shared/amis";
import type { Participant } from "../shared/amis";

const ENV = {
  TOR_AUTH_SECRET: "secret-de-test-assez-long-pour-ne-pas-etre-ridicule",
  DATABASE_URL: "postgresql://test@127.0.0.1:1/aucune",
};
const JOUR = 300;
const MAINTENANT = Date.UTC(2026, 0, 1) + JOUR * 86_400_000 + 12 * 3_600_000;

describe("le code ami", () => {
  it("se lit malgré les minuscules, les espaces et les tirets", () => {
    expect(codeAmiValide("abc-def")).toBe("ABCDEF");
    expect(codeAmiValide(" ab cd ef ")).toBe("ABCDEF");
  });

  it("refuse ce qui se confond à l'oral ou à l'écran, et le reste", () => {
    for (const v of ["ABCDE0", "ABCDEO", "ABCDE1", "ABCDEI", "ABCDEL", "ABCDE", "ABCDEFG", "", 42, null]) {
      expect(codeAmiValide(v), String(v)).toBeUndefined();
    }
  });

  it("un code neuf est toujours un code valide", () => {
    let x = 0.123;
    const h = () => (x = (x * 9301 + 0.49297) % 1);
    for (let i = 0; i < 500; i++) {
      const c = nouveauCodeAmi(h);
      expect(codeAmiValide(c)).toBe(c);
    }
    // les bornes du hasard aussi
    expect(nouveauCodeAmi(() => 0)).toBe(CODE_AMI_ALPHABET[0]!.repeat(6));
    expect(codeAmiValide(nouveauCodeAmi(() => 0.9999999))).toBeDefined();
  });
});

const p = (pseudo: string, auj: [number, number] | null, moi = false): Participant => ({
  code: pseudo.padEnd(6, "X").slice(0, 6),
  pseudo,
  glyphe: 0,
  carte: null,
  moi,
  aujourdhui: auj ? { valeur: auj[0], valeur2: auj[1] } : null,
  semaine: [],
  meilleur: null,
});

describe("le classement des amis", () => {
  it("départage comme le podium : score, puis DURÉE", () => {
    const l = classementDesAmis([p("LENT", [40, 90_000]), p("MOINS", [39, 1]), p("RAPIDE", [40, 60_000])]);
    expect(l.map((x) => x.pseudo)).toEqual(["RAPIDE", "LENT", "MOINS"]);
    expect(l.map((x) => x.rang)).toEqual([1, 2, 3]);
  });

  it("à égalité parfaite, le même rang — pas de vainqueur inventé", () => {
    const l = classementDesAmis([p("A", [20, 500]), p("B", [20, 500]), p("C", [10, 1])]);
    expect(l.map((x) => x.rang)).toEqual([1, 1, 3]);
  });

  it("ceux qui n'ont pas joué restent, sans rang, APRÈS — soi d'abord", () => {
    const l = classementDesAmis([p("ZOE", null), p("MOI", null, true), p("ANA", null), p("JOUE", [5, 1])]);
    expect(l.map((x) => x.pseudo)).toEqual(["JOUE", "MOI", "ANA", "ZOE"]);
    expect(l.map((x) => x.rang)).toEqual([1, null, null, null]);
  });
});

describe("la semaine", () => {
  it("un trou est un jour sans run, et l'ordre va du plus ancien au plus récent", () => {
    const perfs = [
      { jour: JOUR, cle: cleDuJour(JOUR), valeur: 12 },
      { jour: JOUR - 2, cle: cleDuJour(JOUR - 2), valeur: 7 },
    ];
    expect(semaineDe(perfs, JOUR, cleDuJour, 4)).toEqual([null, 7, null, 12]);
  });

  it("⚠️ un run d'une AUTRE version de contenu ne se compare pas", () => {
    const perfs = [{ jour: JOUR, cle: "daily|autre-version|" + JOUR, valeur: 40 }];
    expect(semaineDe(perfs, JOUR, cleDuJour, 1)).toEqual([null]);
  });
});

/* ------------------------------------------------------------------ *
 * La route
 * ------------------------------------------------------------------ */

let depot: DepotMemoire;
let graine = 1;
const hasard = () => {
  graine = (graine * 16807) % 2147483647;
  return graine / 2147483647;
};

beforeEach(() => {
  depot = new DepotMemoire();
  graine = 1;
});

async function compte(pseudo: string, carte?: string): Promise<string> {
  const id = nouvelId();
  const u = utilisateurNeuf(id, MAINTENANT);
  u.pseudo = pseudo;
  u.apparence = { glyphe: 3, ...(carte ? { carte } : {}) };
  await depot.cree(u, { fournisseur: "google", idExterne: pseudo });
  return id;
}

async function run(id: string, jour: number, valeur: number, extra: Partial<Perf> = {}): Promise<void> {
  await depot.posePerf({
    utilisateurId: id,
    mode: "daily",
    cle: cleDuJour(jour),
    versionContenu: VERSION_CONTENU,
    jour,
    graine: 1,
    regle: "sang",
    valeur,
    valeur2: 1000,
    verdictBot: "humain",
    creeLe: MAINTENANT,
    ...extra,
  });
}

const jetonDe = (id: string): string =>
  signeJeton({ sub: id, psd: "", gly: 0, vj: 0 }, ENV.TOR_AUTH_SECRET, MAINTENANT);

async function appel(id: string | null, methode = "GET", action?: string, corps?: unknown) {
  const u = new URL("https://www.theonerule.party/api/amis");
  if (action) u.searchParams.set("a", action);
  const res = await traite(
    new Request(u, {
      method: methode,
      headers: id ? { Authorization: `Bearer ${jetonDe(id)}` } : {},
      body: corps === undefined ? undefined : JSON.stringify(corps),
    }),
    ENV,
    depot,
    MAINTENANT,
    hasard,
  );
  // Réponse JSON BRUTE, lue champ par champ par chaque test : la typer
  // reviendrait à recopier ici le contrat qu'ils vérifient justement.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, corps: (await res.json()) as Record<string, any>, brut: res };
}

const codeDe = async (id: string): Promise<string> => (await appel(id)).corps.code as string;

/** Deux comptes deviennent amis PAR LE CHEMIN RÉEL : demande, puis acceptation. */
async function deviennentAmis(a: string, b: string): Promise<void> {
  await appel(a, "POST", "ajoute", { code: await codeDe(b) });
  const r = await appel(b, "POST", "accepte", { code: await codeDe(a) });
  expect(r.status).toBe(200);
}

const pseudos = (l: { pseudo: string }[]) => l.map((x) => x.pseudo).sort();

describe("la route des amis", () => {
  it("exige un compte — et ne lève jamais sans", async () => {
    expect((await appel(null)).status).toBe(401);
  });

  it("un déploiement sans comptes répond « indisponible », pas une erreur", async () => {
    const res = await traite(new Request("https://x/api/amis"), {}, undefined, MAINTENANT);
    expect(res.status).toBe(503);
  });

  it("donne un code STABLE : le même d'un appel à l'autre", async () => {
    const a = await compte("ALICE");
    const c1 = await codeDe(a);
    expect(codeAmiValide(c1)).toBe(c1);
    expect(await codeDe(a)).toBe(c1);
  });

  it("⚠️ ajouter un code ne lie PLUS : c'est une DEMANDE, que l'autre voit", async () => {
    // Rapporté par Pierre : « on ne lui demande même pas l'autorisation ».
    const a = await compte("ALICE");
    const b = await compte("BOB", "gaucher");
    const cb = await codeDe(b);
    const r = await appel(a, "POST", "ajoute", { code: cb.toLowerCase() });
    expect(r.status).toBe(200);
    expect(r.corps.issue).toBe("demande");
    expect(pseudos(r.corps.amis)).toEqual(["ALICE"]);
    expect(pseudos(r.corps.envoyees)).toEqual(["BOB"]);
    const vuParB = await appel(b);
    expect(pseudos(vuParB.corps.amis)).toEqual(["BOB"]);
    expect(pseudos(vuParB.corps.recues)).toEqual(["ALICE"]);
  });

  it("accepter lie les DEUX comptes et range la demande", async () => {
    const a = await compte("ALICE");
    const b = await compte("BOB", "gaucher");
    await appel(a, "POST", "ajoute", { code: await codeDe(b) });
    const r = await appel(b, "POST", "accepte", { code: await codeDe(a) });
    expect(r.corps.issue).toBe("lie");
    expect(pseudos(r.corps.amis)).toEqual(["ALICE", "BOB"]);
    expect(r.corps.recues).toHaveLength(0);
    const vuParA = await appel(a);
    expect(pseudos(vuParA.corps.amis)).toEqual(["ALICE", "BOB"]);
    expect(vuParA.corps.envoyees).toHaveLength(0);
    // la carte de visite suit
    expect(vuParA.corps.amis.find((x: { pseudo: string }) => x.pseudo === "BOB").carte).toBe("gaucher");
  });

  it("⚠️ on n'accepte que ce qu'on a REÇU — sinon « accepter » serait l'ajout forcé", async () => {
    const a = await compte("ALICE");
    const b = await compte("BOB");
    const r = await appel(a, "POST", "accepte", { code: await codeDe(b) });
    expect(r.status).toBe(404);
    expect(pseudos((await appel(b)).corps.amis)).toEqual(["BOB"]);
  });

  it("deux demandes croisées valent accord", async () => {
    const a = await compte("ALICE");
    const b = await compte("BOB");
    await appel(a, "POST", "ajoute", { code: await codeDe(b) });
    const r = await appel(b, "POST", "ajoute", { code: await codeDe(a) });
    expect(r.corps.issue).toBe("lie");
    expect(pseudos(r.corps.amis)).toEqual(["ALICE", "BOB"]);
  });

  it("refuser efface la demande, sans lier ni prévenir", async () => {
    const a = await compte("ALICE");
    const b = await compte("BOB");
    await appel(a, "POST", "ajoute", { code: await codeDe(b) });
    const r = await appel(b, "POST", "refuse", { code: await codeDe(a) });
    expect(r.corps.recues).toHaveLength(0);
    const vuParA = await appel(a);
    expect(vuParA.corps.envoyees).toHaveLength(0);
    expect(pseudos(vuParA.corps.amis)).toEqual(["ALICE"]);
    expect(JSON.stringify(vuParA.corps)).not.toMatch(/refus/i);
  });

  it("annuler retire sa propre demande", async () => {
    const a = await compte("ALICE");
    const b = await compte("BOB");
    const cb = await codeDe(b);
    await appel(a, "POST", "ajoute", { code: cb });
    expect((await appel(a, "POST", "annule", { code: cb })).corps.envoyees).toHaveLength(0);
    expect((await appel(b)).corps.recues).toHaveLength(0);
  });

  it("⚠️ une demande ne montre de son auteur que son visage — aucun score", async () => {
    const a = await compte("ALICE");
    const b = await compte("BOB");
    await run(a, JOUR, 17);
    await appel(a, "POST", "ajoute", { code: await codeDe(b) });
    const r = await appel(b);
    for (const d of r.corps.recues) expect(Object.keys(d).sort()).toEqual(["carte", "code", "glyphe", "pseudo"]);
    expect(JSON.stringify(r.corps.recues)).not.toContain(a);
    expect(JSON.stringify(r.corps.recues)).not.toContain("17");
  });

  it("refuse son propre code, un code inconnu, un code malformé", async () => {
    const a = await compte("ALICE");
    const ca = await codeDe(a);
    expect((await appel(a, "POST", "ajoute", { code: ca })).corps.error).toBe("soi");
    expect((await appel(a, "POST", "ajoute", { code: "ZZZZZZ" })).status).toBe(404);
    expect((await appel(a, "POST", "ajoute", { code: "0" })).status).toBe(400);
  });

  it("retirer délie dans les deux sens", async () => {
    const a = await compte("ALICE");
    const b = await compte("BOB");
    const cb = await codeDe(b);
    await deviennentAmis(a, b);
    await appel(a, "POST", "retire", { code: cb });
    expect((await appel(b)).corps.amis).toHaveLength(1);
    expect((await appel(a)).corps.amis).toHaveLength(1);
  });

  it(`plafonne à ${MAX_AMIS} amis — des deux côtés`, async () => {
    const cible = await compte("CIBLE");
    const cc = await codeDe(cible);
    for (let i = 0; i < MAX_AMIS; i++) {
      const x = await compte(`X${i}`);
      await deviennentAmis(x, cible);
    }
    expect((await appel(cible)).corps.amis).toHaveLength(MAX_AMIS + 1);
    const tard = await compte("TARD");
    expect((await appel(tard, "POST", "ajoute", { code: cc })).status).toBe(200);
    expect((await appel(cible, "POST", "accepte", { code: await codeDe(tard) })).corps.error).toBe("plein");
  });

  it("classe le cercle sur le run du jour, et compare la semaine", async () => {
    const a = await compte("ALICE");
    const b = await compte("BOB");
    await deviennentAmis(a, b);
    await run(a, JOUR, 12);
    await run(b, JOUR, 30);
    await run(b, JOUR - 1, 8);
    const l = (await appel(a)).corps.amis as { pseudo: string; rang: number; semaine: (number | null)[]; meilleur: number; moi: boolean }[];
    expect(l.map((x) => [x.pseudo, x.rang, x.moi])).toEqual([["BOB", 1, false], ["ALICE", 2, true]]);
    expect(l[0]!.semaine.slice(-2)).toEqual([8, 30]);
    expect(l[0]!.meilleur).toBe(30);
  });

  it("⚠️ un run jugé DOUTEUX ne compte pas, même entre amis", async () => {
    const a = await compte("ALICE");
    const b = await compte("BOB");
    await deviennentAmis(a, b);
    await run(b, JOUR, 40, { verdictBot: "douteux" });
    const bob = (await appel(a)).corps.amis.find((x: { pseudo: string }) => x.pseudo === "BOB");
    expect(bob.aujourdhui).toBeNull();
    expect(bob.meilleur).toBeNull();
  });

  it("⚠️ n'invente rien depuis les AGRÉGATS (décision n°14)", async () => {
    const a = await compte("ALICE");
    const b = await compte("BOB");
    await deviennentAmis(a, b);
    // BOB se déclare un record d'entraînement mirobolant : ça ne regarde que lui
    const u = (await depot.parId(b))!;
    u.agregats.records = { "training|x": 999 } as never;
    await depot.majAgregats(b, u.revision, u.agregats);
    const bob = (await appel(a)).corps.amis.find((x: { pseudo: string }) => x.pseudo === "BOB");
    expect(bob.meilleur).toBeNull();
    expect(JSON.stringify(bob)).not.toContain("999");
  });

  it("⚠️ ne publie JAMAIS un identifiant de compte", async () => {
    const a = await compte("ALICE");
    const b = await compte("BOB");
    await deviennentAmis(a, b);
    await run(b, JOUR, 5);
    const r = await appel(a);
    const brut = JSON.stringify(r.corps);
    expect(brut).not.toContain(a);
    expect(brut).not.toContain(b);
    // la liste EXACTE des clés publiées : une clé ajoutée doit l'être exprès
    for (const ligne of r.corps.amis) {
      expect(Object.keys(ligne).sort()).toEqual(
        ["aujourdhui", "carte", "code", "glyphe", "meilleur", "moi", "pseudo", "rang", "semaine"],
      );
    }
  });

  it("un compte supprimé disparaît de la liste de ses amis, et son code n'ouvre plus rien", async () => {
    const a = await compte("ALICE");
    const b = await compte("BOB");
    const cb = await codeDe(b);
    await deviennentAmis(a, b);
    await depot.supprime(b);
    expect((await appel(a)).corps.amis.map((x: { pseudo: string }) => x.pseudo)).toEqual(["ALICE"]);
    expect((await appel(a, "POST", "ajoute", { code: cb })).status).toBe(404);
  });
});
