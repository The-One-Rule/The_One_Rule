/**
 * Le compte — règles pures.
 *
 * Ce fichier tient les deux invariants sur lesquels tout le chantier repose,
 * et il les tient par PROPRIÉTÉ plutôt que par exemple : une fusion se rejoue
 * dans des ordres qu'aucun playtest ne reproduirait, et un bug de fusion ne
 * casse rien — il fait rétrécir un carnet, silencieusement, définitivement.
 *
 *   1. La fusion est une union et un maximum, jamais une affectation.
 *      Donc : idempotente, commutative, monotone.
 *   2. Deux performances ne se comparent qu'à clé de comparabilité égale.
 */
import { describe, expect, it } from "vitest";

import {
  agregatsVides,
  apparenceAutorisee,
  cleComparaison,
  fusionne,
  litApparence,
  normalisePseudo,
} from "../shared/compte";
import type { Agregats } from "../shared/compte";
import { GLYPH_COUNT, glyphFor, glyphFromIndex, glyphIndex } from "../src/net/glyph";
import { VERSION_CONTENU, calculeVersion } from "../src/engine/version";
import { ONE_RULES } from "../src/engine/rules";
import { INSTRUCTIONS } from "../src/engine/instructions";

/* ------------------------------------------------------------------ *
 * Un générateur d'agrégats — pour éprouver les propriétés
 * ------------------------------------------------------------------ */

function agregats(graine: number): Agregats {
  // Générateur déterministe : un test qui échoue doit pouvoir se rejouer.
  let x = graine >>> 0 || 1;
  const suivant = (): number => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  const a = agregatsVides();
  for (const r of ONE_RULES) {
    if (suivant() < 0.5) continue;
    a.carnet[r.id] = { best: Math.floor(suivant() * 40), cleared: suivant() < 0.3 };
  }
  a.serie = { count: Math.floor(suivant() * 20), lastDay: Math.floor(suivant() * 300) };
  for (const cle of ["daily|v:x", "escalade|v:x", "training|pace:1,v:x"]) {
    if (suivant() < 0.4) continue;
    a.records[cle] = Math.floor(suivant() * 60);
  }
  return a;
}

/** Tout ce qui est comparable dans un agrégat, aplati en nombres. */
function grandeurs(a: Agregats): Record<string, number> {
  const out: Record<string, number> = {
    "serie.count": a.serie.count,
    "serie.lastDay": a.serie.lastDay,
  };
  for (const [id, e] of Object.entries(a.carnet)) {
    out[`carnet.${id}.best`] = e.best;
    out[`carnet.${id}.cleared`] = e.cleared ? 1 : 0;
  }
  for (const [cle, v] of Object.entries(a.records)) out[`record.${cle}`] = v;
  return out;
}

