/**
 * LE PARCOURS — la colonne vertébrale du jeu.
 *
 * Remplace, comme porte d'entrée, l'entraînement libre et l'escalier caché.
 * Le constat qui l'exige vient des joueurs : « pas intuitif », « aucune
 * sensation de récompense », « les escaliers sont durs à trouver ». Le jeu
 * avait cinq modes et vingt paliers par règle, rangés derrière trois clics ;
 * un nouveau venu voyait un bouton JOUER qui menait à un entraînement sans fin
 * et sans but.
 *
 * Le parcours est une SUITE de niveaux, toujours la même, qu'on remonte :
 *
 *   · un CHAPITRE par règle, dans un ordre pensé pour apprendre (LE SANG
 *     d'abord — la couleur se voit, elle ne se cherche pas) ;
 *   · CINQ niveaux par chapitre, du plus doux au BOSS ;
 *   · TROIS VIES par niveau, et les vies restantes à l'arrivée SONT les
 *     étoiles. Rien d'inventé : « tu as fini avec deux cœurs » se voit ;
 *   · battre le boss d'un chapitre ouvre le suivant et fait passer la carte de
 *     la règle en MAÎTRISÉE.
 *
 * ⚠️ PUR : ni DOM, ni horloge, ni stockage. Les étoiles vivent dans le carnet
 * (`RuleRecord.etoiles`) pour voyager avec le compte comme le reste — voir
 * `shared/compte.ts`, où leur fusion est un maximum case par case.
 *
 * ⚠️ Un niveau se joue avec les leviers de l'ancien escalier (longueur,
 * allure, cadence de pièges, annonce du piège) : `palierDeNiveau` en rend la
 * forme exacte, donc la plomberie de `main.ts` et de `Session` n'a pas bougé.
 */
import type { Annonce, Palier } from "./escalier.js";

/* ------------------------------------------------------------------ *
 * Les chapitres
 * ------------------------------------------------------------------ */

/**
 * L'ordre du parcours. Une règle, un chapitre.
 *
 * Pensé pour apprendre, pas pour ranger :
 *   · les trois premiers sont des INTERDITS PERCEPTIFS (une couleur, une
 *     couleur, une forme) : le piège s'y lit en 200 ms ;
 *   · une DÉFORMATION arrive en quatrième, quand le piège est acquis — elle
 *     change le rythme sans rien interdire ;
 *   · puis on alterne, en gardant les règles les plus DURES mesurées (médianes
 *     5 à 7 : LE GAUCHER, LE SOLITAIRE) pour la seconde moitié ;
 *   · les trois règles qui dépendent de l'appareil ferment la marche — elles
 *     sont sautées là où elles sont injouables, sans rien bloquer.
 */
export const CHAPITRES: readonly string[] = [
  "sang",
  "azur",
  "roue",
  "jumeau",
  "pointe",
  "colosse",
  "seconde",
  "angles",
  "eclair",
  "gaucher",
  "menteur",
  "solitaire",
  "acceleration",
  "voyelle",
  "daltonien",
  "mainGauche",
];

/* ------------------------------------------------------------------ *
 * Les niveaux
 * ------------------------------------------------------------------ */

export type NiveauId = "premiers" | "piege" | "sansFilet" | "tempo" | "boss";

export interface NiveauDef {
  /** De 1 à 5. */
  n: number;
  id: NiveauId;
  manches: number;
  /** Multiplicateur de fenêtre. 2 = deux fois plus de temps. */
  allure: number;
  /** Un piège forcé toutes les N manches. 0 = aucun forçage. */
  cadence: number;
  /** Le jeu annonce-t-il le piège pendant la manche ? */
  annonce: Annonce;
}

export const VIES_NIVEAU = 3;
export const ETOILES_MAX = 3;

/**
 * Cinq niveaux, un seul levier neuf à chaque marche.
 *
 * 1 · PREMIERS PAS — lent, aucun piège forcé : on apprend la règle.
 * 2 · LE PIÈGE     — le piège entre, et le jeu le SIGNALE. On apprend à ne
 *                    rien faire.
 * 3 · SANS FILET   — l'annonce tombe. C'est ici que le jeu commence.
 * 4 · TEMPO        — l'allure du vrai jeu.
 * 5 · BOSS         — plus long, pièges plus serrés.
 *
 * ⚠️ L'annonce du piège croise la décision n°5 (« le piège n'est révélé qu'après
 * la mort »). Elle est levée sur les DEUX premiers niveaux seulement, qui sont
 * un apprentissage : rien de ce qui se compare — run du jour, multi, classé —
 * ne passe par ici, et le boss qui déclare la maîtrise se joue sans aide.
 */
