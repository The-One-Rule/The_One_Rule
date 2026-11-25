import { Screen } from "./Screen";

/**
 * FIN DE RUN
 */
export function Over() {
  return (
    <Screen id="over">
      {/*
         Deux natures de contenu, donc deux colonnes : à gauche ce qui vient
         de se passer, à droite ce que ça a fait avancer. Le verdict coiffe,
         les actions referment.
      */}
      <div className="screen__scroll screen__scroll--wide over">
        <div className="over__head">
          <h2 className="verdict" id="verdict">OUT</h2>
          <p className="because" id="because" />
        </div>
        {/*
           Ce que le run a donné : le compte, la bande de manches, et ce
           qu'il a rapporté. La récompense reste ici et non en face — c'est
           un résultat, pas une projection, et sur téléphone elle doit se
           lire dans la foulée du score.
        */}
        <div className="col over__result">
          <div className="tally" id="tally">0</div>
          <p className="eyebrow" id="tallyLabel">ROUNDS HELD</p>
          {/*
             LE RECORD BATTU.
             Le pied l'annonce deja EN DIRECT pendant le run ; l'ecran de
             fin, lui, se contentait de poser le score entre trois reperes.
             Le seul instant du run qui vaut d'etre vecu meritait mieux
             qu'une ligne parmi trois.

             ⚠️ Il REMPLACE le repere « TON RECORD » plutot que de s'y
             ajouter : afficher « TON RECORD · 23 » sous « TU AS BATTU TON
             RECORD » se contredit a une ligne d'intervalle. La priorite
             vit dans render/exploit.ts, pure et testee — cinquieme du
             depot apres plate, seat, jour et but.
          */}
          <div className="exploit hidden" id="exploit">
            <p className="exploit__titre" id="exploitTitre" />
            <p className="exploit__chiffres">
              <span id="exploitAncien" />
              {" "}
              <b id="exploitAvance" />
            </p>
          </div>
          {/*
             OU SE SITUE CE SCORE. Un nombre seul ne dit pas s'il est bon :
             la maquette le met entre son propre record, sa mediane, et le
             meilleur connu. Trois reperes, pas un jugement.
          */}
          <p className="reperes" id="reperes" />
          <div className="marks" id="marks" />
          {/*
             La frise disait son affaire par la seule COULEUR. La legende la
             nomme, et reprend les silhouettes du mode motifs — c'est la
             meme information pour qui ne distingue pas le vert du rouge.
          */}
          <p className="marks__legende" id="marksLegende" />
          <div className="reward hidden" id="reward" />
          <div className="rank hidden" id="rankResult" />
          {/*
             LE PODIUM DU JOUR.
             Trois places, et le rang personnel en dessous quand on n'y est
             pas. Trois et non dix : la graine du jour est forgeable hors
             ligne, et chaque place publiée est une place qui vaut d'être
             forgée. Trois rend la comparaison sociale plutôt que technique.

             Il ne parait qu'apres un RUN DU JOUR, et seulement s'il y a
             quelque chose a montrer : un cadre vide sur l'ecran de fin se
             lirait comme un chargement rate.
          */}
          <div className="podium hidden" id="podium">
            <p className="eyebrow" data-i18n="podium.titre">TODAY'S BEST</p>
            <ol className="podium__liste" id="podiumListe" />
            <p className="podium__moi" id="podiumMoi" />
          </div>
        </div>
        <div className="col over__next">
          {/*
             CE QUE CE RUN A FAIT AVANCER.
             La question a laquelle cet ecran doit repondre est « qu'est-ce
             que je viens de gagner ? ». Le score seul n'y repond pas : il
             dit ce qu'on a fait, pas ce qu'on a acquis.

             Masque quand le run n'a rien fait avancer — un bloc qui annonce
             une progression nulle est pire que pas de bloc.
          */}
          {/*
             LA CARTE ACCOMPAGNE CE QU'ELLE A GAGNE.
             Les deux blocs parlent d'une regle, et la regle EST une carte :
             c'est l'objet que le joueur collectionne, celui qu'il retrouve
             dans le carnet. La nommer sans la montrer laissait ce lien a
             sa charge. Meme image, meme cadre, meme trame que partout
             ailleurs — `/cartes/<id>.png`.
          */}
          <div className="avance hidden" id="avance">
            <p className="eyebrow" data-i18n="fin.avance">WHAT THIS RUN ADVANCED</p>
            <div className="avance__corps">
              <div className="avance__carte" id="avanceCarte" aria-hidden="true" />
              <div className="avance__texte">
                <p className="avance__regle" id="avanceRegle" />
                {/*
                   La progression VUE : les six cases de l'echelle, dont
                   celles que ce run vient de faire tomber.
                */}
                <div className="avance__jauge" id="avanceJauge" />
                <p className="avance__quoi" id="avanceQuoi" />
              </div>
            </div>
            <button className="btn" id="btnAvanceTrain" />
          </div>
          {/*
             UNE REGLE DECOUVERTE est un evenement : c'est une carte de plus
             dans la collection, et la seule chose du jeu qui ne se rejoue
             pas. Elle merite sa propre annonce.
          */}
          <div className="decouverte hidden" id="decouverte">
            <p className="eyebrow" data-i18n="fin.decouverte">RULE DISCOVERED</p>
            <div className="avance__corps">
              <div className="avance__carte" id="decouverteCarte" aria-hidden="true" />
              <div className="avance__texte">
                <p className="decouverte__nom" id="decouverteNom" />
                <p className="decouverte__note" id="decouverteNote" />
              </div>
            </div>
          </div>
          {/*
             « QUÊTES VALIDÉES · +30 PIÈCES » ne disait pas LESQUELLES : la
             seule page qui les montrait était l'accueil, qu'on ne revoit
             qu'en quittant. La liste vit ici, au moment où elle bouge.
          */}
          <p className="eyebrow" data-i18n="fin.quetes">TODAY'S QUESTS</p>
          <div className="quests" id="overQuests" />
          {/*
             TROIS CHIFFRES, D'UN COUP D'OEIL — quetes, serie, carnet.
             Les trois choses qu'un run fait bouger en dehors du score. La
             liste des quetes juste au-dessus dit LESQUELLES ; ces tuiles
             disent OU L'ON EN EST, ce qu'aucune ligne ne donnait. La tuile
             SERIE remplace la phrase « serie en cours » : meme donnee, une
             ligne de moins.
          */}
          <div className="bilan" id="bilan" />
          <div className="teaser" id="teaser" />
          {/*
             L'AVIS, UNE FOIS, APRÈS LA DEUXIÈME PARTIE (`game/avis.ts`).
             Un tap suffit : la note part tout de suite. Le mot libre est
             facultatif et n'apparaît qu'après la note — un champ de texte
             d'emblée se lirait comme un formulaire.
          */}
          <div className="avis hidden" id="avis" aria-live="polite">
            <p className="avis__q" data-i18n="avis.question">TWO RUNS IN. SO, THIS GAME?</p>
            <div
              className="avis__notes"
              role="group"
              aria-label="TWO RUNS IN. SO, THIS GAME?"
              data-i18n-aria="avis.question"
            >
              <button type="button" className="avis__note" data-note="1" data-i18n="avis.bof">
                MEH
              </button>
              {" "}
              <button type="button" className="avis__note" data-note="2" data-i18n="avis.sympa">
                NICE
              </button>
              {" "}
              <button type="button" className="avis__note" data-note="3" data-i18n="avis.accro">
                HOOKED
              </button>
            </div>
            <div className="avis__plus hidden" id="avisPlus">
              <label className="avis__label" htmlFor="avisTexte" data-i18n="avis.plus">
                ONE WORD TO MAKE IT BETTER? (OPTIONAL)
              </label>
              {" "}
              <textarea
                className="avis__texte"
                id="avisTexte"
                rows={3}
                maxLength={280}
                placeholder="What hooked you, what lost you…"
                data-i18n-ph="avis.ph"
              />
              <p className="avis__prive" data-i18n="avis.prive">
                Anonymous. Nothing personal, please.
              </p>
              <div className="avis__actions">
                <button
                  type="button"
                  className="btn btn--mini"
                  id="btnAvisEnvoyer"
                  data-i18n="avis.envoyer"
                >
                  SEND
                </button>
                {" "}
                <button
                  type="button"
                  className="btn btn--ghost btn--mini"
                  id="btnAvisNon"
                  data-i18n="avis.non"
                >
                  NO THANKS
                </button>
              </div>
            </div>
            <p className="avis__merci hidden" id="avisMerci" data-i18n="avis.merci">
              THANKS. EVERY WORD IS READ.
            </p>
          </div>
          {/*
             L'invitation à installer : une fois, après trois parties, et
             seulement si l'appareil sait le faire (game/installer.ts).
          */}
          <div className="installer hidden" id="installer" aria-live="polite">
            <p className="installer__q" data-i18n="installer.titre">PLAY IT FULL SCREEN</p>
            <p className="installer__quoi" id="installerQuoi">
              Add TOR to your home screen: no browser bar, more board.
            </p>
            <div className="installer__actions">
              <button
                type="button"
                className="btn btn--mini"
                id="btnInstaller"
                data-i18n="installer.ajouter"
              >
                ADD IT
              </button>
              {" "}
              <button
                type="button"
                className="btn btn--ghost btn--mini"
                id="btnInstallerNon"
                data-i18n="installer.non"
              >
                NOT NOW
              </button>
            </div>
          </div>
          {/*
             L'invitation à enregistrer.
             Un ÉTAT, pas une interruption : le playtest a établi que la
             pause est un moment de respiration, pas de lecture — « les
             joueurs soufflent plutôt que de s'intéresser au chat ». Tout
             ce qui demanderait de lire et de cliquer ici perdrait contre
             REJOUER, ou l'agacerait. Elle vit donc dans la colonne de
             droite, loin de la rangée d'actions, et elle porte le CHIFFRE
             qu'on perdrait — « créer un compte » est abstrait, « ce 23 »
             ne l'est pas.
          */}
          <div className="invite hidden" id="compteInvite">
            <p className="invite__text" id="compteInviteText" />
            <button
              className="btn btn--ghost btn--mini"
              id="btnCompteInvite"
              data-i18n="fin.enregistrer"
            >
              SAVE THIS
            </button>
          </div>
        </div>
        <div className="over__foot">
          <div className="btnrow">
            <button className="btn btn--primary" id="btnAgain" data-i18n="fin.rejouer">
              AGAIN · R
            </button>
            {" "}
            <button className="btn" id="btnShare" data-i18n="fin.partager">SHARE</button>
            {" "}
            {/*
               LA CARTE. Le partage TEXTE est a 0 % sur trois releves et 203
               joueurs — le bouton existait a chaque fois. L'hypothese est
               que ce qui manquait n'est pas le bouton mais l'OBJET : trois
               lignes collees dans une conversation ne se distinguent
               d'aucun autre message.
            */}
            {" "}
            <button className="btn" id="btnShareCarte" />
            {" "}
            <button className="btn" id="btnDuel" data-i18n="fin.defier">CHALLENGE A FRIEND</button>
            {" "}
            <button className="btn btn--ghost" id="btnHome" data-i18n="commun.menu">MENU</button>
          </div>
        </div>
      </div>
    </Screen>
  );
}