describe("la fusion est une union et un maximum", () => {
  it("est idempotente — la rejouer ne change rien", () => {
    for (let g = 1; g <= 40; g++) {
      const a = agregats(g);
      const b = agregats(g * 7 + 1);
      const une = fusionne(a, b);
      const deux = fusionne(une, b);
      const trois = fusionne(deux, b);
      expect(deux, `graine ${g}`).toEqual(une);
      expect(trois, `graine ${g}`).toEqual(une);
    }
  });

  it("est commutative — l'ordre des appareils n'a aucune importance", () => {
    for (let g = 1; g <= 40; g++) {
      const a = agregats(g);
      const b = agregats(g * 13 + 3);
      expect(fusionne(a, b), `graine ${g}`).toEqual(fusionne(b, a));
    }
  });

  it("est monotone — AUCUNE grandeur ne peut diminuer", () => {
    // C'est l'assertion qui compte vraiment. Un carnet qui rétrécit ne
    // provoque aucune erreur, ne casse aucun écran, et ne se remarque que le
    // jour où un joueur cherche une règle qu'il sait avoir jouée.
    for (let g = 1; g <= 60; g++) {
      const a = agregats(g);
      const b = agregats(g * 31 + 5);
      const f = grandeurs(fusionne(a, b));
      for (const source of [a, b]) {
        for (const [cle, v] of Object.entries(grandeurs(source))) {
          expect(f[cle] ?? -Infinity, `graine ${g} · ${cle}`).toBeGreaterThanOrEqual(v);
        }
      }
    }
  });

  it("est associative sur trois appareils", () => {
    for (let g = 1; g <= 25; g++) {
      const [a, b, c] = [agregats(g), agregats(g * 3 + 2), agregats(g * 11 + 9)];
      expect(fusionne(fusionne(a, b), c)).toEqual(fusionne(a, fusionne(b, c)));
    }
  });

  it("n'additionne jamais une série", () => {
    const a = { ...agregatsVides(), serie: { count: 7, lastDay: 100 } };
    const b = { ...agregatsVides(), serie: { count: 5, lastDay: 103 } };
    // Additionner serait évidemment faux ; prendre celle du serveur ferait
    // retomber à 5 un joueur qui a joué sept jours sur son téléphone, et une
    // série perdue est la chose qui fait qu'on ne revient pas.
    expect(fusionne(a, b).serie).toEqual({ count: 7, lastDay: 103 });
  });

  it("fusionner avec du vide ne perd rien", () => {
    for (let g = 1; g <= 20; g++) {
      const a = agregats(g);
      expect(fusionne(a, agregatsVides())).toEqual(fusionne(agregatsVides(), a));
      expect(grandeurs(fusionne(a, agregatsVides()))).toEqual(
        expect.objectContaining(grandeurs(a)),
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * Clé de comparabilité
 * ------------------------------------------------------------------ */

describe("clé de comparabilité", () => {
  const base = { mode: "training", regime: { pace: 1 }, versionContenu: "abc" };

  it("deux allures ne partagent pas la même clé", () => {
    // La loi existait déjà pour `bestTraining` dans game/progress.ts : un
    // record obtenu en DÉCOUVERTE ne se compare pas à un record obtenu en
    // RAPIDE. Elle est ici généralisée à tous les modes.
    expect(cleComparaison({ ...base, regime: { pace: 1 } })).not.toBe(
      cleComparaison({ ...base, regime: { pace: 1.5 } }),
    );
  });

  it("deux versions de contenu ne partagent pas la même clé", () => {
    expect(cleComparaison(base)).not.toBe(cleComparaison({ ...base, versionContenu: "abd" }));
  });

  it("l'ordre des clés du régime n'influe pas", () => {
    expect(cleComparaison({ ...base, regime: { pace: 1, vies: 3 } })).toBe(
      cleComparaison({ ...base, regime: { vies: 3, pace: 1 } }),
    );
  });

  it("le jour sépare deux runs à graine partagée, et n'apparaît pas sans lui", () => {
    expect(cleComparaison({ ...base, jour: 240 })).not.toBe(
      cleComparaison({ ...base, jour: 241 }),
    );
    expect(cleComparaison(base)).not.toContain("|j:");
  });
});

/* ------------------------------------------------------------------ *
 * Version de contenu
 * ------------------------------------------------------------------ */

describe("version de contenu", () => {
  it("existe, est courte et stable d'un appel à l'autre", () => {
    expect(VERSION_CONTENU).toMatch(/^[0-9a-z]{1,7}$/);
  });

  it("change dès qu'on ajoute une règle — sans que personne y pense", () => {
    // C'est TOUT le mécanisme. Une constante à incrémenter à la main est une
    // constante qu'on oublie, et on ne s'en aperçoit que le jour où l'on
    // compare deux chiffres incomparables, c'est-à-dire trop tard.
    const regles = ONE_RULES.map((r) => ({ id: r.id }));
    const consignes = INSTRUCTIONS.map((i) => ({
      id: i.id,
      minLevel: i.minLevel,
      weight: i.weight,
      touch: i.touch,
    }));

    expect(calculeVersion(regles, consignes)).toBe(VERSION_CONTENU);
    expect(calculeVersion([...regles, { id: "treizieme" }], consignes)).not.toBe(VERSION_CONTENU);
  });

  it("change dès qu'une consigne change de pondération ou de niveau d'entrée", () => {
    const regles = ONE_RULES.map((r) => ({ id: r.id }));
    const consignes = INSTRUCTIONS.map((i) => ({
      id: i.id,
      minLevel: i.minLevel,
      weight: i.weight,
      touch: i.touch,
    }));
    const premiere = consignes[0]!;

    for (const patch of [
      { weight: premiere.weight + 1 },
      { minLevel: premiere.minLevel + 1 },
      { touch: !premiere.touch },
    ]) {
      const modifiees = [{ ...premiere, ...patch }, ...consignes.slice(1)];
      expect(calculeVersion(regles, modifiees), JSON.stringify(patch)).not.toBe(VERSION_CONTENU);
    }
  });

  it("ne dépend pas de l'ORDRE de déclaration", () => {
    // Réordonner le catalogue ne change pas ce qu'un score veut dire. Si la
    // version bougeait pour ça, elle bougerait tout le temps — et une version
    // qui change tout le temps ne segmente plus rien.
    const regles = [...ONE_RULES].reverse().map((r) => ({ id: r.id }));
    const consignes = [...INSTRUCTIONS].reverse().map((i) => ({
      id: i.id,
      minLevel: i.minLevel,
      weight: i.weight,
      touch: i.touch,
    }));
    expect(calculeVersion(regles, consignes)).toBe(VERSION_CONTENU);
  });
});

/* ------------------------------------------------------------------ *
 * Identité affichée
 * ------------------------------------------------------------------ */

describe("pseudo", () => {
  it("normalise vers des majuscules bornées", () => {
    expect(normalisePseudo("  pierre  ")).toBe("PIERRE");
    expect(normalisePseudo("x".repeat(40))).toHaveLength(14);
    expect(normalisePseudo("a<script>b")).toBe("ASCRIPTB");
    expect(normalisePseudo(42)).toBe("");
    expect(normalisePseudo(null)).toBe("");
  });

  it("laisse passer accents et chiffres", () => {
    expect(normalisePseudo("éloïse2")).toBe("ÉLOÏSE2");
  });
});

describe("glyphe", () => {
  it("index et signe sont en bijection sur les 144", () => {
    // C'est ce qui rend un signe PORTABLE d'un appareil à l'autre, et ce qui
    // lui donne d'avance la forme d'un identifiant d'objet possédé.
    expect(GLYPH_COUNT).toBe(144);
    const vus = new Set<string>();
    for (let i = 0; i < GLYPH_COUNT; i++) {
      const g = glyphFromIndex(i);
      expect(glyphIndex(g), `index ${i}`).toBe(i);
      vus.add(`${g.shape}/${g.color}/${g.pattern}`);
    }
    expect(vus.size).toBe(GLYPH_COUNT);
  });

  it("un signe dérivé d'un identifiant se retrouve par son index", () => {
    // C'est ce qui permet à la revendication de conserver EXACTEMENT le signe
    // que le joueur portait déjà : il ne change pas en créant un compte.
    for (const id of ["abc", "zzz", "u_1", "anon", "PIERRE"]) {
      const g = glyphFor(id);
      expect(glyphFromIndex(glyphIndex(g))).toEqual(g);
    }
  });

  it("un index hors bornes retombe sur un signe valide", () => {
    for (const n of [-1, 1.5, NaN, 10_000]) {
      const g = glyphFromIndex(n);
      expect(glyphIndex(g)).toBeGreaterThanOrEqual(0);
      expect(glyphIndex(g)).toBeLessThan(GLYPH_COUNT);
    }
  });
});

describe("apparence", () => {
  it("conserve les clés qu'elle ne connaît pas", () => {
    // Un client d'une version antérieure ne doit pas effacer un habillage
    // qu'il ne sait pas afficher. C'est ce qui rend l'ajout futur d'objets
    // — cartes de partie et le reste — indolore.
    const lue = litApparence({ glyphe: 12, carte: "nocturne", futur: { n: 1 } });
    expect(lue.glyphe).toBe(12);
    expect(lue.carte).toBe("nocturne");
    expect(lue.futur).toEqual({ n: 1 });
  });

  it("borne le glyphe et ne perd pas le reste", () => {
    // `carte` n'est plus réservée : c'est la carte de visite, validée comme
    // un identifiant de règle. Le « reste » est une clé que ce code ignore.
    const a = apparenceAutorisee({ glyphe: 999, carte: "sang", cadre: "or" }, GLYPH_COUNT);
    expect(a.glyphe).toBe(0);
    expect(a.carte).toBe("sang");
    expect(a.cadre).toBe("or");
  });

  it("lit une apparence absente sans se plaindre", () => {
    expect(litApparence(null).glyphe).toBe(0);
    expect(litApparence("bruit").glyphe).toBe(0);
    expect(litApparence({}).glyphe).toBe(0);
  });
});
