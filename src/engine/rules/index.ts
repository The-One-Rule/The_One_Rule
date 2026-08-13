import { rChance, rInt } from "../rng";
import { INSTRUCTIONS } from "../instructions";
import { COLOR_IDS, FIELD_W } from "../types";
import type { ColorId, Entity, OneRule, Want } from "../types";
import { VOWELS } from "../instructions";

/* ------------------------------------------------------------------ *
 * Helpers partagés
 * ------------------------------------------------------------------ */

/** Les entités qu'un `want` demande de cliquer. Vide pour les attentes clavier. */
function targets(want: Want, ents: Entity[]): Entity[] {
  switch (want.kind) {
    case "click":
      return ents[want.idx] ? [ents[want.idx]!] : [];
    case "sequence":
      return want.idxs.map((i) => ents[i]).filter((e): e is Entity => !!e);
    default:
      return [];
  }
}

/** La plus grosse forme — uniquement si elle est strictement unique. */
export function uniqueBiggest(ents: Entity[]): Entity | null {
  if (ents.length < 2) return null;
  let max = -1;
  let who: Entity | null = null;
  let count = 0;
  for (const e of ents) {
    if (e.r > max) {
      max = e.r;
      who = e;
      count = 1;
    } else if (e.r === max) count++;
  }
  return count === 1 ? who : null;
}

const noForbid = () => false;
const noJudge = () => null;

/* ================================================================== *
 * FAMILLE 1 — LES INTERDITS
 * Elles créent des pièges : quand la consigne demanderait de les
 * enfreindre, la manche bascule et il faut ne rien faire.
 * ================================================================== */

const LE_SANG: OneRule = {
  id: "sang",
  name: "LE SANG",
  brief: "Ne clique jamais sur du rouge. Une consigne finira par te le demander.",
  traps: true,
  forbids: (want, ents) => targets(want, ents).some((e) => e.color === "garance"),
  judge: (a) =>
    a.kind === "click" && a.ent?.color === "garance" ? "TU AS CLIQUÉ SUR DU ROUGE" : null,
};

const LA_POINTE: OneRule = {
  id: "pointe",
  name: "LA POINTE",
  brief: "Ne clique jamais un triangle, même quand la consigne le désigne.",
  traps: true,
  forbids: (want, ents) => targets(want, ents).some((e) => e.shape === "triangle"),
  judge: (a) =>
    a.kind === "click" && a.ent?.shape === "triangle" ? "TU AS CLIQUÉ UN TRIANGLE" : null,
};

const LA_VOYELLE: OneRule = {
  id: "voyelle",
  name: "LA VOYELLE",
  brief: "Ne tape jamais A E I O U Y, même si la consigne l'exige.",
  traps: true,
  forbids: (want) =>
    (want.kind === "key" && VOWELS.includes(want.key)) ||
    false,
  judge: (a) => (a.kind === "key" && VOWELS.includes(a.key) ? "TU AS TAPÉ UNE VOYELLE" : null),
};

const LE_COLOSSE: OneRule = {
  id: "colosse",
  name: "LE COLOSSE",
  brief: "Ne clique jamais la plus grosse forme de l'écran. Repère-la avant d'agir.",
  traps: true,
  forbids: (want, ents) => {
    const big = uniqueBiggest(ents);
    return !!big && targets(want, ents).some((e) => e === big);
  },
  judge: (a, ctx) => {
    if (a.kind !== "click" || !a.ent) return null;
    return a.ent === uniqueBiggest(ctx.round.ents) ? "TU AS CLIQUÉ LA PLUS GROSSE FORME" : null;
  },
};

/**
 * Seuil calibré, pas choisi au hasard : à la moitié de l'écran, la règle
 * transformait 31 % des manches en "ne rien faire" et le jeu s'éteignait.
 * La bande couvre exactement la première colonne de la grille — 20 % des cibles.
 */
const BANNED_X = FIELD_W * 0.2;

const LE_GAUCHER: OneRule = {
  id: "gaucher",
  name: "LE GAUCHER",
  brief: "Ne clique jamais la première colonne. Elle est hachurée, aucun clic n'y est toléré.",
  traps: true,
  zone: { x0: 0, x1: BANNED_X },
  forbids: (want, ents) => targets(want, ents).some((e) => e.x < BANNED_X),
  judge: (a) => (a.kind === "click" && a.x < BANNED_X ? "TU AS CLIQUÉ DANS LA ZONE INTERDITE" : null),
};

