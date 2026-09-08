/**
 * LE CLASSEMENT DU RUN DU JOUR.
 *
 * Ce que ce fichier défend tient en trois phrases.
 *
 * **Ce qu'un classement publie est public pour toujours.** On ne reprend pas ce
 * qu'on a publié : chaque champ rendu par cette route doit avoir été voulu, et
 * un identifiant de compte qui fuirait ne se rattraperait pas.
 *
 * **Un classement ne se lit qu'à clé de comparabilité égale.** Deux jours, deux
 * versions de contenu, deux réglages ne se comparent pas — et c'est la seule
 * chose qui empêche un tableau de mentir en silence.
 *
 * **Et il ne se nourrit que de ce qui a été REJOUÉ.** Le schéma le dit :
 * « douteux est conservé mais ne devra jamais alimenter un classement ». Une
 * phrase de commentaire ne défend rien ; ce fichier la rend exécutable.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { traite } from "../api/perf";
import { DepotMemoire, nouvelId, utilisateurNeuf } from "../api/_depot";
import type { Perf } from "../api/_depot";
import { signeJeton } from "../server/jeton";
import { cleDuJour } from "../src/game/perfs";
import { VERSION_CONTENU } from "../src/engine/version";

const ENV = {
  TOR_AUTH_SECRET: "secret-de-test-assez-long-pour-ne-pas-etre-ridicule",
  SUPABASE_URL: "https://exemple.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "cle",
};

const JOUR = 300;
const MAINTENANT = Date.UTC(2026, 0, 1) + JOUR * 86_400_000 + 12 * 3_600_000;

let depot: DepotMemoire;

/** Un compte, son pseudo, son signe — et une performance sous la clé du jour. */
async function pose(
  pseudo: string,
  glyphe: number,
  valeur: number,
  valeur2 = 0,
  extra: Partial<Perf> = {},
): Promise<string> {
  const id = nouvelId();
  const u = utilisateurNeuf(id, MAINTENANT);
  u.pseudo = pseudo;
  u.apparence = { glyphe };
  await depot.cree(u, { fournisseur: "google", idExterne: pseudo });
  await depot.posePerf({
    utilisateurId: id,
    mode: "daily",
    cle: cleDuJour(JOUR),
    versionContenu: VERSION_CONTENU,
    jour: JOUR,
    graine: 1,
    regle: "sang",
    valeur,
    valeur2,
    verdictBot: "humain",
    creeLe: MAINTENANT,
    ...extra,
  });
  return id;
}

const jetonDe = (id: string): string =>
  signeJeton({ sub: id, psd: "", gly: 0, vj: 0 }, ENV.TOR_AUTH_SECRET, MAINTENANT);

const lis = (opts: { jeton?: string; jour?: number; n?: number } = {}): Promise<Response> => {
  const u = new URL("https://www.theonerule.party/api/perf");
  u.searchParams.set("a", "top");
  u.searchParams.set("jour", String(opts.jour ?? JOUR));
  if (opts.n !== undefined) u.searchParams.set("n", String(opts.n));
  return traite(
    new Request(u, {
      method: "GET",
      headers: opts.jeton ? { Authorization: `Bearer ${opts.jeton}` } : {},
    }),
    ENV,
    depot,
    MAINTENANT,
  );
};

beforeEach(() => {
  depot = new DepotMemoire();
});

describe("le podium", () => {
  it("classe par score, puis départage sur la DURÉE", () => {
    /*
     * Le run du jour fait 40 manches et beaucoup de joueurs les finissent : sans
     * départage, le podium serait un tirage au sort entre ex æquo. La durée
     * croissante est déjà le second terme de l'index de la table — les deux
     * doivent dire la même chose, sinon le rang change selon qui le calcule.
     */
    return (async () => {
      await pose("LENT", 1, 40, 90_000);
      await pose("RAPIDE", 2, 40, 60_000);
      await pose("MOINS", 3, 39, 10_000);
      const r = await (await lis()).json();
      expect(r.top.map((e: { pseudo: string }) => e.pseudo)).toEqual(["RAPIDE", "LENT", "MOINS"]);
      expect(r.top.map((e: { rang: number }) => e.rang)).toEqual([1, 2, 3]);
    })();
  });

  it("s'arrête à TROIS par défaut", async () => {
    for (let i = 0; i < 8; i++) await pose(`J${i}`, 0, 40 - i);
    const r = await (await lis()).json();
    expect(r.top).toHaveLength(3);
  });

  it("borne ce qu'un appelant peut réclamer", async () => {
    for (let i = 0; i < 30; i++) await pose(`J${i}`, 0, 40 - i);
    const r = await (await lis({ n: 10_000 })).json();
    expect(r.top.length).toBeLessThanOrEqual(20);
  });
});

