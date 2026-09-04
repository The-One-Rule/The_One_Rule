/**
 * LES CARTES DE RÈGLES.
 *
 * Le carnet est devenu une collection : une règle, une carte. Ce fichier tient
 * deux choses qui se cassent en silence.
 *
 * La PRIORITÉ d'abord — verrouillée, découverte, maîtrisée — parce qu'une
 * priorité écrite en `if` successifs se lit juste et se comporte faux, et que
 * celle-ci décide de ce qu'un joueur voit de sa propre progression.
 *
 * Et surtout la GRAMMAIRE de l'emblème. L'illustration est engendrée depuis les
 * primitives du jeu plutôt que dessinée : ajouter une règle sans lui donner
 * d'emblème rendrait une carte muette, et personne ne s'en apercevrait avant
 * qu'un joueur ne la débloque.
 */
import { describe, expect, it } from "vitest";
import { ONE_RULES } from "../src/engine/rules";
import { EMBLEMES_REGLES, emblemeDe, emblemeSvg, etatCarte } from "../src/render/carte";


describe("l'état d'une carte", () => {
  /*
   * Cinq états, dérivés du nombre de cases franchies sur les six de l'échelle.
   *
   * ⚠️ Ce n'est PAS `estMaitrisee`, et les deux ne doivent pas se confondre :
   * `estMaitrisee` décide de ce que l'entraînement ciblé déverrouille et de ce
   * que le compteur du carnet additionne, donc la durcir ferait reculer tous
   * les compteurs de tous les joueurs. L'état de carte ne décide de RIEN — il
   * ne fait que dire où l'on en est, et c'est pour ça qu'il peut être plus fin.
   */
  it("aucune case : verrouillée", () => {
    expect(etatCarte(0)).toBe("verrouillee");
    expect(etatCarte(-1), "une valeur impossible ne doit pas ouvrir la carte").toBe(
      "verrouillee",
    );
  });

  it("une seule case : découverte", () => {
    expect(etatCarte(1)).toBe("decouverte");
  });

  it("de deux à quatre : en cours", () => {
    for (const n of [2, 3, 4]) expect(etatCarte(n), `${n} cases`).toBe("encours");
  });

  it("cinq : maîtrisée · six : parfaite", () => {
    expect(etatCarte(5)).toBe("maitrisee");
    expect(etatCarte(6)).toBe("parfaite");
  });

  it("l'échelle entière tombe dans un état, et un seul", () => {
    // Aucun trou : le jour où l'échelle passerait à sept cases, ce test dirait
    // que le dernier cran n'a pas d'état.
    const vus = [0, 1, 2, 3, 4, 5, 6].map(etatCarte);
    expect(new Set(vus).size).toBe(5);
    expect(vus[6]).toBe("parfaite");
  });
});

