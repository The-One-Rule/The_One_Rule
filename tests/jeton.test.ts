/**
 * Le jeton de compte.
 *
 * Ce que ce fichier protège vraiment : TOR a deux back-ends qui doivent lire
 * le même jeton, avec deux primitives cryptographiques différentes — edge
 * Vercel (`crypto.subtle`, asynchrone) et salons Fly (`node:crypto`,
 * synchrone). Deux chemins peuvent diverger pendant des mois sans qu'aucun
 * test ne s'en plaigne, et le symptôme serait « le multijoueur ne me
 * reconnaît pas » : indébogable, parce que rien ne casse — on retombe
 * simplement en anonyme, silencieusement, ce qui est le comportement NORMAL
 * de la dégradation.
 *
 * D'où le croisement systématique : on signe avec l'un, on vérifie avec
 * l'autre, dans les deux sens.
 */
import { describe, expect, it } from "vitest";

import {
  DUREE_JETON_MS,
  DUREE_MAX_MS,
  FENETRE_RENOUVELLEMENT_MS,
  JETON_MAX,
  TOLERANCE_HORLOGE_MS,
  b64url,
  corps,
  deB64url,
  decoupe,
  fraicheur,
  renouvelable,
  revendicationsPour,
} from "../shared/jeton";
import type { Frappe } from "../shared/jeton";

import { signeJeton as signeNode, verifieJeton as verifieNode } from "../server/jeton";
import { signeJeton as signeEdge, verifieJeton as verifieEdge, verifieJetonRenouvelable } from "../api/_jeton";

const SECRET = "un-secret-de-test-suffisamment-long-pour-etre-credible";
const T0 = 1_800_000_000_000;

const frappe = (sur: Partial<Frappe> = {}): Frappe => ({
  sub: "u_01J8ZQK7X2",
  psd: "PIERRE",
  gly: 42,
  vj: 3,
  ...sur,
});

/* ------------------------------------------------------------------ *
 * Le croisement — la seule raison d'être de ce fichier
 * ------------------------------------------------------------------ */

describe("les deux back-ends lisent le même jeton", () => {
  it("signé côté salons, vérifié côté edge", async () => {
    const j = signeNode(frappe(), SECRET, T0);
    const r = await verifieEdge(j, SECRET, T0 + 1000);
    expect(r).not.toBeNull();
    expect(r!.sub).toBe("u_01J8ZQK7X2");
    expect(r!.psd).toBe("PIERRE");
    expect(r!.gly).toBe(42);
    expect(r!.vj).toBe(3);
  });

  it("signé côté edge, vérifié côté salons", async () => {
    const j = await signeEdge(frappe(), SECRET, T0);
    const r = verifieNode(j, SECRET, T0 + 1000);
    expect(r).not.toBeNull();
    expect(r!.sub).toBe("u_01J8ZQK7X2");
  });

  it("produisent OCTET POUR OCTET le même jeton", async () => {
    // C'est l'assertion qui a des dents : si un jour l'un des deux ajoutait un
    // champ, changeait l'ordre des clés ou le remplissage base64, les deux
    // tests précédents continueraient de passer tant que le format reste
    // lisible des deux côtés. Celui-ci tombe.
    expect(signeNode(frappe(), SECRET, T0)).toBe(await signeEdge(frappe(), SECRET, T0));
  });
});

/* ------------------------------------------------------------------ *
 * Ce qui doit être refusé
 * ------------------------------------------------------------------ */

