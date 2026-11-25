import type { Entity, Want } from "../types.js";

/**
 * Les entités qu'un `want` demande de toucher. Vide pour les attentes clavier.
 *
 * Sorti de `rules/index.ts` pour que LA RANCUNE (`rancune.ts`) le partage sans
 * import circulaire : `index.ts` lit `rancune.ts` pour résoudre ses
 * identifiants, et un cycle entre deux modules évalués au chargement est
 * exactement le genre de panne qui ne se voit qu'en production.
 */
export function targets(want: Want, ents: Entity[]): Entity[] {
  switch (want.kind) {
    case "click":
      return ents[want.idx] ? [ents[want.idx]!] : [];
    case "sequence":
      return want.idxs.map((i) => ents[i]).filter((e): e is Entity => !!e);
    case "hold":
      return ents[want.idx] ? [ents[want.idx]!] : [];
    /*
     * GLISSER touche DEUX pièces : celle qu'on prend et celle où l'on pose.
     * Une règle qui interdit l'une ou l'autre fait de la manche un piège —
     * poser le carré sur du rouge, c'est toucher du rouge.
     */
    case "drag":
      return [ents[want.from], ents[want.to]].filter((e): e is Entity => !!e);
    default:
      return [];
  }
}
