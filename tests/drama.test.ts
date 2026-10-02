/**
 * LE PANNEAU DES TEMPS FORTS ne doit jamais devenir un pavé.
 *
 * `style.css` (l'identité nocturne) habille chaque variante du panneau de
 * dégradés d'équerres ; `theme.css` (STICKER) remplace ce fond par un aplat.
 * Une variante oubliée par le thème garde ses dégradés — sans leur taille,
 * posée ailleurs —, et ils couvrent le panneau entier : DUEL est devenu un
 * pavé prune sur son propre texte (vu en salon réel).
 *
 * DENTS : retirer `.drama.drama--duel .drama__panel` de la règle du thème
 * fait tomber le test.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const style = sansCommentaires(readFileSync("src/style.css", "utf8"));
const theme = sansCommentaires(readFileSync("src/theme.css", "utf8"));

describe("le panneau des temps forts", () => {
  it("chaque variante qui peint un fond est neutralisée par le thème", () => {
    const variantes = new Set<string>();
    const re = /\.drama--([\w-]+)\s+\.drama__panel\s*\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(style))) if (/background/.test(m[2]!)) variantes.add(m[1]!);
    expect(variantes.size, "l'extraction ne trouve rien : le test ne prouve plus rien").toBeGreaterThan(0);
    // La règle du thème qui pose `background-image: none`.
    const regles = [...theme.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((x) => /background-image:\s*none/.test(x[2]!));
    const couvertes = regles.map((x) => x[1]!).join(",");
    for (const v of variantes) {
      expect(couvertes, `.drama--${v} .drama__panel n'est pas neutralisée par le thème`).toContain(`.drama--${v} .drama__panel`);
    }
  });
});
