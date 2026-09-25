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

describe("le nom du joueur", () => {
  /*
   * LE BUG QUE CE BLOC AURAIT ATTRAPÉ.
   *
   * Rapporté par Pierre : « impossible de changer nom après connexion ». Deux
   * défauts derrière, et le second est le pire :
   *
   * 1. le nom n'était saisissable QUE sur le chemin du multijoueur — un joueur
   *    solo qui se connectait arrivait donc avec un pseudo VIDE, vérifié en
   *    production où le classement rendait `{"rang":1,"pseudo":"",…}` ;
   * 2. `changeIdentite` existait, avec sa route serveur complète et testée, et
   *    n'était appelée de NULLE PART. Du code mort qui ressemblait à une
   *    fonctionnalité livrée.
   *
   * Le second est celui qu'une relecture ne trouve pas : rien ne casse, rien
   * n'avertit, et la fonction se lit parfaitement.
   */
  it("l'écran d'identité est atteignable depuis le COMPTE", () => {
    const src = lit("src/main.ts");
    expect(src, "le bouton CHANGER DE NOM doit être câblé").toMatch(/btnCompteNom/);
    expect(src, "il rouvre l'écran NOM ET SIGNE existant").toMatch(/ouvreIdentite/);
    expect(lit("index.html")).toMatch(/id="btnCompteNom"/);
  });

  it("⚠️ un nom validé REJOINT le compte", () => {
    // `changeIdentite` a existé des mois sans appelant. Ce test refuse qu'elle
    // y retourne : sans lui, un joueur connecté se renomme pour lui seul et le
    // classement garde l'ancien nom, en silence.
    const src = lit("src/main.ts");
    expect(src).toMatch(/onIdentite\(/);
    expect(src).toMatch(/changeIdentite\(/);
  });

  it("le renommage passe par le crochet, PAS par le seul bouton du compte", () => {
    /*
     * Le multijoueur fait passer par le même écran d'identité. Poser la
     * synchronisation sur le bouton de l'écran COMPTE seulement laisserait un
     * nom changé avant d'entrer dans un salon sans jamais rejoindre le compte —
     * un chemin qui marche, un autre qui ne marche pas, pour le même geste.
     *
     * On le vérifie par la structure : `changeIdentite` doit être appelée dans
     * le corps de `onIdentite`, pas dans celui du gestionnaire du bouton.
     */
    const src = lit("src/main.ts");
    const i = src.indexOf("onIdentite(");
    const j = src.indexOf("changeIdentite(", i);
    expect(i, "onIdentite doit être posé").toBeGreaterThan(-1);
    expect(j, "changeIdentite doit suivre onIdentite").toBeGreaterThan(i);
    // Dans la même lampeée de code, pas trois écrans plus loin.
    expect(j - i).toBeLessThan(1200);
  });

  it("⚠️ un échec d'enregistrement ne bloque PAS le jeu", () => {
    /*
     * Décision n°12 : aucune fonctionnalité de jeu ne dépend du compte. Le nom
     * est écrit LOCALEMENT par l'écran d'identité avant que le crochet ne
     * parte ; si le serveur refuse, le multijoueur doit continuer de marcher.
     *
     * Concrètement : l'appel est en `void` — personne ne l'attend — et l'écran
     * d'identité n'a aucune raison de le savoir.
     */
    const src = lit("src/main.ts");
    expect(src).toMatch(/void changeIdentite\(/);
    expect(lit("src/multi.ts"), "le multi ne connaît pas le compte").not.toMatch(
      /changeIdentite/,
    );
  });
});

describe("l'écran de compte", () => {
  it("n'est jamais ouvert automatiquement", () => {
    const src = lit("src/main.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // `show("compte")` ne doit apparaître que dans `ouvreCompte`. L'adresse
    // `/compte` passe par elle (un second `show` ici ferait un doublon, et un
    // appel au démarrage hors adresse ferait du compte la première chose que
    // rencontre un joueur invité — exactement l'ancien `prompt()` de nom).
    const ouvertures = src.match(/show\(\s*["']compte["']\s*\)/g) ?? [];
    expect(ouvertures).toHaveLength(1);
  });

  it("la section COMPTE se tait tant qu'aucun fournisseur n'existe", () => {
    // Un bouton qui mène à « indisponible » annonce une fonctionnalité que le
    // jeu ne tient pas : c'est le piège de confiance le plus facile à
    // commettre dans ce chantier.
    //
    // ⚠️ Le bouton de la barre haute, lui, est TOUJOURS là depuis qu'il ouvre
    // le PROFIL (photo, carte, nom et signe), qui se tient sans compte. C'est
    // la section du compte, dans l'écran, qui porte l'invariant désormais.
    const html = lit("index.html");
    expect(html).toMatch(/id="btnTopCompte"/);
    expect(html).toMatch(/id="profilCompte"/);
    expect(lit("src/main.ts")).toMatch(
      /\$\("profilCompte"\)\.classList\.toggle\("hidden", !connecte && !comptesPossibles\(\)\)/,
    );
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
    /*
     * On cherche le COMPORTEMENT, pas une chaine de source.
     *
     * La version precedente exigeait `$("topbar").classList.toggle(...)` mot
     * pour mot ; elle est tombee des qu'un `const bar = $("topbar")` a ete
     * introduit, alors que la regle etait parfaitement respectee. Un test
     * d'invariant qui casse sur un renommage de variable locale ne protege
     * pas l'invariant : il decourage de toucher au fichier.
     */
    const src = lit("src/main.ts");
    expect(src).toMatch(/classList\.toggle\(\s*"hidden"\s*,\s*!barre\s*\)/);
    expect(src).toMatch(/classList\.toggle\(\s*"has-topbar"\s*,\s*barre\s*\)/);

    /*
     * Elle n'a plus besoin d'etre hors flux : elle vit DANS un `.screen`, qui
     * est une surcouche. Le terrain, lui, est dans le flux de `#app` et n'a
     * jamais la barre pour voisine. Ce qui compte est donc qu'elle DISPARAISSE
     * en partie — ce que les deux assertions ci-dessus exigent — pas la façon
     * dont elle est positionnee.
     */
    const css = lit("src/style.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(/\.topbar\s*\{/.test(css), "la feuille doit déclarer .topbar").toBe(true);
  });
});
