/**
 * LES MOTIFS DE MORT, DANS LES DEUX LANGUES.
 *
 * C'est la phrase que le joueur lit à l'instant précis où il perd — le seul
 * moment où il a besoin de comprendre, et le seul où il ne cherchera pas.
 * Elle naissait en clair dans le moteur PUR, donc un anglophone lisait
 * « TU AS CLIQUÉ SUR DU ROUGE ».
 *
 * Ce fichier garde trois choses :
 *   1. la table anglaise est COMPLÈTE — c'est TypeScript qui l'exige, mais il
 *      ne dit rien de la qualité, donc on vérifie aussi qu'elle ne recopie pas
 *      le français ;
 *   2. les phrases vivent dans `motifs.ts` et NULLE PART ailleurs — sans ça,
 *      écrire un motif en clair dans une nouvelle règle contournerait le filet
 *      sans rien casser ;
 *   3. tout motif que le moteur peut réellement émettre est traduisible — on
 *      le prouve en le lui faisant émettre, pas en relisant la table.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MOTIFS } from "../src/engine/motifs";
import type { MotifId } from "../src/engine/motifs";
import { MOTIFS_ANGLAIS, poseLangue, traduisMotif } from "../src/i18n";
import { ONE_RULES } from "../src/engine/rules";
import { buildRound } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import { resolveAction, resolveTimeout } from "../src/engine/resolve";
import type { Action } from "../src/engine/types";

const IDS = Object.keys(MOTIFS) as MotifId[];

describe("la table des motifs", () => {
  it("dit quelque chose de différent en anglais, pour chacun", () => {
    for (const id of IDS) {
      expect(MOTIFS_ANGLAIS[id], id).toBeTruthy();
      expect(MOTIFS_ANGLAIS[id], id).not.toBe(MOTIFS[id]);
      // Un accent dans la colonne anglaise trahit une phrase oubliée : c'est
      // exactement comme ça que les briefs français avaient survécu.
      expect(MOTIFS_ANGLAIS[id], id).not.toMatch(/[éèêàâôûùçÉÈÊÀÂÔÛÙÇ]/);
    }
  });

  it("aucune traduction n'en double une autre", () => {
    // Deux motifs qui se traduisent pareil, c'est une information perdue —
    // « MAUVAISE FORME » et « MAUVAISE CIBLE » ne disent pas la même chose.
    const vues = new Set(IDS.map((id) => MOTIFS_ANGLAIS[id]));
    expect(vues.size).toBe(IDS.length);
  });

  it("le français ressort tel quel, sans passer par la table", () => {
    poseLangue("fr");
    for (const id of IDS) expect(traduisMotif(MOTIFS[id])).toBe(MOTIFS[id]);
    poseLangue("fr");
  });

  it("traduit en anglais", () => {
    poseLangue("en");
    for (const id of IDS) expect(traduisMotif(MOTIFS[id])).toBe(MOTIFS_ANGLAIS[id]);
    poseLangue("fr");
  });

  it("un motif inconnu ressort TEL QUEL", () => {
    /*
     * Le front (Vercel) et le serveur de salons (Fly) se déploient séparément :
     * le serveur peut donc nommer un motif que ce bundle ignore. Une phrase
     * étrangère vaut mieux qu'un champ vide au moment de comprendre pourquoi
     * on vient de mourir — même doctrine que les clés `data-i18n`.
     */
    poseLangue("en");
    expect(traduisMotif("UN MOTIF D'UNE VERSION PLUS RÉCENTE")).toBe(
      "UN MOTIF D'UNE VERSION PLUS RÉCENTE",
    );
    poseLangue("fr");
  });
});

