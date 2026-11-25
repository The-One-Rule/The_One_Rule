/**
 * Le dépôt — tout l'accès aux comptes passe par ici.
 *
 * Même parti pris que l'interface `Store` de `api/_ranked.ts`, et pour la même
 * raison : une implémentation en mémoire fait tourner les tests et le local,
 * une implémentation PostgreSQL fait tourner la production, et c'est le seul
 * fichier à toucher pour en changer.
 *
 * La production passe par PRISMA (ADR 0012, `api/_depot-prisma.ts`, qui porte
 * aussi `depotConfigure`) : les fonctions `api/` tournent
 * en runtime Node et ouvrent une vraie connexion Postgres (le pooler de
 * Supabase), donc de vraies transactions. Avant, elles tournaient en edge,
 * sans socket TCP, et parlaient à l'API REST de Supabase — d'où les fonctions
 * SQL de 0009, seules transactions possibles alors (ADR 0011, remplacée).
 *
 * ⚠️ La connexion porte les droits du PROPRIÉTAIRE des tables : le RLS sans
 * politique (posé par chaque migration) ne bloque que la clé publique du
 * navigateur, jamais ce dépôt. L'adresse ne quitte donc jamais le serveur.
 *
 * ⚠️ Les imports relatifs portent leur extension `.js` : en runtime Node,
 * Vercel transpile fichier par fichier sans regrouper, et Node refuse un
 * import ESM sans extension (`tests/imports-node.test.ts`).
 *
 * Le préfixe `_` empêche Vercel de transformer ce module en point d'entrée.
 */

import { agregatsVides } from "../shared/compte.js";
import type { Agregats, Apparence } from "../shared/compte.js";
import { litReponseAchat } from "../shared/boutique.js";
import type { EtatBoutiqueCompte, ReponseAchat, ReponseImport } from "../shared/boutique.js";
import { projette } from "./_projection.js";
import { SKINS, SKIN_DEFAUT } from "../src/game/boutique.js";
import { CHAPITRES } from "../src/game/parcours.js";
import type { LigneCarte, LigneChapitre } from "./_projection.js";
import { nouveauCodeAmi } from "../shared/amis.js";

/* ------------------------------------------------------------------ *
 * Le modèle
 * ------------------------------------------------------------------ */

export interface Utilisateur {
  id: string;
  pseudo: string;
  apparence: Apparence;
  agregats: Agregats;
  /** Concurrence optimiste : voir `majAgregats`. */
  revision: number;
  versionJeton: number;
  drapeaux: number;
  creeLe: number;
  banniLe: number | null;
  supprimeLe: number | null;
}

export interface Lien {
  fournisseur: string;
  idExterne: string;
}

/**
 * Une performance VÉRIFIÉE.
 *
 * Le score n'est jamais celui qu'un client affirme : c'est celui que
 * `verifyRun` produit en rejouant le journal d'entrées. Voir la migration
 * 0002 pour la raison de ne rien mettre d'autre dans cette table.
 */
export interface Perf {
  utilisateurId: string;
  mode: string;
  cle: string;
  versionContenu: string;
  jour: number | null;
  graine: number;
  regle: string;
  valeur: number;
  valeur2: number;
  verdictBot: string;
  creeLe: number;
}

/**
 * Une ligne de classement — et RIEN de plus.
 *
 * Pas d'identifiant de compte, pas de date, pas de graine. Ce qu'un classement
 * publie sort du périmètre de son propriétaire : tout champ ajouté ici devient
 * public pour toujours, et on ne reprend pas ce qu'on a publié. Le pseudo et le
 * signe suffisent à reconnaître quelqu'un — c'est exactement ce à quoi ils
 * servent déjà dans les salons.
 *
 * `moi` est calculé côté serveur en comparant à l'appelant : le client n'a donc
 * jamais besoin de savoir QUI sont les autres pour se situer parmi eux.
 */
