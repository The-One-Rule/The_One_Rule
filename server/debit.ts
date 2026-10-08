/**
 * LES LIMITES DE DÉBIT DU SERVEUR DE SALONS — pur, testé.
 *
 * Il n'y en avait AUCUNE. Mesuré (phase 4, point 23) avec un seul client
 * hostile dans un salon de dix :
 *
 *  · `profil` en rafale, carte alternée : chaque message rediffuse l'état
 *    complet du salon (2,7 Ko) aux neuf autres. 12 700 messages en 5 s ont
 *    fait émettre **60 Mo/s** au serveur, processus à 96 % d'un cœur — et le
 *    serveur est UNE machine Fly qui porte tous les salons à la fois ;
 *  · `join` en rafale : **34 000 codes essayés par seconde** depuis une seule
 *    socket, jamais coupée. L'espace des codes fait 31⁴ = 923 521 : balayé
 *    entier en 27 s, n'importe quel salon privé trouvé en un quart de minute.
 *
 * Deux gardes, parce que ce sont deux attaques différentes :
 *
 *  1. un SEAU par socket : tous messages confondus, il borne ce qu'une
 *     connexion peut demander au serveur. Le débit légitime le plus haut est
 *     celui des curseurs du coop, 20/s (`CURSOR_COOLDOWN_MS`), plus les
 *     pings et les entrées : le seau en accorde 40/s, avec une réserve de 80.
 *     Personne ne le touche en jouant ;
 *  2. les ÉCHECS DE `join` par ADRESSE : ouvrir une socket neuve est gratuit,
 *     donc une limite par socket ne bornerait rien. Au-delà de
 *     `ECHECS_JOIN_MAX` codes inconnus par minute, la même réponse
 *     `room_unknown` part SANS regarder la table : l'attaquant n'apprend plus
 *     rien, et un joueur qui retape son code ne s'en aperçoit jamais.
 */

/** Le seau d'une socket : `capacite` jetons, `parSeconde` rendus. */
export class Seau {
  private jetons: number;
  private dernier: number;

  constructor(
    private readonly capacite: number,
    private readonly parSeconde: number,
    maintenant: number,
  ) {
    this.jetons = capacite;
    this.dernier = maintenant;
  }

  /** Vrai si le message passe ; faux s'il doit être ignoré. */
  prend(maintenant: number): boolean {
    const ecoule = Math.max(0, maintenant - this.dernier) / 1000;
    this.dernier = maintenant;
    this.jetons = Math.min(this.capacite, this.jetons + ecoule * this.parSeconde);
    if (this.jetons < 1) return false;
    this.jetons -= 1;
    return true;
  }
}

export const SEAU_CAPACITE = 80;
export const SEAU_PAR_SECONDE = 40;
/**
 * Messages refusés D'AFFILÉE avant de couper la socket. Un client honnête
 * n'en voit jamais un seul ; un script qui insiste n'a rien à gagner à rester.
 */
export const REFUS_AVANT_COUPURE = 200;

export const ECHECS_JOIN_MAX = 20;
export const ECHECS_JOIN_FENETRE_MS = 60_000;

/**
 * Les échecs récents par adresse, sur une fenêtre glissante.
 *
 * La table se purge d'elle-même à chaque note : une adresse sans échec dans
 * la fenêtre disparaît, donc la mémoire est bornée par l'activité récente.
 */
export class EchecsParAdresse {
  private readonly table = new Map<string, number[]>();

  constructor(
    private readonly max = ECHECS_JOIN_MAX,
    private readonly fenetreMs = ECHECS_JOIN_FENETRE_MS,
  ) {}

  private recents(adresse: string, maintenant: number): number[] {
    const l = (this.table.get(adresse) ?? []).filter((t) => maintenant - t < this.fenetreMs);
    if (l.length) this.table.set(adresse, l);
    else this.table.delete(adresse);
    return l;
  }

  /** L'adresse a-t-elle épuisé ses essais ? */
  bloquee(adresse: string, maintenant: number): boolean {
    return this.recents(adresse, maintenant).length >= this.max;
  }

  note(adresse: string, maintenant: number): void {
    const l = this.recents(adresse, maintenant);
    l.push(maintenant);
    this.table.set(adresse, l);
    if (this.table.size > 10_000) {
      for (const a of this.table.keys()) {
        this.recents(a, maintenant);
        if (this.table.size <= 10_000) break;
      }
    }
  }

  get taille(): number {
    return this.table.size;
  }
}

/**
 * L'adresse du joueur. Derrière Fly, la socket vient du proxy : c'est
 * l'en-tête `fly-client-ip`, posé par le proxy lui-même, qui porte la vraie.
 * Ailleurs (en local, l'e2e), l'adresse de la socket.
 */
export function adresseDe(entetes: Record<string, string | string[] | undefined>, socket: string | undefined): string {
  const fly = entetes["fly-client-ip"];
  const v = Array.isArray(fly) ? fly[0] : fly;
  return (v && v.trim()) || socket || "?";
}
