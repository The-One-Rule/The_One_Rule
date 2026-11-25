import { rChance, rInt, rPick } from "../rng.js";
import { fillCount, rollSize } from "../scene.js";
import { COLOR_IDS, SHAPE_IDS } from "../types.js";
import type { ColorId, EntitySpec, Entity, Instruction, Rng, ShapeId } from "../types.js";

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

/**
 * LE DOUBLE APPUI — « CLIQUE DEUX FOIS LE ROUGE ».
 *
 * Premier geste NOUVEAU depuis le lancement, et il ne coûte aucune mécanique :
 * c'est une `sequence` qui désigne deux fois la même pièce. Le fil ne
 * transporte que des index, les règles lisent déjà les séquences (`targets`),
 * `resolve` les juge déjà des deux côtés. La famille de bugs du §11 — une
 * règle cassée par le transport — n'a donc aucune prise nouvelle ici.
 *
 * Ce qu'il apporte au jeu : un réflexe de plus à RETENIR. Sous LE SANG,
 * « CLIQUE DEUX FOIS LE ROUGE » est un piège qu'on peut rater à moitié — le
 * premier appui part avant que la tête ait lu « ROUGE ».
 *
 * La cible est unique, par la même construction que `clickColor` et
 * `clickShape` : la couleur (ou la forme) désignée n'existe qu'une fois.
 */
const doubleTap: Instruction = {
  id: "doubleTap",
  minLevel: 4,
  weight: 2,
  touch: true,
  gen(rng, level) {
    const n = fillCount(rng, level, 3);
    const idx = rInt(rng, n);
    if (rChance(rng, 0.5)) {
      const target = rPick(rng, COLOR_IDS);
      const pool = others(COLOR_IDS, target);
      const specs = fill(rng, n, () => spec(rPick(rng, SHAPE_IDS), rPick(rng, pool), rollSize(rng)));
      specs[idx]!.color = target;
      return {
        text: `CLIQUE DEUX FOIS LE ${COLOR_LABEL[target]}`,
        phrase: { cle: "deuxFoisCouleur", couleur: target },
        colorWord: target,
        specs,
        want: { kind: "sequence", idxs: [idx, idx] },
      };
    }
    const target = rPick(rng, SHAPE_IDS);
    const pool = others(SHAPE_IDS, target);
    const specs = fill(rng, n, () => spec(rPick(rng, pool), rPick(rng, COLOR_IDS), rollSize(rng)));
    specs[idx]!.shape = target;
    return {
      text: `CLIQUE DEUX FOIS LE ${SHAPE_LABEL[target]}`,
      phrase: { cle: "deuxFoisForme", forme: target },
      specs,
      want: { kind: "sequence", idxs: [idx, idx] },
    };
  },
};

/**
 * MAINTENIR — « MAINTIENS LE ROUGE ».
 *
 * Un appui qui doit TENIR `HOLD_MS` avant de se lever. C'est le premier geste
 * du jeu qui se juge sur une DURÉE : l'inverse exact du réflexe, et un cousin
 * du piège — le doigt veut partir, il faut le retenir.
 *
 * Cible unique, par la même construction que `doubleTap`.
 */
const tiens: Instruction = {
  id: "tiens",
  minLevel: 4,
  weight: 2,
  touch: true,
  /*
   * ⚠️ PAR LA COULEUR SEULEMENT. Une variante « MAINTIENS LE CARRÉ » désignait
   * une FORME unique à l'écran — exactement ce que LE SOLITAIRE interdit, donc
   * un piège garanti sous cette règle. Mesuré à l'ouverture au solo : LE
   * SOLITAIRE passait de 27,6 % à 31,0 % de manches piégées, le chiffre que ce
   * dépôt tient pour mortel (le jeu devient « ne rien faire »).
   */
  gen(rng, level) {
    const n = fillCount(rng, level, 3);
    const idx = rInt(rng, n);
    const target = rPick(rng, COLOR_IDS);
    const pool = others(COLOR_IDS, target);
    const specs = fill(rng, n, () => spec(rPick(rng, SHAPE_IDS), rPick(rng, pool), rollSize(rng)));
    specs[idx]!.color = target;
    return {
      text: `MAINTIENS LE ${COLOR_LABEL[target]}`,
      phrase: { cle: "tiensCouleur", couleur: target },
      colorWord: target,
      specs,
      want: { kind: "hold", idx },
    };
  },
};

/**
 * GLISSER — « GLISSE LE ROUGE SUR LE BLEU ».
 *
 * Appuyer sur une pièce, lever sur une autre. Les deux couleurs nommées
 * n'existent qu'une fois chacune : les autres pièces prennent les deux
 * couleurs restantes, donc ni la prise ni la pose ne sont ambiguës.
 */
