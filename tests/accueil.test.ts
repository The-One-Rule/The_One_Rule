/**
 * @vitest-environment jsdom
 *
 * L'ACCUEIL — LE MODE ATTRACT ET LES CINQ PORTES.
 *
 * ⚠️ **CE FICHIER REMPLACE `tests/faille.test.ts`.** La faille — l'objet fendu
 * SOLO / MULTI qui tenait lieu de vitrine — a cédé la place au MODE ATTRACT
 * (« LE CHAMP, PLEIN ÉCRAN : LE FOND EST LE JEU ») et à la rangée de
 * PROFONDEUR. Les trois régressions que l'ancien fichier surveillait valent
 * TOUJOURS, à l'identique, et c'est pourquoi il n'est pas simplement supprimé :
 *
 * 1. **Un calque de décor qui capte les clics.** Le champ couvre toute la
 *    surface (`inset: 0`) : lui rendre ses `pointer-events`, c'est rendre PLAY
 *    et les cinq cartes inertes d'un coup. Le symptôme serait « les boutons de
 *    l'accueil ne marchent plus », et la cause ne serait pas dans les boutons.
 * 2. **Une animation qui touche autre chose que `transform` et `opacity`.** Une
 *    seule propriété qui déclenche la mise en page, et c'est un recalcul
 *    permanent sous une partie qui tourne.
 * 3. **Un décor neutralisé en mouvement réduit sans état de repos.** Le piège
 *    est déjà payé ici : couper une animation sans rendre son opacité fait
 *    DISPARAÎTRE l'élément au lieu de le figer.
 *
 * jsdom ne calcule pas de cascade : on lit la feuille et on croise les fichiers.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

let css = "";

beforeAll(() => {
  const html = readFileSync("index.html", "utf8");
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
  css = readFileSync("src/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
});

/**
 * Le corps d'une règle CSS, at-rules aplaties comme dans `hidden.test.ts`.
 *
 * ⚠️ On découpe à la main plutôt qu'avec une expression construite : un
 * sélecteur porte des points, donc l'échapper demanderait une regex
 * d'échappement — et c'est exactement un endroit où une contre-oblique perdue
 * ne se voit pas. Chercher la chaîne, puis les accolades, ne peut pas se
 * tromper.
 */
