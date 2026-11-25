import { Screen } from "./Screen";

/**
 * COMPTE
 * Tout ce qui touche au compte vit ici, et NULLE PART ailleurs sur un
 * chemin de jeu. Aucun mode, aucun réglage d'hôte, aucune entrée de
 * salon n'en dépend : c'est une couche au-dessus de l'identité, pas un
 * préalable.
 */
export function Compte() {
  return (
    <Screen id="compte">
      <div className="screen__scroll profil">
        <p className="eyebrow" data-i18n="profil.eyebrow">PROFILE</p>
        {/*
           QUI TU ES — ce que les autres voient de toi, sur UNE carte.
           Rapporté par Pierre : « c'est quand on clique sur changer de nom
           qu'on peut changer sa photo de profil ». La photo et la carte de
           visite vivaient cachées derrière l'écran NOM ET SIGNE du multi.
           Elles sont ici, à découvert, et l'écran se tient SANS compte :
           un profil n'est pas un compte (décision n°12).
        */}
        <div className="profil__tete">
          {/*
             L'avatar EST l'aperçu de la photo : un seul visage par écran.
          */}
          <span className="profil__avatar" id="idPhotoApercu" aria-hidden="true" />
          <div className="profil__qui">
            <p className="profil__nom" id="profilNom" />
            <p className="profil__via" id="profilVia" />
          </div>
          <button className="btn profil__modifier" id="btnCompteNom" data-i18n="compte.nom">
            NAME AND SIGN
          </button>
        </div>
        {/*
           La porte des AMIS, avec les demandes en attente : c'est ici qu'on
           vient quand la pastille du profil s'allume.
        */}
        <button type="button" className="murlien hidden" id="btnProfilAmis">
          <span className="murlien__quoi" data-i18n="amis.titre">YOUR FRIENDS</span>
          {" "}
          <span className="murlien__dit" id="profilAmisDit" data-i18n="amis.voir">
            Compare your daily runs
          </span>
          {" "}
          <span className="murlien__fleche" aria-hidden="true">›</span>
        </button>
        {/*
           LA CARTE DE VISITE. Parmi les cartes GAGNÉES seulement : la
           collection ne dévoile pas une règle jamais rencontrée (n°7), et
           un choix qui se débloque en jouant est une raison de jouer.
           Elle habille le siège, la plaque et la ligne du classement :
           c'est ce qui fait reconnaître un joueur sans lire son nom.
        */}
        <p className="eyebrow profil__titre" data-i18n="profil.carte">YOUR CARD</p>
        <div
          className="cartepick"
          id="idCartes"
          role="radiogroup"
          aria-label="YOUR CARD"
          data-i18n-aria="profil.carte"
        />
        <p className="fineprint" data-i18n="profil.carteAide">
          WIN MORE CARDS BY PLAYING: EACH ONE CAN REPRESENT YOU.
        </p>
        {/*
           LA PHOTO. Réduite à 96 × 96 PAR LE CLIENT avant d'être gardée
           ou envoyée (`render/photo.ts`) : la pleine résolution ne quitte
           jamais l'appareil.
        */}
        <p className="eyebrow profil__titre" data-i18n="profil.photo">YOUR PHOTO</p>
        <div className="photopick">
          <label
            className="btn photopick__choisir"
            htmlFor="idPhotoFichier"
            data-i18n="profil.photoChoisir"
          >
            CHOOSE A PHOTO
          </label>
          {" "}
          <input className="photopick__fichier" id="idPhotoFichier" type="file" accept="image/*" />
          {" "}
          <button
            type="button"
            className="btn btn--ghost hidden"
            id="btnPhotoRetirer"
            data-i18n="profil.photoRetirer"
          >
            REMOVE
          </button>
        </div>
        <p className="fineprint" data-i18n="profil.photoAide">
          ONLY THE PLAYERS OF YOUR ROOMS SEE IT. EVERYONE CAN HIDE OTHERS' PHOTOS IN SETTINGS.
        </p>
        <p className="warn hidden" id="profilErr" />
        {/*
           LE COMPTE — sous le profil, et seulement s'il existe sur ce
           déploiement : sans fournisseur, la section se tait entière.
        */}
        <div className="profil__compte" id="profilCompte">
          <p className="eyebrow profil__titre" data-i18n="compte.eyebrow">ACCOUNT</p>
          <h2 className="rulename" id="compteTitre">SAVE YOUR RUNS</h2>
          <p className="lede" id="compteLede" />
          {/*
             Anonyme : le choix du fournisseur.
             Le titre porte le CHIFFRE du joueur — « garde ce 31 » dit ce
             qu'un compte sert a faire, la ou « cree un compte » ne dit que ce
             qu'on demande.
          */}
          <div id="compteAnon">
            <div className="cpt__grille" id="cptGrilleAnon" />
            <p className="fineprint" id="compteQuoi" />
            <div className="btnrow" id="compteFournisseurs" />
            <p className="warn hidden" id="compteErr" />
          </div>
          {/*
             Connecté : qui l'on est, et ce que le compte porte.
          */}
          <div className="account__on hidden" id="compteConnecte">
            {/*
               Quatre chiffres, et aucun n'est un jugement.
            */}
            <div className="cpt__grille" id="cptGrille" />
            {/*
               TA COLLECTION : une case par regle, coloree par son etat, plus
               le compte de chaque etat. C'est la meme jauge que la barre
               laterale du carnet — un seul objet a apprendre.
            */}
            <p className="eyebrow" data-i18n="cpt.collection">YOUR COLLECTION</p>
            <div className="codexbar__jauge" id="cptJauge" aria-hidden="true" />
            <p className="cpt__repartition" id="cptRepartition" />
            {/*
               LE RUN DU JOUR : le seul resultat OPPOSABLE a quelqu'un
               d'autre, parce qu'il est le seul que le serveur ait rejoue.
            */}
            <p className="eyebrow" data-i18n="cpt.jour">DAILY RUN</p>
            <div className="cpt__jour" id="cptJour">
              <div className="cpt__jourTxt">
                <p className="cpt__jourVal" id="cptJourVal" />
                <p className="cpt__jourNote" id="cptJourNote" />
              </div>
              <span className="cpt__badge hidden" id="cptOpposable" data-i18n="cpt.opposable">
                VERIFIED
              </span>
            </div>
            <p className="cpt__fine" data-i18n="cpt.fine">
              Only runs replayed by the server can be held against anyone else. Codex, streak and
              training records are claims from your device — they touch no leaderboard.
            </p>
            <div className="account" id="compteIdentite" />
            <div className="btnrow btnrow--tight">
              <button
                className="btn btn--ghost"
                id="btnCompteQuitter"
                data-i18n="compte.deconnexion"
              >
                SIGN OUT
              </button>
              {" "}
              {/*
                 Deux temps, jamais un seul : le premier clic dit ce qui va
                 disparaître, le second le fait. Un bouton de suppression qui
                 agit au premier clic est une trappe.
              */}
              {" "}
              <button
                className="btn btn--ghost"
                id="btnCompteSupprimer"
                data-i18n="compte.supprimer"
              >
                DELETE ACCOUNT
              </button>
            </div>
            <p className="warn hidden" id="compteDanger" />
          </div>
        </div>
        <div className="btnrow">
          <button className="btn btn--ghost" id="btnCompteBack" data-i18n="commun.retour">
            BACK
          </button>
        </div>
      </div>
    </Screen>
  );
}
