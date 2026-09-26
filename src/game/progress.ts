import { dayIndex } from "./daily";
import { langueDuNavigateur } from "../i18n";
import { cleEntrainement } from "./perfs";
import { DAILY_ESSAIS, PACE_DEFAULT } from "../engine/difficulty";
import { fusionne } from "../../shared/compte";
import type { Agregats, EscalierEntree } from "../../shared/compte";
import { litEtoiles } from "./parcours";
import { litBoutique } from "./boutique";
import type { EtatBoutique } from "./boutique";

const KEY = "oneRule.save.v1";

export interface RuleRecord {
  best: number;
  cleared: boolean;
  /**
   * Pièges DÉJOUÉS sous cette règle, cumulés.
   *
   * C'est ce qui définit « maîtrisée » (voir `game/maitrise.ts`), et pas le
   * nombre de manches tenues. La raison est mesurée : ouvrir le catalogue
   * d'entraînement a fait passer les règles vues de 1 à 12 et, du même coup,
   * les morts sur le PIÈGE de 42,9 % à 4,1 %. S'entraîner règle par règle
   * pousse dans le même sens — une règle piégeuse seule ne produit que ~11 %
   * de manches piégeuses, et sept règles sur douze n'en produisent aucune.
   *
   * Récompenser les manches tenues, ce serait donc récompenser la moitié
   * COPIABLE de TOR. Le piège est la seule chose que personne ne peut copier ;
   * c'est lui qu'on compte.
   *
   * ⚠️ Absent des sauvegardes d'avant : lire avec `?? 0`, jamais directement.
   */
  pieges?: number;
  /**
   * Le meilleur score de CETTE règle, allure par allure.
   *
   * L'échelle de maîtrise demande de tenir le palier à trois allures : un
   * record global ne dit pas à laquelle il a été obtenu, et 40 manches faites à
   * DÉBUT ne prouvent rien sur RAPIDE.
   *
   * ⚠️ Absent vaut « rien à cette allure ». Les sauvegardes écrites avant ce
   * champ gardent leur `best` — il reste affiché comme un fait, il ne remplit
   * aucune case.
   */
  parAllure?: Record<string, number>;
  /** La plus longue série de manches consécutives sans faute, sur cette règle. */
  serie?: number;
  /** Un run tenu jusqu'au palier sans une seule faute d'échauffement. */
  sansFaute?: boolean;
  /**
   * Combien de runs cette règle a déjà pris.
   *
   * Sert à désigner celle qui RÉSISTE : parmi les règles rencontrées et non
   * maîtrisées, celle qu'on a le plus retentée est celle qui coince. C'est une
   * information que le joueur ne peut pas tenir de tête, et la seule qui
   * désigne un exercice sans qu'il ait à choisir.
   *
   * ⚠️ Une SOMME, comme `pieges`, et pour la même raison : elle compte des
   * occurrences et non un niveau atteint. Elle ne se fusionne donc pas entre
   * appareils autrement qu'au maximum — sommer doublerait le compteur à chaque
   * synchro.
   */
  runs?: number;
  /**
   * L'ESCALIER de cette règle — DONNÉE HÉRITÉE, voir `game/escalier.ts`.
   *
   * Son écran a disparu et plus rien ne l'écrit. On la garde parce qu'un
   * joueur qui avait atteint le palier 15 conserve sa maîtrise
   * (`estMaitrisee`) : l'effacer ferait reculer des cartes en silence.
   */
  escalier?: EscalierEntree;
  /**
   * LE PARCOURS — les étoiles des cinq niveaux du chapitre de cette règle.
   * Voir `game/parcours.ts`. Absent vaut « chapitre jamais joué ».
   */
  etoiles?: number[];
}

import { litProfil } from "../../shared/profil";
import type { Profil } from "../../shared/profil";

export type Theme = "auto" | "clair" | "sombre";
export const THEMES: readonly Theme[] = ["auto", "clair", "sombre"];

