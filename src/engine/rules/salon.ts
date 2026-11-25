/**
 * LES RÈGLES DE SALON — les idées de consignes de l'équipe (kanban, 25/11).
 *
 * Sept règles, et aucune n'entre au catalogue solo (`ONE_RULES`) : le run du
 * jour, l'entraînement, `VERSION_CONTENU`, le carnet et le rejeu serveur n'en
 * savent rien. C'est la même porte que LA RANCUNE, et pour la même raison —
 * ouvrir une règle au solo fait repartir les records d'entraînement affichés
 * d'une clé neuve, et c'est une décision de Pierre.
 *
 * Elles sont NÉGOCIÉES sur le fil (`VERSION_SALON`, voir `multiRulesFor`) :
 * un client qui ne sait pas lire `immobile` ne doit jamais la recevoir.
 *
 * ⚠️ TROIS RÈGLES ONT ÉTÉ RECALIBRÉES PAR LA MESURE, et ce n'est pas un goût.
 * Taux de pièges, salon tactile en version 5, 300 matchs × 40 manches, par
 * tranches de dix manches (`tests/salon-regles.test.ts` refait la mesure) :
 *
 *   L'IMMOBILE telle qu'écrite (« jamais une forme qui bouge »)
 *       0,4 %  3,8 %  3,6 %  3,9 %  — seule la consigne « CELUI QUI BOUGE »
 *       fait bouger une pièce : la règle était INERTE (n°1).
 *       → chez son porteur, une pièce sur cinq bouge aussi : 22 % stables.
 *   LA FOULE telle qu'écrite (« jamais quand il y a plus de 4 formes »)
 *       30 %  89 %  89 %  88 %  — l'effectif monte avec la manche : la règle
 *       devenait « ne fais jamais rien », exactement ce que craignait la carte.
 *       → « jamais la couleur la plus nombreuse » : 24 à 26 % à toute manche.
 *       On compte toujours avant d'agir ; on compare au lieu de seuiller.
 *   LE VOISIN aux huit voisins (diagonales comprises)
 *       23 %  34 %  39 %  44 %
 *       → par un CÔTÉ seulement, et le rouge lui-même ne compte pas :
 *       11 %  18 %  22 %  26 %.
 *
 * Pour comparaison, sur la même mesure : LE SANG 25 %, LA ROUE 33 %.
 *
 * Module PUR : aucune horloge, aucun hasard non seedé (`architecture.test`).
 */

import { MOTIFS } from "../motifs.js";
import { hashStr, mulberry32, rChance, rInt } from "../rng.js";
import { FIELD_H, FIELD_W } from "../types.js";
import type { ColorId, Entity, OneRule, Round, Step } from "../types.js";
import { targets } from "./cibles.js";

/**
 * La version du jeu de consignes à partir de laquelle un salon peut tirer ces
 * règles (`CONSIGNES_VERSION`). Le pool de CONSIGNES de la version 6 est
 * identique à celui de la 5 — testé.
 */
export const VERSION_SALON = 6;

const noForbid = () => false;

/* ------------------------------------------------------------------ *
 * L'IMMOBILE — jamais une forme qui bouge.
 * ------------------------------------------------------------------ */

/**
 * La part des pièces qui bougent chez le porteur, quand la scène n'en fait
 * bouger aucune. 0,20 donne 22 % de pièges, 0,25 en donnerait 27 % (mesuré).
 */
const PART_MOBILE = 0.2;

const frac = (x: number): number => x - Math.floor(x);

