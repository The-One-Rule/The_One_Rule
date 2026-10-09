/**
 * `api/authcb.ts` est le retour OAuth RÉEL en production (Google refuse une
 * URI de redirection qui porte `?a=callback`), et aucun test ne l'appelait :
 * la couverture le donnait à 0 %. Ce qu'il doit faire tient en une phrase —
 * rappeler `traite` avec l'action forcée — donc un seul cas suffit à
 * prouver qu'il passe la main au bon endroit : un état forgé y est refusé
 * exactement comme sur `?a=callback`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import authcb from "../api/authcb";

afterEach(() => vi.unstubAllEnvs());

describe("le point d'entrée du retour OAuth", () => {
  it("rejoue le retour de `api/auth.ts`, sans paramètre d'action", async () => {
    vi.stubEnv("TOR_AUTH_SECRET", "secret-de-test-assez-long-pour-ne-pas-etre-ridicule");
    vi.stubEnv("TOR_APP_URL", "https://www.theonerule.party");
    vi.stubEnv("SUPABASE_URL", "https://exemple.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "cle");
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
    const res = await authcb(new Request("https://www.theonerule.party/api/authcb?code=c&state=forge"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("#compte=etat_invalide");
  });
});
