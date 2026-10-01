/**
 * LA MAIN GAUCHE — la règle qui ne faisait rien.
 *
 * ⚠️ **RAPPORTÉ EN PLAYTEST**, mot pour mot : « la règle main gauche ne
 * fonctionne pas, on peut très bien lâcher la barre en pleine game et il ne se
 * passera rien ».
 *
 * Le moteur, lui, était juste : mesuré, un relâchement à la manche 4 tue. Le
 * trou était l'ÉCHAUFFEMENT, et il était plus large qu'il n'en avait l'air. Un
 * relâchement pendant les trois manches de grâce était pardonné — puis **plus
 * aucun `keyup` ne survenait de tout le run**, la barre étant déjà levée. Le
 * joueur terminait donc sa partie entière en violant sa règle unique en
 * continu, sans jamais rien voir.
 *
 * C'est exactement l'inertie que la décision n°1 interdit : « aucune règle du
 * pool ne doit être inerte sur son porteur — un avantage gratuit et invisible ».
 * Elle a déjà coûté trois bugs au dépôt (`voyelle`, `acceleration`, `gaucher`) ;
 * celui-ci est le quatrième.
 */
import { describe, expect, it } from "vitest";
import { Session } from "../src/game/session";
import { ONE_RULES } from "../src/engine/rules";
import { mulberry32 } from "../src/engine/rng";
import { GRACE_ROUNDS, pardonnable } from "../src/engine/difficulty";

const MAIN_GAUCHE = ONE_RULES.find((r) => r.id === "mainGauche")!;
const SANG = ONE_RULES.find((r) => r.id === "sang")!;

const partie = (rule = MAIN_GAUCHE): Session =>
  new Session({ mode: "training", rule, rng: mulberry32(7), now: 0, seed: 7 });

describe("pardonnable", () => {
  it("⚠️ L'ÉCHAUFFEMENT NE PARDONNE PAS UN RELÂCHEMENT", () => {
    expect(pardonnable(MAIN_GAUCHE, { kind: "release", key: " " })).toBe(false);
  });

  it("mais il pardonne tout le reste, y compris à cette règle", () => {
    // L'échauffement garde sa raison d'être : apprendre sa règle sans mourir.
    // On ne le durcit que sur la seule faute qui décrit un ÉTAT.
    expect(pardonnable(MAIN_GAUCHE, { kind: "click" })).toBe(true);
    expect(pardonnable(MAIN_GAUCHE, { kind: "key", key: "A" })).toBe(true);
  });

  it("et une règle SANS maintien n'est pas touchée", () => {
    /*
     * Le garde-fou qui compte : la loi est portée par `watchRelease`, jamais
     * par une liste de noms. Une quinzième règle qui demanderait un maintien
     * sera couverte sans qu'on y pense ; les quinze autres ne changent pas.
     */
    expect(pardonnable(SANG, { kind: "release", key: " " })).toBe(true);
    for (const r of ONE_RULES) {
      if (r.watchRelease === undefined) {
        expect(pardonnable(r, { kind: "release", key: " " }), `${r.id} a durci`).toBe(true);
      }
    }
  });
});

describe("en partie", () => {
  it("⚠️ RELÂCHER À LA PREMIÈRE MANCHE TUE — c'est le bug du playtest", () => {
    const s = partie();
    expect(s.inGrace, "on doit bien être dans l'échauffement").toBe(true);
    const out = s.input({ kind: "release", key: " " }, 200);
    expect(out.kind).toBe("death");
    expect(s.phase, "le run continue comme si de rien n'était").not.toBe("playing");
  });

  it("et à chaque manche de l'échauffement, pas seulement la première", () => {
    for (let n = 0; n < GRACE_ROUNDS; n++) {
      const s = partie();
      // On avance jusqu'à la manche n en laissant le temps s'écouler.
      for (let i = 0; i < n; i++) s.tick(999_999 * (i + 1));
      expect(s.inGrace, `manche ${n}`).toBe(true);
      expect(s.input({ kind: "release", key: " " }, 100).kind, `manche ${n}`).toBe("death");
      expect(s.phase, `manche ${n}`).not.toBe("playing");
    }
  });

  it("une faute ORDINAIRE reste pardonnée pendant l'échauffement", () => {
    /*
     * Sans ce test, durcir l'échauffement pour tout le monde passerait aussi —
     * et on aurait réglé le bug en cassant la rampe qui existe précisément
     * parce que 76 morts sur 572 runs tombaient à la manche 3.
     */
    const s = partie(SANG);
    expect(s.inGrace).toBe(true);
    s.input({ kind: "click", x: 0, y: 0 } as never, 100);
    expect(s.phase, "une maladresse tue de nouveau à l'échauffement").toBe("playing");
  });

  it("hors échauffement, elle tuait déjà — et elle tue toujours", () => {
    const s = partie();
    // On laisse filer les manches d'ÉCHAUFFEMENT seulement. Il en laissait
    // filer une de plus, hors échauffement : le run ne survivait que parce
    // que sa graine tirait là une manche sans geste (« NE FAIS RIEN » ou un
    // piège). Retirée au catalogue 3, la manche tuait au temps — le test
    // passait par chance (§11).
    for (let i = 0; i < GRACE_ROUNDS; i++) s.tick(999_999 * (i + 1));
    expect(s.inGrace).toBe(false);
    expect(s.phase, "le run doit encore tourner").toBe("playing");
    expect(s.input({ kind: "release", key: " " }, 100).kind).toBe("death");
  });
});
