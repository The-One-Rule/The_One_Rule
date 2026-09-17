/**
 * L'avis demandé après la deuxième partie : quand il paraît, et ce qui arrive
 * vraiment au serveur.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AVIS_MAX, doitDemanderAvis, nettoieAvis } from "../src/game/avis";
import handler from "../api/collect";

const base = { runsAcheves: 2, dejaVu: false, mesureOn: true, mesureDemandee: false, collecte: true };

describe("quand l'avis se demande", () => {
  it("après la deuxième partie, pas avant", () => {
    expect(doitDemanderAvis({ ...base, runsAcheves: 1 })).toBe(false);
    expect(doitDemanderAvis(base)).toBe(true);
    expect(doitDemanderAvis({ ...base, runsAcheves: 5 })).toBe(true);
  });

  it("⚠️ une seule fois, répondu ou non", () => {
    expect(doitDemanderAvis({ ...base, dejaVu: true })).toBe(false);
  });

  it("⚠️ jamais sur le même écran que le bandeau de mesure", () => {
    expect(doitDemanderAvis({ ...base, mesureDemandee: true })).toBe(false);
  });

  it("⚠️ jamais à qui a coupé la mesure : son texte n'arriverait nulle part", () => {
    expect(doitDemanderAvis({ ...base, mesureOn: false })).toBe(false);
    expect(doitDemanderAvis({ ...base, collecte: false })).toBe(false);
  });
});

describe("le mot libre", () => {
  it("resserre les blancs et se coupe à la limite", () => {
    expect(nettoieAvis("  trop   dur\n\nau début  ")).toBe("trop dur au début");
    expect(nettoieAvis("x".repeat(500))).toHaveLength(AVIS_MAX);
    expect(nettoieAvis("   ")).toBe("");
  });
});

describe("ce que le serveur garde", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function lignesPour(batch: unknown[]): Promise<Record<string, unknown>[]> {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "jeton");
    let corps = "";
    vi.stubGlobal("fetch", (_u: string, init: RequestInit) => {
      corps = String(init.body);
      return Promise.resolve(new Response("[]", { status: 200 }));
    });
    const res = await handler(
      new Request("https://exemple.test/api/collect", {
        method: "POST",
        body: JSON.stringify({ id: "abc", day: 2, batch }),
      }),
    );
    expect(res.status).toBe(204);
    const [push] = JSON.parse(corps) as string[][];
    return push!.slice(2).map((l) => JSON.parse(l) as Record<string, unknown>);
  }

  it("le mot d'un avis garde ses 280 caractères", async () => {
    const texte = "a".repeat(300);
    const [ligne] = await lignesPour([{ ev: "avis_mot", ts: 1, note: 3, texte }]);
    expect(ligne!.ev).toBe("avis_mot");
    expect(String(ligne!.texte)).toHaveLength(280);
    expect(ligne!.note).toBe(3);
  });

  it("⚠️ un `texte` glissé dans un AUTRE événement reste coupé à 40", async () => {
    // Sinon l'endpoint public devient un dépôt de texte arbitraire.
    const texte = "b".repeat(300);
    const lignes = await lignesPour([
      { ev: "run_end", ts: 1, texte },
      { ev: "avis", ts: 1, texte },
    ]);
    for (const l of lignes) expect(String(l.texte), String(l.ev)).toHaveLength(40);
    // … et dans l'avis lui-même, seule la clé `texte` a droit à la longueur.
    const [mot] = await lignesPour([{ ev: "avis_mot", ts: 1, autre: texte }]);
    expect(String(mot!.autre)).toHaveLength(40);
  });
});