export interface EntreeClassement {
  rang: number;
  pseudo: string;
  glyphe: number;
  valeur: number;
  valeur2: number;
  moi: boolean;
}

export interface Depot {
  parLien(l: Lien): Promise<Utilisateur | null>;
  parId(id: string): Promise<Utilisateur | null>;
  /** Crée le compte ET son lien. Les deux ou aucun. */
  cree(u: Utilisateur, l: Lien): Promise<Utilisateur>;
  /**
   * Écrit les agrégats SI la révision n'a pas bougé.
   *
   * Renvoie `false` en cas de conflit — l'appelant relit et refusionne. La
   * fusion étant une union et un maximum, rejouer ne peut rien détruire ;
   * c'est ce qui rend cette boucle sûre plutôt que délicate.
   */
  majAgregats(id: string, revisionAttendue: number, a: Agregats): Promise<boolean>;
  majIdentite(id: string, pseudo: string, apparence: Apparence): Promise<void>;
  revoque(id: string): Promise<number>;
  /** Efface le compte : logique côté utilisateur, DÉFINITIF côté liens. */
  supprime(id: string): Promise<void>;
  touche(id: string): Promise<void>;

  /**
   * Enregistre une performance, ou améliore celle qui existe déjà sous la
   * même clé. Renvoie `true` si quelque chose a été écrit.
   *
   * « Améliorer » et non « remplacer » : c'est la même loi que la fusion des
   * agrégats. Un second envoi moins bon ne doit pas effacer le premier.
   */
  posePerf(p: Perf): Promise<boolean>;
  /** L'historique personnel, du plus récent au plus ancien. */
  mesPerfs(utilisateurId: string, limite: number): Promise<Perf[]>;
  /**
   * Le classement d'une clé de comparabilité.
   *
   * ⚠️ Ne rend QUE des performances vérifiées et jugées humaines. Le schéma le
   * dit déjà — « douteux est conservé mais ne devra jamais alimenter un
   * classement » — et c'est ici que cette phrase devient du code. Filtrer à
   * l'affichage aurait laissé la porte ouverte au premier appelant suivant.
   *
   * `moiId` sert à marquer sa propre ligne, jamais à filtrer : un joueur voit
   * le même classement que tout le monde.
   */
  classement(cle: string, limite: number, moiId?: string): Promise<EntreeClassement[]>;
  /**
   * Combien de comptes font STRICTEMENT mieux, sous la même clé.
   *
   * Le rang d'un joueur hors du podium ne se déduit pas du podium : il faut
   * compter. Départage identique à l'index — valeur décroissante, puis durée
   * croissante — sinon deux écrans donneraient deux rangs pour un même score.
   */
  rangDe(cle: string, valeur: number, valeur2: number): Promise<number>;
  /**
   * Les SCORES classables du jour, et rien d'autre : ni pseudo, ni durée, ni
   * identifiant. C'est la matière du rang anonyme (« mieux que 68 % des
   * joueurs aujourd'hui ») — les MÊMES filtres que le podium, sinon le
   * pourcentage compterait ce que le podium écarte.
   */
  scoresDuJour(cle: string): Promise<number[]>;
  /**
   * Incrémente le cumul de suspicion.
   *
   * On compte, on ne sanctionne pas : le contrôle d'automatisation est un test
   * statistique, et un joueur exceptionnel peut le déclencher. Un tricheur
   * régulier, lui, finit par se voir — et la décision reste humaine, prise sur
   * des chiffres plutôt qu'au jugé.
   */
  leveDrapeau(id: string): Promise<number>;

  /* --- les amis (migration 0003) --- */

