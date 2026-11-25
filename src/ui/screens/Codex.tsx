import { Screen } from "./Screen";

/**
 * CARNET
 */
export function Codex() {
  return (
    <Screen id="codex">
      <div className="screen__scroll">
        <p className="eyebrow" id="codexEyebrow" data-i18n="carnet.collection">COLLECTION</p>
        <h2 className="rulename" id="codexTitre">0 / 16</h2>
        {/*
           Combien en reste-t-il : la question qu'on vient poser ici, et
           qu'il fallait résoudre en comptant les lignes soi-même.
        */}
        <p className="codexprogress" id="codexProgress" />
        {/*
           L'ETAT PAUVRE de la collection.
           A zero regle, seize barres hachurees identiques sans rien
           d'ouvrable se lisent comme une fonctionnalite cassee, pas comme
           une collection a remplir. Une phrase suffit a retourner le mur en
           invitation — et elle dit VRAI : la premiere carte se debloque en
           jouant, c'est exactement ce que fait la premiere arrivee.
        */}
        {/*
           LA BARRE LATERALE — en large seulement.
           Sur telephone, les filtres restent au-dessus de la grille : une
           colonne de 230 px y prendrait les deux tiers de l'ecran.
        */}
        <aside className="codexbar" id="codexbar">
          <div>
            <p className="eyebrow" data-i18n="carnet.titre">RULE BOOK</p>
            <p className="codexbar__total" id="codexbarTotal" />
            {/*
               Une case par regle, coloree par son etat : l'avancement de
               toute la collection se lit d'un coup d'oeil.
            */}
            <div className="codexbar__jauge" id="codexbarJauge" aria-hidden="true" />
          </div>
          {/*
             LES FILTRES.
             Ils portent leur COMPTE : « A MATER · 3 » repond deja a la
             question qu'on venait poser, meme sans cliquer.
          */}
          <div className="filtres hidden" id="filtres" role="group" />
          {/*
             CELLE QUI TE RESISTE.
             Parmi les regles rencontrees et non maitrisees, celle qu'on a le
             plus retentee est celle qui coince. C'est une information que le
             joueur ne peut pas tenir de tete, et la seule qui designe un
             exercice sans qu'il ait a choisir.
          */}
          <div className="resiste hidden" id="resiste">
            <p className="eyebrow" data-i18n="salle.resiste">THE ONE THAT KEEPS GETTING YOU</p>
            <div className="resiste__corps">
              <img className="resiste__img" id="resisteImg" width="64" height="64" alt="" />
              <div className="resiste__txt">
                <p className="resiste__nom" id="resisteNom" />
                <p className="resiste__note" id="resisteNote" />
              </div>
            </div>
            <button className="btn btn--primary" id="btnResiste" />
          </div>
        </aside>
        <div className="codexvide hidden" id="codexVideBox">
          <div className="codexvide__murs" aria-hidden="true">
            <i>?</i>
            <i>?</i>
            <i>?</i>
          </div>
          <p className="codexvide__titre" data-i18n="vide.titre">Sixteen rules are waiting.</p>
          <p id="codexVide" />
          <button
            className="btn btn--primary"
            id="btnCodexVide"
            type="button"
            data-i18n="vide.trouver"
          >
            FIND ONE
          </button>
        </div>
        {/*
           Ce qu'il reste a rencontrer, et comment : « elles n'arrivent
           qu'en jouant » est la seule facon d'en debloquer.
        */}
        <p className="codexjamais hidden" id="codexJamais" />
        <p className="codexrien hidden" id="codexRien" />
        <div className="codexlist" id="codexList" />
        <div className="btnrow">
          <button className="btn btn--ghost" id="btnCodexBack" data-i18n="commun.retour">
            BACK
          </button>
        </div>
      </div>
    </Screen>
  );
}