export interface Save {
  v: 1;
  anonId: string;
  /** carnet : règles déjà rencontrées et meilleur résultat sur chacune */
  encountered: Record<string, RuleRecord>;
  streak: { count: number; lastDay: number; graceWeek: number; graceLeft: number };
  /** 5 derniers scores, sert à calibrer la quête de performance */
  recent: number[];
  /**
   * Le run du jour. `score` est le MEILLEUR des essais, jamais le dernier.
   *
   * `essais` est arrivé avec les trois tentatives : il est donc absent des
   * sauvegardes déjà écrites. On le lit avec `essaisDuJour`, qui retombe sur
   * `played` — un joueur qui avait joué avant ce changement a bien consommé un
   * essai, et lui en rendre trois d'un coup lui donnerait un avantage sur ceux
   * qui jouent après.
   */
  daily: { day: number; played: boolean; score: number; cleared: boolean; essais?: number };
  quests: { day: number; state: Record<string, number>; claimed: string[] };
  coins: number;
  /** LA BOUTIQUE — styles de pièces possédés et porté. Voir `game/boutique.ts`. */
  boutique: EtatBoutique;
  /** identité du classé : pseudo court et dernier classement connu */
  ranked: { name: string; rating: number; games: number };
  /**
   * Identité multijoueur.
   *
   * `glyph` est la variante de signe choisie par le joueur — le vocabulaire
   * en compte 144, et aucun n'était jusqu'ici montré ni choisi. `matches`
   * compte les parties terminées : à zéro, on est nouveau, et c'est ce qui
   * déclenche l'accueil du débutant.
   */
  multi: { glyph: number; matches: number };
  sound: boolean;
  music: boolean;
  /**
   * Mode daltonien : chaque couleur porte en plus une trame.
   *
   * Purement du rendu — sauf un point de jeu, qui ne pouvait pas être évité :
   * LE DALTONIEN sort du tirage, parce qu'elle deviendrait inerte et donc un
   * avantage gratuit (voir `withoutInk`). C'est la même exception que pour une
   * règle matériellement injouable sur l'appareil.
   */
  daltonien: boolean;
  /**
   * L'APPARENCE de la page. `auto` suit le système (`prefers-color-scheme`),
   * les deux autres le forcent. Purement du rendu : rien du jeu n'en dépend,
   * et elle n'entre ni dans le compte ni dans `VERSION_CONTENU`.
   */
  theme: Theme;
  /**
   * LE PROFIL — carte de visite et photo (`shared/profil.ts`). Local, et
   * relayé aux salons par le `NetClient` ; la photo est réduite à 96 × 96 par
   * le client AVANT d'être stockée.
   */
  profil: Profil;
  /**
   * Voir les photos des AUTRES joueurs. Oui par défaut ; le réglage existe
   * parce qu'une photo est un contenu que personne ne modère : un joueur doit
   * pouvoir ne plus les voir sans quitter le salon.
   */
  photosAutres: boolean;
  /**
   * Langue de l'accueil. Le jeu (règles, consignes, canvas) ne suit pas.
   *
   * À la PREMIÈRE visite, elle suit le navigateur (`langueDuNavigateur`) :
   * un anglophone qui arrivait en français laissait Chrome traduire, et la
   * traduction automatique rend le jeu injouable — elle retraduit les nœuds
   * mutés de façon asynchrone, or la consigne mute à chaque manche.
   *
   * Ensuite c'est un choix, et il ne change plus tout seul : quelqu'un qui a
   * cliqué FR sur un navigateur anglais veut du français.
   *
   * Une valeur hors `{fr,en}` retombe sur le français — on ne laisse pas un
   * localStorage trafiqué éteindre l'écran.
   */
  lang: "fr" | "en";
  bestTraining: number;
  /**
   * Allure choisie pour l'entraînement (voir PACE_CHOICES).
   *
   * Le record `bestTraining` n'est inscrit qu'à l'allure de référence : un
   * record obtenu en DÉCOUVERTE ne se compare pas à un record obtenu en
   * RAPIDE, et un chiffre qui mélange les deux ne veut plus rien dire.
   */
  trainingPace: number;
  /**
   * L'avis a-t-il déjà été demandé (`game/avis.ts`) ? Absent vaut non : les
   * joueurs déjà venus le verront une fois, à leur prochaine fin de partie.
   */
  avisVu?: boolean;
  /** L'invitation à installer a paru (voir `game/installer.ts`). */
  installVu?: boolean;
  /**
   * La première arrivée a-t-elle été vue ?
   *
   * ⚠️ Absent vaut FAUX, donc un joueur déjà venu la verra une fois — c'est
   * assumé et c'est le bon sens du repli : mieux vaut la montrer une fois de
   * trop à quelqu'un qui connaît le jeu que jamais à quelqu'un qui arrive.
   * L'inverse est exactement le défaut qu'on corrige.
   */
  onboarded?: boolean;
  /**
   * Joueur d'AVANT le parcours : il avait déjà joué quand les modes ont
   * commencé à s'ouvrir en jouant. Il garde tout ouvert — lui retirer le run du
   * jour qu'il jouait la veille serait une régression, pas un onboarding.
   *
   * Posé UNE fois, à la relecture d'une sauvegarde qui a un historique mais pas
   * encore de boutique (le champ est arrivé avec le parcours) : une sauvegarde
   * neuve reçoit la boutique dès sa première écriture, donc ne devient jamais
   * vétérane par accident.
   */
  veteran?: boolean;
  /**
   * Règle épinglée pour l'entraînement, ou `null` pour un tirage.
   *
   * Persistée parce que travailler une règle demande PLUSIEURS parties : la
   * remettre au hasard à chaque retour au menu annulerait exactement ce que
   * l'entraînement ciblé sert à faire.
   *
   * Un identifiant inconnu (règle retirée du catalogue, sauvegarde bricolée)
   * ou une règle jamais rencontrée retombe sur le tirage — voir `openBrief`.
   */
  trainingRegle: string | null;
  /** mesure d'usage : consentement, jour de première ouverture, jours vus */
  metrics: { on: boolean; asked: boolean; firstDay: number; lastDay: number };
  /**
   * Records, indexés par CLÉ DE COMPARABILITÉ (voir `game/perfs.ts`).
   *
   * Généralise `bestTraining`, qui reste écrit à côté parce que trois écrans
   * le lisent déjà. La clé porte le mode, le régime et la version de contenu :
   * deux chiffres obtenus dans des conditions différentes ne peuvent donc plus
   * se retrouver dans la même case, ce qui était jusqu'ici évité à la main et
   * seulement pour l'allure.
   */
  records: Record<string, number>;
  /**
   * Le compte, côté appareil.
   *
   * `revendiquePar` retient l'identifiant du compte qui a déjà absorbé la
   * progression de CET appareil. La fusion n'a lieu qu'une fois, et c'est ce
   * champ qui l'empêche de recommencer : sans lui, se connecter sur le
   * téléphone d'un ami aspirerait son carnet et sa série dans son propre
   * compte. Le cas est banal en playtest — vous êtes plusieurs sur les mêmes
   * appareils.
   *
   * Le garde est volontairement LOCAL. Un attaquant qui pourrait le contourner
   * a déjà l'appareil en main, donc déjà tout ce qu'il y a à prendre : le
   * mettre côté serveur ne protégerait de rien de plus et coûterait une table.
   */
  compte: {
    revendiquePar: string | null;
    /**
     * Signe du COMPTE, en index canonique (voir `net/glyph.ts`).
     *
     * `multi.glyph` juste au-dessus est une variante dérivée de l'`anonId` :
     * il ne survit donc pas à un changement d'appareil, alors qu'un signe est
     * précisément ce à quoi les autres vous reconnaissent d'un salon à
     * l'autre. Une fois connecté, c'est celui-ci qui fait foi.
     *
     * `null` = anonyme, et on retombe sur la variante locale.
     */
    glyphe: number | null;
  };
}

