/**
 * LE CONTRAT D'UN STYLE DE PIÈCES — carte du kanban « Catalogue de styles : en
 * faire plus avec des créateurs ». Le guide est `docs/STYLES.md`.
 *
 * Un style ne change QUE le dessin. Ce fichier le vérifie pour TOUS les styles
 * du catalogue, donc pour celui qu'un créateur ajoutera demain, sans qu'on ait
 * à y penser :
 *
 *   1. le dessin ne sort jamais de la zone cliquable (`HIT` × rayon) : une
 *      pièce dessinée plus grosse que ce qu'on peut toucher fait cliquer à
 *      côté — « le jeu triche » (§6 n°3) ;
 *   2. la TEINTE de la pièce est celle du calibrage daltonien, au chiffre près
 *      (`TEINTES`) : c'est le mot de la consigne ;
 *   3. la TRAME du mode MOTIFS est posée par-dessus : sinon acheter un style
 *      retirerait le second canal des daltoniens ;
 *   4. chaque style a son prix, son terrain, son nom et sa phrase, en
 *      français et en anglais.
 *
 * jsdom n'a pas de canvas : un faux contexte ENREGISTRE les tracés, avec les
 * transformations (le terrain debout tourne les pièces).
 */
import { describe, expect, it } from "vitest";
import { SKINS, type SkinId } from "../src/game/boutique";
import { dessinePiece, TEINTES, TERRAINS } from "../src/render/skins";
import { COLOR_IDS, SHAPE_IDS } from "../src/engine/types";
import type { ColorId, ShapeId } from "../src/engine/types";
import type { Orientation } from "../src/render/orientation";
import { PARCOURS } from "../src/i18n-parcours";

/**
 * LES DEUX BORNES, en multiple du rayon logique — mesurées sur le style
 * MAISON, pas posées en théorie.
 *
 * Le clic est jugé sur un CERCLE de 1,22 × le rayon (`HIT`, render/scene.ts).
 * Or un carré a des coins : le corps du carré maison va jusqu'à 1,24 r, et
 * c'est vrai de TOUS les styles depuis toujours (≈ 0,3 px au téléphone). La
 * borne du CORPS est donc 1,3 r — elle admet ce coin et le tremblé de CRAIE
 * (1,28 r au sommet du triangle), et refuse une pièce dessinée plus grosse
 * qu'on ne peut la toucher. L'OMBRE portée du style maison descend à 1,43 r :
 * tout le dessin, décor compris, reste sous 1,5 r.
 */
const CORPS_MAX = 1.3;
const DESSIN_MAX = 1.5;