const LA_SECONDE: OneRule = {
  id: "seconde",
  name: "LA SECONDE",
  brief: "N'agis jamais dans les 400 premières millisecondes d'une manche. Attends.",
  traps: false,
  forbids: noForbid,
  judge: (a, ctx) =>
    a.kind !== "release" && ctx.elapsedMs < 400 ? "TU AS AGI TROP TÔT" : null,
};

/* ================================================================== *
 * FAMILLE 2 — LES DÉFORMATIONS
 * Elles ne créent pas de pièges : elles altèrent la présentation.
 * ================================================================== */

const L_ECLAIR: OneRule = {
  id: "eclair",
  name: "L'ÉCLAIR",
  brief: "La consigne ne s'affiche qu'un instant, puis disparaît. Lis vite, retiens.",
  traps: false,
  forbids: noForbid,
  judge: noJudge,
  transform: (round, _rng, level) => ({
    ...round,
    hideTextAtMs: Math.max(320, 620 - level * 8),
  }),
};

const LE_MENTEUR: OneRule = {
  id: "menteur",
  name: "LE MENTEUR",
  brief: "Une consigne sur cinq est fausse et se corrige après un instant. Ne te fie pas au premier regard.",
  traps: false,
  forbids: noForbid,
  judge: noJudge,
  transform: (round, rng) => {
    if (!rChance(rng, 0.2)) return round;
    // un texte plausible emprunté à une autre consigne, forcément différent
    for (let attempt = 0; attempt < 6; attempt++) {
      const other = INSTRUCTIONS[rInt(rng, INSTRUCTIONS.length)]!;
      const draft = other.gen(rng, 20);
      if (draft.text !== round.text && !draft.glyph) {
        return { ...round, falseText: draft.text, revealAtMs: 350 };
      }
    }
    return round;
  },
};

const LE_DALTONIEN: OneRule = {
  id: "daltonien",
  name: "LE DALTONIEN",
  brief: "Les noms de couleur s'affichent dans la mauvaise couleur. Lis le mot, ignore l'encre.",
  traps: false,
  forbids: noForbid,
  judge: noJudge,
  transform: (round, rng) => {
    if (!round.colorWord) return round;
    const wrong = COLOR_IDS.filter((c) => c !== round.colorWord);
    return { ...round, inkColor: wrong[rInt(rng, wrong.length)] as ColorId };
  },
};

const LE_JUMEAU: OneRule = {
  id: "jumeau",
  name: "LE JUMEAU",
  brief: "Chaque action doit être faite deux fois de suite. Une seule ne compte pas.",
  traps: false,
  forbids: noForbid,
  judge: noJudge,
  transform: (round) =>
    round.steps.length === 0 ? round : { ...round, steps: [...round.steps, ...round.steps] },
};

const L_ACCELERATION: OneRule = {
  id: "acceleration",
  name: "L'ACCÉLÉRATION",
  brief: "Tout va 30 % plus vite, du début à la fin. Aucun interdit, juste moins de temps.",
  traps: false,
  forbids: noForbid,
  judge: noJudge,
  transform: (round) => ({ ...round, durationMs: Math.round(round.durationMs * 0.7) }),
};

/* ================================================================== *
 * FAMILLE 3 — LA CONTRAINTE PHYSIQUE
 * ================================================================== */

const LA_MAIN_GAUCHE: OneRule = {
  id: "mainGauche",
  name: "LA MAIN GAUCHE",
  brief: "Garde ESPACE enfoncée du début à la fin. Joue avec la souris et l'autre main.",
  traps: false,
  watchRelease: " ",
  forbids: noForbid,
  judge: (a) => (a.kind === "release" && a.key === " " ? "TU AS RELÂCHÉ ESPACE" : null),
};

export const ONE_RULES: OneRule[] = [
  LE_SANG,
  LA_POINTE,
  LA_VOYELLE,
  LE_COLOSSE,
  LE_GAUCHER,
  LA_SECONDE,
  L_ECLAIR,
  LE_MENTEUR,
  LE_DALTONIEN,
  LE_JUMEAU,
  L_ACCELERATION,
  LA_MAIN_GAUCHE,
];

export const ruleById = (id: string): OneRule | undefined => ONE_RULES.find((r) => r.id === id);