const fresh = (): Save => ({
  v: 1,
  anonId: Math.random().toString(36).slice(2, 12),
  encountered: {},
  streak: { count: 0, lastDay: -99, graceWeek: -1, graceLeft: 1 },
  recent: [],
  daily: { day: -1, played: false, score: 0, cleared: false },
  quests: { day: -1, state: {}, claimed: [] },
  coins: 0,
  boutique: { possedes: ["sticker"], porte: "sticker" },
  ranked: { name: "", rating: 1000, games: 0 },
  multi: { glyph: 0, matches: 0 },
  sound: true,
  music: true,
  daltonien: false,
  theme: "auto",
  profil: {},
  photosAutres: true,
  /*
   * Suit le navigateur a la premiere visite. `navigator` peut manquer (test,
   * rendu serveur) : `langueDuNavigateur` retombe alors sur le francais.
   */
  lang: langueDuNavigateur(
    typeof navigator === "undefined" ? undefined : navigator.languages ?? [navigator.language],
  ),
  bestTraining: 0,
  trainingRegle: null,
  /*
   * L'entraînement démarre à l'allure la PLUS LENTE.
   *
   * Il est la rampe d'accès : sa raison d'être est qu'on y apprenne, et le
   * réglage ne sert à rien si personne ne le trouve. Rapporté une première
   * fois : « le mode entraînement est plutôt difficile actuellement », alors
   * que l'allure existait déjà — elle n'était simplement pas celle par défaut.
   * On était donc passé de NORMAL à DÉCOUVERTE (1.5).
   *
   * Rapporté une seconde fois, après playtest : « les nouveaux joueurs galèrent
   * vraiment à comprendre sur leur première run ». Et la mesure donne raison au
   * retour — à 1.5, la fenêtre de la manche 39 vaut 1140 ms pour un besoin
   * estimé à 1100 : DÉCOUVERTE ne tenait qu'à quarante millisecondes près, et
   * seulement sur une consigne à une action. D'où DÉBUT (2.0), où la marge
   * existe vraiment.
   *
   * Le joueur accélère quand il veut, et chaque allure porte sa propre clé de
   * record : passer à NORMAL ne se compare pas à un score fait à DÉBUT.
   */
  trainingPace: 2,
  metrics: { on: true, asked: false, firstDay: -1, lastDay: -1 },
  records: {},
  compte: { revendiquePar: null, glyphe: null },
});

let cache: Save | null = null;

