import { asset } from "../assets";

export function Topbar() {
  return (
    <header id="topbar" className="topbar hidden">
      {/*
         TROIS ZONES, ET L'ENSEIGNE AU MILIEU.
         Reglages a gauche, compte a droite, signe au centre. La grille
         `1fr auto 1fr` centre le signe SANS dependre de ce que portent
         les deux bords : c'etait le defaut de la version en
         `space-between`, ou masquer MENU sur l'accueil faisait glisser
         l'enseigne. Ici elle ne bouge plus, quoi qu'il arrive aux cotes.
      */}
      <div className="topbar__row">
        <div className="topbar__left">
          <button className="btn btn--ghost btn--top" id="btnTopReglages">SETTINGS</button>
        </div>
        <button
          type="button"
          className="topbar__brand"
          id="btnTopBrand"
          aria-label="THE ONE RULE, back to home"
        >
          <img className="topbar__mark" src={asset("favicon.svg")} alt="" width="30" height="30" />
          {" "}
          {/*
             ⚠️ LE NOM, a cote du glyphe. Deux roles distincts : celui-ci
             identifie la barre, le grand logo du hero est l'enseigne. Il ne
             parait qu'en large — sur telephone la barre n'a pas la place, et
             le hero porte deja le nom.
          */}
          {" "}
          <span className="topbar__nom" aria-hidden="true">THE ONE RULE</span>
        </button>
        <div className="topbar__right">
          {/*
             Le filet vertical de la source, entre les destinations et
             l'identite : il separe ce qu'on visite de ce qu'on est.
          */}
          <span className="topbar__filet" aria-hidden="true" />
          {" "}
          <button className="btn btn--ghost btn--top hidden" id="btnTopCompte">ACCOUNT</button>
        </div>
      </div>
    </header>
  );
}
