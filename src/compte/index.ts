/**
 * Le compte, côté client.
 *
 * UNE règle de conduite, et elle prime sur tout le reste : **aucune fonction
 * de ce module ne lève, et aucune ne bloque quoi que ce soit.** Serveur
 * indisponible, jeton périmé, `localStorage` inaccessible en navigation
 * privée, déploiement sans comptes : dans tous les cas on retombe sur
 * « anonyme, et on joue ». C'est la généralisation de la décision n°4 de
 * CLAUDE.md — une coupure n'est pas une défaite.
 *
 * Ce module ne touche PAS au DOM. L'interface s'y abonne, il ne connaît aucun
 * écran.
 *
 * Le jeton vit dans `localStorage` et non dans un cookie : il doit de toute
 * façon voyager dans le `hello` de la socket, ce qu'un cookie `httpOnly` ne
 * saurait pas faire, et deux emplacements pour la même chose finiraient par
 * être en désaccord. Le prix est l'exposition au XSS — d'où l'invariant tenu
 * par `tests/invariants-compte.test.ts` : aucun texte venu d'un joueur n'est
 * jamais rendu en `innerHTML`.
 */

import { decoupe, fraicheur, renouvelable } from "../../shared/jeton";
import type { Agregats } from "../../shared/compte";
import { cleanEnv } from "../env";
import { glyphFromIndex } from "../net/glyph";
import type { Glyph } from "../../shared/protocol";

const CLE = "oneRule.compte.v1";
const POINT = cleanEnv(import.meta.env.VITE_AUTH_URL as string | undefined) ?? "/api/auth";

/* ------------------------------------------------------------------ *
 * État local
 * ------------------------------------------------------------------ */

export interface EtatCompte {
  /** Le jeton brut, tel qu'il part dans le `hello`. */
  jeton: string;
  /** `utilisateur.id`. */
  id: string;
  pseudo: string;
  glyphe: number;
  /** Péremption, pour décider d'un rafraîchissement. */
  exp: number;
}

let etat: EtatCompte | null = null;
let charge = false;

/**
 * Relit un jeton stocké SANS vérifier sa signature.
 *
 * Le client n'a pas le secret et n'a rien à vérifier : le jeton n'est pas une
 * preuve pour lui, c'est une preuve qu'il PRÉSENTE. Il en lit le contenu pour
 * afficher un pseudo, rien de plus. Le seul contrôle utile ici est la
 * péremption, parce qu'un jeton périmé doit déclencher un rafraîchissement
 * plutôt qu'un envoi voué au refus.
 */
function litJetonLocal(jeton: string, maintenant: number): EtatCompte | null {
  const d = decoupe(jeton);
  if (!d) return null;
  if (!fraicheur(d.revendications, maintenant).ok) return null;
  const r = d.revendications;
  return { jeton, id: r.sub, pseudo: r.psd, glyphe: r.gly, exp: r.exp };
}

function ecrit(jeton: string | null): void {
  try {
    if (jeton) localStorage.setItem(CLE, jeton);
    else localStorage.removeItem(CLE);
  } catch {
    /* navigation privée : on vit sans mémoire, le jeu tourne quand même */
  }
}

/** Le jeton stocké, tel quel — frais, périmé ou absent. */
function brutStocke(): string | null {
  try {
    return localStorage.getItem(CLE);
  } catch {
    return null;
  }
}

/** Un jeton stocké, même périmé, qui peut encore être échangé contre un neuf. */
function jetonRenouvelable(maintenant: number): string | null {
  const brut = brutStocke();
  const d = brut ? decoupe(brut) : null;
  return d && renouvelable(d.revendications, maintenant).ok ? brut : null;
}

/**
 * L'état courant. `null` = anonyme, ce qui est un état parfaitement normal.
 *
 * ⚠️ L'EXPIRATION SE RELIT À CHAQUE APPEL. Elle n'était lue qu'au premier :
 * un onglet resté ouvert plus de 24 h — un téléphone garde la page des jours
 * durant — se croyait encore connecté, et chaque envoi partait avec un jeton
 * que le serveur refusait. Le symptôme : un score du jour « non enregistré »
 * chez quelqu'un qui voyait son compte affiché.
 *
 * ⚠️ ET UN JETON PÉRIMÉ N'EST PLUS JETÉ s'il reste renouvelable
 * (`FENETRE_RENOUVELLEMENT_MS`) : c'est lui que `rafraichit` échange contre un
 * neuf. Le jeter déconnectait en silence quiconque revenait après un jour.
 * Il n'ouvre rien d'autre : `compte()` rend `null` tant qu'il n'est pas frais.
 */
