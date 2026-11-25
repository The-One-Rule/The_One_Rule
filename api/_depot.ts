/**
 * Le dépôt — tout l'accès aux comptes passe par ici.
 *
 * Même parti pris que l'interface `Store` de `api/ranked.ts`, et pour la même
 * raison : une implémentation en mémoire fait tourner les tests et le local,
 * une implémentation Supabase fait tourner la production, et c'est le seul
 * fichier à toucher pour en changer.
 *
 * Supabase est atteint par son API REST et non par une connexion Postgres :
 * le runtime edge ne peut pas ouvrir de socket TCP. C'est la même contrainte
 * qui avait imposé l'API REST d'Upstash à `api/collect.ts`.
 *
 * ⚠️ La clé de SERVICE ne quitte jamais le serveur. RLS est activé sans
 * politique (voir la migration), donc la clé publique du navigateur ne peut
 * rien lire : c'est ce qui rend acceptable de tout faire passer par ici.
 *
 * Le préfixe `_` empêche Vercel de transformer ce module en point d'entrée.
 */

import { agregatsVides, estIdCompte, litApparence } from "../shared/compte";
import type { Agregats, Apparence } from "../shared/compte";
import { litEtatBoutique, litReponseAchat } from "../shared/boutique";
import type { EtatBoutiqueCompte, ReponseAchat, ReponseImport } from "../shared/boutique";
import { projette } from "./_projection";
import { SKINS, SKIN_DEFAUT } from "../src/game/boutique";
import { CHAPITRES } from "../src/game/parcours";
import type { LigneCarte, LigneChapitre } from "./_projection";
import { cleanEnv } from "../src/env";
import { MAX_AMIS, MAX_DEMANDES, nouveauCodeAmi } from "../shared/amis";

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
    // Copie défensive : sans elle, un appelant qui mute l'objet rendu
    // modifierait le « stockage » et les tests passeraient là où la vraie
    // implémentation échouerait.
    return u ? structuredClone(u) : null;
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

/* ------------------------------------------------------------------ *
 * Supabase
 * ------------------------------------------------------------------ */

interface LigneUtilisateur {
  id: string;
  pseudo: string;
  apparence: unknown;
  agregats: unknown;
  revision: number;
  version_jeton: number;
  drapeaux: number;
  cree_le: string;
  banni_le: string | null;
  supprime_le: string | null;
}

const enDate = (s: string | null): number | null => (s ? Date.parse(s) : null);

function litLigne(l: LigneUtilisateur): Utilisateur {
  const a = (l.agregats ?? {}) as Partial<Agregats>;
  return {
    id: l.id,
    pseudo: l.pseudo ?? "",
    apparence: litApparence(l.apparence),
    agregats: {
      ...agregatsVides(),
      ...a,
      // Les trois sous-objets doivent exister même si la ligne a été écrite
      // par une version antérieure : `{}` est le défaut de la colonne.
      carnet: a.carnet ?? {},
      serie: a.serie ?? { count: 0, lastDay: -99 },
      records: a.records ?? {},
    },
    revision: l.revision ?? 0,
    versionJeton: l.version_jeton ?? 0,
    drapeaux: l.drapeaux ?? 0,
    creeLe: enDate(l.cree_le) ?? Date.now(),
    banniLe: enDate(l.banni_le),
    supprimeLe: enDate(l.supprime_le),
  };
}

export class DepotSupabase implements Depot {
  constructor(
    private url: string,
    private cle: string,
  ) {}

