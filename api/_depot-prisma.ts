/**
 * Le dépôt de PRODUCTION : PostgreSQL (Supabase), par Prisma — ADR 0012.
 *
 * Séparé de `api/_depot.ts` (l'interface et le double en mémoire) pour deux
 * raisons mesurées : les tests des routes, qui injectent `DepotMemoire`, ne
 * chargent plus Prisma du tout ; et ce fichier, qui ne s'exerce que contre un
 * vrai PostgreSQL, peut sortir du cliquet de couverture sur un poste sans base
 * sans emporter `DepotMemoire` avec lui (vite.config.ts).
 *
 * ⚠️ La connexion porte les droits du PROPRIÉTAIRE des tables : le RLS sans
 * politique (posé par chaque migration) ne bloque que la clé publique du
 * navigateur, jamais ce dépôt. L'adresse ne quitte donc jamais le serveur.
 *
 * Le préfixe `_` empêche Vercel de transformer ce module en point d'entrée.
 */

import { agregatsVides, estIdCompte, litApparence } from "../shared/compte.js";
import type { Agregats, Apparence } from "../shared/compte.js";
import { litEtatBoutique, litReponseAchat } from "../shared/boutique.js";
import type { EtatBoutiqueCompte, ReponseAchat, ReponseImport } from "../shared/boutique.js";
import { projette } from "./_projection.js";
import { cleanEnv } from "../src/env.js";
import { MAX_AMIS, MAX_DEMANDES, nouveauCodeAmi } from "../shared/amis.js";
import { Prisma, PrismaClient } from "../prisma/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { SCORES_MAX } from "./_depot.js";
import type { Ami, Collection, Depot, EntreeClassement, IssueAccepte, IssueDemande, Lien, Perf, Utilisateur } from "./_depot.js";

/* ------------------------------------------------------------------ *
 * PostgreSQL, par Prisma (ADR 0012)
 * ------------------------------------------------------------------ */

/**
 * Une transaction ne tient jamais une fonction ouverte : la dégradation prévue
 * est « anonyme, et on joue », pas « on attend ». Les mêmes 4 s que le délai
 * qui bornait chaque appel REST avant Prisma.
 */
const DELAI_MS = 4000;
const TX = { timeout: DELAI_MS, maxWait: 2000 } as const;

type Tx = Prisma.TransactionClient;

/** Les colonnes d'un compte que le code lit — jamais `pieces` ni le reste. */
const COLONNES_COMPTE = {
  id: true,
  pseudo: true,
  apparence: true,
  agregats: true,
  revision: true,
  versionJeton: true,
  drapeaux: true,
  creeLe: true,
  banniLe: true,
  supprimeLe: true,
} as const;

const COLONNES_AMI = { id: true, pseudo: true, apparence: true, codeAmi: true, supprimeLe: true } as const;

interface LigneCompte {
  id: string;
  pseudo: string;
  apparence: unknown;
  agregats: unknown;
  revision: number;
  versionJeton: number;
  drapeaux: number;
  creeLe: Date;
  banniLe: Date | null;
  supprimeLe: Date | null;
}

const ms = (d: Date | null): number | null => (d ? d.getTime() : null);

function litCompte(l: LigneCompte): Utilisateur {
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
    revision: l.revision,
    versionJeton: l.versionJeton,
    drapeaux: l.drapeaux,
    creeLe: l.creeLe.getTime(),
    banniLe: ms(l.banniLe),
    supprimeLe: ms(l.supprimeLe),
  };
}

const litAmi = (a: { id: string; pseudo: string; apparence: unknown; codeAmi: string | null }): Ami => ({
  id: a.id,
  code: a.codeAmi,
  pseudo: a.pseudo,
  apparence: litApparence(a.apparence),
});

interface LignePerf {
  utilisateurId: string;
  mode: string;
  cle: string;
  versionContenu: string;
  jour: number | null;
  graine: bigint;
  regle: string;
  valeur: number;
  valeur2: number;
  verdictBot: string;
  creeLe: Date;
}

const litPerf = (l: LignePerf): Perf => ({
  utilisateurId: l.utilisateurId,
  mode: l.mode,
  cle: l.cle,
  versionContenu: l.versionContenu,
  jour: l.jour,
  graine: Number(l.graine),
  regle: l.regle,
  valeur: l.valeur,
  valeur2: l.valeur2,
  verdictBot: l.verdictBot,
  creeLe: l.creeLe.getTime(),
});

/** Ce que le classement, le rang et les amis lisent : le vérifié, l'humain. */
const CLASSABLE = { verifiee: true, verdictBot: "humain" } as const;

/** « Mieux », dans l'ordre de l'index de classement — écrit une fois. */
const mieuxQue = (n: { valeur: number; valeur2: number }, avant: { valeur: number; valeur2: number }): boolean =>
  n.valeur > avant.valeur || (n.valeur === avant.valeur && n.valeur2 < avant.valeur2);

