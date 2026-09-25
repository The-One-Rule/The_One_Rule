/**
 * L'ESCALIER D'UNE RÈGLE — vingt paliers, quatre volées, une seule montée.
 *
 * ⚠️ **SON ÉCRAN A DISPARU.** Le PARCOURS (`game/parcours.ts`) l'a remplacé
 * comme porte d'entrée, et l'écran `#escalier` n'avait plus aucune porte : il
 * a été supprimé. Ce module reste pour deux raisons, et pour elles seules :
 *
 *   · ses LEVIERS — `Palier`, `Annonce`, `piegeIci`, `annonceIci` — sont ceux
 *     que joue chaque niveau du parcours (`palierDeNiveau`) ;
 *   · l'état `escalier` du carnet est une donnée HÉRITÉE : on ne l'écrit plus,
 *     mais un joueur qui avait atteint le palier 15 garde sa maîtrise
 *     (`estMaitrisee`), et sa fusion doit rester une loi valide tant que des
 *     sauvegardes le portent.
 *
 * Demandé par Pierre : « tu cliques sur la carte et tu arrives sur une autre
 * page avec des escaliers qui représentent chaque palier jusqu'à la maîtrise …
 * au début c'est soft et ça augmente progressivement en introduisant les
 * pièges … et à la fin du genre 50 en rapide pour valider la règle ».
 *
 * ⚠️ CE QUE CE MODULE AJOUTE AU JEU, ET CE QU'IL NE FAIT QUE RÉARRANGER.
 *
 * Il n'invente AUCUNE mécanique. Trois leviers existaient déjà et étaient tous
 * les trois réglés en dur, une fois pour toutes :
 *
 *   · l'ALLURE (`PACE_CHOICES`) — un réglage global, choisi une fois dans les
 *     options et jamais revu ;
 *   · la CADENCE DE PIÈGES (`FORCED_TRAP_ROUNDS`, les manches 2, 5 et 9) — une
 *     constante, la même pour tout le monde et pour toujours ;
 *   · la LONGUEUR (`DAILY_LENGTH` d'un côté, l'infini de l'entraînement de
 *     l'autre) — deux valeurs, aucun entre-deux.
 *
 * L'escalier les rend PROGRESSIFS. C'est tout, et c'est déjà ce qui manquait :
 * l'entraînement libre est un bac à sable sans but, on y meurt à la même
 * difficulté à la première partie et à la centième.
 *
 * Le quatrième levier, lui, est neuf : l'ANNONCE du piège (§ `Annonce`). C'est
 * le seul, il est confiné à ce mode, et sa justification est écrite là-bas.
 *
 * ⚠️ POURQUOI CE FICHIER EST PUR, ET SANS AUCUN TEXTE.
 *
 * Il ne rend que des identifiants et des nombres. La table ci-dessous est la
 * SEULE vérité.
 */
import { PACE_CHOICES } from "../engine/difficulty";
import { fusionneEscalier } from "../../shared/compte";
import type { EscalierEntree } from "../../shared/compte";

/*
 * L'ÉTAT VIT DANS `shared/compte.ts`, PAS ICI — et ce n'est pas un caprice de
 * rangement. Sa loi de FUSION doit être écrite une seule fois, du côté que les
 * deux bouts partagent : `api/moi.ts` fusionne deux appareils, le jeu fusionne
 * une revendication, et deux copies de cette loi divergeraient en silence. On
 * la réexporte ici pour que le jeu n'ait qu'un seul import à connaître.
 */
export type EtatEscalier = EscalierEntree;
export { fusionneEscalier };

/* ------------------------------------------------------------------ *
 * Les volées
 * ------------------------------------------------------------------ */

/** Une volée : cinq paliers qui partagent une allure et une intention. */
export type VoleeId = "decouverte" | "apprentissage" | "controle" | "perfection";

export interface Volee {
  n: number;
  id: VoleeId;
  /** L'allure de tous ses paliers — reprise de `PACE_CHOICES`, jamais inventée. */
  allure: number;
}

/**
 * Quatre volées, quatre allures, dans l'ordre exact de `PACE_CHOICES`.
 *
 * ⚠️ Les allures ne sont PAS écrites ici mais lues : `PACE_CHOICES` est déjà la
 * liste des quatre allures du jeu, et en réécrire les valeurs donnerait deux
 * tables à tenir d'accord. Le jour où une cinquième allure arrive, ce fichier
 * cesse de compiler — ce qui est exactement ce qu'on veut, plutôt qu'un
 * escalier qui ignore en silence la nouveauté.
 */
export const VOLEES: readonly Volee[] = [
  { n: 1, id: "decouverte", allure: PACE_CHOICES[0] },
  { n: 2, id: "apprentissage", allure: PACE_CHOICES[1] },
  { n: 3, id: "controle", allure: PACE_CHOICES[2] },
  { n: 4, id: "perfection", allure: PACE_CHOICES[3] },
] as const;

