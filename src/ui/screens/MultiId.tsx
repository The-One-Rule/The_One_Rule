import { Screen } from "./Screen";

/**
 * MULTI — IDENTITÉ
 */
export function MultiId() {
  return (
    <Screen id="multi-id">
      <div className="screen__scroll">
        <p className="eyebrow" data-i18n="multi.eyebrow">MULTIPLAYER</p>
        <h2 className="rulename" data-i18n="multi.signe">YOUR SIGN</h2>
        <p className="lede" data-i18n="multi.signe.lede">
          Your name and sign follow you into every room. That is how the others know you.
        </p>
        <div className="fieldrow">
          <input
            className="field field--name"
            id="idName"
            type="text"
            maxLength={14}
            spellCheck="false"
            autoComplete="off"
            placeholder="YOUR NAME"
            data-i18n-ph="ph.nom"
            aria-label="Your name"
            data-i18n-aria="aria.nom"
          />
        </div>
        <p className="fineprint" id="idMax" data-i18n="multi.max">14 CHARACTERS MAX</p>
        {/*
           ⚠️ LE COMPTE EST CALCULE, pas ecrit : `glyphIndex` est une
           bijection testee sur les 144, et un nombre en dur ici
           divergerait au premier signe ajoute — en silence.
        */}
        <p className="eyebrow" id="idChoisis" />
        <div
          className="glyphpick"
          id="idGlyphs"
          role="radiogroup"
          aria-label="Your sign"
          data-i18n-aria="aria.signe"
        />
        {/*
           Pourquoi le signe vaut la peine d'etre choisi : il ne meurt pas
           avec l'appareil. C'est ce que la revendication a rendu vrai, et
           personne ne pouvait le deviner.
        */}
        <p className="fineprint" data-i18n="multi.signeVoyage">
          YOUR SIGN TRAVELS IN YOUR ACCOUNT TOKEN: IT SURVIVES A CHANGE OF DEVICE.
        </p>
        <p className="warn hidden" id="idErr" />
        <div className="btnrow">
          <button className="btn btn--primary" id="btnIdOk" data-i18n="multi.continuer">
            CONTINUE
          </button>
          {" "}
          <button className="btn btn--ghost" id="btnIdBack" data-i18n="commun.retour">BACK</button>
        </div>
      </div>
    </Screen>
  );
}
