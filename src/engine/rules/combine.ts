/**
 * Tenir PLUSIEURS règles à la fois.
 *
 * C'est la réponse la moins chère au chiffre le plus inquiétant du jour 3 : les
 * morts sur la règle unique — donc sur le PIÈGE, le seul élément non copiable
 * du jeu — sont tombées à 4,1 %. La cause est mécanique : cinq règles sur douze
 * seulement portent `traps: true`, et le catalogue ouvert en a dilué
 * l'exposition.
 *
 * Empiler des règles multiplie les pièges sans en écrire une seule nouvelle :
 * une consigne devient un piège si elle viole N'IMPORTE LAQUELLE des règles
 * tenues. Le catalogue porte déjà de quoi faire — la dette n°7 parle de 45
 * combinaisons à deux règles.
 *
 * LE POINT DE CONCEPTION QUI FAIT TOUT : la composée EST une `OneRule`.
 *
 * Rien en aval ne change. `buildRound` la reçoit comme une règle ordinaire,
 * `resolveAction` la juge, `verify.ts` rejoue avec, le bandeau l'affiche, et le
 * multijoueur pourrait la transporter. C'est ce qui fait tenir ce mode en un
 * fichier au lieu d'une refonte.
 */
import { ONE_RULES } from "./index";
import type { Entity, OneRule, Round, Rng, Want } from "../types";

/**
 * Paires qui produisent des manches INJOUABLES, et non difficiles.
 *
 * `eclair` cache la consigne à `hideTextAtMs` (320 à 620 ms selon le niveau).
 * `menteur` en affiche une fausse et la corrige à `revealAtMs` (350 ms). Quand
 * la disparition précède la correction, le joueur ne voit JAMAIS la vraie
 * consigne : il ne perd pas parce qu'il a mal joué, il perd parce que le jeu ne
 * lui a rien montré.
 *
 * Mesuré sur 40 manches : 11 falsifiées, dont 1 illisible. C'est peu — et
 * c'est exactement le genre de « peu » qui fait dire « le jeu triche », le seul
 * risque que ce projet tient pour fatal.
 *
 * La liste est volontairement minimale : on n'y met que ce qu'on a mesuré.
 */
const INCOMPATIBLES: ReadonlyArray<readonly [string, string]> = [["eclair", "menteur"]];

/** Ces deux règles peuvent-elles être tenues en même temps ? */
export function compatibles(a: OneRule, b: OneRule): boolean {
  if (a.id === b.id) return false;
  return !INCOMPATIBLES.some(
    ([x, y]) => (a.id === x && b.id === y) || (a.id === y && b.id === x),
  );
}

/** Une règle peut-elle rejoindre une pile déjà constituée ? */
export const compatibleAvec = (pile: readonly OneRule[], r: OneRule): boolean =>
  pile.every((p) => compatibles(p, r));

/**
 * Fusionne des règles en une seule, jouable partout où une règle l'est.
 *
 * L'ORDRE DES `transform` N'EST PAS LIBRE, et c'est mesuré : LE JUMEAU double
 * les étapes en étendant la fenêtre, L'ACCÉLÉRATION la coupe de 30 %. Au
 * niveau 20, jumeau puis accélération donne 843 ms ; l'inverse en donne 927.
 * Dix pour cent d'écart pour un simple ordre d'application.
 *
 * On applique donc dans l'ordre du CATALOGUE, jamais dans celui où le joueur a
 * reçu ses règles : deux joueurs tenant les mêmes deux règles doivent jouer la
 * même manche, quel que soit l'ordre dans lequel ils les ont gagnées.
 */
export function combineRules(rules: readonly OneRule[]): OneRule {
  if (rules.length === 0) throw new Error("combineRules : pile vide");
  if (rules.length === 1) return rules[0]!;

  const rang = (r: OneRule) => {
    const i = ONE_RULES.findIndex((x) => x.id === r.id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const ordre = [...rules].sort((a, b) => rang(a) - rang(b));

  return {
    id: ordre.map((r) => r.id).join("+"),
    name: ordre.map((r) => r.name).join(" + "),
    brief: ordre.map((r) => r.brief).join(" "),
    // Une pile piège dès qu'UNE de ses règles piège.
    traps: ordre.some((r) => r.traps),
    forbids: (want: Want, ents: Entity[]) => ordre.some((r) => r.forbids(want, ents)),
    /*
     * Le PREMIER motif trouvé, dans l'ordre du catalogue.
     *
     * Une action peut enfreindre deux règles à la fois — cliquer une pièce
     * rouge dans la zone interdite. Le joueur n'a besoin que d'une raison, et
     * la même action doit toujours produire le même motif, sinon l'écran de
     * mort raconte une histoire différente selon l'ordre d'acquisition.
     */
    judge: (action, ctx) => {
      for (const r of ordre) {
        const motif = r.judge(action, ctx);
        if (motif) return motif;
      }
      return null;
    },
    transform: ordre.some((r) => r.transform)
      ? (round: Round, rng: Rng, level: number) =>
          ordre.reduce((acc, r) => (r.transform ? r.transform(acc, rng, level) : acc), round)
      : undefined,
    // Une seule bande interdite peut s'afficher, et une seule règle en porte
    // une aujourd'hui. Si une deuxième arrive, ce `find` devra devenir un choix
    // explicite plutôt qu'un premier-arrivé silencieux.
    zone: ordre.find((r) => r.zone)?.zone,
    watchRelease: ordre.find((r) => r.watchRelease)?.watchRelease,
  };
}