/**
 * Cette pièce bouge-t-elle sous L'IMMOBILE ?
 *
 * Une pièce bouge déjà si la consigne l'a voulu (« CLIQUE CELUI QUI BOUGE »).
 * Sinon — et seulement si la scène ne fait bouger PERSONNE, pour ne jamais
 * brouiller « CELUI QUI NE BOUGE PAS » — une sur cinq se met en mouvement,
 * choisie par sa `phase`, qui vient de la graine de la scène commune.
 *
 * ⚠️ Décidé sur la scène AVANT la déformation, par `forbids` comme par
 * `transform` : c'est ce qui garantit que la règle ne CRÉE pas un piège que
 * `forbids` ignorerait (le commentaire de `buildRound`). Et juger le drapeau,
 * jamais la vitesse vue à l'instant du clic : l'aperçu et le verdict lisent
 * la même chose (n°3).
 */
export function bougeSousImmobile(e: Entity, ents: readonly Entity[]): boolean {
  if (e.moving) return true;
  return !ents.some((x) => x.moving) && frac(e.phase * 3.7) < PART_MOBILE;
}

const L_IMMOBILE: OneRule = {
  id: "immobile",
  name: "L'IMMOBILE",
  brief: "Ne clique jamais une forme qui bouge, même quand la consigne la désigne.",
  traps: true,
  forbids: (want, ents) => targets(want, ents).some((e) => bougeSousImmobile(e, ents)),
  judge: (a) => (a.kind === "click" && a.ent?.moving ? MOTIFS.immobile : null),
  transform: (round) => {
    const bougent = round.ents.filter((e) => bougeSousImmobile(e, round.ents));
    if (bougent.every((e) => e.moving)) return round;
    // Les entités sont déjà des CLONES (`applyRule`) : rien ne fuit chez les autres.
    for (const e of bougent) e.moving = true;
    return round;
  },
};

/* ------------------------------------------------------------------ *
 * LE VOISIN — jamais une forme collée à une forme rouge.
 * ------------------------------------------------------------------ */

const CELL_W = FIELD_W / 5;
const CELL_H = FIELD_H / 3;

/** La cellule de la grille 5 × 3, lue sur la position AU REPOS (comme LES ANGLES). */
const cellule = (e: Entity): [number, number] => [Math.floor(e.ox / CELL_W), Math.floor(e.oy / CELL_H)];

/**
 * Collée par un CÔTÉ à une forme rouge, sans être rouge elle-même.
 *
 * Les pièces ne se touchent jamais (une par cellule, `scene.ts`) : « toucher »
 * se dit en cellules. Debout au téléphone la grille tourne, le voisinage non.
 */
export function voisineDuRouge(e: Entity, ents: readonly Entity[]): boolean {
  if (e.color === "garance") return false;
  const [c, r] = cellule(e);
  return ents.some((o) => {
    if (o === e || o.color !== "garance") return false;
    const [oc, or] = cellule(o);
    return Math.abs(oc - c) + Math.abs(or - r) === 1;
  });
}

const LE_VOISIN: OneRule = {
  id: "voisin",
  name: "LE VOISIN",
  brief: "Ne clique jamais une forme collée par un côté à une forme rouge. Le rouge lui-même ne compte pas.",
  traps: true,
  forbids: (want, ents) => targets(want, ents).some((e) => voisineDuRouge(e, ents)),
  judge: (a, ctx) =>
    a.kind === "click" && a.ent && voisineDuRouge(a.ent, ctx.round.ents) ? MOTIFS.voisin : null,
};

/* ------------------------------------------------------------------ *
 * LA FOULE — jamais la couleur la plus nombreuse.
 * ------------------------------------------------------------------ */

/** La couleur STRICTEMENT la plus nombreuse (au moins deux), ou null à égalité. */
export function couleurDeLaFoule(ents: readonly Entity[]): ColorId | null {
  const n = new Map<ColorId, number>();
  for (const e of ents) n.set(e.color, (n.get(e.color) ?? 0) + 1);
  let best: ColorId | null = null;
  let max = 0;
  let ex = false;
  for (const [c, k] of n) {
    if (k > max) {
      max = k;
      best = c;
      ex = false;
    } else if (k === max) ex = true;
  }
  return !ex && max >= 2 ? best : null;
}