describe("⚠️ les paramètres MALFORMÉS ne rendent jamais un classement faux", () => {
  /*
   * DEUX MAUVAISES RÉPONSES SILENCIEUSES, et c'est ce qui les rendait graves :
   * la route répondait 200 avec un tableau vide, donc l'écran se taisait comme
   * il se tait quand personne n'a joué. Le joueur n'avait rien à réparer et
   * rien à signaler — le podium avait simplement disparu.
   *
   * Une URL est écrite à la main, parce que l'aide `lis` sérialise des
   * nombres et ne peut donc pas produire ces cas-là.
   */
  const brut = (q: string): Promise<Response> =>
    traite(
      new Request(`https://www.theonerule.party/api/perf?a=top&${q}`, { method: "GET" }),
      ENV,
      depot,
      MAINTENANT,
    );

  it("`?jour=` vide ne sert PAS le jour zéro", async () => {
    /*
     * `searchParams.get` rend la chaîne VIDE, pas `null` : le `??` ne se
     * déclenchait donc pas, et `Number("")` vaut 0 — un entier valide. La
     * route servait le classement du 1er janvier 2026, forcément vide.
     */
    await pose("PIERRE", 1, 40);
    const r = await (await brut("jour=")).json();
    expect(r.jour, "un jour vide doit retomber sur AUJOURD'HUI").toBe(JOUR);
    expect(r.top).toHaveLength(1);
  });

  it("`?jour=abc` reste un 400, il ne devine rien", async () => {
    expect((await brut("jour=abc")).status).toBe(400);
  });

  it("`?n=abc` ne vide pas le podium", async () => {
    /*
     * `Math.min` et `Math.max` PROPAGENT NaN : la limite partait telle quelle
     * jusqu'au dépôt — `LIMIT NaN` côté Supabase, `slice(0, NaN)` en mémoire,
     * donc zéro ligne. On retombe sur le défaut plutôt que sur le vide.
     */
    for (let i = 0; i < 5; i++) await pose(`J${i}`, i, 40 - i);
    const r = await (await brut(`jour=${JOUR}&n=abc`)).json();
    expect(r.top).toHaveLength(3);
  });

  it("`?n=2.7` ne demande pas deux virgule sept lignes au dépôt", async () => {
    for (let i = 0; i < 5; i++) await pose(`J${i}`, i, 40 - i);
    const r = await (await brut(`jour=${JOUR}&n=2.7`)).json();
    expect(r.top).toHaveLength(2);
  });
});

describe("ce que le classement PUBLIE", () => {
  it("⚠️ ne laisse fuiter aucun identifiant de compte", async () => {
    /*
     * Le champ le plus facile à laisser passer, et le seul qu'on ne pourra pas
     * reprendre. Un identifiant publié permet de suivre quelqu'un d'un jour à
     * l'autre, de le relier à un salon, et il n'apporte rien : le pseudo et le
     * signe suffisent à le reconnaître.
     */
    const id = await pose("PIERRE", 7, 40);
    const brut = await (await lis({ jeton: jetonDe(id) })).text();
    expect(brut).not.toContain(id);
    const r = JSON.parse(brut);
    expect(Object.keys(r.top[0]).sort()).toEqual(
      ["glyphe", "moi", "pseudo", "rang", "valeur", "valeur2"].sort(),
    );
  });

  it("marque MA ligne, et elle seule", async () => {
    const moi = await pose("MOI", 1, 30);
    await pose("AUTRE", 2, 40);
    const r = await (await lis({ jeton: jetonDe(moi) })).json();
    const miennes = r.top.filter((e: { moi: boolean }) => e.moi);
    expect(miennes).toHaveLength(1);
    expect(miennes[0].pseudo).toBe("MOI");
  });

  it("se lit SANS compte — le podium n'est pas un privilège", async () => {
    /*
     * Le jeu se joue sans compte (décision n°12) ; le podium se regarde de
     * même. Un jeton absent, faux ou périmé rend un classement anonyme, jamais
     * une erreur : c'est la doctrine « absent vaut anonyme », appliquée ici.
     */
    await pose("QUELQUUN", 0, 40);
    for (const j of [undefined, "n-importe-quoi"]) {
      const res = await lis({ jeton: j });
      expect(res.status).toBe(200);
      const r = await res.json();
      expect(r.top).toHaveLength(1);
      expect(r.top[0].moi).toBe(false);
      expect(r.moi).toBeNull();
    }
  });
});

