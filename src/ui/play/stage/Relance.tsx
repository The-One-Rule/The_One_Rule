/**
 * LA CARTE DE RELANCE, HORS FLUX (voir `render/relance.ts`).
 * Paraît à la mort, sur le terrain figé : le score, l'écart au
 * record, et un appui N'IMPORTE OÙ relance. BILAN ouvre l'écran de
 * fin, qui a été préparé comme avant. Absolue dans `#stage` :
 * `#cv` ne bouge pas. Chaque texte est une feuille, jamais un
 * bouton à plusieurs enfants réécrit en `textContent`.
 */
export function Relance() {
  return (
    <div id="relance" className="relance hidden" aria-live="polite">
      <div className="relance__carte">
        <p className="relance__motif" id="relanceMotif" />
        {/*
           LA PREUVE (maquette 4.3) : la manche fatale en miniature, la
           pièce fautive entourée, puis ce qu'il fallait faire.
        */}
        <div className="relance__preuve hidden" id="relancePreuve">
          <div className="relance__mini" id="relanceMini" aria-hidden="true" />
          <div className="relance__dit">
            <p className="relance__quoi" data-i18n="tuto.consigne">THE ORDER</p>
            <p className="relance__val" id="relanceConsigne" />
            <p className="relance__quoi" data-i18n="tuto.fallait">YOU HAD TO</p>
            <p className="relance__val" id="relanceFallait" />
          </div>
        </div>
        <p className="relance__score" id="relanceScore">0</p>
        <p className="relance__unite" id="relanceUnite" />
        <p className="relance__ecart" id="relanceEcart" />
        <p className="relance__rival" id="relanceRival" />
        <p className="relance__essais" id="relanceEssais" />
        <button type="button" className="relance__go" id="btnRelance" />
      </div>
      <button
        type="button"
        className="relance__bilan"
        id="btnRelanceBilan"
        data-i18n="relance.bilan"
      >
        SUMMARY ›
      </button>
    </div>
  );
}
