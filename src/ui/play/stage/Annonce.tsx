/**
 * ÉCHAUFFEMENT TERMINÉ (maquette 2.6). ENTRE deux manches, partie
 * suspendue (`Session.decale`) — jamais pendant : Pierre avait fait
 * retirer un plein cadre qui tombait en pleine manche.
 */
export function Annonce() {
  return (
    <div id="annonce" className="annonce hidden" aria-live="assertive">
      <span className="annonce__barres" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <p className="annonce__titre" data-i18n="annonce.titre">Warm-up over</p>
      <p className="annonce__quoi" data-i18n="annonce.quoi">
        From now on, the frame empties faster.
      </p>
      <p className="annonce__suite" data-i18n="annonce.suite">TAP TO CONTINUE</p>
    </div>
  );
}
