/**
 * La boutique du COMPTE — formes et validations PURES, partagées.
 *
 * Importé par la route `api/boutique.ts`, par le dépôt et par le client
 * (`src/compte/boutique.ts`) : les trois lisent la même forme avec les mêmes
 * fonctions, et un champ douteux retombe sur un défaut au lieu de lever.
 *
 * ⚠️ Le catalogue (quels styles existent, à quel prix) N'EST PAS ICI : il vit
 * dans `src/game/boutique.ts` et dans la table `skin` (migration 0007), qui en
 * est le miroir. `shared/` ne connaît que la FORME d'un code de style ; son
 * existence est tranchée par la base, dans la transaction d'achat.
 *
 * ⚠️ La boutique de l'APPAREIL reste la seule que le jeu lit (décision n°12 :
 * rien du jeu ne dépend du compte). Celle-ci en est la version liée au
 * compte — voir docs/BASE-DE-DONNEES.md pour ce qui la relie, et ce qui ne
 * la relie pas encore, à l'appareil.
 */

/** La forme d'un code de style : celle que la table `skin` exige. */
const CODE_SKIN = /^[a-z]{2,32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Plafond d'un import : bien au-delà de ce que rapporte le parcours entier. */
export const MAX_IMPORT_PIECES = 1_000_000;
/** Un appareil se désigne par son `anonId` ; la clé du grand livre en dépend. */
export const MAX_APPAREIL = 64;

export const codeSkinValide = (v: unknown): string | null =>
  typeof v === "string" && CODE_SKIN.test(v) ? v : null;

/** La clé d'idempotence d'un achat : un UUID choisi par le client. */
export const cleAchatValide = (v: unknown): string | null =>
  typeof v === "string" && UUID.test(v.toLowerCase()) ? v.toLowerCase() : null;

export const appareilValide = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= MAX_APPAREIL && /^[\w-]+$/.test(v) ? v : null;

export interface EtatBoutiqueCompte {
  pieces: number;
  /** Le style porté, ou `null` (aucun choisi, ou possession retirée). */
  porte: string | null;
  possedes: string[];
}

export type IssueAchat = "ok" | "inconnu" | "deja" | "pauvre";

export interface ReponseAchat extends EtatBoutiqueCompte {
  issue: IssueAchat;
  /** Ce qui manque, quand l'issue est `pauvre`. */
  manque?: number;
  /** Vrai quand la même clé a déjà été achetée : rien n'a été redébité. */
  rejoue?: boolean;
}

export interface ReponseImport extends EtatBoutiqueCompte {
  issue: "ok" | "deja" | "inconnu";
}

const entier = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

/** Relit un état venu du réseau ou de la base ; `null` s'il n'en est pas un. */
export function litEtatBoutique(brut: unknown): EtatBoutiqueCompte | null {
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;
  if (!("pieces" in o)) return null;
  const possedes = Array.isArray(o.possedes)
    ? [...new Set(o.possedes.map(codeSkinValide).filter((c): c is string => c !== null))]
    : [];
  const porte = codeSkinValide(o.porte);
  return { pieces: entier(o.pieces), porte: porte && possedes.includes(porte) ? porte : null, possedes };
}

const ISSUES: readonly IssueAchat[] = ["ok", "inconnu", "deja", "pauvre"];

/** Relit une réponse d'achat. Une issue inconnue vaut un refus (`inconnu`). */
export function litReponseAchat(brut: unknown): ReponseAchat {
  const o = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const etat = litEtatBoutique(o) ?? { pieces: 0, porte: null, possedes: [] };
  const issue = ISSUES.includes(o.issue as IssueAchat) ? (o.issue as IssueAchat) : "inconnu";
  return {
    ...etat,
    issue,
    ...(issue === "pauvre" ? { manque: entier(o.manque) } : {}),
    ...(o.rejoue === true ? { rejoue: true } : {}),
  };
}
