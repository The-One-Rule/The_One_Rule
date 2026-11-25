/**
 * L'INVITATION D'UN AMI — carte du kanban « Invitation : inviter un ami de sa
 * liste depuis le salon ».
 *
 * ⚠️ LE SERVEUR DE SALONS N'A PAS DE BASE. Il ne connaît ni les amitiés ni les
 * codes d'ami : c'est le CLIENT qui, connecté avec un compte, annonce le sien
 * (`{ t: "ami", code }`), une fois sa liste lue chez Vercel. Le serveur se
 * contente de remettre une invitation à la socket qui porte ce code.
 *
 * Ce que ça veut dire, et c'est écrit sur la carte :
 *   · l'ami ne la reçoit que s'il est CONNECTÉ au serveur de salons à cet
 *     instant (écrans multi, salon) — un joueur sur l'accueil n'y est pas.
 *     Sinon l'inviteur l'apprend (`livre: false`) et son bouton se rabat sur
 *     le lien d'invitation ;
 *   · un ami en pleine partie (assis, pas éliminé) ne la reçoit pas : un
 *     bandeau pendant une manche coûterait une vie ;
 *   · le code annoncé n'est pas vérifié — le serveur n'a pas de quoi. Le pire
 *     qu'un menteur obtienne est d'être invité à la place d'un autre, c'est-à-
 *     dire d'apprendre le code d'un salon qu'il pourrait rejoindre par lien.
 *     Le débit est borné (`INVITE_INTERVALLE_MS` et le seau de `debit.ts`).
 *
 * Un identifiant de compte ne voyage jamais : le code d'ami sert de poignée,
 * comme pour les amis (décision du 25/09).
 *
 * PUR : aucune socket, aucune horloge (l'instant est passé en paramètre).
 */
import { codeAmiValide } from "../shared/amis";

/** Ce que le routage doit savoir d'une connexion. */
export interface Joignable {
  id: string;
  /** Le code d'ami annoncé, ou null. */
  codeAmi: string | null;
  /** Assis et vivant dans un match en cours. */
  enPartie: boolean;
}

/** Délai minimal entre deux invitations d'un même joueur. */
export const INVITE_INTERVALLE_MS = 1500;

export type IssueInvitation =
  | { livre: true; a: string }
  | { livre: false; pourquoi: "code" | "soi" | "absent" | "occupe" | "salon" | "trop_vite" };

/**
 * À qui remettre une invitation, ou pourquoi on ne la remet pas.
 *
 * Plusieurs sockets peuvent porter le même code (deux onglets du même ami) :
 * la première libre la reçoit. Un onglet occupé ne bloque pas un autre libre.
 */
export function routeInvitation(
  inviteur: { id: string; codeAmi: string | null; salon: string | null; derniereInvite: number },
  codeBrut: unknown,
  connexions: Iterable<Joignable>,
  maintenant: number,
): IssueInvitation {
  const code = codeAmiValide(codeBrut);
  if (!code) return { livre: false, pourquoi: "code" };
  if (!inviteur.salon) return { livre: false, pourquoi: "salon" };
  if (code === inviteur.codeAmi) return { livre: false, pourquoi: "soi" };
  if (maintenant - inviteur.derniereInvite < INVITE_INTERVALLE_MS) return { livre: false, pourquoi: "trop_vite" };
  let occupe = false;
  for (const c of connexions) {
    if (c.id === inviteur.id || c.codeAmi !== code) continue;
    if (c.enPartie) {
      occupe = true;
      continue;
    }
    return { livre: true, a: c.id };
  }
  return { livre: false, pourquoi: occupe ? "occupe" : "absent" };
}
