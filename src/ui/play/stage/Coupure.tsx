/**
 * L'AIDE DU TUTORIEL, HORS FLUX.
 * Posée en absolu par-dessus la scène, jamais dans le flux : tout ce
 * qui grossit le bandeau ou le pied rogne le champ, et la taille du
 * champ EST du gameplay. Un tutoriel qui rétrécit le terrain
 * enseignerait un jeu qui n'existe pas.
 * `pointer-events: none` — la seule chose cliquable ici reste le
 * canvas, exactement comme en partie.
 */

/**
 * LA COUPURE, ET CE QU'ELLE NE COÛTE PAS.
 * Décision n°4 : une coupure n'est pas une défaite. Elle ne se
 * voyait nulle part — le joueur lisait « RECONNEXION… » en petit
 * dans le bandeau pendant que la scène restait figée, ce qui
 * ressemble exactement à une expulsion. Le panneau dit les trois
 * choses que le serveur GARANTIT et que personne ne peut deviner :
 * la place est gardée, aucune manche ne se joue pendant ce temps,
 * et il reste tant de secondes.
 *
 * Hors flux comme l'aide du tutoriel et le piège déjoué : il ne
 * prend pas un pixel au terrain.
 */
export function Coupure() {
  return (
    <div id="coupure" className="coupure hidden" aria-live="assertive">
      <div className="coupure__panel">
        <div className="coupure__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <p className="coupure__titre" data-i18n="coupure.titre">PUTTING YOU BACK IN</p>
        <p className="coupure__quoi" data-i18n="coupure.quoi">
          Your seat is held for 25 seconds and you play no round during that time. A cut is not a
          defeat.
        </p>
        <div className="coupure__jauge" aria-hidden="true">
          <i id="coupureJauge" />
        </div>
        <p className="coupure__etat" id="coupureEtat" />
      </div>
    </div>
  );
}
