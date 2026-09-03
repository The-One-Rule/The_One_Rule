/**
 * LES CARTES DE RÈGLES.
 *
 * Une règle, une carte. C'est le carnet qui devient une collection : on
 * rencontre une règle en jouant, elle entre au carnet, on va la travailler à
 * l'entraînement, et la carte le montre.
 *
 * Pur et à part pour la même raison que `plate.ts` et `seat.ts` : ce fichier
 * porte une PRIORITÉ — verrouillée, découverte, maîtrisée — et une priorité
 * écrite en `if` successifs au milieu d'une fonction de rendu se lit juste et
 * se comporte faux.
 *
 * ⚠️ L'ILLUSTRATION EST ENGENDRÉE, PAS DESSINÉE.
 *
 * TOR n'a aucune illustration et son identité l'interdit : pas de dégradé, pas
 * d'arrondi hors pièces de jeu, angles droits assumés (décision n°8). Douze
 * dessins de personnages seraient le langage d'un autre jeu — et douze fichiers
 * à produire, à licencier et à charger.
 *
 * Or chaque règle EST déjà une forme du jeu. LE SANG interdit un carré garance,
 * LA ROUE un rond, LES ANGLES quatre coins hachurés — qui sont littéralement
 * déjà dessinés sur le terrain. L'emblème d'une carte est donc une petite
 * scène faite des MÊMES primitives que le jeu : des pièces, des bandes
 * interdites, une lettre. Zéro fichier, zéro licence, impossible d'être
 * hors-marque — et ça dit exactement ce que la règle interdit.
 *
 * Ajouter une règle, c'est donc ajouter quelques lignes de données ici, pas
 * commander une image. `tests/carte.test.ts` refuse qu'une règle du catalogue
 * reste sans emblème.
 */
import type { ColorId, ShapeId } from "../engine/types";
import type { OneRule } from "../engine/types";
import type { RuleRecord } from "../game/progress";

/* ------------------------------------------------------------------ *
 * L'ÉTAT D'UNE CARTE — la priorité
 * ------------------------------------------------------------------ */

export type EtatCarte = "verrouillee" | "decouverte" | "maitrisee";

/**
 * Trois états, et l'ordre compte.
 *
 * `maitrisee` vient d'`estMaitrisee`, qui compte les PIÈGES DÉJOUÉS et pas les
 * manches tenues — c'est le point de conception de tout l'entraînement ciblé,
 * et la carte ne fait que l'afficher.
 */
export function etatCarte(rec: RuleRecord | undefined, maitrisee: boolean): EtatCarte {
  if (!rec) return "verrouillee";
  return maitrisee ? "maitrisee" : "decouverte";
}

/* ------------------------------------------------------------------ *
 * L'EMBLÈME — une petite scène du jeu, pas une illustration
 * ------------------------------------------------------------------ */

/** Une pièce de l'emblème, en coordonnées 0-100 sur les deux axes. */
export interface PieceEmbleme {
  shape: ShapeId;
  color: ColorId;
  x: number;
  y: number;
  /** Rayon, dans le même repère 0-100. */
  r: number;
  /** Barrée d'une croix : c'est CE QUE LA RÈGLE INTERDIT. */
  interdit?: boolean;
  /** Estompée : elle est là pour la comparaison, pas pour elle-même. */
  pale?: boolean;
}

