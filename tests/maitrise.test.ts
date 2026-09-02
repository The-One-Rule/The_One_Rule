/**
 * CE QUE « MAÎTRISER UNE RÈGLE » VEUT DIRE.
 *
 * Pas un calcul : une DÉCISION. Elle fixe ce que l'entraînement ciblé
 * récompense, donc ce que les joueurs vont s'entraîner à faire — et c'est
 * exactement le genre de règle qui se lit juste et se comporte faux quand elle
 * vit en `if` successifs au milieu d'une fonction de rendu.
 *
 * Le point de conception que ce fichier garde : le PIÈGE compte plus que les
 * manches. Ouvrir le catalogue d'entraînement avait fait tomber les morts sur
 * le piège de 42,9 % à 4,1 % sans que personne l'ait prévu ; s'entraîner règle
 * par règle pousse dans le même sens, et plus fort.
 */
import { describe, expect, it } from "vitest";
import { MANCHES_MAITRISE, estMaitrisee, resteAMaitriser } from "../src/game/maitrise";
import { ONE_RULES } from "../src/engine/rules";
import { majCarnet } from "../src/game/progress";
import type { RuleRecord } from "../src/game/progress";

const piegeuse = ONE_RULES.find((r) => r.traps)!;
const inerte = ONE_RULES.find((r) => !r.traps)!;

const rec = (o: Partial<RuleRecord>): RuleRecord => ({ best: 0, cleared: false, ...o });

describe("maîtriser une règle", () => {
  it("une règle jamais rencontrée n'est pas maîtrisée", () => {
    // Elle n'est pas non plus « ratée » : elle est VERROUILLÉE, et c'est
    // l'écran qui fait la différence — les deux ne se montrent pas pareil.
    expect(estMaitrisee(piegeuse, undefined)).toBe(false);
    expect(estMaitrisee(inerte, undefined)).toBe(false);
  });

  it("les manches seules ne suffisent pas sur une règle qui piège", () => {
    /*
     * LE CŒUR DU DISPOSITIF. Un joueur peut accumuler des manches sous LE SANG
     * sans jamais rencontrer un piège — une règle piégeuse seule n'en produit
     * que ~11 %. Le laisser passer pour « maîtrisé » récompenserait la moitié
     * COPIABLE de TOR, celle qui ressemble à n'importe quel jeu de réflexes.
     */
    expect(estMaitrisee(piegeuse, rec({ best: 999, pieges: 0 }))).toBe(false);
    expect(estMaitrisee(piegeuse, rec({ best: MANCHES_MAITRISE, pieges: 1 }))).toBe(true);
  });

  it("une règle qui ne piège pas ne peut pas exiger un piège", () => {
    // Sept règles sur douze ne portent pas `traps` : leur demander un piège
    // rendrait la barre inatteignable, et « maîtrisée » impossible pour plus
    // de la moitié du catalogue.
    expect(estMaitrisee(inerte, rec({ best: MANCHES_MAITRISE }))).toBe(true);
    expect(estMaitrisee(inerte, rec({ best: MANCHES_MAITRISE - 1 }))).toBe(false);
  });

  it("le palier de manches est une borne INFÉRIEURE, pas une égalité", () => {
    expect(estMaitrisee(inerte, rec({ best: MANCHES_MAITRISE + 40 }))).toBe(true);
  });

  it("un carnet d'avant le compteur de pièges ne plante pas", () => {
    /*
     * `pieges` est absent des entrées déjà écrites — le champ est arrivé après.
     * Absent vaut ZÉRO, la même doctrine que `clavier` et que le jeton : une
     * sauvegarde ancienne doit se comporter comme un joueur qui n'a encore
     * rien fait, jamais comme une erreur.
     */
    const ancien = { best: 40, cleared: true } as RuleRecord;
    expect(estMaitrisee(piegeuse, ancien)).toBe(false);
    expect(estMaitrisee(inerte, ancien)).toBe(true);
  });

  it("chaque règle du catalogue est ATTEIGNABLE", () => {
    // Le garde-fou qui compte : une règle qu'aucun joueur ne pourrait jamais
    // maîtriser serait une case définitivement grise dans la grille, et le
    // compteur ne pourrait jamais atteindre son total.
    for (const r of ONE_RULES) {
      expect(estMaitrisee(r, rec({ best: MANCHES_MAITRISE, pieges: 1 })), r.id).toBe(true);
    }
  });
});

