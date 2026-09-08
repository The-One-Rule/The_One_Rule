/**
 * Curseurs coop — calque DOM hors flux.
 *
 * Interpolation et traînée : uniquement `transform` et `opacity`.
 * Couleur = glyphe, jamais une ColorId jouable.
 */

import { FIELD_H, FIELD_W } from "../engine/types";
import { glyphHex } from "../net/glyph";
import type { Glyph } from "../../shared/protocol";

export interface CurseurAffiche {
  x: number;
  y: number;
  trail: { x: number; y: number }[];
  lastTrail: number;
}

const TRACE = 3;
const LERP = 0.28;

export function paintCursors(opts: {
  root: HTMLElement;
  cibles: ReadonlyMap<string, { x: number; y: number }>;
  affiches: Map<string, CurseurAffiche>;
  joueurs: readonly { id: string; name: string; glyph: Glyph }[];
  myId: string;
  now: number;
  rect: { x: number; y: number; w: number; h: number };
  reduced: boolean;
}): void {
  const { root, cibles, affiches, joueurs, myId, now, rect, reduced } = opts;
  const slots = root.querySelectorAll<HTMLElement>(".curseur");
  const ids: string[] = [];
  for (const id of cibles.keys()) {
    if (id === myId) continue;
    ids.push(id);
    if (ids.length >= slots.length) break;
  }

  for (const id of [...affiches.keys()]) {
    if (!cibles.has(id) || id === myId) affiches.delete(id);
  }

  for (let s = 0; s < slots.length; s++) {
    const el = slots[s]!;
    const id = ids[s];
    if (!id) {
      el.classList.remove("is-on");
      continue;
    }
    const cible = cibles.get(id);
    if (!cible) {
      el.classList.remove("is-on");
      continue;
    }
    let cur = affiches.get(id);
    if (!cur) {
      cur = { x: cible.x, y: cible.y, trail: [], lastTrail: now };
      affiches.set(id, cur);
    }
    if (reduced) {
      cur.x = cible.x;
      cur.y = cible.y;
      cur.trail = [];
    } else {
      cur.x += (cible.x - cur.x) * LERP;
      cur.y += (cible.y - cur.y) * LERP;
      if (now - cur.lastTrail > 40) {
        cur.trail.push({ x: cur.x, y: cur.y });
        if (cur.trail.length > TRACE) cur.trail.shift();
        cur.lastTrail = now;
      }
    }

    const joueur = joueurs.find((p) => p.id === id);
    const nom = el.querySelector(".curseur__nom");
    if (nom) nom.textContent = (joueur?.name ?? "").slice(0, 14).toUpperCase();
    el.style.setProperty("--cur", joueur ? glyphHex(joueur.glyph) : "#EFEAE0");
    el.style.transform = `translate(${versCss(cur.x, rect, "x")}px, ${versCss(cur.y, rect, "y")}px)`;
    el.classList.add("is-on");

    const traces = el.querySelectorAll<HTMLElement>(".curseur__trace");
    const ox = versCss(cur.x, rect, "x");
    const oy = versCss(cur.y, rect, "y");
    for (let t = 0; t < traces.length; t++) {
      const tr = traces[t]!;
      const p = cur.trail[cur.trail.length - 1 - t];
      if (!p || reduced) {
        tr.style.opacity = "0";
        continue;
      }
      tr.style.opacity = String(0.28 - t * 0.08);
      const dx = versCss(p.x, rect, "x") - ox;
      const dy = versCss(p.y, rect, "y") - oy;
      tr.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
    }
  }
}

function versCss(
  field: number,
  rect: { x: number; y: number; w: number; h: number },
  axe: "x" | "y",
): number {
  if (axe === "x") return rect.x + (field / FIELD_W) * rect.w;
  return rect.y + (field / FIELD_H) * rect.h;
}