/** Ce style de peinture porte-t-il la teinte — directement, ou par un dégradé ? */
const porteTeinte = (style: unknown, teinte: string): boolean => {
  const t = teinte.toLowerCase();
  if (typeof style === "string") return style.toLowerCase().startsWith(t);
  const arrets = (style as { arrets?: string[] } | null)?.arrets;
  return Array.isArray(arrets) && arrets.some((c) => c.toLowerCase().startsWith(t));
};

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** Un contexte qui retient l'étendue de ce qui est rempli ou tracé, et les couleurs. */
function enregistreur() {
  let m: M = [1, 0, 0, 1, 0, 0];
  const pile: M[] = [];
  let chemin: [number, number, number][] = []; // x, y, rayon d'un arc (0 pour un point)
  /*
   * La DÉCOUPE (`ctx.clip()`) : CRAIE hachure un carré de 2,4 r et le découpe
   * à la forme. Sans elle, l'enregistreur voyait des traits à 2,6 r qui ne
   * sont jamais peints — un faux défaut. On retient le centre et le rayon
   * englobant de la découpe ; ce qui la dépasse est ramené dessus.
   */
  let decoupe: { x: number; y: number; r: number } | null = null;
  const pileDecoupe: ({ x: number; y: number; r: number } | null)[] = [];
  const etat = { fillStyle: "" as unknown, strokeStyle: "" as unknown, lineWidth: 1, globalAlpha: 1 };
  const pileEtat: (typeof etat)[] = [];
  const peint: { x: number; y: number; marge: number; style: unknown }[] = [];
  const styles: unknown[] = [];
  const echelle = () => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const pt = (x: number, y: number, r = 0) => {
    chemin.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5], r * echelle()]);
  };
  const vide = (marge: number, style: unknown) => {
    if (etat.globalAlpha <= 0) return;
    styles.push(style);
    for (const [x0, y0, r] of chemin) {
      let x = x0;
      let y = y0;
      let mg = marge + r;
      if (decoupe) {
        // Ramené sur le cercle englobant de la découpe : rien n'est peint au-delà.
        const d = Math.hypot(x - decoupe.x, y - decoupe.y) + mg;
        if (d > decoupe.r) {
          const k = Math.max(0, decoupe.r - mg) / Math.max(1e-9, Math.hypot(x - decoupe.x, y - decoupe.y));
          x = decoupe.x + (x - decoupe.x) * Math.min(1, k);
          y = decoupe.y + (y - decoupe.y) * Math.min(1, k);
          mg = Math.min(mg, decoupe.r);
        }
      }
      peint.push({ x, y, marge: mg, style });
    }
  };
  const ctx: Record<string, unknown> = {
    save: () => {
      pile.push(m);
      pileEtat.push({ ...etat });
      pileDecoupe.push(decoupe);
    },
    restore: () => {
      m = pile.pop() ?? m;
      Object.assign(etat, pileEtat.pop() ?? {});
      decoupe = pileDecoupe.pop() ?? null;
    },
    translate: (x: number, y: number) => (m = mul(m, [1, 0, 0, 1, x, y])),
    scale: (a: number, b: number) => (m = mul(m, [a, 0, 0, b, 0, 0])),
    rotate: (t: number) => (m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0])),
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => (m = mul(m, [a, b, c, d, e, f])),
    setTransform: (a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) => (m = [a, b, c, d, e, f]),
    resetTransform: () => (m = [1, 0, 0, 1, 0, 0]),
    beginPath: () => (chemin = []),
    closePath: () => {},
    moveTo: (x: number, y: number) => pt(x, y),
    lineTo: (x: number, y: number) => pt(x, y),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => (pt(cx, cy), pt(x, y)),
    bezierCurveTo: (a: number, b: number, c: number, d: number, x: number, y: number) => (pt(a, b), pt(c, d), pt(x, y)),
    arcTo: (a: number, b: number, x: number, y: number) => (pt(a, b), pt(x, y)),
    arc: (x: number, y: number, r: number) => pt(x, y, r),
    ellipse: (x: number, y: number, rx: number, ry: number) => pt(x, y, Math.max(rx, ry)),
    rect: (x: number, y: number, w: number, h: number) => (pt(x, y), pt(x + w, y), pt(x, y + h), pt(x + w, y + h)),
    roundRect: (x: number, y: number, w: number, h: number) => (pt(x, y), pt(x + w, y), pt(x, y + h), pt(x + w, y + h)),
    fill: () => vide(0, etat.fillStyle),
    stroke: () => vide((etat.lineWidth / 2) * echelle(), etat.strokeStyle),
    fillRect: (x: number, y: number, w: number, h: number) => {
      chemin = [];
      ctx.rect(x, y, w, h);
      vide(0, etat.fillStyle);
    },
    strokeRect: (x: number, y: number, w: number, h: number) => {
      chemin = [];
      ctx.rect(x, y, w, h);
      vide((etat.lineWidth / 2) * echelle(), etat.strokeStyle);
    },
    clip: () => {
      if (!chemin.length) return;
      const cx = chemin.reduce((a, p) => a + p[0], 0) / chemin.length;
      const cy = chemin.reduce((a, p) => a + p[1], 0) / chemin.length;
      const r = Math.max(...chemin.map(([x, y, rr]) => Math.hypot(x - cx, y - cy) + rr));
      decoupe = { x: cx, y: cy, r };
    },
    fillText: () => {},
    strokeText: () => {},
    setLineDash: () => {},
    // Un dégradé retient ses arrêts : BONBON peint sa teinte par un dégradé.
    createLinearGradient: () => {
      const g = { arrets: [] as string[], addColorStop: (_k: number, c: string) => g.arrets.push(String(c)) };
      return g;
    },
    createRadialGradient: () => {
      const g = { arrets: [] as string[], addColorStop: (_k: number, c: string) => g.arrets.push(String(c)) };
      return g;
    },
    createPattern: () => ({}),
    measureText: () => ({ width: 10 }),
  };
  const proxy = new Proxy(ctx, {
    get: (o, k: string) => (k in etat ? etat[k as keyof typeof etat] : k in o ? o[k] : () => {}),
    set: (o, k: string, v) => {
      if (k in etat) (etat as Record<string, unknown>)[k] = v;
      else o[k] = v;
      return true;
    },
  });
  return { ctx: proxy as unknown as CanvasRenderingContext2D, peint, styles };
}

