/**
 * Le compte TOR — types et règles PURES.
 *
 * Aucun accès réseau, aucun stockage, aucune horloge : ce fichier est importé
 * par le navigateur, par les fonctions edge et par les tests, et c'est lui qui
 * garantit que les trois calculent la même chose.
 *
 * DEUX INVARIANTS Y SONT ÉCRITS, et ce sont les deux qui rendent ce chantier
 * sûr :
 *
 *   1. « La fusion est une union et un maximum, jamais une affectation. »
 *      Elle devient alors idempotente et commutative, ce qui neutralise d'un
 *      coup les reprises réseau, les doubles onglets et les synchronisations
 *      concurrentes — trois familles de bugs qu'on n'aurait jamais reproduites
 *      en playtest et qui auraient détruit des carnets pour de bon.
 *
 *   2. « Deux performances ne se comparent qu'à clé de comparabilité égale. »
 *      La loi existait déjà dans `game/progress.ts`, écrite pour le seul
 *      `bestTraining` : un record obtenu en DÉCOUVERTE ne vaut pas un record
 *      obtenu en RAPIDE. Elle est ici généralisée, parce que le jour où une
 *      allure change, où une règle s'ajoute ou où un mode accessible arrive,
 *      c'est elle qui empêchera l'historique de mentir en silence.
 */

/* ------------------------------------------------------------------ *
 * Identité
 * ------------------------------------------------------------------ */

/**
 * L'apparence est un SAC OUVERT, et c'est volontaire.
 *
 * Aujourd'hui elle ne porte que le glyphe. Elle est stockée en JSONB pour que
 * l'habillage des cartes de partie — puis ce qui s'y accrochera — puisse
 * s'ajouter sans migration de la table d'identité : une clé de plus, rien à
 * déployer. Le jour où ces objets se posséderont plutôt que se choisiront, la
 * seule chose à écrire est `apparenceAutorisee`, en un seul endroit.
 *
 * Les clés inconnues sont CONSERVÉES à la lecture (voir `litApparence`) : un
 * client d'une version antérieure ne doit pas effacer un habillage qu'il ne
 * sait pas afficher.
 */
export interface Apparence {
  /** Index de glyphe. Une VALEUR portée, jamais une dérivation de l'identifiant. */
  glyphe: number;
  /** Réservé : habillage de carte de partie. Rien ne le lit encore. */
  carte?: string | null;
  [autre: string]: unknown;
}

export interface ProfilPublic {
  id: string;
  pseudo: string;
  glyphe: number;
  /** Jour de création, en index de jour TOR. Sert à dire « membre depuis ». */
  creeLe: number;
}

/** Normalisation du pseudo — la même des deux côtés du fil. */
export const PSEUDO_MAX = 14;

/**
 * Le pseudo n'est PAS unique, et le glyphe est la réponse.
 *
 * L'unicité globale crée de la friction à l'inscription (« ce pseudo est
 * pris ») exactement au moment où l'on ne peut pas se la permettre, et elle
 * n'élimine pas l'usurpation : `\p{L}` laisse passer les homoglyphes, un « А »
 * cyrillique franchit ce filtre. Deux PIERRE se distinguent donc par leur
 * signe — un vocabulaire de 144 variantes qui existait déjà et que personne ne
 * voyait.
 */
export function normalisePseudo(brut: unknown): string {
  if (typeof brut !== "string") return "";
  return brut
    .slice(0, PSEUDO_MAX * 2)
    .replace(/[^\p{L}\p{N} _.-]/gu, "")
    .trim()
    .slice(0, PSEUDO_MAX)
    .toUpperCase();
}

/**
 * Ce qu'un compte a le droit de porter.
 *
 * Renvoie aujourd'hui tout ce qu'on lui donne, borné au domaine valide. C'est
 * le point d'accroche unique d'une future collection : quand un glyphe ou un
 * habillage se possédera, cette fonction consultera les possessions et rien
 * d'autre ne changera — ni le protocole, ni les salons, ni le client.
 */
export function apparenceAutorisee(
  demandee: Apparence,
  nbGlyphes: number,
  _possessions?: ReadonlySet<string>,
): Apparence {
  const glyphe =
    Number.isInteger(demandee.glyphe) && demandee.glyphe >= 0 && demandee.glyphe < nbGlyphes
      ? demandee.glyphe
      : 0;
  return { ...demandee, glyphe };
}

