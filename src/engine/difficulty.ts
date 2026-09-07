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
  if (level < PENTE_CHANGE) return DEBUT_MS - level * PENTE_1;
  return Math.max(PLANCHER_MS, COUDE_MS - (level - PENTE_CHANGE) * PENTE_2);
}

/*
 * ⚠️ **LA COURBE A ÉTÉ REDESCENDUE, SUR DIRECTIVE DE PIERRE.**
 *
 * « Le jeu est trop dur encore une fois … diminue vraiment la vitesse en
 * général et garde des niveaux vraiment durs pour ceux qui veulent
 * s'investir, mais ne mets pas un mur au joueur. Par exemple 4 s par manche
 * puis 3,5, etc., et à la fin 0,7 minimum tout mode confondu. Pour un joueur
 * lambda, 2 s ça doit déjà commencer à être dur. »
 *
 * L'ancienne courbe ouvrait à **1500 ms** et plafonnait à 760. La nouvelle
 * ouvre à **4000** et descend au plancher **700**. Le tableau, aux manches qui
 * comptent :
 *
 *     manche      0     3     6    11    12    20    39    56+
 *     avant    1500  1374  1248  1038   996   924   756    760
 *     après    4000  3460  2920  2020  2020  1780  1210    700
 *
 * ⚠️ **UNE FENÊTRE EST UNE ÉCHÉANCE, PAS UNE DURÉE.** 4000 ms n'allonge pas la
 * manche de celui qui répond en 800 : elle allonge seulement le temps dont il
 * DISPOSE. C'est ce qui permet d'ouvrir aussi large sans rendre le début
 * ennuyeux — et c'est aussi pourquoi les allures de l'entraînement n'ont pas
 * eu à être recomprimées, alors que × 2,0 donne désormais 8 s à la manche 0.
 *
 * ⚠️ **CE QUE ÇA COÛTE, ET IL FAUT LE DIRE UNE FOIS :** `windowMs` est
 * échantillonnée dans `VERSION_CONTENU` (`engine/version.ts`, aux manches
 * 0, 5, 11, 12, 20, 38, 60). La toucher change donc la clé de comparabilité :
 * **tous les records d'entraînement et d'escalade déjà enregistrés deviennent
 * inatteignables sous la nouvelle clé.** Le classement du JOUR, lui, ne perd
 * rien — sa clé porte déjà la date, et tout le monde reçoit le même
 * déploiement le même jour. C'est le prix explicitement accepté : un jeu qu'on
 * ne relance pas n'a pas de records à protéger.
 */
/** La fenêtre de la toute première manche. */
const DEBUT_MS = 4000;
/** Où la pente s'adoucit — et où le joueur lambda commence à sentir la presse. */
const PENTE_CHANGE = 12;
const PENTE_1 = 180;
/** La fenêtre au coude : les 2 s que Pierre désigne comme le début du dur. */
const COUDE_MS = DEBUT_MS - PENTE_CHANGE * PENTE_1;
const PENTE_2 = 30;
/**
 * Le plancher, TOUS MODES CONFONDUS.
 *
 * ⚠️ Il n'est plus seulement le bas de cette courbe : `plancherParGeste`
 * l'applique en dernier, après les déformations de règle et après la tension du
 * duel. « 0,7 minimum tout mode confondu » veut dire qu'aucun chemin du jeu ne
 * peut produire une manche plus courte, et un plancher posé seulement ici
 * laisserait passer le duel (× 0,7 sur 700 donne 490).
 */
export const PLANCHER_MS = 700;

/**
 * Supplément de temps par action SUPPLÉMENTAIRE demandée.
 *
 * La fenêtre ne dépendait que du niveau, jamais du travail demandé : « clique
 * le carré bleu » et « clique jaune puis bleu » avaient exactement la même
 * durée, et LE JUMEAU — qui double toutes les étapes — n'en ajoutait aucune.
 * Une séquence de deux sous LE JUMEAU faisait donc quatre clics dans le temps
 * d'un seul.
 *
 * Mesuré au playtest du 28/08/2026 : le dépassement de temps est devenu la
 * première cause de mort (39,4 %), et le retour est explicite — « clique jaune
 * puis bleu devient déjà très difficile, et pire encore avec LE JUMEAU ». En
 * duel, la tension de 0,7 ramenait la fenêtre au plancher de 700 ms : quatre
 * clics en 700 ms n'est pas difficile, c'est impossible.
 *
 * 280 ms, c'est le geste seul — viser et cliquer une cible déjà identifiée —
 * sans la lecture ni la décision, qui elles n'ont lieu qu'une fois par manche.
 * La première étape n'ouvre donc droit à rien : elle est déjà dans la fenêtre.
 */
