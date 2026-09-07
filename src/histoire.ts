/**
 * L'HISTOIRE DE NAVIGATION — la seule chose qui sache d'où l'on vient.
 *
 * `route.ts` dit quelle adresse porte quel écran ; ce module-ci la POSE dans la
 * barre du navigateur et compte les pas. Il est séparé pour une raison précise :
 * `main.ts` et `multi.ts` en ont besoin tous les deux, et le compteur doit être
 * le MÊME des deux côtés — un compteur par module se désynchroniserait au
 * premier écran multijoueur ouvert.
 *
 * ⚠️ **LE COMPTEUR N'EST PAS UN CONFORT, IL EMPÊCHE DE SORTIR DU SITE.**
 *
 * `history.back()` ne sait pas s'il reste quelque chose à nous. Quelqu'un qui
 * ouvre directement `theonerule.party/multi` — un lien partagé, un favori —
 * arrive avec UNE seule entrée : notre bouton RETOUR le renverrait alors sur la
 * page qu'il visitait avant le jeu, ou sur une page blanche. On ne remonte donc
 * que ce qu'on a soi-même empilé, et on retombe sur l'accueil au-delà.
 */
import { cheminDe } from "./route";
import type { EcranId } from "./route";

/**
 * Combien de pas NOUS avons empilés depuis l'arrivée.
 *
 * Jamais négatif : c'est ce qui rend `peutRevenir` sûr même si un `popstate`
 * arrive sans qu'on l'ait provoqué — un geste de balayage, une entrée posée
 * par le navigateur lui-même.
 */
let pas = 0;

/** Vrai pendant qu'on répond au bouton PRÉCÉDENT : on n'empile pas alors. */
let enRetour = false;

/**
 * Pose l'adresse d'un écran, en empilant une entrée.
 *
 * ⚠️ Ne touche JAMAIS au fragment : il porte les invitations (`#j=`) et les
 * défis (`#d=`), et les écraser casserait un lien en cours de lecture.
 */
export function poseAdresse(ecran: EcranId): void {
  if (enRetour) return;
  const chemin = cheminDe(ecran);
  if (location.pathname === chemin) return;
  try {
    history.pushState({ ecran }, "", chemin + location.hash);
    pas++;
  } catch {
    /* environnement sans history : le jeu marche, l'adresse ne suit pas */
  }
}

/** Fixe l'adresse d'arrivée SANS empiler — la première entrée est celle-ci. */
export function poseArrivee(ecran: EcranId): void {
  try {
    history.replaceState({ ecran }, "", cheminDe(ecran) + location.hash);
  } catch {
    /* environnement sans history */
  }
}

/** Reste-t-il un écran À NOUS derrière celui-ci ? */
export const peutRevenir = (): boolean => pas > 0;

/**
 * Revient d'un cran, ou exécute le secours quand il n'y a rien derrière.
 *
 * C'est ce que doit appeler tout bouton RETOUR. Le secours n'est pas une
 * destination devinée : c'est le repli de l'écran, et il ne sert que dans le
 * cas — réel — d'une arrivée directe sur cette adresse.
 */
export function retour(secours: () => void): void {
  if (peutRevenir()) {
    history.back();
    return;
  }
  secours();
}

/** À appeler autour du traitement d'un `popstate`. */
export function pendantRetour<T>(fn: () => T): T {
  enRetour = true;
  pas = Math.max(0, pas - 1);
  try {
    return fn();
  } finally {
    enRetour = false;
  }
}
