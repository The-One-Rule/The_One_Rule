/**
 * LES ADRESSES DU SITE — et la réécriture qui les sert.
 *
 * Demandé par Pierre : « chaque partie du site a une page différente, par
 * exemple lelien/entrainement ou lelien/home ». Et, dans le même message :
 * « pas de bouton pour revenir en arrière pour taper le code d'un salon, juste
 * direct au menu ».
 *
 * ⚠️ Deux symptômes d'un même manque — l'application ne savait pas d'où l'on
 * venait, et chaque RETOUR portait une destination écrite en dur.
 *
 * ⚠️ **CE FICHIER GARDE AUSSI LA RÉÉCRITURE VERCEL**, parce que c'est une panne
 * MUETTE de la même famille que celles du §2 : un motif trop large avale
 * `robots.txt` et `sitemap.xml`, le site disparaît des moteurs, et rien ne
 * casse. `tests/seo.test.ts` existe déjà pour cette raison exacte.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  cheminDe,
  ecranAuChargement,
  ecranDe,
  estAdressable,
  parentDe,
} from "../src/route";
import type { EcranId } from "../src/route";

const ECRANS: EcranId[] = [
  "home", "onb", "fiche", "escalier", "solo", "brief", "over", "codex",
  "compte", "classement", "reglages", "multi-id", "multi-join",
  "multi-lobby", "multi-end", "partie",
];

describe("la table des adresses", () => {
  it("⚠️ DEUX ÉCRANS NE PARTAGENT JAMAIS UNE ADRESSE", () => {
    /*
     * Le seul invariant qui casse tout : deux écrans sous le même chemin
     * rendraient le retour non déterministe, et `ecranDe` trancherait par
     * ordre de déclaration — c'est-à-dire par hasard.
     */
    const chemins = ECRANS.map(cheminDe);
    expect(new Set(chemins).size, `doublon parmi ${chemins.join(" ")}`).toBe(chemins.length);
  });

  it("chaque adresse retrouve son écran", () => {
    for (const e of ECRANS) expect(ecranDe(cheminDe(e)), cheminDe(e)).toBe(e);
  });

  it("elle tolère la barre finale et la casse", () => {
    // Une adresse recopiée à la main dans une conversation revient rarement
    // telle qu'elle est partie.
    expect(ecranDe("/cartes/")).toBe("codex");
    expect(ecranDe("/CARTES")).toBe("codex");
    expect(ecranDe("")).toBe("home");
  });

  it("⚠️ UN ÉCRAN CONTEXTUEL OUVERT À FROID RETOMBE SUR SON PARENT", () => {
    /*
     * Un salon sans code, une fiche sans règle, un écran de fin sans run sont
     * des cadres vides. Les montrer se lirait comme un chargement raté, et le
     * joueur n'aurait rien à réparer — c'est déjà la doctrine du podium.
     */
    expect(ecranAuChargement("/salon")).toBe("multi-join");
    expect(ecranAuChargement("/carte")).toBe("codex");
    expect(ecranAuChargement("/fin")).toBe("solo");
    expect(ecranAuChargement("/partie")).toBe("solo");
  });

  it("une adresse inconnue rend l'accueil, jamais une erreur", () => {
    expect(ecranAuChargement("/nawak")).toBe("home");
    expect(ecranAuChargement("/solo/truc/machin")).toBe("home");
  });

  it("un parent est TOUJOURS adressable — sinon le repli boucle", () => {
    for (const e of ECRANS) {
      expect(estAdressable(parentDe(e)), `${e} retombe sur un parent inouvrable`).toBe(true);
    }
  });

  it("⚠️ LA TABLE NE DÉPEND DE RIEN — donc pas de la langue non plus", () => {
    /*
     * Une adresse est un IDENTIFIANT. Si elle changeait avec le réglage de
     * langue, un lien partagé par un francophone tomberait en 404 chez un
     * anglophone — et le partage est déjà à 0 %.
     *
     * ⚠️ PREMIÈRE VERSION DE CE TEST : un balayage de la source à la recherche
     * du mot « langue ». Il est tombé sur son propre COMMENTAIRE, celui qui
     * explique précisément pourquoi la langue n'y entre pas. Une assertion qui
     * lit de la prose ne mesure pas du code — et c'est la deuxième fois de la
     * session qu'un filet à motif se trompe de cible.
     *
     * On vérifie donc la propriété qui garantit tout le reste : le module
     * n'importe RIEN. Ni l'i18n, ni `location`, ni `history` — donc rien qui
     * puisse varier d'un joueur à l'autre, et il reste testable.
     */
    const source = readFileSync("src/route.ts", "utf8");
    const imports = source.split(/\r?\n/).filter((l) => /^\s*import\b/.test(l));
    expect(imports, "la table a gagné une dépendance").toEqual([]);
  });
});

