import { FIELD_H, FIELD_W } from "../engine/types";
import { MOVE_AMP_X, MOVE_AMP_Y } from "../engine/scene";
import { MOTIFS, encrePour } from "./motif";
import type { ColorId, Entity, OneRule, Round, ZoneRect } from "../engine/types";

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
const HEX: Record<ColorId, string> = {
  garance: "#F74058",
  azur: "#237EF6",
  jade: "#40F7C0",
  ambre: "#F5B214",
};

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
const SOL = "#111A28";
const SOL_TRAME = "rgba(145,132,217,0.055)";

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
const OMBRE = "rgba(0,0,0,0.42)";
const ARETE = "rgba(255,255,255,0.20)";

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
): void {
  if (need < 2) return;
  const s = 20;
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
  ctx.font = "700 10px 'JetBrains Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(n > 0 ? `${n}/${need}` : String(need), bx + s / 2, by + s / 2 + 1);
  ctx.restore();
}

/** Hitbox 22 % plus large que le visuel. Rater un clic de 3 px fait désinstaller. */
const HIT = 1.22;

/**
 * Gouttière réservée au cadre de temps, de chaque côté du champ.
 *
 * Exportée parce que la mise en page en dépend : main.ts doit pouvoir calculer
 * la même géométrie que le renderer pour décider où placer les plaques. Deux
 * copies de ce nombre divergeraient au premier réglage.
 */
export const FIELD_GUTTER = 24;

