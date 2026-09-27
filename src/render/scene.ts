import { FIELD_H, FIELD_W } from "../engine/types";
import { MOVE_AMP_X, MOVE_AMP_Y } from "../engine/scene";
import { MOTIFS, encrePour } from "./motif";
import { policeDisplay, policeMono } from "./polices";
import { effets, fissures, intensite as intensiteDe, rupture, RUPTURE_MS } from "./intensite";
import type { Effets } from "./intensite";
import type { ColorId, Entity, OneRule, Round, ZoneRect } from "../engine/types";
import { FIELD_GUTTER, cadrePour, decalage, orientationPour, rectEcran, versChamp, versEcran } from "./orientation";
import type { Cadre, Orientation } from "./orientation";
import { dessinePiece, dessineTerrain, ENCRE, TEINTES, terrainDe } from "./skins";
import type { SkinId } from "../game/boutique";

/**
 * Palette de jeu.
 *
 * Les quatre teintes de l'identité (garance 352°, azur 214°, jade 162°,
 * ambre 42°) sont conservées, mais saturées et écartées en clarté.
 * L'identité les désaturait vers le sol pour laisser l'accent dominer ;
 * or les pièces SONT la mécanique. ΔE minimal entre deux pièces :
 *
 *                    doc    ici
 *   vision normale    62     77
 *   protanopie        24     48
 *   deutéranopie      22     40
 *   tritanopie        19     41
 *
 * En dessous de 25, deux pièces sont indiscernables — et comme la consigne
 * NOMME la couleur, le joueur concerné n'a aucun moyen de compenser.
 */
const HEX: Record<ColorId, string> = TEINTES;

const ACCENT = "#9184D9";
const PAPER = "#EFEAE0";
const LINE = "#26344A";

/**
 * Matière du terrain et des pièces.
 *
 * Le champ était transparent : on voyait le fond de la page, et les pièces
 * flottaient dans le vide. Elles-mêmes étaient des aplats de couleur pure,
 * sans épaisseur — c'est ce qui donnait au jeu son air de maquette.
 *
 * Trois valeurs suffisent à poser une surface et à donner du volume, sans
 * dégradé et sans ombre floue : `shadowBlur` coûte cher sur une machine
 * modeste, et une ombre nette dit la même chose.
 */
// Le terrain et la matière des pièces vivent désormais dans `render/skins.ts` :
// chaque style de la boutique apporte les siens.

/**
 * Trame du mode daltonien : encre et pas, en unités du champ.
 *
 * 12 unités sur un rayon de pièce d'environ 34 : trois à quatre passages de
 * trame par pièce. Moins, et le motif ne se lit pas sur une petite pièce ;
 * plus, et il devient un aplat gris qui mange la teinte.
 *
 * L'opacité est le point délicat. Trop faible, le second canal n'existe pas ;
 * trop forte, il efface la couleur — or la couleur reste l'information
 * première pour qui la perçoit, et le mode ne doit pas dégrader leur jeu.
 */
const TRAME_PAS = 12;

const rgbDe = (hex: string): number[] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Une particule du bac. Réutilisée, jamais réallouée. */
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; color: string; size: number;
}

export const colorHex = (c: ColorId): string => HEX[c];

/**
 * Encre du badge de concours coop.
 *
 * Hors palette jouable : les quatre ColorId disent CE QU'EST la pièce
 * (LE SANG, L'AZUR). Le nombre de concours est un SECOND SIGNE — paper /
 * line / signal, jamais garance / azur / jade / ambre.
 */
export const NEED_BADGE = {
  paper: PAPER,
  line: LINE,
  signal: ACCENT,
} as const;

/**
 * Badge cranté, angles droits, pas de halo. `need < 2` : rien (un clic
 * se lit tout seul). `n` est l'avancement décoratif (0 = repos).
 */
export function drawNeedBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  need: 1 | 2 | 3,
  n = 0,
  /** Taille en unités de terrain — la scène la grossit quand l'échelle est petite. */
  s = 20,
): void {
  if (need < 2) return;
  const bx = Math.round(x - s / 2);
  const by = Math.round(y - s / 2);
  ctx.save();
  ctx.fillStyle = NEED_BADGE.paper;
  ctx.fillRect(bx, by, s, s);
  ctx.strokeStyle = NEED_BADGE.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(bx + 1, by + 1, s - 2, s - 2);
  const inner = s - 6;
  const cranW = Math.max(3, Math.floor(inner / (need * 2 - 1)));
  const gap = cranW;
  let cx = bx + 3;
  for (let k = 0; k < need; k++) {
    ctx.fillStyle = k < n ? NEED_BADGE.signal : NEED_BADGE.line;
    ctx.fillRect(cx, by - 3, cranW, 3);
    cx += cranW + gap;
  }
  ctx.fillStyle = NEED_BADGE.signal;
  ctx.font = policeMono(700, Math.round(s / 2));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(n > 0 ? `${n}/${need}` : String(need), bx + s / 2, by + s / 2 + 1);
  ctx.restore();
}

/** Hitbox 22 % plus large que le visuel. Rater un clic de 3 px fait désinstaller. */
const HIT = 1.22;

// La gouttière vit avec la géométrie du champ : voir `render/orientation.ts`.
export { FIELD_GUTTER };

/**
 * Cadre une fenêtre du champ — attract téléphone.
 *
 * Le letterbox classique tient tout le 1000 × 420 dans le canvas : à 375 px
 * de large, une pièce de rayon 40 fait 13 px. On zoome, puis on centre sur
 * `(cx, cy)` en unités du champ, en recadrant pour ne pas montrer le vide.
 *
 * ⚠️ Ne pas appeler ça sur le canvas de JEU : `fieldRect()` changerait, et
 * les plaques / collisions visuelles suivraient une géométrie qui n'est plus
 * celle du moteur. L'attract a son propre `SceneRenderer`.
 *
 * `zoom <= 1` reproduit le letterbox de `resize()` centré, pour qu'un test
 * puisse comparer les deux sans un canvas.
 */
