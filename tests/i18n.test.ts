/**
 * @vitest-environment jsdom
 *
 * Le site parle deux langues, et le jeu aussi désormais.
 *
 * Un `textContent` sur `#btnSolo` ou `#btnMulti` détruirait la faille
 * (voir `cartes.test.ts`). Ce fichier tient les deux : la peinture
 * change les bons nœuds, et les boutons gardent leurs trois `<span>`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  appliqueLangue,
  estLang,
  etatSolo,
  CHAINES,
  DYNAMIQUES,
  langueDuNavigateur,
} from "../src/i18n";
import { pageHtml } from "./helpers/page";

beforeAll(() => {
  const html = pageHtml();
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
});

/** Tous les fichiers TypeScript sous un dossier, récursivement. */
function filsDe(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? filsDe(`${dir}/${e.name}`)
      : e.name.endsWith(".ts")
        ? [`${dir}/${e.name}`]
        : [],
  );
}

describe("sélecteur de langue", () => {
  it("vit DANS les réglages, et nulle part ailleurs", () => {
    /*
     * Troisième et dernière adresse. Il a été sur l'accueil — où il
     * concurrençait la seule action de l'écran — puis dans la barre haute, où
     * il restait un widget permanent à deux boutons. La langue est un
     * RÉGLAGE : elle vit avec les autres, dans sa propre section.
     *
     * Ce qui rend le déplacement supportable : depuis que la langue suit le
     * navigateur à la première visite, un anglophone n'atterrit plus en
     * français. Le sélecteur n'est plus un dépannage, c'est une préférence.
     *
     * ⚠️ Et il n'y en a QU'UN. Deux commandes pour un seul réglage, c'est la
     * faute du « filtre PLUS la grille » : deux façons de répondre à la même
     * question.
     */
    const reglages = document.getElementById("reglages");
    const lang = document.getElementById("lang");
    expect(reglages, "#reglages absent").not.toBeNull();
    expect(lang, "#lang absent").not.toBeNull();
    expect(reglages!.contains(lang!)).toBe(true);
    expect(document.getElementById("home")!.contains(lang!)).toBe(false);
    expect(document.getElementById("topbar")!.contains(lang!)).toBe(false);
    expect(document.getElementById("btnLangFr")?.textContent).toBe("FRANÇAIS");
    expect(document.getElementById("btnLangEn")?.textContent).toBe("ENGLISH");
  });

  it("les deux boutons sont de vrais boutons, donc le clavier marche", () => {
    for (const id of ["btnLangFr", "btnLangEn"]) {
      const el = document.getElementById(id);
      expect(el?.tagName).toBe("BUTTON");
    }
  });
});