export class SceneRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private scale = 1;
  private offX = 0;
  private offY = 0;
  /**
   * Gouttière réservée au cadre de temps.
   *
   * Une forme L mobile peut atteindre x ≈ −12 dans le repère du champ
   * (jitter de cellule 31, puis MOVE_AMP_X = 22, moins le rayon 59) : les
   * pièces débordent du champ. Sans marge réservée, un liseré épais
   * recouvrirait une cible cliquable.
   */
  private static readonly GUTTER = FIELD_GUTTER;
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
   * Trames prêtes à l'emploi, une par couleur.
   *
   * Construites à la PREMIÈRE utilisation et gardées : `createPattern` alloue
   * un canevas et une texture, et la grille se balaie en 800 ms — en fabriquer
   * à chaque frame reviendrait à allouer soixante fois par seconde pour un
   * dessin qui ne change jamais.
   */
  private trames = new Map<ColorId, CanvasPattern>();

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

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    const g = SceneRenderer.GUTTER;
    const usableW = Math.max(1, this.cssW - g * 2);
    const usableH = Math.max(1, this.cssH - g * 2);
    this.scale = Math.min(usableW / FIELD_W, usableH / FIELD_H);
    this.offX = (this.cssW - FIELD_W * this.scale) / 2;
    this.offY = (this.cssH - FIELD_H * this.scale) / 2;
  }

  /** Coordonnées écran → repère logique du moteur. */
  toField(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    if (Math.abs(r.width - this.cssW) > 0.5 || Math.abs(r.height - this.cssH) > 0.5) {
      this.resize();
    }
    return {
      x: (clientX - r.left - this.offX) / this.scale,
      y: (clientY - r.top - this.offY) / this.scale,
    };
  }

  /**
   * Rectangle du champ en pixels CSS, dans le repère du canvas.
   *
   * Le multijoueur pose ses plaques dans les gouttières laissées par le
   * letterbox. Sans cette mesure, il devrait la deviner, et une plaque finirait
   * par recouvrir une cible cliquable.
   */
  fieldRect(): { x: number; y: number; w: number; h: number } {
    return { x: this.offX, y: this.offY, w: FIELD_W * this.scale, h: FIELD_H * this.scale };
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
      p.vy += 520 * dt;
      p.vx *= 0.965;
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
   * Cadre de temps — repère CSS (cssW × cssH).
   *
   * Quatre couches : liseré de sang par paliers, hachures d'urgence,
   * rail fixe, segment de temps restant. Le cadre ne subit pas la secousse
   * et son épaisseur est en pixels d'écran, pas en unités de champ.
   */
  private drawTimeFrame(ratio: number, now: number): void {
    const { ctx, cssW: W, cssH: H } = this;
    const stage = ratio < 0.5 ? 0 : ratio < 0.78 ? 1 : 2;
    let band = [0, 9, 16][stage]!;
    // Battement à deux temps. La période tombe de 1100 ms à 400 ms :
    // le cœur s'emballe, l'information reste la même.
    if (stage > 0 && !this.reduced) {
      const period = 1100 - ratio * 700;
      const p = ((((now % period) + period) % period) / period);
      const hit = (at: number): number => {
        const d = p - at;
        return d >= 0 && d < 0.12 ? 1 - d / 0.12 : 0;
      };
      band += Math.max(hit(0), hit(0.18)) * (stage === 2 ? 5 : 2);
    }

    ctx.save();
    ctx.lineCap = "butt";

    if (band > 0) {
      ctx.fillStyle = stage === 1 ? "#5E1526" : "#8E1226";
      ctx.fillRect(0, 0, W, band);
      ctx.fillRect(0, H - band, W, band);
      ctx.fillRect(0, band, band, H - band * 2);
      ctx.fillRect(W - band, band, band, H - band * 2);

      if (stage === 2) {
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.rect(band, band, W - band * 2, H - band * 2);
        ctx.clip("evenodd");
        ctx.strokeStyle = "#B01732";
        ctx.lineWidth = 3;
        const span = W + H;
        for (let i = -H; i < span; i += 14) {
          ctx.beginPath();
          ctx.moveTo(i, H);
          ctx.lineTo(i + H, 0);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
    ctx.save();
    ctx.lineCap = "butt";

    const inset = 2;
    const w = W - inset * 2;
    const h = H - inset * 2;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 4;
    ctx.strokeRect(inset, inset, w, h);

    const per = (w + h) * 2;
    const left = Math.max(0, 1 - ratio) * per;
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 4;
    ctx.beginPath();

    // parcours depuis le haut-centre, symétrique : les deux extrémités
    // se rejoignent en bas, le rétrécissement est donc lisible des deux côtés
    let rest = left / 2;
    const seg = (fromX: number, fromY: number, toX: number, toY: number): void => {
      if (rest <= 0) return;
      const len = Math.hypot(toX - fromX, toY - fromY);
      const k = Math.min(1, rest / len);
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(fromX + (toX - fromX) * k, fromY + (toY - fromY) * k);
      rest -= len;
    };
    const midX = inset + w / 2;
    // moitié droite
    seg(midX, inset, inset + w, inset);
    seg(inset + w, inset, inset + w, inset + h);
    seg(inset + w, inset + h, midX, inset + h);
    rest = left / 2;
    // moitié gauche
    seg(midX, inset, inset, inset);
    seg(inset, inset, inset, inset + h);
    seg(inset, inset + h, midX, inset + h);
    ctx.stroke();
    ctx.restore();
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
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.92, y + r * 0.72);
      ctx.lineTo(x - r * 0.92, y + r * 0.72);
      ctx.closePath();
    }
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
    const idxs = want.kind === "click" ? [want.idx] : want.kind === "sequence" ? want.idxs : [];
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
      ctx.moveTo(e.x - e.r * 0.95, e.y + e.r * 0.95);
      ctx.lineTo(e.x + e.r * 0.95, e.y - e.r * 0.95);
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
    const { ctx } = this;
    ctx.fillStyle = SOL;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);

    // Un point tous les 50 : assez dense pour donner une texture, assez espacé
    // pour ne jamais concurrencer une pièce. 220 points, un seul chemin.
    ctx.fillStyle = SOL_TRAME;
    const pas = 50;
    for (let x = pas; x < FIELD_W; x += pas) {
      for (let y = pas; y < FIELD_H; y += pas) {
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
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
    const s = this.scale * this.dpr;
    ctx.setTransform(
      s, 0, 0, s,
      (this.offX + ox * this.scale) * this.dpr,
      (this.offY + oy * this.scale) * this.dpr,
    );

    // Le terrain d'abord, toujours : il reste posé entre deux manches, ce qui
    // évite qu'un interlude ne fasse disparaître l'aire de jeu.
    this.drawField();

    if (rule?.zone) this.drawZones(rule.zone);

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
      const birth =
        this.reduced || now - this.bornAt >= 120
          ? 1
          : 0.62 + (0.38 * Math.max(0, now - this.bornAt)) / 120;
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
      for (const e of round.ents) {
        let scale = birth;
        if (breathes) {
          // ±1,5 %, période ~2,6 s ; phase déterministe (e.phase).
          scale *= 1 + 0.015 * Math.sin((now / 1000) * ((Math.PI * 2) / 2.6) + e.phase);
        }
        const r = e.r * scale;

        ctx.save();
        ctx.translate(0, e.r * 0.14);
        ctx.fillStyle = OMBRE;
        this.path(e, r);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = HEX[e.color];
        this.path(e, r);
        ctx.fill();

        // Second canal : la trame se pose SUR la teinte, elle ne la remplace
        // pas. Même chemin, donc elle épouse la forme sans découpe.
        if (this.daltonien) {
          const trame = this.trame(e.color);
          if (trame) {
            ctx.fillStyle = trame;
            this.path(e, r);
            ctx.fill();
          }
        }

        ctx.strokeStyle = ARETE;
        ctx.lineWidth = 2;
        this.path(e, r);
        ctx.stroke();

        const need = needs?.get(e.idx);
        if (need && need >= 2) {
          drawNeedBadge(
            ctx,
            e.x + e.r * 0.62,
            e.y - e.r * 0.72,
            need,
            charges?.get(e.idx)?.n ?? 0,
          );
        }
      }
      if (reveal) this.drawReveal(round, now);
    }

    this.stepParticles(dt);
    this.drawParticles();

    if (this.pulse) {
      const k = (now - this.pulse.t) / 220;
      if (k >= 1) {
        this.pulse = null;
      } else {
        ctx.strokeStyle = `rgba(233,233,237,${0.55 * (1 - k)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(this.pulse.x, this.pulse.y, 12 + k * 46, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (ratio !== undefined) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawTimeFrame(ratio, now);
    }

    if (now < this.veilUntil) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const k = (this.veilUntil - now) / 220;
      ctx.fillStyle = `rgba(145,132,217,${0.28 * k})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
  }
}
