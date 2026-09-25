/**
 * @vitest-environment jsdom
 *
 * LES TROIS PANNES DU PLAYTEST DU JOUR 247.
 *
 * Rapportées de vive voix, dans ces termes : « timing mauvais sur la règle
 * l'éclair qui ne faisait littéralement pas apparaître les consignes »,
 * « freeze multiple (en multi) », « le bouton pour rejouer qui bug en silence,
 * par exemple sur la run du jour en solo ».
 *
 * Les trois avaient la même signature : AUCUNE erreur, aucun test rouge, rien
 * dans les journaux. Un texte qui ne s'affiche pas, un écran qui s'arrête, un
 * bouton qui ne fait rien — trois pannes muettes, c'est-à-dire trois pannes
 * qu'aucune vérification existante ne pouvait attraper. Ce fichier existe pour
 * qu'elles cessent d'être muettes.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Round } from "../src/engine/types";
import { actionsDeFin } from "../src/render/finactions";
import type { EtatFin } from "../src/render/finactions";

/** Un run du jour ordinaire — seul `essaisRestants` varie dans les cas ci-dessous. */
const FIN_JOUR: EtatFin = {
  mode: "daily",
  duel: false,
  essaisRestants: 3,
  duelPossible: true,
};

let nowMs = 0;

beforeAll(() => {
  const html = readFileSync("index.html", "utf8");
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, "");
  // Le HUD lit `performance.now()` pour son horloge de LECTURE : on la pilote.
  globalThis.performance = { now: () => nowMs } as never;
});

/** Une manche minimale portant la déformation de L'ÉCLAIR. */
const mancheEclair = (hideTextAtMs: number): Round =>
  ({
    instructionId: "test",
    text: "CLIQUE LE CARRÉ",
    ents: [],
    steps: [],
    trap: false,
    durationMs: 1500,
    hideTextAtMs,
  }) as unknown as Round;

describe("L'ÉCLAIR — le masquage suit le temps de LECTURE, pas le temps de manche", () => {
  it("affiche la consigne même quand le temps de manche est déjà écoulé (kill-cam)", async () => {
    const { Hud } = await import("../src/render/hud");
    const hud = new Hud();
    const instr = document.getElementById("instr")!;

    nowMs = 10_000;
    /*
     * LE CAS EXACT DE LA KILL-CAM.
     *
     * `syncFrame` y passe `camRound.durationMs` comme temps écoulé — une valeur
     * TOUJOURS supérieure à `hideTextAtMs`. Sous L'ÉCLAIR, la consigne du mort
     * n'était donc jamais montrée, dans le seul écran qui existe pour montrer
     * ce qui vient de se passer.
     */
    hud.updateRound(mancheEclair(320), 1500, 1);
    expect(
      instr.textContent!.trim(),
      "la consigne doit paraître : le temps de manche n'est pas le temps de lecture",
    ).toBe("CLIQUE LE CARRÉ");
  });

  it("masque bien la consigne une fois le temps de lecture dépassé", async () => {
    const { Hud } = await import("../src/render/hud");
    const hud = new Hud();
    const instr = document.getElementById("instr")!;
    const manche = mancheEclair(320);

    nowMs = 50_000;
    hud.updateRound(manche, 0, 0);
    expect(instr.textContent!.trim(), "juste affichée, elle doit être lisible").toBe(
      "CLIQUE LE CARRÉ",
    );

    // 400 ms de LECTURE plus tard, au-delà des 320 ms de la règle
    nowMs = 50_400;
    hud.updateRound(manche, 400, 0.3);
    expect(instr.textContent!.trim(), "L'ÉCLAIR doit bel et bien la faire disparaître").toBe("");
  });

  it("la latence réseau ne mange plus la fenêtre de lecture", async () => {
    const { Hud } = await import("../src/render/hud");
    const hud = new Hud();
    const instr = document.getElementById("instr")!;

    /*
     * En multi, `elapsedMs = clock.now() − startAt` : le temps de vol du
     * message est déjà consommé à la première image. Avec 300 ms de latence et
     * `hideTextAtMs` à 320, l'ancienne formule ne laissait que 20 ms — c'est
     * le « littéralement pas apparaître », et il frappait d'abord les joueurs
     * sur téléphone.
     */
    nowMs = 90_000;
    hud.updateRound(mancheEclair(320), 300, 0.2);
    expect(
      instr.textContent!.trim(),
      "un joueur en 300 ms de latence doit voir sa consigne comme les autres",
    ).toBe("CLIQUE LE CARRÉ");
  });

  it("chaque manche neuve fait repartir l'horloge de lecture", async () => {
    const { Hud } = await import("../src/render/hud");
    const hud = new Hud();
    const instr = document.getElementById("instr")!;

    nowMs = 200_000;
    const premiere = mancheEclair(320);
    hud.updateRound(premiere, 0, 0);
    nowMs = 200_400;
    hud.updateRound(premiere, 400, 0.3);
    expect(instr.textContent!.trim(), "la première est masquée").toBe("");

    /*
     * Manche SUIVANTE, même texte. C'est le cas qui interdit d'identifier une
     * manche par son contenu : deux manches consécutives peuvent parfaitement
     * demander la même chose, et l'horloge doit repartir quand même.
     */
    hud.updateRound(mancheEclair(320), 400, 0);
    expect(instr.textContent!.trim(), "la suivante doit être lisible à son tour").toBe(
      "CLIQUE LE CARRÉ",
    );
  });
});

