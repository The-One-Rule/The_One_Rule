/**
 * L'ESCALIER — vingt paliers, et trois familles de pannes à empêcher.
 *
 * 1. **Une montée qui ne monte pas.** Vingt lignes de données écrites à la
 *    main, c'est vingt occasions de poser un chiffre qui redescend. Rien ne le
 *    dirait : l'écran afficherait sagement un palier 12 plus facile que le 11.
 *
 * 2. **Un mode qui déteint sur les autres.** Trois leviers du moteur sont
 *    devenus paramétrables pour ce mode — longueur, cadence de pièges, allure.
 *    Si l'un d'eux change de valeur par défaut, le run du jour et le rejeu
 *    serveur changent avec, en silence, et tous les scores déjà enregistrés
 *    cessent d'être comparables. C'est la panne la plus chère du lot.
 *
 * 3. **Une fusion qui rétrécit.** `fusionneEscalier` est la seule fusion du
 *    dépôt qui ne soit pas un maximum champ par champ. Une erreur ici fait
 *    reculer une montée à la synchro, sans erreur ni trace.
 */
import { describe, expect, it } from "vitest";
import {
  annonceIci,
  auSommet,
  ESCALIER_VIERGE,
  fusionneEscalier,
  majEscalier,
  PALIER_MAITRISE,
  PALIER_SOMMET,
  PALIERS,
  palierCourant,
  palierN,
  piegeIci,
  VOLEES,
} from "../src/game/escalier";
import type { EtatEscalier } from "../src/game/escalier";
import {
  FORCED_TRAP_ROUNDS,
  PACE_CHOICES,
} from "../src/engine/difficulty";
import { buildRound } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import { ONE_RULES } from "../src/engine/rules";
import { Session } from "../src/game/session";

/* ------------------------------------------------------------------ *
 * 1. La montée monte
 * ------------------------------------------------------------------ */

