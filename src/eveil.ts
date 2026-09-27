/**
 * L'ÉCRAN RESTE ALLUMÉ — en partie et au salon.
 *
 * Un téléphone posé sur la table pendant qu'on attend les autres au salon
 * s'éteint au bout de trente secondes, et un navigateur en veille coupe sa
 * socket : le joueur sort du salon sans avoir rien touché. En match, c'est
 * une coupure (décision n°4), mais c'est justement la soirée entre amis qui
 * paie. L'API Screen Wake Lock existe sur Chrome Android et Safari iOS ≥ 16.4.
 *
 * Deux pièges de l'API, tous deux couverts ici :
 * - le verrou est RELÂCHÉ par le navigateur dès que l'onglet passe en
 *   arrière-plan, et ne revient pas tout seul : on le redemande au retour ;
 * - `request` REJETTE hors d'un geste ou onglet caché : l'échec est muet,
 *   l'écran s'éteindra comme avant — jamais une erreur pour le joueur.
 */

interface Verrou {
  release(): Promise<void>;
  addEventListener(type: "release", cb: () => void): void;
}

type NavigateurEveil = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<Verrou> };
};

let voulu = false;
let verrou: Verrou | null = null;
let enCours = false;

async function prend(): Promise<void> {
  const nav = (typeof navigator !== "undefined" ? navigator : undefined) as NavigateurEveil | undefined;
  if (!nav?.wakeLock || verrou || enCours) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  enCours = true;
  try {
    const v = await nav.wakeLock.request("screen");
    if (!voulu) {
      void v.release().catch(() => {});
      return;
    }
    verrou = v;
    v.addEventListener("release", () => {
      if (verrou === v) verrou = null;
    });
  } catch {
    /* refusé : l'écran s'éteindra comme avant */
  } finally {
    enCours = false;
  }
}

/** Demande (ou rend) l'écran allumé. Idempotent : appelé à chaque changement d'écran. */
export function gardeEcranAllume(oui: boolean): void {
  voulu = oui;
  if (oui) {
    void prend();
  } else if (verrou) {
    const v = verrou;
    verrou = null;
    void v.release().catch(() => {});
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (voulu && document.visibilityState === "visible") void prend();
  });
}