function regle(selecteur: string): string {
  const plat = css.replace(/@[a-z-]+[^{]*\{/g, "");
  let i = 0;
  for (;;) {
    i = plat.indexOf(selecteur, i);
    if (i < 0) return "";
    const avant = plat[i - 1] ?? "\n";
    const ouvre = plat.indexOf("{", i);
    const entre = ouvre < 0 ? "x" : plat.slice(i + selecteur.length, ouvre);
    /*
     * Le sélecteur doit être ENTIER : ni la fin d'un autre (`.play` dans
     * `.display`), ni le début (`.attract` dans `.attract__cvs`).
     */
    if (/[\s,{}]/.test(avant) && /^[\s,]*$/.test(entre) && ouvre > 0) {
      const ferme = plat.indexOf("}", ouvre);
      return ferme < 0 ? "" : plat.slice(ouvre + 1, ferme);
    }
    i += selecteur.length;
  }
}

describe("le champ plein écran", () => {
  it("existe, et il est marqué décoratif", () => {
    const boite = document.getElementById("attract")!;
    expect(boite, "le calque du mode attract a disparu").not.toBeNull();
    expect(
      boite.getAttribute("aria-hidden"),
      "tout ce qu'il montre est dit ailleurs en texte : il doit être aria-hidden",
    ).toBe("true");
    expect(document.getElementById("attractCvs")).not.toBeNull();
  });

  it("⚠️ IL NE VOLE AUCUN CLIC", () => {
    /*
     * La régression la plus coûteuse, et la plus muette : le champ couvre
     * toute la page. S'il redevenait cliquable, PLAY et les cinq cartes
     * cesseraient de répondre et rien dans leur code n'aurait changé.
     */
    expect(regle(".attract"), "`.attract` doit rester traversant").toMatch(
      /pointer-events:\s*none/,
    );
  });

  it("il est HORS FLUX : il ne prend pas un pixel à la mise en page", () => {
    expect(regle(".attract")).toMatch(/position:\s*absolute/);
  });
});

describe("les cinq portes de la profondeur", () => {
  const IDS = ["profJour", "profClassement", "btnMulti", "profEscalade", "profCartes"];

  it("les cinq existent", () => {
    for (const id of IDS) {
      expect(document.getElementById(id), `${id} manque`).not.toBeNull();
    }
  });

  it("⚠️ CHACUNE EST UN BOUTON À PLUSIEURS SPANS", () => {
    /*
     * Le piège que `tests/cartes.test.ts` documente, payé plusieurs fois : un
     * `textContent` posé sur le bouton détruirait ses trois `<span>`. C'est
     * pour ça que `data-i18n` est sur les feuilles et jamais sur le bouton.
     */
    for (const id of IDS) {
      const b = document.getElementById(id)!;
      expect(b.querySelectorAll("span").length, `${id} n'a pas ses trois spans`).toBe(3);
      expect(b.hasAttribute("data-i18n"), `${id} porte data-i18n sur le BOUTON`).toBe(false);
    }
  });

  it("⚠️ AUCUNE NE PORTE L'ACCENT — PLAY reste la réponse par défaut", () => {
    /*
     * Elles viennent APRÈS le centre de gravité et n'ont pas le droit de lui
     * disputer l'attention. Deux accents sur un écran ne désignent plus rien —
     * c'est la même règle que « celle qui te résiste » sur le carnet.
     */
    for (const id of IDS) {
      const b = document.getElementById(id)!;
      expect(b.className, `${id} a pris un accent`).not.toMatch(/btn--primary|btn--launch/);
    }
    expect(document.getElementById("btnPlay")!.className).toMatch(/\bplay\b/);
  });
});

describe("ce qui bouge sur l'accueil", () => {
  it("n'anime que transform et opacity", () => {
    /*
     * Une partie tourne derrière la page : tout ce qui déclencherait une mise
     * en page à chaque image se paierait sur les images du jeu.
     */
    const suspectes = /(?:^|[;{\s])(width|height|top|left|right|bottom|margin|padding)\s*:/;
    for (const sel of [".attract", ".attract__cvs", ".attract__chaleur", ".play"]) {
      const corps = regle(sel);
      if (/animation|transition/.test(corps)) {
        expect(suspectes.test(corps), `${sel} anime une propriété de mise en page`).toBe(false);
      }
    }
  });

  it("⚠️ LE MOUVEMENT RÉDUIT FIGE, IL N'EFFACE PAS", () => {
    /*
     * Le piège déjà payé : neutraliser une animation sans rendre son opacité
     * fait disparaître l'élément. Le bloc `prefers-reduced-motion` de
     * l'accueil ne doit donc jamais poser `display: none` ni `opacity: 0` sur
     * le champ — une scène figée dit encore ce qu'est le jeu.
     */
    const i = css.indexOf("prefers-reduced-motion");
    expect(i, "le bloc de mouvement réduit a disparu").toBeGreaterThan(0);
    const blocs = css.slice(i).split("@media");
    const premier = blocs[0] ?? "";
    expect(premier, "le champ est effacé au lieu d'être figé").not.toMatch(
      /\.attract[^{]*\{[^}]*display:\s*none/,
    );
  });

  it("aucun prefers-reduced-motion ne pose display:none sur .attract", () => {
    /*
     * Le test du dessus ne lit que le PREMIER bloc. Le dépôt en a plusieurs.
     * Celui de l'accueil est en fin de feuille : un `display: none` y
     * reviendrait sans que le premier le voie.
     */
    const re = /@media[^{]*prefers-reduced-motion[^{]*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      const debut = m.index + m[0].length;
      let profondeur = 1;
      let i = debut;
      for (; i < css.length; i++) {
        if (css[i] === "{") profondeur++;
        else if (css[i] === "}") {
          profondeur--;
          if (profondeur === 0) break;
        }
      }
      const corps = css.slice(debut, i);
      expect(corps, "reduced-motion efface .attract").not.toMatch(
        /\.attract[^{]*\{[^}]*display:\s*none/,
      );
    }
  });
});

describe("identité Nocturne — pas de lampe sur l'accueil", () => {
  function trancheAccueil(): string {
    const debut = css.indexOf(".attract {");
    const fin = css.indexOf(".micro {");
    expect(debut, "le bloc .attract a disparu").toBeGreaterThan(0);
    expect(fin, "le bloc .micro qui borne l'accueil a disparu").toBeGreaterThan(debut);
    return css.slice(debut, fin);
  }

  it("PLAY garde l'ombre décalée et perd le bloom", () => {
    const corps = regle(".play");
    expect(corps, "le cadre 8 px a disparu").toMatch(/border:\s*8px\s+solid\s+var\(--signal\)/);
    expect(corps, "le fond 12 % a disparu — on doit voir le champ à travers").toMatch(
      /--signal\)\s*12%/,
    );
    expect(corps, "l'ombre décalée 12 px est l'identité").toMatch(/12px\s+12px\s+0\s+0/);
    expect(corps, "le bloom 70 px est une lampe").not.toMatch(/0\s+0\s+70px/);
    const hover = regle(".play:hover");
    expect(hover, "le hover doit grandir le décalage, pas le glow").toMatch(
      /18px\s+18px\s+0\s+0/,
    );
    expect(hover).not.toMatch(/0\s+0\s+110px/);
  });

  it("la chaleur est un liseré, pas un voile plein cadre", () => {
    const corps = regle(".attract__chaleur");
    expect(corps).toMatch(/inset\s+0\s+0\s+0\s+[12]px/);
    expect(corps).not.toMatch(/110px/);
    expect(regle(".attract__chaleur.est-chaud")).not.toMatch(/110px/);
  });

  it("la vignette est de l'encre, sans poche --signal", () => {
    const corps = regle(".attract::after");
    expect(corps, "la vignette a disparu — PLAY doit rester lisible sur le champ").toMatch(
      /radial-gradient/,
    );
    expect(corps).toMatch(/var\(--ink\)/);
    expect(corps).not.toMatch(/--signal/);
  });

  it("consigne et méta : ombre dure, pas un glow de 34 px", () => {
    const instr = regle(".home__instr");
    expect(instr).toMatch(/text-shadow:\s*2px\s+2px\s+0/);
    expect(instr).not.toMatch(/34px/);
    expect(regle(".home__demo")).toMatch(/text-shadow:\s*2px\s+2px\s+0/);
    expect(trancheAccueil()).not.toMatch(/0\s+0\s+34px/);
  });

  it("la tranche accueil ne réintroduit pas les blooms coupés", () => {
    const t = trancheAccueil();
    expect(t).not.toMatch(/0\s+0\s+70px/);
    expect(t).not.toMatch(/0\s+0\s+110px/);
    expect(t).not.toMatch(/inset\s+0\s+0\s+110px/);
  });
});
