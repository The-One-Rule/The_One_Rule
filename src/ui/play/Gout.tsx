/**
 * LES GOUTTIERES DU SOLO.
 * A gauche TA CARTE — celle de la regle en cours, avec sa jauge et ce
 * que ce run fait avancer. A droite CE RUN — les marques manche par
 * manche, et le fantome quand on releve un defi.
 *
 * ⚠️ Elles vivent HORS FLUX, dans la meme bande que les plaques du
 * multijoueur (`--field-top`, `--field-h`, `--gutter-w`) : elles ne
 * rognent pas le champ. Et `pointer-events: none` — un clic destine a
 * la scene ne doit pas mourir sur une gouttiere.
 */
export function Gout() {
  return (
    <div id="gout" className="gout hidden" aria-hidden="true">
      <div className="gout__col gout__col--g">
        <p className="gout__titre" data-i18n="gout.carte">YOUR CARD</p>
        <img className="gout__img" id="goutImg" width="64" height="64" alt="" />
        <p className="gout__nom" id="goutNom" />
        <div className="gout__jauge" id="goutJauge" />
        <p className="gout__note" id="goutNote" />
      </div>
      <div className="gout__col gout__col--d">
        <p className="gout__titre" data-i18n="gout.run">THIS RUN</p>
        <div className="gout__marques" id="goutMarques" />
        <div className="gout__fantome hidden" id="goutFantome">
          <p className="gout__titre" id="goutFantomeQui" />
          <p className="gout__nom" id="goutFantomeEtat" />
        </div>
      </div>
    </div>
  );
}
