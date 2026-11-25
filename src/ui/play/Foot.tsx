/**
 * Le pied est un TABLEAU DE BORD, pas une phrase : trois grandeurs
 * qu'on consulte d'un coup d'œil sans quitter la scène. La valeur
 * domine, l'intitulé la nomme en dessous.
 */
export function Foot() {
  return (
    <footer id="foot">
      {/*
         « SAM A CRAQUÉ » (maquette 9.2) : la chute d'un AUTRE, posée sur le
         pied, hors du terrain. Absolue : le pied ne grandit pas (n°17).
      */}
      <p className="craque hidden" id="craque" aria-live="polite" />
      <div className="foot__cell">
        <b className="foot__value" id="fScore">0</b>
        {" "}
        {/*
           ⚠️ L'INTITULE EST DYNAMIQUE DEPUIS QU'IL Y A LE COOP.
           En solo et en classique ce chiffre est bien un nombre de manches
           tenues. En COOP c'est le SCORE DU GROUPE — des pieces nettoyees —
           et l'appeler MANCHE en faisait un chiffre faux. `data-i18n` reste
           la source du mot par defaut : le HUD le relit dans la meme table
           plutot que d'en garder une seconde copie.
        */}
        {" "}
        <span className="foot__label" id="fScoreLabel" data-i18n="hud.manche">ROUND</span>
      </div>
      <div className="foot__cell foot__cell--mid">
        <b className="foot__value" id="fBest">0</b>
        {" "}
        <span className="foot__label" id="fMidLabel">BEST</span>
      </div>
      <div className="foot__cell foot__cell--mode">
        <b className="foot__value foot__value--mode" id="fMode">—</b>
        {" "}
        <span className="foot__label" data-i18n="hud.mode">MODE</span>
      </div>
    </footer>
  );
}

export function Tier() {
  return (
    <div id="tier" className="tier" aria-live="polite" />
  );
}

export function Stamp() {
  return (
    <div id="stamp" aria-hidden="true">
      <span id="stampText">BREACH</span>
    </div>
  );
}
