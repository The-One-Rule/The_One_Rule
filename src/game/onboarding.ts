/**
 * L'ARRIVÉE — trois manches JOUÉES, et le PIÈGE est la colonne vertébrale.
 *
 * ⚠️ IL N'Y A PLUS AUCUN ÉCRAN D'EXPLICATION. Retour du jury Ystart : « un tuto
 * qui se passe en jouant, pas un truc ambigu avant de commencer la partie ».
 * Les quatre écrans qui lisaient la règle, décrivaient les deux cas, félicitaient
 * et annonçaient la carte ont été retirés : tout ce qu'ils disaient se dit
 * maintenant EN UNE LIGNE, sous le terrain, au moment où le joueur en a besoin.
 * Trois temps, tous sur le vrai terrain :
 *
 *   1. OBÉIR — une consigne compatible, chrono large (9 s) ;
 *   2. RÉSISTER — un piège, qu'on gagne en laissant passer le temps ;
 *   3. REPRENDRE — obéir de nouveau, un carré rouge à côté de la cible : on
 *      n'enchaîne jamais deux pièges (directive de Pierre, 01/10).
 *
 * (Le temps 3 enseignait DÉJOUER, la touche F qui concluait un piège tout de
 * suite. Le raccourci est retiré : il remplaçait « ne rien faire » par
 * « appuie sur F », donc la retenue par un réflexe de plus.)
 *
 * Puis la vraie partie démarre, sans repasser par un menu.
 *
 * Rapporté par Pierre après avoir fait tester le jeu à ses camarades : « ils
 * ont adoré mais ils n'ont pas immédiatement compris, j'étais à côté pour leur
 * expliquer ». Plusieurs runs avant de prendre le jeu en main. Tant qu'un
 * humain compense l'onboarding, on ne sait pas si le jeu s'explique.
 *
 * ⚠️ **CE QU'IL FAUT ENSEIGNER EN PREMIER N'EST PAS CE QU'ON CROIT.**
 *
 * Lire la consigne, viser, cliquer : c'est du mobilier de jeu de réflexes,
 * n'importe quel joueur le devine seul. Ce qui ne se devine pas, c'est que
 * *parfois il faut désobéir*. Et un chiffre dit pourquoi ça ne s'apprend pas
 * tout seul : la densité de manches piégeuses du catalogue est de **5,4 %**.
 * Un nouveau venu peut donc faire vingt manches sans jamais rencontrer ce qui
 * distingue TOR d'un jeu de réflexes ordinaire — et repartir en disant « j'en
 * ai déjà joué ».
 *
 * D'où la forme : l'étape 2 pose les deux cas côte à côte, l'étape 5 EST un
 * piège, et l'étape 6 dit « c'est exactement ça, le jeu ». Le piège n'est pas
 * la quatrième leçon, c'est la leçon.
 *
 * ⚠️ **AUCUN CHRONO AVANT L'ÉTAPE 5, ET RALENTI À L'ÉTAPE 5.** La fenêtre de
 * décision du jeu réel fait 760 à 1500 ms. Demander de comprendre une
 * mécanique neuve dans ce temps-là, c'est la raison même pour laquelle il
 * fallait quelqu'un à côté.
 *
 * ⚠️ **CE MODULE NE PASSE PAS PAR `Session`, ET C'EST DÉLIBÉRÉ.** Le tutoriel
 * n'est ni noté, ni journalisé, ni soumis : `verifyRun` ne le verra jamais.
 * Le faire traverser le moteur ferait courir un risque au chemin le plus chaud
 * du jeu pour un écran qu'on ne joue qu'une fois. En revanche il construit de
 * vraies `Round` avec de vraies `Entity`, donc le rendu, la géométrie et le
 * test de clic sont EXACTEMENT ceux de la partie — ce qu'on apprend ici est ce
 * qu'on retrouvera.
 */
import { FIELD_H, FIELD_W, RADIUS } from "../engine/types";
import type { ColorId, Entity, Round, ShapeId, SizeId } from "../engine/types";

/** La règle qu'on enseigne. LE SANG : la couleur est le canal le plus rapide. */
export const REGLE_TUTO = "sang";

/** Trois temps, tous joués sur le vrai terrain. */
export type Temps = 1 | 2 | 3;