describe("ce qu'il reste à faire", () => {
  it("compte les manches manquantes, et le piège quand il manque", () => {
    expect(resteAMaitriser(piegeuse, rec({ best: 5, pieges: 0 }))).toEqual({
      manches: MANCHES_MAITRISE - 5,
      piege: true,
    });
    expect(resteAMaitriser(piegeuse, rec({ best: 5, pieges: 2 }))).toEqual({
      manches: MANCHES_MAITRISE - 5,
      piege: false,
    });
  });

  it("ne compte jamais un piège sur une règle qui n'en pose pas", () => {
    expect(resteAMaitriser(inerte, rec({ best: 0 })).piege).toBe(false);
  });

  it("ne descend pas sous zéro", () => {
    // Un reste négatif s'afficherait tel quel : « −12 MANCHES ».
    expect(resteAMaitriser(inerte, rec({ best: 200 })).manches).toBe(0);
  });

  it("une règle jamais rencontrée demande tout", () => {
    expect(resteAMaitriser(piegeuse, undefined)).toEqual({
      manches: MANCHES_MAITRISE,
      piege: true,
    });
  });

  it("« rien ne reste » et « maîtrisée » disent la même chose", () => {
    /*
     * Les deux fonctions se lisent l'une à côté de l'autre à l'écran : la puce
     * dit « maîtrisée », l'aide dit ce qui manque. Si elles divergeaient, un
     * joueur lirait « MAÎTRISÉE » sous une ligne qui lui réclame deux manches.
     */
    for (const r of ONE_RULES) {
      for (const best of [0, 1, MANCHES_MAITRISE - 1, MANCHES_MAITRISE, 99]) {
        for (const pieges of [0, 1, 5]) {
          const e = rec({ best, pieges });
          const reste = resteAMaitriser(r, e);
          const rienNeReste = reste.manches === 0 && !reste.piege;
          expect(rienNeReste, `${r.id} best=${best} pieges=${pieges}`).toBe(estMaitrisee(r, e));
        }
      }
    }
  });
});

describe("ce qu'une partie ajoute au carnet", () => {
  /*
   * La formule était écrite DEUX fois — ici et dans `finishRun` — et seule
   * celle de `main.ts` tournait vraiment, sans qu'aucun test ne l'atteigne.
   * Une formule dupliquée dont une moitié est testée finit par diverger, et le
   * symptôme serait un carnet qui compte faux, en silence.
   */
  it("le record MONTE, il ne redescend pas", () => {
    expect(majCarnet({ best: 30, cleared: false }, 12, false, 0).best).toBe(30);
    expect(majCarnet({ best: 30, cleared: false }, 44, false, 0).best).toBe(44);
  });

  it("un run terminé le reste", () => {
    expect(majCarnet({ best: 40, cleared: true }, 3, false, 0).cleared).toBe(true);
  });

  it("les pièges S'ADDITIONNENT — c'est le seul cumul du carnet", () => {
    /*
     * Et c'est justement pour ça que la fusion inter-appareils en prend le
     * MAXIMUM (voir `shared/compte.ts`) : sommer deux appareils doublerait le
     * compteur à chaque synchro, et « maîtrisée » se déclencherait tout seul.
     */
    let r = majCarnet(undefined, 5, false, 2);
    expect(r.pieges).toBe(2);
    r = majCarnet(r, 7, false, 3);
    expect(r.pieges).toBe(5);
    r = majCarnet(r, 9, false, 0);
    expect(r.pieges).toBe(5);
  });

  it("une entrée absente vaut zéro partout", () => {
    expect(majCarnet(undefined, 0, false, 0)).toEqual({ best: 0, cleared: false, pieges: 0 });
  });

  it("une entrée d'AVANT le compteur monte à partir de zéro", () => {
    // Les carnets déjà écrits n'ont pas le champ : il ne doit pas donner NaN.
    const ancien = { best: 12, cleared: false } as RuleRecord;
    expect(majCarnet(ancien, 3, false, 2).pieges).toBe(2);
  });

  it("assez de parties finissent par maîtriser une règle qui piège", () => {
    /*
     * Le bout par lequel la boucle se referme : on rencontre la règle, on la
     * travaille, on progresse. Si aucune suite de parties plausible n'y menait,
     * la grille afficherait un objectif décoratif.
     */
    let r: RuleRecord | undefined;
    for (let i = 0; i < 6; i++) r = majCarnet(r, 4 + i * 3, false, i === 4 ? 1 : 0);
    expect(estMaitrisee(piegeuse, r)).toBe(true);
  });
});