/** Lit une apparence venue du stockage sans perdre ce qu'on ne connaît pas. */
export function litApparence(brut: unknown): Apparence {
  if (!brut || typeof brut !== "object") return { glyphe: 0 };
  const o = brut as Record<string, unknown>;
  const glyphe = typeof o.glyphe === "number" && Number.isInteger(o.glyphe) && o.glyphe >= 0
    ? o.glyphe
    : 0;
  return { ...o, glyphe };
}

/* ------------------------------------------------------------------ *
 * Agrégats — ce qui fusionne
 * ------------------------------------------------------------------ */

export interface CarnetEntree {
  best: number;
  cleared: boolean;
  /**
   * Pièges déjoués sous cette règle. Voir `RuleRecord` côté appareil.
   *
   * ⚠️ Optionnel : les agrégats déjà stockés côté serveur ne le portent pas,
   * et `apparence` mis à part, rien ici ne doit exiger une migration pour
   * continuer à fonctionner. Absent vaut zéro — la même doctrine que partout.
   */
  pieges?: number;
  /**
   * Meilleur score sous cette règle, ALLURE PAR ALLURE.
   *
   * L'échelle de maîtrise demande de tenir le palier à trois allures, et un
   * record global ne dit pas à laquelle il a été obtenu. Optionnel, comme tout
   * ce qui est arrivé après : absent vaut « rien à cette allure ».
   */
  parAllure?: Record<string, number>;
  /** Plus longue série de manches consécutives sans faute. */
  serie?: number;
  /** Un run tenu jusqu'au palier sans une seule faute d'échauffement. */
  sansFaute?: boolean;
  /** Combien de runs cette règle a déjà pris. */
  runs?: number;
  /**
   * L'ESCALIER de cette règle — vingt paliers, voir `src/game/escalier.ts`.
   *
   * ⚠️ La forme vit ici et non là-bas parce que la FUSION vit ici : ce fichier
   * est le seul que les deux côtés partagent, et une loi de fusion écrite deux
   * fois est une loi qui finit par diverger en silence — le symptôme serait un
   * escalier qui rétrécit à la synchro, exactement le défaut que `pieges` et
   * `parAllure` ont déjà appris à éviter.
   */
  escalier?: EscalierEntree;
}

/**
 * Où en est la montée d'une règle.
 *
 * `essais` et `meilleur` ne décrivent QUE le palier courant : ils repartent à
 * zéro quand on en franchit un. C'est cette dépendance qui rend leur fusion
 * particulière (voir `fusionneEscalier`).
 */
export interface EscalierEntree {
  /** Le dernier palier FRANCHI. 0 = la montée n'a pas commencé. */
  palier: number;
  /** Essais consommés sur le palier courant. */
  essais: number;
  /** Meilleur nombre de manches atteint sur le palier courant. */
  meilleur: number;
}

/**
 * La fusion de deux montées.
 *
 * ⚠️ **CE N'EST PAS UN MAXIMUM CHAMP PAR CHAMP**, et c'est la seule fusion du
 * dépôt qui ne l'est pas. La raison : `essais` et `meilleur` décrivent un
 * palier PRÉCIS. Prendre le maximum de chacun séparément collerait le meilleur
 * essai du palier 8 sur le palier 12 — « MEILLEUR ESSAI · 14 manches » sur un
 * palier qui en demande 18, alors que le joueur n'y a jamais joué.
 *
 * La loi est donc : **le palier le plus haut gagne, avec son escorte.** À
 * égalité seulement, on prend le maximum des deux. C'est bien un treillis —
 * idempotent, commutatif, monotone sur `palier` — donc les doubles onglets et
 * les synchros concurrentes restent inoffensifs, comme pour le reste du carnet.
 */
export function fusionneEscalier(
  x: EscalierEntree | undefined,
  y: EscalierEntree | undefined,
): EscalierEntree | undefined {
  if (!x) return y;
  if (!y) return x;
  if (x.palier !== y.palier) return x.palier > y.palier ? x : y;
  return {
    palier: x.palier,
    essais: Math.max(x.essais, y.essais),
    meilleur: Math.max(x.meilleur, y.meilleur),
  };
}

/**
 * N'émet les trois champs de l'échelle QUE s'ils portent quelque chose.
 *
 * « Absent vaut zéro » est la doctrine du carnet, et elle doit rester vraie de
 * bout en bout : les poser à `{}`, `0` et `false` sur chaque entrée gonflerait
 * chaque agrégat stocké et chaque octet qui transite, pour ne rien dire de plus
 * que leur absence.
 */