  /**
   * Le code ami d'un compte, attribué au premier appel.
   *
   * `hasard` est injecté pour que les tests décident des collisions. Une
   * collision avec un code existant se retente, bornée : l'index unique de
   * la base tranche, pas une lecture suivie d'une écriture.
   */
  codeAmi(id: string, hasard: () => number): Promise<string>;
  /** Le compte derrière un code, ou `null`. Jamais un compte supprimé. */
  parCodeAmi(code: string): Promise<Utilisateur | null>;
  /** Les amis d'un compte — les deux sens étant stockés, un seul côté suffit. */
  amisDe(id: string): Promise<Ami[]>;
  /**
   * Demande `de → a`, EN UNE TRANSACTION (migration 0009, `amitie_demande`).
   *
   * Contrôle des plafonds et écriture se font sous le même verrou : la
   * fenêtre de l'audit C4 (vérifier, écrire, recompter, défaire) n'existe
   * plus. Une demande croisée vaut accord et rend `lie`.
   */
  demandeAmi(de: string, a: string, maxAmis: number, maxDemandes: number): Promise<IssueDemande>;
  /** Accepte ce que `moi` a REÇU de `autre`, et seulement ça. Une transaction. */
  accepteAmi(moi: string, autre: string, maxAmis: number): Promise<IssueAccepte>;
  /** Délie deux comptes, dans les deux sens. Idempotent. */
  delie(a: string, b: string): Promise<void>;
  /** Les demandes d'ami REÇUES par un compte (qui me demande). */
  demandesVers(id: string): Promise<Ami[]>;
  /** Les demandes d'ami ENVOYÉES par un compte (à qui j'ai demandé). */
  demandesDe(id: string): Promise<Ami[]>;
  /** Retire la demande `de → a`, et elle seule. Idempotent. */
  retireDemande(de: string, a: string): Promise<void>;
  /**
   * Les performances VÉRIFIÉES et jugées humaines de plusieurs comptes, depuis
   * un jour donné. Même filtre que le classement : un ami ne se compare pas à
   * un run que l'anti-triche a écarté.
   */
  perfsDepuis(ids: readonly string[], depuisJour: number): Promise<Perf[]>;

  /* --- la boutique du COMPTE (migrations 0008 et 0009) --- */

  /** Solde, style porté, styles possédés — ou `null` pour un compte inconnu. */
  boutique(id: string): Promise<EtatBoutiqueCompte | null>;
  /**
   * Achète un style : débit, possession, historique, grand livre et style
   * porté, en UNE transaction. Rejouer la même `cle` rend le même achat,
   * jamais un second débit.
   */
  acheteSkin(id: string, code: string, cle: string): Promise<ReponseAchat>;
  /** Porte un style possédé. `false` s'il ne l'est pas. */
  porteSkin(id: string, code: string): Promise<boolean>;
  /**
   * Fait entrer le portefeuille d'un APPAREIL dans le compte, une fois par
   * appareil : ses pièces sont créditées, ses styles importés sans débit.
   */
  importeBoutique(id: string, appareil: string, pieces: number, codes: readonly string[]): Promise<ReponseImport>;

  /** La collection projetée, les records et la statistique, en une lecture. */
  collection(id: string): Promise<Collection>;
}

export type IssueDemande = "soi" | "deja" | "lie" | "demande" | "plein";
export type IssueAccepte = "inconnu" | "plein" | "lie";

/** Ce que la base sait d'un compte, en lignes (lecture seule, pour le joueur). */
export interface Collection {
  cartes: LigneCarte[];
  chapitres: Array<LigneChapitre & { numero: number; termine: boolean }>;
  meilleurs: Array<{ mode: string; valeur: number; valeur2: number }>;
  statistique: { runsVerifies: number; joursClasses: number } | null;
}

/** Un ami, tel que le dépôt le rend. L'identifiant ne quitte jamais le serveur. */
export interface Ami {
  id: string;
  code: string | null;
  pseudo: string;
  apparence: Apparence;
}

/** L'état neuf d'un compte fraîchement lié. */
export const utilisateurNeuf = (id: string, maintenant: number): Utilisateur => ({
  id,
  pseudo: "",
  apparence: { glyphe: 0 },
  agregats: agregatsVides(),
  revision: 0,
  versionJeton: 0,
  drapeaux: 0,
  creeLe: maintenant,
  banniLe: null,
  supprimeLe: null,
});

