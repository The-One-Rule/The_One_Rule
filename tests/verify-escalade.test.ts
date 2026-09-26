/**
 * LE REJEU DE L'ESCALADE.
 *
 * Sans ce fichier, la panne serait totale ET silencieuse : le serveur
 * tirerait une pile de règles différente de celle jouée, chaque manche
 * porterait une autre contrainte, et TOUS les runs d'escalade seraient
 * rejetés comme invalides. Le joueur verrait « run refusé » sans rien
 * comprendre, et le classement resterait vide.
 *
 * C'est la famille de bugs que CLAUDE.md §11 décrit : une règle qui marche en
 * solo et que le transport casse. Ici le « transport » est le rejeu serveur.
 *
 * Ce qui rend le rejeu possible : la pile est tirée d'un flux DÉRIVÉ de la
 * graine (`seed ^ 0x5eca1ade`), pour ne pas consommer celui des manches. Ce
 * détail-là est toute la reproductibilité, et il n'est écrit qu'à deux
 * endroits — `main.ts` et `verify.ts`. Ce test est ce qui les tient d'accord.
 */
import { describe, expect, it } from "vitest";

import { buildRound } from "../src/engine/round";
import { combineRules } from "../src/engine/rules/combine";
import { pileA, pileEscalade } from "../src/engine/escalade";
import { mulberry32 } from "../src/engine/rng";
import { verifyRun } from "../src/engine/verify";
import type { LoggedInput } from "../src/engine/verify";
import { withoutHold, withoutInk } from "../src/engine/rules";
import type { OneRule } from "../src/engine/types";

const GRAINE = 0x51de;
/** Le même décalage que le jeu — s'il change d'un côté, ce test tombe. */
const DERIVE = 0x5eca1ade;

/** Le même filtre de capacités que `verify.ts` — voir `RunClaim.capacites`. */
const filtre = (capacites?: { maintien: boolean; encre: boolean }) => (r: OneRule) => {
  if (capacites?.maintien === false && withoutHold(r) !== r) return false;
  if (capacites?.encre === false && withoutInk(r) !== r) return false;
  return true;
};

/** Un joueur qui obéit sans enfreindre la pile tenue. */
function joueEscalade(
  seed: number,
  manches: number,
  capacites?: { maintien: boolean; encre: boolean },
): LoggedInput[] {
  const pile = pileEscalade(mulberry32(seed ^ DERIVE), filtre(capacites));
  const rng = mulberry32(seed);
  const inputs: LoggedInput[] = [];
  let t = 0;

  for (let level = 0; level < manches; level++) {
    const tenue = pileA(pile, level);
    const regle = combineRules(tenue);
    const round = buildRound(rng, level, regle);
    // LA SECONDE interdit d'agir avant 400 ms ; la pile peut la contenir.
    const attente = Math.max(300, tenue.some((r) => r.id === "seconde") ? 430 : 0);
    const at = t + Math.min(attente, round.durationMs - 40);

    /*
     * LE PIEGE : la consigne demande d'enfreindre la pile, donc la bonne
     * reponse est de NE RIEN FAIRE.
     *
     * L'aide du run du jour n'en tient pas compte et s'en sort parce que la
     * regle du jour ne piege que 5 % du temps. En escalade, la proportion
     * monte a 11 % au premier palier et 39 % au quatrieme — un joueur qui
     * obeit toujours meurt donc en trois manches, ce qui est exactement ce
     * qu'ont dit les cinq premiers echecs de ce fichier.
     */
    if (round.trap) {
      t += round.durationMs;
      continue;
    }

    if (round.steps.length === 0) {
      t += round.durationMs;
      continue;
    }
    const permis = (i: number, quand: number): boolean =>
      regle.judge(
        { kind: "click", ent: round.ents[i]!, x: round.ents[i]!.x, y: round.ents[i]!.y },
        { round, elapsedMs: quand - t },
      ) === null;

    let k = 0;
    for (const step of round.steps) {
      const quand = at + k * 40;
      if (step.kind === "click") inputs.push({ t: quand, k: "c", i: step.idx });
      else if (step.kind === "clickAny" || step.kind === "clickAnyExcept") {
        const ok = round.ents.findIndex(
          (e, i) => permis(i, quand) && (step.kind === "clickAny" || e.color !== step.color),
        );
        inputs.push({ t: quand, k: "c", i: ok >= 0 ? ok : 0 });
      } else inputs.push({ t: quand, k: "k", key: (step as { key: string }).key });
      k++;
    }
    t = at + (round.steps.length - 1) * 40 + 1;
  }
  return inputs;
}

