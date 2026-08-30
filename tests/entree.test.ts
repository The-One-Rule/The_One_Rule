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