export function compte(maintenant: number = Date.now()): EtatCompte | null {
  if (!charge) {
    charge = true;
    try {
      const brut = brutStocke();
      etat = brut ? litJetonLocal(brut, maintenant) : null;
      // Irrécupérable (frelaté, ou périmé depuis trop longtemps) : on le jette,
      // sinon chaque ouverture retenterait un échange voué au refus.
      if (brut && !etat && !jetonRenouvelable(maintenant)) ecrit(null);
    } catch {
      etat = null;
    }
  }
  if (etat && etat.exp <= maintenant) etat = null;
  return etat;
}

/**
 * La session peut-elle revenir sans que le joueur ne fasse rien ?
 * Vrai quand le jeton a expiré mais reste renouvelable : dans ce cas on ne lui
 * demande PAS de se reconnecter, on renouvelle.
 */
export const sessionRecuperable = (maintenant: number = Date.now()): boolean =>
  !compte(maintenant) && jetonRenouvelable(maintenant) !== null;

export const estConnecte = (maintenant?: number): boolean => compte(maintenant) !== null;

/** Le jeton à mettre dans le `hello`, ou `undefined`. Ne lève jamais. */
export const jetonPourSalon = (): string | undefined => compte()?.jeton;

/** Le signe du compte, prêt à afficher. */
export const glypheDuCompte = (): Glyph | null => {
  const c = compte();
  return c ? glyphFromIndex(c.glyphe) : null;
};

/* ------------------------------------------------------------------ *
 * Retour de connexion
 * ------------------------------------------------------------------ */

export type RetourConnexion =
  | { quoi: "aucun" }
  | { quoi: "connecte"; etat: EtatCompte }
  | { quoi: "refus"; code: string };

/**
 * Lit le fragment posé par `api/auth.ts` au retour du fournisseur.
 *
 * Le jeton arrive dans le FRAGMENT et jamais dans la query : un fragment ne
 * quitte pas le navigateur — ni journaux serveur, ni `Referer`, ni proxy.
 *
 * On n'efface QUE notre paramètre, pas tout le fragment : un lien
 * d'invitation (`#j=CODE`) peut cohabiter, et `readInvite()` doit encore le
 * trouver. Effacer le hash entier reviendrait à avaler l'invitation d'un ami.
 */
