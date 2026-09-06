/**
 * LA DÉMO DE L'ACCUEIL — six secondes, muettes, qui montrent le piège.
 *
 * ⚠️ **LE CHIFFRE QUI COMMANDE TOUT.** Sur dix jours, **118 nouveaux visiteurs
 * sur 159 (74 %) repartent sans lancer une seule partie**, médiane 6 secondes,
 * la moitié en moins de 5. Ce n'est pas la difficulté : ils ne jouent jamais.
 * L'onboarding ne peut rien y faire — il ne s'ouvre qu'après un clic sur JOUER,
 * c'est-à-dire après la marche qu'ils ne franchissent pas.
 *
 * Or l'accueil ne montrait AUCUN jeu. Pas une image, pas un mouvement. Un jeu
 * de réflexes se comprend en deux secondes de vidéo et ne se comprend pas du
 * tout en trois lignes de texte.
 *
 * ⚠️ **CE QU'ELLE MONTRE N'EST PAS « LE JEU », C'EST LE PIÈGE.** C'est la seule
 * chose non copiable de TOR, et c'est aussi la plus difficile à deviner : la
 * densité de manches piégeuses du catalogue est de **5,4 %**, donc un joueur
 * peut faire vingt manches sans jamais rencontrer ce qui distingue ce jeu. La
 * boucle joue donc DEUX manches — une ordinaire pour poser la mécanique, une
 * piégée pour la retourner — et s'arrête là.
 *
 * ⚠️ **C'EST UNE AFFICHE, PAS UN TUTORIEL, et la distinction est écrite.** Le
 * dépôt tient que « un tutoriel qui simule le jeu enseigne un jeu qui
 * n'existe pas » — c'est pourquoi `game/onboarding.ts` se joue sur le VRAI
 * terrain, avec de vraies `Round`. Ici on ne peut pas : une manche réelle
 * compte quinze pièces sur un champ de 1000 × 420, et la réduire à une bande de
 * 100 px la rendrait illisible. On montre donc UNE RANGÉE de la grille 5 × 3 —
 * une tranche exacte, pas une invention — et rien de ce qui est montré ne
 * contredit le jeu : mêmes formes, mêmes quatre teintes, même verdict.
 *
 * ⚠️ **AUCUN COÛT PENDANT UNE PARTIE.** La boucle s'arrête dès que l'accueil
 * n'est plus affiché (`arrete()`), et l'accueil est en `display: none` en jeu.
 * Seuls le canvas et son `rAF` existent, jamais quand on joue.
 */

/** Les quatre teintes jouables, reprises de `render/scene.ts` au hexadécimal près. */
const HEX = {
  garance: "#F74058",
  azur: "#237EF6",
  jade: "#40F7C0",
  ambre: "#F5B214",
} as const;

const INK_2 = "#151E2C";
const LINE = "#26344A";
const PAPER = "#EFEAE0";
const PAPER_DIM = "#8494A8";
const SIGNAL = "#9184D9";

type Forme = "carre" | "rond" | "triangle";
type Teinte = keyof typeof HEX;

interface Piece {
  forme: Forme;
  teinte: Teinte;
}

/**
 * UNE RANGÉE de la grille 5 × 3. Cinq pièces, comme dans le jeu.
 *
 * Fixe et non tirée : la démo doit poser exactement deux situations, et un
 * tirage pourrait produire deux manches ordinaires d'affilée — c'est-à-dire
 * rater la seule chose qu'elle existe pour montrer.
 */
const RANGEE: readonly Piece[] = [
  { forme: "triangle", teinte: "ambre" },
  { forme: "rond", teinte: "azur" },
  { forme: "carre", teinte: "garance" },
  { forme: "rond", teinte: "jade" },
  { forme: "carre", teinte: "azur" },
];

/** L'indice de la pièce visée, par temps. */
const CIBLE_OK = 1; // le rond azur
const CIBLE_PIEGE = 2; // le carré garance — interdit par la règle