export function poseCadre(
  cssW: number,
  cssH: number,
  cx: number,
  cy: number,
  zoom: number,
): { scale: number; offX: number; offY: number } {
  const g = FIELD_GUTTER;
  const usableW = Math.max(1, cssW - g * 2);
  const usableH = Math.max(1, cssH - g * 2);
  const scale = Math.min(usableW / FIELD_W, usableH / FIELD_H) * Math.max(1, zoom);
  const fieldW = FIELD_W * scale;
  const fieldH = FIELD_H * scale;
  let offX = cssW / 2 - cx * scale;
  let offY = cssH / 2 - cy * scale;
  if (fieldW >= cssW) offX = Math.min(0, Math.max(cssW - fieldW, offX));
  else offX = (cssW - fieldW) / 2;
  if (fieldH >= cssH) offY = Math.min(0, Math.max(cssH - fieldH, offY));
  else offY = (cssH - fieldH) / 2;
  return { scale, offX, offY };
}

/** Le geste en cours, tel que la scène le dessine. Voir `drawGeste`. */
export type GesteAffiche =
  | { kind: "hold"; idx: number; progres: number }
  | { kind: "drag"; idx: number; x: number | null; y: number | null };

const OK_VERT = "#2FD39F";

export class SceneRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private scale = 1;
  private offX = 0;
  private offY = 0;
  /**
   * Recadrage attract. `null` = letterbox de jeu, inchangé.
   * `draw()` peut rappeler `resize()` : le cadre doit survivre à cet appel.
   */
  private cadre: { cx: number; cy: number; zoom: number } | null = null;
  /**
   * LE TERRAIN PEUT-IL SE METTRE DEBOUT ? Seul le canvas de JEU le permet.
   *
   * L'attract de l'accueil a son propre cadrage (`cadrer`) et garde le
   * paysage : c'est une vitrine, pas une partie. Voir `render/orientation.ts`.
   */
  permetPortrait = false;
  /** L'orientation du dernier cadrage. Toujours paysage hors du jeu. */
  private orientation: Orientation = "paysage";
  /** Bande basse réservée sous le terrain debout — voir `RESERVE_HUD_MULTI`. */
  private reserveBas = 0;

  /**
   * Réserve (ou libère) la bande basse. Recadre sans toucher au buffer : ne
   * passe pas par `resize()`, qui viderait le canvas.
   */
  poseReserveBas(px: number): void {
    if (px === this.reserveBas) return;
    this.reserveBas = px;
    this.appliqueCadre();
  }
  /** Bande haute réservée en paysage serré — voir `RESERVE_CONSIGNE_COUCHE`. */
  private reserveHaut = 0;

  /** Réserve (ou libère) la bande haute. Même précaution que la bande basse. */
  poseReserveHaut(px: number): void {
    if (px === this.reserveHaut) return;
    this.reserveHaut = px;
    this.appliqueCadre();
  }
  /** Lu une fois : le rendu n'a pas à interroger le média à chaque frame. */
  private reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** flash de retour au clic : parti avant même la validation logique */
  private pulse: { x: number; y: number; t: number } | null = null;

  /**
   * Bac de particules préalloué. Le moteur ne fait aucune allocation par
   * frame : un passage du ramasse-miettes au mauvais moment se voit
   * immédiatement dans un jeu où la fenêtre fait 800 ms.
   */
  private parts: Particle[] = Array.from({ length: 96 }, () => ({
    x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: PAPER, size: 2,
  }));
  private partHead = 0;
  private shake = { until: 0, power: 0 };
  private veilUntil = 0;
  private lastT = 0;
  /** Référence de manche : change → naissance visuelle (échelle seule). */
  private bornRound: Round | null = null;
  private bornAt = 0;

  /**
   * Mode daltonien : chaque couleur reçoit en plus une trame.
   *
   * Purement du rendu. Le moteur choisit les couleurs par identifiant, le fil
   * n'en transporte aucune, et `verify.ts` rejoue par identifiant : ce
   * commutateur ne peut donc pas faire diverger deux écrans sur un verdict.
   * C'est ce qui rend le second canal réalisable ici sans rien risquer.
   */
  daltonien = false;
  /**
   * LE STYLE DES PIÈCES — acheté à la boutique. Purement du dessin : le hit-test
   * lit `e.x`, `e.y`, `e.r` et ne sait rien du style (décision n°3).
   */
  skin: SkinId = "sticker";
  /**
   * LA PAGE EST-ELLE SOMBRE ? Posé par `appliqueTheme`. Décoratif comme
   * `skin` : le terrain de nuit et l'encre du cadre de temps, rien d'autre.
   * Le cadre de temps vit HORS du champ, sur la page : écrit à l'encre sur
   * une page noire, il disparaissait.
   */
  sombre = false;
  /**
   * Trames prêtes à l'emploi, une par couleur.
   *
   * Construites à la PREMIÈRE utilisation et gardées : `createPattern` alloue
   * un canevas et une texture, et la grille se balaie en 800 ms — en fabriquer
   * à chaque frame reviendrait à allouer soixante fois par seconde pour un
   * dessin qui ne change jamais.
   */
  private trames = new Map<ColorId, CanvasPattern>();

  /*
   * ================= L'INTENSITÉ GAGNÉE — voir `render/intensite.ts` =========
   *
   * Tout ce qui suit est du DESSIN. Aucun de ces états ne touche `e.x`, `e.y`,
   * `e.r` ni une durée : le hit-test et le verdict sont ceux d'avant.
   */
  /** 0 → 1, posé par la boucle à chaque image. */
  private niveauIntensite = 0;
  private fx: Effets = effets(0);
  /** Ondes de choc des réussites (unités du champ). Bac fixe, réutilisé. */
  private ondes = Array.from({ length: 6 }, () => ({ x: 0, y: 0, t: -1e9, couleur: PAPER, force: 0, r: 30 }));
  private ondeHead = 0;
  /** « ×12 » qui monte du point de la réussite (unités du champ). */
  private textes = Array.from({ length: 4 }, () => ({ x: 0, y: 0, t: -1e9, txt: "" }));
  private texteHead = 0;
  /** Coup de poing du terrain : amplitude et instant. */
  private poing = { t: -1e9, amp: 0 };
  /** La dernière mort : point, instant, graine des fissures. */
  private mort: { x: number; y: number; t: number; graine: number; i: number } | null = null;
  /** Étincelles du cadre de temps, en repère CSS. */
  private etinc = Array.from({ length: 48 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1 }));
  private etincHead = 0;
  private etincDette = 0;

  /** Pose l'intensité courante (palier de la partie, série en cours). */
  poseIntensite(palier: number, serie: number): void {
    const i = this.reduced ? 0 : intensiteDe(palier, serie);
    if (i === this.niveauIntensite) return;
    this.niveauIntensite = i;
    this.fx = effets(i);
  }

  get intensite(): number {
    return this.niveauIntensite;
  }

  /**
   * UNE RÉUSSITE — le retour doit être satisfaisant, et plus satisfaisant
   * quand on l'a mérité. La gerbe grossit, une onde part de la pièce, le
   * terrain encaisse un petit coup, la série s'affiche.
   */
  impact(x: number, y: number, couleur: string, serie: number, now: number, r = 34): void {
    const f = this.fx;
    this.burst(x, y, couleur, f.gerbe, f.vitesse);
    if (this.reduced) return;
    if (f.onde > 0) {
      const o = this.ondes[this.ondeHead]!;
      this.ondeHead = (this.ondeHead + 1) % this.ondes.length;
      o.x = x; o.y = y; o.t = now; o.couleur = couleur; o.force = f.onde; o.r = r;
    }
    if (f.poing > 0) this.poing = { t: now, amp: f.poing };
    if (f.serieVisible && serie >= 3) {
      const tx = this.textes[this.texteHead]!;
      this.texteHead = (this.texteHead + 1) % this.textes.length;
      tx.x = x; tx.y = y; tx.t = now; tx.txt = `×${serie}`;
    }
  }

  /**
   * LA MORT — une vraie rupture, pas un tampon. Éclair, terrain qui s'éteint,
   * fissures qui partent de la faute, éclats. Voir `rupture()`.
   */
  rompt(x: number, y: number, now: number): void {
    this.mort = { x, y, t: now, graine: Math.round(x * 7 + y * 13 + now) % 997, i: this.niveauIntensite };
    this.burst(x, y, "#F74058", 26, 420);
    this.burst(x, y, this.sombre ? "#F1E8D8" : "#241B3A", 14, 300);
    this.kick(now, 1.1 + this.niveauIntensite * 0.5);
  }

  /** Efface la rupture : la manche suivante (ou l'écran d'après) est là. */
  repare(): void {
    this.mort = null;
  }

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("canvas 2D indisponible");
    this.ctx = ctx;
    this.resize();
  }

  /**
   * La trame d'une couleur, en unités du CHAMP.
   *
   * La tuile est dessinée à 32 px puis ramenée à `TRAME_PAS` unités par
   * `setTransform` : dessiner directement une tuile de 12 px la rendrait
   * floue une fois le champ mis à l'échelle, et grossière sur écran dense.
   *
   * L'encre est un noir translucide, et non une couleur : elle doit se voir
   * sur les quatre teintes, qui sont toutes vives. Une encre claire
   * disparaîtrait sur l'ambre, une encre sombre opaque effacerait la teinte —
   * or la couleur reste l'information première pour qui la perçoit.
   */
  private trame(color: ColorId): CanvasPattern | null {
    const dejaLa = this.trames.get(color);
    if (dejaLa) return dejaLa;

    const T = 32;
    const tuile = document.createElement("canvas");
    tuile.width = T;
    tuile.height = T;
    const g = tuile.getContext("2d");
    if (!g) return null;

    const motif = MOTIFS[color];
    const e = encrePour(rgbDe(HEX[color]));
    const encre = `rgba(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]},${e.alpha})`;
    g.strokeStyle = encre;
    g.fillStyle = encre;
    g.lineWidth = T * 0.18;
    g.lineCap = "square";

    if (motif.kind === "points") {
      for (const [cx, cy] of [
        [T * 0.25, T * 0.25],
        [T * 0.75, T * 0.75],
      ]) {
        g.beginPath();
        g.arc(cx!, cy!, T * 0.15, 0, Math.PI * 2);
        g.fill();
      }
    } else if (motif.kind === "barres") {
      // DEUX barres, pas une. Mesuré en simulation de deutéranopie : à une
      // seule barre par tuile, la trame de l'azur ne produisait qu'un
      // écart-type de clarté de 10,7 dans la pièce, contre 28 à 33 pour les
      // hachures et 16 pour les points — c'était le canal le plus faible du
      // lot, pour la seule raison qu'il couvrait moins de surface.
      for (const y of [T * 0.25, T * 0.75]) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(T, y);
        g.stroke();
      }
    } else {
      // Trois traits pour que la tuile se raccorde à ses voisines : la
      // diagonale sort par un coin, il faut la répéter de part et d'autre.
      g.translate(T / 2, T / 2);
      g.rotate((motif.angle * Math.PI) / 180);
      g.translate(-T / 2, -T / 2);
      for (const d of [-T, 0, T]) {
        g.beginPath();
        g.moveTo(-T, T * 0.5 + d);
        g.lineTo(T * 2, T * 0.5 + d);
        g.stroke();
      }
    }

    const pat = this.ctx.createPattern(tuile, "repeat");
    if (!pat) return null;
    if (typeof DOMMatrix !== "undefined" && pat.setTransform) {
      pat.setTransform(new DOMMatrix().scale(TRAME_PAS / T));
    }
    this.trames.set(color, pat);
    return pat;
  }

  /**
   * Zoom + centre sur un point du champ. `zoom <= 1` rend le letterbox.
   * Uniquement l'attract : le renderer de jeu ne l'appelle jamais.
   *
   * ⚠️ Ne passe PAS par `resize()` : poser `canvas.width` à chaque image
   * viderait le buffer. Le cadre se recalcule, le buffer reste.
   */
  cadrer(cx: number, cy: number, zoom: number): void {
    this.cadre = zoom > 1 ? { cx, cy, zoom } : null;
    this.appliqueCadre();
  }

  /** Letterbox de jeu, ou fenêtre d'attract si un cadre est posé. */
  private appliqueCadre(): void {
    if (this.cadre) {
      const c = poseCadre(this.cssW, this.cssH, this.cadre.cx, this.cadre.cy, this.cadre.zoom);
      this.scale = c.scale;
      this.offX = c.offX;
      this.offY = c.offY;
      return;
    }
    const o: Orientation =
      this.permetPortrait && typeof window !== "undefined"
        ? orientationPour(window.innerWidth, window.innerHeight)
        : "paysage";
    const c = cadrePour(this.cssW, this.cssH, o, this.reserveBas, this.reserveHaut);
    this.orientation = o;
    this.scale = c.scale;
    this.offX = c.offX;
    this.offY = c.offY;
  }

  /** Le cadrage courant, tel que `render/orientation.ts` le décrit. */
  private get cadreCourant(): Cadre {
    return { orientation: this.orientation, scale: this.scale, offX: this.offX, offY: this.offY };
  }

  /** Le terrain est-il debout ? Les textes qui disent « gauche » en dépendent. */
  get debout(): boolean {
    return this.orientation === "portrait";
  }

  /**
   * Point du champ → pixels CSS dans le canvas.
   *
   * ⚠️ LA SEULE conversion dans ce sens. Un curseur qui refait le calcul avec
   * `x / FIELD_W * w` pointe à côté dès que le terrain est debout.
   */
  versEcran(fx: number, fy: number): { x: number; y: number } {
    return versEcran(this.cadreCourant, fx, fy);
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.appliqueCadre();
  }

  /** Coordonnées écran → repère logique du moteur. */
  toField(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    if (Math.abs(r.width - this.cssW) > 0.5 || Math.abs(r.height - this.cssH) > 0.5) {
      this.resize();
    }
    return versChamp(this.cadreCourant, clientX - r.left, clientY - r.top);
  }

  /**
   * Rectangle du champ en pixels CSS, dans le repère du canvas.
   *
   * Le multijoueur pose ses plaques dans les gouttières laissées par le
   * letterbox. Sans cette mesure, il devrait la deviner, et une plaque finirait
   * par recouvrir une cible cliquable.
   */
  fieldRect(): { x: number; y: number; w: number; h: number; debout: boolean } {
    return { ...rectEcran(this.cadreCourant), debout: this.debout };
  }

  hit(ents: Entity[], x: number, y: number): Entity | null {
    let best: Entity | null = null;
    let bd = Infinity;
    for (const e of ents) {
      const d = Math.hypot(x - e.x, y - e.y);
      if (d <= e.r * HIT && d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  flash(x: number, y: number, now: number): void {
    this.pulse = { x, y, t: now };
  }

  /** Éclat de réussite à l'endroit du clic. */
  burst(x: number, y: number, color: string, count = 10, speed = 190): void {
    for (let i = 0; i < count; i++) {
      const p = this.parts[this.partHead]!;
      this.partHead = (this.partHead + 1) % this.parts.length;
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const v = speed * (0.55 + Math.random() * 0.75);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.max = 0.34 + Math.random() * 0.22;
      p.life = p.max;
      p.color = color;
      p.size = 2 + Math.random() * 2.6;
    }
  }

  /** Gerbe à l'échelle du champ — piège déjoué. */
  burstScreen(color = ACCENT, count = 36, speed = 320): void {
    this.burst(FIELD_W / 2, FIELD_H / 2, color, count, speed);
  }

  /** Voile signal court en repère CSS (sans secousse). */
  /**
   * LA PRESSION — voir `render/tension.ts`. Le voile du palier et l'éclat du
   * battement, posés par la boucle à chaque image. Ils ne touchent QUE le
   * pourtour du terrain : le champ est découpé, au pixel.
   */
  pression = { voile: 0, eclat: 0 };
  private sursautJusque = 0;

  /** Un palier vient d'être franchi : le pourtour s'embrase un instant. */
  sursaut(now: number): void {
    this.sursautJusque = now + 700;
  }

  private drawPression(now: number): void {
    const { ctx, cssW: W, cssH: H } = this;
    const sursaut = now < this.sursautJusque ? (this.sursautJusque - now) / 700 : 0;
    const eclat = this.reduced ? 0 : this.pression.eclat;
    const a = Math.min(0.6, this.pression.voile * (1 + eclat * 0.9) + sursaut * 0.35);
    if (a <= 0.004) return;
    const f = rectEcran(this.cadreCourant);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(f.x, f.y, f.w, f.h);
    ctx.clip("evenodd");
    /*
     * Plus dense aux BORDS de l'écran qu'au bord du terrain : la pression
     * vient de l'extérieur et se referme sur le jeu. Un aplat uniforme se
     * lisait comme un changement de couleur de page, pas comme une menace.
     */
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    const r0 = Math.min(f.w, f.h) / 2;
    const r1 = Math.hypot(W, H) / 2 + 1;
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    const teinte = this.sombre ? "196,34,64" : "142,18,38";
    g.addColorStop(0, `rgba(${teinte},${a * 0.45})`);
    g.addColorStop(1, `rgba(${teinte},${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  flashViolet(now: number): void {
    // Célébration pure : la gerbe et le son portent déjà l'information, le
    // voile ne fait que la rendre spectaculaire. Il peut donc s'effacer.
    if (this.reduced) return;
    this.veilUntil = now + 220;
  }

  /** Secousse d'écran. Réservée à la mort : banalisée, elle ne dit plus rien. */
  kick(now: number, power = 1): void {
    this.shake = { until: now + 260 * power, power };
  }

  private stepParticles(dt: number): void {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // La pesanteur tire vers le BAS DE L'ÉCRAN, qui est +x du champ debout.
      if (this.orientation === "portrait") {
        p.vx += 520 * dt;
        p.vy *= 0.965;
      } else {
        p.vy += 520 * dt;
        p.vx *= 0.965;
      }
    }
  }

  private drawParticles(): void {
    const { ctx } = this;
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Cadre de temps — repère CSS, AUTOUR DU TERRAIN.
   *
   * ⚠️ Il épousait les bords du CANVAS, donc de l'écran : au téléphone, le
   * canvas couvre aussi la bande de la consigne, et le cadre passait derrière
   * elle — deux barres parasites sous le bandeau, des équerres aux coins de
   * l'écran, un cadre hachuré rouge de 16 px sur toute la page au dernier
   * quart. Rapporté par Pierre : « l'écran de jeu est juste atroce ». Le temps
   * qui reste se lit maintenant sur le bord du TERRAIN, là où l'œil est déjà.
   *
   * Trois couches : un rail discret, le temps restant (il se referme vers le
   * bas, symétrique), et dans le dernier quart un liseré garance qui bat. Pas de
   * hachures. Le cadre ne subit pas la secousse.
   */
  private drawTimeFrame(ratio: number, now: number, dt = 0): void {
    const { ctx, cssW: W, cssH: H } = this;
    const f = rectEcran(this.cadreCourant);
    const pad = 7;
    const x0 = Math.max(2, f.x - pad);
    const y0 = Math.max(2, f.y - pad);
    const x1 = Math.min(W - 2, f.x + f.w + pad);
    const y1 = Math.min(H - 2, f.y + f.h + pad);
    const w = x1 - x0;
    const h = y1 - y0;
    const critique = ratio >= 0.76;
    const pageSombre = this.sombre || !terrainDe(this.skin, this.sombre).clair;

    ctx.save();
    ctx.lineCap = "round";

    // Le dernier quart : un liseré garance, qui bat (sauf mouvement réduit).
    if (critique) {
      let epais = 5;
      if (!this.reduced) {
        const period = 1100 - ratio * 700;
        const p = (((now % period) + period) % period) / period;
        epais += p < 0.14 ? (1 - p / 0.14) * 4 : 0;
      }
      ctx.strokeStyle = "rgba(224,36,62,0.85)";
      ctx.lineWidth = epais;
      ctx.strokeRect(x0 - epais / 2 - 2, y0 - epais / 2 - 2, w + epais + 4, h + epais + 4);
    }

    // Le rail.
    ctx.strokeStyle = pageSombre ? "rgba(241,232,216,0.18)" : "rgba(36,27,58,0.14)";
    ctx.lineWidth = 4;
    ctx.strokeRect(x0, y0, w, h);

    // Le temps restant, dans l'encre de la page. Il s'épaissit avec l'intensité.
    const per = (w + h) * 2;
    const left = Math.max(0, 1 - ratio) * per;
    const trait = this.fx.cadre;
    ctx.strokeStyle = critique ? "#E0243E" : pageSombre ? "#F1E8D8" : ENCRE;
    ctx.lineWidth = trait;
    /*
     * La NAISSANCE d'une manche, à haute intensité : le cadre claque en
     * blanc 140 ms. La manche suivante se SENT arriver, et plus on va vite
     * plus ces claquements se rapprochent — l'accélération devient visible.
     */
    const nait = now - this.bornAt;
    if (this.fx.cascade > 0 && nait >= 0 && nait < 140 && !this.reduced) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - nait / 140)})`;
      ctx.lineWidth = trait + 6;
      ctx.strokeRect(x0, y0, w, h);
      ctx.restore();
    }
    ctx.beginPath();
    let rest = left / 2;
    const seg = (fromX: number, fromY: number, toX: number, toY: number): void => {
      if (rest <= 0) return;
      const len = Math.hypot(toX - fromX, toY - fromY);
      const k = Math.min(1, rest / len);
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(fromX + (toX - fromX) * k, fromY + (toY - fromY) * k);
      rest -= len;
    };
    const midX = x0 + w / 2;
    seg(midX, y0, x1, y0);
    seg(x1, y0, x1, y1);
    seg(x1, y1, midX, y1);
    rest = left / 2;
    seg(midX, y0, x0, y0);
    seg(x0, y0, x0, y1);
    seg(x0, y1, midX, y1);
    ctx.stroke();

    /*
     * LES DEUX TÊTES DU TEMPS. Le temps qui reste se referme par ses deux
     * bouts ; à haute intensité ces bouts brûlent — un point vif, et des
     * étincelles qui s'en détachent. On voit le temps MANGER le cadre.
     */
    if (this.fx.etincelles > 0 && left > 0 && !this.reduced) {
      const point = (cote: 1 | -1): [number, number] => {
        let reste = left / 2;
        const chemin: [number, number, number, number][] =
          cote === 1
            ? [[midX, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, midX, y1]]
            : [[midX, y0, x0, y0], [x0, y0, x0, y1], [x0, y1, midX, y1]];
        let px = midX;
        let py = y0;
        for (const [ax, ay, bx, by] of chemin) {
          const len = Math.hypot(bx - ax, by - ay);
          const k = Math.min(1, reste / len);
          px = ax + (bx - ax) * k;
          py = ay + (by - ay) * k;
          reste -= len;
          if (reste <= 0) break;
        }
        return [px, py];
      };
      const tetes = [point(1), point(-1)];
      this.etincDette += this.fx.etincelles * dt;
      for (const [px, py] of tetes) {
        ctx.fillStyle = critique ? "#FFD2D8" : "#FFFFFF";
        ctx.beginPath();
        ctx.arc(px, py, trait * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = critique ? "#E0243E" : "#9184D9";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      while (this.etincDette >= 1) {
        this.etincDette -= 1;
        const [px, py] = tetes[Math.random() < 0.5 ? 0 : 1]!;
        const e = this.etinc[this.etincHead]!;
        this.etincHead = (this.etincHead + 1) % this.etinc.length;
        const a = Math.random() * Math.PI * 2;
        const v = 60 + Math.random() * 120;
        e.x = px; e.y = py; e.vx = Math.cos(a) * v; e.vy = Math.sin(a) * v - 40;
        e.max = 0.25 + Math.random() * 0.25; e.life = e.max;
      }
    }
    ctx.restore();
  }

  /** Étincelles du cadre (repère CSS). */
  private drawEtincelles(dt: number): void {
    const { ctx } = this;
    for (const e of this.etinc) {
      if (e.life <= 0) continue;
      e.life -= dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vy += 260 * dt;
      ctx.globalAlpha = Math.max(0, e.life / e.max);
      ctx.fillStyle = "#FFC24A";
      ctx.fillRect(e.x - 1.5, e.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * LES TRAÎNÉES — l'accélération qu'on VOIT. Autour du terrain (jamais
   * dessus), des traits filent vers le bas, de plus en plus vite et de plus
   * en plus nombreux avec l'intensité. Sur téléphone debout, ce sont les
   * bandes vides de chaque côté du terrain qui se mettent à courir.
   */
  private drawTrainees(now: number): void {
    const k = this.fx.trainees;
    if (k <= 0 || this.reduced) return;
    const { ctx, cssW: W, cssH: H } = this;
    const f = rectEcran(this.cadreCourant);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(f.x - 12, f.y - 12, f.w + 24, f.h + 24);
    ctx.clip("evenodd");
    const n = Math.round(10 + k * 26);
    const vitesse = 0.35 + k * 1.4; // px par ms
    const encre = this.sombre || !terrainDe(this.skin, this.sombre).clair ? "241,232,216" : "36,27,58";
    ctx.lineCap = "round";
    for (let j = 0; j < n; j++) {
      const hx = Math.sin(j * 127.1) * 43758.5453;
      const col = (hx - Math.floor(hx)) * W;
      const hy = Math.sin(j * 311.7) * 12543.13;
      const dec = (hy - Math.floor(hy)) * (H + 200);
      const long = 30 + k * 90 + (j % 3) * 18;
      const y = ((now * vitesse * (0.7 + (j % 5) * 0.12) + dec) % (H + long + 40)) - long;
      ctx.strokeStyle = `rgba(${encre},${0.05 + k * 0.13})`;
      ctx.lineWidth = 2 + (j % 3);
      ctx.beginPath();
      ctx.moveTo(col, y);
      ctx.lineTo(col, y + long);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Ondes de choc des réussites (unités du champ). */
  private drawOndes(now: number): void {
    const { ctx } = this;
    for (const o of this.ondes) {
      const t = now - o.t;
      if (t < 0 || t > 340) continue;
      const k = t / 340;
      const ease = 1 - (1 - k) * (1 - k);
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = o.couleur;
      ctx.lineWidth = 14 * o.force * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * (1 + ease * 1.6 * o.force), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 3 * (1 - k);
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * (1 + ease * 1.1 * o.force), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** La série qui monte du point de la réussite (repère CSS : un chiffre ne se transpose pas). */
  private drawTextes(now: number): void {
    const { ctx } = this;
    for (const tx of this.textes) {
      const t = now - tx.t;
      if (t < 0 || t > 650) continue;
      const k = t / 650;
      const p = this.versEcran(tx.x, tx.y);
      const pop = t < 90 ? 0.6 + (t / 90) * 0.6 : 1.2 - Math.min(0.2, (t - 90) / 400);
      const taille = Math.round((18 + this.niveauIntensite * 16) * pop);
      ctx.save();
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = policeDisplay(700, taille);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const y = p.y - 26 - k * 46;
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#241B3A";
      ctx.strokeText(tx.txt, p.x, y);
      ctx.fillStyle = "#FFE27A";
      ctx.fillText(tx.txt, p.x, y);
      ctx.restore();
    }
  }

  /** Le terrain qui s'éteint et se fend (unités du champ). */
  private drawRupture(now: number): void {
    const m = this.mort;
    if (!m) return;
    const t = now - m.t;
    const r = rupture(t, m.i);
    if (t >= RUPTURE_MS) {
      // La rupture TIENT jusqu'à ce qu'on la répare : l'écran d'après arrive.
      r.voile = 0.62;
      r.fissure = 1;
    }
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = `rgba(16,8,26,${r.voile})`;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    if (r.fissure > 0) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const rayon of fissures(m.graine)) {
        const n = Math.max(1, Math.round((rayon.length - 1) * r.fissure));
        for (const [couleur, larg] of [
          // Au moins 5 et 2,5 px À L'ÉCRAN : au téléphone l'échelle tombe à
          // 0,46, et 9 unités ne faisaient plus qu'un cheveu.
          ["rgba(255,255,255,0.92)", Math.max(9, 5 / Math.max(0.01, this.scale))],
          ["#F74058", Math.max(4, 2.5 / Math.max(0.01, this.scale))],
        ] as const) {
          ctx.strokeStyle = couleur;
          ctx.lineWidth = larg;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          for (let k = 1; k <= n; k++) ctx.lineTo(m.x + rayon[k]![0], m.y + rayon[k]![1]);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  /** L'éclair blanc de la mort (repère CSS, tout le canvas). */
  private drawEclair(now: number): void {
    const m = this.mort;
    if (!m) return;
    const r = rupture(now - m.t, m.i);
    if (r.eclair <= 0.004) return;
    this.ctx.fillStyle = `rgba(255,255,255,${r.eclair})`;
    this.ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  /** Anime les formes mobiles. Muter en place évite toute allocation par frame. */
  private animate(round: Round, t: number): void {
    for (const e of round.ents) {
      if (e.moving) {
        e.x = e.ox + Math.sin(t * 5.2 + e.phase) * MOVE_AMP_X;
        e.y = e.oy + Math.cos(t * 3.7 + e.phase) * MOVE_AMP_Y;
      } else {
        e.x = e.ox;
        e.y = e.oy;
      }
    }
  }

  private path(e: Entity, r = e.r): void {
    const { ctx } = this;
    const { x, y } = e;
    ctx.beginPath();
    if (e.shape === "rond") {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else if (e.shape === "carre") {
      ctx.rect(x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76);
    } else {
      // La pointe vers le HAUT DE L'ÉCRAN, terrain couché ou debout : un
      // triangle qui pointerait de côté serait une autre forme à l'œil.
      const o = this.orientation;
      const [ax, ay] = decalage(o, 0, -r);
      const [bx, by] = decalage(o, r * 0.92, r * 0.72);
      const [cx, cy] = decalage(o, -r * 0.92, r * 0.72);
      ctx.moveTo(x + ax, y + ay);
      ctx.lineTo(x + bx, y + by);
      ctx.lineTo(x + cx, y + cy);
      ctx.closePath();
    }
  }

  /**
   * LE GESTE EN COURS — MAINTENIR ou GLISSER.
   *
   * Maintenir : une jauge qui fait le tour de la pièce en `HOLD_MS`, et qui
   * passe au vert quand le lever sera accepté. Sans elle, le joueur ne sait
   * pas QUAND lâcher — et « lâché trop tôt » serait une mort sans indice.
   * Glisser : un trait de la pièce prise jusqu'au doigt.
   *
   * Aucune donnée de jeu ici : la jauge LIT l'état que le moteur a produit
   * (`holdAt`), elle ne le décide pas.
   */
  private drawGeste(round: Round, g: GesteAffiche): void {
    const { ctx } = this;
    const e = round.ents[g.idx];
    if (!e) return;
    ctx.save();
    if (g.kind === "hold") {
      const p = Math.max(0, Math.min(1, g.progres));
      const r = e.r + 14;
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(36,27,58,0.18)";
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = p >= 1 ? OK_VERT : ACCENT;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.stroke();
    } else if (g.x !== null && g.y !== null) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.setLineDash([14, 12]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(g.x, g.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ACCENT;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(g.x, g.y, e.r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Révélation post-mortem d'un piège.
   *
   * L'identité prévoyait un état PIÈGE — anneau accent, halo pulsant — parmi
   * les états de pièce. Affiché pendant la manche, il désigne la réponse et
   * supprime la seule mécanique du jeu. Il n'apparaît donc qu'APRÈS la mort,
   * pendant le gel, pour montrer au joueur ce qu'il n'a pas vu.
   */
  private drawReveal(round: Round, now: number): void {
    const want = round.originalWant;
    if (!want) return;
    const idxs =
      want.kind === "click" || want.kind === "hold"
        ? [want.idx]
        : want.kind === "sequence"
          ? want.idxs
          : want.kind === "drag"
            ? [want.from, want.to]
            : [];
    const k = 0.5 + 0.5 * Math.sin(now / 140);
    const { ctx } = this;
    for (const i of idxs) {
      const e = round.ents[i];
      if (!e) continue;
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.globalAlpha = 0.55 + 0.45 * k;
      ctx.lineWidth = 5;
      this.path(e, e.r + 12);
      ctx.stroke();
      // la barre du signe : le refus d'agir
      ctx.lineWidth = 7;
      ctx.beginPath();
      const [dx0, dy0] = decalage(this.orientation, -e.r * 0.95, e.r * 0.95);
      ctx.moveTo(e.x + dx0, e.y + dy0);
      ctx.lineTo(e.x - dx0, e.y - dy0);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Le terrain.
   *
   * Une aire de jeu doit se voir. Sans elle, les pièces flottent sur le fond
   * de la page et rien ne dit où l'on peut cliquer — le champ n'existait que
   * dans le code. Une surface à peine plus sombre que la page suffit à le
   * poser, et une trame régulière lui donne une profondeur : elle sert de
   * repère spatial quand l'œil balaie quinze formes en une seconde.
   *
   * Purement décorative : elle ne suit ni la grille logique ni les cellules,
   * et rien du jeu n'en dépend. Dessinée en premier, donc sous tout le reste.
   */
  private drawField(): void {
    dessineTerrain(this.ctx, this.skin, FIELD_W, FIELD_H, this.sombre);
  }

  /** Zones interdites d'une règle spatiale : invisibles, elles seraient injustes. */
  private drawZones(zones: readonly ZoneRect[]): void {
    for (const z of zones) this.drawZone(z);
  }

  private drawZone(z: ZoneRect): void {
    const { ctx } = this;
    const w = z.x1 - z.x0;
    const h = z.y1 - z.y0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(z.x0, z.y0, w, h);
    ctx.clip();
    ctx.fillStyle = "rgba(145,132,217,0.07)";
    ctx.fillRect(z.x0, z.y0, w, h);
    ctx.strokeStyle = "rgba(145,132,217,0.22)";
    ctx.lineWidth = 3;
    // Les hachures suivent la DIAGONALE du rectangle : sur une bande pleine
    // hauteur comme sur un carré d'angle, l'inclinaison reste la même.
    for (let i = -h; i < w + h; i += 16) {
      ctx.beginPath();
      ctx.moveTo(z.x0 + i, z.y1);
      ctx.lineTo(z.x0 + i + h, z.y0);
      ctx.stroke();
    }
    ctx.restore();
    /*
     * Le liseré ne se pose que sur les bords INTÉRIEURS au terrain : souligner
     * une arête qui est déjà celle de l'écran ajoute un trait pour rien.
     */
    ctx.strokeStyle = "rgba(145,132,217,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (z.x1 < FIELD_W) {
      ctx.moveTo(z.x1, z.y0);
      ctx.lineTo(z.x1, z.y1);
    }
    if (z.x0 > 0) {
      ctx.moveTo(z.x0, z.y0);
      ctx.lineTo(z.x0, z.y1);
    }
    if (z.y1 < FIELD_H) {
      ctx.moveTo(z.x0, z.y1);
      ctx.lineTo(z.x1, z.y1);
    }
    if (z.y0 > 0) {
      ctx.moveTo(z.x0, z.y0);
      ctx.lineTo(z.x1, z.y0);
    }
    ctx.stroke();
  }

  draw(state: {
    round: Round | null;
    rule: OneRule | null;
    now: number;
    reveal?: boolean;
    ratio?: number;
    needs?: ReadonlyMap<number, 1 | 2 | 3>;
    charges?: ReadonlyMap<number, { n: number }>;
    geste?: GesteAffiche | null;
  }): void {
    const { round, rule, now, reveal = false, ratio, needs, charges } = state;
    const { ctx } = this;
    const dt = this.lastT ? Math.min(0.05, (now - this.lastT) / 1000) : 0;
    this.lastT = now;

    /*
     * Le rendu se resynchronise seul, exactement comme toField() le fait déjà
     * avant de projeter un clic.
     *
     * resize() dépend d'un ResizeObserver, et un observateur peut ne jamais
     * livrer : boîte nulle au moment de l'observation, notifications
     * abandonnées après une boucle de mise en page, onglet qui ne compose pas.
     * La géométrie reste alors figée sur une valeur périmée et les pièces sont
     * dessinées hors champ — un champ vide, sans la moindre erreur nulle part.
     *
     * clientWidth/clientHeight sont des entiers arrondis, d'où le seuil à 1 px :
     * comparer à la fraction près re-mesurerait à chaque image.
     */
    const bw = this.canvas.clientWidth;
    const bh = this.canvas.clientHeight;
    if (bw > 0 && bh > 0 && (Math.abs(bw - this.cssW) > 1 || Math.abs(bh - this.cssH) > 1)) {
      this.resize();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // secousse : appliquée à la transformation, donc gratuite
    let ox = 0;
    let oy = 0;
    if (now < this.shake.until) {
      const k = (this.shake.until - now) / (260 * this.shake.power);
      const amp = 13 * this.shake.power * k * k;
      ox = (Math.random() * 2 - 1) * amp;
      oy = (Math.random() * 2 - 1) * amp;
    }
    /*
     * Le COUP DE POING d'une réussite : le terrain se gonfle d'une fraction
     * autour de son centre, 140 ms. Le dessin seulement — `toField` lit le
     * cadre, pas cette matrice, donc un clic dans l'intervalle est projeté
     * exactement comme avant.
     */
    let gonfle = 1;
    const tp = now - this.poing.t;
    if (tp >= 0 && tp < 140) gonfle = 1 + this.poing.amp * Math.sin((tp / 140) * Math.PI);
    const s = this.scale * this.dpr * gonfle;
    const fr0 = rectEcran(this.cadreCourant);
    const cxE = fr0.x + fr0.w / 2;
    const cyE = fr0.y + fr0.h / 2;
    const ex = (cxE + (this.offX - cxE) * gonfle + ox * this.scale) * this.dpr;
    const ey = (cyE + (this.offY - cyE) * gonfle + oy * this.scale) * this.dpr;
    // Debout, la matrice TRANSPOSE : x du champ → bas de l'écran, y → droite.
    if (this.orientation === "portrait") ctx.setTransform(0, s, s, 0, ex, ey);
    else ctx.setTransform(s, 0, 0, s, ex, ey);

    // Le terrain d'abord, toujours : il reste posé entre deux manches, ce qui
    // évite qu'un interlude ne fasse disparaître l'aire de jeu.
    this.drawField();

    if (rule?.zone) this.drawZones(rule.zone);

    /*
     * La rupture s'efface quand le jeu passe à autre chose : plus de manche
     * (l'écran de fin), ou une manche NEUVE (la suivante en multi). Pas avant
     * 300 ms — une kill-cam qui rejoue une autre manche aussitôt ne doit pas
     * avaler la mort.
     */
    if (this.mort && now - this.mort.t > 300 && (!round || round !== this.bornRound)) this.mort = null;

    if (round) {
      if (round !== this.bornRound) {
        this.bornRound = round;
        this.bornAt = now;
      }
      this.animate(round, now / 1000);
      // Respiration coupée dès qu'une forme mobile est présente : LE MOUVANT
      // joue sur la position ; respirer en échelle en parallèle est trop mince.
      const breathes = !this.reduced && !round.ents.some((e) => e.moving);
      // Naissance 120 ms, 0,62 → 1, sans rebond. Hit-test inchangé (e.r plein).
      // Naissance en « pop » : 0,55 → 1,08 → 1 en 200 ms. Le hit-test reste
      // sur `e.r` plein : c'est le dessin qui rebondit, pas la cible.
      const age = Math.max(0, now - this.bornAt);
      const birth =
        this.reduced || age >= 200
          ? 1
          : age < 130
            ? 0.55 + (0.53 * age) / 130
            : 1.08 - (0.08 * (age - 130)) / 70;
      /*
       * Trois passes par pièce : l'ombre, l'aplat, l'arête.
       *
       * Une pièce était un aplat de couleur pure posé sur du vide. Elle n'avait
       * ni poids ni épaisseur, et c'est ce qui donnait au jeu son air de
       * maquette — plus que n'importe quel écran de menu.
       *
       * L'ombre est la MÊME forme, décalée vers le bas : nette, sans flou.
       * `shadowBlur` produirait le même volume et coûterait dix fois plus sur
       * une machine modeste, dans une boucle qui a 16 ms par image.
       *
       * L'arête est un liseré clair sur le contour. Pas de dégradé — l'identité
       * s'en passe partout, et un contour dit la lumière aussi bien.
       *
       * Rien ici ne touche à `e.x`, `e.y` ni `e.r` : la géométrie du hit-test
       * est exactement celle d'avant, au pixel près.
       */
      /*
       * La pastille du coop tient au moins 22 px À L'ÉCRAN. À 20 unités de
       * terrain, elle tombait à 9 px au téléphone (échelle 0,46) : le nombre
       * d'appuis qu'une pièce demande ne se lisait plus.
       */
      const tailleBadge = Math.max(20, 22 / Math.max(0.01, this.scale));
      for (const e of round.ents) {
        let scale = birth;
        /*
         * LA CASCADE : à haute intensité, les pièces d'une manche tombent l'une
         * après l'autre (quelques ms d'écart) — la manche ARRIVE, elle ne
         * s'allume pas. Le hit-test reste sur `e.r` plein.
         */
        const cas = this.fx.cascade;
        if (cas > 0 && !this.reduced) {
          const a = age - e.idx * cas;
          scale = a < 0 ? 0.35 : a < 130 ? 0.55 + (0.53 * a) / 130 : a < 200 ? 1.08 - (0.08 * (a - 130)) / 70 : 1;
        }
        // LE POULS : les pièces battent avec le cœur de la partie.
        if (this.fx.pouls > 0) scale *= 1 + this.fx.pouls * this.pression.eclat;
        if (breathes) {
          // ±1,5 %, période ~2,6 s ; phase déterministe (e.phase).
          scale *= 1 + 0.015 * Math.sin((now / 1000) * ((Math.PI * 2) / 2.6) + e.phase);
        }
        const r = e.r * scale;

        dessinePiece(
          ctx,
          { shape: e.shape, color: e.color, x: e.x, y: e.y, r, r0: e.r, phase: e.phase },
          this.skin,
          this.orientation,
          this.daltonien ? this.trame(e.color) : null,
          now,
        );

        const need = needs?.get(e.idx);
        if (need && need >= 2) {
          const [bdx, bdy] = decalage(this.orientation, e.r * 0.62, -e.r * 0.72);
          if (this.orientation === "portrait") {
            // Le badge porte un CHIFFRE : sous la transposition il se lirait
            // en miroir. On transpose une seconde fois autour de lui.
            ctx.save();
            ctx.translate(e.x + bdx, e.y + bdy);
            ctx.transform(0, 1, 1, 0, 0, 0);
            drawNeedBadge(ctx, 0, 0, need, charges?.get(e.idx)?.n ?? 0, tailleBadge);
            ctx.restore();
          } else {
            drawNeedBadge(ctx, e.x + bdx, e.y + bdy, need, charges?.get(e.idx)?.n ?? 0, tailleBadge);
          }
        }
      }
      if (reveal) this.drawReveal(round, now);
      if (state.geste) this.drawGeste(round, state.geste);
    }

    this.drawOndes(now);
    this.drawRupture(now);

    this.stepParticles(dt);
    this.drawParticles();

    if (this.pulse) {
      /*
       * ⚠️ BORNÉ À ZÉRO. `pulse.t` vient de l'instant du CLIC, `now` du début
       * de l'image : un clic tombé entre les deux donne un `k` négatif, donc un
       * rayon négatif, et `arc()` LÈVE — l'image s'arrête là. Vu en jouant le
       * tutoriel au clic rapide : `arc` avec un rayon de −7,7.
       */
      const k = Math.max(0, (now - this.pulse.t) / 220);
      if (k >= 1) {
        this.pulse = null;
      } else {
        ctx.strokeStyle = terrainDe(this.skin, this.sombre).clair
          ? `rgba(36,27,58,${0.5 * (1 - k)})`
          : `rgba(233,233,237,${0.55 * (1 - k)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(this.pulse.x, this.pulse.y, 12 + k * 46, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawPression(now);
    this.drawTrainees(now);

    if (ratio !== undefined) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawTimeFrame(ratio, now, dt);
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawEtincelles(dt);
    this.drawTextes(now);
    this.drawEclair(now);

    if (now < this.veilUntil) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const k = (this.veilUntil - now) / 220;
      ctx.fillStyle = `rgba(145,132,217,${0.28 * k})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
  }
}
