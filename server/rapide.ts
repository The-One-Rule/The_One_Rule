/**
 * LA PARTIE RAPIDE — rejoindre sans code, et une table qui ne s'arrête pas.
 *
 * Demandé par Pierre : « pas addictif comme … Bomb Party ». Ce qui fait
 * revenir à Bomb Party n'est pas la mécanique : c'est qu'on est DANS une
 * partie cinq secondes après être arrivé, et qu'une élimination ne renvoie
 * pas au menu — le match suivant part tout seul. TOR demandait un code dicté
 * à l'oral, un hôte qui règle et qui lance, et un hôte qui relance.
 *
 * Deux décisions, PURES ici et testées :
 *
 * 1. **Quand partir.** Pas à l'instant où un deuxième joueur arrive : un
 *    match à deux qui démarre au moment où un troisième allait entrer, c'est
 *    un match à deux de trop. On laisse donc une fenêtre, qui se RACCOURCIT
 *    quand la table se remplit : à six, attendre ne sert plus à rien.
 *    Après un match, une pause fixe : le temps de lire le podium, pas plus.
 *    Une échéance n'est jamais REPOUSSÉE par une arrivée — sinon un flux
 *    d'arrivées tiendrait la table en attente pour toujours.
 * 2. **Où aller.** Une table qui ATTEND d'abord (on y joue au prochain
 *    départ), la plus pleine d'abord (c'est elle qui partira le plus vite et
 *    qui fera le meilleur match). Sinon une table en cours, où l'on regarde
 *    jusqu'au match suivant — le modèle BombParty, déjà servi par `join`.
 *
 * Aucune horloge, aucun salon : le serveur fournit l'instant et la liste.
 */

/** Sous ce nombre de joueurs assis, une table publique ne part pas. */
export const RAPIDE_MIN = 2;
/** À partir de là, attendre d'autres joueurs ne sert plus à rien. */
export const RAPIDE_VITE = 6;
/** Fenêtre laissée aux arrivées, table encore clairsemée. */
export const ATTENTE_SALON_MS = 15_000;
/** Fenêtre quand la table est bien remplie. */
export const ATTENTE_PLEINE_MS = 5_000;
/** Pause entre deux matchs : le podium se lit, puis on repart. */
export const ATTENTE_APRES_MATCH_MS = 12_000;

/**
 * L'échéance de départ, en heure serveur, ou `null` : la table ne partira
 * pas (trop peu de monde).
 *
 * @param echeance l'échéance déjà posée, `null` s'il n'y en a pas
 * @param apresMatch un match vient de se terminer : la pause fixe s'applique
 */
export function echeanceDepart(o: {
  assis: number;
  maintenant: number;
  echeance: number | null;
  apresMatch: boolean;
}): number | null {
  if (o.assis < RAPIDE_MIN) return null;
  if (o.apresMatch) return o.maintenant + ATTENTE_APRES_MATCH_MS;
  const pleine = o.assis >= RAPIDE_VITE;
  const neuve = o.maintenant + (pleine ? ATTENTE_PLEINE_MS : ATTENTE_SALON_MS);
  if (o.echeance === null) return neuve;
  // Jamais repoussée ; seulement rapprochée quand la table se remplit.
  return pleine ? Math.min(o.echeance, neuve) : o.echeance;
}

export interface TablePublique {
  code: string;
  joueurs: number;
  enPartie: boolean;
}

/** Le code de la table à rejoindre, ou `null` : il faut en ouvrir une. */
export function choisitTable(tables: readonly TablePublique[], max: number): string | null {
  const libres = tables.filter((t) => t.joueurs > 0 && t.joueurs < max);
  if (!libres.length) return null;
  const tri = [...libres].sort(
    (a, b) =>
      Number(a.enPartie) - Number(b.enPartie) ||
      b.joueurs - a.joueurs ||
      a.code.localeCompare(b.code),
  );
  return tri[0]!.code;
}
