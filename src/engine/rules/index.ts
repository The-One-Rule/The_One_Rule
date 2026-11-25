import { MOTIFS } from "../motifs.js";
import { rChance, rInt } from "../rng.js";
import { STEP_MS } from "../difficulty.js";
import { INSTRUCTIONS } from "../instructions/index.js";
import { COLOR_IDS, FIELD_H, FIELD_W } from "../types.js";
import type { ColorId, Entity, OneRule, Want } from "../types.js";
import { VOWELS } from "../instructions/index.js";

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
    case "hold":
      return ents[want.idx] ? [ents[want.idx]!] : [];
    /*
     * GLISSER touche DEUX pièces : celle qu'on prend et celle où l'on pose.
     * Une règle qui interdit l'une ou l'autre fait de la manche un piège —
     * poser le carré sur du rouge, c'est toucher du rouge.
     */
    case "drag":
      return [ents[want.from], ents[want.to]].filter((e): e is Entity => !!e);
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

/**
 * L'ÉCHO — mémoire du coup précédent.
 * Sans couleur précédente, il n'y a aucun piège. Une manche sans clic remet
 * la mémoire à zéro dans les hôtes de partie (solo, serveur et rejeu).
 */
const L_ECHO: OneRule = {
  id: "echo",
  name: "L'ÉCHO",
  brief: "Ne clique jamais la couleur que tu viens de cliquer. Retiens ton dernier coup.",
  traps: true,
  forbids: (want, ents, previousColor) =>
    !!previousColor && targets(want, ents).some((e) => e.color === previousColor),
  judge: (a, ctx) =>
    a.kind === "click" && a.ent && ctx.previousColor !== undefined && a.ent.color === ctx.previousColor
      ? MOTIFS.echo
      : null,
};

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
    a.kind === "click" && a.ent?.color === "garance" ? MOTIFS.rouge : null,
};

/*
 * Le clone assumé de LE SANG, et c'est la mesure qui le demande.
 *
 * Sur les cinq règles piégeantes du catalogue, quatre sont parmi les six plus
 * DURES (médianes 5 à 7) — et ce sont elles qu'on sert en premier aux
 * débutants. La seule facile est LE SANG, à 12, parce que la couleur est le
 * canal perceptif le plus rapide : on VOIT rouge, on ne le cherche pas.
 *
 * Ajouter une seconde interdiction de couleur est donc la façon la plus fiable
 * d'obtenir une règle qui piège ET qui se lit en 200 ms. Sans imagination,
 * exprès.
 */
const L_AZUR: OneRule = {
  id: "azur",
  name: "L'AZUR",
  brief: "Ne clique jamais sur du bleu. Une consigne finira par te le demander.",
  traps: true,
  forbids: (want, ents) => targets(want, ents).some((e) => e.color === "azur"),
  judge: (a) => (a.kind === "click" && a.ent?.color === "azur" ? MOTIFS.bleu : null),
};

const LA_POINTE: OneRule = {
  id: "pointe",
  name: "LA POINTE",
  brief: "Ne clique jamais un triangle, même quand la consigne le désigne.",
  traps: true,
  forbids: (want, ents) => targets(want, ents).some((e) => e.shape === "triangle"),
  judge: (a) =>
    a.kind === "click" && a.ent?.shape === "triangle" ? MOTIFS.triangle : null,
};

/*
 * Le miroir de LA POINTE sur la forme la plus banale.
 *
 * Les formes sont tirées uniformément sur trois, donc un rond sort une fois sur
 * trois là où le triangle se remarque justement parce qu'il est rare. Même
 * mécanique, mais elle mord plus souvent — et c'est voulu : le catalogue
 * manquait de règles piégeantes FACILES, pas de règles astucieuses.
 */
const LA_ROUE: OneRule = {
  id: "roue",
  name: "LA ROUE",
  brief: "Ne clique jamais un rond, même quand la consigne le désigne.",
  traps: true,
  forbids: (want, ents) => targets(want, ents).some((e) => e.shape === "rond"),
  judge: (a) => (a.kind === "click" && a.ent?.shape === "rond" ? MOTIFS.rond : null),
};

const LA_VOYELLE: OneRule = {
  id: "voyelle",
  name: "LA VOYELLE",
  brief: "Ne tape jamais A E I O U Y, même si la consigne l'exige.",
  traps: true,
  forbids: (want) =>
    (want.kind === "key" && VOWELS.includes(want.key)) ||
    false,
  judge: (a) => (a.kind === "key" && VOWELS.includes(a.key) ? MOTIFS.voyelle : null),
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
    return a.ent === uniqueBiggest(ctx.round.ents) ? MOTIFS.plusGrosse : null;
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
  zone: [{ x0: 0, x1: BANNED_X, y0: 0, y1: FIELD_H }],
  forbids: (want, ents) => targets(want, ents).some((e) => e.x < BANNED_X),
  judge: (a) => (a.kind === "click" && a.x < BANNED_X ? MOTIFS.zoneInterdite : null),
};