/**
 * Un identifiant de compte : un UUID (migration 0006).
 *
 * Opaque, non devinable, non ordonné de façon exploitable. Il s'écrivait
 * `u_` + 32 hexadécimaux, c'est-à-dire déjà un UUID sans ses tirets ; la base
 * l'a converti sans perte et `idCompte` (shared/compte.ts) lit encore
 * l'ancienne forme là où elle circule.
 */
export const nouvelId = (): string => crypto.randomUUID();

/* ------------------------------------------------------------------ *
 * Mémoire — tests et développement local
 * ------------------------------------------------------------------ */

/** Plafond de lignes lues pour le rang anonyme. */
export const SCORES_MAX = 5000;

/** Le style possédé d'emblée, comme `BOUTIQUE_VIERGE` sur l'appareil. */
const SKIN_OFFERT: string = SKIN_DEFAUT;

export class DepotMemoire implements Depot {
  private users = new Map<string, Utilisateur>();
  private liens = new Map<string, string>();

  private static cle(l: Lien): string {
    return `${l.fournisseur}:${l.idExterne}`;
  }

  async parLien(l: Lien): Promise<Utilisateur | null> {
    const id = this.liens.get(DepotMemoire.cle(l));
    return id ? await this.parId(id) : null;
  }

  async parId(id: string): Promise<Utilisateur | null> {
    const u = this.users.get(id);
    // Un compte supprimé n'est plus PERSONNE, comme en base. Ce double le
    // rendait jusqu'au 25/11 — trouvé par `tests/depot-contrat`, la première
    // fois que les deux dépôts ont passé la même suite.
    if (!u || u.supprimeLe) return null;
    // Copie défensive : sans elle, un appelant qui mute l'objet rendu
    // modifierait le « stockage » et les tests passeraient là où la vraie
    // implémentation échouerait.
    return structuredClone(u);
  }

  async cree(u: Utilisateur, l: Lien): Promise<Utilisateur> {
    // Même contrat que `compte_cree` : un lien déjà posé rend SON compte.
    const deja = this.liens.get(DepotMemoire.cle(l));
    if (deja) return structuredClone(this.users.get(deja)!);
    this.users.set(u.id, structuredClone(u));
    this.liens.set(DepotMemoire.cle(l), u.id);
    this.possedes.set(u.id, new Map([[SKIN_OFFERT, "offert"]]));
    return structuredClone(u);
  }

  /**
   * AIDE DE TEST : remplace un compte existant (le bannir, par exemple).
   * `cree` ne le fait plus : comme `compte_cree`, il rend le compte d'un lien
   * déjà posé au lieu de l'écraser.
   */
  remplace(u: Utilisateur): void {
    this.users.set(u.id, structuredClone(u));
  }

  async majAgregats(id: string, revisionAttendue: number, a: Agregats): Promise<boolean> {
    const u = this.users.get(id);
    if (!u || u.revision !== revisionAttendue || u.supprimeLe) return false;
    u.agregats = structuredClone(a);
    u.revision += 1;
    this.projetteEnMemoire(id, a);
    return true;
  }

  /*
   * Les projections, avec la loi de `agregats_ecrit` : maximum, jamais
   * affectation. Écrites ici pour que les tests exercent ce que la base fait.
   */
  private cartes = new Map<string, Map<string, LigneCarte>>();
  private chapitres = new Map<string, Map<string, number[]>>();