/**
 * Les temps de la boucle, en millisecondes cumulées.
 *
 * ⚠️ La manche PIÉGÉE dure plus longtemps que l'ordinaire, et c'est le point :
 * ne rien faire prend le temps que le chrono met à s'écouler. Raccourcir la
 * seconde ferait passer l'inaction pour de l'hésitation.
 */
const T = {
  lireA: 900,
  viseA: 1900,
  clicA: 2200,
  verdictA: 3300,
  lireB: 4300,
  hesiteB: 6100,
  verdictB: 7400,
  fin: 8600,
} as const;

export interface TextesDemo {
  /** La règle unique, en bandeau. */
  regle: string;
  /** La consigne de la manche ordinaire. */
  consigneA: string;
  /** La consigne piégeuse — elle demande ce que la règle interdit. */
  consigneB: string;
  /** Le verdict d'une manche tenue. */
  verdictA: string;
  /** Le verdict du piège déjoué. */
  verdictB: string;
}

/** Ce qu'il faut peindre à l'instant `t`. Pur : c'est ce qui rend la boucle testable. */
export interface EtatDemo {
  /** `"a"` = manche ordinaire, `"b"` = manche piégée. */
  manche: "a" | "b";
  /** Fraction de chrono consommée, 0 → 1. */
  ratio: number;
  /** La pièce visée par la consigne. */
  cible: number;
  /** Position du curseur, en fraction de la rangée. `null` = hors champ. */
  curseur: number | null;
  /** Le clic vient-il d'avoir lieu ? */
  clic: boolean;
  /** Le verdict affiché, ou `null`. */
  verdict: "tenu" | "piege" | null;
}

/**
 * L'état de la démo à l'instant `t` (ms depuis le début de la boucle).
 *
 * ⚠️ Pur, et c'est délibéré : c'est la seule partie de la démo qui puisse
 * mentir — un curseur qui clique sur le piège, un verdict qui tombe avant le
 * chrono — et c'est donc la seule qui vaille d'être testée. Le pinceau, lui, ne
 * fait que suivre.
 */
export function etatDemo(t: number): EtatDemo {
  const m = t % T.fin;

  if (m < T.verdictA) {
    // Manche ORDINAIRE : on lit, on vise, on clique, ça passe.
    const ratio = Math.min(1, m / T.clicA);
    const curseur =
      m < T.lireA ? null : Math.min(1, (m - T.lireA) / (T.viseA - T.lireA)) * (CIBLE_OK / 4);
    return {
      manche: "a",
      ratio,
      cible: CIBLE_OK,
      curseur,
      clic: m >= T.clicA - 160 && m < T.clicA + 240,
      verdict: m >= T.clicA ? "tenu" : null,
    };
  }

  // Manche PIÉGÉE : la consigne demande ce que la règle interdit. Le curseur
  // s'approche — c'est le réflexe qu'on montre — puis RECULE, et le chrono
  // s'écoule sans clic.
  const d = m - T.verdictA;
  const ratio = Math.min(1, d / (T.hesiteB - T.verdictA));
  let curseur: number | null = null;
  if (d > T.lireB - T.verdictA) {
    /*
     * ⚠️ BORNÉ À 1, ET C'EST UN BUG TROUVÉ PAR LE TEST.
     *
     * Sans la borne, le temps continue de courir après le renoncement : à la
     * fin du cycle `p` valait 2,39, donc `revient` 3,78, et le curseur
     * descendait à **−2,78** — c'est-à-dire loin hors du cadre, à gauche. Rien
     * ne l'aurait signalé : le pinceau dessine une flèche à une coordonnée
     * négative sans se plaindre, et elle est simplement invisible.
     */
    const p = Math.min(1, (d - (T.lireB - T.verdictA)) / (T.hesiteB - T.lireB));
    // Aller-retour : il s'approche jusqu'à 70 % du chemin, puis renonce.
    const va = Math.min(1, p * 2);
    const revient = Math.max(0, (p - 0.5) * 2);
    curseur = (va - revient) * 0.7 * (CIBLE_PIEGE / 4);
  }
  return {
    manche: "b",
    ratio,
    cible: CIBLE_PIEGE,
    curseur,
    // ⚠️ JAMAIS de clic sur la manche piégée. C'est toute la démonstration :
    // la bonne réponse est de ne rien faire.
    clic: false,
    verdict: d >= T.hesiteB - T.verdictA ? "piege" : null,
  };
}