describe("la montée", () => {
  it("compte vingt paliers numérotés dans l'ordre", () => {
    expect(PALIERS).toHaveLength(20);
    expect(PALIER_SOMMET).toBe(20);
    PALIERS.forEach((p, i) => expect(p.n).toBe(i + 1));
  });

  it("⚠️ DANS une volée, rien ne se relâche — jamais", () => {
    /*
     * PREMIÈRE VERSION DE CE TEST : « rien ne se relâche jamais, nulle part ».
     * Il est tombé DEUX FOIS sur le même palier, et il avait tort les deux
     * fois — c'est la maquette qui a raison, et ses chiffres sont délibérés.
     *
     *   palier 10 · 18 manches · × 1,5 · 1 piège / 4 · annonce une fois sur deux
     *   palier 11 · 15 manches · × 1,0 · 1 piège / 5 · plus aucune annonce
     *
     * Le 11 est la marche la plus dure de toute la montée : c'est l'entrée
     * dans la fenêtre du jeu réel ET le retrait de l'échafaudage, d'un coup.
     * Lui demander EN PLUS autant de manches et autant de pièges que la volée
     * précédente en ferait un mur — c'est-à-dire exactement la falaise déjà
     * mesurée à la manche 3 du run du jour : 76 morts sur 572 runs, plus du
     * double de n'importe quelle autre manche.
     *
     * L'invariant juste est donc plus étroit, et il est celui-là : à
     * l'intérieur d'une volée, la difficulté ne fait que monter. Une volée est
     * un régime ; c'est en CHANGEANT de régime qu'on redistribue.
     */
    for (let n = 2; n <= PALIER_SOMMET; n++) {
      const cur = palierN(n)!;
      const prev = palierN(n - 1)!;
      if (cur.volee !== prev.volee) continue;
      expect(cur.allure, `palier ${n} : la fenêtre s'élargit`).toBe(prev.allure);
      expect(cur.manches, `palier ${n} : moins de manches que le ${n - 1}`)
        .toBeGreaterThanOrEqual(prev.manches);
      // Une cadence plus PETITE veut dire des pièges plus FRÉQUENTS. Elle ne
      // doit donc jamais grandir — sauf en partant de zéro, qui veut dire
      // « aucun piège forcé » et non « des pièges infiniment espacés ».
      if (prev.cadence > 0) {
        expect(cur.cadence, `palier ${n} : les pièges s'espacent`).toBeLessThanOrEqual(prev.cadence);
        expect(cur.cadence).toBeGreaterThan(0);
      }
    }
  });

  it("⚠️ CHANGER de volée coûte toujours l'allure, et la rend strictement", () => {
    /*
     * Le pendant du test ci-dessus, et ce qui l'empêche d'être une échappatoire :
     * si une volée pouvait tout relâcher sans rien serrer, on aurait le droit
     * de redescendre en changeant de régime. Une nouvelle volée DOIT donc payer
     * — et elle paie toujours par la même chose, la fenêtre.
     */
    for (let n = 2; n <= PALIER_SOMMET; n++) {
      const cur = palierN(n)!;
      const prev = palierN(n - 1)!;
      if (cur.volee === prev.volee) continue;
      expect(cur.allure, `la volée de ${n} n'a rien serré`).toBeLessThan(prev.allure);
    }
  });

  it("les quatre volées reprennent les quatre allures du jeu, dans l'ordre", () => {
    // Sans ça, l'escalier inventerait des allures que le reste du jeu ne
    // connaît pas — et un record de palier ne se comparerait à rien.
    expect(VOLEES.map((v) => v.allure)).toEqual([...PACE_CHOICES]);
    for (const p of PALIERS) {
      expect(p.allure).toBe(VOLEES.find((v) => v.id === p.volee)!.allure);
    }
  });

  it("le sommet est bien ce que Pierre a demandé : 50 manches en RAPIDE", () => {
    const sommet = palierN(PALIER_SOMMET)!;
    expect(sommet.manches).toBe(50);
    expect(sommet.allure).toBe(0.8);
  });

  it("⚠️ l'ÉCHAFAUDAGE est retiré AVANT le palier qui déclare la maîtrise", () => {
    /*
     * C'est la condition qui rend l'annonce du piège acceptable malgré la
     * décision n°5. Si un palier ≥ 15 annonçait encore ses pièges, « MAÎTRISÉE »
     * serait obtenue avec une aide — et la case cesserait de vouloir dire ce
     * qu'elle dit partout ailleurs.
     */
    for (const p of PALIERS) {
      if (p.n >= PALIER_MAITRISE) {
        expect(p.annonce, `palier ${p.n} annonce encore ses pièges`).toBe("jamais");
      }
    }
    // Et l'aide a bien existé : sans ça, l'assertion ci-dessus passerait pour
    // rien et le mode n'enseignerait plus le piège du tout.
    expect(PALIERS.some((p) => p.annonce !== "jamais")).toBe(true);
  });

});

/* ------------------------------------------------------------------ *
 * 2. La cadence de pièges
 * ------------------------------------------------------------------ */

