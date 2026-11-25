import { Screen } from "./Screen";

/**
 * BOUTIQUE — les pièces achètent des styles de pièces.
 */
export function Boutique() {
  return (
    <Screen id="boutique">
      <div className="screen__scroll boutique">
        <div className="boutique__tete">
          <h2 className="boutique__titre" data-i18n="boutique.titre">SHOP</h2>
          <span className="pstat pstat--pieces">
            <i aria-hidden="true">●</i>
            <b id="boutiquePieces">0</b>
          </span>
        </div>
        <p className="boutique__chapo" data-i18n="boutique.chapo">
          Boards: they dress your whole game. Never the rule.
        </p>
        <div className="skins" id="skins" />
        <button className="btn" id="btnBoutiqueRetour" data-i18n="boutique.retour">BACK</button>
      </div>
    </Screen>
  );
}