describe("les emblèmes", () => {
  it("CHAQUE règle du catalogue en a un — aucun repli", () => {
    /*
     * `emblemeDe` retombe sur l'initiale du nom pour ne jamais rendre une carte
     * vide. C'est un filet, pas une intention : une règle qui l'utilise est une
     * règle qu'on a oublié d'illustrer.
     */
    const sans = ONE_RULES.filter((r) => !EMBLEMES_REGLES[r.id]).map((r) => r.id);
    expect(sans, `règles sans emblème : ${sans.join(", ")}`).toEqual([]);
  });

  it("aucun emblème n'est muet", () => {
    // Ni pièce, ni bande, ni signe : la carte serait un cadre vide, ce qui se
    // lit comme un chargement raté et non comme une règle.
    for (const r of ONE_RULES) {
      const e = emblemeDe(r);
      const dit = e.pieces.length > 0 || (e.bandes?.length ?? 0) > 0 || !!e.signe;
      expect(dit, `${r.id} ne montre rien`).toBe(true);
    }
  });

  it("tout tient dans le cadre 0-100", () => {
    /*
     * Le `viewBox` fait 100×100 et rien ne le découpe : une pièce qui dépasse
     * sortirait de la carte au lieu d'être rognée. On vérifie l'ENVELOPPE,
     * rayon compris, parce que c'est le bord de la forme qui déborde, pas son
     * centre.
     */
    const hors: string[] = [];
    for (const r of ONE_RULES) {
      const e = emblemeDe(r);
      for (const p of e.pieces) {
        /*
         * L'enveloppe se calcule forme par forme, comme le dessin la trace :
         * une marge unique et généreuse signalerait des débordements qui
         * n'existent pas, et le test cesserait d'être cru.
         *
         *   · un rond ou un carré tient dans son rayon ;
         *   · un triangle monte à 1,15 r, descend à 0,805 r, et s'étale à
         *     1,1 r de chaque côté ;
         *   · une pièce BARRÉE porte en plus sa croix, qui va à 1,35 r.
         */
        const h = p.r * 1.15;
        const larg = p.shape === "triangle" ? p.r * 1.1 : p.r;
        const haut = p.shape === "triangle" ? h : p.r;
        const bas = p.shape === "triangle" ? h * 0.7 : p.r;
        const croix = p.interdit ? p.r * 1.35 : 0;
        const g = Math.max(larg, croix);
        const t = Math.max(haut, croix);
        const b2 = Math.max(bas, croix);
        if (p.x - g < 0 || p.x + g > 100 || p.y - t < 0 || p.y + b2 > 100) {
          hors.push(`${r.id} (${p.shape} ${p.x},${p.y} r=${p.r})`);
        }
      }
      for (const b of e.bandes ?? []) {
        if (b.x < 0 || b.y < 0 || b.x + b.w > 100 || b.y + b.h > 100) hors.push(`${r.id} (bande)`);
      }
    }
    expect(hors, `déborde du cadre : ${hors.join(" · ")}`).toEqual([]);
  });

  it("une règle qui INTERDIT le montre — la grammaire est constante", () => {
    /*
     * LE POINT DE LISIBILITÉ. Ce qui est barré, hachuré ou signé est ce que la
     * règle défend. Un joueur qui a vu deux cartes doit savoir lire la
     * troisième sans qu'on la lui explique.
     *
     * Les DÉFORMATIONS — LE JUMEAU, L'ACCÉLÉRATION, LE MENTEUR — n'interdisent
     * rien : elles n'ont donc ni croix ni bande, et c'est juste. C'est aussi ce
     * qui les distingue à l'œil des neuf règles qui piègent.
     */
    const muettes: string[] = [];
    for (const r of ONE_RULES.filter((x) => x.traps)) {
      const e = emblemeDe(r);
      const defend =
        e.pieces.some((p) => p.interdit) || (e.bandes?.length ?? 0) > 0 || !!e.signe;
      if (!defend) muettes.push(r.id);
    }
    expect(muettes, `règles piégeantes sans marque d'interdit : ${muettes.join(", ")}`).toEqual([]);
  });
});

describe("le dessin", () => {
  it("rend un SVG bien formé, avec le cadre attendu", () => {
    const svg = emblemeSvg(emblemeDe(ONE_RULES[0]!));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('viewBox="0 0 100 100"');
    // Le grain anguleux du reste du jeu, pas un lissage.
    expect(svg).toContain('shape-rendering="crispEdges"');
    // Décoratif : le nom et l'état de la carte portent déjà l'information.
    expect(svg).toContain('aria-hidden="true"');
  });

  it("⚠️ une carte VERROUILLÉE ne laisse rien fuiter dans le DOM", () => {
    /*
     * Le carnet n'explique que les règles rencontrées, pour ne pas brûler la
     * surprise du run du jour (décision n°7). Masquer visuellement ne suffit
     * pas : si l'emblème restait dans le HTML sous un voile, il suffirait
     * d'ouvrir l'inspecteur pour lire tout le catalogue.
     *
     * La censure REMPLACE donc la scène, elle ne la couvre pas.
     */
    for (const r of ONE_RULES) {
      const svg = emblemeSvg(emblemeDe(r), { verrouille: true });
      const corps = svg.replace(/<defs>[\s\S]*?<\/defs>/, "");
      for (const teinte of ["#F74058", "#237EF6", "#40F7C0", "#F5B214"]) {
        expect(corps, `${r.id} laisse fuiter ${teinte}`).not.toContain(teinte);
      }
      expect(corps, `${r.id} laisse fuiter une forme`).not.toContain("<circle");
      expect(corps, `${r.id} laisse fuiter un signe`).not.toContain("<text");
    }
  });

  it("une carte découverte montre bien sa scène", () => {
    // L'inverse du test précédent : sans lui, tout masquer passerait.
    const svg = emblemeSvg(emblemeDe(ONE_RULES.find((r) => r.id === "sang")!));
    expect(svg).toContain("#F74058");
  });
});
