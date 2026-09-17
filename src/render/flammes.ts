/**
 * LES FLAMMES — le plaisir d'aller plus loin, en pixels.
 *
 * Retour du jury Ystart : « rendre le fait d'aller plus loin plus
 * satisfaisant … comme les flammes sur Snap, mais qui entourent l'écran, des
 * flammes violettes, blanches et noires en pixel art, la chaleur des couleurs
 * qui augmente ». Et la maquette de Pierre : le feu naît autour du terrain,
 * puis, plus on avance, il monte jusqu'à passer par-dessus la barre du haut.
 *
 * L'ALGORITHME est celui du feu de DOOM (1993), et ce n'est pas un clin d'œil :
 * c'est le feu pixel le moins cher qui existe. Une grille d'intensités, des
 * sources allumées, et chaque case prend la chaleur de la case du dessous,
 * légèrement déportée, moins un peu. Rien d'autre. À 4 px la case, un écran de
 * 1280 × 800 fait 64 000 cases : une boucle d'entiers, sans allocation.
 *
 * TROIS GARDE-FOUS, dans l'ordre où ils comptent :
 *
 * 1. ⚠️ **LE FEU NE COUVRE JAMAIS CE QU'IL FAUT LIRE.** Le terrain et la
 *    consigne sont des cases INTERDITES, remises à zéro à chaque pas : la
 *    chaleur ne les traverse pas, elle les contourne. Les flammes vivent dans
 *    les marges — ce que la couche `#heat` faisait déjà avec son halo.
 * 2. ⚠️ **IL NE RÉVÈLE RIEN (n°5).** Son ardeur suit l'AVANCÉE de la partie,
 *    jamais la manche en cours : une manche piégée brûle exactement comme une
 *    autre. La rafale d'un piège déjoué n'arrive qu'APRÈS le verdict.
 * 3. Il est pur. Le module ne touche au DOM que par `peins`, qui écrit une
 *    `ImageData` ; la propagation se teste sans canvas.
 */

/** Intensité maximale d'une case. La palette a autant de crans. */
export const FEU_MAX = 36;

/** Taille d'une case, en pixels CSS : le module `--px` de la couche pixel. */
export const CASE = 4;

export interface Grille {
  w: number;
  h: number;
  /** Intensités, rangée par rangée, 0 → FEU_MAX. */
  feu: Uint8Array;
  /** 1 = case interdite (terrain, consigne) : toujours éteinte. */
  interdit: Uint8Array;
}

export function nouvelleGrille(w: number, h: number): Grille {
  const n = Math.max(0, w * h);
  return { w, h, feu: new Uint8Array(n), interdit: new Uint8Array(n) };
}

/** Un rectangle en CASES, bornes incluses-exclues. */
export interface Zone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Pixels CSS → cases, en ÉLARGISSANT : une case à moitié sur le terrain est interdite. */
export function zoneDe(r: { x: number; y: number; w: number; h: number }, marge = 1): Zone {
  return {
    x0: Math.floor(r.x / CASE) - marge,
    y0: Math.floor(r.y / CASE) - marge,
    x1: Math.ceil((r.x + r.w) / CASE) + marge,
    y1: Math.ceil((r.y + r.h) / CASE) + marge,
  };
}

/** Repose le masque : tout est permis, sauf les zones données. */
export function poseInterdits(g: Grille, zones: readonly Zone[]): void {
  g.interdit.fill(0);
  for (const z of zones) {
    const x0 = Math.max(0, z.x0);
    const x1 = Math.min(g.w, z.x1);
    const y0 = Math.max(0, z.y0);
    const y1 = Math.min(g.h, z.y1);
    for (let y = y0; y < y1; y++) g.interdit.fill(1, y * g.w + x0, y * g.w + x1);
  }
}

/**
 * Où le feu prend. Tout est en CASES.
 *
 * `socle` : la rangée d'où monte le feu (le bas de la scène, au-dessus du pied).
 * `plafond` : la rangée la plus haute qu'atteignent les sources latérales.
 * `linteau` : si posé, une rangée de sources au-dessus du terrain — le feu qui
 * passe par-dessus la barre.
 */
export interface Foyers {
  socle: number;
  plafond: number;
  linteau: number | null;
}

/**
 * Les foyers pour une ardeur donnée.
 *
 * 0 → rien. Le feu naît au SOCLE, monte le long des bords à mesure que la
 * partie avance, et au-delà de 0,7 prend aussi au-dessus du terrain : c'est
 * la maquette — « plus on avance, elles prennent même le haut ».
 */
export function foyersPour(ardeur: number, socle: number, hautTerrain: number): Foyers | null {
  if (ardeur <= 0.04) return null;
  const a = Math.min(1, ardeur);
  // Les flammes latérales montent du socle jusqu'au haut du terrain (a = 1).
  const plafond = Math.round(socle - (socle - hautTerrain) * Math.min(1, a / 0.85));
  return { socle, plafond, linteau: a >= 0.7 ? Math.max(0, hautTerrain - 2) : null };
}

/**
 * Un pas de feu.
 *
 * `hasard` rend un entier dans [0, 2^16[ : injecté pour que les tests soient
 * déterministes, et pour ne pas appeler `Math.random` 64 000 fois par image.
 */