describe("FREEZE MULTI — une manche absente ne doit jamais être déréférencée", () => {
  /*
   * `rebuildViewRound` pose délibérément `match.round = null` quand la règle
   * annoncée ne se résout pas dans ce bundle — décalage de versions entre le
   * front (Vercel) et les salons (Fly), qui se déploient séparément. Sa note
   * l'assume : « un champ vide est un mauvais moment ; une scène fausse est un
   * mensonge ».
   *
   * Le consommateur, lui, écrivait `match.round!`. Ce `!` affirme au
   * compilateur exactement ce que la fonction d'à côté vient d'infirmer, et
   * TypeScript ne peut pas l'attraper — c'est le propre d'une assertion. D'où
   * un test sur la SOURCE : c'est le seul endroit d'où l'on voit les deux
   * moitiés en même temps.
   *
   * La panne était totale et silencieuse : TypeError à chaque image, donc plus
   * aucun rendu. La boucle de `main.ts` replanifie son `requestAnimationFrame`
   * AVANT son corps, donc elle ne meurt pas — elle tourne à vide, ce qui
   * explique qu'aucun journal ne montrait un arrêt.
   */
  const source = readFileSync("src/multi.ts", "utf8");

  it("aucun `match.round!` ne subsiste dans multi.ts", () => {
    const lignes = source
      .split("\n")
      .map((l, i) => ({ n: i + 1, l }))
      .filter(({ l }) => /match\.round!/.test(l) && !l.trimStart().startsWith("*"));
    expect(
      lignes.map(({ n, l }) => `${n}: ${l.trim()}`),
      "un `!` sur match.round rend le freeze possible — garder le champ vide",
    ).toEqual([]);
  });

  it("syncFrame sort par un champ vide quand la manche manque", () => {
    // La garde et sa sortie propre doivent être présentes toutes les deux.
    expect(source, "la garde `if (!match.round)` a disparu").toMatch(/if\s*\(!match\.round\)/);
    const apresGarde = source.slice(source.indexOf("if (!match.round)"));
    expect(
      apresGarde.slice(0, 1200),
      "la garde doit vider le champ plutôt que de laisser l'écran figé",
    ).toMatch(/hud\.clearRound\(\)/);
  });
});