export const STEP_MS = 280;

/** La fenêtre d'une manche, pour un niveau et un nombre d'actions donnés. */
export const windowForSteps = (level: number, steps: number): number =>
  windowMs(level) + Math.max(0, steps - 1) * STEP_MS;

/**
 * LE PLANCHER PAR GESTE — le dernier filet, appliqué APRÈS les règles.
 *
 * `windowForSteps` donne une fenêtre juste, puis une règle la déforme, et c'est
 * là que le compte peut cesser d'être tenable. Le cas mesuré est
 * L'ACCÉLÉRATION : elle multiplie la fenêtre ENTIÈRE par 0,7, supplément par
 * geste compris. Or ces 280 ms ne sont pas du confort — c'est le coût
 * irréductible d'un clic de plus. Les raboter de 30 % donne, sur une séquence
 * de deux :
 *
 *     niveau 25 → 811 ms pour 2 gestes → 406 ms par geste
 *     niveau 40 → 728 ms pour 2 gestes → 364 ms par geste
 *
 * contre 520 ms pour toutes les autres règles au même niveau. Rapporté après
 * essai : « la consigne avec deux gestes semble buguer selon les règles, le
 * temps ne suffit pas ». Il ne s'agissait pas d'un bug d'affichage.
 *
 * 420 ms est le seuil, et il n'est pas choisi au doigt : le titre GÂCHETTE du
 * multijoueur mesure une réaction médiane à 412 ms. En dessous, on ne demande
 * plus un réflexe, on demande d'avoir deviné.
 *
 * ⚠️ Il s'applique à la fin, jamais dans une règle : c'est ce qui le rend vrai
 * pour TOUTES les combinaisons, y compris les piles de l'escalade, qui
 * empilent deux déformations dont aucune ne connaît l'autre.
 */
export const MS_MIN_PAR_GESTE = 420;

/**
 * La durée d'une manche ne descend jamais sous ses deux planchers.
 *
 * ⚠️ **DEUX, ET ILS NE DISENT PAS LA MÊME CHOSE.** `PLANCHER_MS` est le sol
 * absolu — « 0,7 s minimum tout mode confondu » — et il vaut même pour une
 * manche à un seul geste. `MS_MIN_PAR_GESTE` est le coût irréductible d'un clic
 * SUPPLÉMENTAIRE : une séquence de trois ne se joue pas dans le temps d'une.
 * Garder le premier seul laisserait une séquence de trois à 700 ms ; garder le
 * second seul laisserait une manche d'un geste tomber à 420 en duel.
 */
export const plancherParGeste = (durationMs: number, steps: number): number =>
  Math.max(durationMs, PLANCHER_MS, steps * MS_MIN_PAR_GESTE);

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
/*
 * ⚠️ UNE QUATRIÈME ALLURE, PLUS LENTE QUE TOUTES LES AUTRES.
 *
 * Demandée par Pierre après playtest : « la différence entre les niveaux est
 * vraiment trop énorme … les nouveaux joueurs galèrent vraiment à comprendre
 * sur leur première run, ils doivent s'y prendre à plusieurs fois ».
 *
 * Mesuré avant d'y toucher. Un débutant fait trois gestes conscients par manche
 * — lire, confronter à sa règle, chercher la cible — soit environ 1100 ms
 * avant que le deuxième ne devienne réflexe. Face à ça :
 *
 *   allure   manche 0   manche 39   passe sous 1100 ms à la manche…
 *   2.0      3000 ms    1520 ms     jamais
 *   1.5      2250 ms    1140 ms     jamais (mais 1140 est la limite)
 *   1.0      1500 ms     760 ms     10  (et 6 dès que la consigne a deux actions)
 *   0.8      1200 ms     608 ms      3  (et 0 à deux actions)
 *
 * DISCOVERY tenait donc à quarante millisecondes près en fin de run, sur une
 * seule action et en supposant la règle déjà automatisée. Ce n'est pas une
 * marge, c'est une coïncidence. 2.0 en est une vraie.
 *
 * On n'a RIEN retiré : chaque allure porte sa propre clé de record
 * (`cleEntrainement`), donc ajouter n'invalide rien, et supprimer RAPIDE
 * effacerait le mode des deux joueurs qui font l'essentiel des entraînements.
 */