export const TEMPS_JOUES: readonly Temps[] = [1, 2, 3];

/**
 * Le chrono du piège : TROIS SECONDES, écrites en dur.
 *
 * Il faut un chrono — c'est en le laissant s'écouler qu'on « survit » à un
 * piège, et c'est précisément le geste qu'on veut faire vivre. Mais à 1500 ms,
 * ne rien faire ressemble à une hésitation ; à 3000, c'est une décision.
 *
 * ⚠️ IL ÉTAIT DÉRIVÉ DE `windowMs(0) * 2`, ET IL A DÉRIVÉ AVEC LUI. Écrit
 * quand la première fenêtre faisait 1500 ms, il a suivi la courbe quand elle
 * est redescendue à 4000 : HUIT secondes à ne rien faire, deux fois de suite,
 * pour un joueur qui découvre le jeu. Mesuré en jouant le tutoriel. Tant que
 * DÉJOUER existait, le second piège s'écourtait d'une touche ; sans lui, le
 * défaut devenait le premier contact avec le jeu. La durée voulue est une
 * durée de LECTURE, pas une fraction de la courbe : elle ne suit plus rien.
 */
export const CHRONO_PIEGE_MS = 3000;

/**
 * Le chrono de la PREMIÈRE manche : neuf secondes (maquette 2.1).
 *
 * Elle était sans chrono. Mais la moitié des morts d'une première partie sont
 * des dépassements de temps : le cadre qui se vide doit être rencontré ICI,
 * sans danger, avec tout le temps de comprendre ce qu'il veut dire.
 */
export const CHRONO_OBEIS_MS = 9000;

const COLS = 5;
const ROWS = 3;
const CELL_W = FIELD_W / COLS;
const CELL_H = FIELD_H / ROWS;

/**
 * Une pièce posée sur une cellule NOMMÉE, jamais tirée au sort.
 *
 * `place()` mélange les cellules avec un RNG : parfait pour une partie, inutile
 * ici. Un tutoriel doit être identique pour tout le monde — sinon un joueur
 * reçoit une leçon lisible et le suivant une leçon encombrée, et on ne saura
 * jamais laquelle on a mesurée.
 */
function piece(
  idx: number,
  col: number,
  ligne: number,
  shape: ShapeId,
  color: ColorId,
  size: SizeId = "M",
): Entity {
  return {
    idx,
    shape,
    color,
    size,
    // Aucune pièce mobile : une cible qui oscille de ±22 px ajoute une
    // difficulté motrice à un moment où l'on enseigne une décision.
    moving: false,
    r: RADIUS[size],
    ox: CELL_W * (col + 0.5),
    oy: CELL_H * (ligne + 0.5),
    x: CELL_W * (col + 0.5),
    y: CELL_H * (ligne + 0.5),
    phase: 0,
  };
}

export interface MancheTuto {
  round: Round;
  /**
   * L'indice de la pièce à cliquer, ou `null` quand la bonne réponse est de
   * NE RIEN FAIRE.
   */
  cible: number | null;
  /**
   * L'indice de la pièce que la règle interdit, quand elle est présente.
   * Sert à donner une correction qui NOMME l'erreur au lieu de dire « raté ».
   */
  interdite: number | null;
}

/**
 * TEMPS 1 — la première action, sous un chrono LARGE (9 s).
 *
 * Trois pièces seulement : la cible, une pièce interdite par la règle, et une
 * neutre. La pièce rouge est là exprès alors qu'on ne la demande pas — elle
 * rend la règle VIVANTE avant de la mettre en conflit, et si le joueur clique
 * dessus on peut lui expliquer sa propre erreur plutôt que de compter un raté.
 *
 * Si le cadre se vide, rien ne tue : la carte « Raté » nomme l'horloge et la
 * manche se rejoue.
 */
export function mancheDecouverte(): MancheTuto {
  const ents = [
    piece(0, 1, 1, "carre", "azur"),
    piece(1, 3, 1, "rond", "garance"),
    piece(2, 2, 0, "triangle", "jade"),
  ];
  return {
    round: {
      instructionId: "tutoCouleur",
      text: "CLIQUE LE BLEU",
      phrase: { cle: "clicCouleur", couleur: "azur" },
      colorWord: "azur",
      ents,
      steps: [{ kind: "click", idx: 0 }],
      trap: false,
      durationMs: CHRONO_OBEIS_MS,
    },
    cible: 0,
    interdite: 1,
  };
}

