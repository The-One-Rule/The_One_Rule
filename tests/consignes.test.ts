/**
 * LES CONSIGNES, DANS LES DEUX LANGUES.
 *
 * Le moteur décrit ce qu'il demande (`Phrase`) ; l'affichage en fait une
 * phrase. Deux écritures, donc deux façons de diverger — et une divergence
 * ici ne casse rien : elle affiche simplement autre chose que ce que le jeu
 * juge, sur le texte le plus lu du jeu, sous 760 ms.
 *
 * Pourquoi ce fichier existe. Trois playtesters anglophones sur trois ont
 * abandonné pour la même raison : ils passaient par la traduction automatique
 * du navigateur, qui retraduit les nœuds mutés de façon ASYNCHRONE. La
 * consigne change toutes les deux secondes, donc le texte arrivait après une
 * bonne partie de leur fenêtre de décision. « I was always running out of
 * time ». La traduction native n'est pas un confort : c'est ce qui rend le
 * jeu jouable hors du français.
 */
import { describe, expect, it } from "vitest";

import { INSTRUCTIONS } from "../src/engine/instructions";
import { mulberry32 } from "../src/engine/rng";
import { BRIEFS_REGLES, briefDeRegle, composePhrase, poseLangue } from "../src/i18n";
import { ONE_RULES } from "../src/engine/rules";
import { stepMatches } from "../src/engine/resolve";
import { COLOR_IDS } from "../src/engine/types";
import type { ColorId } from "../src/engine/types";
import { COLOR_LABEL, COLOR_LABEL_EN } from "../src/engine/instructions";

/** Un échantillon large : chaque consigne, sur beaucoup de graines. */
function tirages(): { id: string; draft: ReturnType<(typeof INSTRUCTIONS)[number]["gen"]> }[] {
  const out: { id: string; draft: ReturnType<(typeof INSTRUCTIONS)[number]["gen"]> }[] = [];
  for (const instr of INSTRUCTIONS) {
    for (let graine = 1; graine <= 40; graine++) {
      out.push({ id: instr.id, draft: instr.gen(mulberry32(graine), 20) });
    }
  }
  return out;
}

describe("la consigne structurée", () => {
  const echantillon = tirages();

  it("l'échantillon couvre bien toutes les consignes", () => {
    // Garde-fou : sans lui, une extraction cassée ferait passer tout le reste.
    expect(echantillon.length).toBeGreaterThan(500);
    expect(new Set(echantillon.map((e) => e.id)).size).toBe(INSTRUCTIONS.length);
  });

  it("chaque consigne en porte une", () => {
    /*
     * Une consigne sans `phrase` retombe sur son texte français — donc reste
     * en français pour un anglophone, en silence. C'est exactement la panne
     * que ce chantier corrige.
     */
    const sans = [...new Set(echantillon.filter((e) => !e.draft.phrase).map((e) => e.id))];
    expect(sans, `consignes sans phrase structurée : ${sans.join(", ")}`).toEqual([]);
  });

  it("composée en FRANÇAIS, elle redonne EXACTEMENT le texte du moteur", () => {
    /*
     * LE TEST QUI COMPTE.
     *
     * `text` reste le français canonique — LE MENTEUR compare des textes pour
     * emprunter une phrase plausible, et plusieurs tests s'y adossent. Il y a
     * donc deux écritures de la même chose. Celui-ci exige qu'elles disent
     * exactement la même phrase, sinon il n'y a plus une vérité mais deux.
     */
    const ecarts: string[] = [];
    for (const { id, draft } of echantillon) {
      const compose = composePhrase(draft.phrase, "", "fr");
      if (compose !== draft.text) ecarts.push(`${id} : « ${compose} » ≠ « ${draft.text} »`);
    }
    expect(ecarts, `le moteur et l'affichage divergent :\n${[...new Set(ecarts)].join("\n")}`).toEqual(
      [],
    );
  });

  it("composée en ANGLAIS, elle ne laisse aucun accent français", () => {
    const restes: string[] = [];
    for (const { id, draft } of echantillon) {
      const en = composePhrase(draft.phrase, "", "en");
      if (/[À-ÿ]/.test(en)) restes.push(`${id} : ${en}`);
      if (en.trim() === "") restes.push(`${id} : consigne VIDE`);
    }
    expect(restes, `anglais incomplet :\n${[...new Set(restes)].join("\n")}`).toEqual([]);
  });

  it("les deux langues disent des phrases DIFFÉRENTES", () => {
    /*
     * Sans ça, une table anglaise recopiée du français passerait les deux
     * tests précédents sans rien traduire. TRIANGLE est identique dans les
     * deux langues, donc on exige une majorité, pas la totalité.
     */
    let differentes = 0;
    for (const { draft } of echantillon) {
      if (composePhrase(draft.phrase, "", "fr") !== composePhrase(draft.phrase, "", "en")) {
        differentes++;
      }
    }
    expect(differentes / echantillon.length).toBeGreaterThan(0.9);
  });
});