/* ------------------------------------------------------------------ *
 * L'annonce du piège — le seul levier neuf, et le seul qui touche à une
 * décision du dépôt
 * ------------------------------------------------------------------ */

/**
 * Comment un piège se signale, sur ce palier.
 *
 * ⚠️ **CECI CROISE LA DÉCISION N°5 — « le piège n'est révélé qu'après la mort,
 * jamais pendant » — ET C'EST DÉLIBÉRÉ.** Dit une fois, avec sa raison :
 *
 * La décision n°5 protège l'ÉPREUVE. Reconnaître le conflit entre la consigne
 * et sa règle unique EST le jeu ; le signaler pendant la manche le remplace par
 * une épreuve de lecture. Elle vaut donc partout où un score se compare — run
 * du jour, multijoueur, classé, entraînement libre — et elle n'est levée sur
 * aucun d'eux.
 *
 * L'escalier n'est pas une épreuve, c'est un APPRENTISSAGE, et la mesure dit
 * qu'il en manque un : la densité de manches piégeuses du catalogue est de
 * **5,4 %**, donc un joueur peut faire vingt manches sans jamais rencontrer ce
 * qui distingue TOR ; et sur 572 runs les morts sur le piège sont tombées à
 * **4,1 %** quand le catalogue d'entraînement s'est ouvert. Le piège est le
 * seul élément non copiable du jeu, et c'est celui qu'on enseigne le moins.
 *
 * On montre donc le piège aux paliers 6 à 9, on le montre une fois sur deux au
 * 10, et on ne le montre plus jamais à partir du 11 — la volée 3 s'appelle
 * CONTRÔLE pour ça. L'aide est un échafaudage : elle est retirée AVANT que le
 * palier 15 ne déclare la règle maîtrisée, donc rien de ce qui se compare n'est
 * jamais obtenu avec elle.
 */
export type Annonce = "toujours" | "moitie" | "jamais";

/**
 * Ce palier annonce-t-il le piège de CETTE manche ?
 *
 * ⚠️ Déterministe, jamais tiré au sort. Une aide qui apparaît au hasard une
 * fois sur deux ne s'apprend pas — le joueur ne peut pas distinguer « le jeu
 * ne m'a rien dit » de « il n'y avait rien à dire », ce qui est précisément la
 * confusion que la volée 3 doit installer d'un coup, pas par accident.
 */
export const annonceIci = (a: Annonce, level: number): boolean =>
  a === "toujours" || (a === "moitie" && level % 2 === 0);

/* ------------------------------------------------------------------ *
 * Les vingt paliers
 * ------------------------------------------------------------------ */

export interface Palier {
  /** De 1 à 20. C'est le numéro que le joueur lit. */
  n: number;
  volee: VoleeId;
  /** Manches à tenir pour franchir le palier. */
  manches: number;
  /** Multiplicateur de fenêtre, hérité de la volée. */
  allure: number;
  /**
   * Un piège forcé toutes les N manches. `0` = aucun forçage.
   *
   * ⚠️ C'est un PLANCHER, pas un plafond : la règle continue de piéger
   * naturellement quand une consigne tombe dessus. On garantit un minimum, on
   * ne bride rien — brider demanderait de refuser des consignes, donc de
   * changer les scènes, donc de rendre le palier incomparable au jeu réel.
   *
   * ⚠️ Sans effet sur une règle qui ne piège pas (sept sur seize). Voir
   * `piegeIci`.
   */
  cadence: number;
  annonce: Annonce;
}

/**
 * LA MONTÉE.
 *
 * Elle se lit de bas en haut, comme un escalier : le palier 1 est la marche du
 * bas. Quatre grandeurs bougent, jamais deux en même temps sans raison —
 * `ajoutDuPalier` s'appuie exactement là-dessus pour dire ce qui change.
 *
 * ⚠️ **LES CHIFFRES VIENNENT DE LA MAQUETTE, PAS DE MOI — SAUF LE TOTAL.** La
 * maquette annonce « TOTAL DE LA MONTÉE · 371 MANCHES » sous une colonne dont
 * les vingt lignes en font 396. Elle se contredit, comme les documents de ce
 * dépôt le font régulièrement (§2). Le total est donc CALCULÉ (`totalManches`)
 * et jamais écrit : il ne peut pas mentir.
 *
 * ⚠️ Le palier 15 est celui que la maquette nomme MAÎTRISÉE et le 20 LE SOMMET.
 * Ces deux noms sont de l'affichage — ils se dérivent du numéro, ils ne sont
 * pas stockés (voir `PALIER_MAITRISE` / `PALIER_SOMMET`).
 */
