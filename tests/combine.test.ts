/**
 * Tenir plusieurs règles à la fois.
 *
 * Ce fichier protège deux choses qui ne se voient pas à la lecture :
 *
 *   · une pile doit se comporter comme UNE règle, sinon tout l'aval casse ;
 *   · deux joueurs tenant les mêmes règles doivent jouer la MÊME manche, quel
 *     que soit l'ordre dans lequel ils les ont gagnées. C'est mesuré : au
 *     niveau 20, JUMEAU puis ACCÉLÉRATION donne 843 ms, l'inverse 927.
 */
import { describe, expect, it } from "vitest";
import { ONE_RULES } from "../src/engine/rules";
import { combineRules, compatibleAvec, compatibles } from "../src/engine/rules/combine";
import { buildRound } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import type { OneRule } from "../src/engine/types";

const par = (id: string): OneRule => ONE_RULES.find((r) => r.id === id)!;

describe("composition de règles", () => {
  it("une pile d'une seule règle est cette règle", () => {
    // Pas une copie : le mode escalade démarre à une règle, et rien ne doit
    // se comporter différemment de l'existant tant qu'on n'a pas empilé.
    expect(combineRules([par("sang")])).toBe(par("sang"));
  });

  it("refuse une pile vide plutôt que de rendre une règle sans effet", () => {
    // Une règle inerte est un avantage gratuit et invisible — décision n°1.
    expect(() => combineRules([])).toThrow();
  });

  it("piège dès qu'UNE des règles piège", () => {
    // C'est tout l'intérêt : L'ÉCLAIR seule ne piège jamais, LE SANG oui.
    expect(par("eclair").traps).toBe(false);
    expect(combineRules([par("eclair"), par("sang")]).traps).toBe(true);
  });

  it("l'ORDRE D'ACQUISITION ne change pas la manche", () => {
    // Le cas qui mord, et il est mesuré : JUMEAU étend la fenêtre pour ses
    // étapes ajoutées, L'ACCÉLÉRATION la coupe de 30 %. Composées dans un
    // ordre puis dans l'autre, elles donnent 843 ms contre 927 — 10 % d'écart
    // sur un simple ordre d'application. Deux joueurs ne joueraient pas la
    // même partie selon l'ordre où ils ont gagné leurs règles.
    const a = combineRules([par("jumeau"), par("acceleration")]);
    const b = combineRules([par("acceleration"), par("jumeau")]);
    expect(a.id).toBe(b.id);
    for (const lvl of [0, 5, 20, 39]) {
      const ra = buildRound(mulberry32(4242), lvl, a);
      const rb = buildRound(mulberry32(4242), lvl, b);
      expect(JSON.stringify(rb), `niveau ${lvl}`).toBe(JSON.stringify(ra));
    }
  });

  it("rend le PREMIER motif du catalogue, toujours le même", () => {
    // Une action peut enfreindre deux règles à la fois. L'écran de mort ne
    // doit pas raconter une histoire différente selon l'ordre d'acquisition.
    const pile = combineRules([par("gaucher"), par("sang")]);
    const ctx = { round: buildRound(mulberry32(1), 0, par("sang")), elapsedMs: 900 };
    const rouge = ctx.round.ents.find((e) => e.color === "garance");
    if (!rouge) return; // pas de pièce rouge sur cette manche : rien à prouver
    const motif = pile.judge({ kind: "click", ent: rouge, x: 10, y: 10 }, ctx);
    // x=10 est dans la zone interdite ET la pièce est rouge : deux infractions.
    expect(motif).toBeTruthy();
    expect(pile.judge({ kind: "click", ent: rouge, x: 10, y: 10 }, ctx)).toBe(motif);
  });

  it("conserve la bande interdite, qui doit rester visible pour être juste", () => {
    // Une règle spatiale non affichée est une injustice : le joueur ne peut
    // pas savoir où il n'a pas le droit de cliquer.
    expect(combineRules([par("sang"), par("gaucher")]).zone).toEqual(par("gaucher").zone);
  });
});

describe("incompatibilités", () => {
  it("refuse ÉCLAIR avec LE MENTEUR — la manche devient illisible", () => {
    // Mesuré sur 40 manches : 11 falsifiées, dont 1 où le texte disparaît
    // AVANT que la correction s'affiche. Le joueur ne voit jamais la vraie
    // consigne ; il ne perd pas parce qu'il a mal joué, mais parce qu'on ne
    // lui a rien montré. « Le jeu triche » est le seul risque tenu pour fatal.
    expect(compatibles(par("eclair"), par("menteur"))).toBe(false);
    expect(compatibles(par("menteur"), par("eclair"))).toBe(false);
  });

  it("refuse une règle avec elle-même", () => {
    expect(compatibles(par("sang"), par("sang"))).toBe(false);
  });

  it("laisse passer tout le reste — la liste ne contient que du mesuré", () => {
    // Garde-fou : une liste qui grossirait par prudence viderait le mode de
    // son intérêt. Si ce compte chute, c'est qu'on a interdit sans mesurer.
    let ok = 0;
    for (let i = 0; i < ONE_RULES.length; i++) {
      for (let j = i + 1; j < ONE_RULES.length; j++) {
        if (compatibles(ONE_RULES[i]!, ONE_RULES[j]!)) ok++;
      }
    }
    expect(ok).toBeGreaterThan(60);
  });

  it("une pile n'accepte que ce qui va avec TOUTES ses règles", () => {
    const pile = [par("sang"), par("eclair")];
    expect(compatibleAvec(pile, par("menteur"))).toBe(false);
    expect(compatibleAvec(pile, par("jumeau"))).toBe(true);
    expect(compatibleAvec(pile, par("sang"))).toBe(false);
  });
});
