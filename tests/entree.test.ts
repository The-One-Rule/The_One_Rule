/**
 * « Code/lien → rejoindre → jouer. »
 *
 * C'est la promesse écrite en tête de CLAUDE.md, et c'est la seule que le
 * projet tienne pour non négociable. Elle s'était pourtant perdue sans que
 * personne ne le voie : `openFromInvite` passait par `needIdentity`, donc un
 * joueur neuf — c'est-à-dire exactement celui qui clique le lien d'un ami —
 * rencontrait un écran d'identité, une saisie clavier et deux clics AVANT
 * d'entrer, pendant que l'ami attendait dans le salon.
 *
 * Rien ne cassait : le parcours fonctionnait, il était seulement trois fois
 * trop long. C'est le genre de régression qu'aucun test ne rattrape et qu'on
 * ne mesure qu'en regardant quelqu'un s'énerver. D'où ce fichier, qui lit les
 * sources — même famille que `tests/cartes.test.ts` et
 * `tests/invariants-compte.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { indicesDeMode, MODES, MODES_OFFERTS } from "../src/multi";

const src = readFileSync("src/multi.ts", "utf8");

/** Le corps d'une fonction ou d'une propriété, à partir de son en-tête. */
function corps(depuis: string): string {
  // L'ancre porte son accolade ouvrante : sans elle, `indexOf` attrapait la
  // DÉCLARATION DE TYPE `openFromInvite: (code: string) => void;` du haut du
  // fichier, puis remontait jusqu'au premier bloc venu. Le test lisait alors
  // une fonction sans rapport et se plaignait de la mauvaise.
  const i = src.indexOf(depuis);
  expect(i, `introuvable : ${depuis}`).toBeGreaterThan(-1);
  let profondeur = 0;
  let debut = -1;
  for (let k = i; k < src.length; k++) {
    const c = src[k]!;
    if (c === "{") {
      if (debut < 0) debut = k;
      profondeur++;
    } else if (c === "}") {
      profondeur--;
      if (profondeur === 0 && debut >= 0) return src.slice(debut, k + 1);
    }
  }
  return "";
}

describe("un lien d'invitation mène au salon, pas à un formulaire", () => {
  const invite = corps("openFromInvite: (code: string) => {");

  it("n'exige AUCUNE identité avant d'entrer", () => {
    expect(
      invite.includes("needIdentity"),
      "openFromInvite ne doit pas passer par needIdentity : le nom peut " +
        "attendre d'être dans le salon, l'ami qui attend, non.",
    ).toBe(false);
  });

  it("rejoint directement, sans passer par l'écran de saisie du code", () => {
    // Le code est DANS le lien. Afficher un champ pour le retaper est le
    // genre d'étape qu'on n'ajoute jamais volontairement et qu'on garde par
    // inadvertance.
    expect(invite).toContain("joinRoom(code)");
  });

  it("accepte explicitement l'entrée anonyme", () => {
    expect(invite).toContain("anonyme: true");
  });

  it("garde un repli : le lien ne finit jamais dans une impasse", () => {
    // Connexion impossible : on retombe sur l'écran de saisie AVEC le code
    // pré-rempli, plutôt que sur un écran mort.
    expect(invite).toContain("openJoin(code)");
  });
});

describe("le verrou d'identité reste là où il a un sens", () => {
  it("l'entrée délibérée par la carte MULTIJOUEUR le garde", () => {
    // Qui crée un salon en est l'hôte, et son nom compte pour ceux qui
    // arriveront. Ce n'est pas le même moment que le lien : personne
    // n'attend.
    const carte = corps('btnMulti.addEventListener("click", () => {');
    expect(carte).toContain("needIdentity");
  });

  it("le nommage existe toujours, déplacé APRÈS l'entrée", () => {
    // Le supprimer serait revenir au `prompt()` natif d'avant, que CLAUDE.md
    // documente comme pire. Il est déplacé, pas retiré.
    expect(src).toContain('$("btnMultiNom").addEventListener');
    expect(readFileSync("index.html", "utf8")).toContain('id="btnMultiNom"');
  });

  it("renoncer à se nommer depuis le salon n'en fait pas sortir", () => {
    const retour = corps('$("btnIdBack").addEventListener("click", () => {');
    expect(retour).toContain('show("multi-lobby")');
  });
});