  private projetteEnMemoire(id: string, a: Agregats): void {
    const p = projette(a);
    const cartes = this.cartes.get(id) ?? new Map<string, LigneCarte>();
    for (const c of p.cartes) {
      const x = cartes.get(c.regle);
      cartes.set(c.regle, x ? {
        regle: c.regle,
        meilleur: Math.max(x.meilleur, c.meilleur),
        pieges: Math.max(x.pieges, c.pieges),
        runs: Math.max(x.runs, c.runs),
        maitrisee: x.maitrisee || c.maitrisee,
      } : { ...c });
    }
    this.cartes.set(id, cartes);
    const ch = this.chapitres.get(id) ?? new Map<string, number[]>();
    for (const c of p.chapitres) {
      const x = ch.get(c.regle) ?? [0, 0, 0, 0, 0];
      ch.set(c.regle, x.map((v, k) => Math.max(v, c.etoiles[k] ?? 0)));
    }
    this.chapitres.set(id, ch);
  }

  async majIdentite(id: string, pseudo: string, apparence: Apparence): Promise<void> {
    const u = this.users.get(id);
    if (!u) return;
    u.pseudo = pseudo;
    u.apparence = structuredClone(apparence);
  }

  async revoque(id: string): Promise<number> {
    const u = this.users.get(id);
    if (!u) return 0;
    u.versionJeton += 1;
    return u.versionJeton;
  }

  async supprime(id: string): Promise<void> {
    const u = this.users.get(id);
    if (!u) return;
    u.supprimeLe = Date.now();
    u.pseudo = "";
    u.agregats = agregatsVides();
    u.versionJeton += 1;
    for (const [cle, cible] of [...this.liens]) if (cible === id) this.liens.delete(cle);
    // Les performances sont des données personnelles rattachées au compte :
    // une demande de suppression les emporte.
    this.perfs = this.perfs.filter((p) => p.utilisateurId !== id);
    // Les amitiés aussi : un compte supprimé ne doit plus paraître dans la
    // liste de personne, et son code ne doit plus rien ouvrir.
    for (const k of [...this.amities]) if (k.startsWith(`${id}→`) || k.endsWith(`→${id}`)) this.amities.delete(k);
    for (const k of [...this.demandes]) if (k.startsWith(`${id}→`) || k.endsWith(`→${id}`)) this.demandes.delete(k);
    this.codes.delete(id);
    // Comme `compte_supprime` : la progression part, l'historique d'achats reste.
    this.cartes.delete(id);
    this.chapitres.delete(id);
    this.meilleurs.delete(id);
    this.stats.delete(id);
    this.possedes.delete(id);
    this.portes.delete(id);
  }

  async touche(id: string): Promise<void> {
    // `vu_le` n'est jamais relu par le code : il sert à savoir plus tard quels
    // comptes sont morts. Rien à simuler ici, mais la méthode doit exister
    // pour que les tests exercent le même chemin d'appel que la production.
    void id;
  }

  private perfs: Perf[] = [];

  private stats = new Map<string, { runsVerifies: number; joursClasses: number }>();
  private meilleurs = new Map<string, Map<string, { valeur: number; valeur2: number }>>();

  /** La loi de `performance_pose`, sans `await` intermédiaire : donc atomique. */
  async posePerf(p: Perf): Promise<boolean> {
    const i = this.perfs.findIndex((x) => x.utilisateurId === p.utilisateurId && x.cle === p.cle);
    const st = this.stats.get(p.utilisateurId) ?? { runsVerifies: 0, joursClasses: 0 };
    st.runsVerifies += 1;
    if (i < 0) st.joursClasses += 1;
    this.stats.set(p.utilisateurId, st);
    if (i >= 0) {
      const avant = this.perfs[i]!;
      // Le même ordre que l'index de classement : valeur décroissante, puis
      // départage croissant sur la durée.
      const mieux =
        p.valeur > avant.valeur || (p.valeur === avant.valeur && p.valeur2 < avant.valeur2);
      if (!mieux) return false;
      this.perfs[i] = { ...p };
    } else {
      this.perfs.push({ ...p });
    }
    // Le record ne se nourrit que de l'HUMAIN (décision n°14).
    if (p.verdictBot === "humain") {
      const parMode = this.meilleurs.get(p.utilisateurId) ?? new Map<string, { valeur: number; valeur2: number }>();
      const m = parMode.get(p.mode);
      if (!m || p.valeur > m.valeur || (p.valeur === m.valeur && p.valeur2 < m.valeur2)) {
        parMode.set(p.mode, { valeur: p.valeur, valeur2: p.valeur2 });
      }
      this.meilleurs.set(p.utilisateurId, parMode);
    }
    return true;
  }