/**
 * La seule forme de sa couleur à l'écran.
 *
 * Le miroir exact de la consigne « CLIQUE L'INTRUS », qui fabrique justement
 * une pièce unique au milieu d'identiques : le piège y est donc GARANTI, en
 * plus des unicités qui apparaissent naturellement.
 *
 * Elle ouvre un acte perceptif que le catalogue n'avait pas — comparer une
 * pièce au GROUPE — sans le coût de LE COLOSSE, qui demande d'ordonner des
 * tailles. Une couleur seule au milieu d'autres se voit ; une taille se mesure.
 */
const seuleDeSaForme = (e: Entity, ents: Entity[]): boolean =>
  ents.filter((x) => x.shape === e.shape).length === 1;

const LE_SOLITAIRE: OneRule = {
  id: "solitaire",
  name: "LE SOLITAIRE",
  brief: "Ne clique jamais une forme seule de son genre à l'écran. Compte avant d'agir.",
  traps: true,
  forbids: (want, ents) => targets(want, ents).some((e) => seuleDeSaForme(e, ents)),
  judge: (a, ctx) =>
    a.kind === "click" && a.ent && seuleDeSaForme(a.ent, ctx.round.ents)
      ? MOTIFS.solitaire
      : null,
};

/*
 * LES ANGLES — les quatre cellules de coin de la grille 5×3.
 *
 * ⚠️ LA GÉOMÉTRIE N'EST PAS CHOISIE, ELLE EST CONTRAINTE. « Ne clique pas au
 * bord » au sens littéral couvrirait l'anneau extérieur, soit 12 cellules sur
 * 15 — 80 % du terrain. Or le commentaire de `BANNED_X` porte la mesure : à la
 * moitié de l'écran, LE GAUCHER transformait déjà 31 % des manches en « ne
 * rien faire » et le jeu s'éteignait. Les quatre coins font 4 cellules sur 15,
 * soit 27 % des positions — la même bande calibrée que LE GAUCHER.
 *
 * Et c'est la version qui a du sens sur téléphone : les angles sont exactement
 * là où le pouce n'arrive pas bien.
 *
 * Le jugement porte sur la position AU REPOS (`ox`, `oy`), jamais sur la
 * position animée : une forme mobile oscille de ±22 px, ce qui ne lui fait
 * jamais changer de cellule (elles font 200 px), mais juger sur une valeur qui
 * bouge rendrait le verdict dépendant de l'instant du clic. Le serveur
 * reconstruit la même valeur depuis la même graine — c'est la condition pour
 * que l'aperçu ne contredise jamais le verdict.
 */
const CELL_W = FIELD_W / 5;
const CELL_H = FIELD_H / 3;

const dansUnAngle = (e: Entity): boolean =>
  (e.ox < CELL_W || e.ox > FIELD_W - CELL_W) && (e.oy < CELL_H || e.oy > FIELD_H - CELL_H);

const LES_ANGLES: OneRule = {
  id: "angles",
  name: "LES ANGLES",
  brief: "Ne clique jamais dans les quatre coins. Ils sont hachurés.",
  traps: true,
  zone: [
    { x0: 0, x1: CELL_W, y0: 0, y1: CELL_H },
    { x0: FIELD_W - CELL_W, x1: FIELD_W, y0: 0, y1: CELL_H },
    { x0: 0, x1: CELL_W, y0: FIELD_H - CELL_H, y1: FIELD_H },
    { x0: FIELD_W - CELL_W, x1: FIELD_W, y0: FIELD_H - CELL_H, y1: FIELD_H },
  ],
  forbids: (want, ents) => targets(want, ents).some(dansUnAngle),
  judge: (a) => (a.kind === "click" && a.ent && dansUnAngle(a.ent) ? MOTIFS.angle : null),
};

const LA_SECONDE: OneRule = {
  id: "seconde",
  name: "LA SECONDE",
  brief: "N'agis jamais dans les 400 premières millisecondes d'une manche. Attends.",
  traps: false,
  forbids: noForbid,
  judge: (a, ctx) =>
    a.kind !== "release" && ctx.elapsedMs < 400 ? MOTIFS.tropTot : null,
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
  /*
   * Doubler les étapes SANS doubler le temps rendait la règle injouable dès
   * qu'elle tombait sur une séquence : « clique jaune puis bleu » devenait
   * quatre clics dans la fenêtre d'un seul. C'est le cas le plus dur du jeu, et
   * le seul dont le playtest ait nommé la combinaison.
   *
   * Chaque étape ajoutée ouvre donc droit au même supplément que partout
   * ailleurs. La règle reste exigeante — deux fois plus de gestes — sans être
   * une condamnation.
   */
  transform: (round) =>
    round.steps.length === 0
      ? round
      : {
          ...round,
          steps: [...round.steps, ...round.steps],
          durationMs: round.durationMs + round.steps.length * STEP_MS,
        },
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
  judge: (a) => (a.kind === "release" && a.key === " " ? MOTIFS.espace : null),
};