/** Une bande interdite, hachurée comme sur le terrain. */
export interface BandeEmbleme {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Embleme {
  pieces: PieceEmbleme[];
  bandes?: BandeEmbleme[];
  /** Un signe, quand la règle ne porte sur aucune pièce : « A », « ½ », « ⚡ ». */
  signe?: string;
}

const p = (
  shape: ShapeId,
  color: ColorId,
  x: number,
  y: number,
  r: number,
  extra: Partial<PieceEmbleme> = {},
): PieceEmbleme => ({ shape, color, x, y, r, ...extra });

/**
 * Un emblème par règle du catalogue.
 *
 * La grammaire est constante : ce qui est BARRÉ est ce que la règle interdit,
 * ce qui est pâle n'est là que pour donner l'échelle ou la comparaison. Un
 * joueur qui a vu deux cartes sait lire la troisième.
 */
const EMBLEMES: Record<string, Embleme> = {
  /* --- les interdits de couleur --- */
  sang: {
    pieces: [p("carre", "garance", 50, 50, 22, { interdit: true })],
  },
  azur: {
    pieces: [p("carre", "azur", 50, 50, 22, { interdit: true })],
  },

  /* --- les interdits de forme --- */
  pointe: {
    pieces: [p("triangle", "ambre", 50, 52, 24, { interdit: true })],
  },
  roue: {
    pieces: [p("rond", "jade", 50, 50, 22, { interdit: true })],
  },

  /* --- les interdits de rapport : il faut DEUX pièces pour les dire --- */
  colosse: {
    // La grosse pièce reculée à 64 et ramenée à 22 : à 72/25, sa croix allait
    // jusqu'à 105,75 dans un cadre qui s'arrête à 100. Mesuré par le test.
    pieces: [
      p("carre", "azur", 24, 60, 10, { pale: true }),
      p("rond", "ambre", 64, 50, 22, { interdit: true }),
    ],
  },
  solitaire: {
    pieces: [
      p("carre", "azur", 24, 50, 13, { pale: true }),
      p("carre", "azur", 48, 50, 13, { pale: true }),
      p("triangle", "garance", 76, 52, 15, { interdit: true }),
    ],
  },

  /* --- les interdits d'espace : la bande hachurée du terrain --- */
  gaucher: {
    pieces: [p("rond", "jade", 62, 50, 15, { pale: true })],
    bandes: [{ x: 6, y: 14, w: 26, h: 72 }],
  },
  angles: {
    pieces: [p("carre", "ambre", 50, 50, 13, { pale: true })],
    bandes: [
      { x: 6, y: 14, w: 22, h: 26 },
      { x: 72, y: 14, w: 22, h: 26 },
      { x: 6, y: 60, w: 22, h: 26 },
      { x: 72, y: 60, w: 22, h: 26 },
    ],
  },

  /* --- les interdits de clavier et de geste : un signe, pas une pièce --- */
  voyelle: { pieces: [], signe: "A" },
  mainGauche: { pieces: [], signe: "␣" },
  seconde: { pieces: [], signe: "0,4″" },

  /* --- les DÉFORMATIONS : elles n'interdisent rien, elles changent la scène --- */
  eclair: {
    pieces: [p("carre", "ambre", 50, 50, 20, { pale: true })],
    signe: "?",
  },
  menteur: {
    pieces: [
      p("rond", "garance", 34, 50, 15, { pale: true }),
      p("rond", "jade", 66, 50, 15),
    ],
  },
  daltonien: {
    pieces: [p("carre", "jade", 50, 50, 20, { pale: true })],
    signe: "R",
  },
  jumeau: {
    pieces: [p("carre", "azur", 34, 50, 16), p("carre", "azur", 66, 50, 16)],
  },
  acceleration: {
    pieces: [
      p("triangle", "garance", 30, 52, 13, { pale: true }),
      p("triangle", "garance", 54, 52, 15, { pale: true }),
      p("triangle", "garance", 78, 52, 17),
    ],
  },
};

/**
 * L'emblème d'une règle.
 *
 * Une règle sans emblème rendrait une carte vide, ce qui se lit comme un
 * chargement raté plutôt que comme une règle. On retombe donc sur son
 * initiale : lisible, jamais vide, et le test dit tout de suite qu'il en
 * manque un.
 */
export function emblemeDe(rule: OneRule): Embleme {
  return EMBLEMES[rule.id] ?? { pieces: [], signe: rule.name.slice(-1) };
}

/** Exposé pour que le test éprouve la table sans passer par le DOM. */
export const EMBLEMES_REGLES = EMBLEMES;

/* ------------------------------------------------------------------ *
 * LE DESSIN
 *
 * En SVG inline, comme les démos de « COMMENT ÇA MARCHE » : aucun fichier,
 * aucune requête, net à toutes les tailles, et `shape-rendering="crispEdges"`
 * lui donne le grain anguleux du reste. Pas d'emoji — le rendu d'un emoji
 * change d'un système à l'autre, et une pièce qui devient un carré blanc chez
 * un joueur sur trois n'illustre plus rien.
 * ------------------------------------------------------------------ */

/** Les teintes du terrain, reprises telles quelles : la carte montre le JEU. */
const TEINTE: Record<ColorId, string> = {
  garance: "#F74058",
  azur: "#237EF6",
  jade: "#40F7C0",
  ambre: "#F5B214",
};

const forme = (e: PieceEmbleme, fill: string): string => {
  if (e.shape === "rond") return `<circle cx="${e.x}" cy="${e.y}" r="${e.r}" fill="${fill}"/>`;
  if (e.shape === "carre") {
    return `<rect x="${e.x - e.r}" y="${e.y - e.r}" width="${e.r * 2}" height="${e.r * 2}" fill="${fill}"/>`;
  }
  const h = e.r * 1.15;
  return `<path d="M${e.x} ${e.y - h} L${e.x + e.r * 1.1} ${e.y + h * 0.7} L${e.x - e.r * 1.1} ${e.y + h * 0.7} Z" fill="${fill}"/>`;
};

/**
 * L'emblème, en SVG.
 *
 * `verrouille` ne rend PAS une carte vide : il rend la même scène, entièrement
 * couverte par la hachure de censure — celle du carnet et des puces
 * d'entraînement. On voit qu'il y a quelque chose, on ne voit pas quoi. Un
 * emplacement vide se lirait comme un défaut d'affichage ; une barre de
 * censure dit « pas encore ».
 */
export function emblemeSvg(emb: Embleme, opts: { verrouille?: boolean } = {}): string {
  const hachure =
    `<pattern id="cvz" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">` +
    `<rect width="3" height="8" fill="rgba(145,132,217,0.55)"/></pattern>`;

  const corps = opts.verrouille
    ? `<rect x="0" y="0" width="100" height="100" fill="url(#cvz)"/>`
    : [
        ...(emb.bandes ?? []).map(
          (b) =>
            `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#cvz)" opacity="0.5"/>`,
        ),
        ...emb.pieces.map((e) => {
          const f = TEINTE[e.color];
          const corpsPiece = forme(e, f);
          const voile = e.pale ? `<g opacity="0.32">${corpsPiece}</g>` : corpsPiece;
          if (!e.interdit) return voile;
          // La croix dit l'INTERDIT. C'est la même grammaire que la démo du
          // piège : ce qui est barré est ce qu'il ne faut pas toucher.
          const d = e.r * 1.35;
          return (
            voile +
            `<g stroke="#EFEAE0" stroke-width="5" stroke-linecap="square">` +
            `<line x1="${e.x - d}" y1="${e.y - d}" x2="${e.x + d}" y2="${e.y + d}"/>` +
            `<line x1="${e.x + d}" y1="${e.y - d}" x2="${e.x - d}" y2="${e.y + d}"/></g>`
          );
        }),
        emb.signe
          ? `<text x="50" y="50" text-anchor="middle" dominant-baseline="central" ` +
            `font-family="ui-monospace,monospace" font-size="${emb.signe.length > 2 ? 22 : 40}" ` +
            `fill="#EFEAE0">${emb.signe}</text>`
          : "",
      ].join("");

  return (
    `<svg class="carte__svg" viewBox="0 0 100 100" shape-rendering="crispEdges" aria-hidden="true">` +
    `<defs>${hachure}</defs>${corps}</svg>`
  );
}