  async mesPerfs(utilisateurId: string, limite: number): Promise<Perf[]> {
    return this.perfs
      .filter((p) => p.utilisateurId === utilisateurId)
      .sort((a, b) => b.creeLe - a.creeLe)
      .slice(0, limite)
      .map((p) => ({ ...p }));
  }

  /**
   * Le même ORDRE que l'index de la table, écrit une fois et réutilisé.
   *
   * Deux tris écrits séparément — un en SQL, un en mémoire — finissent par
   * diverger, et le symptôme serait un rang qui change selon le dépôt. Les
   * tests tournent sur celui-ci, la production sur l'autre : c'est exactement
   * la configuration où une divergence ne se voit jamais.
   */
  private static mieux(a: Perf, b: Perf): number {
    return b.valeur - a.valeur || a.valeur2 - b.valeur2;
  }

  private classables(cle: string): Perf[] {
    return this.perfs
      .filter((p) => p.cle === cle && p.verdictBot === "humain")
      .sort(DepotMemoire.mieux);
  }

  async classement(cle: string, limite: number, moiId?: string): Promise<EntreeClassement[]> {
    return this.classables(cle)
      .slice(0, Math.max(1, limite))
      .map((p, i) => ({
        rang: i + 1,
        pseudo: this.users.get(p.utilisateurId)?.pseudo ?? "",
        glyphe: Number(this.users.get(p.utilisateurId)?.apparence.glyphe ?? 0),
        valeur: p.valeur,
        valeur2: p.valeur2,
        moi: !!moiId && p.utilisateurId === moiId,
      }));
  }

  async scoresDuJour(cle: string): Promise<number[]> {
    return this.classables(cle).map((p) => p.valeur);
  }

  async rangDe(cle: string, valeur: number, valeur2: number): Promise<number> {
    const devant = this.classables(cle).filter(
      (p) => p.valeur > valeur || (p.valeur === valeur && p.valeur2 < valeur2),
    ).length;
    return devant + 1;
  }

  async leveDrapeau(id: string): Promise<number> {
    const u = this.users.get(id);
    if (!u) return 0;
    u.drapeaux += 1;
    return u.drapeaux;
  }

  private codes = new Map<string, string>(); // id → code
  private amities = new Set<string>(); // "a→b"

  async codeAmi(id: string, hasard: () => number): Promise<string> {
    const deja = this.codes.get(id);
    if (deja) return deja;
    const pris = new Set(this.codes.values());
    for (let i = 0; i < 20; i++) {
      const c = nouveauCodeAmi(hasard);
      if (pris.has(c)) continue;
      this.codes.set(id, c);
      return c;
    }
    throw new Error("code ami : trop de collisions");
  }

  async parCodeAmi(code: string): Promise<Utilisateur | null> {
    for (const [id, c] of this.codes) {
      if (c !== code) continue;
      const u = await this.parId(id);
      return u && !u.supprimeLe ? u : null;
    }
    return null;
  }

  async amisDe(id: string): Promise<Ami[]> {
    const out: Ami[] = [];
    for (const k of this.amities) {
      const [a, b] = k.split("→") as [string, string];
      if (a !== id) continue;
      const u = this.users.get(b);
      if (!u || u.supprimeLe) continue;
      out.push({
        id: b,
        code: this.codes.get(b) ?? null,
        pseudo: u.pseudo,
        apparence: structuredClone(u.apparence),
      });
    }
    return out;
  }