describe("« TAPE L'INITIALE DE LA COULEUR » reste jouable en anglais", () => {
  /*
   * La seule consigne dont la TRADUCTION change ce qui est jugé : elle attend
   * la première lettre du nom français. V pour VERT, J pour JAUNE — un
   * anglophone tape G et Y, et échoue une manche sur deux.
   *
   * Le moteur accepte donc les DEUX initiales, pour tout le monde. Pas de
   * pool par langue (le run du jour doit rester identique pour tous,
   * décision n°11) et pas de jugement dépendant de la langue (client et
   * serveur divergeraient — le seul défaut tenu pour fatal).
   */
  const instr = INSTRUCTIONS.find((i) => i.id === "typeFirstLetter");

  it("la consigne existe toujours — sinon ce bloc ne teste rien", () => {
    expect(instr, "typeFirstLetter introuvable").toBeDefined();
  });

  it("les deux initiales sont acceptées, quelle que soit la langue", () => {
    const vus = new Set<string>();
    for (let graine = 1; graine <= 60; graine++) {
      const draft = instr!.gen(mulberry32(graine), 20);
      const want = draft.want;
      expect(want.kind).toBe("key");
      if (want.kind !== "key") continue;
      vus.add(want.key);
      // La lettre française passe...
      expect(stepMatches(want, { kind: "key", key: want.key })).toBe(true);
      // ...et l'anglaise aussi.
      expect(want.keyAlt, "keyAlt manquante : un anglophone échouerait").toBeDefined();
      expect(stepMatches(want, { kind: "key", key: want.keyAlt! })).toBe(true);
      // Une troisième lettre, elle, ne passe pas.
      expect(stepMatches(want, { kind: "key", key: "Z" })).toBe(false);
    }
    // L'échantillon doit avoir vu plusieurs couleurs, sinon il ne prouve rien.
    expect(vus.size).toBeGreaterThan(2);
  });

  it("les initiales des deux langues coïncident là où c'est attendu", () => {
    // ROUGE/RED et BLEU/BLUE partagent leur initiale ; VERT/GREEN et
    // JAUNE/YELLOW non. C'est ce déséquilibre qui rend `keyAlt` nécessaire.
    const memes = COLOR_IDS.filter((c: ColorId) => COLOR_LABEL[c][0] === COLOR_LABEL_EN[c][0]);
    expect(memes.length).toBe(2);
    expect(COLOR_IDS.length - memes.length).toBe(2);
  });
});

describe("les briefs de règles", () => {
  /*
   * Le NOM d'une règle reste français — c'est un nom, et son identifiant est
   * la clé du carnet et de la comparabilité. Son BRIEF, lui, est le SEUL
   * endroit où le joueur apprend ce que la règle lui interdit, et il le lit
   * juste avant de jouer. Le laisser en français revenait à annoncer à un
   * anglophone une contrainte qu'il ne pouvait pas comprendre — signalé
   * capture à l'appui sur « LA SECONDE ».
   */
  it("chaque règle du catalogue en a un dans LES DEUX langues", () => {
    const manquants: string[] = [];
    for (const r of ONE_RULES) {
      if (!BRIEFS_REGLES.fr[r.id]) manquants.push(`fr : ${r.id}`);
      if (!BRIEFS_REGLES.en[r.id]) manquants.push(`en : ${r.id}`);
    }
    expect(ONE_RULES.length, "catalogue vide — le test ne prouverait rien").toBeGreaterThan(8);
    expect(manquants, manquants.join(" · ")).toEqual([]);
  });

  it("le français du dictionnaire est CELUI du moteur", () => {
    // Deux écritures de la même phrase : si elles divergent, le joueur lit
    // autre chose que ce que la règle fait vraiment.
    const ecarts: string[] = [];
    for (const r of ONE_RULES) {
      const dico = BRIEFS_REGLES.fr[r.id];
      if (dico !== undefined && dico !== r.brief) {
        ecarts.push(`${r.id} : « ${dico} » ≠ « ${r.brief} »`);
      }
    }
    expect(ecarts, ecarts.join(" · ")).toEqual([]);
  });

  it("l'anglais ne laisse aucun accent, et dit autre chose", () => {
    let differents = 0;
    const restes: string[] = [];
    for (const r of ONE_RULES) {
      const en = BRIEFS_REGLES.en[r.id]!;
      if (/[À-ÿ]/.test(en)) restes.push(`${r.id} : ${en}`);
      if (en !== BRIEFS_REGLES.fr[r.id]) differents++;
    }
    expect(restes, restes.join(" · ")).toEqual([]);
    // Une table recopiee du francais passerait le test precedent sans rien
    // traduire.
    expect(differents).toBe(ONE_RULES.length);
  });

  it("une règle inconnue s'explique quand même", () => {
    // Une règle sans explication serait pire qu'une règle mal traduite : le
    // joueur ne saurait pas ce qui lui est interdit.
    poseLangue("en");
    expect(briefDeRegle("regleQuiNExistePas", "le secours")).toBe("le secours");
    poseLangue("fr");
  });
});