describe("la cadence de pièges", () => {
  it("n'ouvre JAMAIS sur un piège", () => {
    /*
     * Ouvrir sur un piège apprendrait « ne rien faire » comme réponse par
     * défaut, ce qui est le contresens exact du jeu.
     */
    for (const p of PALIERS) expect(piegeIci(p, 0)).toBe(false);
  });

  it("tient la fréquence annoncée par le palier", () => {
    const p = palierN(7)!; // cadence 5
    expect(p.cadence).toBe(5);
    expect([1, 2, 3, 4, 5, 6, 9, 10].map((l) => piegeIci(p, l))).toEqual([
      false, false, false, false, true, false, false, true,
    ]);
  });

  it("une volée sans cadence ne force rien", () => {
    const p = palierN(1)!;
    expect(p.cadence).toBe(0);
    for (let l = 0; l < 40; l++) expect(piegeIci(p, l)).toBe(false);
  });

  it("l'annonce est déterministe, jamais tirée au sort", () => {
    expect(annonceIci("toujours", 3)).toBe(true);
    expect(annonceIci("jamais", 3)).toBe(false);
    expect(annonceIci("moitie", 2)).toBe(true);
    expect(annonceIci("moitie", 3)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 3. LE MODE NE DÉTEINT PAS — la famille la plus chère
 * ------------------------------------------------------------------ */

describe("⚠️ rien de ce qui se compare n'a bougé", () => {
  it("`buildRound` sans argument reprend EXACTEMENT `FORCED_TRAP_ROUNDS`", () => {
    /*
     * Trois leviers du moteur sont devenus paramétrables pour l'escalier. Si
     * le DÉFAUT de l'un d'eux dérivait, le run du jour, le multijoueur et le
     * rejeu de `verifyRun` changeraient tous les trois en silence — et tous les
     * scores déjà enregistrés cesseraient d'être comparables sans qu'une seule
     * ligne de test rougisse.
     *
     * On compare donc l'appel nu à l'appel qui passe explicitement l'ancienne
     * constante, sur plusieurs graines et plusieurs niveaux, y compris les
     * manches 2, 5 et 9 où le forçage agit.
     */
    const regle = ONE_RULES.find((r) => r.id === "sang")!;
    for (const graine of [1, 7, 4242, 90210]) {
      for (const lvl of [0, 1, 2, 3, 5, 9, 12, 20]) {
        const nu = buildRound(mulberry32(graine), lvl, regle);
        const explicite = buildRound(mulberry32(graine), lvl, regle, undefined, 1, (l) =>
          FORCED_TRAP_ROUNDS.has(l),
        );
        expect(JSON.stringify(nu), `graine ${graine}, niveau ${lvl}`).toBe(
          JSON.stringify(explicite),
        );
      }
    }
  });

  it("`maxRounds` ne bouge pas sans `longueur`", () => {
    const regle = ONE_RULES.find((r) => r.id === "sang")!;
    const commun = { rule: regle, rng: mulberry32(1), now: 0, seed: 1 } as const;
    expect(new Session({ ...commun, mode: "training" }).maxRounds).toBe(Infinity);
    expect(new Session({ ...commun, mode: "daily" }).maxRounds).toBe(40);
    expect(new Session({ ...commun, mode: "ranked" }).maxRounds).toBe(40);
  });

  it("un palier BORNE bien son run, et à sa propre valeur", () => {
    const regle = ONE_RULES.find((r) => r.id === "sang")!;
    for (const n of [1, 8, 15, 20]) {
      const p = palierN(n)!;
      const s = new Session({
        mode: "training",
        rule: regle,
        rng: mulberry32(3),
        now: 0,
        seed: 3,
        longueur: p.manches,
      });
      expect(s.maxRounds, `palier ${n}`).toBe(p.manches);
    }
  });

  it("l'allure d'un palier agit sur la fenêtre, et rien d'autre", () => {
    /*
     * `pace` est posé APRÈS `place()`, donc deux allures produisent la même
     * scène. C'est ce qui permet à un palier de changer la difficulté sans
     * changer le jeu — et c'est vérifié ici parce que l'escalier en dépend
     * quatre fois.
     */
    const regle = ONE_RULES.find((r) => r.id === "roue")!;
    const lent = buildRound(mulberry32(11), 6, regle, undefined, 2);
    const vif = buildRound(mulberry32(11), 6, regle, undefined, 0.8);
    expect(JSON.stringify(lent.ents)).toBe(JSON.stringify(vif.ents));
    expect(lent.text).toBe(vif.text);
    expect(lent.durationMs).toBeGreaterThan(vif.durationMs);
  });
});

/* ------------------------------------------------------------------ *
 * 4. Ce qu'un essai laisse
 * ------------------------------------------------------------------ */

describe("majEscalier", () => {
  const vierge = (): EtatEscalier => ({ ...ESCALIER_VIERGE });

  it("un palier tenu se franchit, et l'escorte repart à zéro", () => {
    const p1 = palierN(1)!;
    const apres = majEscalier(vierge(), p1.manches);
    expect(apres).toEqual({ palier: 1, essais: 0, meilleur: 0 });
  });

  it("dépasser la cible franchit aussi — on ne punit pas d'avoir tenu plus", () => {
    expect(majEscalier(vierge(), 999).palier).toBe(1);
  });

  it("un palier raté compte un essai et retient le meilleur", () => {
    let e = vierge();
    e = majEscalier(e, 3);
    expect(e).toEqual({ palier: 0, essais: 1, meilleur: 3 });
    e = majEscalier(e, 1);
    expect(e, "un essai plus court n'efface pas le meilleur").toEqual({
      palier: 0,
      essais: 2,
      meilleur: 3,
    });
  });

  it("⚠️ ON NE REDESCEND JAMAIS — cent échecs ne coûtent pas un palier", () => {
    let e: EtatEscalier = { palier: 9, essais: 0, meilleur: 0 };
    for (let i = 0; i < 100; i++) e = majEscalier(e, 0);
    expect(e.palier).toBe(9);
  });

  it("au sommet, plus rien ne bouge", () => {
    const fini: EtatEscalier = { palier: PALIER_SOMMET, essais: 0, meilleur: 0 };
    expect(auSommet(fini)).toBe(true);
    expect(palierCourant(fini)).toBeUndefined();
    expect(majEscalier(fini, 999)).toEqual(fini);
  });

  it("la montée entière se grimpe sans se coincer", () => {
    // Le filet contre une table dont un palier serait injouable ou mal borné :
    // on la parcourt pour de vrai, en tenant exactement chaque cible.
    let e = vierge();
    for (let n = 1; n <= PALIER_SOMMET; n++) {
      const p = palierCourant(e)!;
      expect(p.n).toBe(n);
      e = majEscalier(e, p.manches);
    }
    expect(auSommet(e)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 5. La fusion — la seule qui ne soit pas un maximum champ par champ
 * ------------------------------------------------------------------ */

describe("fusionneEscalier", () => {
  const a: EtatEscalier = { palier: 8, essais: 4, meilleur: 14 };
  const b: EtatEscalier = { palier: 12, essais: 1, meilleur: 3 };

  it("le palier le plus haut gagne, AVEC son escorte", () => {
    /*
     * ⚠️ LE BUG QUE CE TEST EXISTE POUR ATTRAPER. Un maximum champ par champ
     * rendrait `{ palier: 12, essais: 4, meilleur: 14 }` — c'est-à-dire
     * « MEILLEUR ESSAI · 14 manches » affiché sur un palier qui en demande 18,
     * alors que le joueur n'y a jamais joué. Le chiffre est invraisemblable et
     * rien n'avertit.
     */
    expect(fusionneEscalier(a, b)).toEqual(b);
    expect(fusionneEscalier(b, a)).toEqual(b);
  });

  it("à palier égal, le maximum de chaque", () => {
    expect(
      fusionneEscalier({ palier: 5, essais: 2, meilleur: 9 }, { palier: 5, essais: 7, meilleur: 4 }),
    ).toEqual({ palier: 5, essais: 7, meilleur: 9 });
  });

  it("idempotente, commutative, monotone", () => {
    expect(fusionneEscalier(a, a)).toEqual(a);
    expect(fusionneEscalier(a, b)).toEqual(fusionneEscalier(b, a));
    for (const [x, y] of [
      [a, b],
      [b, a],
      [a, undefined],
      [undefined, b],
    ] as const) {
      const f = fusionneEscalier(x, y);
      expect(f!.palier).toBeGreaterThanOrEqual(Math.max(x?.palier ?? 0, y?.palier ?? 0));
    }
  });

  it("absent vaut « pas commencée »", () => {
    expect(fusionneEscalier(undefined, undefined)).toBeUndefined();
    expect(fusionneEscalier(a, undefined)).toEqual(a);
    expect(fusionneEscalier(undefined, a)).toEqual(a);
  });
});