export const NIVEAUX: readonly NiveauDef[] = [
  { n: 1, id: "premiers", manches: 6, allure: 2, cadence: 0, annonce: "toujours" },
  { n: 2, id: "piege", manches: 8, allure: 2, cadence: 3, annonce: "toujours" },
  { n: 3, id: "sansFilet", manches: 10, allure: 1.5, cadence: 4, annonce: "jamais" },
  { n: 4, id: "tempo", manches: 12, allure: 1, cadence: 4, annonce: "jamais" },
  { n: 5, id: "boss", manches: 15, allure: 1, cadence: 3, annonce: "jamais" },
];

export const NIVEAU_BOSS = NIVEAUX.length;

export const niveauN = (n: number): NiveauDef | undefined => NIVEAUX[n - 1];

/**
 * La forme qu'attend la plomberie des runs bornés (`Session`, `main.ts`).
 *
 * `n` y est l'identifiant global du niveau (chapitre × 10 + niveau) : il n'est
 * lu que pour l'affichage, et deux niveaux ne doivent jamais se confondre.
 */
export function palierDeNiveau(chapitre: number, def: NiveauDef): Palier {
  return {
    n: chapitre * 10 + def.n,
    volee: def.allure >= 2 ? "decouverte" : def.allure >= 1.5 ? "apprentissage" : "controle",
    manches: def.manches,
    allure: def.allure,
    cadence: def.cadence,
    annonce: def.annonce,
  };
}

/* ------------------------------------------------------------------ *
 * L'état du joueur
 * ------------------------------------------------------------------ */

/** Étoiles par règle : un tableau de cinq cases, 0 = niveau jamais réussi. */
export type Etoiles = Record<string, readonly number[] | undefined>;

/** Les étoiles d'un niveau. Absent vaut zéro. */
export const etoilesDe = (e: Etoiles, ruleId: string, n: number): number =>
  e[ruleId]?.[n - 1] ?? 0;

/** Le chapitre est-il bouclé — boss battu ? */
export const chapitreFini = (e: Etoiles, ruleId: string): boolean =>
  etoilesDe(e, ruleId, NIVEAU_BOSS) > 0;

/** Étoiles d'un chapitre, sur quinze. */
export const etoilesChapitre = (e: Etoiles, ruleId: string): number =>
  NIVEAUX.reduce((t, d) => t + etoilesDe(e, ruleId, d.n), 0);

/** Toutes les étoiles du parcours. */
export const totalEtoiles = (e: Etoiles, chapitres: readonly string[] = CHAPITRES): number =>
  chapitres.reduce((t, id) => t + etoilesChapitre(e, id), 0);

/**
 * Le chapitre `i` est-il ouvert ?
 *
 * Le premier toujours. Les autres dès que le chapitre JOUABLE précédent a son
 * boss battu. Un chapitre injouable sur cet appareil (LA MAIN GAUCHE sur un
 * téléphone) ne bloque jamais la suite : on le saute, comme s'il n'existait
 * pas — il ne doit pas devenir un mur que le joueur ne peut pas franchir.
 */
export function chapitreOuvert(
  e: Etoiles,
  i: number,
  jouable: (ruleId: string) => boolean,
  chapitres: readonly string[] = CHAPITRES,
  /**
   * Les règles déjà au carnet.
   *
   * ⚠️ Un chapitre dont la règle est DÉJÀ CONNUE est ouvert, quel que soit le
   * boss d'avant. Rapporté par Pierre : un ancien joueur — seize règles
   * rencontrées avant que le parcours existe, six maîtrisées — voyait les
   * quinze chapitres suivants verrouillés, comme un joueur du premier jour.
   * Même cas pour une règle rencontrée en multijoueur. Le verrou existe pour
   * ne pas brûler la surprise d'une règle (décision n°7) ; il n'a plus rien à
   * protéger quand la règle est connue. Les ÉTOILES, elles, restent à
   * gagner : ce qui s'ouvre n'est pas ce qui est acquis.
   */
  connues?: ReadonlySet<string>,
): boolean {
  if (i <= 0) return true;
  if (connues?.has(chapitres[i] ?? "")) return true;
  for (let k = i - 1; k >= 0; k--) {
    const id = chapitres[k]!;
    if (!jouable(id)) continue;
    return chapitreFini(e, id);
  }
  return true;
}

/** Le niveau `n` du chapitre `i` est-il jouable maintenant ? */
export function niveauOuvert(
  e: Etoiles,
  i: number,
  n: number,
  jouable: (ruleId: string) => boolean,
  chapitres: readonly string[] = CHAPITRES,
  connues?: ReadonlySet<string>,
): boolean {
  const id = chapitres[i];
  if (!id || !jouable(id)) return false;
  if (!chapitreOuvert(e, i, jouable, chapitres, connues)) return false;
  return n <= 1 || etoilesDe(e, id, n - 1) > 0;
}