/**
 * TEMPS 5 — le premier piège. La consigne demande ce que la règle interdit.
 *
 * Quatre pièces, la rouge au CENTRE : c'est la plus tentante, et il faut
 * qu'elle le soit. Un piège qu'on déjoue sans effort n'apprend rien.
 *
 * La bonne réponse est `null` — ne rien faire — et c'est le chrono qui valide,
 * en s'écoulant.
 */
export function manchePiege(): MancheTuto {
  const ents = [
    piece(0, 2, 1, "carre", "garance", "L"),
    piece(1, 0, 1, "rond", "azur"),
    piece(2, 4, 1, "carre", "jade"),
    piece(3, 2, 2, "triangle", "ambre"),
  ];
  return {
    round: {
      instructionId: "tutoPiege",
      text: "CLIQUE LE ROUGE",
      phrase: { cle: "clicCouleur", couleur: "garance" },
      colorWord: "garance",
      ents,
      steps: [{ kind: "click", idx: 0 }],
      // La manche EST un piège : la consigne viole la règle unique.
      trap: true,
      originalWant: { kind: "click", idx: 0 },
      durationMs: CHRONO_PIEGE_MS,
    },
    cible: null,
    interdite: 0,
  };
}

/**
 * Le chrono de la REPRISE : six secondes, entre les neuf de la découverte et
 * les quatre de la première vraie manche — le cadre se resserre déjà.
 */
export const CHRONO_REPRISE_MS = 6000;

/**
 * TEMPS 3 — LA REPRISE : on obéit de nouveau, juste après le piège.
 *
 * ⚠️ C'ÉTAIT UN SECOND PIÈGE, et la directive de Pierre (01/10) l'interdit :
 * « deux consignes ne peuvent jamais demander à la fois de ne rien faire ».
 * Deux pièges d'affilée apprenaient d'ailleurs la mauvaise leçon — qu'après
 * une retenue, on se retient encore. Ici la consigne est légitime et un CARRÉ
 * ROUGE est posé à côté de la cible, de la même forme : le doigt qui vient de
 * se retenir doit agir, et viser juste.
 */
export function mancheReprise(): MancheTuto {
  const ents = [
    piece(0, 1, 2, "carre", "azur"),
    piece(1, 3, 2, "carre", "garance"),
    piece(2, 0, 0, "rond", "jade"),
    piece(3, 4, 0, "triangle", "ambre", "S"),
    piece(4, 2, 1, "rond", "garance", "L"),
  ];
  return {
    round: {
      instructionId: "tutoReprise",
      text: "CLIQUE LE CARRÉ BLEU",
      phrase: { cle: "clicFormeCouleur", forme: "carre", couleur: "azur" },
      colorWord: "azur",
      ents,
      steps: [{ kind: "click", idx: 0 }],
      trap: false,
      durationMs: CHRONO_REPRISE_MS,
    },
    cible: 0,
    interdite: 1,
  };
}

/** La manche d'un temps. */
export function mancheDe(temps: Temps): MancheTuto {
  if (temps === 1) return mancheDecouverte();
  if (temps === 2) return manchePiege();
  return mancheReprise();
}

/** Ce que vaut un clic pendant un temps joué. */
export type Verdict =
  /** La bonne pièce, au bon moment. */
  | "juste"
  /** La pièce que la règle unique interdit — l'erreur qu'on veut nommer. */
  | "interdit"
  /** Une autre pièce, ou le vide. */
  | "ailleurs";

/**
 * Juge un clic. `idx` vaut `null` quand le clic est tombé dans le vide.
 *
 * ⚠️ Au temps 5, la cible est `null` : TOUT clic est une faute, y compris sur
 * la pièce que la consigne désigne. C'est le cœur de la leçon, et c'est
 * pourquoi `interdit` prime sur `ailleurs` — cliquer le rouge en pensant obéir
 * est l'erreur qu'on veut expliquer, pas une maladresse de visée.
 */
export function jugeClic(m: MancheTuto, idx: number | null): Verdict {
  if (idx !== null && idx === m.cible) return "juste";
  if (idx !== null && idx === m.interdite) return "interdit";
  return "ailleurs";
}