describe("la réécriture Vercel", () => {
  const conf = JSON.parse(readFileSync("vercel.json", "utf8"));
  const motif = new RegExp("^" + conf.rewrites[0].source + "$");

  it("sert l'application sur chaque adresse d'écran", () => {
    for (const e of ECRANS) {
      expect(motif.test(cheminDe(e)), `${cheminDe(e)} n'est pas servi`).toBe(true);
    }
  });

  it("⚠️ N'AVALE NI LES FICHIERS DE LA RACINE, NI LES ASSETS", () => {
    /*
     * La panne muette : `robots.txt` réécrit en `index.html` fait disparaître
     * le site des moteurs, sans qu'une seule chose casse. On énumère le vrai
     * contenu de `public/` plutôt qu'une liste écrite à la main — le prochain
     * fichier ajouté sera couvert sans qu'on y pense.
     */
    for (const f of readdirSync("public", { withFileTypes: true })) {
      if (!f.isFile()) continue;
      expect(motif.test("/" + f.name), `/${f.name} serait réécrit en index.html`).toBe(false);
    }
    for (const p of ["/assets/index-abc.js", "/cartes/sang.png", "/api/collect"]) {
      expect(motif.test(p), `${p} serait réécrit`).toBe(false);
    }
  });
});

describe("les autres orthographes qu'on peut taper", () => {
  /*
   * ⚠️ RAPPORTÉ : « quand je tape ma propre url vers une page du site elle me
   * ramène directement à la page principale ». La demande de départ nommait
   * pourtant `/home` en toutes lettres — et `/home` n'était dans aucune table,
   * puisque l'accueil s'écrit `/`. Le comportement était juste, la table était
   * incomplète.
   */
  it("⚠️ /home OUVRE L'ACCUEIL — il avait été demandé par son nom", () => {
    expect(ecranDe("/home")).toBe("home");
    expect(ecranAuChargement("/home")).toBe("home");
  });

  it("l'anglais est compris, parce que la moitié des joueurs jouent en anglais", () => {
    expect(ecranAuChargement("/cards")).toBe("codex");
    expect(ecranAuChargement("/settings")).toBe("reglages");
    expect(ecranAuChargement("/play")).toBe("solo");
    expect(ecranAuChargement("/leaderboard")).toBe("classement");
  });

  it("⚠️ UN ALIAS SE LIT, IL NE S'ÉCRIT JAMAIS", () => {
    /*
     * C'est ce qui préserve la propriété qui compte : une adresse est un
     * IDENTIFIANT. Si `cheminDe` pouvait rendre `/cards`, deux joueurs
     * copieraient deux liens différents pour la même page, et le jour où l'on
     * retirerait un alias les liens déjà partagés mourraient.
     */
    const canoniques = new Set(ECRANS.map(cheminDe));
    for (const a of ["/home", "/cards", "/play", "/settings", "/climb"]) {
      expect(canoniques.has(a), `${a} est devenu une adresse canonique`).toBe(false);
    }
  });

  it("un alias contextuel retombe quand même sur son parent", () => {
    // `/room` désigne le salon, qui n'est pas ouvrable à froid : la tolérance
    // sur l'orthographe ne doit pas contourner la règle du repli.
    expect(ecranAuChargement("/room")).toBe("multi-join");
    expect(ecranAuChargement("/training")).toBe("solo");
  });
});