export const PACE_CHOICES = [2, 1.5, 1, 0.8] as const;
export const PACE_LABELS: Record<number, string> = {
  2: "PREMIERS PAS",
  1.5: "DÉCOUVERTE",
  1: "NORMAL",
  0.8: "RAPIDE",
};
/** L'allure de référence : la seule qui inscrit un record. */
export const PACE_DEFAULT = 1;

/** Nombre de manches d'un run quotidien. */
export const DAILY_LENGTH = 40;

/**
 * Essais autorisés par jour sur le run du jour.
 *
 * Un seul essai jusqu'ici, et c'était défendable : la rareté fait la valeur.
 * Mais la mesure dit autre chose — le PREMIER run d'un joueur a une médiane de
 * **4 manches**, et la moitié de ces morts sont des dépassements de temps. À un
 * essai par jour, toute la relation d'un nouveau venu au run du jour est donc
 * un échec à quatre manches. Trois essais transforment ça en apprentissage
 * dans la même journée, sans rien changer à ce qui se compare : tout le monde
 * en a trois, et c'est le MEILLEUR qui compte.
 *
 * ⚠️ N'ENTRE PAS DANS `VERSION_CONTENU`, et c'est délibéré. La clé de
 * comparabilité du run du jour porte déjà le JOUR : le classement d'hier garde
 * donc le sien, et celui d'aujourd'hui est uniforme puisque tout le monde
 * reçoit le même déploiement. L'y ajouter invaliderait en prime tous les
 * records d'entraînement et d'escalade, qui partagent cette version et que ce
 * réglage ne concerne pas.
 */
export const DAILY_ESSAIS = 3;

/** Manches d'échauffement pendant lesquelles on ne meurt pas. */
export const GRACE_ROUNDS = 3;

/**
 * L'ÉCHAUFFEMENT PARDONNE-T-IL CETTE MORT ?
 *
 * ⚠️ **NON POUR UNE VIOLATION DE MAINTIEN, ET C'EST UN BUG RAPPORTÉ.** Mot pour
 * mot : « la règle main gauche ne fonctionne pas, on peut très bien lâcher la
 * barre en pleine game et il ne se passera rien ».
 *
 * Le moteur, lui, était juste : mesuré, un relâchement à la manche 4 tue. Le
 * trou était l'échauffement, et il est plus large qu'il n'en a l'air. Un
 * relâchement pendant les trois manches de grâce était pardonné — puis **plus
 * aucun `keyup` ne survenait de tout le run**, puisque la barre était déjà
 * levée. Le joueur terminait donc sa partie entière en violant sa règle unique
 * en continu, sans jamais rien voir. LA MAIN GAUCHE devenait INERTE, ce que la
 * décision n°1 interdit précisément parce que c'est un avantage gratuit et
 * invisible.
 *
 * ⚠️ **CE QUI DISTINGUE CETTE MORT DES AUTRES : elle décrit un ÉTAT, pas un
 * geste.** L'échauffement existe pour qu'un mauvais clic ne coûte rien le temps
 * d'apprendre sa règle — un clic est ponctuel, on le refait mieux au tour
 * suivant. Ne plus tenir la barre, non : ça dure, et le pardonner enseigne que
 * la règle est facultative. C'est la seule règle du catalogue dans ce cas, et
 * c'est `watchRelease` qui la désigne, jamais une liste de noms.
 *
 * ⚠️ **ÉCRIT ICI ET PAS AILLEURS** parce que `Session` et `verify.ts` sont DEUX
 * rejoueurs de la même partie. Une loi écrite deux fois finirait par diverger,
 * et le symptôme serait le seul défaut que ce dépôt tient pour fatal : un
 * aperçu qui contredit le verdict (décision n°3).
 */
export const pardonnable = (
  rule: { watchRelease?: string | undefined },
  action: { kind: string; key?: string },
): boolean =>
  !(
    rule.watchRelease !== undefined &&
    action.kind === "release" &&
    action.key === rule.watchRelease
  );

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
