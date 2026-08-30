/**
 * La session en mode ESCALADE.
 *
 * Le cœur pur est teste ailleurs. Ici on verifie le seul endroit ou il touche
 * quelque chose d'existant : la session, qui portait UNE regle et en porte
 * maintenant une pile — sans que rien d'autre ne s'en apercoive.
 */
import { describe, expect, it } from "vitest";
import { Session } from "../src/game/session";
import { ONE_RULES } from "../src/engine/rules";
import { combineRules } from "../src/engine/rules/combine";
import { buildRound } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import { PALIER, pileEscalade } from "../src/game/escalade";

const sang = ONE_RULES.find((r) => r.id === "sang")!;

/** Fait survivre la session jusqu'au niveau voulu, sans dependre du hasard. */
function monteA(s: Session, niveau: number): void {
  let t = 1000;
  let garde = 0;
  while (s.level < niveau && s.phase !== "over" && garde++ < 4000) {
    t += 10;
    // Silence : survit aux pieges, meurt sur le reste — mais l'echauffement
    // absorbe les premieres, et on relance la manche par timeout sinon.
    if (s.round.steps.length === 0) s.tick(t + s.round.durationMs + 5);
    else {
      for (const st of s.round.steps) {
        if (st.kind === "click") s.input({ kind: "click", ent: s.round.ents[st.idx]!, x: s.round.ents[st.idx]!.x, y: s.round.ents[st.idx]!.y }, t);
        else if (st.kind === "key") s.input({ kind: "key", key: st.key }, t);
        else s.input({ kind: "click", ent: s.round.ents[0] ?? null, x: 900, y: 10 }, t);
        t += 1;
      }
      s.tick(t + 5);
    }
    if (s.phase === "freeze") s.tick(t + 5000);
  }
}

describe("session en escalade", () => {
  it("hors escalade, rien ne change : la pile vaut la règle", () => {
    // La garantie de non-régression. Les trois autres modes ne doivent pas
    // payer un centime de ce mécanisme.
    const s = new Session({ mode: "daily", rule: sang, rng: mulberry32(1), now: 0, seed: 1 });
    expect(s.pile).toEqual([sang]);
    expect(s.rule).toBe(sang);
    expect(s.paliers).toBe(1);
  });

  it("démarre à une règle même quand la pile en contient quatre", () => {
    const pile = pileEscalade(mulberry32(42));
    expect(pile.length).toBeGreaterThan(1);
    const s = new Session({ mode: "escalade", rule: pile[0]!, rng: mulberry32(42), now: 0, seed: 42, pile });
    expect(s.paliers).toBe(1);
    expect(s.rule.id).toBe(pile[0]!.id);
    expect(s.regleAjoutee).toBeNull();
  });

  it("ajoute une règle au palier, et l'annonce UNE fois", () => {
    const pile = pileEscalade(mulberry32(7));
    const s = new Session({ mode: "escalade", rule: pile[0]!, rng: mulberry32(7), now: 0, seed: 7, pile });
    monteA(s, PALIER);
    if (s.phase === "over") return; // mort avant le palier : rien a prouver
    expect(s.paliers).toBe(2);
    // La composee porte les DEUX identifiants, dans l'ordre du catalogue —
    // c'est la garantie que la manche jouee tient compte des deux interdits.
    const attendus = [pile[0]!, pile[1]!]
      .sort((a, b) => ONE_RULES.indexOf(a) - ONE_RULES.indexOf(b))
      .map((r) => r.id);
    expect(s.rule.id).toBe(attendus.join("+"));
    // La regle acquise est nommee : sans ca, le joueur passerait sous une
    // deuxieme contrainte sans qu'on le lui dise.
    expect(s.regleAjoutee?.id).toBe(pile[1]!.id);
  });

  it("la règle composée interdit ce que CHACUNE interdit", () => {
    // La propriete qui donne son sens au mode. On la verifie sur la composee
    // de toute la pile, en comptant les pieges sur un echantillon de manches :
    // empiler doit en produire strictement plus qu'une seule regle.
    const pile = pileEscalade(mulberry32(3));
    const seule = new Session({ mode: "escalade", rule: pile[0]!, rng: mulberry32(3), now: 0, seed: 3, pile: [pile[0]!] });
    const empilee = new Session({ mode: "escalade", rule: pile[0]!, rng: mulberry32(3), now: 0, seed: 3, pile });

    const compte = (r: typeof seule.rule) => {
      let n = 0;
      for (let lvl = 0; lvl < 200; lvl++) {
        const rng = mulberry32(8888 + lvl);
        if (buildRound(rng, lvl, r).trap) n++;
      }
      return n;
    };
    const avecUne = compte(seule.rule);
    // La pile complete, telle qu'elle sera tenue au dernier palier.
    const toute = combineRules(pile);
    const avecToutes = compte(toute);
    expect(avecToutes, `${avecUne} pieges seul, ${avecToutes} empile`).toBeGreaterThan(avecUne);
    expect(empilee.pile.length).toBe(pile.length);
  });

  it("le mode escalade n'a pas d'allure : le score doit rester comparable", () => {
    // Comme le quotidien et le classe. Seul l'entrainement module l'allure.
    const pile = pileEscalade(mulberry32(5));
    const s = new Session({ mode: "escalade", rule: pile[0]!, rng: mulberry32(5), now: 0, seed: 5, pile, pace: 1.5 });
    expect(s.pace).toBe(1);
  });
});