describe("le serveur rejoue une escalade comme le jeu l'a jouée", () => {
  it("un run correct est accepté, et son score est celui joué", () => {
    const inputs = joueEscalade(GRAINE, 12);
    const v = verifyRun({ seed: GRAINE, ruleId: "sang", mode: "escalade", inputs });
    expect(v.ok, `rejeu refusé : ${v.cause}`).toBe(true);
    expect(v.score).toBeGreaterThanOrEqual(12);
  });

  it("le `ruleId` n'a AUCUNE influence en escalade", () => {
    /*
     * La règle vient de la pile, pas du champ. Si le champ comptait, un
     * joueur pourrait annoncer la règle la plus facile et faire rejouer son
     * run sous une autre contrainte que celle qu'il a subie.
     */
    const inputs = joueEscalade(GRAINE, 10);
    const scores = ["sang", "jumeau", "gaucher"].map(
      (ruleId) => verifyRun({ seed: GRAINE, ruleId, mode: "escalade", inputs }).score,
    );
    expect(new Set(scores).size, `scores divergents : ${scores.join(", ")}`).toBe(1);
  });

  it("la pile est LA MÊME sur tous les appareils — c'est ce qui rend l'escalade classable", () => {
    /*
     * MESURÉ, et c'est mieux que ce que j'attendais.
     *
     * Je m'apprêtais à faire entrer les capacités de l'appareil dans la clé de
     * comparabilité : un téléphone ne peut pas tenir ESPACE, donc sa pile
     * aurait dû exclure LA MAIN GAUCHE, et son classement se serait séparé de
     * celui des joueurs au clavier. À 50 joueurs, une telle fragmentation vide
     * un podium.
     *
     * Sauf que `pileEscalade` ne tire JAMAIS LA MAIN GAUCHE ni LE DALTONIEN.
     * Elle sert d'abord les règles piégeuses et plafonne à quatre : sur 400
     * graines, seules cinq règles apparaissent. Les deux filtres d'appareil
     * sont donc inertes ici, et l'escalade est la même épreuve pour tout le
     * monde — ce qui est exactement ce qu'on demande à une référence
     * compétitive.
     *
     * Ce test tombera le jour où le tirage changera. Ce sera le bon moment
     * pour se reposer la question, plutôt que de découvrir des classements
     * incomparables après coup.
     */
    const complete = new Set<string>();
    const restreinte = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const pleine = pileEscalade(mulberry32(seed ^ DERIVE), () => true);
      const reduite = pileEscalade(
        mulberry32(seed ^ DERIVE),
        filtre({ maintien: false, encre: false }),
      );
      expect(reduite.map((r) => r.id), `graine ${seed}`).toEqual(pleine.map((r) => r.id));
      for (const r of pleine) complete.add(r.id);
      for (const r of reduite) restreinte.add(r.id);
    }
    // L'échantillon a bien vu plusieurs règles — sinon il ne prouve rien.
    expect(complete.size).toBeGreaterThan(3);
    expect([...restreinte].sort()).toEqual([...complete].sort());
  });

  it("déclarer des capacités ne change donc RIEN au verdict", () => {
    // Corollaire du test précédent : personne ne peut se rendre le run plus
    // facile en mentant sur son appareil, puisque la pile n'en dépend pas.
    const inputs = joueEscalade(GRAINE, 14);
    const scores = [
      undefined,
      { maintien: true, encre: true },
      { maintien: false, encre: false },
    ].map(
      (capacites) =>
        verifyRun({ seed: GRAINE, ruleId: "sang", mode: "escalade", inputs, capacites }).score,
    );
    expect(new Set(scores).size, `scores divergents : ${scores.join(", ")}`).toBe(1);
  });

  it("plusieurs graines, pas une seule", () => {
    // Un test à une graine peut passer par chance — le dépôt en a déjà vu
    // quatre le faire.
    for (const seed of [1, 7, 4242, 0x51de, 999_983]) {
      const inputs = joueEscalade(seed, 10);
      const v = verifyRun({ seed, ruleId: "sang", mode: "escalade", inputs });
      expect(v.ok, `graine ${seed} refusée : ${v.cause}`).toBe(true);
      expect(v.score).toBeGreaterThanOrEqual(10);
    }
  });
});
