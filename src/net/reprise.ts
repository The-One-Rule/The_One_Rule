/**
 * QUAND RETENTER, APRÈS UNE COUPURE — pur, testé.
 *
 * ⚠️ LE CLIENT ABANDONNAIT AU BOUT DE 1,6 SECONDE, pour un siège que le
 * serveur garde 25. Trois essais espacés de 800 ms : une coupure de métro, un
 * passage du Wi-Fi à la 4G, un ascenseur — deux à dix secondes — renvoyaient
 * le joueur à l'écran de saisie du code, pendant que sa place l'attendait
 * encore. Mesuré dans un vrai navigateur (`e2e-navigateur.mjs`) : coupure de
 * 1,5 s, pas de reprise. Le commentaire de la boucle invoquait pourtant les
 * 25 s du sursis pour justifier de ne pas « marteler » ; la boucle n'en
 * couvrait que le quinzième.
 *
 * Le calendrier couvre donc le SURSIS, et pas davantage : retenter après
 * qu'il est écoulé ne rendrait plus le siège. Les premiers essais sont
 * rapprochés (une micro-coupure se répare vite et c'est le cas fréquent), les
 * suivants s'espacent (un serveur éteint ne doit pas recevoir une rafale).
 */
import { RECONNECT_GRACE_MS } from "../../shared/protocol";

/** Attente AVANT chaque nouvel essai — le premier part sans attendre. */
export const ATTENTES_REPRISE_MS: readonly number[] = [500, 1000, 1500, 2000, 3000, 4000, 4000, 4000];

/** Combien d'essais en tout : le panneau l'annonce (« ESSAI 2 SUR 9 »). */
export const ESSAIS_REPRISE = ATTENTES_REPRISE_MS.length + 1;

/** Le temps que le calendrier couvre, attentes seules. */
export const FENETRE_REPRISE_MS = ATTENTES_REPRISE_MS.reduce((s, x) => s + x, 0);

/**
 * La marge laissée sous le sursis : un essai prend lui-même du temps
 * (poignée de main, `welcome`), et le dernier doit arriver AVANT que le
 * serveur ne libère le siège.
 */
export const MARGE_SURSIS_MS = RECONNECT_GRACE_MS - FENETRE_REPRISE_MS;
