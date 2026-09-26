/**
 * LES AMIS — ce qui se décide sans base ni réseau.
 *
 * Demandé par Pierre : « un système d'amis … les joueurs pourront comparer
 * leur score, les runs, avoir un classement des amis ». Et c'est ce que les
 * playtests réclamaient sans le dire : le social de TOR est SYNCHRONE (on se
 * donne le code à l'oral), et le partage de score est resté à 0 % sur trois
 * relevés — un chiffre posté dans le vide ne se compare à personne.
 *
 * Trois décisions, qui tiennent ici parce qu'elles sont PURES et testées :
 *
 * 1. **Un CODE, pas une recherche par nom.** Six lettres, sans 0/O ni 1/I, qui
 *    se dictent comme le code d'un salon. Une recherche par pseudo ferait de
 *    chaque compte un annuaire public ; un code n'ouvre que ce qu'on a choisi
 *    de donner.
 * 2. **Le code est la POIGNÉE publique**, jamais l'identifiant de compte —
 *    même doctrine que le classement du jour : ce qu'une route publie est
 *    public pour toujours.
 * 3. **On ne compare que du REJOUÉ** (décision n°14). Le classement des amis
 *    lit la table `performance`, jamais les agrégats — un record
 *    d'entraînement est une affirmation du client, et le premier ami qui en
 *    gonflerait un ferait mentir tout le tableau.
 */

/** Les lettres d'un code : ni 0/O, ni 1/I/L — elles se confondent à l'oral comme à l'écran. */
export const CODE_AMI_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_AMI_LONGUEUR = 6;

/** Au-delà, la liste ne se lit plus d'un coup d'œil, et la requête grossit. */
export const MAX_AMIS = 50;

/**
 * Demandes en attente, envoyées ou reçues. Au-delà, on ne demande plus — une
 * boîte de 30 demandes sans réponse n'est plus une liste d'amis, c'est du
 * démarchage, et ce plafond borne ce qu'un seul compte peut infliger.
 */
export const MAX_DEMANDES = 30;

/**
 * Ce qu'une DEMANDE montre de son auteur : son visage, rien de plus. Pas de
 * score — on ne voit les runs de quelqu'un qu'après l'avoir accepté.
 */
export interface Demandeur {
  code: string;
  pseudo: string;
  glyphe: number;
  carte: string | null;
}

/** Jours affichés dans la comparaison des runs. */
export const JOURS_COMPARES = 7;

/**
 * Lit un code tapé par un humain : minuscules, espaces et tirets tolérés.
 * Rend `undefined` pour tout ce qui ne peut pas être un code — jamais une
 * erreur.
 */
export function codeAmiValide(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const c = v.toUpperCase().replace(/[\s-]/g, "");
  if (c.length !== CODE_AMI_LONGUEUR) return undefined;
  for (const ch of c) if (!CODE_AMI_ALPHABET.includes(ch)) return undefined;
  return c;
}

/** Un code neuf. `hasard` rend un nombre dans [0, 1). */
export function nouveauCodeAmi(hasard: () => number): string {
  let c = "";
  for (let i = 0; i < CODE_AMI_LONGUEUR; i++) {
    c += CODE_AMI_ALPHABET[Math.floor(hasard() * CODE_AMI_ALPHABET.length) % CODE_AMI_ALPHABET.length];
  }
  return c;
}

/** Un score du jour, vérifié. */
export interface ScoreDuJour {
  valeur: number;
  /** Le départage : la durée, plus courte = mieux. */
  valeur2: number;
}

/** Une ligne telle qu'elle entre dans le classement. */
export interface Participant {
  code: string;
  pseudo: string;
  glyphe: number;
  carte: string | null;
  moi: boolean;
  aujourdhui: ScoreDuJour | null;
  /** Les `JOURS_COMPARES` derniers jours, du plus ancien au plus récent. */
  semaine: (number | null)[];
  /** Le meilleur score vérifié sur la fenêtre lue. */
  meilleur: number | null;
}

export interface LigneAmi extends Participant {
  /** `null` pour qui n'a pas encore joué le run du jour. */
  rang: number | null;
}

/**
 * Le classement d'un cercle d'amis — soi compris.
 *
 * Le départage est CELUI DE L'INDEX de la table (valeur décroissante, puis
 * durée croissante) : un ami ne doit pas lire un rang différent ici et sur le
 * podium du jour. À score et durée égaux, le même rang — un classement entre
 * amis n'a aucune raison d'inventer un vainqueur.
 *
 * Ceux qui n'ont pas joué aujourd'hui restent dans la liste, sans rang, et
 * APRÈS : un ami absent reste un ami, et le voir est ce qui donne envie de le
 * relancer.
 */
export function classementDesAmis(ps: readonly Participant[]): LigneAmi[] {
  const joues = ps.filter((p) => p.aujourdhui).sort((a, b) =>
    b.aujourdhui!.valeur - a.aujourdhui!.valeur || a.aujourdhui!.valeur2 - b.aujourdhui!.valeur2,
  );
  const lignes: LigneAmi[] = [];
  joues.forEach((p, i) => {
    const prec = joues[i - 1];
    const ex =
      prec &&
      prec.aujourdhui!.valeur === p.aujourdhui!.valeur &&
      prec.aujourdhui!.valeur2 === p.aujourdhui!.valeur2;
    lignes.push({ ...p, rang: ex ? lignes[i - 1]!.rang : i + 1 });
  });
  // Les absents : soi d'abord (on se cherche), puis par ordre alphabétique —
  // un ordre qui ne change pas d'un chargement à l'autre.
  const absents = ps
    .filter((p) => !p.aujourdhui)
    .sort((a, b) => Number(b.moi) - Number(a.moi) || a.pseudo.localeCompare(b.pseudo));
  for (const p of absents) lignes.push({ ...p, rang: null });
  return lignes;
}

/**
 * La semaine d'un joueur, depuis ses performances.
 *
 * `jourFin` inclus. Une performance d'une AUTRE clé de comparabilité que
 * celle de son jour (autre version de contenu) est ignorée : elle a été
 * jouée sur une autre épreuve, la comparer serait mentir.
 */
export function semaineDe(
  perfs: readonly { jour: number | null; cle: string; valeur: number }[],
  jourFin: number,
  cleDuJour: (jour: number) => string,
  n: number = JOURS_COMPARES,
): (number | null)[] {
  const out: (number | null)[] = [];
  for (let j = jourFin - n + 1; j <= jourFin; j++) {
    const p = perfs.find((x) => x.jour === j && x.cle === cleDuJour(j));
    out.push(p ? p.valeur : null);
  }
  return out;
}
