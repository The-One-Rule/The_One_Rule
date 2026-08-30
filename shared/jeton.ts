/**
 * Le jeton de compte — noyau PUR.
 *
 * Ce fichier ne signe rien et ne vérifie rien : il encode, décode et juge des
 * revendications. La primitive HMAC est fournie par l'appelant, et c'est
 * délibéré — TOR a DEUX back-ends qui doivent lire le même jeton :
 *
 *   · les fonctions edge Vercel (`api/`), où la seule crypto disponible est
 *     `crypto.subtle`, donc ASYNCHRONE ;
 *   · le serveur de salons Fly (`server/`), où le `hello` est traité dans un
 *     `switch` SYNCHRONE, et où rendre la vérification asynchrone ouvrirait
 *     une course : `create` ou `join` peuvent arriver avant que le jeton soit
 *     vérifié, et le joueur entrerait dans le salon sous son identité anonyme.
 *
 * D'où le découpage : la logique — encodage, revendications, péremption,
 * version de jeton — est écrite UNE fois et testée ici ; chaque côté n'apporte
 * que son HMAC-SHA256 (`crypto.subtle` d'un côté, `node:crypto` de l'autre).
 * `tests/jeton.test.ts` signe avec l'un et vérifie avec l'autre, dans les deux
 * sens : c'est ce qui interdit à ces deux chemins de diverger en silence.
 *
 * Le format est un JWT HS256 ordinaire. Rien d'inventé : un format maison
 * serait un format non relu.
 */

/* ------------------------------------------------------------------ *
 * Constantes
 * ------------------------------------------------------------------ */

/**
 * 24 h.
 *
 * La révocation (`vj`) ne peut PAS être vérifiée par le serveur de salons : il
 * n'a pas de base, et lui en donner une mettrait un aller-retour réseau sur le
 * chemin d'entrée du multijoueur — exactement ce que l'architecture refuse.
 * La durée de vie du jeton EST donc la fenêtre de révocation en multi. 24 h
 * avec rafraîchissement silencieux à l'ouverture de l'app : le rayon d'action
 * reste borné sans qu'aucun joueur ne voie jamais une reconnexion.
 */
export const DUREE_JETON_MS = 24 * 60 * 60 * 1000;

/**
 * Tolérance d'horloge. Un navigateur peut être en avance ; refuser un jeton
 * pour trois secondes de dérive ferait retomber le joueur en anonyme sans
 * qu'il puisse rien y comprendre.
 */
export const TOLERANCE_HORLOGE_MS = 120_000;

/**
 * Plafond de durée accepté à la LECTURE.
 *
 * Ne protège pas contre un secret fuité — avec le secret, tout est perdu de
 * toute façon. Il attrape une émission fautive de notre propre code : un jeton
 * de dix ans passerait sinon inaperçu jusqu'au jour où il faudrait révoquer.
 */
export const DUREE_MAX_MS = 7 * 24 * 60 * 60 * 1000;

/** Longueur maximale acceptée. La socket est plafonnée à 4096 octets de charge. */
export const JETON_MAX = 1024;

/* ------------------------------------------------------------------ *
 * Revendications
 * ------------------------------------------------------------------ */

export interface Revendications {
  /**
   * `utilisateur.id` — opaque.
   *
   * Jamais dérivé d'un e-mail ni d'un identifiant de plateforme : c'est la
   * seule chose qui rendra Steam ou Epic gratuits plus tard (une ligne de
   * plus dans `lien_plateforme`, aucune reprise de données).
   */
  sub: string;
  /** Pseudo affiché. Voyage dans le jeton pour que Fly n'ait rien à demander. */
  psd: string;
  /**
   * Glyphe.
   *
   * Voyage comme une VALEUR, pas comme une dérivation de `sub`. C'est ce qui
   * laisse la porte ouverte à un glyphe possédé, choisi, gagné : le jour où il
   * faudra vérifier qu'un joueur a le droit de porter ce signe, la
   * vérification se pose à l'émission du jeton, en un seul endroit, sans
   * toucher ni au protocole ni aux salons.
   */
  gly: number;
  /** Version de jeton : la révocation à une colonne (voir `DUREE_JETON_MS`). */
  vj: number;
  /** Émission, en ms epoch. */
  iat: number;
  /** Péremption, en ms epoch. */
  exp: number;
}

/** Ce que l'appelant fournit pour frapper un jeton ; le reste est calculé. */
export interface Frappe {
  sub: string;
  psd: string;
  gly: number;
  vj: number;
}

/* ------------------------------------------------------------------ *
 * Base64url
 * ------------------------------------------------------------------ */

const ENC = new TextEncoder();
const DEC = new TextDecoder();