/* ------------------------------------------------------------------ *
 * Le pinceau
 * ------------------------------------------------------------------ */

function piece(
  g: CanvasRenderingContext2D,
  p: Piece,
  x: number,
  y: number,
  r: number,
  eteinte: boolean,
): void {
  g.globalAlpha = eteinte ? 0.32 : 1;
  g.fillStyle = HEX[p.teinte];
  if (p.forme === "carre") {
    g.fillRect(x - r, y - r, r * 2, r * 2);
  } else if (p.forme === "rond") {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  } else {
    g.beginPath();
    g.moveTo(x, y - r * 1.15);
    g.lineTo(x + r * 1.1, y + r);
    g.lineTo(x - r * 1.1, y + r);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
}

/**
 * Peint une image de la démo.
 *
 * @param w largeur CSS du canvas (le buffer est déjà à l'échelle du DPR)
 */
export function dessineDemo(
  g: CanvasRenderingContext2D,
  e: EtatDemo,
  txt: TextesDemo,
  w: number,
  h: number,
): void {
  g.clearRect(0, 0, w, h);
  g.fillStyle = INK_2;
  g.fillRect(0, 0, w, h);

  const mono = (px: number): string =>
    `600 ${px}px "JetBrains Mono", ui-monospace, monospace`;

  // 1. Le bandeau : la règle unique, comme en jeu, et elle ne bouge jamais.
  g.font = mono(10);
  g.textBaseline = "top";
  g.fillStyle = SIGNAL;
  g.fillText(txt.regle.toUpperCase(), 10, 10);

  // 2. La consigne du moment.
  g.font = mono(12);
  g.fillStyle = PAPER;
  g.fillText((e.manche === "a" ? txt.consigneA : txt.consigneB).toUpperCase(), 10, 26);

  // 3. Le chrono — un filet qui se vide, comme le cadre de temps du jeu.
  const yBarre = 46;
  g.fillStyle = LINE;
  g.fillRect(10, yBarre, w - 20, 2);
  g.fillStyle = e.manche === "b" ? HEX.garance : PAPER_DIM;
  g.fillRect(10, yBarre, (w - 20) * (1 - e.ratio), 2);

  // 4. La rangée : cinq pièces, une tranche exacte de la grille 5 × 3.
  const yPieces = h - 32;
  const pas = (w - 40) / 4;
  const r = Math.min(13, pas / 3.4);
  RANGEE.forEach((p, i) => {
    const x = 20 + i * pas;
    // Sur le piège, la pièce interdite reste PLEINE : la démo ne la barre pas.
    // Le jeu ne prévient jamais, et une démo qui préviendrait montrerait un
    // autre jeu que celui qu'on installe.
    piece(g, p, x, yPieces, r, false);
    if (e.verdict === "tenu" && i === e.cible) {
      g.strokeStyle = HEX.jade;
      g.lineWidth = 2;
      g.strokeRect(x - r - 4, yPieces - r - 4, (r + 4) * 2, (r + 4) * 2);
    }
  });

  // 5. Le curseur.
  if (e.curseur !== null) {
    const x = 20 + e.curseur * (w - 40);
    g.fillStyle = PAPER;
    g.beginPath();
    g.moveTo(x, yPieces - 2);
    g.lineTo(x + 7, yPieces + 12);
    g.lineTo(x + 2.5, yPieces + 12);
    g.lineTo(x, yPieces + 18);
    g.closePath();
    g.fill();
    if (e.clic) {
      g.strokeStyle = PAPER;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, yPieces, 11, 0, Math.PI * 2);
      g.stroke();
    }
  }

  // 6. Le verdict.
  if (e.verdict) {
    g.font = mono(10);
    g.fillStyle = e.verdict === "piege" ? HEX.jade : PAPER_DIM;
    const s = (e.verdict === "piege" ? txt.verdictB : txt.verdictA).toUpperCase();
    g.textAlign = "right";
    g.fillText(s, w - 10, 28);
    g.textAlign = "left";
  }
}