  /**
   * AIDE DE TEST : lie deux comptes sans contrôle. Hors de l'interface
   * `Depot` — en production, une amitié ne naît que par `demandeAmi` ou
   * `accepteAmi`, sous leurs plafonds.
   */
  async lie(a: string, b: string): Promise<void> {
    if (a === b) return;
    this.amities.add(`${a}→${b}`);
    this.amities.add(`${b}→${a}`);
  }

  private nbAmis = (id: string): number => [...this.amities].filter((k) => k.startsWith(`${id}→`)).length;

  /** `amitie_lie` : plafonds des DEUX côtés, puis les deux sens, puis les demandes rangées. */
  private lieSousPlafond(a: string, b: string, maxAmis: number): "lie" | "plein" {
    if (this.nbAmis(a) >= maxAmis || this.nbAmis(b) >= maxAmis) return "plein";
    this.amities.add(`${a}→${b}`);
    this.amities.add(`${b}→${a}`);
    this.demandes.delete(`${a}→${b}`);
    this.demandes.delete(`${b}→${a}`);
    return "lie";
  }

  // Aucun `await` entre la lecture et l'écriture : la même atomicité que le
  // verrou de `amitie_demande`.
  async demandeAmi(de: string, a: string, maxAmis: number, maxDemandes: number): Promise<IssueDemande> {
    if (de === a) return "soi";
    if (this.amities.has(`${de}→${a}`)) return "deja";
    if (this.demandes.has(`${a}→${de}`)) return this.lieSousPlafond(de, a, maxAmis);
    if (this.demandes.has(`${de}→${a}`)) return "demande";
    const envoyees = [...this.demandes].filter((k) => k.startsWith(`${de}→`)).length;
    const recues = [...this.demandes].filter((k) => k.endsWith(`→${a}`)).length;
    if (envoyees >= maxDemandes || recues >= maxDemandes) return "plein";
    this.demandes.add(`${de}→${a}`);
    return "demande";
  }

  async accepteAmi(moi: string, autre: string, maxAmis: number): Promise<IssueAccepte> {
    if (!this.demandes.has(`${autre}→${moi}`)) return "inconnu";
    return this.lieSousPlafond(moi, autre, maxAmis);
  }

  async delie(a: string, b: string): Promise<void> {
    this.amities.delete(`${a}→${b}`);
    this.amities.delete(`${b}→${a}`);
  }

  private demandes = new Set<string>(); // "de→a"

  private amiDe(id: string): Ami | null {
    const u = this.users.get(id);
    if (!u || u.supprimeLe) return null;
    return { id, code: this.codes.get(id) ?? null, pseudo: u.pseudo, apparence: structuredClone(u.apparence) };
  }

  async demandesVers(id: string): Promise<Ami[]> {
    const out: Ami[] = [];
    for (const k of this.demandes) {
      const [de, a] = k.split("→") as [string, string];
      const x = a === id ? this.amiDe(de) : null;
      if (x) out.push(x);
    }
    return out;
  }

  async demandesDe(id: string): Promise<Ami[]> {
    const out: Ami[] = [];
    for (const k of this.demandes) {
      const [de, a] = k.split("→") as [string, string];
      const x = de === id ? this.amiDe(a) : null;
      if (x) out.push(x);
    }
    return out;
  }

  /** AIDE DE TEST : pose une demande sans contrôle (hors interface `Depot`). */
  async demande(de: string, a: string): Promise<void> {
    if (de !== a) this.demandes.add(`${de}→${a}`);
  }

  async retireDemande(de: string, a: string): Promise<void> {
    this.demandes.delete(`${de}→${a}`);
  }

  async perfsDepuis(ids: readonly string[], depuisJour: number): Promise<Perf[]> {
    const voulus = new Set(ids);
    return this.perfs
      .filter(
        (p) =>
          voulus.has(p.utilisateurId) &&
          p.mode === "daily" &&
          p.jour !== null &&
          p.jour >= depuisJour &&
          p.verdictBot === "humain",
      )
      .map((p) => ({ ...p }));
  }

  /* --- boutique : la loi de `boutique_achete` / `boutique_importe` --- */