describe("trois portes d'ouverture, separees et nommees", () => {
  it("SEUL CONTRE TOUS, DUO et COOP sont trois portes, pas un reglage cache", () => {
    // COOP n'existait que dans la barre MODE du salon : il fallait connaitre
    // le mode pour le trouver. Il est desormais une intention annoncee a
    // l'entree, a egalite avec DUO.
    const html = readFileSync("index.html", "utf8");
    const iJoin = html.indexOf('id="btnMultiJoin"');
    const iClassique = html.indexOf('id="btnMultiCreate"');
    const iDuo = html.indexOf('id="btnMultiCreateDuo"');
    const iCoop = html.indexOf('id="btnMultiCreateCoop"');
    expect(iJoin).toBeGreaterThan(0);
    expect(iClassique).toBeGreaterThan(iJoin);
    expect(iDuo).toBeGreaterThan(iClassique);
    expect(iCoop).toBeGreaterThan(iDuo);
    // Le document est servi en ANGLAIS ; le français vit dans le
    // dictionnaire et revient à l'affichage pour un navigateur français.
    expect(html).toContain("FREE FOR ALL");
  });

  /*
   * ⚠️ LA PORTE IMPOSTEUR EST FERMEE, ET CE TEST GARDE LA PORTE FERMEE.
   *
   * Playtest : les joueurs n'aiment pas et preferent le coop. La cause est
   * dans le moteur — `IMPOSTEUR_PIEGES` contient l'indice 0, donc la premiere
   * manche est un piege force et l'imposteur, qui doit obeir, se designe
   * lui-meme avant que personne n'ait rien appris.
   *
   * On verifie les DEUX portes, parce que fermer la premiere sans la seconde
   * n'aurait rien change : c'est dans la barre MODE du salon que les hotes
   * changent de mode.
   */
  it("l'imposteur n'est offert NI a l'entree NI dans la barre MODE", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).not.toContain("btnMultiCreateImposteur");
    expect(html).not.toContain("IMPOSTOR");
    expect(MODES_OFFERTS).not.toContain("imposteur");
  });

  /*
   * Mais le mode reste ENTIER : c'est une porte qu'on ferme, pas du code
   * qu'on jette. Et l'ordre du fil ne bouge pas — la barre envoie un indice.
   */
  it("le mode existe toujours, et sa place sur le fil n'a pas bouge", () => {
    expect(MODES).toEqual(["classique", "duo", "imposteur", "coop"]);
    expect(MODES.indexOf("coop")).toBe(3);
  });

  /*
   * Un salon deja en imposteur — un lien ancien, un client d'une autre
   * version — doit rester lisible ET modifiable. Sans ce rattrapage la barre
   * n'allumerait aucun segment, et l'hote ne saurait ni ou il est ni comment
   * en sortir.
   */
  it("un salon deja en imposteur garde son segment", () => {
    expect(indicesDeMode("coop")).toEqual([0, 1, 3]);
    expect(indicesDeMode("imposteur")).toEqual([0, 1, 2, 3]);
  });

  it("ouvrir pose le mode, et seulement si on l'a demande", () => {
    const f = corps("async function ouvreSalon(mode: ModeSalon)");
    expect(f).toContain("createRoom()");
    expect(f).toContain("setSettings({ mode })");
    // SEUL CONTRE TOUS ne doit rien envoyer de plus qu'avant : le defaut
    // du salon EST classique, un settings inutile ferait clignoter l'UI.
    expect(f).toMatch(/if \(mode !== ["']classique["']\)\s*client\.setSettings/);
    expect(f).not.toContain("{ duo: true }");
  });

  it("les trois boutons passent par le meme chemin", () => {
    // Trois implementations de « ouvrir un salon » finiraient par diverger,
    // et le symptome serait un mode qui marche et l'autre non.
    expect(src).toContain('$("btnMultiCreate").addEventListener("click", () => void ouvreSalon("classique"))');
    expect(src).toContain('$("btnMultiCreateDuo").addEventListener("click", () => void ouvreSalon("duo"))');
    expect(src).toContain('$("btnMultiCreateCoop").addEventListener("click", () => void ouvreSalon("coop"))');
    expect(src).toContain('fait: () => void ouvreSalon("classique")');
    /*
     * ⚠️ Le gestionnaire du bouton disparu doit partir AVEC lui. `$()` rend
     * `null` en silence, donc un `addEventListener` sur un identifiant absent
     * ne signale rien a la lecture — il jette au chargement, et c'est tout
     * `initMulti` qui ne s'installe pas : plus un seul ecran multijoueur.
     */
    expect(src).not.toContain("btnMultiCreateImposteur");
  });

  it("l'accent primaire reste sur SEUL CONTRE TOUS, pas sur les quatre portes", () => {
    const accent = corps("function syncJoinAccent(): void {");
    expect(accent).toContain('$("btnMultiCreate").classList.toggle("btn--primary"');
    expect(accent).not.toContain("btnMultiCreateDuo");
    expect(accent).not.toContain("btnMultiCreateCoop");
  });

  it("la grille reste 2×2, sans order", () => {
    const css = readFileSync("src/style.css", "utf8");
    const debut = css.indexOf(".join__head,");
    const fin = css.indexOf(".room__title");
    expect(debut).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(debut);
    const bloc = css.slice(debut, fin).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(bloc).toMatch(/grid-template-columns:\s*repeat\(2,/);
    expect(bloc).not.toMatch(/repeat\(4/);
    expect(bloc).not.toMatch(/\border\s*:/);
  });

  it("l'hote peut encore changer d'avis dans le salon", () => {
    // Ouvrir par une porte est un depart, pas un verrou : la barre MODE reste.
    expect(readFileSync("index.html", "utf8")).toContain('id="optDuo"');
  });
});
