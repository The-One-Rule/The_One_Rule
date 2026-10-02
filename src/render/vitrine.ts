/**
 * LA VITRINE DE L'ARRIVÉE — la maquette 1a, choisie par Pierre.
 *
 * Une démo de 8 s qui montre LE PIÈGE et rien d'autre : sous la règle
 * « JAMAIS DE ROUGE », une main obéit à « CLIQUE LE BLEU » (BIEN), puis
 * s'approche du rouge quand la consigne le demande… et renonce (PIÈGE DÉJOUÉ).
 * Compris sans lire : « on touche ce que dit la consigne. Sauf le rouge. »
 *
 * ⚠️ ELLE REMPLACE LE MODE ATTRACT, qui faisait tourner une vraie Session sous
 * une règle TIRÉE AU SORT : mesuré à 390 × 844, il montrait LA POINTE et une
 * manche sans piège — la seule chose qu'on voulait faire voir n'y était pas —
 * avec la consigne peinte par-dessus les pièces et la dernière ligne mordant
 * sur le cadre. Ici tout est écrit : chaque visiteur voit la même leçon.
 *
 * PURE : une chronologie, rien d'autre. Le dessin vit dans `main.ts`, porté par
 * la boucle de jeu (une application n'a qu'une boucle).
 */

/** La durée d'une boucle complète. */
export const DUREE_VITRINE = 8000;

export type PieceVitrine = "bleu" | "vert" | "rouge";

/** Les trois pièces, en fractions du terrain (0..1). */
export const PIECES_VITRINE: Readonly<Record<PieceVitrine, { x: number; y: number }>> = {
  bleu: { x: 0.22, y: 0.66 },
  vert: { x: 0.5, y: 0.3 },
  rouge: { x: 0.78, y: 0.66 },
};

export interface EtatVitrine {
  /** 1 : la manche qu'on obéit · 2 : la manche piégée. */
  manche: 1 | 2;
  /** La couleur que la consigne nomme. */
  demande: "bleu" | "rouge";
  /** Le doigt, en fractions du terrain. */
  main: { x: number; y: number };
  /** Le doigt est-il posé (appui en cours) ? */
  appui: boolean;
  /** Le retour affiché, ou rien. */
  badge: "bien" | "piege" | null;
  /** Le temps qui reste à la manche, 1 → 0. */
  chrono: number;
  /** La pièce bleue a-t-elle été prise ? */
  bleuPris: boolean;
}

const REPOS = { x: 0.5, y: 0.96 };
const AU_DESSUS_ROUGE = { x: 0.76, y: 0.42 };
const RECUL = { x: 0.52, y: 0.88 };

/** Lissage doux : la main ne file pas en ligne droite à vitesse constante. */
function doux(k: number): number {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
}

function entre(a: { x: number; y: number }, b: { x: number; y: number }, k: number) {
  const d = doux(k);
  return { x: a.x + (b.x - a.x) * d, y: a.y + (b.y - a.y) * d };
}

/** L'état de la vitrine à `ms` millisecondes (bouclé sur `DUREE_VITRINE`). */
export function etatVitrine(ms: number): EtatVitrine {
  const t = ((ms % DUREE_VITRINE) + DUREE_VITRINE) % DUREE_VITRINE;
  const bleu = PIECES_VITRINE.bleu;

  // ── MANCHE 1 : obéir ──────────────────────────────────────────────
  if (t < 2700) {
    const chrono = t < 1700 ? 1 - t / 5000 : 1 - 1700 / 5000;
    if (t < 400) return { manche: 1, demande: "bleu", main: REPOS, appui: false, badge: null, chrono, bleuPris: false };
    if (t < 1500) {
      return { manche: 1, demande: "bleu", main: entre(REPOS, bleu, (t - 400) / 1100), appui: false, badge: null, chrono, bleuPris: false };
    }
    if (t < 1700) return { manche: 1, demande: "bleu", main: bleu, appui: true, badge: null, chrono, bleuPris: false };
    return { manche: 1, demande: "bleu", main: bleu, appui: false, badge: "bien", chrono, bleuPris: true };
  }

  // ── MANCHE 2 : le piège ───────────────────────────────────────────
  // Le temps s'écoule EN ENTIER : c'est en le laissant filer qu'on gagne.
  const FIN = 6200;
  const chrono = t < FIN ? 1 - (t - 2700) / (FIN - 2700) : 0;
  let main: { x: number; y: number };
  if (t < 2900) main = bleu;
  else if (t < 4100) main = entre(bleu, AU_DESSUS_ROUGE, (t - 2900) / 1200);
  else if (t < 4700) {
    // L'hésitation : un petit va-et-vient au-dessus du rouge.
    const h = Math.sin(((t - 4100) / 600) * Math.PI * 3) * 0.015;
    main = { x: AU_DESSUS_ROUGE.x + h, y: AU_DESSUS_ROUGE.y };
  } else main = entre(AU_DESSUS_ROUGE, RECUL, (t - 4700) / 600);
  return {
    manche: 2,
    demande: "rouge",
    main,
    appui: false,
    badge: t >= FIN ? "piege" : null,
    chrono,
    bleuPris: false,
  };
}
