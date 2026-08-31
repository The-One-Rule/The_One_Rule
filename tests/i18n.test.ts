/**
 * @vitest-environment jsdom
 *
 * L'accueil parle deux langues. Le jeu n'en parle qu'une.
 *
 * Un `textContent` sur `#btnSolo` ou `#btnMulti` détruirait la faille
 * (voir `cartes.test.ts`). Ce fichier tient les deux : la peinture
 * change les bons nœuds, et les boutons gardent leurs trois `<span>`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  appliqueLangue,
  estLang,
  etatSolo,
  libelleCompte,
  TEXTES,
  CHAINES,
} from "../src/i18n";

beforeAll(() => {
  const html = readFileSync("index.html", "utf8");
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
});

describe("sélecteur de langue", () => {
  it("vit sur l'accueil, pas ailleurs", () => {
    const home = document.getElementById("home");
    const lang = document.getElementById("lang");
    expect(home, "#home absent").not.toBeNull();
    expect(lang, "#lang absent").not.toBeNull();
    expect(home!.contains(lang!)).toBe(true);
    expect(document.getElementById("btnLangFr")?.textContent).toBe("FR");
    expect(document.getElementById("btnLangEn")?.textContent).toBe("EN");
  });

  it("les deux boutons sont de vrais boutons, donc le clavier marche", () => {
    for (const id of ["btnLangFr", "btnLangEn"]) {
      const el = document.getElementById(id);
      expect(el?.tagName).toBe("BUTTON");
    }
  });
});

describe("appliqueLangue", () => {
  it("l'anglais change l'accroche et l'attribut lang, pas la structure de la faille", () => {
    const soloAvant = document.getElementById("btnSolo")!.querySelectorAll("span").length;
    appliqueLangue(document, "en");
    expect(document.documentElement.lang).toBe("en");
    expect(document.getElementById("ledeHome")!.innerHTML).toContain("unique rule");
    expect(document.getElementById("failleSoloDesc")!.textContent).toBe(TEXTES.en.soloDesc);
    expect(document.getElementById("failleMultiDesc")!.textContent).toBe(TEXTES.en.multiDesc);
    expect(document.getElementById("btnTopReglages")!.textContent).toBe("SETTINGS");
    expect(document.getElementById("btnLangEn")!.getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("btnLangFr")!.getAttribute("aria-pressed")).toBe("false");
    expect(document.getElementById("btnSolo")!.querySelectorAll("span").length).toBe(soloAvant);
    expect(document.getElementById("soloEtat")).not.toBeNull();
  });

  it("le français restaure le texte d'origine", () => {
    appliqueLangue(document, "fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(document.getElementById("ledeHome")!.innerHTML).toContain("règle unique");
    expect(document.getElementById("btnTopReglages")!.textContent).toBe("RÉGLAGES");
    expect(document.getElementById("btnLangFr")!.classList.contains("is-on")).toBe(true);
  });
});

describe("libellés dérivés", () => {
  it("n'accepte que fr et en", () => {
    expect(estLang("fr")).toBe(true);
    expect(estLang("en")).toBe(true);
    expect(estLang("de")).toBe(false);
    expect(estLang("")).toBe(false);
  });

  it("l'état SOLO compose run et série sans toucher au nom de la règle", () => {
    const fr = etatSolo("fr", {
      played: false,
      score: 0,
      ruleName: "LE SANG",
      streak: 3,
    });
    expect(fr).toContain("LE SANG");
    expect(fr).toContain("SÉRIE 3");
    const en = etatSolo("en", {
      played: true,
      score: 12,
      ruleName: "LE SANG",
      streak: 0,
    });
    expect(en).toBe("DAILY RUN DONE · 12");
  });

  it("le compte anonyme et le compte sans pseudo ont chacun leur mot", () => {
    expect(libelleCompte("fr", null)).toBe("COMPTE");
    expect(libelleCompte("en", null)).toBe("ACCOUNT");
    expect(libelleCompte("fr", "")).toBe("MON COMPTE");
    expect(libelleCompte("en", "PIERRE")).toBe("PIERRE");
  });
});

/* ------------------------------------------------------------------ *
 * Les chaînes statiques portées par `data-i18n`
 * ------------------------------------------------------------------ */

