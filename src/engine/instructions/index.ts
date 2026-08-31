import { rChance, rInt, rPick } from "../rng";
import { fillCount, rollSize } from "../scene";
import { COLOR_IDS, SHAPE_IDS } from "../types";
import type { ColorId, EntitySpec, Entity, Instruction, Rng, ShapeId } from "../types";

/* ------------------------------------------------------------------ *
 * Étiquettes d'affichage
 * ------------------------------------------------------------------ */
export const SHAPE_LABEL: Record<ShapeId, string> = {
  carre: "CARRÉ",
  rond: "ROND",
  triangle: "TRIANGLE",
};
/**
 * Les couleurs portent des noms d'identité (garance, azur, jade, ambre) dans le
 * code et la marque, mais s'affichent en mots courts dans le jeu.
 * La ligne de consigne appartient à la mécanique : le joueur a ~600 ms pour la
 * reconnaître à sa silhouette, pas pour déchiffrer un terme de teinturier.
 */
export const COLOR_LABEL: Record<ColorId, string> = {
  garance: "ROUGE",
  azur: "BLEU",
  jade: "VERT",
  ambre: "JAUNE",
};

/**
 * Les memes couleurs en anglais.
 *
 * Elles vivent ICI et non dans la couche d'affichage pour une seule raison :
 * `typeInitial` juge une INITIALE, donc le moteur doit connaitre les deux
 * alphabets pour accepter les deux lettres. Ailleurs, c'est l'affichage qui
 * compose — voir `Phrase`.
 */
export const COLOR_LABEL_EN: Record<ColorId, string> = {
  garance: "RED",
  azur: "BLUE",
  jade: "GREEN",
  ambre: "YELLOW",
};

