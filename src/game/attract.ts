/**
 * LE MODE ATTRACT — la partie tourne toute seule derrière l'accueil.
 *
 * ⚠️ **LE CHIFFRE QUI L'EXIGE** : 118 nouveaux visiteurs sur 159 (**74 %**)
 * repartent sans lancer une seule partie, médiane 6 secondes. L'accueil ne
 * montrait aucun jeu ; un jeu de réflexes se comprend en deux secondes de vidéo
 * et pas du tout en trois lignes de texte.
 *
 * ⚠️ **CE N'EST PLUS UNE IMITATION, C'EST LE JEU.** La première tentative
 * dessinait une rangée de cinq formes à la main dans une bande de 108 px —
 * rapporté : « la démo est mal faite ». La maquette demande autre chose et elle
 * a raison : « LE CHAMP, PLEIN ÉCRAN : le fond EST le jeu ». On fait donc
 * tourner une vraie `Session`, avec le vrai `buildRound`, dessinée par le vrai
 * `SceneRenderer`. Il n'y a plus rien à tenir d'accord avec le jeu, parce que
 * c'est le jeu.
 *
 * Ce module ne contient QUE la main qui joue. Elle est pure : c'est la seule
 * partie qui puisse mentir — un curseur qui clique un piège montrerait
 * l'inverse exact de ce que le jeu demande — et donc la seule qui vaille d'être
 * testée.
 */
import type { Entity, Round } from "../engine/types";

/** Ce que la main fait à un instant donné. */
export interface Geste {
  /** Où est le curseur, en coordonnées du CHAMP. `null` = hors champ. */
  curseur: { x: number; y: number } | null;
  /** La pièce visée, pour l'anneau de visée. `null` quand il n'y a rien à viser. */
  cible: Entity | null;
  /** Faut-il cliquer MAINTENANT ? Une seule image par manche. */
  clique: boolean;
  /** La main hésite : elle s'est approchée d'un piège et recule. */
  hesite: boolean;
}

/**
 * Quand la main agit, en fraction de la fenêtre.
 *
 * ⚠️ Ni trop tôt ni trop tard, et les deux bornes ont une raison. Trop tôt
 * (< 0,25) la manche défile sans qu'on ait eu le temps de LIRE la consigne, et
 * la démo devient un clignotement. Trop tard, la barre de temps arrive au bout
 * et le spectateur croit voir un joueur en difficulté — or on montre quelqu'un
 * qui maîtrise.
 *
 * ⚠️ **C'EST AUSSI LE RÉGLAGE DE VITESSE DU CURSEUR**, et c'est ce qui l'a fait
 * monter de 0,42 à 0,55. Demandé : « diminue grandement la vitesse de la souris
 * à l'écran ». La main parcourt tout son trajet AVANT d'agir, donc sa vitesse
 * est la distance divisée par cette fraction de fenêtre : la retarder, c'est
 * l'étaler. Il reste 45 % de barre après le clic — largement de quoi lire qu'il
 * était en avance.
 */
const AGIT_A = 0.55;

/**
 * Quand la main renonce, sur une manche piégée.
 *
 * Plus tard que `AGIT_A` : c'est ce qui fait lire l'hésitation. La main part
 * vers la pièce interdite — c'est le réflexe qu'on montre — puis recule, et le
 * chrono s'écoule sans clic. L'écart avec `AGIT_A` est conservé en montant
 * celui-ci : sans quoi le renoncement tomberait presque en même temps que le
 * clic ordinaire et cesserait de se lire comme une hésitation.
 */
const RENONCE_A = 0.78;

/** La pièce que la consigne désigne, ou `null` quand elle n'en désigne aucune. */
export function cibleDe(round: Round): Entity | null {
  const step = round.steps[0];
  if (!step) return null;
  if (step.kind === "click") return round.ents.find((e) => e.idx === step.idx) ?? null;
  if (step.kind === "clickAny") return round.ents[0] ?? null;
  if (step.kind === "clickAnyExcept") {
    return round.ents.find((e) => e.color !== step.color) ?? null;
  }
  // Une consigne CLAVIER n'a pas de cible à l'écran : la main ne bouge pas, et
  // l'anneau de visée ne s'allume pas. Montrer un curseur qui vise dans le vide
  // apprendrait un geste qui n'existe pas.
  return null;
}

/**
 * Ce que la main fait à cet instant de la manche.
 *
 * @param ratio fraction de la fenêtre consommée, 0 → 1
 * @param depuis position d'où le curseur vient (la cible précédente), pour que
 *               le déplacement soit continu d'une manche à l'autre
 */
export function pilote(
  round: Round,
  ratio: number,
  depuis: { x: number; y: number } | null,
): Geste {
  const cible = cibleDe(round);

  /*
   * ⚠️ UNE MANCHE PIÉGÉE : LA MAIN S'APPROCHE, PUIS RENONCE.
   *
   * C'est toute la démonstration, et c'est aussi ce qui distingue ce jeu.
   * `round.steps` est VIDE sur un piège — le moteur n'y attend aucune action —
   * mais `originalWant` garde ce que la consigne demandait. On vise donc la
   * pièce interdite, on s'en approche à 70 %, et on repart.
   *
   * Une main qui ne bougerait pas du tout montrerait quelqu'un qui n'a rien vu,
   * pas quelqu'un qui s'est retenu.
   */
  if (round.trap) {
    const vise = round.ents[0] ?? null;
    const p = Math.min(1, ratio / RENONCE_A);
    // Aller-retour : 0 → 0,7 → 0.
    const va = Math.min(1, p * 2);
    const revient = Math.max(0, (p - 0.5) * 2);
    const t = (va - revient) * 0.7;
    return {
      curseur: vise && depuis ? entre(depuis, vise, t) : (depuis ?? null),
      cible: null,
      clique: false,
      hesite: ratio > RENONCE_A / 2,
    };
  }

  if (!cible) {
    // Consigne clavier : rien à viser, la main attend.
    return { curseur: depuis, cible: null, clique: false, hesite: false };
  }

  const t = Math.min(1, ratio / AGIT_A);
  return {
    curseur: depuis ? entre(depuis, cible, t) : { x: cible.x, y: cible.y },
    cible,
    /*
     * ⚠️ UNE SEULE IMAGE. `clique` est vrai sur la fenêtre où le ratio franchit
     * le seuil ; l'appelant s'en sert une fois et n'y revient pas, sinon la
     * manche recevrait dix clics et le journal serait faux.
     */
    clique: ratio >= AGIT_A,
    hesite: false,
  };
}

/**
 * Interpolation, avec un départ ET un freinage — une main ne part pas net et ne
 * s'arrête pas net.
 *
 * ⚠️ **LE POINTE DE VITESSE VIT ICI, PAS DANS LA DISTANCE.** L'ancienne courbe
 * était un freinage seul (`1 − (1 − t)²`) : sa dérivée vaut **2** à l'origine,
 * donc la main démarrait à deux fois sa vitesse moyenne, et c'est ce départ en
 * fouet qu'on lisait comme « trop rapide ». La courbe en S (`3t² − 2t³`)
 * plafonne à **1,5**, et à l'instant du départ elle vaut zéro.
 *
 * Cumulé avec `AGIT_A` (0,42 → 0,55) et le nombre de manches borné de la démo,
 * la pointe passe d'environ 4,8 fois la distance par fenêtre à 2,7 — et la
 * fenêtre elle-même ne rétrécit plus. Mesuré au pire cas de la démo : ~1830
 * px/s avant, ~620 après.
 */
function entre(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const e = t * t * (3 - 2 * t);
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
}