describe("un jeton frelaté est refusé", () => {
  it("charge modifiée", async () => {
    const j = signeNode(frappe(), SECRET, T0);
    const [entete, , sig] = j.split(".") as [string, string, string];
    const autre = b64url(
      new TextEncoder().encode(
        JSON.stringify(revendicationsPour(frappe({ sub: "u_quelquun_dautre" }), T0)),
      ),
    );
    const forge = `${entete}.${autre}.${sig}`;
    expect(verifieNode(forge, SECRET, T0)).toBeNull();
    expect(await verifieEdge(forge, SECRET, T0)).toBeNull();
  });

  it("signature modifiée", async () => {
    const j = signeNode(frappe(), SECRET, T0);
    const parts = j.split(".");
    // On retourne un bit du dernier caractère plutôt que de le remplacer :
    // remplacer pourrait retomber sur le même octet après décodage base64url.
    const sig = deB64url(parts[2]!)!;
    sig[0] = sig[0]! ^ 1;
    const forge = `${parts[0]}.${parts[1]}.${b64url(sig)}`;
    expect(forge).not.toBe(j);
    expect(verifieNode(forge, SECRET, T0)).toBeNull();
    expect(await verifieEdge(forge, SECRET, T0)).toBeNull();
  });

  it("secret différent", async () => {
    const j = signeNode(frappe(), SECRET, T0);
    expect(verifieNode(j, SECRET + "x", T0)).toBeNull();
    expect(await verifieEdge(j, SECRET + "x", T0)).toBeNull();
  });

  it("secret vide — un déploiement sans secret ne doit authentifier personne", async () => {
    const j = signeNode(frappe(), SECRET, T0);
    expect(verifieNode(j, "", T0)).toBeNull();
    expect(await verifieEdge(j, "", T0)).toBeNull();
  });

  it("en-tête « alg: none » et autres en-têtes exotiques", () => {
    const r = revendicationsPour(frappe(), T0);
    const charge = b64url(new TextEncoder().encode(JSON.stringify(r)));
    for (const entete of [
      { alg: "none", typ: "JWT" },
      { alg: "HS512", typ: "JWT" },
      { alg: "RS256", typ: "JWT" },
      { typ: "JWT", alg: "HS256" }, // même contenu, ordre des clés différent
    ]) {
      const e = b64url(new TextEncoder().encode(JSON.stringify(entete)));
      expect(decoupe(`${e}.${charge}.${"A".repeat(43)}`), JSON.stringify(entete)).toBeNull();
    }
  });

  it("formes dégénérées", () => {
    for (const mauvais of [
      "",
      "a",
      "a.b",
      "a.b.c.d",
      null,
      undefined,
      42,
      {},
      "x".repeat(JETON_MAX + 1),
    ]) {
      expect(decoupe(mauvais as unknown)).toBeNull();
    }
  });

  it("un jeton trop long est refusé AVANT tout décodage", () => {
    // La socket est plafonnée à 4096 octets ; le plafond de jeton évite qu'on
    // dépense du décodage base64 sur une charge envoyée pour ça.
    const j = signeNode(frappe(), SECRET, T0);
    expect(decoupe(j)).not.toBeNull();
    expect(decoupe(j + "x".repeat(JETON_MAX))).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Le temps
 * ------------------------------------------------------------------ */

describe("fraîcheur", () => {
  it("valide pendant sa durée, refusé après", async () => {
    const j = signeNode(frappe(), SECRET, T0);
    expect(verifieNode(j, SECRET, T0 + DUREE_JETON_MS - 1)).not.toBeNull();
    expect(verifieNode(j, SECRET, T0 + DUREE_JETON_MS)).toBeNull();
    expect(await verifieEdge(j, SECRET, T0 + DUREE_JETON_MS)).toBeNull();
  });

  it("tolère une horloge en avance, refuse une émission absurde", () => {
    const r = revendicationsPour(frappe(), T0);
    expect(fraicheur(r, T0 - TOLERANCE_HORLOGE_MS + 1000).ok).toBe(true);
    expect(fraicheur(r, T0 - TOLERANCE_HORLOGE_MS - 1000)).toEqual({
      ok: false,
      raison: "emis_dans_le_futur",
    });
  });

  it("refuse une durée de vie aberrante", () => {
    // Ne protège pas d'un secret fuité — ça, rien ne le fait. Attrape une
    // émission fautive de notre propre code, qui resterait sinon invisible
    // jusqu'au jour où il faudrait révoquer.
    const r = { ...revendicationsPour(frappe(), T0), exp: T0 + DUREE_MAX_MS + 1 };
    expect(fraicheur(r, T0)).toEqual({ ok: false, raison: "duree_aberrante" });
  });

  it("distingue périmé de frelaté — l'API doit pouvoir proposer un rafraîchissement", () => {
    const r = revendicationsPour(frappe(), T0);
    expect(fraicheur(r, T0 + DUREE_JETON_MS)).toEqual({ ok: false, raison: "perime" });
  });
});

/* ------------------------------------------------------------------ *
 * Renouvellement d'un jeton périmé
 * ------------------------------------------------------------------ */

describe("renouvelable — un jour d'absence ne déconnecte plus", () => {
  it("frais : renouvelable", () => {
    expect(renouvelable(revendicationsPour(frappe(), T0), T0 + 1000)).toEqual({ ok: true });
  });

  it("périmé depuis deux jours : encore renouvelable", () => {
    const r = revendicationsPour(frappe(), T0);
    const apres = T0 + DUREE_JETON_MS + 2 * 24 * 3_600_000;
    expect(fraicheur(r, apres).ok).toBe(false);
    expect(renouvelable(r, apres)).toEqual({ ok: true });
  });

  it("périmé depuis plus que la fenêtre : fini", () => {
    const r = revendicationsPour(frappe(), T0);
    expect(renouvelable(r, T0 + DUREE_JETON_MS + FENETRE_RENOUVELLEMENT_MS + 1)).toEqual({ ok: false, raison: "perime" });
  });

  it("la fenêtre ne blanchit ni un jeton du futur ni une durée aberrante", () => {
    const futur = revendicationsPour(frappe(), T0 + 10 * 60_000);
    expect(renouvelable(futur, T0).ok).toBe(false);
    const aberrant = { ...revendicationsPour(frappe(), T0), exp: T0 + DUREE_MAX_MS + 1 };
    expect(renouvelable(aberrant, T0).ok).toBe(false);
  });

  it("verifieJetonRenouvelable exige toujours la signature", async () => {
    const vieux = signeNode(frappe(), SECRET, T0);
    const apres = T0 + DUREE_JETON_MS + 3 * 24 * 3_600_000;
    expect(await verifieEdge(vieux, SECRET, apres)).toBeNull();
    expect(await verifieJetonRenouvelable(vieux, SECRET, apres)).not.toBeNull();
    expect(await verifieJetonRenouvelable(vieux, SECRET + "x", apres)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Revendications malformées
 * ------------------------------------------------------------------ */

describe("revendications", () => {
  const avec = (patch: Record<string, unknown>): string => {
    const r = { ...revendicationsPour(frappe(), T0), ...patch };
    const c = corps(r as never);
    return `${c}.${"A".repeat(43)}`;
  };

  it("refuse ce qui n'a pas la bonne forme", () => {
    for (const patch of [
      { sub: "" },
      { sub: "x".repeat(65) },
      { sub: 12 },
      { psd: "x".repeat(15) },
      { gly: -1 },
      { gly: 1.5 },
      { gly: "42" },
      { vj: -1 },
      { vj: null },
      { iat: "hier" },
      { exp: NaN },
    ]) {
      expect(decoupe(avec(patch)), JSON.stringify(patch)).toBeNull();
    }
  });

  it("accepte un pseudo vide — un compte fraîchement lié n'en a pas encore", () => {
    expect(decoupe(avec({ psd: "" }))).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Base64url
 * ------------------------------------------------------------------ */

describe("base64url", () => {
  it("aller-retour sur des octets arbitraires", () => {
    const o = new Uint8Array(256);
    for (let i = 0; i < 256; i++) o[i] = i;
    expect(Array.from(deB64url(b64url(o))!)).toEqual(Array.from(o));
  });

  it("n'émet ni +, ni /, ni remplissage", () => {
    const o = new Uint8Array([251, 255, 190, 254, 0, 1]);
    const s = b64url(o);
    expect(s).not.toMatch(/[+/=]/);
    expect(Array.from(deB64url(s)!)).toEqual(Array.from(o));
  });

  it("refuse un alphabet invalide", () => {
    expect(deB64url("abc!def")).toBeNull();
    expect(deB64url("abc+def")).toBeNull();
  });
});