describe("les phrases ne vivent qu'à un endroit", () => {
  /*
   * LE FILET QUI DONNE SES DENTS AU RESTE.
   *
   * `Record<MotifId, string>` garantit que la table anglaise est complète —
   * mais seulement pour les motifs DÉCLARÉS. Écrire une phrase en clair dans
   * un nouveau `judge` passerait entre les mailles : le moteur l'émettrait,
   * l'anglophone la lirait en français, et rien ne casserait.
   */
  const sources = [
    ["resolve.ts", "src/engine/resolve.ts"],
    ["rules/index.ts", "src/engine/rules/index.ts"],
    ["rules/combine.ts", "src/engine/rules/combine.ts"],
    ["server/match.ts", "server/match.ts"],
  ] as const;

  it("aucune phrase de mort n'est écrite en clair hors de motifs.ts", () => {
    // Le NOM d'une règle reste français à dessein : c'est un nom, et son
    // identifiant est la clé du carnet, des performances et de la
    // comparabilité. Ce n'est pas une phrase, c'est une étiquette.
    const noms = new Set(ONE_RULES.map((r) => r.name));
    const fautes: string[] = [];
    for (const [nom, chemin] of sources) {
      const src = readFileSync(chemin, "utf8")
        // Les commentaires en parlent, et c'est très bien : ce sont eux qui
        // expliquent pourquoi la phrase n'est plus là.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
      for (const m of src.matchAll(/"([^"\\]{4,})"/g)) {
        const texte = m[1]!;
        // La marque d'un motif : des CAPITALES, comme tout ce que le jeu
        // affiche. Les identifiants et les sélecteurs sont en minuscules.
        if (
          /^[A-ZÀ-Ü0-9 ,'’—\u00A0-]{4,}$/.test(texte) &&
          /[A-ZÀ-Ü]{3}/.test(texte) &&
          !noms.has(texte)
        ) {
          fautes.push(`${nom} : « ${texte} »`);
        }
      }
    }
    expect(fautes, `des phrases affichées hors de motifs.ts :\n${fautes.join("\n")}`).toEqual([]);
  });
});

describe("ce que le moteur émet vraiment", () => {
  /*
   * On ne relit pas la table : on fait mourir le joueur de toutes les façons
   * qu'on sait provoquer, et on exige que CHAQUE motif obtenu soit traduisible.
   * C'est la seule version du test qui tombe quand une règle nouvelle invente
   * sa propre phrase.
   */
  const connus = new Set<string>(IDS.map((id) => MOTIFS[id]));

  it("tout motif émis est dans la table", () => {
    const vus = new Set<string>();
    const clic = (x: number, y: number, ent?: unknown): Action =>
      ({ kind: "click", x, y, ent }) as Action;

    for (const regle of ONE_RULES) {
      for (let seed = 1; seed <= 40; seed++) {
        const rng = mulberry32(seed * 7919);
        const round = buildRound(rng, seed % 20, regle);
        const actions: Action[] = [
          { kind: "key", key: "A" },
          { kind: "key", key: "Z" },
          { kind: "release", key: " " },
          clic(10, 10),
          ...round.ents.map((e) => clic(e.x, e.y, e)),
        ];
        for (const a of actions) {
          const r = resolveAction(round, { step: 0 }, a, 100, regle.judge);
          if (r.outcome.kind === "death") vus.add(r.outcome.reason);
          const tard = resolveAction(round, { step: 0 }, a, 900, regle.judge);
          if (tard.outcome.kind === "death") vus.add(tard.outcome.reason);
        }
        const t0 = resolveTimeout(round, { step: 0 });
        if (t0.kind === "death") vus.add(t0.reason);
        const t1 = resolveTimeout(round, { step: 1 });
        if (t1.kind === "death") vus.add(t1.reason);
      }
    }

    // Le garde-fou du garde-fou : si le pilote n'avait rien fait mourir, le
    // test passerait pour rien.
    expect(vus.size).toBeGreaterThan(8);
    const inconnus = [...vus].filter((m) => !connus.has(m));
    expect(inconnus, `motifs hors table :\n${inconnus.join("\n")}`).toEqual([]);
  });
});