export function pasDeFeu(
  g: Grille,
  foyers: Foyers | null,
  ardeur: number,
  hasard: () => number,
): void {
  const { w, h, feu, interdit } = g;
  if (w < 3 || h < 3) return;
  const a = Math.max(0, Math.min(1, ardeur));
  // Plus l'ardeur monte, moins la flamme perd en montant : elle s'allonge.
  const perte = Math.round(5 - 3 * a);

  /*
   * 1. La propagation, de haut en bas : chaque case lit celle du DESSOUS.
   *
   * ⚠️ AVANT les foyers, pas après. Le socle n'est pas la dernière rangée (le
   * pied est dessous) : allumé d'abord, il serait écrasé par la rangée vide du
   * dessous avant d'avoir chauffé quoi que ce soit. Ici la rangée du dessus
   * lit les foyers de l'image PRÉCÉDENTE, puis on les rallume.
   */
  for (let y = 0; y < h - 1; y++) {
    const ligne = y * w;
    const dessous = ligne + w;
    for (let x = 0; x < w; x++) {
      const r = hasard();
      /*
       * Le déport PENCHE VERS LE CENTRE : à gauche on lit la case d'en bas à
       * gauche, à droite celle d'en bas à droite. Sans ce vent, un feu allumé
       * sur les bords montait droit le long de l'écran et se lisait comme une
       * frise, pas comme des flammes qui lèchent la marge.
       */
      const vers = x < w / 2 ? -1 : 1;
      const sx = x + ((r & 3) === 3 ? 0 : vers);
      const src = feu[dessous + (sx < 0 ? 0 : sx >= w ? w - 1 : sx)]!;
      const v = src - (((r >> 2) & 7) % (perte + 1));
      feu[ligne + x] = v > 0 ? v : 0;
    }
  }
  feu.fill(0, (h - 1) * w);

  /*
   * 2. Les foyers.
   *
   * ⚠️ INTERMITTENTS. Premier essai à l'écran : des foyers allumés en continu,
   * à pleine force, dessinaient un LISERÉ blanc de 8 px sur toute la hauteur —
   * un cadre, pas un feu — et le linteau un damier régulier. Chaque case-foyer
   * ne s'allume qu'une image sur deux environ, à une force qui varie : ce sont
   * les trous entre les foyers qui font les langues.
   */
  if (foyers) {
    // Plafonnée sous le blanc : le blanc franc est l'éclat d'un piège déjoué.
    const force = FEU_MAX * (0.5 + 0.32 * a);
    const allume = (i: number, k: number): void => {
      const r = hasard();
      if (r & 1) return;
      const v = Math.round(force * k * (0.5 + ((r >> 1) & 15) / 30));
      if (v > feu[i]!) feu[i] = Math.min(FEU_MAX, v);
    };
    const socle = Math.min(h - 1, Math.max(0, foyers.socle));
    for (let x = 0; x < w; x++) allume(socle * w + x, 1);
    const haut = Math.max(0, Math.min(socle, foyers.plafond));
    for (let y = haut; y <= socle; y++) {
      // Deux cases d'épaisseur : assez pour nourrir la flamme qui penche.
      allume(y * w, 1);
      allume(y * w + 1, 0.9);
      allume(y * w + w - 1, 1);
      allume(y * w + w - 2, 0.9);
    }
    if (foyers.linteau !== null) {
      const l = foyers.linteau;
      for (let x = 0; x < w; x++) allume(l * w + x, 0.7);
    }
  }

  // 3. Le masque : le terrain et la consigne ne brûlent JAMAIS.
  for (let i = 0; i < feu.length; i++) if (interdit[i]) feu[i] = 0;
}

/** La grille est-elle entièrement éteinte ? Sert à couper le calque. */
export function eteint(g: Grille): boolean {
  for (let i = 0; i < g.feu.length; i++) if (g.feu[i]) return false;
  return true;
}

/**
 * La palette : noir-violet, violet, lavande, blanc.
 *
 * Tirée de l'identité, pas inventée : `--ink`, `--signal`, `--signal-pale`,
 * `--paper`. Le bas de l'échelle est TRANSPARENT puis sombre, pour que la
 * flamme naisse du fond au lieu d'être posée dessus. `blanc` (0 → 1) pousse la
 * palette vers le blanc : c'est la chaleur qui monte, et l'éclat d'un piège
 * déjoué.
 */
const CRANS: readonly [number, number, number, number][] = [
  [0, 0, 0, 0],
  [14, 8, 30, 110],
  [26, 14, 52, 170],
  [44, 22, 86, 210],
  [70, 38, 130, 235],
  [104, 70, 180, 250],
  [145, 132, 217, 255],
  [190, 180, 238, 255],
  [207, 201, 242, 255],
  [239, 234, 224, 255],
];

export function couleur(v: number, blanc: number): [number, number, number, number] {
  if (v <= 0) return CRANS[0]!;
  const t = Math.min(1, v / FEU_MAX + blanc * 0.25);
  const i = Math.min(CRANS.length - 1, 1 + Math.floor(t * (CRANS.length - 1.001)));
  return CRANS[i]!;
}

/** Écrit la grille dans une ImageData de même taille. */
export function peins(g: Grille, img: { data: Uint8ClampedArray }, blanc: number): void {
  const d = img.data;
  for (let i = 0, p = 0; i < g.feu.length; i++, p += 4) {
    const c = couleur(g.feu[i]!, blanc);
    d[p] = c[0];
    d[p + 1] = c[1];
    d[p + 2] = c[2];
    d[p + 3] = c[3];
  }
}

/**
 * L'ardeur d'une partie solo : l'avancée, rien d'autre.
 *
 * Nulle pendant l'échauffement — on n'a encore rien fait — puis elle monte
 * jusqu'à la manche 30, où le feu a tout pris. 30 et pas 40 : le score médian
 * est 12 et le p75 20 (572 runs), donc un joueur ordinaire doit VOIR le feu
 * monter, pas seulement en entendre parler.
 */
export function ardeurDe(niveau: number, echauffement: number): number {
  if (niveau < echauffement) return 0;
  return Math.min(1, (niveau - echauffement + 1) / (30 - echauffement));
}