export const PALIERS: readonly Palier[] = ((): Palier[] => {
  const a = (id: VoleeId): number => VOLEES.find((v) => v.id === id)!.allure;
  const p = (
    n: number,
    volee: VoleeId,
    manches: number,
    cadence: number,
    annonce: Annonce,
  ): Palier => ({ n, volee, manches, allure: a(volee), cadence, annonce });

  return [
    // VOLÉE 1 · DÉCOUVERTE — aucun piège forcé, la fenêtre la plus large du
    // jeu. On apprend la règle, pas le conflit.
    p(1, "decouverte", 5, 0, "toujours"),
    p(2, "decouverte", 6, 0, "toujours"),
    p(3, "decouverte", 8, 0, "toujours"),
    p(4, "decouverte", 10, 0, "toujours"),
    p(5, "decouverte", 12, 0, "toujours"),

    // VOLÉE 2 · APPRENTISSAGE — le piège entre, et il s'annonce. C'est ici
    // qu'on apprend à NE RIEN FAIRE, qui est le geste que le jeu existe pour
    // enseigner et que 5,4 % des manches produisent naturellement.
    p(6, "apprentissage", 12, 6, "toujours"),
    p(7, "apprentissage", 14, 5, "toujours"),
    p(8, "apprentissage", 15, 5, "toujours"),
    p(9, "apprentissage", 16, 4, "toujours"),
    p(10, "apprentissage", 18, 4, "moitie"),

    // VOLÉE 3 · CONTRÔLE — l'échafaudage tombe, et l'allure devient celle du
    // jeu réel. Le palier 15 est la maîtrise : tout ce qui s'y gagne a donc
    // été gagné sans aucune aide.
    p(11, "controle", 15, 5, "jamais"),
    p(12, "controle", 18, 4, "jamais"),
    p(13, "controle", 20, 4, "jamais"),
    p(14, "controle", 22, 3, "jamais"),
    p(15, "controle", 25, 3, "jamais"),

    // VOLÉE 4 · PERFECTION — plus rien de neuf, seulement la durée et la
    // vitesse. Le sommet est ce que Pierre a demandé : « 50 en rapide ».
    p(16, "perfection", 25, 3, "jamais"),
    p(17, "perfection", 30, 3, "jamais"),
    p(18, "perfection", 35, 3, "jamais"),
    p(19, "perfection", 40, 3, "jamais"),
    p(20, "perfection", 50, 3, "jamais"),
  ];
})();

/** Le palier qui déclare la règle maîtrisée — le dernier de la volée CONTRÔLE. */
export const PALIER_MAITRISE = 15;
/** Le dernier palier. Jamais un 20 en dur ailleurs. */
export const PALIER_SOMMET = PALIERS.length;

/** Le palier n° `n`, ou `undefined` hors de la montée. */
export const palierN = (n: number): Palier | undefined => PALIERS[n - 1];

/* ------------------------------------------------------------------ *
 * Où en est le joueur
 * ------------------------------------------------------------------ */

export const ESCALIER_VIERGE: EtatEscalier = { palier: 0, essais: 0, meilleur: 0 };

/** Le palier sur lequel on est. `null` quand la montée est terminée. */
export const palierCourant = (e: EtatEscalier): Palier | undefined =>
  palierN(e.palier + 1);

/** La montée est-elle achevée ? */
export const auSommet = (e: EtatEscalier): boolean => e.palier >= PALIER_SOMMET;

/**
 * Ce qu'un essai laisse derrière lui.
 *
 * ⚠️ **UN PALIER RATÉ SE REJOUE, ON NE REDESCEND JAMAIS.** C'est écrit sur la
 * maquette et c'est la seule règle non négociable de ce mode : une montée dont
 * on peut retomber n'est plus une progression, c'est un score. Ce jeu en a
 * déjà quatre — le run du jour, l'entraînement, l'escalade, le classé — et ce
 * qui lui manque n'est pas un cinquième.
 *
 * @param manches manches tenues pendant l'essai
 */
export function majEscalier(avant: EtatEscalier, manches: number): EtatEscalier {
  const cur = palierCourant(avant);
  if (!cur) return avant; // au sommet : plus rien à gravir
  if (manches >= cur.manches) {
    // Franchi. Le compteur d'essais et le meilleur repartent pour le suivant :
    // ils ne décrivent que le palier courant, et les traîner mentirait.
    return { palier: avant.palier + 1, essais: 0, meilleur: 0 };
  }
  return {
    palier: avant.palier,
    essais: avant.essais + 1,
    meilleur: Math.max(avant.meilleur, manches),
  };
}

/* ------------------------------------------------------------------ *
 * Le palier en jeu
 * ------------------------------------------------------------------ */

/**
 * Faut-il forcer un piège à cette manche ?
 *
 * Remplace `FORCED_TRAP_ROUNDS` pendant un palier, et rien d'autre. La manche 0
 * en est exclue : ouvrir sur un piège apprend « ne rien faire » comme réponse
 * par défaut, ce qui est exactement le contresens.
 */
export const piegeIci = (p: Palier, level: number): boolean =>
  p.cadence > 0 && level > 0 && level % p.cadence === 0;
