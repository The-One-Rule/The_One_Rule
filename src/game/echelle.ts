/**
 * L'ÉCHELLE DE MAÎTRISE — six cases, jamais un pourcentage.
 *
 * Pierre demandait « GAUCHER ███████░░░ 72 % ». La maquette dit l'inverse —
 * « MAÎTRISE · SIX SEGMENTS, JAMAIS UN POURCENTAGE » — et elle a raison : 72 %
 * ne se joue pas. « Il te manque 4 manches pour la case suivante » se joue. Un
 * pourcentage est un thermomètre, six cases sont une liste de courses.
 *
 * ⚠️ **AUCUNE CASE N'EST INVENTÉE.** Chacune se dérive d'un levier qui existait
 * déjà dans le code — c'est ce qui garantit qu'elles sont atteignables et qu'on
 * n'a pas inventé une progression décorative par-dessus le jeu.
 *
 * ⚠️ **LA CASE 2 EST REMPLACÉE, JAMAIS OFFERTE.** Sept règles sur seize ne
 * portent pas `traps` (neuf en portent) : leur demander un piège déjoué rendrait
 * la case inatteignable, mais la leur donner rendrait leur carte maîtrisée à
 * meilleur compte que les autres — et la maîtrise ne voudrait plus rien dire.
 * Elles doivent donc une SÉRIE de manches consécutives sans faute.
 *
 * La maquette proposait mieux : une condition sur mesure par règle (« L'ÉCLAIR
 * demande une manche réussie sans avoir revu la consigne »). C'est la bonne
 * direction, et elle demande une instrumentation par règle dans le moteur —
 * donc une mesure avant, pas sept conditions inventées un soir.
 */
import { PACE_DEFAULT } from "../engine/difficulty";
import type { OneRule } from "../engine/types";
import { MANCHES_MAITRISE } from "./maitrise";
import type { RuleRecord } from "./progress";

/** Les trois allures qui comptent pour la maîtrise. */
export const ALLURES_MAITRISE = [1.5, PACE_DEFAULT, 0.8] as const;

/**
 * La série exigée d'une règle qui ne piège pas.
 *
 * Sous le palier de manches, pour que la case reste franchissable avant les
 * trois cases d'allure — c'est une épreuve de régularité, pas un second seuil
 * de score.
 */
export const SERIE_EPREUVE = 10;

/** L'identifiant d'une case. Le rendu en fait une phrase, jamais l'inverse. */
export type CaseId =
  | "rencontree"
  | "piege"
  | "serie"
  | "allure15"
  | "allure10"
  | "allure08"
  | "sansFaute";

export interface CaseMaitrise {
  id: CaseId;
  faite: boolean;
  /** Ce qu'il reste à faire, quand ça se compte. `null` quand c'est un oui/non. */
  reste: number | null;
}

/**
 * Les six cases d'une règle, dans l'ordre où on les franchit.
 *
 * @param rec `undefined` = jamais rencontrée : toutes les cases sont vides, et
 * c'est l'appelant qui décide de montrer une carte verrouillée plutôt qu'une
 * carte à zéro.
 */
export function echelleMaitrise(regle: OneRule, rec: RuleRecord | undefined): CaseMaitrise[] {
  const best = rec?.best ?? 0;
  const pieges = rec?.pieges ?? 0;
  const serie = rec?.serie ?? 0;
  const parAllure = rec?.parAllure ?? {};
  const cases: CaseMaitrise[] = [];

  cases.push({ id: "rencontree", faite: !!rec, reste: null });

  // La case ÉPROUVÉE : un piège déjoué, ou — pour les sept règles qui n'en
  // posent aucun — une série de manches consécutives sans faute.
  if (regle.traps) {
    cases.push({ id: "piege", faite: pieges >= 1, reste: pieges >= 1 ? null : 1 });
  } else {
    cases.push({
      id: "serie",
      faite: serie >= SERIE_EPREUVE,
      reste: serie >= SERIE_EPREUVE ? null : SERIE_EPREUVE - serie,
    });
  }

  for (const [allure, id] of [
    [1.5, "allure15"],
    [PACE_DEFAULT, "allure10"],
    [0.8, "allure08"],
  ] as const) {
    const fait = parAllure[String(allure)] ?? 0;
    cases.push({
      id,
      faite: fait >= MANCHES_MAITRISE,
      reste: fait >= MANCHES_MAITRISE ? null : MANCHES_MAITRISE - fait,
    });
  }

  cases.push({ id: "sansFaute", faite: !!rec?.sansFaute, reste: null });

  // ⚠️ `best` n'entre dans AUCUNE case, et ce n'est pas un oubli : il ne dit
  // pas à quelle allure il a été obtenu. Un record de 40 fait à DÉBUT ne prouve
  // rien sur RAPIDE. Il reste affiché à côté, comme un fait, pas comme une
  // preuve.
  void best;
  return cases;
}

/** Combien de cases sont franchies. C'est le chiffre que la carte affiche. */
export const franchies = (cases: CaseMaitrise[]): number =>
  cases.reduce((n, c) => n + (c.faite ? 1 : 0), 0);

/**
 * PARFAITE : les six cases.
 *
 * ⚠️ `estMaitrisee` ne change PAS de sens et reste la condition d'avant
 * (`MANCHES_MAITRISE` tenues + un piège déjoué). Elle décide de ce que le
 * carnet compte et de ce que l'entraînement ciblé déverrouille : la durcir de
 * trois allures d'un coup ferait reculer tous les compteurs de tous les joueurs
 * le jour du déploiement, sur un seuil dont on sait déjà qu'il n'est pas mesuré.
 */
export const estParfaite = (regle: OneRule, rec: RuleRecord | undefined): boolean =>
  franchies(echelleMaitrise(regle, rec)) === 6;

/**
 * Ce qu'un run apprend sur une règle — lu dans les marques du moteur.
 *
 * 🟩 manche propre · 🟦 piège déjoué · 🟨 faute pendant l'échauffement, qui ne
 * tue pas · 🟥 la mort. On n'ajoute rien au moteur : tout est déjà là.
 */
export function lisRun(marks: readonly string[]): { serie: number; sansFaute: boolean } {
  let serie = 0;
  let meilleure = 0;
  let fautes = 0;
  for (const m of marks) {
    if (m === "🟩" || m === "🟦") {
      serie++;
      if (serie > meilleure) meilleure = serie;
    } else {
      if (m === "🟨") fautes++;
      serie = 0;
    }
  }
  /*
   * SANS FAUTE : le palier atteint sans une seule maladresse.
   *
   * Le 🟥 final ne compte pas — un run d'entraînement se termine toujours par
   * une mort, et l'exiger rendrait la case inatteignable ailleurs que sur un
   * run du jour bouclé. Ce qu'on regarde, ce sont les 🟨 : les fautes commises
   * pendant l'échauffement, où elles ne coûtent rien et ne se voient pas.
   */
  return { serie: meilleure, sansFaute: fautes === 0 && meilleure >= MANCHES_MAITRISE };
}