  private pieces = new Map<string, number>();
  private possedes = new Map<string, Map<string, "offert" | "achat" | "import">>();
  private portes = new Map<string, string>();
  /** L'historique : il survit à la suppression du compte (restrict). */
  readonly achats: Array<{ id: string; code: string; prix: number; cle: string }> = [];
  private imports = new Set<string>();

  private vivant(id: string): boolean {
    const u = this.users.get(id);
    return !!u && !u.supprimeLe;
  }

  private etat(id: string): EtatBoutiqueCompte {
    const codes = SKINS.map((x): string => x.id).filter((c) => this.possedes.get(id)?.has(c));
    const porte = this.portes.get(id) ?? null;
    return { pieces: this.pieces.get(id) ?? 0, porte: porte && codes.includes(porte) ? porte : null, possedes: codes };
  }

  async boutique(id: string): Promise<EtatBoutiqueCompte | null> {
    return this.vivant(id) ? this.etat(id) : null;
  }

  async acheteSkin(id: string, code: string, cle: string): Promise<ReponseAchat> {
    if (!this.vivant(id)) return litReponseAchat({ issue: "inconnu" });
    if (this.achats.some((x) => x.id === id && x.cle === cle)) return { ...this.etat(id), issue: "ok", rejoue: true };
    const prix = SKINS.find((x) => x.id === code)?.prix;
    if (prix === undefined) return { ...this.etat(id), issue: "inconnu" };
    const mien = this.possedes.get(id) ?? new Map<string, "offert" | "achat" | "import">();
    if (mien.has(code)) return { ...this.etat(id), issue: "deja" };
    const solde = this.pieces.get(id) ?? 0;
    if (solde < prix) return { ...this.etat(id), issue: "pauvre", manque: prix - solde };
    this.achats.push({ id, code, prix, cle });
    this.pieces.set(id, solde - prix);
    mien.set(code, "achat");
    this.possedes.set(id, mien);
    this.portes.set(id, code);
    return { ...this.etat(id), issue: "ok" };
  }

  async porteSkin(id: string, code: string): Promise<boolean> {
    if (!this.vivant(id) || !this.possedes.get(id)?.has(code)) return false;
    this.portes.set(id, code);
    return true;
  }

  async importeBoutique(id: string, appareil: string, pieces: number, codes: readonly string[]): Promise<ReponseImport> {
    if (!this.vivant(id)) return { pieces: 0, porte: null, possedes: [], issue: "inconnu" };
    const cle = `${id}|import:${appareil}`;
    if (this.imports.has(cle)) return { ...this.etat(id), issue: "deja" };
    this.imports.add(cle);
    if (pieces > 0) this.pieces.set(id, (this.pieces.get(id) ?? 0) + pieces);
    const mien = this.possedes.get(id) ?? new Map<string, "offert" | "achat" | "import">();
    for (const c of codes) if (SKINS.some((x) => x.id === c) && !mien.has(c)) mien.set(c, "import");
    this.possedes.set(id, mien);
    return { ...this.etat(id), issue: "ok" };
  }

  async collection(id: string): Promise<Collection> {
    const numero = (r: string) => CHAPITRES.indexOf(r) + 1;
    const st = this.stats.get(id);
    return {
      cartes: [...(this.cartes.get(id)?.values() ?? [])].sort((a, b) => a.regle.localeCompare(b.regle)),
      chapitres: [...(this.chapitres.get(id)?.entries() ?? [])]
        .map(([regle, etoiles]) => ({ regle, etoiles, numero: numero(regle), termine: (etoiles[4] ?? 0) > 0 }))
        .sort((a, b) => a.numero - b.numero),
      meilleurs: [...(this.meilleurs.get(id)?.entries() ?? [])]
        .map(([mode, m]) => ({ mode, ...m }))
        .sort((a, b) => a.mode.localeCompare(b.mode)),
      statistique: st ? { ...st } : null,
    };
  }
}