const LA_FOULE: OneRule = {
  id: "foule",
  name: "LA FOULE",
  brief: "Ne clique jamais la couleur la plus nombreuse de l'écran. Compte avant d'agir.",
  traps: true,
  forbids: (want, ents) => {
    const foule = couleurDeLaFoule(ents);
    return !!foule && targets(want, ents).some((e) => e.color === foule);
  },
  judge: (a, ctx) => {
    if (a.kind !== "click" || !a.ent) return null;
    return a.ent.color === couleurDeLaFoule(ctx.round.ents) ? MOTIFS.foule : null;
  },
};

/* ------------------------------------------------------------------ *
 * LE MIROIR — gauche veut dire droite.
 * ------------------------------------------------------------------ */

const FLECHE_MIROIR: Readonly<Record<string, string>> = {
  ArrowLeft: "ArrowRight",
  ArrowRight: "ArrowLeft",
};

/**
 * La pièce « de l'autre côté » de celle que désigne la consigne, ou null.
 *
 * Seules les oppositions SANS AMBIGUÏTÉ se retournent : le plus à gauche et le
 * plus à droite (une pièce chacun) ; le plus gros et le plus petit d'une
 * couleur (la consigne en pose exactement deux). « LA PLUS GROSSE » ne se
 * retourne pas : sa scène porte trois moyennes ex æquo, et un miroir qui
 * désigne trois pièces est une consigne ambiguë — le seul risque fatal.
 */
function pieceMiroir(round: Round, cible: number): number | null {
  const ents = round.ents;
  switch (round.instructionId) {
    case "extremeSide": {
      let g = ents[0]!;
      let d = ents[0]!;
      for (const e of ents) {
        if (e.ox < g.ox) g = e;
        if (e.ox > d.ox) d = e;
      }
      return cible === g.idx ? d.idx : cible === d.idx ? g.idx : null;
    }
    case "smallestOfColor": {
      const c = ents[cible];
      if (!c) return null;
      const autre = ents.filter((e) => e.color === c.color && e.idx !== cible);
      return autre.length === 1 ? autre[0]!.idx : null;
    }
    default:
      return null;
  }
}

const LE_MIROIR: OneRule = {
  id: "miroir",
  name: "LE MIROIR",
  brief: "Gauche veut dire droite, et l'inverse. Le plus gros veut dire le plus petit. Fais ce que dit le miroir.",
  traps: false,
  forbids: noForbid,
  judge: (a, ctx) => {
    const r = ctx.round;
    if (a.kind === "click" && r.leurre !== undefined && a.ent?.idx === r.leurre) return MOTIFS.miroir;
    if (a.kind === "key" && r.leurreTouche !== undefined && a.key === r.leurreTouche) return MOTIFS.miroir;
    return null;
  },
  transform: (round) => {
    const s = round.steps;
    if (s.length !== 1) return round;
    const step = s[0]!;
    if (step.kind === "key") {
      const autre = FLECHE_MIROIR[step.key];
      if (!autre || round.instructionId !== "arrow") return round;
      return { ...round, steps: [{ kind: "key", key: autre }], leurreTouche: step.key };
    }
    if (step.kind !== "click") return round;
    const m = pieceMiroir(round, step.idx);
    if (m === null) return round;
    return { ...round, steps: [{ kind: "click", idx: m }], leurre: step.idx };
  },
};

/* ------------------------------------------------------------------ *
 * L'INSOUMIS — une consigne écrite en rouge, il faut faire le contraire.
 * ------------------------------------------------------------------ */

/** Part des manches à un seul clic désigné qui s'écrivent en rouge. */
const PART_INSOUMISE = 0.3;