describe("ce que le classement REFUSE", () => {
  it("⚠️ n'affiche jamais une performance jugée DOUTEUSE", async () => {
    /*
     * Le schéma de la migration l'exige en toutes lettres. Filtrer à
     * l'affichage aurait laissé la porte ouverte au prochain appelant : c'est
     * le dépôt qui refuse, donc personne ne peut l'oublier.
     */
    await pose("BOT", 0, 40, 1000, { verdictBot: "douteux" });
    await pose("HUMAIN", 0, 12);
    const r = await (await lis()).json();
    expect(r.top.map((e: { pseudo: string }) => e.pseudo)).toEqual(["HUMAIN"]);
  });

  it("ne mélange pas deux jours", async () => {
    await pose("AUJOURDHUI", 0, 40);
    const autre = nouvelId();
    await depot.cree(utilisateurNeuf(autre, MAINTENANT), { fournisseur: "google", idExterne: "x" });
    await depot.posePerf({
      utilisateurId: autre,
      mode: "daily",
      cle: cleDuJour(JOUR - 1),
      versionContenu: VERSION_CONTENU,
      jour: JOUR - 1,
      graine: 1,
      regle: "sang",
      valeur: 999,
      valeur2: 0,
      verdictBot: "humain",
      creeLe: MAINTENANT,
    });
    const r = await (await lis()).json();
    expect(r.top).toHaveLength(1);
    expect(r.top[0].pseudo).toBe("AUJOURDHUI");
  });

  it("ne mélange pas deux versions de contenu", async () => {
    /*
     * Ajouter une règle change `VERSION_CONTENU`, donc la clé, donc le
     * classement repart. C'est voulu : un score obtenu sur douze règles ne se
     * compare pas à un score obtenu sur seize.
     */
    await pose("APRES", 0, 20);
    const vieux = nouvelId();
    await depot.cree(utilisateurNeuf(vieux, MAINTENANT), { fournisseur: "google", idExterne: "v" });
    await depot.posePerf({
      utilisateurId: vieux,
      mode: "daily",
      cle: `daily|{}|ancienne-version|${JOUR}`,
      versionContenu: "ancienne-version",
      jour: JOUR,
      graine: 1,
      regle: "sang",
      valeur: 40,
      valeur2: 0,
      verdictBot: "humain",
      creeLe: MAINTENANT,
    });
    const r = await (await lis()).json();
    expect(r.top.map((e: { pseudo: string }) => e.pseudo)).toEqual(["APRES"]);
  });
});

describe("mon rang quand je ne suis pas sur le podium", () => {
  it("compte ceux qui font strictement mieux", async () => {
    for (let i = 0; i < 5; i++) await pose(`TETE${i}`, 0, 40 - i);
    const moi = await pose("MOI", 0, 12);
    const r = await (await lis({ jeton: jetonDe(moi) })).json();
    expect(r.top.some((e: { moi: boolean }) => e.moi)).toBe(false);
    expect(r.moi).toEqual({ rang: 6, valeur: 12, valeur2: 0 });
  });

  it("le rang départage comme le podium — sinon les deux écrans divergent", async () => {
    await pose("A", 0, 40, 50_000);
    await pose("B", 0, 40, 60_000);
    await pose("C", 0, 40, 70_000);
    const moi = await pose("MOI", 0, 40, 80_000);
    const r = await (await lis({ jeton: jetonDe(moi) })).json();
    expect(r.moi.rang).toBe(4);
  });

  it("reste NUL quand je n'ai pas joué ce jour-là", async () => {
    await pose("AUTRE", 0, 40);
    const id = nouvelId();
    await depot.cree(utilisateurNeuf(id, MAINTENANT), { fournisseur: "google", idExterne: "z" });
    const r = await (await lis({ jeton: jetonDe(id) })).json();
    expect(r.moi).toBeNull();
  });

  it("n'est PAS recalculé quand je suis déjà sur le podium", async () => {
    // Économie de requêtes, mais surtout : deux sources pour un même rang
    // finiraient par diverger. Sur le podium, le rang est celui de la ligne.
    const moi = await pose("MOI", 0, 40);
    const r = await (await lis({ jeton: jetonDe(moi) })).json();
    expect(r.top[0].moi).toBe(true);
    expect(r.moi).toBeNull();
  });
});