  private async req(chemin: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${this.url}/rest/v1/${chemin}`, {
      ...init,
      headers: {
        apikey: this.cle,
        Authorization: `Bearer ${this.cle}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      // Une base lente ne doit pas tenir une fonction edge ouverte : la
      // dégradation prévue est « anonyme, et on joue », pas « on attend ».
      signal: AbortSignal.timeout(4000),
    });
  }

  /**
   * Un appel de FONCTION (migration 0009) : PostgREST l'exécute dans UNE
   * transaction. C'est la seule transaction à plusieurs écritures dont le
   * runtime edge dispose — il ne peut pas ouvrir de socket Postgres.
   */
  private async rpc<T>(nom: string, args: Record<string, unknown>): Promise<T> {
    const res = await this.req(`rpc/${nom}`, { method: "POST", body: JSON.stringify(args) });
    if (!res.ok) throw new Error(`supabase ${nom} ${res.status}`);
    return (await res.json()) as T;
  }

  private async une(chemin: string): Promise<Utilisateur | null> {
    const res = await this.req(chemin);
    if (!res.ok) throw new Error(`supabase ${res.status}`);
    const lignes = (await res.json()) as LigneUtilisateur[];
    const l = lignes[0];
    if (!l || l.supprime_le) return null;
    return litLigne(l);
  }

  async parId(id: string): Promise<Utilisateur | null> {
    // La colonne est un UUID : une autre chaîne ferait répondre 400 à
    // PostgREST, donc lever. Ce n'est pas une panne, c'est « personne ».
    if (!estIdCompte(id)) return null;
    return this.une(`utilisateur?id=eq.${encodeURIComponent(id)}&limit=1`);
  }

  async parLien(l: Lien): Promise<Utilisateur | null> {
    const res = await this.req(
      `lien_plateforme?fournisseur=eq.${encodeURIComponent(l.fournisseur)}` +
        `&id_externe=eq.${encodeURIComponent(l.idExterne)}&select=utilisateur_id&limit=1`,
    );
    if (!res.ok) throw new Error(`supabase ${res.status}`);
    const lignes = (await res.json()) as { utilisateur_id: string }[];
    const id = lignes[0]?.utilisateur_id;
    return id ? this.parId(id) : null;
  }

  /**
   * Le compte ET son lien, en une transaction (`compte_cree`). Avant 0009,
   * deux requêtes : un échec entre les deux laissait un compte orphelin.
   * Si le lien existe déjà (deux onglets), la base rend le compte existant.
   */
  async cree(u: Utilisateur, l: Lien): Promise<Utilisateur> {
    const ligne = await this.rpc<LigneUtilisateur | null>("compte_cree", {
      p_id: u.id,
      p_pseudo: u.pseudo,
      p_apparence: u.apparence,
      p_agregats: u.agregats,
      p_fournisseur: l.fournisseur,
      p_id_externe: l.idExterne,
    });
    return ligne ? litLigne(ligne) : u;
  }

  /**
   * Compare-and-swap sur la révision ET projections (cartes, chapitres), en
   * une transaction (`agregats_ecrit`). La projection est calculée ici, en
   * TypeScript, depuis les agrégats DÉJÀ fusionnés : la base ne refusionne
   * rien, elle range.
   */
  async majAgregats(id: string, revisionAttendue: number, a: Agregats): Promise<boolean> {
    const p = projette(a);
    return (await this.rpc<boolean>("agregats_ecrit", {
      p_id: id,
      p_revision: revisionAttendue,
      p_agregats: a,
      p_cartes: p.cartes,
      p_chapitres: p.chapitres,
    })) === true;
  }

  async majIdentite(id: string, pseudo: string, apparence: Apparence): Promise<void> {
    const res = await this.req(`utilisateur?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ pseudo, apparence }),
    });
    if (!res.ok) throw new Error(`supabase identite ${res.status}`);
  }

  async revoque(id: string): Promise<number> {
    const u = await this.parId(id);
    if (!u) return 0;
    const suivant = u.versionJeton + 1;
    const res = await this.req(`utilisateur?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ version_jeton: suivant }),
    });
    if (!res.ok) throw new Error(`supabase revocation ${res.status}`);
    return suivant;
  }

  /**
   * La suppression LOGIQUE en une transaction (`compte_supprime`).
   *
   * Avant 0009 c'était sept requêtes : liens, performances, compte, amitiés,
   * demandes, code, révocation — une panne au milieu laissait un compte à
   * moitié effacé (liens partis, scores encore publiés). Ce que la fonction
   * retire et garde est écrit dans la migration ; l'historique d'achats
   * reste, sans pseudo.
   */
  async supprime(id: string): Promise<void> {
    await this.rpc<boolean>("compte_supprime", { p_id: id, p_agregats_vides: agregatsVides() });
  }

  async touche(id: string): Promise<void> {
    // Sans intérêt fonctionnel immédiat, et sans conséquence si elle échoue :
    // on n'attend rien de cette écriture, elle sert à savoir plus tard quels
    // comptes sont morts.
    await this.req(`utilisateur?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ vu_le: new Date().toISOString() }),
    }).catch(() => undefined);
  }

  /**
   * Pose ou améliore une performance, et tient `statistique` et
   * `meilleur_score` dans la même transaction (`performance_pose`).
   *
   * La loi n'a pas bougé : améliorer, jamais remplacer par moins bien — même
   * ordre que l'index de classement (valeur décroissante, puis durée
   * croissante) et que `DepotMemoire`. Elle est désormais écrite dans le
   * `on conflict … where` de la fonction, en une seule instruction : plus de
   * POST suivi d'un PATCH en cas de doublon.
   */
  async posePerf(p: Perf): Promise<boolean> {
    return (await this.rpc<boolean>("performance_pose", {
      p: {
        utilisateur_id: p.utilisateurId,
        mode: p.mode,
        cle: p.cle,
        version_contenu: p.versionContenu,
        jour: p.jour,
        graine: p.graine,
        regle: p.regle,
        valeur: p.valeur,
        valeur2: p.valeur2,
        verdict_bot: p.verdictBot,
      },
    })) === true;
  }

  async mesPerfs(utilisateurId: string, limite: number): Promise<Perf[]> {
    const res = await this.req(
      `performance?utilisateur_id=eq.${encodeURIComponent(utilisateurId)}` +
        `&order=cree_le.desc&limit=${Math.max(1, Math.min(200, limite))}`,
    );
    if (!res.ok) throw new Error(`supabase perfs ${res.status}`);
    const lignes = (await res.json()) as Record<string, unknown>[];
    return lignes.map((l) => ({
      utilisateurId: String(l.utilisateur_id),
      mode: String(l.mode),
      cle: String(l.cle),
      versionContenu: String(l.version_contenu),
      jour: l.jour === null ? null : Number(l.jour),
      graine: Number(l.graine),
      regle: String(l.regle),
      valeur: Number(l.valeur),
      valeur2: Number(l.valeur2),
      verdictBot: String(l.verdict_bot ?? "humain"),
      creeLe: Date.parse(String(l.cree_le)) || Date.now(),
    }));
  }

  /**
   * Le classement, en UNE requête.
   *
   * `utilisateur(...)` est une jointure PostgREST : elle passe par la clé
   * étrangère déclarée dans la migration, donc rien à configurer. Sans elle il
   * faudrait une seconde requête par ligne — et un classement qui coûte N+1
   * appels à une base distante depuis une fonction edge finit par expirer.
   *
   * Les trois filtres ne sont pas décoratifs : `verifiee` écarte ce qui n'a pas
   * été rejoué par le serveur, `verdict_bot` écarte ce que l'anti-triche a
   * jugé douteux — le schéma l'exige explicitement — et `cle` est la loi de
   * comparabilité, sans laquelle on mélangerait deux jours ou deux versions de
   * contenu dans un même tableau.
   */
  async classement(cle: string, limite: number, moiId?: string): Promise<EntreeClassement[]> {
    const n = Math.max(1, Math.min(100, limite));
    const res = await this.req(
      `performance?select=valeur,valeur2,utilisateur_id,utilisateur(pseudo,apparence)` +
        `&cle=eq.${encodeURIComponent(cle)}&verifiee=is.true&verdict_bot=eq.humain` +
        `&order=valeur.desc,valeur2.asc&limit=${n}`,
    );
    if (!res.ok) throw new Error(`supabase classement ${res.status}`);
    const lignes = (await res.json()) as Record<string, unknown>[];
    return lignes.map((l, i) => {
      const u = (l.utilisateur ?? {}) as Record<string, unknown>;
      const app = litApparence(u.apparence);
      return {
        rang: i + 1,
        pseudo: String(u.pseudo ?? ""),
        glyphe: app.glyphe,
        valeur: Number(l.valeur),
        valeur2: Number(l.valeur2),
        moi: !!moiId && String(l.utilisateur_id) === moiId,
      };
    });
  }

  /**
   * Un COMPTE, pas une liste : on ne rapatrie pas mille lignes pour en
   * dénombrer les meilleures. `Prefer: count=exact` avec `head` renvoie le
   * total dans l'en-tête `Content-Range` sans corps de réponse.
   *
   * Le `or` reproduit exactement le départage de l'index — mieux, ou aussi bien
   * mais plus vite.
   */
  /**
   * Une liste, cette fois, mais d'UNE colonne et bornée : un jour compte
   * aujourd'hui quelques centaines de joueurs. Au-delà du plafond, le
   * pourcentage porte sur les meilleurs — il ne peut que se montrer sévère,
   * jamais flatteur.
   */
  async scoresDuJour(cle: string): Promise<number[]> {
    const res = await this.req(
      `performance?select=valeur&cle=eq.${encodeURIComponent(cle)}` +
        `&verifiee=is.true&verdict_bot=eq.humain&order=valeur.desc&limit=${SCORES_MAX}`,
    );
    if (!res.ok) throw new Error(`supabase scores ${res.status}`);
    return ((await res.json()) as { valeur: number }[]).map((l) => Number(l.valeur));
  }

  async rangDe(cle: string, valeur: number, valeur2: number): Promise<number> {
    const filtre =
      `performance?select=id&cle=eq.${encodeURIComponent(cle)}` +
      `&verifiee=is.true&verdict_bot=eq.humain` +
      `&or=(valeur.gt.${valeur},and(valeur.eq.${valeur},valeur2.lt.${valeur2}))`;
    const res = await this.req(filtre, {
      method: "HEAD",
      headers: { Prefer: "count=exact", Range: "0-0" },
    });
    if (!res.ok) throw new Error(`supabase rang ${res.status}`);
    const total = Number((res.headers.get("content-range") ?? "").split("/")[1]);
    return (Number.isFinite(total) ? total : 0) + 1;
  }

  async leveDrapeau(id: string): Promise<number> {
    const u = await this.parId(id);
    if (!u) return 0;
    const suivant = u.drapeaux + 1;
    // Lu comme les autres écritures : un drapeau qui échoue en silence
    // laisserait croire à `api/perf.ts` qu'un run douteux a été signalé.
    const res = await this.req(`utilisateur?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ drapeaux: suivant }),
    });
    if (!res.ok) throw new Error(`supabase drapeau ${res.status}`);
    return suivant;
  }

  async codeAmi(id: string, hasard: () => number): Promise<string> {
    const lu = await this.req(`utilisateur?id=eq.${encodeURIComponent(id)}&select=code_ami&limit=1`);
    if (!lu.ok) throw new Error(`supabase code ${lu.status}`);
    const deja = ((await lu.json()) as { code_ami: string | null }[])[0]?.code_ami;
    if (deja) return deja;
    for (let i = 0; i < 8; i++) {
      const c = nouveauCodeAmi(hasard);
      // Le filtre `code_ami=is.null` rend l'attribution sûre entre deux
      // onglets : le second PATCH ne touche aucune ligne, et on relit.
      const res = await this.req(
        `utilisateur?id=eq.${encodeURIComponent(id)}&code_ami=is.null`,
        { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ code_ami: c }) },
      );
      if (res.status === 409) continue; // collision sur l'index unique
      if (!res.ok) throw new Error(`supabase code ${res.status}`);
      if (((await res.json()) as unknown[]).length > 0) return c;
      return this.codeAmi(id, hasard); // un autre onglet l'a posé entre-temps
    }
    throw new Error("code ami : trop de collisions");
  }

  async parCodeAmi(code: string): Promise<Utilisateur | null> {
    return this.une(`utilisateur?code_ami=eq.${encodeURIComponent(code)}&limit=1`);
  }

  /**
   * Une jointure PostgREST : `amitie` a DEUX clés étrangères vers
   * `utilisateur`, donc on nomme celle qu'on suit — sans ça la requête est
   * ambiguë et PostgREST la refuse.
   */
  async amisDe(id: string): Promise<Ami[]> {
    const res = await this.req(
      `amitie?utilisateur_id=eq.${encodeURIComponent(id)}` +
        `&select=ami:utilisateur!amitie_ami_id_fkey(id,pseudo,apparence,code_ami,supprime_le)` +
        `&limit=${MAX_AMIS}`,
    );
    if (!res.ok) throw new Error(`supabase amis ${res.status}`);
    const lignes = (await res.json()) as { ami: Record<string, unknown> | null }[];
    return lignes
      .map((l) => l.ami)
      .filter((a): a is Record<string, unknown> => !!a && !a.supprime_le)
      .map((a) => ({
        id: String(a.id),
        code: a.code_ami ? String(a.code_ami) : null,
        pseudo: String(a.pseudo ?? ""),
        apparence: litApparence(a.apparence),
      }));
  }

  demandeAmi(de: string, a: string, maxAmis: number, maxDemandes: number): Promise<IssueDemande> {
    return this.rpc<IssueDemande>("amitie_demande", {
      p_de: de,
      p_a: a,
      p_max_amis: maxAmis,
      p_max_demandes: maxDemandes,
    });
  }

  accepteAmi(moi: string, autre: string, maxAmis: number): Promise<IssueAccepte> {
    return this.rpc<IssueAccepte>("amitie_accepte", { p_moi: moi, p_autre: autre, p_max_amis: maxAmis });
  }

  async delie(a: string, b: string): Promise<void> {
    const ea = encodeURIComponent(a);
    const eb = encodeURIComponent(b);
    const res = await this.req(
      `amitie?or=(and(utilisateur_id.eq.${ea},ami_id.eq.${eb}),and(utilisateur_id.eq.${eb},ami_id.eq.${ea}))`,
      { method: "DELETE" },
    );
    if (!res.ok) throw new Error(`supabase delie ${res.status}`);
  }

  /**
   * Les deux côtés d'une demande. Même jointure nommée que `amisDe` :
   * `demande_ami` a deux clés étrangères vers `utilisateur`.
   */
  private async demandesPar(colonne: "de_id" | "a_id", id: string): Promise<Ami[]> {
    const suivie = colonne === "a_id" ? "demande_ami_de_id_fkey" : "demande_ami_a_id_fkey";
    const res = await this.req(
      `demande_ami?${colonne}=eq.${encodeURIComponent(id)}` +
        `&select=qui:utilisateur!${suivie}(id,pseudo,apparence,code_ami,supprime_le)` +
        `&order=cree_le.desc&limit=${MAX_DEMANDES}`,
    );
    if (!res.ok) throw new Error(`supabase demandes ${res.status}`);
    const lignes = (await res.json()) as { qui: Record<string, unknown> | null }[];
    return lignes
      .map((l) => l.qui)
      .filter((a): a is Record<string, unknown> => !!a && !a.supprime_le)
      .map((a) => ({
        id: String(a.id),
        code: a.code_ami ? String(a.code_ami) : null,
        pseudo: String(a.pseudo ?? ""),
        apparence: litApparence(a.apparence),
      }));
  }

  demandesVers(id: string): Promise<Ami[]> {
    return this.demandesPar("a_id", id);
  }

  demandesDe(id: string): Promise<Ami[]> {
    return this.demandesPar("de_id", id);
  }


  async retireDemande(de: string, a: string): Promise<void> {
    const res = await this.req(
      `demande_ami?de_id=eq.${encodeURIComponent(de)}&a_id=eq.${encodeURIComponent(a)}`,
      { method: "DELETE" },
    );
    if (!res.ok) throw new Error(`supabase retire demande ${res.status}`);
  }

  async perfsDepuis(ids: readonly string[], depuisJour: number): Promise<Perf[]> {
    if (ids.length === 0) return [];
    const liste = ids.map((i) => `"${i.replace(/"/g, "")}"`).join(",");
    const res = await this.req(
      `performance?utilisateur_id=in.(${encodeURIComponent(liste)})&mode=eq.daily` +
        `&jour=gte.${Math.trunc(depuisJour)}&verifiee=is.true&verdict_bot=eq.humain` +
        `&select=utilisateur_id,mode,cle,version_contenu,jour,graine,regle,valeur,valeur2,verdict_bot,cree_le` +
        `&limit=${(MAX_AMIS + 1) * 40}`,
    );
    if (!res.ok) throw new Error(`supabase perfs amis ${res.status}`);
    const lignes = (await res.json()) as Record<string, unknown>[];
    return lignes.map((l) => ({
      utilisateurId: String(l.utilisateur_id),
      mode: String(l.mode),
      cle: String(l.cle),
      versionContenu: String(l.version_contenu),
      jour: l.jour === null ? null : Number(l.jour),
      graine: Number(l.graine),
      regle: String(l.regle),
      valeur: Number(l.valeur),
      valeur2: Number(l.valeur2),
      verdictBot: String(l.verdict_bot ?? "humain"),
      creeLe: Date.parse(String(l.cree_le)) || Date.now(),
    }));
  }

  /* --- boutique et collection : une fonction, une transaction --- */

  async boutique(id: string): Promise<EtatBoutiqueCompte | null> {
    if (!estIdCompte(id)) return null;
    return litEtatBoutique(await this.rpc<unknown>("boutique_etat", { p_id: id }));
  }

  async acheteSkin(id: string, code: string, cle: string): Promise<ReponseAchat> {
    return litReponseAchat(await this.rpc<unknown>("boutique_achete", { p_id: id, p_skin: code, p_cle: cle }));
  }

  async porteSkin(id: string, code: string): Promise<boolean> {
    return (await this.rpc<boolean>("boutique_porte", { p_id: id, p_skin: code })) === true;
  }

  async importeBoutique(id: string, appareil: string, pieces: number, codes: readonly string[]): Promise<ReponseImport> {
    const brut = await this.rpc<Record<string, unknown>>("boutique_importe", {
      p_id: id,
      p_appareil: appareil,
      p_pieces: pieces,
      p_skins: codes,
    });
    const etat = litEtatBoutique(brut) ?? { pieces: 0, porte: null, possedes: [] };
    const issue = brut?.issue === "ok" || brut?.issue === "deja" ? brut.issue : "inconnu";
    return { ...etat, issue };
  }

  async collection(id: string): Promise<Collection> {
    const o = (await this.rpc<Record<string, unknown> | null>("compte_collection", { p_id: id })) ?? {};
    const liste = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : []);
    const st = o.statistique as Record<string, unknown> | null | undefined;
    return {
      cartes: liste(o.cartes).map((c) => ({
        regle: String(c.regle),
        meilleur: Number(c.meilleur) || 0,
        pieges: Number(c.pieges) || 0,
        runs: Number(c.runs) || 0,
        maitrisee: c.maitrisee === true,
      })),
      chapitres: liste(o.chapitres).map((c) => ({
        regle: String(c.regle),
        numero: Number(c.numero) || 0,
        etoiles: Array.isArray(c.etoiles) ? c.etoiles.map((x) => Number(x) || 0) : [],
        termine: c.termine === true,
      })),
      meilleurs: liste(o.meilleurs).map((m) => ({
        mode: String(m.mode),
        valeur: Number(m.valeur) || 0,
        valeur2: Number(m.valeur2) || 0,
      })),
      statistique: st
        ? { runsVerifies: Number(st.runsVerifies) || 0, joursClasses: Number(st.joursClasses) || 0 }
        : null,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Choix du dépôt
 * ------------------------------------------------------------------ */

/**
 * Le dépôt configuré, ou `null`.
 *
 * `null` n'est pas une erreur : c'est un déploiement sans comptes, où
 * l'ensemble du chantier se comporte comme absent et où le jeu tourne
 * exactement comme avant. Chaque route commence donc par ce test.
 *
 * Les variables sont nettoyées : une valeur qui traverse une interface web et
 * un shell peut arriver avec un BOM devant, et cette panne-là a déjà coûté une
 * semaine de mesure muette (voir `src/env.ts`).
 */
export function depotConfigure(env: Record<string, string | undefined>): Depot | null {
  const url = cleanEnv(env.SUPABASE_URL);
  const cle = cleanEnv(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !cle) return null;
  return new DepotSupabase(url.replace(/\/+$/, ""), cle);
}