describe("appliqueLangue", () => {
  it("l'anglais change l'accroche et l'attribut lang, pas la structure des cartes", () => {
    /*
     * ⚠️ CE TEST PARLAIT DE LA FAILLE — l'objet fendu SOLO / MULTI qui tenait
     * lieu de vitrine. Elle a été remplacée par le MODE ATTRACT (« le fond EST
     * le jeu ») et par la rangée de PROFONDEUR, cinq cartes qui nomment les
     * cinq modes au lieu d'en cacher trois derrière « SOLO ».
     *
     * Ce qu'il vérifiait vaut toujours, et c'est pour ça qu'il n'est pas
     * supprimé : une carte est un bouton à PLUSIEURS `<span>`, et un
     * `textContent` posé sur le bouton les détruirait. C'est le piège que
     * `tests/cartes.test.ts` documente, payé plusieurs fois dans ce dépôt.
     */
    const carteAvant = document.getElementById("profJour")!.querySelectorAll("span").length;
    appliqueLangue(document, "en");
    expect(document.documentElement.lang).toBe("en");
    // L'accroche de l'arrivée (maquette 1a) : une phrase, traduite.
    expect(document.getElementById("ledeHome")!.textContent).toBe("Sometimes, obeying is the mistake.");
    expect(document.getElementById("btnTopReglages")!.textContent).toBe("SETTINGS");
    expect(document.getElementById("btnLangEn")!.getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("btnLangFr")!.getAttribute("aria-pressed")).toBe("false");
    expect(
      document.getElementById("profJour")!.querySelectorAll("span").length,
      "une carte de la profondeur a perdu ses spans : un textContent l'a écrasée",
    ).toBe(carteAvant);
    expect(document.getElementById("profJourNote")!.textContent).toBe(
      "SAME RULE · 3 TRIES · ONCE A DAY",
    );
  });

  it("le français restaure le texte d'origine", () => {
    appliqueLangue(document, "fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(document.getElementById("ledeHome")!.textContent).toBe("Parfois, obéir est l'erreur.");
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

});

/* ------------------------------------------------------------------ *
 * Les chaînes statiques portées par `data-i18n`
 * ------------------------------------------------------------------ */

describe("les chaînes statiques", () => {
  const html = pageHtml();

  /**
   * Le document est rendu par React (`renderToStaticMarkup`), qui écrit
   * l'apostrophe `&#x27;`. Le navigateur la lit comme `'` : on compare donc
   * le texte DÉCODÉ, celui que voit le joueur, pas l'octet du balisage.
   */
  const decode = (x: string): string =>
    x
      .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");

  /**
   * Les clés réellement posées dans le document.
   *
   * LES TROIS FORMES, pas seulement le texte. Un `placeholder` et un
   * `aria-label` ne sont pas du contenu : `textContent` ne les atteint pas, et
   * un balayage du DOM qui cherche du français ne les voit pas non plus. Trois
   * champs sont restés français pendant toute la traduction pour cette seule
   * raison — dont le premier que remplit quelqu'un arrivé par un lien.
   */
  const clesPosees = [
    ...[...html.matchAll(/data-i18n="([^"]+)"/g)],
    ...[...html.matchAll(/data-i18n-ph="([^"]+)"/g)],
    ...[...html.matchAll(/data-i18n-aria="([^"]+)"/g)],
  ].map((m) => m[1]!);

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
      if (attendu !== undefined && decode(texte!.trim()) !== attendu) {
        ecarts.push(`${cle} : document « ${decode(texte!.trim())} » ≠ dictionnaire « ${attendu} »`);
      }
    }
    expect(ecarts, `le document et le dictionnaire divergent :\n${ecarts.join("\n")}`).toEqual([]);
  });

  it("l'ANGLAIS des ATTRIBUTS est celui du dictionnaire", () => {
    /*
     * Même doctrine que pour le texte, et le même piège : le document est
     * servi en anglais, donc un `placeholder="TON NOM"` reste français
     * jusqu'à ce que le JS passe — c'est-à-dire pendant la première image, et
     * indéfiniment si la clé est mal orthographiée. Un attribut faux ne casse
     * rien et ne se voit pas dans un balayage de texte.
     */
    const ecarts: string[] = [];
    for (const [attr, prop] of [
      ["data-i18n-ph", "placeholder"],
      ["data-i18n-aria", "aria-label"],
    ] as const) {
      const re = new RegExp(`<[^>]*${attr}="([^"]+)"[^>]*>`, "g");
      for (const m of html.matchAll(re)) {
        const cle = m[1]!;
        const brut = new RegExp(`${prop}="([^"]*)"`).exec(m[0])?.[1];
        const valeur = brut === undefined ? undefined : decode(brut);
        const attendu = CHAINES.en[cle];
        if (attendu !== undefined && valeur !== undefined && valeur !== attendu) {
          ecarts.push(`${cle} : document « ${valeur} » ≠ dictionnaire « ${attendu} »`);
        }
      }
    }
    expect(ecarts, `attributs divergents :\n${ecarts.join("\n")}`).toEqual([]);
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
  /*
   * Le bloc Latin-1 sans ses DEUX intrus : U+00D7 \u00AB \u00D7 \u00BB et U+00F7 \u00AB \u00F7 \u00BB sont
   * des signes math\u00E9matiques, pas des lettres accentu\u00E9es. Sans cette
   * exclusion, `\u00D73` \u2014 une s\u00E9rie affich\u00E9e sur une plaque \u2014 passait pour du
   * fran\u00E7ais en dur, et l'inventaire nomm\u00E9 ci-dessous serait faux d\u00E8s sa
   * premi\u00E8re ligne.
   */
  const ACCENTS = /[\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/;

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

  it("le français en dur de main.ts et multi.ts est NOMMÉ, pas compté", () => {
    /*
     * LE CLIQUET EST DEVENU UNE LISTE.
     *
     * Il figeait un NOMBRE — 23 et 34 — et refusait qu'il remonte. C'était le
     * bon outil tant qu'il restait des dizaines de chaînes : on ne nomme pas
     * cinquante oublis. Maintenant qu'il n'en reste que trois, un nombre serait
     * une régression : il laisserait passer une chaîne nouvelle dès qu'une
     * ancienne partirait, et surtout il ne dirait pas POURQUOI celles qui
     * restent restent.
     *
     * Chacune est donc écrite, avec sa raison. Toute autre fait tomber le test.
     *
     * ⚠️ Le premier garde-fou écrit ici était CREUX : il ne regardait que les
     * lignes contenant `textContent =`. Or l'essentiel passe par des aides —
     * `hud.setMeta`, `setJoinErr`, `ligneCompte`. Éprouvé en réintroduisant une
     * chaîne française : le test passait quand même.
     *
     * ⚠️ Et il ne voit que l'ACCENT : « VIES RESTANTES » lui échappe. C'est un
     * filet, pas une preuve.
     */
    const ADMIS: Record<string, string> = {
      // Le tri du tampon se fait sur le FRANÇAIS, parce que c'est le français
      // qui voyage sur le fil : le serveur envoie `verdict.reason` en clair et
      // la traduction n'a lieu qu'à l'affichage. Trier sur la phrase déjà
      // traduite ferait tomber tous les tampons anglais sur « MISSED ».
      "ÉCOUL": "clé de tri de stampForReason, sur le texte du fil",
      "RÈGLE": "clé de tri de stampForReason, sur le texte du fil",
      // Un JETON de protocole, pas du texte affiché : le serveur envoie
      // `detail: "déconnecté"` pour distinguer une coupure d'un salon inconnu.
      "déconnecté": "jeton de protocole envoyé par le serveur",
    };

    const restants: string[] = [];
    for (const [nom, src] of [
      ["main.ts", main],
      ["multi.ts", multi],
    ] as const) {
      for (const v of litteraux(src)) {
        if (ADMIS[v] === undefined) restants.push(`${nom} : « ${v} »`);
      }
    }
    expect(
      restants,
      `du français en dur est apparu :\n${restants.join("\n")}\n` +
        "Traduis-le, ou ajoute-le à ADMIS avec sa raison.",
    ).toEqual([]);
  });

  it("la liste des exceptions ne contient rien de mort", () => {
    // Une exception qui ne sert plus laisse une porte ouverte : le jour où la
    // chaîne revient pour une mauvaise raison, plus rien ne la signale.
    const trouves = new Set([...litteraux(main), ...litteraux(multi)]);
    // « CLIQUE LE CARRÉ BLEU » en est sortie avec les écrans d'explication de la
    // première arrivée : elle n'était que le secours de leur exemple.
    for (const v of ["ÉCOUL", "RÈGLE", "déconnecté"]) {
      expect(trouves.has(v), `exception morte à retirer : « ${v} »`).toBe(true);
    }
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

describe("les accords, qui ne se ressemblent pas d'une langue à l'autre", () => {
  /*
   * ⚠️ LE ZÉRO N'EST PAS AU MÊME NOMBRE DANS LES DEUX LANGUES.
   *
   * Le français met le singulier à 0 et à 1 (« 0 manche »), l'anglais le
   * pluriel à tout sauf 1 (« 0 rounds »). Écrire `n > 1` partout — le réflexe
   * quand on traduit une chaîne française — donne donc « 0 ROUND » et
   * « 0 LIFE ».
   *
   * Trouvé en jouant : l'écran de fin d'un joueur éliminé à la première manche
   * affichait « 0 ROUND ». C'est le cas le plus FRÉQUENT de cet écran, et
   * personne ne l'aurait vu en relisant les tables.
   */
  const dyn = (lang: "fr" | "en") => DYNAMIQUES[lang];

  it("le français garde le singulier à zéro", () => {
    const d = dyn("fr");
    expect(d.manchesN(0)).toBe("0 MANCHE");
    expect(d.manchesN(1)).toBe("1 MANCHE");
    expect(d.manchesN(2)).toBe("2 MANCHES");
    expect(d.siegeEnMatch(1, 1)).toBe("1 VIE · 1 MANCHES");
    expect(d.finJours(1)).toBe("1 JOUR");
    expect(d.finJours(3)).toBe("3 JOURS");
  });

  it("l'anglais met le pluriel à zéro", () => {
    const d = dyn("en");
    expect(d.manchesN(0)).toBe("0 ROUNDS");
    expect(d.manchesN(1)).toBe("1 ROUND");
    expect(d.manchesN(2)).toBe("2 ROUNDS");
    expect(d.siegeEnMatch(0, 0)).toBe("0 LIVES · 0 ROUNDS");
    expect(d.siegeEnMatch(1, 1)).toBe("1 LIFE · 1 ROUND");
    expect(d.finJours(0)).toBe("0 DAYS");
    expect(d.finJours(1)).toBe("1 DAY");
    expect(d.cptJours(0)).toBe("0 DAYS");
    expect(d.cptManches(0)).toBe("0 ROUNDS");
    expect(d.cptManches(1)).toBe("1 ROUND");
    expect(d.trainingRecord(1)).toBe("BEST · 1 ROUND");
    expect(d.dailyRevient(1)).toBe("1 ROUND · COME BACK TOMORROW");
  });

  it("aucune chaîne anglaise n'accorde en `n > 1`", () => {
    /*
     * Le filet, plutôt qu'une liste à tenir à jour : `n > 1` est TOUJOURS
     * faux en anglais, et c'est la faute qu'on refait à chaque nouvelle
     * chaîne, puisqu'on l'écrit en recopiant la ligne française juste
     * au-dessus. On lit donc la source de la table anglaise.
     */
    const src = readFileSync("src/i18n.ts", "utf8");
    const debut = src.indexOf("  en: {", src.indexOf("const DYN: Record<Lang, Dyn> = {"));
    expect(debut, "table anglaise introuvable — l'extraction a cassé").toBeGreaterThan(-1);
    const anglais = src.slice(debut);
    const fautes = [...anglais.matchAll(/^.*n > 1 \?.*$/gm)].map((m) => m[0].trim());
    expect(
      fautes,
      `accord français dans la table anglaise :\n${fautes.join("\n")}\n` +
        "En anglais, zéro prend le pluriel : `n === 1 ? \"\" : \"s\"`.",
    ).toEqual([]);
  });

  it("aucun texte du document n'est ORPHELIN", () => {
    /*
     * LA PANNE QUE CE TEST ATTRAPE, et elle est muette.
     *
     * `#multiLobbyCodeHint` portait « SAY IT OUT LOUD, OR SEND THE LINK » en
     * dur, sans `data-i18n`, et aucun code ne le réécrivait avant qu'on copie
     * le code. La ligne restait donc anglaise pour tout le monde, pour
     * toujours. Le filet à accents ne pouvait pas la voir : elle est en ASCII
     * pur — c'est la limite écrite au §12 du dépôt, et voici ce qui la couvre.
     *
     * Un texte du document est légitime à deux conditions, dont une suffit :
     * il porte un `data-i18n`, ou son identifiant apparaît dans les sources —
     * donc quelque chose l'écrit.
     */
    const html = pageHtml();
    const src = ["src", "shared"]
      .flatMap((d) => filsDe(d))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");

    const orphelins: string[] = [];
    const re = /<(p|span|h1|h2|h3|button|b|small)\b([^>]*)>([^<]{3,})<\/\1>/g;
    for (const m of html.matchAll(re)) {
      const attrs = m[2];
      const txt = m[3].trim();
      if (attrs.includes("data-i18n")) continue;
      // Trois lettres d'affilée : un chiffre, un « · » ou un sigle ne se
      // traduisent pas, et n'ont donc rien à faire dans ce filet.
      if (!/[A-Za-z]{3}/.test(txt)) continue;
      const id = /id="([^"]+)"/.exec(attrs)?.[1];
      // Sans identifiant, on ne peut pas savoir qui l'écrit : hors de portée.
      if (!id) continue;
      if (src.includes(`"${id}"`)) continue;
      orphelins.push(`#${id} : « ${txt.slice(0, 60)} »`);
    }
    expect(
      orphelins,
      "texte figé dans le document, sans `data-i18n` et que rien n'écrit :\n" +
        orphelins.join("\n"),
    ).toEqual([]);
  });
});