/* ------------------------------------------------------------------ *
 * La boucle
 * ------------------------------------------------------------------ */

/**
 * ⚠️ **LA DÉMO NE POSSÈDE PAS D'HORLOGE — ELLE EN REÇOIT UNE.**
 *
 * Premier essai : un `requestAnimationFrame` à elle. `tests/smoke.test.ts` est
 * tombé, et pour une raison qui vaut bien au-delà du test. Son harnais ne
 * retient QUE la dernière callback enregistrée, pour dérouler la boucle image
 * par image ; la démo écrasait donc celle du jeu, le battement de lecture ne
 * tombait jamais et aucun run ne démarrait. Le symptôme — « le brief ne se
 * ferme pas » — ne désignait rien de ce qui était cassé.
 *
 * Mais le vrai défaut n'est pas dans le harnais : **une application n'a qu'une
 * boucle.** C'est déjà la doctrine du battement de lecture (« porté par la
 * BOUCLE DE JEU, pas par un `setTimeout` ») et pour les mêmes trois raisons —
 * un filet qui déroule des frames voit tout, rien ne court sur un onglet qui ne
 * compose pas, et surtout un décor ne peut pas affamer le jeu. La taille du
 * champ est du gameplay ; ses images aussi.
 */
export interface Demo {
  /** Peint une image. Appelée par la boucle de jeu, uniquement sur l'accueil. */
  image(now: number): void;
  /** Remet la boucle à son début — à l'arrivée sur l'accueil. */
  reprend(): void;
  /** Recompose après un changement de langue. */
  rafraichit(txt: TextesDemo): void;
}

export function creeDemo(cvs: HTMLCanvasElement, txt0: TextesDemo): Demo {
  let textes = txt0;
  let debut = 0;
  let fige = false;
  const g = cvs.getContext("2d");

  /*
   * ⚠️ `prefers-reduced-motion` : on ne coupe pas la démo, on la FIGE sur son
   * image la plus parlante — le piège déjoué. Neutraliser une animation sans
   * rien laisser à sa place est exactement le piège documenté du dépôt
   * (`animation-fill-mode: backwards`, l'élément reste invisible).
   */
  const calme = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  function taille(): { w: number; h: number } {
    const r = cvs.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (cvs.width !== w * dpr || cvs.height !== h * dpr) {
      cvs.width = w * dpr;
      cvs.height = h * dpr;
    }
    g?.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function peint(t: number): void {
    if (!g) return;
    const { w, h } = taille();
    dessineDemo(g, etatDemo(t), textes, w, h);
  }

  return {
    image(now: number): void {
      if (!g) return;
      /*
       * `prefers-reduced-motion` : on ne coupe pas la démo, on la FIGE sur son
       * image la plus parlante — le piège déjoué. Neutraliser une animation
       * sans rien laisser à sa place est le piège documenté du dépôt
       * (`animation-fill-mode: backwards`, l'élément reste invisible).
       */
      if (calme?.matches) {
        if (!fige) {
          fige = true;
          peint(T.hesiteB + 200);
        }
        return;
      }
      if (!debut) debut = now;
      peint(now - debut);
    },
    reprend(): void {
      debut = 0;
      fige = false;
    },
    rafraichit(t: TextesDemo): void {
      textes = t;
      fige = false;
    },
  };
}