function maigre(
  parAllure: Record<string, number>,
  serie: number,
  sansFaute: boolean,
  runs: number,
  escalier: EscalierEntree | undefined,
): Partial<CarnetEntree> {
  return {
    ...(Object.keys(parAllure).length ? { parAllure } : {}),
    ...(runs ? { runs } : {}),
    ...(serie ? { serie } : {}),
    ...(sansFaute ? { sansFaute } : {}),
    // Une montée qui n'a pas commencé n'a rien à dire : `{0,0,0}` pèse autant
    // qu'un vrai état et ne porte pas plus d'information que son absence.
    ...(escalier && escalier.palier + escalier.essais + escalier.meilleur > 0
      ? { escalier }
      : {}),
  };
}

/** Union clé par clé, au maximum. Idempotente, commutative, monotone. */
function unionAllures(
  x: Record<string, number> | undefined,
  y: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cle of new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})])) {
    out[cle] = Math.max(x?.[cle] ?? 0, y?.[cle] ?? 0);
  }
  return out;
}

export interface Serie {
  count: number;
  lastDay: number;
}

/**
 * Tout ce qui suit un joueur d'un appareil à l'autre.
 *
 * `records` est indexé par CLÉ DE COMPARABILITÉ, et non par mode. C'est ce qui
 * évite d'ajouter une colonne à chaque mode, et surtout ce qui rend impossible
 * de comparer par mégarde deux chiffres qui n'ont pas été obtenus dans les
 * mêmes conditions.
 *
 * Ce qui n'est PAS ici, et pour une raison : les réglages (son, musique,
 * motifs, allure, glyphe choisi) restent locaux et ne se synchronisent jamais.
 * Les synchroniser créerait des conflits multi-appareils pour zéro valeur.
 */
export interface Agregats {
  carnet: Record<string, CarnetEntree>;
  serie: Serie;
  records: Record<string, number>;
  /**
   * Le run du jour de cet appareil. Optionnel : les agrégats déjà stockés ne
   * le portent pas, et « absent vaut rien joué » — la doctrine habituelle.
   */
  jour?: JourEntree;
}

export const agregatsVides = (): Agregats => ({
  carnet: {},
  serie: { count: 0, lastDay: -99 },
  records: {},
});

/**
 * LE RUN DU JOUR — ce que l'appareil en sait, et qui doit suivre le compte.
 *
 * ⚠️ **RAPPORTÉ EN PLAYTEST** : « les records de la run du jour ne se
 * synchronisent pas avec le compte ». C'était exact, et complet : `s.daily`
 * n'entrait dans AUCUN agrégat. La fiche du compte lisait `s.daily.score`,
 * c'est-à-dire une valeur strictement locale à l'appareil. On changeait de
 * téléphone, et le run du jour repartait de rien.
 *
 * ⚠️ **ET LE VRAI COÛT N'ÉTAIT PAS L'AFFICHAGE, C'ÉTAIT `essais`.** Le compteur
 * des trois tentatives quotidiennes vivait lui aussi sur l'appareil : deux
 * appareils donnaient donc SIX essais sur le seul mode dont les résultats se
 * comparent entre joueurs. Le faire voyager referme ça — imparfaitement, puisque
 * tout ça reste des affirmations du client (décision n°14), mais le serveur
 * garde déjà le maximum de son côté (`posePerf` améliore et ne remplace pas).
 */
export interface JourEntree {
  jour: number;
  score: number;
  cleared: boolean;
  essais: number;
}

/**
 * La fusion de deux journées.
 *
 * ⚠️ **LE JOUR LE PLUS RÉCENT GAGNE, AVEC SON ESCORTE** — jamais un maximum
 * champ par champ. C'est la même loi que `fusionneEscalier`, et pour la même
 * raison : `score`, `cleared` et `essais` décrivent UN jour précis. Prendre le
 * maximum de chacun collerait le score d'hier sur la graine d'aujourd'hui,
 * c'est-à-dire un chiffre que le joueur n'a jamais fait sur cette épreuve-là.
 *
 * À jour égal seulement : maximum, OU, maximum. Le treillis tient donc sur
 * `jour` d'abord, ce qui le rend idempotent, commutatif et monotone.
 */
export function fusionneJour(
  x: JourEntree | undefined,
  y: JourEntree | undefined,
): JourEntree | undefined {
  if (!x) return y;
  if (!y) return x;
  if (x.jour !== y.jour) return x.jour > y.jour ? x : y;
  return {
    jour: x.jour,
    score: Math.max(x.score, y.score),
    cleared: x.cleared || y.cleared,
    essais: Math.max(x.essais, y.essais),
  };
}

