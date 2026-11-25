import { Screen } from "./Screen";

export function Brief() {
  return (
    <Screen id="brief">
      {/*
         Volontairement étroit et centré, à contre-courant des autres
         écrans : c'est une annonce, pas un tableau de bord. Le nom de la
         règle est la seule chose que le joueur doit emporter en partie.
      */}
      <div className="screen__scroll brief">
        <p className="brief__meme hidden" id="briefMeme" data-i18n="brief.meme">
          SAME RUN FOR EVERYONE
        </p>
        <p className="eyebrow" id="briefEyebrow">YOUR ONE RULE</p>
        <h2 className="rulename rulename--hero" id="briefName" />
        <p className="lede" id="briefText" />
        <p className="warn hidden" id="briefWarn" />
        {/*
           LES TROIS CHIFFRES DU RUN DU JOUR.
           Vue « daily run » de la maquette. Ils remplacent la ligne
           « 40 manches » plutot que de s'y ajouter : le brief est une
           ANNONCE, pas un tableau de bord, et la seule chose que le joueur
           doit emporter en partie est le nom de sa regle.

           ⚠️ ECHAUFFEMENT est le chiffre qui manquait vraiment. Mesure :
           76 morts a la manche 3 sur 572 runs, plus du double de n'importe
           quelle autre — pendant trois manches on APPREND au joueur que se
           tromper ne coute rien, puis le message disparait en silence. Le
           dire AVANT vaut mieux que le decouvrir en mourant.
        */}
        <div className="briefstats hidden" id="briefStats" />
        {/*
           LA RÈGLE DU JEU, EN UNE PHRASE.
           Mesuré : 78 % des premiers runs ne rencontrent aucun piège, et
           le score médian y est de 4 manches. Le joueur découvrait donc le
           jeu sans jamais voir ce qui le distingue d'un jeu de réflexes
           ordinaire. Cette ligne le lui dit avant qu'il ne le vive.
        */}
        <p className="piege" id="briefPiege" data-i18n="piege.court">
          If an order breaks your rule, do NOTHING.
        </p>
        {/*
           COMMENT ÇA MARCHE.
           REPLIÉE par défaut, et jamais entre le joueur et START : le
           public qui arrive part en quatre secondes, un second mur de
           texte ferait l'inverse de ce qu'on cherche. Qui veut savoir
           ouvre ; les autres jouent.
        */}
        <details className="aide" id="aideBrief">
          <summary className="aide__titre" data-i18n="aide.titre">HOW IT WORKS</summary>
          <div className="aide__corps">
            <ol className="aide__pas">
              <li>
                <span className="aide__num">1</span>
                {" "}
                <span className="aide__texte" data-i18n="aide.pas1">
                  {" "}
                  One rule holds for the whole run. It stays on screen.
                  {" "}
                </span>
              </li>
              <li>
                <span className="aide__num">2</span>
                {" "}
                <span className="aide__texte" data-i18n="aide.pas2">
                  {" "}
                  A new order every two seconds. Obey it, fast.
                  {" "}
                </span>
              </li>
              <li>
                <span className="aide__num">3</span>
                {" "}
                <span className="aide__texte" data-i18n="aide.pas3">
                  {" "}
                  But when the order breaks the rule, it is a TRAP. Do nothing and it passes.
                  {" "}
                </span>
              </li>
            </ol>
            {/*
               LES DEUX DÉMOS.
               Dessinées en SVG inline, pas en images : aucun fichier,
               aucune requête, net à toutes les tailles, et le même
               vocabulaire pixel que la faille (`shape-rendering`).
               Décoratives et `aria-hidden` — le texte au-dessus porte
               déjà toute l'information.
            */}
            <div className="demo">
              <figure className="demo__cas demo__cas--ok">
                <figcaption className="demo__regle">
                  <b data-i18n="aide.regleEx">RULE : never click red</b>
                </figcaption>
                <p className="demo__consigne" data-i18n="aide.consigneOk">
                  ORDER : CLICK THE SQUARE
                </p>
                <svg
                  className="demo__scene"
                  viewBox="0 0 120 44"
                  shapeRendering="crispEdges"
                  aria-hidden="true"
                >
                  <rect x="6" y="10" width="24" height="24" fill="#4f8fd6" />
                  <circle cx="60" cy="22" r="12" fill="#c0433f" />
                  <polygon points="102,10 114,34 90,34" fill="#3fa77a" />
                  <rect
                    className="demo__cible"
                    x="2"
                    y="6"
                    width="32"
                    height="32"
                    fill="none"
                    strokeWidth="2"
                  />
                </svg>
                <p className="demo__verdict demo__verdict--ok" data-i18n="aide.verdictOk">
                  → Click it. The blue square breaks no rule.
                </p>
              </figure>
              <figure className="demo__cas demo__cas--piege">
                <figcaption className="demo__regle">
                  <b data-i18n="aide.regleEx2">RULE : never click red</b>
                </figcaption>
                <p className="demo__consigne" data-i18n="aide.consignePiege">
                  ORDER : CLICK THE RED
                </p>
                <svg
                  className="demo__scene"
                  viewBox="0 0 120 44"
                  shapeRendering="crispEdges"
                  aria-hidden="true"
                >
                  <rect x="6" y="10" width="24" height="24" fill="#4f8fd6" />
                  <circle cx="60" cy="22" r="12" fill="#c0433f" />
                  <polygon points="102,10 114,34 90,34" fill="#3fa77a" />
                  <g className="demo__croix" strokeWidth="3" strokeLinecap="square">
                    <line x1="48" y1="10" x2="72" y2="34" />
                    <line x1="72" y1="10" x2="48" y2="34" />
                  </g>
                </svg>
                <p className="demo__verdict demo__verdict--piege" data-i18n="aide.verdictPiege">
                  → Do nothing. Obeying would break the rule.
                </p>
              </figure>
            </div>
          </div>
        </details>
        <div className="btnrow">
          <button className="btn btn--primary" id="btnGo" data-i18n="brief.go">I'M IN</button>
          {" "}
          {/*
             Proposé uniquement à qui n'a jamais joué et choisit le run du
             jour : on offre le chemin qui pardonne, on ne bloque pas.
          */}
          {" "}
          <button className="btn hidden" id="btnBriefTraining" data-i18n="brief.training">
            TRAIN FIRST
          </button>
          {" "}
          <button className="btn btn--ghost" id="btnBack" data-i18n="commun.retour">BACK</button>
        </div>
        {/*
           Allure : entraînement uniquement. Le run du jour et le classé
           doivent rester identiques pour tout le monde.

           Elle FERME l'écran, sous un filet, au même titre que les
           réglages de l'accueil : on ne choisit pas une allure comme on
           lance une partie, et elle s'intercalait entre la règle et le
           bouton — le seul endroit où l'annonce devait respirer. Le
           défaut (DÉCOUVERTE) est déjà celui dont un débutant a besoin,
           donc personne n'a à la trouver pour bien commencer.
        */}
        <div
          className="settings settings--foot hidden"
          id="briefPace"
          aria-label="Pace"
          data-i18n-aria="aria.allure"
        >
          <div className="settings__row">
            <span className="settings__label" data-i18n="brief.allure">PACE</span>
            <div className="settings__opts" id="optPace" />
          </div>
          <p className="settings__hint hidden" id="briefPaceHint" />
        </div>
        {/*
           CHOISIR SA RÈGLE — entraînement uniquement.

           REPLIÉE, et volontairement la même mécanique que COMMENT ÇA
           MARCHE : elle en reprend les classes, donc les deux replis se
           ressemblent au trait près. Deux composants différents pour un
           même geste, ce serait deux choses à apprendre au lieu d'une.

           Repliée parce que l'écran de brief a UN sujet — la règle qu'on
           va jouer — et que choisir la sienne est un geste de joueur qui
           revient, pas de joueur qui arrive. Le sommaire porte quand même
           le compteur : la progression reste lisible sans rien ouvrir.

           Le libellé n'est PAS sur le <summary> mais sur la feuille qu'il
           contient : `appliqueLangue` écrit dans le `textContent` de
           l'élément qui porte l'attribut, et l'écrire ici détruirait le
           compteur — le piège des cartes de l'accueil.

           Une seule grille, pas un filtre PLUS une grille : le choix est
           unique, donc le mécanisme doit l'être. Les règles jamais
           rencontrées restent VERROUILLÉES et visibles — c'est le verrou
           qu'on montre, comme le carnet avec ses « — — — — ».
        */}
        <details className="aide pick hidden" id="briefPick">
          <summary className="aide__titre">
            <span data-i18n="brief.choisis">TRAIN A RULE</span>
            {" "}
            <span className="pick__count" id="pickCount" />
          </summary>
          <div className="aide__corps">
            <div
              className="pick__grid"
              id="pickGrid"
              role="group"
              aria-label="Rules to train"
              data-i18n-aria="aria.regles"
            />
            <p className="pick__hint" id="pickHint" />
          </div>
        </details>
      </div>
    </Screen>
  );
}