/** Une violation d'unicité, quel que soit l'étage qui la rapporte. */
const estDoublon = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Le dépôt de production : PostgreSQL (Supabase), par Prisma.
 *
 * ⚠️ CHAQUE ÉCRITURE À PLUSIEURS LIGNES EST UNE TRANSACTION, et chacune prend
 * ses verrous AVANT de lire ce qu'elle va décider. Ce sont les fonctions SQL
 * de 0009, réécrites ligne pour ligne (`prisma/migrations/0_ligne_de_base`
 * garde leur texte) : même ordre des contrôles, mêmes issues, mêmes verrous.
 * Les verrous de ligne passent par `$queryRaw` — Prisma n'a pas de
 * `for update` — et c'est le SEUL SQL écrit à la main ici.
 *
 * `tests/depot-contrat.test.ts` fait passer la MÊME suite sur ce dépôt (contre
 * un vrai PostgreSQL) et sur `DepotMemoire` : une divergence entre les deux
 * fait tomber l'un des deux.
 */
export class DepotPrisma implements Depot {
  constructor(private db: PrismaClient) {}

  /** Verrouille un compte VIVANT ; `false` s'il n'existe pas (ou plus). */
  private async verrouVivant(tx: Tx, id: string): Promise<boolean> {
    const l = await tx.$queryRaw<unknown[]>`
      select 1 from utilisateur where id = ${id}::uuid and supprime_le is null for update`;
    return l.length > 0;
  }

  /**
   * Verrouille deux comptes dans un ordre FIXE (celui de la base) : deux
   * transactions qui touchent la même paire ne peuvent pas s'interbloquer.
   */
  private async verrouPaire(tx: Tx, a: string, b: string): Promise<void> {
    await tx.$queryRaw`
      select id from utilisateur where id in (${a}::uuid, ${b}::uuid) order by id for update`;
  }

  /**
   * La bannière : DÉRIVÉE de `apparence.carte`, écrite par le dépôt dans la
   * même écriture que l'apparence. `apparence` reste la seule source (c'est
   * elle qui voyage sur le fil des salons) ; une carte inconnue donne NULL.
   */
  private async banniere(tx: Tx, apparence: Apparence): Promise<string | null> {
    const code = typeof apparence.carte === "string" ? apparence.carte : null;
    if (!code) return null;
    const c = await tx.carte.findFirst({ where: { regle: { code } }, select: { id: true } });
    return c?.id ?? null;
  }

  async parId(id: string): Promise<Utilisateur | null> {
    // Une autre chaîne qu'un UUID ferait lever la base : ce n'est pas une
    // panne, c'est « personne ».
    if (!estIdCompte(id)) return null;
    const l = await this.db.utilisateur.findUnique({ where: { id }, select: COLONNES_COMPTE });
    return l && !l.supprimeLe ? litCompte(l) : null;
  }

  async parLien(l: Lien): Promise<Utilisateur | null> {
    const lien = await this.db.lienPlateforme.findUnique({
      where: { fournisseur_idExterne: { fournisseur: l.fournisseur, idExterne: l.idExterne } },
      select: { utilisateur: { select: COLONNES_COMPTE } },
    });
    const u = lien?.utilisateur;
    return u && !u.supprimeLe ? litCompte(u) : null;
  }