/**
 * La même règle, ou son remplaçant si elle exige une touche maintenue.
 *
 * Une règle à `watchRelease` demande de garder une touche enfoncée toute la
 * partie : sans clavier, elle est injouable — le lancement se refuse — et la
 * lever sans plus la rendrait inerte, donc un avantage gratuit. C'est le même
 * arbitrage que pour les consignes clavier retirées du tirage tactile, et que
 * pour l'exclusion de LA MAIN GAUCHE du pool multijoueur.
 *
 * Le remplaçant est le suivant du catalogue qui n'a pas de contrainte de
 * maintien : déterministe, donc deux appareils tactiles obtiennent la même
 * règle le même jour et leurs scores restent comparables entre eux.
 */
export function withoutHold(rule: OneRule, pool: OneRule[] = ONE_RULES): OneRule {
  if (rule.watchRelease === undefined) return rule;
  const depart = pool.indexOf(rule);
  for (let k = 1; k <= pool.length; k++) {
    const cand = pool[(depart + k) % pool.length]!;
    if (cand.watchRelease === undefined) return cand;
  }
  return rule;
}

/** Une règle qui joue sur la PERCEPTION de la couleur, et non sur son nom. */
export const REGLES_A_ENCRE = ["daltonien"];

/**
 * La même règle, ou son remplaçant en mode daltonien.
 *
 * L'ironie est parfaite : la règle qui pose problème s'appelle LE DALTONIEN.
 * Elle écrit les noms de couleur dans la MAUVAISE couleur — « lis le mot,
 * ignore l'encre ». Tout son intérêt tient au conflit entre ce qu'on lit et ce
 * qu'on voit ; pour qui ne perçoit pas l'encre, il n'y a plus de conflit.
 *
 * Elle ne devient donc pas injouable, elle devient INERTE — et c'est pire.
 * C'est exactement la famille de défauts de `voyelle`, `acceleration` et
 * `gaucher` : une règle qui ne peut pas piéger son porteur est un avantage
 * gratuit et invisible. Le joueur croit porter une contrainte, il n'en porte
 * aucune, et personne dans le salon ne peut le savoir.
 *
 * Même mécanique que `withoutHold`, et pour la même raison de fond : le
 * remplaçant est le suivant du catalogue, donc déterministe — deux joueurs en
 * mode daltonien obtiennent la même règle le même jour, et leurs scores
 * restent comparables entre eux.
 */
export function withoutInk(rule: OneRule, pool: OneRule[] = ONE_RULES): OneRule {
  if (!REGLES_A_ENCRE.includes(rule.id)) return rule;
  const depart = pool.indexOf(rule);
  for (let k = 1; k <= pool.length; k++) {
    const cand = pool[(depart + k) % pool.length]!;
    if (!REGLES_A_ENCRE.includes(cand.id)) return cand;
  }
  return rule;
}

/** Une règle qui ne juge que des LETTRES tapées. */
export const REGLES_A_LETTRES = ["voyelle"];

/**
 * La même règle, ou son remplaçant sans clavier.
 *
 * LA VOYELLE interdit de TAPER une voyelle : au doigt, le tirage ne sort
 * aucune consigne clavier, donc elle ne peut jamais piéger — elle est INERTE,
 * un avantage gratuit (décision n°1). Le parcours l'excluait déjà ; le run du
 * jour et l'entraînement la servaient telle quelle au téléphone. Même
 * mécanique que `withoutHold` et `withoutInk` : le suivant du catalogue,
 * déterministe, pour que deux téléphones aient la même règle le même jour.
 */
export function withoutLetters(rule: OneRule, pool: OneRule[] = ONE_RULES): OneRule {
  if (!REGLES_A_LETTRES.includes(rule.id)) return rule;
  const depart = pool.indexOf(rule);
  for (let k = 1; k <= pool.length; k++) {
    const cand = pool[(depart + k) % pool.length]!;
    if (!REGLES_A_LETTRES.includes(cand.id) && cand.watchRelease === undefined) return cand;
  }
  return rule;
}

export const ONE_RULES: OneRule[] = [
  LE_SANG,
  L_AZUR,
  LA_POINTE,
  LA_ROUE,
  LE_SOLITAIRE,
  LES_ANGLES,
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
  L_ECHO,
];

export const ruleById = (id: string): OneRule | undefined => ONE_RULES.find((r) => r.id === id);