export function litRetourConnexion(maintenant: number = Date.now()): RetourConnexion {
  if (typeof location === "undefined") return { quoi: "aucun" };
  const m = /[#&]compte=([^&]+)/.exec(location.hash);
  if (!m) return { quoi: "aucun" };

  const valeur = decodeURIComponent(m[1]!);
  try {
    const reste = location.hash.replace(/([#&])compte=[^&]*/, (_t, d: string) =>
      d === "#" ? "#" : "",
    );
    const propre = reste === "#" || reste === "" ? "" : reste;
    history.replaceState(null, "", location.pathname + location.search + propre);
  } catch {
    /* environnement sans history */
  }

  const lu = litJetonLocal(valeur, maintenant);
  if (!lu) return { quoi: "refus", code: valeur.slice(0, 24) };

  etat = lu;
  charge = true;
  ecrit(lu.jeton);
  return { quoi: "connecte", etat: lu };
}

/* ------------------------------------------------------------------ *
 * Réseau
 * ------------------------------------------------------------------ */

async function appel<T>(chemin: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const jeton = compte()?.jeton;
    const res = await fetch(`${POINT}${chemin}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // hors ligne : l'appelant reste anonyme
  }
}

/** Les fournisseurs réellement branchés sur ce déploiement. */
export async function fournisseurs(): Promise<string[]> {
  const r = await appel<{ fournisseurs?: string[] }>("?a=fournisseurs");
  return r?.fournisseurs ?? [];
}

/**
 * Part se connecter. Ne revient jamais : la page est remplacée.
 *
 * C'est une NAVIGATION et non une fenêtre surgissante : les bloqueurs de
 * fenêtres refusent la seconde une fois sur deux sur mobile, et l'échec y est
 * silencieux.
 */
export function connexion(fournisseur: string): void {
  try {
    location.assign(`${POINT}?a=start&f=${encodeURIComponent(fournisseur)}`);
  } catch {
    /* rien à faire de plus */
  }
}

/**
 * Rafraîchit le jeton s'il approche de sa fin.
 *
 * C'est ce qui rend la révocation effective en 24 h côté salons : le serveur
 * de salons ne peut pas vérifier `version_jeton`, donc la durée de vie du
 * jeton EST la fenêtre de révocation. Appelé à l'ouverture, jamais dans une
 * boucle.
 *
 * Un échec ne déconnecte PAS : le jeton en cours reste valable jusqu'à sa
 * péremption, et une panne réseau de trois secondes ne doit pas coûter son
 * compte à quelqu'un.
 */
export function rafraichit(maintenant: number = Date.now()): Promise<void> {
  // Un seul renouvellement en vol : l'ouverture, le retour sur l'onglet et la
  // fin d'un run du jour peuvent le demander dans la même seconde.
  if (!renouvellement) {
    renouvellement = renouvelle(maintenant).finally(() => {
      renouvellement = null;
    });
  }
  return renouvellement;
}

let renouvellement: Promise<void> | null = null;

async function renouvelle(maintenant: number): Promise<void> {
  const c = compte(maintenant);
  let jeton: string;
  if (c) {
    // Moins de six heures devant soi : on renouvelle. Au-delà, on ne dépense
    // pas une requête à chaque ouverture d'onglet.
    if (c.exp - maintenant > 6 * 60 * 60 * 1000) return;
    jeton = c.jeton;
  } else {
    // Périmé mais renouvelable : c'est le cas du joueur qui revient après
    // plus d'une journée. Sans compte ni jeton, rien à faire.
    const r = jetonRenouvelable(maintenant);
    if (!r) return;
    jeton = r;
  }

  let res: Response;
  try {
    res = await fetch(`${POINT}?a=refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jeton}` },
    });
  } catch {
    return; // hors ligne : on réessaiera, le jeton reste où il est
  }
  if (res.status === 401 || res.status === 403) {
    // Révoqué, supprimé, banni ou trop vieux : c'est une vraie déconnexion.
    // On ne jette que si le jeton n'est plus frais — un frais reste valable
    // jusqu'à sa fin, et un refus passager ne doit rien coûter.
    if (!c) {
      ecrit(null);
      etat = null;
    }
    return;
  }
  if (!res.ok) return;
  const j = (await res.json().catch(() => ({}))) as { jeton?: string };
  if (!j.jeton) return;
  const lu = litJetonLocal(j.jeton, Date.now());
  if (!lu) return;
  etat = lu;
  charge = true;
  ecrit(lu.jeton);
}

/**
 * Se déconnecter sur CET appareil.
 *
 * On efface d'abord, on prévient le serveur ensuite : si le réseau tombe, le
 * joueur doit tout de même être déconnecté ici. L'inverse laisserait quelqu'un
 * connecté sur un ordinateur qu'il vient de quitter.
 */
export function deconnexion(): void {
  void appel("?a=revoke", { method: "POST" });
  etat = null;
  charge = true;
  ecrit(null);
}

/** Remplace l'état après une écriture serveur (fusion, renommage). */
export function poseJeton(jeton: string, maintenant: number = Date.now()): boolean {
  const lu = litJetonLocal(jeton, maintenant);
  if (!lu) return false;
  etat = lu;
  charge = true;
  ecrit(lu.jeton);
  return true;
}

/** Tests uniquement : repart d'un état vierge. */
export function reinitialise(): void {
  etat = null;
  charge = false;
}

/* ------------------------------------------------------------------ *
 * Le compte lui-même
 * ------------------------------------------------------------------ */

const POINT_MOI = cleanEnv(import.meta.env.VITE_MOI_URL as string | undefined) ?? "/api/moi";

export interface Moi {
  id: string;
  pseudo: string;
  glyphe: number;
  agregats: Agregats;
  creeLe: number;
}

async function appelMoi<T>(chemin: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const jeton = compte()?.jeton;
    if (!jeton) return null;
    const res = await fetch(`${POINT_MOI}${chemin}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
        Authorization: `Bearer ${jeton}`,
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Le profil serveur, ou `null` si hors ligne — jamais une exception. */
export async function profil(): Promise<Moi | null> {
  const r = await appelMoi<{ moi?: Moi }>("");
  return r?.moi ?? null;
}

/**
 * LA revendication : la progression de cet appareil rejoint le compte.
 *
 * Renvoie les agrégats fusionnés par le serveur, que l'appelant réinjecte
 * dans la sauvegarde locale. Comme la fusion est une union et un maximum, la
 * réinjection ne peut rien perdre — même si l'appareil a continué de jouer
 * pendant l'aller-retour.
 */
export async function revendique(payload: {
  agregats: Agregats;
  pseudo: string;
  glyphe: number;
}): Promise<Moi | null> {
  const r = await appelMoi<{ moi?: Moi; jeton?: string }>("?a=fusion", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!r?.moi) return null;
  // Le jeton porte le pseudo et le signe : sans le remplacer, le salon
  // continuerait d'annoncer l'ancien nom jusqu'à la péremption.
  if (r.jeton) poseJeton(r.jeton);
  return r.moi;
}

export interface PerfPublique {
  mode: string;
  jour: number | null;
  regle: string;
  valeur: number;
  valeur2: number;
  versionContenu: string;
  creeLe: number;
}

/** L'historique personnel — uniquement le sien, il n'existe pas d'autre route. */
export async function mesPerfs(): Promise<PerfPublique[]> {
  const r = await appelMoi<{ perfs?: PerfPublique[] }>("?a=perfs");
  return r?.perfs ?? [];
}

/**
 * Un appel à `api/perf`, calqué sur celui de `api/moi`.
 *
 * Le point d'entrée est réglable par variable de build comme les autres : un
 * déploiement peut servir les fonctions ailleurs que sous le même domaine.
 */
const POINT_PERF = cleanEnv(import.meta.env.VITE_PERF_URL as string | undefined) ?? "/api/perf";

async function appelPerf<T>(suffixe: string): Promise<T | null> {
  // Le jeton s'il existe, et rien de plus : contrairement à `appelMoi`, son
  // absence n'annule pas l'appel — le podium se regarde sans compte.
  const j = compte()?.jeton;
  try {
    const r = await fetch(`${POINT_PERF}${suffixe}`, {
      headers: j ? { Authorization: `Bearer ${j}` } : {},
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * LE CLASSEMENT DU JOUR
 * ------------------------------------------------------------------ */

export interface EntreeClassement {
  rang: number;
  pseudo: string;
  glyphe: number;
  valeur: number;
  valeur2: number;
  moi: boolean;
}

export interface Classement {
  jour: number;
  top: EntreeClassement[];
  moi: { rang: number; valeur: number; valeur2: number } | null;
}

/**
 * Le podium du jour.
 *
 * Le jeton part s'il existe, mais il n'est pas exigé : le podium se regarde
 * sans compte, comme le jeu se joue sans compte. Un jeton valide ajoute
 * seulement sa propre ligne marquée, et son rang quand on n'y est pas.
 *
 * Renvoie `null` sur n'importe quel échec — déploiement sans comptes, réseau
 * coupé, base lente. L'appelant n'affiche alors rien : un classement absent
 * n'est pas une panne à signaler au joueur, c'est un écran de moins.
 */
export async function classementDuJour(jour: number): Promise<Classement | null> {
  return appelPerf<Classement>(`?a=top&jour=${jour}`);
}

/**
 * Les scores vérifiés du jour, sans personne derrière — le rang anonyme du
 * rival (`game/rival.ts`). `null` hors ligne ou sans comptes au déploiement :
 * le rival se tait alors, il ne devine rien.
 */
export async function scoresDuJour(jour: number): Promise<number[] | null> {
  const r = await appelPerf<{ scores?: unknown }>(`?a=repartition&jour=${jour}`);
  if (!r || !Array.isArray(r.scores)) return null;
  return r.scores.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

/**
 * Supprime le compte, définitivement.
 *
 * Efface aussi l'état local : rester « connecté » à un compte qui n'existe
 * plus ne mènerait qu'à des 401 silencieux. La progression LOCALE, elle,
 * reste — supprimer son compte n'est pas se punir, et le jeu doit continuer
 * exactement comme avant.
 */
export async function supprimeCompte(): Promise<boolean> {
  const r = await appelMoi<{ supprime?: boolean }>("?a=suppression", { method: "POST" });
  if (!r?.supprime) return false;
  etat = null;
  charge = true;
  ecrit(null);
  return true;
}

/** Renomme, ou change de signe. */
export async function changeIdentite(
  pseudo: string,
  glyphe: number,
  /** La carte de visite : ce que les AMIS voient. `null` la retire. */
  carte: string | null = null,
): Promise<Moi | null> {
  const r = await appelMoi<{ moi?: Moi; jeton?: string }>("?a=identite", {
    method: "POST",
    body: JSON.stringify({ pseudo, glyphe, carte }),
  });
  if (!r?.moi) return null;
  if (r.jeton) poseJeton(r.jeton);
  return r.moi;
}