/**
 * « Le contraire » d'une consigne qui désigne une pièce : toucher n'importe
 * quoi SAUF elle. C'est la seule définition qui vaille pour toutes les
 * consignes à un clic, et qui ne fabrique ni piège ni cible ambiguë — « ne
 * rien faire » aurait fait de la règle un second piège visible, et « l'autre
 * pièce » n'existe pas quand il y en a six.
 *
 * Les séquences, les maintiens, les glisser et les consignes « n'importe où »
 * ne s'écrivent jamais en rouge : leur contraire n'a pas de sens qui se lise
 * en 200 ms.
 *
 * ⚠️ Un signal par la SEULE couleur serait illisible pour un daltonien : la
 * consigne insoumise porte aussi un soulignement ondulé (`theme.css`,
 * `.is-insoumise`), pour tout le monde. L'encre rouge éteint aussi le dessin
 * de la consigne (`pictogramme`), qui ne doit rien trancher à sa place.
 */
const L_INSOUMIS: OneRule = {
  id: "insoumis",
  name: "L'INSOUMIS",
  brief: "Une consigne écrite en ROUGE dit le contraire : touche n'importe quoi, SAUF ce qu'elle désigne.",
  traps: false,
  forbids: noForbid,
  judge: (a, ctx) =>
    a.kind === "click" && ctx.round.insoumise && a.ent?.idx === ctx.round.leurre ? MOTIFS.insoumis : null,
  transform: (round, rng) => {
    const s = round.steps;
    if (s.length !== 1 || s[0]!.kind !== "click") return round;
    if (!rChance(rng, PART_INSOUMISE)) return round;
    const contraire: Step = { kind: "clickAny" };
    return {
      ...round,
      steps: [contraire],
      leurre: s[0]!.idx,
      insoumise: true,
      inkColor: "garance",
    };
  },
};

/* ------------------------------------------------------------------ *
 * LE GONG — si tu entends le gong, ne fais rien.
 * ------------------------------------------------------------------ */

/** Chance qu'une manche IMPAIRE sonne : 0,45 / 2 ≈ 22 % des manches. */
const CHANCE_GONG = 0.45;

/**
 * Le gong ne sonne que sur une manche d'index IMPAIR : jamais deux pièges
 * d'affilée (directive du 01/10), par construction, sans avoir à se souvenir
 * de la manche d'avant — `transform` ne la connaît pas, et le serveur n'a pas
 * à la lui donner.
 */
export const gongPossible = (idx: number): boolean => idx % 2 === 1;

/**
 * ⚠️ LA SEULE RÈGLE QUI CONTREDIT LA DOCTRINE DU SON (`audio/index.ts` :
 * « aucune information de jeu ne dépend du son »). Elle n'entre donc au pool
 * que si TOUS les sièges ont annoncé le son allumé (`hello.son`, absent = non,
 * comme `clavier`). Ce que le jeu ne peut PAS savoir : un téléphone en mode
 * silencieux, des écouteurs débranchés. Elle reste hors du solo et du run du
 * jour — inaccessible à un joueur sourd, elle ne doit jamais être imposée.
 *
 * `traps` est vrai : elle pose des manches à ne rien faire. Mais elle ne les
 * pose pas par `forbids` — aucune consigne ne la viole — et la déformation
 * CRÉE donc un piège, l'exception assumée au commentaire de `buildRound`.
 * Le serveur juge `round.trap`, pas `forbids` : client et serveur appliquent
 * la même `transform` sur le même RNG, donc le même gong (n°3).
 */
const LE_GONG: OneRule = {
  id: "gong",
  name: "LE GONG",
  brief: "Quand le gong sonne à l'ouverture d'une manche, ne fais rien. Garde le son allumé.",
  traps: true,
  forbids: noForbid,
  judge: (a, ctx) => (ctx.round.gong && (a.kind === "click" || a.kind === "key") ? MOTIFS.gong : null),
  transform: (round, rng, idx) => {
    if (!gongPossible(idx) || !rChance(rng, CHANCE_GONG)) return round;
    return { ...round, steps: [], trap: true, gong: true };
  },
};

/* ------------------------------------------------------------------ *
 * L'INCONNUE — ta règle est cachée.
 * ------------------------------------------------------------------ */