/* ------------------------------------------------------------------ *
 * LA SAUVEGARDE EST UNE DONNÉE QU'ON NE CONTRÔLE PAS
 *
 * ⚠️ UN SEUL CHAMP DU MAUVAIS TYPE TUAIT LE JEU, EN SILENCE. `load` faisait
 * `{ ...fresh(), ...parsed }` : un champ ABSENT retombait bien sur le défaut,
 * mais un champ PRÉSENT au mauvais type écrasait le défaut avec sa valeur.
 * Mesuré dans le navigateur avec `encountered: null` : `Object.keys` lève,
 * l'écran d'accueil s'affiche normalement, et JOUER ne répond plus. Rien à
 * l'écran, rien à réparer pour le joueur — la pire forme de panne.
 *
 * Le cas n'est pas théorique : une sauvegarde peut venir d'une version
 * antérieure, d'un onglet resté ouvert pendant un déploiement, d'une extension
 * qui recopie le stockage, ou d'une main qui édite. C'est la même doctrine que
 * « absent vaut… » : on RECONSTRUIT ce qu'on relit,
 * champ par champ, plutôt que de faire confiance à sa forme.
 * ------------------------------------------------------------------ */

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const nombre = (v: unknown, secours: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : secours;

const booleen = (v: unknown, secours: boolean): boolean =>
  typeof v === "boolean" ? v : secours;

const texte = (v: unknown, secours: string): string => (typeof v === "string" ? v : secours);

/** Une entrée de carnet, reconstruite : tout champ douteux disparaît. */
function normaliseEntree(v: unknown): RuleRecord | null {
  if (!estObjet(v)) return null;
  const e: RuleRecord = { best: nombre(v.best, 0), cleared: booleen(v.cleared, false) };
  if (typeof v.pieges === "number" && Number.isFinite(v.pieges)) e.pieges = v.pieges;
  if (estObjet(v.parAllure)) {
    const par: Record<string, number> = {};
    for (const [k, x] of Object.entries(v.parAllure)) if (typeof x === "number" && Number.isFinite(x)) par[k] = x;
    e.parAllure = par;
  }
  if (typeof v.serie === "number" && Number.isFinite(v.serie)) e.serie = v.serie;
  if (typeof v.sansFaute === "boolean") e.sansFaute = v.sansFaute;
  if (typeof v.runs === "number" && Number.isFinite(v.runs)) e.runs = v.runs;
  // Donnée héritée : on ne garde que sa forme.
  if (estObjet(v.escalier)) e.escalier = v.escalier as unknown as EscalierEntree;
  const et = litEtoiles(v.etoiles);
  if (et) e.etoiles = et;
  return e;
}

/**
 * Reconstruit une sauvegarde sûre à partir de ce qui était stocké.
 *
 * Pure et exportée pour être éprouvée sans navigateur : c'est le seul endroit
 * du jeu qui décide de ce qu'une sauvegarde bricolée vaut.
 */
export function normaliseSave(brut: unknown): Save {
  const d = fresh();
  if (!estObjet(brut)) return d;

  const carnet: Record<string, RuleRecord> = {};
  if (estObjet(brut.encountered)) {
    for (const [id, v] of Object.entries(brut.encountered)) {
      const e = normaliseEntree(v);
      if (e) carnet[id] = e;
    }
  }

  const records: Record<string, number> = {};
  if (estObjet(brut.records)) {
    for (const [k, v] of Object.entries(brut.records)) if (typeof v === "number" && Number.isFinite(v)) records[k] = v;
  }

  const st = estObjet(brut.streak) ? brut.streak : {};
  const dj = estObjet(brut.daily) ? brut.daily : {};
  const qu = estObjet(brut.quests) ? brut.quests : {};
  const rk = estObjet(brut.ranked) ? brut.ranked : {};
  const mu = estObjet(brut.multi) ? brut.multi : {};
  const me = estObjet(brut.metrics) ? brut.metrics : {};
  const cp = estObjet(brut.compte) ? brut.compte : {};

  const s: Save = {
    v: 1,
    anonId: texte(brut.anonId, d.anonId) || d.anonId,
    encountered: carnet,
    streak: {
      count: nombre(st.count, d.streak.count),
      lastDay: nombre(st.lastDay, d.streak.lastDay),
      graceWeek: nombre(st.graceWeek, d.streak.graceWeek),
      graceLeft: nombre(st.graceLeft, d.streak.graceLeft),
    },
    recent: Array.isArray(brut.recent)
      ? brut.recent.filter((x): x is number => typeof x === "number" && Number.isFinite(x))
      : d.recent,
    daily: {
      day: nombre(dj.day, d.daily.day),
      played: booleen(dj.played, d.daily.played),
      score: nombre(dj.score, d.daily.score),
      cleared: booleen(dj.cleared, d.daily.cleared),
      ...(typeof dj.essais === "number" && Number.isFinite(dj.essais) ? { essais: dj.essais } : {}),
    },
    quests: {
      day: nombre(qu.day, d.quests.day),
      state: estObjet(qu.state) ? (qu.state as Record<string, number>) : {},
      claimed: Array.isArray(qu.claimed) ? qu.claimed.filter((x): x is string => typeof x === "string") : [],
    },
    coins: nombre(brut.coins, d.coins),
    boutique: litBoutique(brut.boutique),
    ranked: {
      name: texte(rk.name, d.ranked.name),
      rating: nombre(rk.rating, d.ranked.rating),
      games: nombre(rk.games, d.ranked.games),
    },
    multi: { glyph: nombre(mu.glyph, d.multi.glyph), matches: nombre(mu.matches, d.multi.matches) },
    sound: booleen(brut.sound, d.sound),
    music: booleen(brut.music, d.music),
    daltonien: booleen(brut.daltonien, d.daltonien),
    theme: THEMES.includes(brut.theme as Theme) ? (brut.theme as Theme) : d.theme,
    profil: litProfil(brut.profil),
    photosAutres: booleen(brut.photosAutres, d.photosAutres),
    lang: brut.lang === "fr" || brut.lang === "en" ? brut.lang : "fr",
    bestTraining: nombre(brut.bestTraining, d.bestTraining),
    trainingPace: nombre(brut.trainingPace, d.trainingPace),
    trainingRegle: typeof brut.trainingRegle === "string" ? brut.trainingRegle : null,
    metrics: {
      on: booleen(me.on, d.metrics.on),
      asked: booleen(me.asked, d.metrics.asked),
      firstDay: nombre(me.firstDay, d.metrics.firstDay),
      lastDay: nombre(me.lastDay, d.metrics.lastDay),
    },
    records,
    compte: {
      revendiquePar: typeof cp.revendiquePar === "string" ? cp.revendiquePar : null,
      glyphe: typeof cp.glyphe === "number" && Number.isFinite(cp.glyphe) ? cp.glyphe : null,
    },
  };
  // Les deux drapeaux « déjà vu » : absent vaut NON, et c'est voulu (voir leur
  // commentaire respectif). On ne les pose que s'ils sont vraiment booléens.
  if (typeof brut.onboarded === "boolean") s.onboarded = brut.onboarded;
  if (typeof brut.avisVu === "boolean") s.avisVu = brut.avisVu;
  if (typeof brut.installVu === "boolean") s.installVu = brut.installVu;
  if (typeof brut.veteran === "boolean") s.veteran = brut.veteran;
  else if (!estObjet(brut.boutique) && (s.recent.length > 0 || Object.keys(carnet).length > 0)) s.veteran = true;
  return s;
}

export function load(): Save {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (estObjet(parsed) && parsed.v === 1) {
        cache = normaliseSave(parsed);
        return cache;
      }
    }
  } catch {
    /* stockage indisponible (navigation privée) : on joue quand même, sans mémoire */
  }
  cache = fresh();
  return cache;
}

