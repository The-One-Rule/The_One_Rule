/**
 * Les invariants du chantier « comptes ».
 *
 * Aucun de ceux-ci ne casse quand on l'enfreint — c'est précisément pourquoi
 * ils ont besoin d'un test. Rendre le compte obligatoire ne produit pas
 * d'erreur : ça produit un jeu où, six mois plus tard, il faut un compte pour
 * jouer, sans que personne n'ait jamais pris cette décision. C'est la façon
 * dont ce genre de couche pourrit, et c'est écrit noir sur blanc dans le
 * périmètre : « aucune fonctionnalité de jeu ne dépend du compte ».
 *
 * Même famille que `tests/cartes.test.ts` et `tests/hidden.test.ts` : on lit
 * les sources et on refuse ce qui ne doit pas s'y trouver.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { PROTOCOL_VERSION } from "../shared/protocol";
import { verifieJeton } from "../server/jeton";

const lit = (f: string): string => readFileSync(f, "utf8");

/** Sources d'un dossier, en profondeur. */
function sources(racine: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(racine, { withFileTypes: true })) {
    const chemin = join(racine, e.name);
    if (e.isDirectory()) out.push(...sources(chemin));
    else if (e.name.endsWith(".ts")) out.push(chemin);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Le compte ne doit être sur aucun chemin de jeu
 * ------------------------------------------------------------------ */

describe("aucune fonctionnalité de jeu ne dépend du compte", () => {
  it("le moteur reste pur : il ignore jusqu'à l'existence des comptes", () => {
    // `engine/` est ce qui permet à `verify.ts` de rejouer un run côté serveur
    // et au multi de reconstruire les scènes. Y faire entrer une notion
    // d'identité le rendrait inexécutable là-bas.
    const fautes = sources("src/engine").filter((f) =>
      /from\s+["'][^"']*\/compte/.test(lit(f)),
    );
    expect(fautes, `le moteur ne doit rien savoir des comptes : ${fautes.join(", ")}`).toEqual([]);
  });

  it("la logique de match du serveur ignore les comptes", () => {
    // `server/match.ts` décide des vies, des verdicts et des forfaits. Si un
    // compte pouvait y changer quoi que ce soit, le social à une seule vitesse
    // serait mort — et personne ne le verrait avant un playtest.
    const src = lit("server/match.ts");
    expect(/from\s+["'][^"']*\/compte/.test(src)).toBe(false);
    // Le mot « compte » abonde dans les commentaires français (« compte tenu »,
    // « il compte ») : ce qu'on cherche est un ACCÈS à un champ de compte.
    expect(/\.\s*compte\b/.test(src)).toBe(false);
  });

  it("le serveur de salons n'utilise le compte que pour l'identité affichée", () => {
    const src = lit("server/index.ts");
    // Le champ existe...
    expect(src).toMatch(/compte:\s*string \| null/);
    // ...mais il ne décide de RIEN. Aucune comparaison, aucun test dessus :
    // un `if (client.compte)` qui accorderait quoi que ce soit serait le
    // premier pas vers un salon à deux vitesses.
    const decisions = src.match(/if\s*\([^)]*client\.compte[^)]*\)/g) ?? [];
    expect(decisions, `le compte ne doit rien décider : ${decisions.join(" · ")}`).toEqual([]);
  });

  it("aucune erreur n'est renvoyée quand un jeton est absent ou mauvais", () => {
    // Un message d'erreur ici bloquerait un chemin d'entrée pour une couche
    // qui n'en est pas un. Le seul comportement admis est de jouer anonyme.
    for (const mauvais of [undefined, null, "", "pas-un-jeton", "a.b.c", 42, {}]) {
      expect(verifieJeton(mauvais, "un-secret")).toBeNull();
    }
    // Sans secret configuré, personne n'est authentifié — et ça marche quand
    // même, c'est l'état du développement local.
    expect(verifieJeton("n'importe quoi", "")).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Le protocole
 * ------------------------------------------------------------------ */

describe("protocole", () => {
  it("PROTOCOL_VERSION n'a pas bougé", () => {
    /*
     * `server/index.ts` compare la version par ÉGALITÉ STRICTE et FERME la
     * socket en cas d'écart. Incrémenter déconnecte, au déploiement, tous les
     * onglets ouverts et tous les clients en cache.
     *
     * Ajouter `tok` ne le justifie pas : c'est un champ facultatif, et
     * « absent vaut anonyme » fait qu'un ancien client se comporte
     * correctement sans le connaître — exactement le raisonnement de
     * `clavier`. Ce test est là pour qu'un incrément soit un acte délibéré et
     * jamais un effet de bord.
     */
    expect(PROTOCOL_VERSION).toBe(1);
    expect(lit("server/index.ts")).toContain("msg.v !== PROTOCOL_VERSION");
  });

  it("`tok` est facultatif dans le hello", () => {
    expect(lit("shared/protocol.ts")).toMatch(/tok\?:\s*string/);
  });
});

/* ------------------------------------------------------------------ *
 * Le jeton vit dans localStorage : le texte des joueurs devient critique
 * ------------------------------------------------------------------ */

describe("aucun texte de joueur n'est injecté en HTML", () => {
  /*
   * Tant qu'il n'y avait rien à voler, une injection dans le chat était laide.
   * Depuis qu'un jeton de compte vit dans `localStorage`, c'est un vol de
   * compte à distance, déclenché depuis n'importe quel salon.
   *
   * Le dépôt a une convention nette et saine : `innerHTML` pose la STRUCTURE
   * (des `<span>` avec leurs classes), `textContent` pose le TEXTE. Ce qu'on
   * refuse n'est donc pas `innerHTML` en soi — ce serait refuser la moitié du
   * code d'interface — mais l'INTERPOLATION d'une valeur qui vient d'un
   * joueur à l'intérieur.
   */
  const SUSPECTS = /\b(name|nom|pseudo|text|texte|chat|ownerName|psd)\b/i;

  /**
   * Ce que NOUS écrivons, et qui ne vient donc d'aucun joueur : noms de
   * division et noms de règles sont des constantes du dépôt.
   *
   * La liste est explicite à dessein. Un futur `${x.name}` non listé fait
   * tomber le test, ce qui force à se demander d'où vient cette chaîne — et
   * c'est exactement la question qu'il faut se poser depuis qu'un jeton de
   * compte vit dans `localStorage`.
   */
  const SURS = [/\bdivision\.name\b/, /\brule\.name\b/, /\bregle\.name\b/];

  it("ni main.ts ni multi.ts n'interpolent de texte joueur en innerHTML", () => {
    const fautes: string[] = [];
    for (const f of ["src/main.ts", "src/multi.ts"]) {
      const src = lit(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const m of src.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)) {
        for (const interp of m[1]!.matchAll(/\$\{([^}]*)\}/g)) {
          const expr = interp[1]!;
          if (!SUSPECTS.test(expr)) continue;
          if (SURS.some((sur) => sur.test(expr))) continue;
          fautes.push(`${f} : \${${expr.trim()}}`);
        }
      }
    }
    expect(fautes, `texte de joueur interpolé en innerHTML :\n${fautes.join("\n")}`).toEqual([]);
  });

  it("trouve bien des interpolations — sinon le test ci-dessus est vide", () => {
    // Garde-fou : si l'extraction cassait, `fautes` serait vide et le test
    // précédent passerait pour de mauvaises raisons.
    let interpolations = 0;
    for (const f of ["src/main.ts", "src/multi.ts"]) {
      for (const m of lit(f).matchAll(/\.innerHTML\s*=\s*([^;]+);/g)) {
        interpolations += [...m[1]!.matchAll(/\$\{([^}]*)\}/g)].length;
      }
    }
    expect(interpolations).toBeGreaterThan(3);
  });

  it("le chat passe bien par textContent", () => {
    // Contrepartie du test précédent : s'il n'y avait aucun rendu de chat, le
    // premier passerait pour de mauvaises raisons.
    expect(lit("src/multi.ts")).toMatch(/textContent/);
  });
});

/* ------------------------------------------------------------------ *
 * L'écran de compte n'est pas une porte
 * ------------------------------------------------------------------ */

describe("l'écran de compte", () => {
  it("n'est jamais ouvert automatiquement", () => {
    const src = lit("src/main.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // `show("compte")` ne doit apparaître que dans `ouvreCompte`, qui n'est
    // appelée que par un clic. Un appel au démarrage ferait du compte la
    // première chose que rencontre un joueur invité par un ami — exactement
    // ce que l'ancien `prompt()` de nom faisait, et qu'on a retiré.
    const ouvertures = src.match(/show\(\s*["']compte["']\s*\)/g) ?? [];
    expect(ouvertures).toHaveLength(1);
  });

  it("le bouton de compte est masqué tant qu'aucun fournisseur n'existe", () => {
    // Un bouton qui mène à « indisponible » annonce une fonctionnalité que le
    // jeu ne tient pas : c'est le piège de confiance le plus facile à
    // commettre dans ce chantier.
    const html = lit("index.html");
    // Il vit dans la barre haute depuis qu'il était noyé dans le pied de
    // l'accueil, entre MUSIQUE et MOTIFS.
    expect(html).toMatch(/id="btnTopCompte"/);
    expect(lit("src/main.ts")).toContain('$("btnTopCompte").classList.toggle("hidden"');
  });

  it("la barre haute n'existe pas pendant la partie", () => {
    /*
     * `show(null)` est l'écran de jeu. La barre doit alors disparaître, et
     * `#app` perdre `has-topbar` : la taille du champ EST du gameplay
     * (CLAUDE.md §6 n°10), donc rien ne doit pouvoir rogner la scène.
     *
     * La barre est aussi HORS FLUX (position absolue) — ce que la feuille
     * doit garantir, pas seulement l'intention.
     */
    const src = lit("src/main.ts");
    expect(src).toContain('$("topbar").classList.toggle("hidden", !barre)');
    expect(src).toContain('appEl.classList.toggle("has-topbar", barre)');

    const css = lit("src/style.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const bloc = /\.topbar\s*\{([^}]*)\}/.exec(css);
    expect(bloc, "la feuille doit déclarer .topbar").not.toBeNull();
    expect(bloc![1]).toMatch(/position:\s*absolute/);
  });
});