export function b64url(octets: Uint8Array): string {
  let binaire = "";
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deB64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binaire = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
    const out = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) out[i] = binaire.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

const b64urlTexte = (s: string): string => b64url(ENC.encode(s));

/* ------------------------------------------------------------------ *
 * Encodage
 * ------------------------------------------------------------------ */

/** En-tête figé. Le `alg` est vérifié à la lecture : voir `decoupe`. */
const ENTETE = b64urlTexte(JSON.stringify({ alg: "HS256", typ: "JWT" }));

/** Les revendications complètes d'une frappe, à `maintenant` donné. */
export function revendicationsPour(f: Frappe, maintenant: number): Revendications {
  return {
    sub: f.sub,
    psd: f.psd,
    gly: f.gly,
    vj: f.vj,
    iat: maintenant,
    exp: maintenant + DUREE_JETON_MS,
  };
}

/** La partie signée : `entete.charge`. C'est elle qu'on passe au HMAC. */
export function corps(r: Revendications): string {
  return `${ENTETE}.${b64urlTexte(JSON.stringify(r))}`;
}

/** Le jeton complet. */
export const assemble = (corpsSigne: string, signature: Uint8Array): string =>
  `${corpsSigne}.${b64url(signature)}`;

/* ------------------------------------------------------------------ *
 * Décodage
 * ------------------------------------------------------------------ */

export interface Decoupe {
  /** La partie à repasser au HMAC pour comparer. */
  corps: string;
  /**
   * `Uint8Array<ArrayBuffer>` et non `Uint8Array` : `crypto.subtle` refuse un
   * `ArrayBufferLike`, qui pourrait être un `SharedArrayBuffer`. Le type large
   * compilait ici et cassait chez l'appelant edge.
   */
  signature: Uint8Array<ArrayBuffer>;
  revendications: Revendications;
}

/**
 * Découpe un jeton SANS vérifier sa signature.
 *
 * Sépare deux responsabilités qui n'ont pas la même nature : celle-ci est
 * pure et testable partout, la vérification cryptographique dépend de la
 * plateforme. Un appelant qui utiliserait cette fonction seule n'aurait
 * vérifié RIEN — d'où le nom, qui ne promet rien.
 */
export function decoupe(jeton: unknown): Decoupe | null {
  if (typeof jeton !== "string" || !jeton || jeton.length > JETON_MAX) return null;
  const parts = jeton.split(".");
  if (parts.length !== 3) return null;
  const [entete, charge, sig] = parts as [string, string, string];

  // L'en-tête est figé : refuser tout ce qui n'est pas exactement le nôtre
  // ferme d'emblée la famille d'attaques « alg: none » et « alg: RS256 ».
  if (entete !== ENTETE) return null;

  const signature = deB64url(sig);
  if (!signature || signature.length !== 32) return null;

  const brut = deB64url(charge);
  if (!brut) return null;

  let r: unknown;
  try {
    r = JSON.parse(DEC.decode(brut));
  } catch {
    return null;
  }
  if (!estRevendications(r)) return null;

  return { corps: `${entete}.${charge}`, signature, revendications: r };
}

function estRevendications(r: unknown): r is Revendications {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.sub === "string" &&
    o.sub.length > 0 &&
    o.sub.length <= 64 &&
    typeof o.psd === "string" &&
    o.psd.length <= 14 &&
    typeof o.gly === "number" &&
    Number.isInteger(o.gly) &&
    o.gly >= 0 &&
    typeof o.vj === "number" &&
    Number.isInteger(o.vj) &&
    o.vj >= 0 &&
    typeof o.iat === "number" &&
    Number.isFinite(o.iat) &&
    typeof o.exp === "number" &&
    Number.isFinite(o.exp)
  );
}

/* ------------------------------------------------------------------ *
 * Fraîcheur
 * ------------------------------------------------------------------ */

export type Fraicheur = { ok: true } | { ok: false; raison: string };

/**
 * Juge les revendications dans le temps. Signature déjà vérifiée par ailleurs.
 *
 * Renvoie une RAISON parce que les deux appelants n'en font pas la même chose :
 * l'API doit distinguer « périmé, rafraîchis » de « frelaté, oublie », le
 * serveur de salons, lui, retombe en anonyme dans les deux cas.
 */
export function fraicheur(r: Revendications, maintenant: number): Fraicheur {
  if (r.exp <= maintenant) return { ok: false, raison: "perime" };
  if (r.iat > maintenant + TOLERANCE_HORLOGE_MS) return { ok: false, raison: "emis_dans_le_futur" };
  if (r.exp - r.iat > DUREE_MAX_MS) return { ok: false, raison: "duree_aberrante" };
  return { ok: true };
}
