/**
 * LE TEMPS DE LIRE SA RÈGLE, EN SOLO.
 *
 * Rapporté par Pierre : « un nouveau joueur qui lance un entraînement au hasard
 * ne voit plus sa règle s'afficher et est directement jeté dans la fosse aux
 * lions ».
 *
 * L'écran de brief s'affiche pourtant bien — vérifié. Ce qui manquait est
 * ailleurs, et se mesure : entre le clic sur COMMENCER et l'apparition de la
 * première consigne, il s'écoulait **50 ms**. Le joueur lit le nom de sa règle,
 * clique, et l'instant d'après une consigne lui demande d'agir en moins d'une
 * seconde et demie, sa règle réduite à trois mots dans un bandeau.
 *
 * Le multijoueur avait déjà ce problème et l'a déjà résolu : `COUNTDOWN_MS`
 * vaut 4500 ms, et le commentaire qui l'accompagne dit exactement pourquoi —
 * « c'est le temps de LIRE sa règle ». Le solo n'en avait aucun.
 *
 * ⚠️ **Le temps se déduit du carnet, il ne se règle pas.** Une règle jamais
 * rencontrée demande d'être lue ; une règle qu'on connaît demande seulement
 * qu'on se mette en position. Deux durées, une seule donnée — celle qui existe
 * déjà — et aucun réglage de plus à comprendre pour le joueur.
 *
 * ⚠️ **Ce battement ne touche PAS le run.** La `Session` n'est construite qu'à
 * son terme : le journal, les temps de passage et donc `verifyRun` voient
 * exactement ce qu'ils voyaient avant. C'est aussi pour ça qu'il vit ici et
 * non dans `Session`.
 */
import type { OneRule } from "../engine/types";
import type { Save } from "./progress";

/** Règle inconnue : le temps de la lire pour de bon. */
export const LECTURE_NEUVE_MS = 3000;
/** Règle déjà au carnet : le temps de se mettre en position. */
export const LECTURE_CONNUE_MS = 1200;

/**
 * On juge la règle AFFICHÉE sur le brief, pas la pile entière.
 *
 * En escalade, les règles qui s'ajoutent en cours de run ont déjà leur propre
 * annonce (`regleAjoutee`, qui interrompt le bandeau pour les nommer), et la
 * pile n'est tirée qu'au lancement : la recalculer avant le battement la ferait
 * diverger de celle du run.
 */
export function tempsDeLecture(regle: OneRule, s: Save): number {
  return s.encountered[regle.id] ? LECTURE_CONNUE_MS : LECTURE_NEUVE_MS;
}