export interface Position {
  chapitre: number;
  ruleId: string;
  niveau: number;
}

/**
 * LE PROCHAIN NIVEAU — ce que le bouton JOUER lance.
 *
 * Le premier niveau ouvert jamais réussi. Quand tout est réussi, le premier
 * niveau qui n'a pas ses trois étoiles : il reste toujours quelque chose à
 * aller chercher. Quand tout est parfait, `null`.
 */
export function prochainNiveau(
  e: Etoiles,
  jouable: (ruleId: string) => boolean,
  chapitres: readonly string[] = CHAPITRES,
  connues?: ReadonlySet<string>,
): Position | null {
  let aParfaire: Position | null = null;
  for (let i = 0; i < chapitres.length; i++) {
    const id = chapitres[i]!;
    if (!jouable(id) || !chapitreOuvert(e, i, jouable, chapitres, connues)) continue;
    for (const d of NIVEAUX) {
      if (!niveauOuvert(e, i, d.n, jouable, chapitres, connues)) break;
      const et = etoilesDe(e, id, d.n);
      if (et === 0) return { chapitre: i, ruleId: id, niveau: d.n };
      if (et < ETOILES_MAX && !aParfaire) aParfaire = { chapitre: i, ruleId: id, niveau: d.n };
    }
  }
  return aParfaire;
}

/** Combien de chapitres sont ouverts — la mesure de l'avancée. */
export function chapitresOuverts(
  e: Etoiles,
  jouable: (ruleId: string) => boolean,
  chapitres: readonly string[] = CHAPITRES,
  connues?: ReadonlySet<string>,
): number {
  let n = 0;
  for (let i = 0; i < chapitres.length; i++) {
    if (jouable(chapitres[i]!) && chapitreOuvert(e, i, jouable, chapitres, connues)) n++;
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * Ce qu'un essai rapporte
 * ------------------------------------------------------------------ */

/** Les étoiles d'un essai : les vies restantes si le niveau est franchi, sinon 0. */
export const etoilesDeLEssai = (franchi: boolean, vies: number): number =>
  franchi ? Math.max(1, Math.min(ETOILES_MAX, vies)) : 0;

export const PIECES_PAR_ETOILE = 10;
export const PIECES_CHAPITRE = 50;

export interface Gain {
  /** Les cinq cases du chapitre après l'essai. */
  cases: number[];
  /** Étoiles de l'essai. */
  etoiles: number;
  /** Étoiles NOUVELLES — seules celles-là rapportent. */
  nouvelles: number;
  /** Le niveau était-il jamais réussi avant ? */
  premiereFois: boolean;
  /** Le boss vient-il d'être battu pour la première fois ? */
  chapitreBoucle: boolean;
  pieces: number;
}

/**
 * La loi : un MAXIMUM case par case, jamais une affectation.
 *
 * Un second essai moins bon n'efface rien — la même loi que le carnet et que
 * la fusion des comptes. Et seules les étoiles NOUVELLES rapportent des
 * pièces : rejouer un niveau à trois étoiles ne fabrique pas de monnaie.
 */
export function enregistreEssai(avant: readonly number[] | undefined, n: number, etoiles: number): Gain {
  const cases = NIVEAUX.map((_, k) => avant?.[k] ?? 0);
  const prev = cases[n - 1] ?? 0;
  const apres = Math.max(prev, etoiles);
  cases[n - 1] = apres;
  const nouvelles = apres - prev;
  const chapitreBoucle = n === NIVEAU_BOSS && prev === 0 && apres > 0;
  return {
    cases,
    etoiles,
    nouvelles,
    premiereFois: prev === 0 && apres > 0,
    chapitreBoucle,
    pieces: nouvelles * PIECES_PAR_ETOILE + (chapitreBoucle ? PIECES_CHAPITRE : 0),
  };
}

/** Fusion de deux tableaux d'étoiles : maximum case par case. */
export function fusionneEtoiles(
  x: readonly number[] | undefined,
  y: readonly number[] | undefined,
): number[] | undefined {
  if (!x && !y) return undefined;
  return NIVEAUX.map((_, k) => Math.max(x?.[k] ?? 0, y?.[k] ?? 0));
}

/** Relit un tableau d'étoiles venu du stockage ou du réseau. */
export function litEtoiles(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const cases = NIVEAUX.map((_, k) => {
    const x = v[k];
    return typeof x === "number" && Number.isFinite(x)
      ? Math.max(0, Math.min(ETOILES_MAX, Math.floor(x)))
      : 0;
  });
  return cases.some((c) => c > 0) ? cases : undefined;
}