const glisse: Instruction = {
  id: "glisse",
  minLevel: 6,
  weight: 2,
  touch: true,
  gen(rng, level) {
    const n = Math.max(2, fillCount(rng, level, 3));
    const from = rInt(rng, n);
    const to = (from + 1 + rInt(rng, n - 1)) % n;
    const a = rPick(rng, COLOR_IDS);
    const b = rPick(rng, others(COLOR_IDS, a));
    const pool = COLOR_IDS.filter((c) => c !== a && c !== b);
    const specs = fill(rng, n, () => spec(rPick(rng, SHAPE_IDS), rPick(rng, pool), rollSize(rng)));
    specs[from]!.color = a;
    specs[to]!.color = b;
    return {
      text: `GLISSE LE ${COLOR_LABEL[a]} SUR LE ${COLOR_LABEL[b]}`,
      phrase: { cle: "glisseCouleur", couleur: a, couleur2: b },
      colorWord: a,
      specs,
      want: { kind: "drag", from, to },
    };
  },
};

/** Le double appui du solo, par la couleur seulement — voir `INSTRUCTIONS_SOLO`. */
function doubleTapCouleur(rng: Rng, level: number) {
  const n = fillCount(rng, level, 3);
  const idx = rInt(rng, n);
  const target = rPick(rng, COLOR_IDS);
  const pool = others(COLOR_IDS, target);
  const specs = fill(rng, n, () => spec(rPick(rng, SHAPE_IDS), rPick(rng, pool), rollSize(rng)));
  specs[idx]!.color = target;
  return {
    text: `CLIQUE DEUX FOIS LE ${COLOR_LABEL[target]}`,
    phrase: { cle: "deuxFoisCouleur", couleur: target },
    colorWord: target,
    specs,
    want: { kind: "sequence" as const, idxs: [idx, idx] },
  };
}

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

/**
 * LES CONSIGNES DU MULTIJOUEUR SEULEMENT — pour l'instant.
 *
 * ⚠️ Elles ne sont PAS dans `INSTRUCTIONS`, et c'est une mesure, pas un
 * oubli : `VERSION_CONTENU` se calcule sur `INSTRUCTIONS`, et les records
 * d'entraînement AFFICHÉS sont indexés sur elle (`cleEntrainement`). Les y
 * ajouter ferait lire « TON RECORD · 0 » à chaque joueur au déploiement, et
 * couperait en deux le classement du jour de la mise en ligne. Le salon, lui,
 * ne stocke aucun score.
 *
 * Elles y entreront d'une ligne — en déplaçant l'entrée dans `INSTRUCTIONS` —
 * le jour où ce coût sera décidé.
 *
 * ⚠️ En multi, elles sont NÉGOCIÉES (`CONSIGNES_VERSION`, voir `poolMulti`) :
 * front et salons se déploient séparément, et un serveur qui ne les connaît
 * pas jugerait une autre manche que celle affichée.
 */
export const CONSIGNES_MULTI: Instruction[] = [doubleTap, tiens, glisse];

/**
 * La version de consignes à partir de laquelle chacune sort.
 *
 * ⚠️ Un salon en version 2 doit tirer EXACTEMENT ce qu'il tirait avant
 * MAINTENIR et GLISSER : `poolMulti` filtre sur cette table, et
 * `tests/double-appui.test.ts` compare graine par graine.
 */
export const VERSION_DE_CONSIGNE: Readonly<Record<string, number>> = {
  doubleTap: 2,
  tiens: 3,
  glisse: 3,
};

/**
 * La version du jeu de consignes que CE code sait reconstruire.
 *
 * 1 = le catalogue d'origine ; 2 = plus le double appui ; 3 = plus MAINTENIR
 * et GLISSER (`VERSION_DE_CONSIGNE`) ; 4 = sans « NE FAIS RIEN »
 * (`CONSIGNES_RIEN`), et le serveur peut RETIRER une consigne qui ferait
 * enchaîner deux pièges à un joueur (`draftShared`, paramètre `tirage`). Un client l'annonce
 * dans son `hello`, le serveur retient le minimum de la table et du sien. On
 * ne la DÉCRÉMENTE jamais, et chaque ajout à `CONSIGNES_MULTI` la fait monter.
 *
 * 5 = le pool de RÈGLES gagne LA RANCUNE (`VERSION_RANCUNE`). Ce n'est pas une
 * consigne, mais la négociation est exactement la même : un client qui ne sait
 * pas lire `rancune:rond` ne doit jamais la recevoir. Le pool de consignes de
 * la version 5 est identique à celui de la 4.
 *
 * 6 = le pool de RÈGLES gagne les règles de salon du kanban (`VERSION_SALON`,
 * `rules/salon.ts`) : LE MIROIR, L'INSOUMIS, LA FOULE, LE VOISIN,
 * L'IMMOBILE, L'INCONNUE — et LE GONG si toute la table a le son. Même
 * raisonnement que la 5, et même garantie : les consignes ne bougent pas.
 */
export const CONSIGNES_VERSION = 6;

