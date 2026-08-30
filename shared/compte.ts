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
}

export const agregatsVides = (): Agregats => ({
  carnet: {},
  serie: { count: 0, lastDay: -99 },
  records: {},
});

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
    };
  }

  const records: Record<string, number> = {};
  for (const cle of new Set([...Object.keys(a.records), ...Object.keys(b.records)])) {
    records[cle] = Math.max(a.records[cle] ?? 0, b.records[cle] ?? 0);
  }

  return {
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
