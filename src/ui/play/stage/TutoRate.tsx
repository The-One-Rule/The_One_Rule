/**
 * RATÉ, PENDANT LE TUTORIEL (maquette 2.4). Une phrase, la consigne,
 * ce qu'il fallait faire ; un appui n'importe où rejoue la MÊME
 * manche. Rien ne tue : on apprend sa règle au moment où elle vient
 * de servir. Hors flux dans `#stage`, comme la carte de relance.
 */
export function TutoRate() {
  return (
    <div id="tutoRate" className="tutorate hidden" aria-live="assertive">
      <div className="tutorate__carte">
        <p className="tutorate__eyebrow" id="tutoRateEyebrow" />
        <p className="tutorate__titre" id="tutoRateTitre" />
        <div className="tutorate__preuve">
          <p className="tutorate__quoi" data-i18n="tuto.consigne">THE ORDER</p>
          <p className="tutorate__val" id="tutoRateConsigne" />
          <p className="tutorate__quoi" data-i18n="tuto.fallait">YOU HAD TO</p>
          <p className="tutorate__val" id="tutoRateFallait" />
        </div>
        <button
          type="button"
          className="btn btn--primary tutorate__btn"
          id="btnTutoRejouer"
          data-i18n="tuto.rejouer"
        >
          PLAY THE ROUND AGAIN
        </button>
      </div>
    </div>
  );
}
