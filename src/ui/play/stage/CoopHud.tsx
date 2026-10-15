/**
 * HUD COOP, HORS FLUX.
 * Vie commune + score de groupe. Absolu dans `#stage` : `#cv` ne
 * bouge pas. `pointer-events: none` — le canvas reste la seule
 * cible. Les libellés portent `data-i18n` ; les valeurs sont des
 * feuilles sans enfants.
 */
export function CoopHud() {
  return (
    <div id="coophud" className="coophud hidden" aria-hidden="true">
      <p className="coophud__ligne">
        <span data-i18n="coop.vies">LIVES</span>
        {" "}
        <span id="coopViesVal" className="coophud__val">0</span>
      </p>
      <p className="coophud__ligne">
        <span data-i18n="coop.score">SCORE</span>
        {" "}
        <span id="coopScoreVal" className="coophud__val">0</span>
      </p>
    </div>
  );
}
