/**
 * Courbe de difficulté.
 *
 * Recalibrée après mesure : l'ancienne ouverture à 2400 ms laissait le joueur
 * inoccupé pendant les vingt premières secondes (dix manches triviales), et
 * le premier piège n'arrivait qu'à la manche 5 en médiane — manche 20 pour un
 * joueur sur dix. Résultat mesuré en test : on s'ennuie, puis on meurt, puis
 * on recommence par le même tunnel. C'est la cause du départ à deux minutes.
 *
 * Nouvelle forme : on entre vite, on serre tôt, on plafonne au seuil du
 * jouable. 1500 ms laisse largement le temps de lire et cliquer (~700 ms
 * suffisent à un humain), mais plus assez pour flâner.
 */

/**
 * Fenêtre de réaction en ms pour un niveau donné.
 *
 * Deux pentes. La première serre vite (1500 → 1000 en douze manches) pour que
 * la pression s'installe avant que l'attention décroche. La seconde descend
 * lentement jusqu'au plancher du jouable, atteint seulement vers la manche 38 :
 * un premier essai avait mis le plancher à la manche 16, ce qui rendait les
 * vingt manches suivantes strictement identiques — le même ennui, déplacé.
 */
export function windowMs(level: number): number {
  if (level < 12) return 1500 - level * 42;
  return Math.max(760, 996 - (level - 12) * 9);
}

/**
 * Allures de l'ENTRAÎNEMENT — et de lui seul.
 *
 * La courbe ci-dessus suppose un joueur qui a AUTOMATISÉ la vérification de sa
 * règle unique. Un débutant fait encore trois gestes conscients par manche :
 * lire la consigne, la confronter à sa règle, chercher la cible dans quinze
 * formes. Le deuxième coûte 300 à 500 ms tant qu'il n'est pas réflexe — donc à
 * la manche 10, où la fenêtre vaut 1080 ms, il est déjà au bord.
 *
 * On ne peut pas attendre que le geste devienne réflexe si le joueur meurt
 * avant. L'entraînement est l'endroit prévu pour ça, et c'est le seul : le run
 * du jour doit rester identique pour tout le monde, sinon un score ne se
 * compare plus à rien, et les liens de défi déjà partagés ne veulent plus rien
 * dire.
 *
 * Le facteur multiplie la FENÊTRE, jamais le tirage : `place()` consomme le
 * RNG avant que la durée soit posée, donc deux allures produisent exactement
 * les mêmes scènes. Seul le temps disponible change.
 */
export const PACE_CHOICES = [1.5, 1, 0.8] as const;
export const PACE_LABELS: Record<number, string> = {
  1.5: "DÉCOUVERTE",
  1: "NORMAL",
  0.8: "RAPIDE",
};
/** L'allure de référence : la seule qui inscrit un record. */
export const PACE_DEFAULT = 1;

/** Nombre de manches d'un run quotidien. */
export const DAILY_LENGTH = 40;

/** Manches d'échauffement pendant lesquelles on ne meurt pas. */
export const GRACE_ROUNDS = 3;

/**
 * Manches où un piège est FORCÉ si la règle en est capable.
 *
 * Le conflit macro/micro est la seule chose qui distingue ce jeu ; le laisser
 * au hasard revient à cacher son intérêt à une partie des joueurs. On le
 * montre donc tôt, deux fois, pendant l'échauffement où l'erreur ne tue pas :
 * le joueur découvre le piège en le ratant sans être puni.
 *
 * Trois manches et non deux : certaines règles ne peuvent pas être piégées
 * avant que le vocabulaire de consignes ne le permette. LA VOYELLE, par
 * exemple, exige une consigne clavier — or la première n'apparaît qu'à la
 * manche 3. La manche 9 sert de filet pour ces cas.
 */
export const FORCED_TRAP_ROUNDS = new Set([2, 5, 9]);

/** Paliers : tous les 10 niveaux, le jeu annonce qu'il change de régime. */
export const TIER_EVERY = 10;
export const TIER_NAMES = ["ÉCHAUFFEMENT", "PRESSION", "ÉTAU", "ASPHYXIE", "AU-DELÀ"];
export const tierOf = (level: number): number =>
  Math.min(TIER_NAMES.length - 1, Math.floor(level / TIER_EVERY));
export const isTierBoundary = (level: number): boolean =>
  level > 0 && level % TIER_EVERY === 0;
