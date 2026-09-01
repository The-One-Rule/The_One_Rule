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
  DYNAMIQUES,
  langueDuNavigateur,
} from "../src/i18n";

beforeAll(() => {
  const html = readFileSync("index.html", "utf8");
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
});

describe("sélecteur de langue", () => {
  it("vit dans la barre haute, avec les autres réglages", () => {
    /*
     * Il était sur l'accueil, où il concurrençait la seule action de l'écran.
     * La langue est un réglage : sa place est auprès de COMPTE et RÉGLAGES.
     */
    const topbar = document.getElementById("topbar");
    const lang = document.getElementById("lang");
    expect(topbar, "#topbar absent").not.toBeNull();
    expect(lang, "#lang absent").not.toBeNull();
    expect(topbar!.contains(lang!)).toBe(true);
    expect(document.getElementById("home")!.contains(lang!)).toBe(false);
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

  it("l'ANGLAIS du dictionnaire est CELUI du document", () => {
    /*
     * Le HTML servi est en anglais : c'est ce que voient les robots et ce
     * qu'un inconnu lit pendant la première image, avant que le JS n'applique
     * sa langue. Le laisser en français faisait voir un éclair de français à
     * un anglophone — et Chrome lui proposait alors de traduire, ce qui rend
     * le jeu injouable.
     *
     * Le dictionnaire et le document doivent donc dire la même chose EN
     * ANGLAIS, sinon la première image ment sur ce qui suit.
     */
    const ecarts: string[] = [];
    for (const m of html.matchAll(
      /<(p|span|h1|h2|h3|button|label|li)\b[^>]*data-i18n="([^"]+)"[^>]*>([^<>]*)<\/\1>/g,
    )) {
      const [, , cle, texte] = m;
      const attendu = CHAINES.en[cle!];
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

/* ------------------------------------------------------------------ *
 * La traduction ne doit rien coûter EN PARTIE
 * ------------------------------------------------------------------ */

describe("la langue ne contraint pas le joueur en partie", () => {
  const main = readFileSync("src/main.ts", "utf8");
  const multi = readFileSync("src/multi.ts", "utf8");
  const ACCENTS = /[\u00C0-\u00FF]/;

  /**
   * Les littéraux ACCENTUÉS d'une source, commentaires retirés.
   *
   * Les commentaires de ce dépôt sont en français par convention : les
   * garder ferait un compte inexploitable.
   *
   * ⚠️ SA LIMITE, mesurée plutôt que supposée : il ne voit que l'ACCENT.
   * Une chaîne française sans accent — « VIES RESTANTES », « MODE SOLO » —
   * lui échappe entièrement ; éprouvé en en réintroduisant une, le test
   * passait. Il n'existe pas de moyen fiable de reconnaître du français en
   * ASCII pur, donc ce filet attrape la majorité des cas et pas tous. Le
   * savoir vaut mieux que de le croire complet.
   */
  const litteraux = (src: string): string[] => {
    const propre = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    return [...propre.matchAll(/"([^"\\]*)"|`([^`]*)`/g)]
      .map((m) => m[1] ?? m[2] ?? "")
      .filter((v) => ACCENTS.test(v));
  };

  it("`appliqueLangue` n'est jamais appelée depuis la boucle", () => {
    /*
     * Elle parcourt 73 nœuds du document. Dans `loop()`, à soixante images
     * par seconde, ce serait 4 400 lectures de DOM par seconde sur l'écran
     * dont la lecture se juge en 200 ms.
     *
     * On vérifie qu'elle ne figure QUE dans `renderHome` : on isole le corps
     * de `loop()` et on exige qu'elle n'y soit pas, plutôt que de compter les
     * occurrences — un comptage casserait au premier appel légitime ajouté
     * ailleurs.
     */
    const debut = main.indexOf("function loop(now: number): void {");
    expect(debut, "loop() introuvable — l'extraction a cassé").toBeGreaterThan(-1);
    let profondeur = 0;
    let fin = debut;
    for (let i = main.indexOf("{", debut); i < main.length; i++) {
      if (main[i] === "{") profondeur++;
      else if (main[i] === "}") {
        profondeur--;
        if (profondeur === 0) {
          fin = i;
          break;
        }
      }
    }
    const corpsLoop = main.slice(debut, fin);
    expect(corpsLoop.length, "corps de loop() vide").toBeGreaterThan(200);
    expect(
      corpsLoop.includes("appliqueLangue"),
      "appliqueLangue dans la boucle de jeu : elle parcourt tout le document",
    ).toBe(false);
  });

  it("les deux langues portent EXACTEMENT les mêmes clés", () => {
    /*
     * Une clé présente d'un seul côté rendrait `undefined` — donc un libellé
     * vide en pleine partie, là où il porte une information de survie (les
     * vies, le mode, l'échauffement). Le typage l'empêche déjà ; ce test
     * tient le cas où quelqu'un élargirait le type.
     */
    const fr = Object.keys(DYNAMIQUES.fr).sort();
    const en = Object.keys(DYNAMIQUES.en).sort();
    expect(fr.length, "dictionnaire dynamique vide").toBeGreaterThan(30);
    expect(en).toEqual(fr);
  });

  it("aucune valeur n'est vide dans l'une des deux langues", () => {
    const vides: string[] = [];
    for (const lang of ["fr", "en"] as const) {
      for (const [cle, val] of Object.entries(DYNAMIQUES[lang])) {
        if (typeof val === "string" && val.trim() === "") vides.push(`${lang}.${cle}`);
      }
    }
    expect(vides, `libellés vides : ${vides.join(", ")}`).toEqual([]);
  });

  it("le HUD de partie ne contient PLUS aucun français en dur", () => {
    /*
     * Strict, et tenable : `render/hud.ts` est le bandeau et le pied lus
     * PENDANT la partie. Il est entièrement passé par `t()`, donc zéro est
     * la bonne borne — et toute régression y saute aux yeux.
     */
    const hud = readFileSync("src/render/hud.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const fautes = litteraux(hud);
    expect(fautes, `français en dur dans le HUD : ${fautes.join(" · ")}`).toEqual([]);
  });

  it("le français en dur de main.ts et multi.ts ne REMONTE pas", () => {
    /*
     * UN CLIQUET, PAS UNE VICTOIRE.
     *
     * La traduction n'est pas finie : il reste du français littéral dans ces
     * deux fichiers — écran de compte, quêtes, aides du salon, motifs de
     * chute. Prétendre le contraire par un test qui passe serait pire que ne
     * rien tester.
     *
     * Ce test fige donc le nombre ACTUEL et refuse qu'il augmente. Quand on
     * en traduit, on baisse la borne — et le jour où elle atteint zéro, on
     * remplace ce cliquet par la règle stricte ci-dessus.
     *
     * ⚠️ Le premier garde-fou écrit ici était CREUX : il ne regardait que les
     * lignes contenant `textContent =`. Or l'essentiel passe par des aides —
     * `hud.setMeta`, `setJoinErr`, `ligneCompte`. Éprouvé en réintroduisant
     * une chaîne française : le test passait quand même. C'est la raison
     * d'être de la vérification « casse le correctif, relance ».
     */
    // Les bornes sont celles que CE test mesure, pas celles d'un script
    // extérieur : les deux comptaient différemment les guillemets échappés,
    // et c'est le compte d'ici qui fait foi puisque c'est lui qui garde.
    const PLAFOND = { "main.ts": 23, "multi.ts": 34 };
    const comptes: Record<string, number> = {};
    for (const [nom, src] of [
      ["main.ts", main],
      ["multi.ts", multi],
    ] as const) {
      comptes[nom] = litteraux(src).length;
    }
    const remontees = Object.entries(comptes).filter(
      ([nom, n]) => n > PLAFOND[nom as keyof typeof PLAFOND],
    );
    expect(
      remontees,
      `du français en dur est REVENU : ${JSON.stringify(comptes)} contre ${JSON.stringify(PLAFOND)}`,
    ).toEqual([]);
    // Et si quelqu'un traduit, qu'il baisse la borne plutôt que de la laisser
    // mentir sur ce qui reste à faire.
    const trop = Object.entries(comptes).filter(
      ([nom, n]) => n < PLAFOND[nom as keyof typeof PLAFOND],
    );
    expect(trop, `bornes à baisser dans ce test : ${JSON.stringify(comptes)}`).toEqual([]);
  });

  it("la consigne du moteur reste française, et c'est documenté", () => {
    /*
     * LA LIMITE ASSUMÉE, écrite noir sur blanc pour qu'elle ne passe pas
     * pour un oubli.
     *
     * Le texte de la consigne est fabriqué DANS `gen()`, au cœur du moteur
     * pur, et c'est le texte le plus lu du jeu — un par manche, sous deux
     * secondes. Le traduire demande de rendre la consigne STRUCTURÉE (un
     * verbe et des opérandes) au lieu d'une phrase, puis de la composer à
     * l'affichage. C'est une refonte du cœur, pas une traduction.
     *
     * Ce que ce test garantit en attendant : `calculeVersion` ne hache ni
     * les libellés ni les textes — seulement `id`, `minLevel`, `weight` et
     * `touch`. Le jour où on traduira, `VERSION_CONTENU` ne bougera donc pas
     * et aucun historique ne deviendra incomparable.
     */
    const version = readFileSync("src/engine/version.ts", "utf8");
    expect(version).toContain("minLevel");
    expect(version).toContain("weight");
    expect(/\.label|\.text\b|\.name\b/.test(version.split("fnv1a")[0] ?? "")).toBe(false);
  });
});

describe("la langue suit le navigateur a la premiere visite", () => {
  it("un navigateur francais donne le francais", () => {
    for (const l of [["fr"], ["fr-FR"], ["FR-ca"], ["fr-BE", "en"]]) {
      expect(langueDuNavigateur(l), l.join(",")).toBe("fr");
    }
  });

  it("tout le reste donne l'anglais", () => {
    /*
     * L'anglais est le repli, pas le francais : on ne sait dire que deux
     * langues, et un hispanophone lit mieux l'anglais que le francais. C'est
     * aussi ce qui evite qu'il laisse Chrome traduire — ce qui rend le jeu
     * injouable, la consigne mutant a chaque manche.
     */
    for (const l of [["en"], ["en-GB"], ["es-ES"], ["de"], ["ja", "en"], ["pt-BR"]]) {
      expect(langueDuNavigateur(l), l.join(",")).toBe("en");
    }
  });

  it("l'absence de navigateur ne casse rien", () => {
    // `navigator` manque en test et au rendu serveur. Le defaut est le
    // francais, langue du projet.
    expect(langueDuNavigateur(undefined)).toBe("fr");
    expect(langueDuNavigateur([])).toBe("fr");
    expect(langueDuNavigateur([undefined as unknown as string])).toBe("fr");
  });
});