/**
 * LA fusion.
 *
 * Union sur les clés, maximum sur les valeurs, OU sur les booléens. Jamais une
 * affectation, jamais une somme.
 *
 * Le cas de la série mérite son mot : additionner deux séries serait
 * évidemment faux, mais prendre celle du serveur le serait aussi — un joueur
 * qui a joué trois jours sur son téléphone et se connecte depuis son ordinateur
 * verrait sa série retomber à zéro, et une série perdue est la chose qui fait
 * qu'on ne revient pas. On prend donc le maximum des deux. C'est très
 * légèrement généreux dans un cas de bord (deux appareils, deux séries
 * disjointes) et strictement préférable à la colère.
 */
export function fusionne(a: Agregats, b: Agregats): Agregats {
  const carnet: Record<string, CarnetEntree> = {};
  for (const id of new Set([...Object.keys(a.carnet), ...Object.keys(b.carnet)])) {
    const x = a.carnet[id];
    const y = b.carnet[id];
    carnet[id] = {
      best: Math.max(x?.best ?? 0, y?.best ?? 0),
      cleared: (x?.cleared ?? false) || (y?.cleared ?? false),
      /*
       * MAXIMUM, pas somme — alors que le compteur est cumulatif en local.
       *
       * Sommer doublerait les pièges d'un joueur qui synchronise deux fois, ou
       * qui joue sur deux appareils avec le même compte. Le maximum garde les
       * trois propriétés qui rendent la fusion inoffensive (idempotente,
       * commutative, monotone) au prix d'un sous-comptage possible. Un carnet
       * qui rétrécit est le seul défaut vraiment grave ici — il est silencieux.
       */
      pieges: Math.max(x?.pieges ?? 0, y?.pieges ?? 0),
      /*
       * Les trois champs de l'échelle suivent la MÊME loi : union et maximum.
       *
       * `parAllure` s'unit clé par clé — deux appareils peuvent avoir travaillé
       * des allures différentes, et perdre celle qui manque ferait reculer une
       * case déjà franchie. `serie` prend le maximum, `sansFaute` le OU : une
       * case franchie ne se déverrouille jamais.
       */
      ...maigre(
        unionAllures(x?.parAllure, y?.parAllure),
        Math.max(x?.serie ?? 0, y?.serie ?? 0),
        (x?.sansFaute ?? false) || (y?.sansFaute ?? false),
        Math.max(x?.runs ?? 0, y?.runs ?? 0),
        fusionneEscalier(x?.escalier, y?.escalier),
      ),
    };
  }

  const jour = fusionneJour(a.jour, b.jour);

  const records: Record<string, number> = {};
  for (const cle of new Set([...Object.keys(a.records), ...Object.keys(b.records)])) {
    records[cle] = Math.max(a.records[cle] ?? 0, b.records[cle] ?? 0);
  }

  return {
    // « absent vaut rien joué » : on n'écrit la journée que si elle existe.
    ...(jour ? { jour } : {}),
    carnet,
    serie: {
      count: Math.max(a.serie.count, b.serie.count),
      lastDay: Math.max(a.serie.lastDay, b.serie.lastDay),
    },
    records,
  };
}

/* ------------------------------------------------------------------ *
 * Clé de comparabilité
 * ------------------------------------------------------------------ */

/**
 * Ce qui définit qu'une performance est comparable à une autre.
 *
 * `jour` n'entre PAS dans la clé des records personnels — un record est un
 * plafond, pas un résultat daté. Il entrera dans la clé d'un futur classement
 * du jour, dont c'est précisément la propriété : même graine pour tout le
 * monde. Les deux usages partagent donc la même fonction, avec ou sans jour.
 */
export interface Conditions {
  mode: string;
  /** Signature du réglage : allure, vies, variantes. Ordonné, donc stable. */
  regime: Record<string, string | number | boolean>;
  /** Voir `src/engine/version.ts` — calculée, jamais tenue à la main. */
  versionContenu: string;
  /** Index de jour, pour un run à graine partagée. */
  jour?: number;
}

export function cleComparaison(c: Conditions): string {
  const regime = Object.keys(c.regime)
    .sort()
    .map((k) => `${k}:${String(c.regime[k])}`)
    .join(",");
  const jour = c.jour === undefined ? "" : `|j:${c.jour}`;
  return `${c.mode}|${regime}|v:${c.versionContenu}${jour}`;
}
