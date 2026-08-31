/**
 * @vitest-environment jsdom
 *
 * Les cartes de l'accueil ne sont pas des boutons-libellés.
 *
 * `#btnDaily`, `#btnMulti`, `#btnTraining` et `#btnRanked` sont des `<button>`
 * qui CONTIENNENT trois `<span>` : un titre, une description, un état. Leur
 * écrire un `textContent` supprime les trois, définitivement.
 *
 * C'est arrivé : `ensureConnected` affichait « CONNEXION… » de cette façon.
 * La carte devenait un texte brut sans classe — noir sur fond sombre, mesuré à
 * 1,15:1 — et surtout `#cardMultiState` disparaissait du document, si bien que
 * le `renderHome()` suivant levait « Cannot set properties of null » et
 * s'interrompait au milieu : accents de cartes, mode classé et libellés SON /
 * MUSIQUE cessaient d'être appliqués. Il suffisait d'ouvrir le multijoueur une
 * fois pour que l'accueil reste cassé jusqu'au rechargement.
 *
 * Un commentaire mettait déjà en garde dans `main.ts` — dans l'autre fichier.
 * Ce test, lui, tient les deux.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
 * Deux familles, meme piege.
 *
 * `#btnMulti` a quitte la famille des cartes pour LA FAILLE : l'accueil ne
 * propose plus qu'un seul objet fendu en deux, SOLO au-dessus et MULTI en
 * dessous, et les modes solo vivent sur leur propre ecran. Les deux familles sont des
 * `<button>` a plusieurs `<span>`, donc les deux se detruisent d'un
 * `textContent` — ce que ce fichier existe pour refuser.
 */
const CARTES = ["btnDaily", "btnTraining", "btnRanked", "btnEscalade"];
const PORTES = ["btnSolo", "btnMulti"];
const SOURCES = ["src/main.ts", "src/multi.ts", "src/i18n.ts"];

beforeAll(() => {
  const html = readFileSync("index.html", "utf8");
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
});

describe("cartes de l'accueil", () => {
  it("chaque carte porte bien un titre, une description et un état", () => {
    for (const id of CARTES) {
      const carte = document.getElementById(id);
      expect(carte, `#${id} absent du document`).not.toBeNull();
      for (const part of ["__title", "__desc", "__state"]) {
        expect(carte!.querySelector(`.card${part}`), `#${id} sans .card${part}`).not.toBeNull();
      }
    }
  });

  it("chaque face de la faille porte un titre, une description et un état", () => {
    for (const id of PORTES) {
      const porte = document.getElementById(id);
      expect(porte, `#${id} absent du document`).not.toBeNull();
      for (const part of ["__titre", "__desc", "__etat"]) {
        expect(porte!.querySelector(`.faille${part}`), `#${id} sans .faille${part}`).not.toBeNull();
      }
    }
  });

  it("aucune source n'écrit dans le textContent d'une carte", () => {
    const fautes: string[] = [];
    for (const f of SOURCES) {
      // Commentaires retirés : ce fichier-ci et celui de `multi.ts` CITENT la
      // ligne fautive pour l'expliquer, et une explication n'est pas une faute.
      const src = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const id of [...CARTES, ...PORTES]) {
        // `btnMulti.textContent =` comme `$("btnDaily").textContent =`
        const motifs = [
          new RegExp(`\\b${id}\\s*\\.\\s*(textContent|innerHTML|innerText)\\s*=`),
          new RegExp(`["']${id}["']\\s*\\)\\s*\\.\\s*(textContent|innerHTML|innerText)\\s*=`),
        ];
        for (const m of motifs) {
          const trouve = m.exec(src);
          if (trouve) fautes.push(`${f} : ${trouve[0]}`);
        }
      }
    }
    expect(fautes, `écrire là efface le titre, la description et l'état :\n${fautes.join("\n")}`)
      .toEqual([]);
  });

  it("l'état de chaque carte a bien un identifiant à écrire", () => {
    // C'est la contrepartie : si l'état n'avait pas d'id, il n'y aurait aucun
    // autre endroit où écrire, et la tentation reviendrait.
    for (const id of ["cardDailyState", "cardMultiState", "cardTrainingState", "cardRankedState"]) {
      expect(document.getElementById(id), `#${id} absent`).not.toBeNull();
    }
  });
});
