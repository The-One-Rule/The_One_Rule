/**
 * LA PREUVE DE LA MORT — maquette 4.3 et 4.4 (lot C).
 *
 * « Une phrase en gros, puis la preuve : terrain miniature avec la pièce
 * fautive entourée. » La carte de relance disait POURQUOI on est mort ; elle
 * montre maintenant OÙ, et ce qu'il fallait faire.
 *
 * PUR : `preuveDeMort` décide, `miniatureSvg` rend une chaîne. Rien ne touche
 * au terrain réel (n°10) : c'est un dessin à part, dans la carte.
 *
 * ⚠️ Le piège n'est révélé qu'APRÈS la mort (n°5) — c'est exactement ici.
 */
import type { ColorId, Entity, Round } from "../engine/types";
import { FIELD_H, FIELD_W } from "../engine/types";

export type Fallait = "rien" | "plusVite" | "sansTaRegle" | "consigne";

export interface Preuve {
  /** L'index de la pièce touchée, ou `null` (vide, temps, clavier). */
  touchee: number | null;
  /** Le point touché dans le vide, quand il n'y a pas de pièce. */
  vide: { x: number; y: number } | null;
  fallait: Fallait;
}

/**
 * Ce qu'on montre, d'après la manche fatale, le dernier appui et le motif.
 *
 * `appui` n'est retenu que s'il est RÉCENT (`frais`) : un appui d'il y a trois
 * manches entourerait une pièce qui n'a rien à voir.
 */
export function preuveDeMort(
  round: Pick<Round, "ents" | "trap">,
  appui: { x: number; y: number; frais: boolean } | null,
  motif: { temps: boolean; regle: boolean },
): Preuve {
  let touchee: number | null = null;
  let vide: { x: number; y: number } | null = null;
  if (appui?.frais && !motif.temps) {
    let best = Infinity;
    round.ents.forEach((e, i) => {
      const d = Math.hypot(appui.x - e.x, appui.y - e.y);
      // La même tolérance que la souris (`HIT` 1,22), un peu plus large pour
      // le doigt : on cherche la pièce VISÉE, pas à rejuger le clic.
      if (d <= e.r * 1.6 + 12 && d < best) {
        best = d;
        touchee = i;
      }
    });
    if (touchee === null) vide = { x: appui.x, y: appui.y };
  }
  const fallait: Fallait = round.trap ? "rien" : motif.temps ? "plusVite" : motif.regle ? "sansTaRegle" : "consigne";
  return { touchee, vide, fallait };
}

/**
 * Comment le terrain est vu À L'ÉCRAN : ses dimensions, le passage d'un point
 * du champ à l'écran, et l'échelle. Par défaut, le champ tel quel (couché).
 *
 * ⚠️ Au téléphone le terrain est DEBOUT : une miniature couchée ne
 * ressemblait pas à ce que le joueur venait de voir (vu à 390 × 844). Le
 * passage vient donc de `render/orientation.ts`, par la scène (n°16).
 */
export interface VueMiniature {
  w: number;
  h: number;
  ou: (x: number, y: number) => { x: number; y: number };
  k: number;
}

export const VUE_CHAMP: VueMiniature = { w: FIELD_W, h: FIELD_H, ou: (x, y) => ({ x, y }), k: 1 };

/** Le terrain en miniature : mêmes formes, mêmes teintes, mêmes positions. */
export function miniatureSvg(
  ents: readonly Pick<Entity, "x" | "y" | "r" | "shape" | "color">[],
  preuve: Pick<Preuve, "touchee" | "vide">,
  teinte: (c: ColorId) => string,
  vue: VueMiniature = VUE_CHAMP,
): string {
  const n = (v: number) => Math.round(v * 10) / 10;
  const trait = `stroke="currentColor" stroke-width="${n(7 * vue.k)}" stroke-linejoin="round"`;
  const formes = ents
    .map((e) => {
      const f = teinte(e.color);
      const { x, y } = vue.ou(e.x, e.y);
      const r = e.r * vue.k;
      if (e.shape === "carre") {
        const c = r * 0.88;
        return `<rect x="${n(x - c)}" y="${n(y - c)}" width="${n(c * 2)}" height="${n(c * 2)}" rx="${n(c * 0.22)}" fill="${f}" ${trait}/>`;
      }
      if (e.shape === "triangle") {
        return `<path d="M${n(x)} ${n(y - r)} L${n(x + r * 1.05)} ${n(y + r * 0.8)} L${n(x - r * 1.05)} ${n(y + r * 0.8)} Z" fill="${f}" ${trait}/>`;
      }
      return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${f}" ${trait}/>`;
    })
    .join("");
  let marque = "";
  const epais = n(12 * vue.k);
  const t = preuve.touchee !== null ? ents[preuve.touchee] : null;
  if (t) {
    const { x, y } = vue.ou(t.x, t.y);
    marque = `<circle cx="${n(x)}" cy="${n(y)}" r="${n(t.r * vue.k * 1.55)}" fill="none" stroke="currentColor" stroke-width="${epais}"/>`;
  } else if (preuve.vide) {
    const { x, y } = vue.ou(preuve.vide.x, preuve.vide.y);
    const d = 26 * vue.k;
    marque = `<path d="M${n(x - d)} ${n(y - d)} L${n(x + d)} ${n(y + d)} M${n(x + d)} ${n(y - d)} L${n(x - d)} ${n(y + d)}" stroke="currentColor" stroke-width="${epais}" stroke-linecap="round"/>`;
  }
  return `<svg viewBox="0 0 ${n(vue.w)} ${n(vue.h)}" preserveAspectRatio="xMidYMid meet">${formes}${marque}</svg>`;
}