export function save(s: Save): void {
  cache = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const mutate = (fn: (s: Save) => void): Save => {
  const s = load();
  fn(s);
  save(s);
  return s;
};

/* ------------------------------------------------------------------ *
 * Streak
 * ------------------------------------------------------------------ */

/**
 * Met à jour la série. Un jour de grâce par semaine, non négociable :
 * sans lui, le premier jour manqué détruit la série et le joueur ne revient
 * jamais. Avec lui, il voit "série protégée" et il revient le lendemain.
 */
export function touchStreak(s: Save, day: number): { kept: boolean; graceUsed: boolean } {
  const week = Math.floor(day / 7);
  if (s.streak.graceWeek !== week) {
    s.streak.graceWeek = week;
    s.streak.graceLeft = 1;
  }
  const gap = day - s.streak.lastDay;
  if (gap === 0) return { kept: true, graceUsed: false };
  if (gap === 1) {
    s.streak.count += 1;
    s.streak.lastDay = day;
    return { kept: true, graceUsed: false };
  }
  if (gap === 2 && s.streak.graceLeft > 0) {
    s.streak.graceLeft -= 1;
    s.streak.count += 1;
    s.streak.lastDay = day;
    return { kept: true, graceUsed: true };
  }
  s.streak.count = 1;
  s.streak.lastDay = day;
  return { kept: false, graceUsed: false };
}

/* ------------------------------------------------------------------ *
 * Carnet
 * ------------------------------------------------------------------ */

/**
 * Ce qu'une partie ajoute au carnet, pour UNE règle.
 *
 * Extraite parce qu'elle était écrite DEUX fois — ici et dans `finishRun` —
 * et que les deux copies n'ont pas les mêmes yeux dessus : celle de `main.ts`
 * est la seule qui tourne vraiment, et aucun test ne l'atteint. Une formule
 * dupliquée dont une seule moitié est testée finit toujours par diverger, et
 * le symptôme serait un carnet qui compte faux — silencieux.
 *
 * Trois opérations, trois natures :
 *   · `best` — un MAXIMUM, un record ne redescend pas ;
 *   · `cleared` — un OU, on ne dé-termine pas un run terminé ;
 *   · `pieges` — une SOMME. C'est le seul cumul du carnet, et c'est pour ça
 *     que la fusion inter-appareils en prend le maximum plutôt que la somme
 *     (voir `shared/compte.ts`) : sommer doublerait à chaque synchro.
 */
export function majCarnet(
  prev: RuleRecord | undefined,
  score: number,
  cleared: boolean,
  pieges: number,
  run?: { allure: number; serie: number; sansFaute: boolean },
): RuleRecord {
  /*
   * ⚠️ UNION ET MAXIMUM, JAMAIS UNE AFFECTATION — la même loi que la fusion des
   * comptes, et pour la même raison : un second run raté ne doit rien effacer.
   *
   * `pieges` est la seule SOMME, parce qu'il compte des occurrences et non un
   * niveau atteint. Il ne se fusionne PAS entre appareils (voir `shared/compte`)
   * : sommer deux appareils doublerait le compteur à chaque synchro.
   */
  const parAllure = { ...(prev?.parAllure ?? {}) };
  if (run) {
    const cle = String(run.allure);
    parAllure[cle] = Math.max(parAllure[cle] ?? 0, score);
  }
  const runs = (prev?.runs ?? 0) + (run ? 1 : 0);
  const serie = Math.max(prev?.serie ?? 0, run?.serie ?? 0);
  const sansFaute = (prev?.sansFaute ?? false) || (run?.sansFaute ?? false);
  /*
   * ⚠️ ON N'ECRIT QUE CE QUI PORTE QUELQUE CHOSE.
   *
   * Ces trois champs sont arrives apres, et « absent vaut zero » est la
   * doctrine du carnet. Les poser a `{}`, `0` et `false` sur chaque entree
   * gonflerait toutes les sauvegardes — et surtout la charge que `api/moi.ts`
   * fait transiter — pour ne rien dire de plus que leur absence.
   */
  /*
   * ⚠️ **CETTE FONCTION RECONSTRUIT L'ENTRÉE, ELLE NE LA COMPLÈTE PAS.**
   *
   * Tout champ du carnet qui n'est pas nommé ici est EFFACÉ à chaque run. Le
   * §12 de CLAUDE.md nomme les trois bouts où un champ neuf doit être branché
   * — `majCarnet`, `fusionne`, le nettoyage de `api/moi.ts` — et celui-ci est
   * cité en premier parce que c'est le seul qui tourne à CHAQUE partie.
   *
   * ⚠️ **CE QUE ÇA A COÛTÉ.** `escalier` a été ajouté au carnet en ne branchant
   * que les deux autres. Conséquence, rapportée en playtest le soir même :
   * « impossible d'aller au-delà de l'étape 2, même en la réussissant ». Le
   * mécanisme exact — un run de palier écrivait `majCarnet(...)`, qui rendait
   * une entrée SANS escalier ; la ligne suivante relisait cette entrée pour y
   * trouver la montée, tombait sur « pas commencée », et repartait du palier 1.
   * Le joueur voyait pourtant « PALIER 2 FRANCHI » à l'écran, parce que ce
   * libellé vient du palier JOUÉ et non de l'état enregistré : le jeu
   * annonçait une victoire qu'il venait d'effacer.
   *
   * Et ça mordait bien au-delà de l'escalier : n'importe quel run
   * d'entraînement ou du jour passe ici, donc jouer QUOI QUE CE SOIT détruisait
   * la montée. `tests/carnet-voyage.test.ts` ne l'a pas vu — il éprouve le
   * voyage entre deux appareils, pas le chemin d'un run. D'où
   * `tests/majcarnet.test.ts`, qui exige qu'aucun champ ne se perde ICI.
   */
  return {
    // Ce que ce run ne concerne pas voyage tel quel. En premier, donc écrasé
    // par tout ce que la fonction calcule vraiment juste en dessous.
    ...(prev ?? {}),
    best: Math.max(prev?.best ?? 0, score),
    cleared: (prev?.cleared ?? false) || cleared,
    pieges: (prev?.pieges ?? 0) + pieges,
    ...(Object.keys(parAllure).length ? { parAllure } : {}),
    ...(runs ? { runs } : {}),
    ...(serie ? { serie } : {}),
    ...(sansFaute ? { sansFaute } : {}),
  };
}

export function recordRun(
  ruleId: string,
  score: number,
  cleared: boolean,
  pieges = 0,
  run?: { allure: number; serie: number; sansFaute: boolean },
): Save {
  return mutate((s) => {
    s.encountered[ruleId] = majCarnet(s.encountered[ruleId], score, cleared, pieges, run);
    s.recent = [...s.recent, score].slice(-5);
  });
}

/**
 * Combien d'essais du jour sont déjà consommés.
 *
 * Absent vaut « ce que `played` dit » : la doctrine habituelle, appliquée à un
 * champ ajouté après coup. Sans ce repli, toute sauvegarde antérieure
 * repartirait à zéro essai le jour du déploiement.
 *
 * ⚠️ UN SCORE SANS COMPTEUR A QUAND MÊME CONSOMMÉ UN ESSAI.
 *
 * `entier()` côté serveur pose `0` quand le champ manque. Un compte ouvert
 * avant que `jour.essais` ne voyage porte donc `{ score: 28, essais: 0 }`.
 * Sur un navigateur neuf, `??` verrait 0 — une valeur présente — et
 * rendrait trois essais tout neufs, alors que le téléphone affiche « 0 / 3 ».
 * Un score, un `cleared` ou un `played` pose donc un plancher à 1.
 */
export const essaisDuJour = (s: Save): number => {
  const repli = s.daily.played || s.daily.cleared || s.daily.score > 0 ? 1 : 0;
  const n = s.daily.essais === undefined ? repli : Math.max(s.daily.essais, repli);
  return Math.min(DAILY_ESSAIS, n);
};

/**
 * Une perf VÉRIFIÉE du jour dit qu'au moins un essai a été consommé.
 *
 * Sur un navigateur neuf, `localStorage` est vide : trois essais tout neufs,
 * alors que le téléphone vient d'afficher « 0 / 3 ». Le compteur voyage dans
 * les agrégats, mais les comptes ouverts avant ce champ — et les syncs
 * ratées — portent `essais: 0` à côté d'un score. Sans ce plancher, le
 * nouveau navigateur redonne la journée.
 *
 * On ne peut pas reconstituer 3 depuis une seule ligne de perf (le serveur
 * n'en garde qu'une). On pose donc AU MOINS 1, et `essaisDuJour` relève
 * aussi le cas `score > 0` sans compteur. Si les agrégats ont déjà 3, le
 * maximum les garde.
 */
export function posePreuveDuJour(s: Save, jour: number, score: number): void {
  if (score <= 0) return;
  if (s.daily.day > jour) return;
  if (s.daily.day < jour) {
    s.daily = {
      day: jour,
      played: true,
      score,
      cleared: false,
      essais: 1,
    };
    return;
  }
  s.daily.played = true;
  s.daily.score = Math.max(s.daily.score, score);
  s.daily.essais = Math.min(DAILY_ESSAIS, Math.max(essaisDuJour(s), 1));
}

/**
 * Ce qu'une tentative du jour laisse derrière elle.
 *
 * Extraite pour la même raison que `majCarnet` : une formule écrite deux fois
 * — une en production, une dans un test — finit par diverger, et seule celle
 * de production tourne. Ici la divergence se verrait au pire endroit, sur le
 * seul mode dont les résultats se comparent entre joueurs.
 *
 * Trois opérations, trois natures :
 *   · `score` — un MAXIMUM. Un second essai raté n'efface pas un bon premier,
 *     et surtout le SERVEUR fait déjà ça (`posePerf` améliore, ne remplace
 *     pas) : garder le dernier ferait afficher à la carte SOLO un chiffre
 *     différent de celui du classement ;
 *   · `cleared` — un OU. On ne dé-termine pas un run terminé ;
 *   · `essais` — un incrément, remis à zéro quand le jour change.
 *
 * La garde `avant.day === jour` fait tout le travail du changement de jour :
 * sans elle, le score d'hier survivrait à minuit.
 */
export function majJour(
  avant: Save["daily"],
  jour: number,
  score: number,
  cleared: boolean,
): Save["daily"] {
  const memeJour = avant.day === jour;
  return {
    day: jour,
    played: true,
    score: Math.max(memeJour ? avant.score : 0, score),
    cleared: (memeJour && avant.cleared) || cleared,
    /*
     * PLAFONNE. Le compteur montait sans borne — releve a 6 sur une journee
     * qui en autorise 3, en empruntant un chemin de lancement qui a depuis ete
     * ferme. Un compteur qui depasse sa propre limite rend tout ce qui en
     * derive faux : « essais restants » passe negatif avant d'etre borne
     * ailleurs, et l'etat de la journee cesse de se deduire du chiffre.
     *
     * Le plafond ne remplace pas le verrou de lancement, il le double : l'un
     * empeche de jouer, l'autre empeche d'ecrire un etat impossible.
     */
    essais: Math.min(
      DAILY_ESSAIS,
      (memeJour ? essaisDuJour({ daily: avant } as Save) : 0) + 1,
    ),
  };
}

export const isEncountered = (s: Save, ruleId: string): boolean => !!s.encountered[ruleId];

/** Moyenne des 5 derniers runs — base de la quête de performance. */
export function recentAverage(s: Save): number {
  if (s.recent.length === 0) return 0;
  return s.recent.reduce((a, b) => a + b, 0) / s.recent.length;
}

export const today = (): number => dayIndex();

/* ------------------------------------------------------------------ *
 * Passerelle vers le compte
 * ------------------------------------------------------------------ */

/**
 * Ce que cet appareil apporte à un compte.
 *
 * `bestTraining` est publié sous la clé de l'allure de référence : c'est
 * exactement le sens qu'il a toujours eu, il ne s'inscrivait qu'à `PACE_DEFAULT`.
 * Le convertir ici plutôt que de le transporter tel quel évite au serveur de
 * connaître une exception de plus.
 */
export function agregatsDe(s: Save): Agregats {
  const records = { ...s.records };
  const cle = cleEntrainement(PACE_DEFAULT);
  records[cle] = Math.max(records[cle] ?? 0, s.bestTraining);
  return {
    carnet: { ...s.encountered },
    serie: { count: s.streak.count, lastDay: s.streak.lastDay },
    records,
    /*
     * ⚠️ LE RUN DU JOUR MONTE AUSSI — il ne montait NULLE PART.
     *
     * `s.daily` restait strictement local à l'appareil : la fiche du compte
     * lisait `s.daily.score`, donc changer de téléphone remettait le run du
     * jour à rien. Et le compteur `essais` avec lui, ce qui donnait SIX
     * tentatives à qui possède deux appareils, sur le seul mode dont les
     * résultats se comparent entre joueurs.
     */
    jour: {
      jour: s.daily.day,
      score: s.daily.score,
      cleared: s.daily.cleared,
      essais: essaisDuJour(s),
    },
  };
}

/**
 * Réinjecte ce que le compte sait dans l'appareil.
 *
 * Union et maximum, jamais une affectation — la même loi que `fusionne`, parce
 * que c'est la même opération vue de l'autre côté. Un compte tout neuf ne doit
 * rien pouvoir effacer, et un appareil en retard ne doit rien perdre.
 */
export function appliqueAgregats(s: Save, a: Agregats): void {
  const fusionnes = fusionne(agregatsDe(s), a);
  s.encountered = fusionnes.carnet;
  s.streak.count = fusionnes.serie.count;
  s.streak.lastDay = fusionnes.serie.lastDay;
  s.records = fusionnes.records;
  /*
   * ⚠️ ON NE COLLE JAMAIS UN JOUR A SUR UNE GRAINE B.
   *
   * Trois cas, et un seul piège :
   *
   *   · même jour           → maximum, comme le reste de la fusion ;
   *   · compte PLUS RÉCENT  → ÉCRIRE cette journée. L'appareil était à -1
   *     (sauvegarde neuve) ou à hier : c'est aujourd'hui côté compte, et
   *     jeter 28 / 300 parce que `s.daily.day` n'était pas encore à 300
   *     laissait le profil local vide après une synchro réussie ;
   *   · compte PLUS ANCIEN  → ne rien écrire. Poser le 40 d'hier sur la
   *     graine d'aujourd'hui est le chiffre faux que `fusionneJour` existe
   *     pour interdire.
   *
   * `ensureDay` remettra les compteurs à zéro si l'horloge locale a déjà
   * dépassé ce jour-là ; il ne doit pas avoir à réparer un collage.
   */
  if (fusionnes.jour) {
    if (fusionnes.jour.jour === s.daily.day) {
      s.daily = {
        day: s.daily.day,
        played: fusionnes.jour.essais > 0 || s.daily.played,
        score: Math.max(s.daily.score, fusionnes.jour.score),
        cleared: s.daily.cleared || fusionnes.jour.cleared,
        essais: Math.max(essaisDuJour(s), fusionnes.jour.essais),
      };
    } else if (fusionnes.jour.jour > s.daily.day) {
      s.daily = {
        day: fusionnes.jour.jour,
        played: fusionnes.jour.essais > 0,
        score: fusionnes.jour.score,
        cleared: fusionnes.jour.cleared,
        essais: fusionnes.jour.essais,
      };
    }
    // Un score collé avec `essais: 0` (nettoyage d'avant le plancher) doit
    // s'écrire à 1, pas rester à 0 dans la sauvegarde.
    s.daily.essais = essaisDuJour(s);
    if (s.daily.essais > 0) s.daily.played = true;
  }
  s.bestTraining = Math.max(
    s.bestTraining,
    fusionnes.records[cleEntrainement(PACE_DEFAULT)] ?? 0,
  );
}

/** Inscrit un record local sous sa clé, s'il bat le précédent. */
export function inscritRecord(s: Save, cle: string, valeur: number): void {
  if (valeur > (s.records[cle] ?? 0)) s.records[cle] = valeur;
}

/**
 * LE RECORD DU JOUEUR À L'ALLURE OÙ IL JOUE.
 *
 * ⚠️ `bestTraining` ne convient PAS pour ça, et c'est devenu vrai récemment.
 * Il n'est écrit qu'à `PACE_DEFAULT` — délibérément, un chiffre qui mélange les
 * allures ne veut plus rien dire. Mais l'allure par défaut d'un joueur neuf est
 * maintenant DÉBUT : son `bestTraining` reste donc à zéro tant qu'il n'a pas
 * changé de vitesse, c'est-à-dire précisément tant qu'il est débutant.
 *
 * Lui montrer « TON RECORD · 0 » sur l'accueil serait le contraire d'une
 * motivation. On lit donc le record de SON allure, et l'écran la nomme — deux
 * chiffres sous deux étiquettes différentes restent comparables ; un seul
 * chiffre qui change de sens ne l'est pas.
 */
export function recordDeSonAllure(s: Save): number {
  return Math.max(
    s.records[cleEntrainement(s.trainingPace)] ?? 0,
    // À l'allure de référence, `bestTraining` est la source historique : les
    // sauvegardes d'avant l'écriture par allure ne portent que lui.
    s.trainingPace === PACE_DEFAULT ? s.bestTraining : 0,
  );
}