describe("les chaînes statiques", () => {
  const html = readFileSync("index.html", "utf8");

  /** Les clés réellement posées dans le document. */
  const clesPosees = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]!);

  it("il y en a beaucoup — sinon les tests suivants sont vides", () => {
    // Garde-fou : si l'extraction cassait, tout passerait pour rien.
    expect(new Set(clesPosees).size).toBeGreaterThan(40);
  });

  it("chaque clé posée existe dans LES DEUX langues", () => {
    /*
     * C'est le défaut le plus sournois de ce chantier : une clé absente ne
     * casse rien. `appliqueLangue` laisse le texte en place, donc on obtient
     * du français au milieu de l'anglais — et personne ne le voit avant
     * qu'un joueur anglophone ne le signale.
     */
    const manquantes: string[] = [];
    for (const cle of new Set(clesPosees)) {
      if (CHAINES.fr[cle] === undefined) manquantes.push(`fr : ${cle}`);
      if (CHAINES.en[cle] === undefined) manquantes.push(`en : ${cle}`);
    }
    expect(manquantes, `clés sans traduction :\n${manquantes.join("\n")}`).toEqual([]);
  });

  it("aucune traduction ne dort dans le dictionnaire sans être posée", () => {
    // L'inverse : une clé traduite que plus rien n'utilise est du poids mort
    // qui finit par mentir sur ce que le site sait dire.
    const posees = new Set(clesPosees);
    const orphelines = Object.keys(CHAINES.fr).filter((c) => !posees.has(c));
    expect(orphelines, `traduites mais jamais posées :\n${orphelines.join("\n")}`).toEqual([]);
  });

  it("le français du dictionnaire est CELUI du document", () => {
    /*
     * Sans ça, repasser en français afficherait autre chose que le texte
     * d'origine — une dérive invisible tant qu'on ne rebascule pas.
     */
    const ecarts: string[] = [];
    for (const m of html.matchAll(
      /<(p|span|h1|h2|h3|button|label|li)\b[^>]*data-i18n="([^"]+)"[^>]*>([^<>]*)<\/\1>/g,
    )) {
      const [, , cle, texte] = m;
      const attendu = CHAINES.fr[cle!];
      if (attendu !== undefined && texte!.trim() !== attendu) {
        ecarts.push(`${cle} : document « ${texte!.trim()} » ≠ dictionnaire « ${attendu} »`);
      }
    }
    expect(ecarts, `le document et le dictionnaire divergent :\n${ecarts.join("\n")}`).toEqual([]);
  });

  it("aucune clé n'est posée sur un bouton à plusieurs `span`", () => {
    /*
     * `appliqueLangue` écrit dans le `textContent` de l'élément qui porte
     * l'attribut. Sur une carte ou une face de la faille — des `<button>` à
     * trois ou quatre `<span>` — cela DÉTRUIRAIT la structure, exactement le
     * piège que `tests/cartes.test.ts` refuse par ailleurs. L'attribut doit
     * vivre sur la feuille, jamais sur le conteneur.
     */
    document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
    const fautes: string[] = [];
    for (const el of Array.from(document.querySelectorAll("[data-i18n]"))) {
      if (el.children.length > 0) {
        fautes.push(`${el.tagName}#${el.id || "?"} porte ${el.children.length} enfant(s)`);
      }
    }
    expect(fautes, `data-i18n sur un conteneur :\n${fautes.join("\n")}`).toEqual([]);
  });

  it("les éléments réécrits par le JS n'en portent pas", () => {
    /*
     * Un `data-i18n` sur le verdict, l'état du salon ou `SON : ON` ferait
     * EFFACER une valeur vivante au changement de langue : le joueur verrait
     * son verdict disparaître en cliquant sur EN. Ceux-là se traduisent là où
     * ils sont écrits, pas ici.
     */
    const interdits = [
      "verdict",
      "multiLobbyTitle",
      "multiEndTitle",
      "settingsWho",
      "btnSound",
      "btnMusic",
      "btnMotifs",
      "btnMetrics",
      "soloEtat",
      "cardMultiState",
      "fMidLabel",
    ];
    const fautes = interdits.filter((id) =>
      new RegExp(`id="${id}"[^>]*data-i18n|data-i18n="[^"]*"[^>]*id="${id}"`).test(html),
    );
    expect(fautes, `data-i18n sur un élément écrit à l'exécution : ${fautes.join(", ")}`).toEqual(
      [],
    );
  });
});