export const SHAPE_LABEL_EN: Record<ShapeId, string> = {
  carre: "SQUARE",
  rond: "CIRCLE",
  triangle: "TRIANGLE",
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const VOWELS = ["A", "E", "I", "O", "U", "Y"];
const CONSONANTS = LETTERS.filter((l) => !VOWELS.includes(l));
const ARROWS = [
  { key: "ArrowUp", glyph: "↑" },
  { key: "ArrowDown", glyph: "↓" },
  { key: "ArrowLeft", glyph: "←" },
  { key: "ArrowRight", glyph: "→" },
];

/**
 * Les voyelles sortent plus souvent que le hasard ne le voudrait :
 * la règle unique qui les interdit doit mordre assez pour exister.
 */
const letter = (rng: Rng): string => (rChance(rng, 0.42) ? rPick(rng, VOWELS) : rPick(rng, CONSONANTS));

const others = <T>(all: readonly T[], not: T): T[] => all.filter((x) => x !== not);

const spec = (shape: ShapeId, color: ColorId, size: EntitySpec["size"], moving = false): EntitySpec => ({
  shape,
  color,
  size,
  moving,
});

const randomSpec = (rng: Rng): EntitySpec => spec(rPick(rng, SHAPE_IDS), rPick(rng, COLOR_IDS), rollSize(rng));

const fill = (rng: Rng, n: number, make: () => EntitySpec): EntitySpec[] =>
  Array.from({ length: n }, () => make());

/* ------------------------------------------------------------------ *
 * Les consignes
 *
 * Contrat non négociable : le générateur garantit une cible UNIQUE.
 * Une consigne ambiguë, c'est un joueur convaincu que le jeu triche —
 * et c'est le seul risque fatal du projet. Les tests le vérifient.
 * ------------------------------------------------------------------ */

const clickColor: Instruction = {
  id: "clickColor",
  minLevel: 0,
  weight: 3,
  touch: true,
  gen(rng, level) {
    const n = fillCount(rng, level, 3);
    const target = rPick(rng, COLOR_IDS);
    const pool = others(COLOR_IDS, target);
    const specs = fill(rng, n, () => spec(rPick(rng, SHAPE_IDS), rPick(rng, pool), rollSize(rng)));
    const idx = rInt(rng, n);
    specs[idx]!.color = target;
    return {
      text: `CLIQUE LE ${COLOR_LABEL[target]}`,
      phrase: { cle: "clicCouleur", couleur: target },
      colorWord: target,
      specs,
      want: { kind: "click", idx },
    };
  },
};

const clickShape: Instruction = {
  id: "clickShape",
  minLevel: 0,
  weight: 3,
  touch: true,
  gen(rng, level) {
    const n = fillCount(rng, level, 3);
    const target = rPick(rng, SHAPE_IDS);
    const pool = others(SHAPE_IDS, target);
    const specs = fill(rng, n, () => spec(rPick(rng, pool), rPick(rng, COLOR_IDS), rollSize(rng)));
    const idx = rInt(rng, n);
    specs[idx]!.shape = target;
    return {
      text: `CLIQUE LE ${SHAPE_LABEL[target]}`,
      phrase: { cle: "clicForme", forme: target },
      specs,
      want: { kind: "click", idx },
    };
  },
};

const clickAny: Instruction = {
  id: "clickAny",
  minLevel: 0,
  weight: 1,
  touch: true,
  gen(rng, level) {
    return {
      text: "CLIQUE",
      phrase: { cle: "clic" },
      sousPhrase: "nImporteOu",
      sub: "N'IMPORTE OÙ",
      specs: fill(rng, fillCount(rng, level, 2), () => randomSpec(rng)),
      want: { kind: "clickAny" },
    };
  },
};

const nothing: Instruction = {
  id: "nothing",
  minLevel: 2,
  weight: 2,
  touch: true,
  gen(rng, level) {
    return {
      text: "NE FAIS RIEN",
      phrase: { cle: "rienFaire" },
      specs: fill(rng, fillCount(rng, level, 3), () => randomSpec(rng)),
      want: { kind: "none" },
    };
  },
};

/**
 * Même attente que `nothing`, mais avec un appât : une seule forme, énorme,
 * seule au centre du champ. C'est le meilleur piège à automatisme du jeu.
 * fillCount n'a pas sa place ici : la solitude EST l'énoncé.
 */
const nothingLure: Instruction = {
  id: "nothingLure",
  minLevel: 6,
  weight: 2,
  touch: true,
  gen(rng) {
    return {
      text: "NE CLIQUE PAS",
      phrase: { cle: "nePasCliquer" },
      specs: [spec(rPick(rng, SHAPE_IDS), rPick(rng, COLOR_IDS), "L")],
      want: { kind: "none" },
    };
  },
};

/**
 * LE COLOSSE — quatre formes moyennes dont une tranche. Ajouter des
 * concurrentes de taille moyenne rend la comparaison de taille floue,
 * or c'est toute la consigne. Pas de fillCount.
 */
const extreme: Instruction = {
  id: "extreme",
  minLevel: 2,
  weight: 2,
  touch: true,
  gen(rng) {
    const big = rChance(rng, 0.5);
    const n = 4;
    const specs = fill(rng, n, () => spec(rPick(rng, SHAPE_IDS), rPick(rng, COLOR_IDS), "M"));
    const idx = rInt(rng, n);
    specs[idx]!.size = big ? "L" : "S";
    return {
      text: big ? "CLIQUE LA PLUS GROSSE" : "CLIQUE LA PLUS PETITE",
      phrase: { cle: big ? "clicGrosse" : "clicPetite" },
      specs,
      want: { kind: "click", idx },
    };
  },
};

/** Consignes clavier : specs: [], rien à remplir — pas de fillCount. */
const typeLetter: Instruction = {
  id: "typeLetter",
  minLevel: 3,
  weight: 3,
  touch: false,
  gen(rng) {
    const L = letter(rng);
    return {
      text: `TAPE ${L}`,
      phrase: { cle: "tapeLettre", lettre: L },
      specs: [],
      want: { kind: "key", key: L },
    };
  },
};

const typeShown: Instruction = {
  id: "typeShown",
  minLevel: 6,
  weight: 3,
  touch: false,
  gen(rng) {
    const L = letter(rng);
    return {
      text: "TAPE LA LETTRE AFFICHÉE",
      phrase: { cle: "tapeAffichee" },
      glyph: L,
      specs: [],
      want: { kind: "key", key: L },
    };
  },
};

const arrow: Instruction = {
  id: "arrow",
  minLevel: 9,
  weight: 2,
  touch: false,
  gen(rng) {
    const a = rPick(rng, ARROWS);
    return {
      text: "TAPE",
      phrase: { cle: "tape" },
      glyph: a.glyph,
      specs: [],
      want: { kind: "key", key: a.key },
    };
  },
};

/** Croise deux critères : les leurres partagent la forme OU la couleur, jamais les deux. */
const compound: Instruction = {
  id: "compound",
  minLevel: 5,
  weight: 3,
  touch: true,
  gen(rng, level) {
    const n = fillCount(rng, level, 4);
    const color = rPick(rng, COLOR_IDS);
    const shape = rPick(rng, SHAPE_IDS);
    const specs = fill(rng, n, () =>
      rChance(rng, 0.5)
        ? spec(rPick(rng, others(SHAPE_IDS, shape)), color, rollSize(rng))
        : spec(shape, rPick(rng, others(COLOR_IDS, color)), rollSize(rng)),
    );
    const idx = rInt(rng, n);
    specs[idx] = spec(shape, color, rollSize(rng));
    return {
      text: `CLIQUE LE ${SHAPE_LABEL[shape]} ${COLOR_LABEL[color]}`,
      phrase: { cle: "clicFormeCouleur", forme: shape, couleur: color },
      colorWord: color,
      specs,
      want: { kind: "click", idx },
    };
  },
};

const notColor: Instruction = {
  id: "notColor",
  minLevel: 5,
  weight: 2,
  touch: true,
  gen(rng, level) {
    const n = fillCount(rng, level, 4);
    const color = rPick(rng, COLOR_IDS);
    const specs = fill(rng, n, () => spec(rPick(rng, SHAPE_IDS), color, rollSize(rng)));
    const idx = rInt(rng, n);
    specs[idx]!.color = rPick(rng, others(COLOR_IDS, color));
    return {
      text: `CLIQUE CELUI QUI N'EST PAS ${COLOR_LABEL[color]}`,
      phrase: { cle: "clicPasCouleur", couleur: color },
      colorWord: color,
      specs,
      want: { kind: "click", idx },
    };
  },
};

const notShape: Instruction = {
  id: "notShape",
  minLevel: 11,
  weight: 2,
  touch: true,
  gen(rng, level) {
    const n = fillCount(rng, level, 4);
    const shape = rPick(rng, SHAPE_IDS);
    const specs = fill(rng, n, () => spec(shape, rPick(rng, COLOR_IDS), rollSize(rng)));
    const idx = rInt(rng, n);
    specs[idx]!.shape = rPick(rng, others(SHAPE_IDS, shape));
    return {
      text: `CLIQUE CELUI QUI N'EST PAS UN ${SHAPE_LABEL[shape]}`,
      phrase: { cle: "clicPasForme", forme: shape },
      specs,
      want: { kind: "click", idx },
    };
  },
};

const odd: Instruction = {
  id: "odd",
  minLevel: 7,
  weight: 2,
  touch: true,
  gen(rng, level) {
    const n = fillCount(rng, level, 4);
    const shape = rPick(rng, SHAPE_IDS);
    const color = rPick(rng, COLOR_IDS);
    const specs = fill(rng, n, () => spec(shape, color, "M"));
    const idx = rInt(rng, n);
    if (rChance(rng, 0.5)) specs[idx]!.shape = rPick(rng, others(SHAPE_IDS, shape));
    else specs[idx]!.color = rPick(rng, others(COLOR_IDS, color));
    return {
      text: "CLIQUE L'INTRUS",
      phrase: { cle: "clicIntrus" },
      specs,
      want: { kind: "click", idx },
    };
  },
};

const moving: Instruction = {
  id: "moving",
  minLevel: 9,
  weight: 2,
  touch: true,
  gen(rng, level) {
    const inverse = rChance(rng, 0.4);
    const n = fillCount(rng, level, 4);
    const specs = fill(rng, n, () =>
      spec(rPick(rng, SHAPE_IDS), rPick(rng, COLOR_IDS), "M", inverse),
    );
    const idx = rInt(rng, n);
    specs[idx]!.moving = !inverse;
    return {
      text: inverse ? "CLIQUE CELUI QUI NE BOUGE PAS" : "CLIQUE CELUI QUI BOUGE",
      phrase: { cle: inverse ? "clicImmobile" : "clicMobile" },
      specs,
      want: { kind: "click", idx },
    };
  },
};

/** Positionnelle : la cible n'existe qu'une fois les formes placées. */
const extremeSide: Instruction = {
  id: "extremeSide",
  minLevel: 6,
  weight: 2,
  touch: true,
  gen(rng, level) {
    const left = rChance(rng, 0.5);
    const specs = fill(rng, fillCount(rng, level, 4), () => randomSpec(rng));
    return {
      text: left ? "CLIQUE LE PLUS À GAUCHE" : "CLIQUE LE PLUS À DROITE",
      phrase: { cle: left ? "clicGauche" : "clicDroite" },
      specs,
      want: { kind: "none" }, // remplacé par wantFrom
      wantFrom: (ents: Entity[]) => {
        let best = ents[0]!;
        for (const e of ents) {
          if (left ? e.x < best.x : e.x > best.x) best = e;
        }
        return { kind: "click", idx: best.idx };
      },
    };
  },
};

/**
 * LE JUMEAU — deux formes de la couleur cible, de tailles distinctes.
 * Une troisième de cette couleur rendrait la cible ambiguë. Pas de fillCount.
 */
const smallestOfColor: Instruction = {
  id: "smallestOfColor",
  minLevel: 13,
  weight: 2,
  touch: true,
  gen(rng) {
    const color = rPick(rng, COLOR_IDS);
    const pool = others(COLOR_IDS, color);
    const big = rChance(rng, 0.5);
    // deux de la couleur cible, tailles distinctes ; le reste d'autres couleurs
    const specs: EntitySpec[] = [
      spec(rPick(rng, SHAPE_IDS), color, "S"),
      spec(rPick(rng, SHAPE_IDS), color, "L"),
    ];
    const n = 2 + rInt(rng, 3);
    for (let i = 0; i < n; i++) specs.push(spec(rPick(rng, SHAPE_IDS), rPick(rng, pool), "M"));
    // mélange
    for (let i = specs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [specs[i], specs[j]] = [specs[j]!, specs[i]!];
    }
    const idx = specs.findIndex((s) => s.color === color && s.size === (big ? "L" : "S"));
    return {
      text: big
        ? `CLIQUE LE PLUS GROS ${COLOR_LABEL[color]}`
        : `CLIQUE LE PLUS PETIT ${COLOR_LABEL[color]}`,
      phrase: { cle: big ? "clicPlusGrosCouleur" : "clicPlusPetitCouleur", couleur: color },
      colorWord: color,
      specs,
      want: { kind: "click", idx },
    };
  },
};

/** Traduction couleur → initiale. Force un aller-retour souris → clavier. */
const typeFirstLetter: Instruction = {
  id: "typeFirstLetter",
  minLevel: 12,
  weight: 2,
  touch: false,
  gen(rng) {
    const color = rPick(rng, COLOR_IDS);
    const key = COLOR_LABEL[color][0]!;
    const keyAlt = COLOR_LABEL_EN[color][0]!;
    return {
      text: "TAPE L'INITIALE DE LA COULEUR",
      phrase: { cle: "tapeInitiale" },
      specs: [spec(rPick(rng, SHAPE_IDS), color, "L")],
      // Les deux initiales passent, pour tout le monde : voir `Want.keyAlt`.
      want: { kind: "key", key, keyAlt },
    };
  },
};

/** Deux cibles, dans l'ordre. Première consigne à plusieurs temps. */
const clickTwo: Instruction = {
  id: "clickTwo",
  minLevel: 14,
  weight: 2,
  touch: true,
  gen(rng) {
    const [a, b] = (() => {
      const shuffled = [...COLOR_IDS];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      return shuffled;
    })();
    const rest = COLOR_IDS.filter((c) => c !== a && c !== b);
    const n = 2 + rInt(rng, 3);
    const specs: EntitySpec[] = [
      spec(rPick(rng, SHAPE_IDS), a!, "M"),
      spec(rPick(rng, SHAPE_IDS), b!, "M"),
    ];
    for (let i = 0; i < n; i++) specs.push(spec(rPick(rng, SHAPE_IDS), rPick(rng, rest), "M"));
    for (let i = specs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [specs[i], specs[j]] = [specs[j]!, specs[i]!];
    }
    const ia = specs.findIndex((s) => s.color === a);
    const ib = specs.findIndex((s) => s.color === b);
    return {
      text: `${COLOR_LABEL[a!]} PUIS ${COLOR_LABEL[b!]}`,
      phrase: { cle: "couleurPuis", couleur: a!, couleur2: b! },
      colorWord: a,
      specs,
      want: { kind: "sequence", idxs: [ia, ib] },
    };
  },
};

/** Cliquer n'importe où sauf sur une couleur : le vide devient une réponse valide. */
const avoidColor: Instruction = {
  id: "avoidColor",
  minLevel: 10,
  weight: 2,
  touch: true,
  gen(rng) {
    const color = rPick(rng, COLOR_IDS);
    const n = 4 + rInt(rng, 3);
    const specs = fill(rng, n, () => spec(rPick(rng, SHAPE_IDS), rPick(rng, COLOR_IDS), rollSize(rng)));
    // au moins une forme de la couleur interdite, sinon la consigne est creuse
    specs[rInt(rng, n)]!.color = color;
    return {
      text: `CLIQUE PARTOUT SAUF SUR DU ${COLOR_LABEL[color]}`,
      phrase: { cle: "clicSauf", couleur: color },
      colorWord: color,
      specs,
      want: { kind: "clickAnyExcept", color },
    };
  },
};

export const INSTRUCTIONS: Instruction[] = [
  clickColor,
  clickShape,
  clickAny,
  nothing,
  nothingLure,
  extreme,
  typeLetter,
  typeShown,
  arrow,
  compound,
  notColor,
  notShape,
  odd,
  moving,
  extremeSide,
  smallestOfColor,
  typeFirstLetter,
  clickTwo,
  avoidColor,
];

/** Pool jouable au doigt : tout sauf les consignes clavier. */
export const TOUCH_INSTRUCTIONS: Instruction[] = INSTRUCTIONS.filter((i) => i.touch);

export function pickInstruction(rng: Rng, level: number, pool = INSTRUCTIONS): Instruction {
  const avail = pool.filter((i) => i.minLevel <= level);
  const total = avail.reduce((s, i) => s + i.weight, 0);
  let x = rng() * total;
  for (const i of avail) {
    x -= i.weight;
    if (x <= 0) return i;
  }
  return avail[avail.length - 1]!;
}
