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

import { agregatsVides, litApparence } from "../shared/compte";
import type { Agregats, Apparence } from "../shared/compte";
import { cleanEnv } from "../src/env";

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
   * Incrémente le cumul de suspicion.
   *
   * On compte, on ne sanctionne pas : le contrôle d'automatisation est un test
   * statistique, et un joueur exceptionnel peut le déclencher. Un tricheur
   * régulier, lui, finit par se voir — et la décision reste humaine, prise sur
   * des chiffres plutôt qu'au jugé.
   */
  leveDrapeau(id: string): Promise<number>;
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
 * Un identifiant de compte.
 *
 * Opaque, non devinable, non ordonné de façon exploitable. `crypto.randomUUID`
 * est disponible dans les deux runtimes ; on retire les tirets pour tenir dans
 * les 64 caractères que `shared/jeton.ts` accepte, avec de la marge.
 */
export const nouvelId = (): string => `u_${crypto.randomUUID().replace(/-/g, "")}`;

/* ------------------------------------------------------------------ *
 * Mémoire — tests et développement local
 * ------------------------------------------------------------------ */

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
    this.users.set(u.id, structuredClone(u));
    this.liens.set(DepotMemoire.cle(l), u.id);
    return structuredClone(u);
  }

  async majAgregats(id: string, revisionAttendue: number, a: Agregats): Promise<boolean> {
    const u = this.users.get(id);
    if (!u || u.revision !== revisionAttendue) return false;
    u.agregats = structuredClone(a);
    u.revision += 1;
    return true;
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
  }

  async touche(id: string): Promise<void> {
    // `vu_le` n'est jamais relu par le code : il sert à savoir plus tard quels
    // comptes sont morts. Rien à simuler ici, mais la méthode doit exister
    // pour que les tests exercent le même chemin d'appel que la production.
    void id;
  }

  private perfs: Perf[] = [];

  async posePerf(p: Perf): Promise<boolean> {
    const i = this.perfs.findIndex((x) => x.utilisateurId === p.utilisateurId && x.cle === p.cle);
    if (i < 0) {
      this.perfs.push({ ...p });
      return true;
    }
    const avant = this.perfs[i]!;
    // Le même ordre que l'index de classement : valeur décroissante, puis
    // départage croissant sur la durée.
    const mieux =
      p.valeur > avant.valeur || (p.valeur === avant.valeur && p.valeur2 < avant.valeur2);
    if (!mieux) return false;
    this.perfs[i] = { ...p };
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

  private async une(chemin: string): Promise<Utilisateur | null> {
    const res = await this.req(chemin);
    if (!res.ok) throw new Error(`supabase ${res.status}`);
    const lignes = (await res.json()) as LigneUtilisateur[];
    const l = lignes[0];
    if (!l || l.supprime_le) return null;
    return litLigne(l);
  }

  async parId(id: string): Promise<Utilisateur | null> {
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

  async cree(u: Utilisateur, l: Lien): Promise<Utilisateur> {
    const res = await this.req("utilisateur", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id: u.id,
        pseudo: u.pseudo,
        apparence: u.apparence,
        agregats: u.agregats,
      }),
    });
    if (!res.ok) throw new Error(`supabase creation ${res.status}`);

    const lien = await this.req("lien_plateforme", {
      method: "POST",
      body: JSON.stringify({
        fournisseur: l.fournisseur,
        id_externe: l.idExterne,
        utilisateur_id: u.id,
      }),
    });
    if (!lien.ok) throw new Error(`supabase lien ${lien.status}`);

    const lignes = (await res.json()) as LigneUtilisateur[];
    return lignes[0] ? litLigne(lignes[0]) : u;
  }

  async majAgregats(id: string, revisionAttendue: number, a: Agregats): Promise<boolean> {
    // Le compare-and-swap tient dans le filtre : si la révision a bougé, la
    // requête ne touche aucune ligne et l'appelant refusionne.
    const res = await this.req(
      `utilisateur?id=eq.${encodeURIComponent(id)}&revision=eq.${revisionAttendue}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ agregats: a, revision: revisionAttendue + 1 }),
      },
    );
    if (!res.ok) throw new Error(`supabase agregats ${res.status}`);
    return ((await res.json()) as unknown[]).length > 0;
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

  async supprime(id: string): Promise<void> {
    // Les liens partent en PREMIER et pour de bon : les garder laisserait une
    // reconnexion ressusciter un compte supprimé, ce qui est exactement ce
    // qu'une demande de suppression interdit.
    const liens = await this.req(
      `lien_plateforme?utilisateur_id=eq.${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!liens.ok) throw new Error(`supabase liens ${liens.status}`);

    const res = await this.req(`utilisateur?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        supprime_le: new Date().toISOString(),
        pseudo: "",
        agregats: agregatsVides(),
      }),
    });
    if (!res.ok) throw new Error(`supabase suppression ${res.status}`);
    await this.revoque(id);
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

  async posePerf(p: Perf): Promise<boolean> {
    const ligne = {
      utilisateur_id: p.utilisateurId,
      mode: p.mode,
      cle: p.cle,
      version_contenu: p.versionContenu,
      jour: p.jour,
      graine: p.graine,
      regle: p.regle,
      valeur: p.valeur,
      valeur2: p.valeur2,
      verifiee: true,
      verdict_bot: p.verdictBot,
    };

    // On tente l'insertion. L'index unique (utilisateur, clé) refuse le
    // doublon — c'est lui qui borne le run du jour à une soumission par
    // compte et par jour, gratuitement.
    const insert = await this.req("performance", { method: "POST", body: JSON.stringify(ligne) });
    if (insert.ok) return true;
    if (insert.status !== 409) throw new Error(`supabase perf ${insert.status}`);

    // Doublon : on n'écrase que si c'est MIEUX. Le filtre porte la
    // comparaison, donc la décision est prise par la base et non par une
    // lecture suivie d'une écriture — deux onglets ne peuvent pas se
    // marcher dessus.
    const maj = await this.req(
      `performance?utilisateur_id=eq.${encodeURIComponent(p.utilisateurId)}` +
        `&cle=eq.${encodeURIComponent(p.cle)}&valeur=lt.${p.valeur}`,
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(ligne) },
    );
    if (!maj.ok) throw new Error(`supabase perf maj ${maj.status}`);
    return ((await maj.json()) as unknown[]).length > 0;
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
    await this.req(`utilisateur?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ drapeaux: suivant }),
    });
    return suivant;
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