/**
 * « NE FAIS RIEN » et son appât — RETIRÉES du jeu (directive de Pierre, 01/10).
 *
 * Une manche qui demande de ne rien faire ressemble à un piège sans en être
 * un, et elle pouvait suivre un vrai piège : deux manches d'affilée à ne rien
 * faire, c'est un temps mort, pas une épreuve. Le piège doit rester le SEUL
 * moment où la bonne réponse est l'abstention.
 *
 * ⚠️ Elles restent DANS `INSTRUCTIONS`, et c'est voulu : c'est la base du
 * multi version 1 à 3 (un client d'hier les tire encore, le salon doit les
 * reconstruire pareil) et le réservoir où LE MENTEUR emprunte ses phrases.
 * On les retire au tirage : catalogue solo 3, salons en version 4.
 */
export const CONSIGNES_RIEN: ReadonlySet<string> = new Set(["nothing", "nothingLure"]);

/**
 * LE CATALOGUE DU SOLO — le catalogue d'origine plus les consignes du multi.
 *
 * ⚠️ Le double appui du solo ne désigne que des COULEURS : sa variante
 * « CLIQUE DEUX FOIS LE ROND » vise une forme unique, donc un piège garanti
 * sous LE SOLITAIRE (28,2 % mesuré, au-delà du plafond). Celui des salons
 * garde les deux variantes — il est déjà négocié en version 2, et changer son
 * tirage ferait diverger un client d'hier.
 *
 * Ouvert au solo sur directive de Pierre (« met les nouvelles consignes en
 * déploiement »). ⚠️ `INSTRUCTIONS` NE BOUGE PAS : c'est la base que le multi
 * négocie (`poolMulti`, version 1) et celle où LE MENTEUR emprunte ses phrases
 * — la toucher changerait les manches de tous les salons, y compris ceux d'un
 * client d'hier. Le solo a donc son propre catalogue, et `VERSION_CONTENU` se
 * calcule sur lui : les records d'entraînement repartent d'une clé neuve, coût
 * annoncé et accepté.
 */
export const INSTRUCTIONS_SOLO_V2: Instruction[] = [
  ...INSTRUCTIONS,
  /*
   * ⚠️ AU POIDS 1, pas 2. Ces trois consignes désignent une pièce UNIQUE —
   * donc elles piègent plus souvent qu'une consigne moyenne sous LA POINTE,
   * LA ROUE et LE SOLITAIRE. Mesuré (120 runs × 45 manches) : au poids 2, LE
   * SOLITAIRE montait à 29,1 %, LA POINTE à 28,6 %, au-delà du plafond de
   * 28 % que `tests/engine.test.ts` garde. Le multi garde ses poids : il
   * négocie ses tirages, les changer casserait les salons mixtes.
   */
  ...CONSIGNES_MULTI.map((i) => ({
    ...i,
    // GLISSER touche DEUX pièces : il piège deux fois plus souvent (LA ROUE
    // montait à 28,4 % au poids 1).
    weight: i.id === "glisse" ? 0.5 : 1,
    ...(i.id === "doubleTap" ? { gen: doubleTapCouleur } : {}),
  })),
];

/** Le catalogue solo 2 au doigt — rejeu des runs d'avant le 01/10. */
export const TOUCH_INSTRUCTIONS_SOLO_V2: Instruction[] = INSTRUCTIONS_SOLO_V2.filter((i) => i.touch);

/**
 * LE CATALOGUE DU SOLO, version 3 : le 2 sans « NE FAIS RIEN »
 * (`CONSIGNES_RIEN`), et tiré sans jamais deux pièges d'affilée
 * (`buildRound`, paramètre `apresPiege`).
 *
 * ⚠️ `VERSION_CONTENU` se calcule sur lui : les records d'entraînement
 * affichés repartent d'une clé neuve, et le classement du jour du déploiement
 * se coupe en deux. Coût annoncé à Pierre avec la directive.
 */
export const INSTRUCTIONS_SOLO: Instruction[] = INSTRUCTIONS_SOLO_V2.filter((i) => !CONSIGNES_RIEN.has(i.id));

/** Le catalogue du solo au doigt. */
export const TOUCH_INSTRUCTIONS_SOLO: Instruction[] = INSTRUCTIONS_SOLO.filter((i) => i.touch);

/**
 * Le numéro du catalogue que joue CE code en solo, annoncé dans chaque
 * revendication (`RunClaim.catalogue`) : `verifyRun` rejoue un run sur le
 * catalogue qui l'a produit. 1 (absent) = `INSTRUCTIONS`, 2 =
 * `INSTRUCTIONS_SOLO_V2`, 3 = celui-ci.
 */
export const CATALOGUE_SOLO = 3;

/** Toutes les consignes écrites — pour les tests qui doivent les couvrir toutes. */
export const TOUTES_LES_CONSIGNES: Instruction[] = [...INSTRUCTIONS, ...CONSIGNES_MULTI];

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
