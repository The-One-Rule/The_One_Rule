import { Screen } from "./Screen";

/**
 * FIN DE NIVEAU — des étoiles, parfois une carte, toujours une suite.
 * Remplace l'écran de fin pour les niveaux du parcours : il répond à
 * « qu'est-ce que je viens de gagner ? » avant « combien j'ai fait ».
 */
export function Niveau() {
  return (
    <Screen id="niveau">
      <div className="screen__scroll niveau">
        <p className="niveau__eyebrow" id="niveauEyebrow" />
        <h2 className="niveau__titre" id="niveauTitre" />
        <div className="etoiles" id="niveauEtoiles" role="img">
          <span className="etoile" />
          <span className="etoile" />
          <span className="etoile" />
        </div>
        <p className="niveau__note" id="niveauNote" />
        <p className="niveau__motif" id="niveauMotif" />
        <div className="niveau__chiffres">
          <div className="nchiffre">
            <b id="niveauManches">0</b>
            <span data-i18n="niveau.manches">ROUNDS</span>
          </div>
          <div className="nchiffre">
            <b id="niveauPieges">0</b>
            <span data-i18n="niveau.pieges">TRAPS DODGED</span>
          </div>
          <div className="nchiffre nchiffre--pieces">
            <b id="niveauPieces">+0</b>
            <span data-i18n="niveau.pieces">COINS</span>
          </div>
        </div>
        <div className="revele hidden" id="niveauRevele">
          <div className="revele__carte" id="niveauReveleCarte" />
          <p className="revele__titre" id="niveauReveleTitre" />
          <p className="revele__note" id="niveauReveleNote" />
        </div>
        <div className="niveau__actions">
          <button className="btn btn--gros" id="btnNiveauSuite" />
          {" "}
          <button className="btn" id="btnNiveauParcours" data-i18n="niveau.parcours">PATH</button>
        </div>
      </div>
    </Screen>
  );
}