const R = 42;
const X = 500;
const Y = 210;

function dessine(skin: SkinId, shape: ShapeId, color: ColorId, o: Orientation, trame: object | null = null) {
  const e = enregistreur();
  dessinePiece(e.ctx, { shape, color, x: X, y: Y, r: R, r0: R, phase: 1.3 }, skin, o, trame as CanvasPattern | null, 1234);
  return e;
}

describe("le contrat d'un style de pièces", () => {
  for (const { id: skin } of SKINS) {
    describe(skin, () => {
      it("son corps coloré ne dépasse pas ce qu'on peut toucher, son décor reste près", () => {
        let corps = 0;
        let tout = 0;
        for (const o of ["paysage", "portrait"] as Orientation[])
          for (const shape of SHAPE_IDS)
            for (const color of COLOR_IDS) {
              const { peint } = dessine(skin, shape, color, o);
              expect(peint.length).toBeGreaterThan(0);
              for (const p of peint) {
                const d = (Math.hypot(p.x - X, p.y - Y) + p.marge) / R;
                tout = Math.max(tout, d);
                if (porteTeinte(p.style, TEINTES[color])) corps = Math.max(corps, d);
              }
            }
        expect(corps, `${skin} : corps coloré jusqu'à ${corps.toFixed(2)} r`).toBeLessThanOrEqual(CORPS_MAX);
        expect(corps, `${skin} : aucun corps coloré mesuré`).toBeGreaterThan(0.8);
        expect(tout, `${skin} : dessin jusqu'à ${tout.toFixed(2)} r`).toBeLessThanOrEqual(DESSIN_MAX);
      });

      it("peint chaque pièce dans SA teinte calibrée", () => {
        for (const color of COLOR_IDS) {
          const { styles } = dessine(skin, "carre", color, "paysage");
          const utilise = styles.some((s) => porteTeinte(s, TEINTES[color]));
          expect(utilise, `${skin} n'utilise pas ${TEINTES[color]} pour ${color}`).toBe(true);
        }
      });

      it("pose la trame du mode MOTIFS par-dessus", () => {
        const trame = { trame: true };
        const { styles } = dessine(skin, "rond", "azur", "paysage", trame);
        expect(styles).toContain(trame);
      });

      it("a un terrain, un nom et une phrase dans les deux langues", () => {
        expect(TERRAINS[skin]).toBeDefined();
        for (const l of ["fr", "en"] as const) {
          expect(PARCOURS[l].skinNom[skin], `${skin} sans nom en ${l}`).toBeTruthy();
          expect(PARCOURS[l].skinDesc[skin], `${skin} sans phrase en ${l}`).toBeTruthy();
        }
      });
    });
  }

  it("les prix montent, et le premier est offert", () => {
    expect(SKINS[0]!.prix).toBe(0);
    for (let i = 1; i < SKINS.length; i++) expect(SKINS[i]!.prix).toBeGreaterThan(SKINS[i - 1]!.prix);
  });
});