  /**
   * Le compte, son lien et le style offert : tout ou rien. Si le lien existe
   * déjà (deux onglets qui se connectent ensemble), on rend le compte
   * existant — la seconde connexion n'est pas une erreur. Le verrou
   * consultatif sérialise deux créations pour le MÊME lien.
   */
  async cree(u: Utilisateur, l: Lien): Promise<Utilisateur> {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`select 1 from pg_advisory_xact_lock(hashtextextended(${`${l.fournisseur}:${l.idExterne}`}, 0))`;
      const deja = await tx.lienPlateforme.findUnique({
        where: { fournisseur_idExterne: { fournisseur: l.fournisseur, idExterne: l.idExterne } },
        select: { utilisateur: { select: COLONNES_COMPTE } },
      });
      if (deja) return litCompte(deja.utilisateur);

      const ligne = await tx.utilisateur.create({
        data: {
          id: u.id,
          pseudo: u.pseudo,
          apparence: u.apparence as Prisma.InputJsonObject,
          agregats: u.agregats as unknown as Prisma.InputJsonObject,
          carteBanniereId: await this.banniere(tx, u.apparence),
        },
        select: COLONNES_COMPTE,
      });
      await tx.lienPlateforme.create({
        data: { fournisseur: l.fournisseur, idExterne: l.idExterne, utilisateurId: ligne.id },
      });
      // Le style par défaut est possédé d'emblée, comme sur l'appareil.
      const offert = await tx.skin.findFirst({ where: { prix: 0, ordre: 0 }, select: { id: true } });
      if (offert) {
        await tx.skinUtilisateur.create({ data: { utilisateurId: ligne.id, skinId: offert.id, origine: "offert" } });
      }
      return litCompte(ligne);
    }, TX);
  }

  /**
   * Compare-and-swap sur `revision`, PUIS les projections, dans la même
   * transaction. Si une projection viole une contrainte, les agrégats ne sont
   * pas écrits non plus : la base ne peut pas tenir un carnet et une
   * collection qui se contredisent.
   *
   * La projection est calculée en TypeScript depuis les agrégats DÉJÀ
   * fusionnés (`projette`), et rangée au MAXIMUM, jamais par affectation :
   * la même loi que `fusionne`. L'écriture du compte, en tête, tient son
   * verrou jusqu'au bout — deux projections du même compte ne se croisent pas.
   */
  async majAgregats(id: string, revisionAttendue: number, a: Agregats): Promise<boolean> {
    if (!estIdCompte(id)) return false;
    const p = projette(a);
    return this.db.$transaction(async (tx) => {
      const ecrit = await tx.utilisateur.updateMany({
        where: { id, revision: revisionAttendue, supprimeLe: null },
        data: { agregats: a as unknown as Prisma.InputJsonObject, revision: { increment: 1 } },
      });
      if (ecrit.count === 0) return false;
      const maintenant = new Date();

      // Un code inconnu du catalogue est ignoré (une règle d'une version plus
      // récente du client) : il vit toujours dans les agrégats.
      if (p.cartes.length > 0) {
        const cartes = await tx.carte.findMany({
          where: { regle: { code: { in: p.cartes.map((c) => c.regle) } } },
          select: { id: true, regle: { select: { code: true } } },
        });
        const idDe = new Map(cartes.map((c) => [c.regle.code, c.id]));
        const avant = new Map(
          (await tx.carteUtilisateur.findMany({ where: { utilisateurId: id, carteId: { in: cartes.map((c) => c.id) } } }))
            .map((x) => [x.carteId, x]),
        );
        for (const c of p.cartes) {
          const carteId = idDe.get(c.regle);
          if (!carteId) continue;
          const x = avant.get(carteId);
          if (!x) {
            await tx.carteUtilisateur.create({
              data: { utilisateurId: id, carteId, meilleur: c.meilleur, pieges: c.pieges, runs: c.runs, maitrisee: c.maitrisee },
            });
            continue;
          }
          const neuf = {
            meilleur: Math.max(x.meilleur, c.meilleur),
            pieges: Math.max(x.pieges, c.pieges),
            runs: Math.max(x.runs, c.runs),
            maitrisee: x.maitrisee || c.maitrisee,
          };
          // Rien ne bouge : on n'écrit pas, et `maj_le` dit encore vrai.
          if (neuf.meilleur === x.meilleur && neuf.pieges === x.pieges && neuf.runs === x.runs && neuf.maitrisee === x.maitrisee) continue;
          await tx.carteUtilisateur.update({
            where: { utilisateurId_carteId: { utilisateurId: id, carteId } },
            data: { ...neuf, majLe: maintenant },
          });
        }
      }

      if (p.chapitres.length > 0) {
        const chapitres = await tx.chapitre.findMany({
          where: { modeJeu: { code: "parcours" }, regle: { code: { in: p.chapitres.map((c) => c.regle) } } },
          select: { id: true, regle: { select: { code: true } } },
        });
        const idDe = new Map(chapitres.map((c) => [c.regle.code, c.id]));
        const avant = new Map(
          (await tx.progressionChapitre.findMany({ where: { utilisateurId: id, chapitreId: { in: chapitres.map((c) => c.id) } } }))
            .map((x) => [x.chapitreId, x]),
        );
        for (const c of p.chapitres) {
          const chapitreId = idDe.get(c.regle);
          if (!chapitreId) continue;
          const x = avant.get(chapitreId);
          const etoiles = x ? x.etoiles.map((v, k) => Math.max(v, c.etoiles[k] ?? 0)) : c.etoiles;
          // Terminé = le boss (5e niveau) a une étoile ; la date se pose une fois.
          const termineLe = x?.termineLe ?? ((etoiles[4] ?? 0) > 0 ? maintenant : null);
          if (!x) {
            await tx.progressionChapitre.create({ data: { utilisateurId: id, chapitreId, etoiles, termineLe } });
            continue;
          }
          if (etoiles.every((v, k) => v === x.etoiles[k])) continue;
          await tx.progressionChapitre.update({
            where: { utilisateurId_chapitreId: { utilisateurId: id, chapitreId } },
            data: { etoiles, termineLe, majLe: maintenant },
          });
        }
      }
      return true;
    }, TX);
  }

  async majIdentite(id: string, pseudo: string, apparence: Apparence): Promise<void> {
    if (!estIdCompte(id)) return;
    await this.db.$transaction(async (tx) => {
      await tx.utilisateur.updateMany({
        where: { id },
        data: {
          pseudo,
          apparence: apparence as Prisma.InputJsonObject,
          carteBanniereId: await this.banniere(tx, apparence),
        },
      });
    }, TX);
  }

  /** Atomique : un incrément en base, pas une lecture suivie d'une écriture. */
  async revoque(id: string): Promise<number> {
    if (!estIdCompte(id)) return 0;
    const l = await this.db.utilisateur.updateManyAndReturn({
      where: { id, supprimeLe: null },
      data: { versionJeton: { increment: 1 } },
      select: { versionJeton: true },
    });
    return l[0]?.versionJeton ?? 0;
  }

  /**
   * La suppression LOGIQUE, en une transaction. Ce qui est personnel part ;
   * l'historique d'achats et le grand livre restent, rattachés à une pierre
   * tombale sans pseudo (stratégie de suppression, docs/BASE-DE-DONNEES.md §5).
   */
  async supprime(id: string): Promise<void> {
    if (!estIdCompte(id)) return;
    await this.db.$transaction(async (tx) => {
      const l = await tx.$queryRaw<unknown[]>`select 1 from utilisateur where id = ${id}::uuid for update`;
      if (l.length === 0) return;
      // Les liens partent POUR DE BON : sinon une reconnexion ressusciterait le compte.
      await tx.lienPlateforme.deleteMany({ where: { utilisateurId: id } });
      // La cascade ne joue pas (la ligne du compte reste) : tout à la main.
      await tx.meilleurScore.deleteMany({ where: { utilisateurId: id } });
      await tx.statistique.deleteMany({ where: { utilisateurId: id } });
      await tx.performance.deleteMany({ where: { utilisateurId: id } });
      await tx.carteUtilisateur.deleteMany({ where: { utilisateurId: id } });
      await tx.progressionChapitre.deleteMany({ where: { utilisateurId: id } });
      await tx.amitie.deleteMany({ where: { OR: [{ utilisateurId: id }, { amiId: id }] } });
      await tx.demandeAmi.deleteMany({ where: { OR: [{ deId: id }, { aId: id }] } });
      // Le style porté AVANT les possessions : la clé composée l'exige.
      await tx.utilisateur.update({ where: { id }, data: { skinPorteId: null } });
      await tx.skinUtilisateur.deleteMany({ where: { utilisateurId: id } });
      await tx.utilisateur.update({
        where: { id },
        data: {
          supprimeLe: new Date(),
          pseudo: "",
          agregats: agregatsVides() as unknown as Prisma.InputJsonObject,
          codeAmi: null,
          versionJeton: { increment: 1 },
        },
      });
    }, TX);
  }

  async touche(id: string): Promise<void> {
    // Sans intérêt fonctionnel immédiat, et sans conséquence si elle échoue :
    // elle sert à savoir plus tard quels comptes sont morts.
    if (!estIdCompte(id)) return;
    await this.db.utilisateur.updateMany({ where: { id }, data: { vuLe: new Date() } }).catch(() => undefined);
  }

  /**
   * Pose ou améliore une performance, et tient `statistique` et
   * `meilleur_score` dans la même transaction. Améliorer, jamais remplacer
   * par moins bien. Le verrou du compte sérialise deux envois du même joueur.
   */
  async posePerf(p: Perf): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`select 1 from utilisateur where id = ${p.utilisateurId}::uuid for update`;
      const avant = await tx.performance.findUnique({
        where: { utilisateurId_cle: { utilisateurId: p.utilisateurId, cle: p.cle } },
        select: { id: true, valeur: true, valeur2: true },
      });
      const champs = {
        versionContenu: p.versionContenu,
        jour: p.jour,
        graine: BigInt(Math.trunc(p.graine)),
        regle: p.regle,
        valeur: p.valeur,
        valeur2: p.valeur2,
        verifiee: true,
        verdictBot: p.verdictBot,
      };
      let ecrite: string | null = null;
      if (!avant) {
        ecrite = (await tx.performance.create({
          data: { utilisateurId: p.utilisateurId, mode: p.mode, cle: p.cle, ...champs },
          select: { id: true },
        })).id;
      } else if (mieuxQue(p, avant)) {
        await tx.performance.update({ where: { id: avant.id }, data: champs });
        ecrite = avant.id;
      }

      // Un run rejoué compte TOUJOURS, qu'il améliore ou non ; un jour neuf
      // ne compte qu'à l'insertion.
      const jourNeuf = avant ? 0 : 1;
      await tx.statistique.upsert({
        where: { utilisateurId: p.utilisateurId },
        create: { utilisateurId: p.utilisateurId, runsVerifies: 1, joursClasses: jourNeuf },
        update: { runsVerifies: { increment: 1 }, joursClasses: { increment: jourNeuf }, majLe: new Date() },
      });
      if (!ecrite) return false;

      // Le record du mode ne se nourrit que de l'HUMAIN (décision n°14).
      if (p.verdictBot === "humain") {
        const mode = await tx.modeJeu.findUniqueOrThrow({ where: { code: p.mode }, select: { id: true } });
        const ms = await tx.meilleurScore.findUnique({
          where: { utilisateurId_modeJeuId: { utilisateurId: p.utilisateurId, modeJeuId: mode.id } },
          select: { valeur: true, valeur2: true },
        });
        const record = { valeur: p.valeur, valeur2: p.valeur2, performanceId: ecrite };
        if (!ms) {
          await tx.meilleurScore.create({ data: { utilisateurId: p.utilisateurId, modeJeuId: mode.id, ...record } });
        } else if (mieuxQue(p, ms)) {
          await tx.meilleurScore.update({
            where: { utilisateurId_modeJeuId: { utilisateurId: p.utilisateurId, modeJeuId: mode.id } },
            data: { ...record, obtenuLe: new Date() },
          });
        }
      }
      return true;
    }, TX);
  }

  async mesPerfs(utilisateurId: string, limite: number): Promise<Perf[]> {
    if (!estIdCompte(utilisateurId)) return [];
    const l = await this.db.performance.findMany({
      where: { utilisateurId },
      orderBy: { creeLe: "desc" },
      take: Math.max(1, Math.min(200, limite)),
    });
    return l.map(litPerf);
  }

  /**
   * Le classement, en UNE requête : la jointure vers le compte est faite par
   * Prisma, pas une requête par ligne. Les trois filtres ne sont pas
   * décoratifs — `cle` est la loi de comparabilité, `verifiee` écarte le
   * non-rejoué, `verdictBot` ce que l'anti-triche a jugé douteux.
   */
  async classement(cle: string, limite: number, moiId?: string): Promise<EntreeClassement[]> {
    const l = await this.db.performance.findMany({
      where: { cle, ...CLASSABLE },
      orderBy: [{ valeur: "desc" }, { valeur2: "asc" }],
      take: Math.max(1, Math.min(100, limite)),
      select: { valeur: true, valeur2: true, utilisateurId: true, utilisateur: { select: { pseudo: true, apparence: true } } },
    });
    return l.map((x, i) => ({
      rang: i + 1,
      pseudo: x.utilisateur.pseudo,
      glyphe: litApparence(x.utilisateur.apparence).glyphe,
      valeur: x.valeur,
      valeur2: x.valeur2,
      moi: !!moiId && x.utilisateurId === moiId,
    }));
  }

  /**
   * Une liste d'UNE colonne, bornée. Au-delà du plafond, le pourcentage porte
   * sur les meilleurs — il ne peut que se montrer sévère, jamais flatteur.
   */
  async scoresDuJour(cle: string): Promise<number[]> {
    const l = await this.db.performance.findMany({
      where: { cle, ...CLASSABLE },
      orderBy: { valeur: "desc" },
      take: SCORES_MAX,
      select: { valeur: true },
    });
    return l.map((x) => x.valeur);
  }

  /** Un COMPTE, pas une liste. Le `OR` reproduit le départage de l'index. */
  async rangDe(cle: string, valeur: number, valeur2: number): Promise<number> {
    const devant = await this.db.performance.count({
      where: { cle, ...CLASSABLE, OR: [{ valeur: { gt: valeur } }, { valeur, valeur2: { lt: valeur2 } }] },
    });
    return devant + 1;
  }

  async leveDrapeau(id: string): Promise<number> {
    if (!estIdCompte(id)) return 0;
    const l = await this.db.utilisateur.updateManyAndReturn({
      where: { id, supprimeLe: null },
      data: { drapeaux: { increment: 1 } },
      select: { drapeaux: true },
    });
    return l[0]?.drapeaux ?? 0;
  }

  /**
   * Le code ami, attribué au premier appel. Le filtre `codeAmi: null` rend
   * l'attribution sûre entre deux onglets (le second n'écrit rien, et relit) ;
   * l'index unique de la base tranche une collision, qu'on retente, bornée.
   */
  async codeAmi(id: string, hasard: () => number): Promise<string> {
    const lu = await this.db.utilisateur.findUnique({ where: { id }, select: { codeAmi: true } });
    if (!lu) throw new Error("code ami : compte inconnu");
    if (lu.codeAmi) return lu.codeAmi;
    for (let i = 0; i < 8; i++) {
      const c = nouveauCodeAmi(hasard);
      try {
        const ecrit = await this.db.utilisateur.updateMany({ where: { id, codeAmi: null }, data: { codeAmi: c } });
        if (ecrit.count > 0) return c;
        return this.codeAmi(id, hasard); // un autre onglet l'a posé entre-temps
      } catch (e) {
        if (estDoublon(e)) continue; // collision sur l'index unique
        throw e;
      }
    }
    throw new Error("code ami : trop de collisions");
  }

  async parCodeAmi(code: string): Promise<Utilisateur | null> {
    const l = await this.db.utilisateur.findFirst({ where: { codeAmi: code }, select: COLONNES_COMPTE });
    return l && !l.supprimeLe ? litCompte(l) : null;
  }

  async amisDe(id: string): Promise<Ami[]> {
    if (!estIdCompte(id)) return [];
    const l = await this.db.amitie.findMany({
      where: { utilisateurId: id },
      take: MAX_AMIS,
      select: { ami: { select: COLONNES_AMI } },
    });
    return l.map((x) => x.ami).filter((a) => !a.supprimeLe).map(litAmi);
  }

  /** Les deux sens, puis les demandes de la paire rangées — sous les plafonds. */
  private async lie(tx: Tx, a: string, b: string, maxAmis: number): Promise<"lie" | "plein"> {
    const [na, nb] = await Promise.all([
      tx.amitie.count({ where: { utilisateurId: a } }),
      tx.amitie.count({ where: { utilisateurId: b } }),
    ]);
    if (na >= maxAmis || nb >= maxAmis) return "plein";
    // Stockée dans les DEUX sens : lire ses amis reste une requête.
    await tx.amitie.createMany({
      data: [{ utilisateurId: a, amiId: b }, { utilisateurId: b, amiId: a }],
      skipDuplicates: true,
    });
    await tx.demandeAmi.deleteMany({ where: { OR: [{ deId: a, aId: b }, { deId: b, aId: a }] } });
    return "lie";
  }

  /**
   * Demander `de → a`. Les plafonds se vérifient et l'écriture se fait sous
   * les MÊMES verrous : la fenêtre de l'audit C4 (vérifier, écrire, recompter,
   * défaire) n'existe pas. Une demande croisée vaut accord.
   */
  async demandeAmi(de: string, a: string, maxAmis: number, maxDemandes: number): Promise<IssueDemande> {
    if (de === a) return "soi";
    return this.db.$transaction(async (tx): Promise<IssueDemande> => {
      await this.verrouPaire(tx, de, a);
      if (await tx.amitie.findUnique({ where: { utilisateurId_amiId: { utilisateurId: de, amiId: a } } })) return "deja";
      if (await tx.demandeAmi.findUnique({ where: { deId_aId: { deId: a, aId: de } } })) return this.lie(tx, de, a, maxAmis);
      if (await tx.demandeAmi.findUnique({ where: { deId_aId: { deId: de, aId: a } } })) return "demande";
      const [envoyees, recues] = await Promise.all([
        tx.demandeAmi.count({ where: { deId: de } }),
        tx.demandeAmi.count({ where: { aId: a } }),
      ]);
      if (envoyees >= maxDemandes || recues >= maxDemandes) return "plein";
      await tx.demandeAmi.create({ data: { deId: de, aId: a } });
      return "demande";
    }, TX);
  }

  /** Accepter ce qu'on a REÇU, et seulement ça. */
  async accepteAmi(moi: string, autre: string, maxAmis: number): Promise<IssueAccepte> {
    return this.db.$transaction(async (tx): Promise<IssueAccepte> => {
      await this.verrouPaire(tx, moi, autre);
      if (!(await tx.demandeAmi.findUnique({ where: { deId_aId: { deId: autre, aId: moi } } }))) return "inconnu";
      return this.lie(tx, moi, autre, maxAmis);
    }, TX);
  }

  async delie(a: string, b: string): Promise<void> {
    await this.db.amitie.deleteMany({
      where: { OR: [{ utilisateurId: a, amiId: b }, { utilisateurId: b, amiId: a }] },
    });
  }

  async demandesVers(id: string): Promise<Ami[]> {
    if (!estIdCompte(id)) return [];
    const l = await this.db.demandeAmi.findMany({
      where: { aId: id },
      orderBy: { creeLe: "desc" },
      take: MAX_DEMANDES,
      select: { de: { select: COLONNES_AMI } },
    });
    return l.map((x) => x.de).filter((u) => !u.supprimeLe).map(litAmi);
  }

  async demandesDe(id: string): Promise<Ami[]> {
    if (!estIdCompte(id)) return [];
    const l = await this.db.demandeAmi.findMany({
      where: { deId: id },
      orderBy: { creeLe: "desc" },
      take: MAX_DEMANDES,
      select: { a: { select: COLONNES_AMI } },
    });
    return l.map((x) => x.a).filter((u) => !u.supprimeLe).map(litAmi);
  }

  async retireDemande(de: string, a: string): Promise<void> {
    await this.db.demandeAmi.deleteMany({ where: { deId: de, aId: a } });
  }

  async perfsDepuis(ids: readonly string[], depuisJour: number): Promise<Perf[]> {
    const valides = ids.filter(estIdCompte);
    if (valides.length === 0) return [];
    const l = await this.db.performance.findMany({
      where: { utilisateurId: { in: valides }, mode: "daily", jour: { gte: Math.trunc(depuisJour) }, ...CLASSABLE },
      take: (MAX_AMIS + 1) * 40,
    });
    return l.map(litPerf);
  }

  /* --- boutique et collection --- */

  /** Solde, style porté, styles possédés (dans l'ordre de la boutique). */
  private async etatBoutique(tx: Tx | PrismaClient, id: string): Promise<EtatBoutiqueCompte | null> {
    const u = await tx.utilisateur.findFirst({
      where: { id, supprimeLe: null },
      select: {
        pieces: true,
        skinPorte: { select: { skin: { select: { code: true } } } },
        skins: { select: { skin: { select: { code: true } } }, orderBy: { skin: { ordre: "asc" } } },
      },
    });
    if (!u) return null;
    return litEtatBoutique({ pieces: u.pieces, porte: u.skinPorte?.skin.code ?? null, possedes: u.skins.map((s) => s.skin.code) });
  }

  async boutique(id: string): Promise<EtatBoutiqueCompte | null> {
    if (!estIdCompte(id)) return null;
    return this.etatBoutique(this.db, id);
  }

  /**
   * Débit, possession, historique, grand livre et style porté : une seule
   * transaction, sous le verrou du compte. Rejouer la même `cle` rend le même
   * résultat sans second débit.
   */
  async acheteSkin(id: string, code: string, cle: string): Promise<ReponseAchat> {
    if (!estIdCompte(id)) return litReponseAchat({ issue: "inconnu" });
    return this.db.$transaction(async (tx) => {
      if (!(await this.verrouVivant(tx, id))) return litReponseAchat({ issue: "inconnu" });
      const etat = async (extra: Record<string, unknown>) => litReponseAchat({ ...(await this.etatBoutique(tx, id)), ...extra });

      if (await tx.achat.findUnique({ where: { utilisateurId_cleIdempotence: { utilisateurId: id, cleIdempotence: cle } } })) {
        return etat({ issue: "ok", rejoue: true });
      }
      const skin = await tx.skin.findFirst({ where: { code, retireLe: null }, select: { id: true, code: true, prix: true } });
      if (!skin) return litReponseAchat({ issue: "inconnu" });
      if (await tx.skinUtilisateur.findUnique({ where: { utilisateurId_skinId: { utilisateurId: id, skinId: skin.id } } })) {
        return etat({ issue: "deja" });
      }
      const { pieces } = await tx.utilisateur.findUniqueOrThrow({ where: { id }, select: { pieces: true } });
      if (pieces < skin.prix) return etat({ issue: "pauvre", manque: skin.prix - pieces });

      const achat = await tx.achat.create({
        data: { utilisateurId: id, skinId: skin.id, skinCode: skin.code, prixPaye: skin.prix, cleIdempotence: cle },
        select: { id: true },
      });
      if (skin.prix > 0) {
        await tx.mouvementPieces.create({
          data: { utilisateurId: id, delta: -skin.prix, motif: "achat", cle: `achat:${cle}`, achatId: achat.id },
        });
        await tx.utilisateur.update({ where: { id }, data: { pieces: { decrement: skin.prix } } });
      }
      await tx.skinUtilisateur.create({ data: { utilisateurId: id, skinId: skin.id, origine: "achat" } });
      // Porté aussitôt, comme `achete` côté appareil : on n'achète pas un habit
      // pour le ranger.
      await tx.utilisateur.update({ where: { id }, data: { skinPorteId: skin.id } });
      return etat({ issue: "ok" });
    }, TX);
  }

  /** Porter un style POSSÉDÉ. La clé composée le garantirait seule ; on rend `false` plutôt qu'une erreur. */
  async porteSkin(id: string, code: string): Promise<boolean> {
    if (!estIdCompte(id)) return false;
    const possede = await this.db.skinUtilisateur.findFirst({
      where: { utilisateurId: id, skin: { code } },
      select: { skinId: true },
    });
    if (!possede) return false;
    const ecrit = await this.db.utilisateur.updateMany({
      where: { id, supprimeLe: null },
      data: { skinPorteId: possede.skinId },
    });
    return ecrit.count > 0;
  }

  /**
   * L'IMPORT d'un appareil : ses pièces et ses styles rejoignent le compte, UNE
   * fois par appareil (clé « import:<appareil> » du grand livre). Les styles
   * importés ne sont pas débités : ils ont été payés sur l'appareil.
   */
  async importeBoutique(id: string, appareil: string, pieces: number, codes: readonly string[]): Promise<ReponseImport> {
    const inconnu: ReponseImport = { pieces: 0, porte: null, possedes: [], issue: "inconnu" };
    if (!estIdCompte(id)) return inconnu;
    return this.db.$transaction(async (tx): Promise<ReponseImport> => {
      if (!(await this.verrouVivant(tx, id))) return inconnu;
      const cle = `import:${appareil}`;
      const etat = async (issue: "ok" | "deja"): Promise<ReponseImport> => ({
        ...((await this.etatBoutique(tx, id)) ?? { pieces: 0, porte: null, possedes: [] }),
        issue,
      });
      if (await tx.mouvementPieces.findUnique({ where: { utilisateurId_cle: { utilisateurId: id, cle } } })) return etat("deja");
      if (pieces > 0) {
        await tx.mouvementPieces.create({ data: { utilisateurId: id, delta: pieces, motif: "import", cle } });
        await tx.utilisateur.update({ where: { id }, data: { pieces: { increment: pieces } } });
      }
      const skins = await tx.skin.findMany({ where: { code: { in: [...codes] } }, select: { id: true } });
      if (skins.length > 0) {
        await tx.skinUtilisateur.createMany({
          data: skins.map((s) => ({ utilisateurId: id, skinId: s.id, origine: "import" })),
          skipDuplicates: true,
        });
      }
      return etat("ok");
    }, TX);
  }

  /** La collection projetée, les records et la statistique. */
  async collection(id: string): Promise<Collection> {
    if (!estIdCompte(id)) return { cartes: [], chapitres: [], meilleurs: [], statistique: null };
    const [cartes, chapitres, meilleurs, st] = await Promise.all([
      this.db.carteUtilisateur.findMany({
        where: { utilisateurId: id },
        orderBy: { carte: { regle: { code: "asc" } } },
        select: { meilleur: true, pieges: true, runs: true, maitrisee: true, carte: { select: { regle: { select: { code: true } } } } },
      }),
      this.db.progressionChapitre.findMany({
        where: { utilisateurId: id },
        orderBy: { chapitre: { numero: "asc" } },
        select: { etoiles: true, chapitre: { select: { numero: true, regle: { select: { code: true } } } } },
      }),
      this.db.meilleurScore.findMany({
        where: { utilisateurId: id },
        orderBy: { modeJeu: { code: "asc" } },
        select: { valeur: true, valeur2: true, modeJeu: { select: { code: true } } },
      }),
      this.db.statistique.findUnique({ where: { utilisateurId: id }, select: { runsVerifies: true, joursClasses: true } }),
    ]);
    return {
      cartes: cartes.map((c) => ({
        regle: c.carte.regle.code,
        meilleur: c.meilleur,
        pieges: c.pieges,
        runs: c.runs,
        maitrisee: c.maitrisee,
      })),
      chapitres: chapitres.map((c) => ({
        regle: c.chapitre.regle.code,
        numero: c.chapitre.numero,
        etoiles: c.etoiles,
        // « Terminé » se LIT : le boss a une étoile (la colonne générée est
        // partie avec Prisma, migration 1).
        termine: (c.etoiles[4] ?? 0) > 0,
      })),
      meilleurs: meilleurs.map((m) => ({ mode: m.modeJeu.code, valeur: m.valeur, valeur2: m.valeur2 })),
      statistique: st ? { runsVerifies: st.runsVerifies, joursClasses: st.joursClasses } : null,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Choix du dépôt
 * ------------------------------------------------------------------ */

/**
 * UN client par adresse et par instance : une fonction Vercel réutilisée
 * (Fluid compute) garde son pool au lieu d'en ouvrir un par requête.
 *
 * Le pool est PETIT (3) parce que l'adresse est celle du pooler de Supabase
 * en mode transaction : c'est lui qui multiplexe, pas nous. Les délais bornent
 * une base lente comme le faisait `AbortSignal.timeout` du temps de REST.
 */
const clients = new Map<string, PrismaClient>();

export function clientPour(url: string): PrismaClient {
  let c = clients.get(url);
  if (!c) {
    c = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: url,
        max: 3,
        connectionTimeoutMillis: DELAI_MS,
        idleTimeoutMillis: 10_000,
        statement_timeout: DELAI_MS,
      }),
    });
    clients.set(url, c);
  }
  return c;
}

/**
 * Le dépôt configuré, ou `null`.
 *
 * `null` n'est pas une erreur : c'est un déploiement sans comptes, où
 * l'ensemble du chantier se comporte comme absent et où le jeu tourne
 * exactement comme avant. Chaque route commence donc par ce test.
 *
 * La variable est nettoyée : une valeur qui traverse une interface web et un
 * shell peut arriver avec un BOM devant, et cette panne-là a déjà coûté une
 * semaine de mesure muette (voir `src/env.ts`). Aucune connexion n'est ouverte
 * ici : Prisma se connecte à la première requête.
 */
export function depotConfigure(env: Record<string, string | undefined>): Depot | null {
  const url = cleanEnv(env.DATABASE_URL);
  if (!url) return null;
  return new DepotPrisma(clientPour(url));
}
