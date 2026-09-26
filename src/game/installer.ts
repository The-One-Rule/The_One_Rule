/**
 * L'INVITATION À INSTALLER — TOR sur l'écran d'accueil du téléphone.
 *
 * Ce que ça rend, et c'est mesurable : installé, le jeu s'ouvre SANS la barre
 * du navigateur — 80 à 100 px de hauteur de plus au téléphone debout, et la
 * hauteur y est du TERRAIN (décision n°10). Et une icône sur l'écran d'accueil
 * est le seul rappel qui ne coûte rien au joueur : D1 était à 8,3 %.
 *
 * TROIS RÈGLES, les mêmes que l'avis (`game/avis.ts`) :
 * - APRÈS TROIS PARTIES, jamais à l'arrivée : on n'installe pas un jeu qu'on
 *   n'a pas encore aimé, et un bandeau d'arrivée a déjà coûté 27 % de
 *   l'accueil (§12) ;
 * - UNE SEULE FOIS, marquée vue dès qu'elle paraît ;
 * - UNE SOLLICITATION PAR ÉCRAN : elle cède au bandeau de mesure et à l'avis.
 *
 * Deux plateformes, deux gestes. Android (Chrome, Edge, Samsung) prête un
 * événement `beforeinstallprompt` : un bouton suffit. iOS n'en a aucun : on ne
 * peut que DIRE le geste (Partager → Sur l'écran d'accueil), et seulement dans
 * Safari — dans le navigateur intégré d'une messagerie, l'option n'existe pas,
 * et la montrer serait mentir.
 */

export type Plateforme = "android" | "ios";

export interface EtatInstall {
  runsAcheves: number;
  dejaVu: boolean;
  /** Déjà lancé depuis l'écran d'accueil (`display-mode: standalone`). */
  installe: boolean;
  /** Une autre sollicitation occupe cet écran de fin. */
  autreDemande: boolean;
  /** Chrome a prêté son invite (`beforeinstallprompt` reçu). */
  inviteAndroid: boolean;
  /** Safari iOS, hors navigateur intégré. */
  safariIos: boolean;
}

export const RUNS_AVANT_INSTALL = 3;

export function installAProposer(e: EtatInstall): Plateforme | null {
  if (e.installe || e.dejaVu || e.autreDemande || e.runsAcheves < RUNS_AVANT_INSTALL) return null;
  if (e.inviteAndroid) return "android";
  if (e.safariIos) return "ios";
  return null;
}

/**
 * Safari iOS, et pas une vue intégrée (Instagram, Messenger, Gmail…) : c'est
 * le seul navigateur d'iPhone qui propose « Sur l'écran d'accueil » depuis
 * son menu de partage de façon fiable.
 */
export function estSafariIos(ua: string, maxTouchPoints: number): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (!ios) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\/|GSA\//.test(ua)) return false;
  return /Safari\//.test(ua);
}