describe("REJOUER — le run du jour se rejoue tant qu'il reste un essai", () => {
  /*
   * Le bouton et la fonction se contredisaient. `btnAgain` n'est désactivé
   * qu'à zéro essai et affiche « REJOUER » ; `replay()` gardait le garde-fou
   * de l'époque où le run du jour ne se jouait qu'une fois, et sortait sur un
   * `return` nu. Le joueur cliquait, et rien.
   *
   * Un refus muet se lit comme un jeu cassé, jamais comme une règle : c'est
   * l'état le plus coûteux des trois possibles, devant le refus expliqué et
   * devant l'autorisation.
   */
  const source = readFileSync("src/main.ts", "utf8");
  /*
   * ⚠️ ON DÉCOUPE JUSQU'À L'ACCOLADE FERMANTE, PAS SUR UN NOMBRE D'OCTETS.
   *
   * La fenêtre était de 1800 caractères. Ajouter un commentaire dans
   * `replay()` a repoussé l'appel hors de cette fenêtre, et les deux
   * assertions se sont mises à décrire du code qu'elles ne lisaient plus —
   * l'une en échouant, l'autre en passant pour rien. Une borne qui dépend de
   * la longueur des commentaires n'est pas une borne.
   */
  const debut = source.indexOf("function replay()");
  const corps = source.slice(debut, source.indexOf("\n}", debut) + 2);

  it("replay() ne sort plus sans rien faire sur le run du jour", () => {
    expect(
      /if\s*\(pendingMode === "daily"\)\s*return;/.test(corps),
      "le retour sec est revenu : le bouton REJOUER redeviendrait muet",
    ).toBe(false);
  });

  it("replay() mène bien au brief du jour", () => {
    expect(corps, "le run du jour doit repasser par son annonce").toMatch(
      /openBrief\([^)]*"daily"/,
    );
  });

  it("le brief du jour se verrouille aussi, et pas seulement les portes", () => {
    /*
     * LA FUITE TROUVÉE EN VÉRIFIANT LE CORRECTIF PRÉCÉDENT.
     *
     * `vueDuJour().verrouille` était appliqué sur `#btnDaily` et sur
     * `#btnAgain`, jamais sur le brief lui-même — or `navDaily` l'ouvre
     * directement depuis la barre du bas. Mesuré dans le navigateur : trois
     * essais consommés, « 0 / 3 ESSAIS » à l'écran, COMMENCER actif, et le
     * quatrième run partait.
     *
     * Le garde-fou appartient au point de passage COMMUN, pas à chaque porte —
     * la prochaine porte oubliera de le poser.
     */
    expect(source, "le brief doit calculer si la journée est close").toMatch(
      /const closeJour = mode === "daily"[\s\S]{0,80}verrouille/,
    );
    expect(source, "et désactiver COMMENCER en conséquence").toMatch(/go\.disabled = closeJour/);
  });

  it("lanceRun refuse un jour verrouillé — le point de passage commun", () => {
    /*
     * Les boutons et le clavier peuvent mentir. Le lancement, lui, ne doit
     * pas. Sans cette garde, le battement de lecture (3 s) laissait la
     * sync recoller « 0 / 3 » puis lançait quand même.
     */
    const debut = source.indexOf("function lanceRun()");
    expect(debut, "lanceRun a disparu").toBeGreaterThan(-1);
    const corpsLance = source.slice(debut, source.indexOf("\n}", debut) + 2);
    expect(corpsLance, "lanceRun ne consulte plus verrouille").toMatch(/verrouille/);
  });

  it("le clavier du brief respecte l'état de COMMENCER", () => {
    /*
     * ESPACE et ENTRÉE appelaient `startRun()` sans regarder le bouton, donc
     * contournaient le verrou qu'on vient de poser. `R` sur l'écran de fin
     * montrait déjà la bonne forme : consulter `disabled` plutôt que de
     * dupliquer la condition.
     */
    expect(source).toMatch(
      /e\.key === " " \|\| e\.key === "Enter"\)\s*&&\s*!\$<HTMLButtonElement>\("btnGo"\)\.disabled/,
    );
  });

  it("le bouton reste actif tant qu'un essai demeure — les deux moitiés d'accord", () => {
    /*
     * L'autre moitié du contrat. Si celle-ci changeait sans l'autre, on
     * retomberait exactement dans la panne : un bouton qui promet ce que la
     * fonction refuse.
     *
     * ⚠️ CETTE ASSERTION LISAIT LA SOURCE, ELLE MESURE DÉSORMAIS LE COMPORTEMENT.
     *
     * Elle exigeait le motif `mode === "daily" && !challenge && essaisRestants
     * === 0` dans `main.ts`. La décision est sortie dans `render/finactions.ts`
     * — sixième module de priorité pure du dépôt — et le motif a disparu :
     * l'assertion est tombée en décrivant du code qui n'existait plus, alors
     * que la RÈGLE, elle, n'avait pas bougé.
     *
     * Un filet qui surveille une forme d'écriture se casse à chaque
     * réorganisation et ne dit rien sur le fond. Celui-ci interroge maintenant
     * la fonction : il survivra au prochain déplacement, et il tombera si la
     * règle change vraiment.
     */
    expect(
      actionsDeFin({ ...FIN_JOUR, essaisRestants: 2 }).bloquee,
      "il reste deux essais et le bouton est bloqué",
    ).toBe(false);
    expect(
      actionsDeFin({ ...FIN_JOUR, essaisRestants: 0 }).bloquee,
      "plus aucun essai et le bouton lance quand même",
    ).toBe(true);
    expect(
      actionsDeFin({ ...FIN_JOUR, essaisRestants: 0 }).principale,
      "un refus muet se lit comme un jeu cassé : le bouton doit DIRE la règle",
    ).toBe("demain");
  });
});