export const INCONNUE = "inconnue";

/**
 * L'INCONNUE n'est pas une règle, c'est un VOILE sur une règle : son
 * identifiant porte celle qu'elle cache (`inconnue:sang`). Elle juge, piège et
 * déforme exactement comme elle ; seuls le nom et le brief se taisent, jusqu'au
 * premier piège raté ou à la cinquième manche (`revelee`, côté client).
 *
 * Le client CONNAÎT la règle cachée — il doit juger la même action que le
 * serveur (n°3). Un joueur qui ouvre l'inspecteur la lit : c'est vrai de tout
 * ce que le client sait, et l'enjeu d'une manche de salon entre amis ne vaut
 * pas un chiffrement.
 */
export function regleCachee(id: string, resout: (id: string) => OneRule | undefined): OneRule | undefined {
  if (!id.startsWith(`${INCONNUE}:`)) return undefined;
  const dessous = resout(id.slice(INCONNUE.length + 1));
  return dessous ? inconnue(dessous) : undefined;
}

export const estInconnue = (id: string): boolean => id.startsWith(`${INCONNUE}:`);

/** `inconnue:sang` → `sang`. Tout le reste → null. */
export const sousLInconnue = (id: string): string | null =>
  estInconnue(id) ? id.slice(INCONNUE.length + 1) : null;

const voiles = new Map<string, OneRule>();

/** Le voile posé sur une règle. Mêmes objets à chaque appel, comparables par identité. */
export function inconnue(dessous: OneRule): OneRule {
  const connu = voiles.get(dessous.id);
  if (connu) return connu;
  const r: OneRule = {
    ...dessous,
    id: `${INCONNUE}:${dessous.id}`,
    name: "L'INCONNUE",
    brief: "Ta règle est cachée. Elle se révèle au premier piège raté, ou après cinq manches.",
  };
  voiles.set(dessous.id, r);
  return r;
}

/** Le représentant de L'INCONNUE dans le pool : `rulesAt` le remplace par le voile de l'équipe. */
const L_INCONNUE_POOL: OneRule = {
  id: INCONNUE,
  name: "L'INCONNUE",
  brief: "Ta règle est cachée.",
  traps: true,
  forbids: noForbid,
  judge: () => null,
};

const SEL_INCONNUE = 0x51ed27c5 | 0;

/**
 * La règle qu'une équipe porte sous L'INCONNUE — tirée de la graine, parmi
 * celles qui PIÈGENT par la consigne (`candidates`). Par équipe, comme LA
 * RANCUNE : deux porteurs successifs ne cachent pas forcément la même.
 */
export function regleSousLInconnue(seed: number, equipe: number, candidates: readonly OneRule[]): OneRule {
  const rng = mulberry32(hashStr(`${seed}:inconnue:${equipe}`) ^ SEL_INCONNUE);
  return candidates[rInt(rng, candidates.length)]!;
}

/** Manches tenues avant que L'INCONNUE ne se révèle d'elle-même. */
export const MANCHES_INCONNUE = 5;

/* ------------------------------------------------------------------ *
 * Le pool
 * ------------------------------------------------------------------ */

/** Les règles de salon tirables, dans l'ordre du kanban. GONG à part : il dépend du son. */
export const REGLES_SALON: readonly OneRule[] = [
  LE_MIROIR,
  L_INSOUMIS,
  LA_FOULE,
  LE_VOISIN,
  L_IMMOBILE,
  L_INCONNUE_POOL,
];

export const REGLE_GONG = LE_GONG;

/** Toutes, par identifiant — pour `ruleById`. */
const PAR_ID = new Map<string, OneRule>(
  [...REGLES_SALON, LE_GONG].filter((r) => r.id !== INCONNUE).map((r) => [r.id, r]),
);

export const regleSalonDepuisId = (id: string): OneRule | undefined => PAR_ID.get(id);
