import { Screen } from "./Screen";

/**
 * MULTI — SALON
 */

/**
 * Trois bandes sur écran large : à gauche ce qu'on décide (le code, les
 * réglages, le lancement), au centre qui est là, et le chat sur toute la
 * hauteur contre le bord droit. Le chat n'est PAS dans la zone qui
 * défile : il est ancré dans `#chatSlot`, hors du flux, pour garder sa
 * hauteur quoi qu'il arrive au reste. Sous 1200 px il redevient la
 * barre flottante du bas.
 */
export function MultiLobby() {
  return (
    <Screen id="multi-lobby" dock>
      <div className="screen__pane">
        <div className="screen__scroll screen__scroll--wide room">
          <div className="col room__setup">
            <div className="room__code">
              {/*
                 Le code se dicte à voix haute autant qu'il se partage par
                 lien : c'est l'élément le plus utile du salon, il doit être
                 le plus visible. Une case par caractère — on épelle « 3, P,
                 S, 8 » au téléphone, on ne lit pas un mot. Les cases sont
                 remplies par `setRoomCode`, jamais par `textContent` sur le
                 conteneur, qui les détruirait (même piège que les cartes).
              */}
              <p className="eyebrow" data-i18n="salon.code">ROOM CODE</p>
              <div
                className="roomcode"
                id="multiLobbyCode"
                aria-label="Room code"
                data-i18n-aria="aria.codeSalon"
              />
              <div className="btnrow btnrow--tight">
                <button className="btn" id="btnMultiCopyCode" data-i18n="salon.copierCode">
                  COPY THE CODE
                </button>
                {" "}
                <button className="btn btn--ghost" id="btnMultiInvite" data-i18n="salon.copierLien">
                  COPY THE LINK
                </button>
              </div>
              {/*
                 ⚠️ Il portait son anglais EN DUR et aucun code ne le reecrivait avant
                 une copie : la ligne restait anglaise pour tout le monde, pour
                 toujours. Le filet a accents ne pouvait pas la voir — elle est en
                 ASCII pur. Trouve en JOUANT, comme les quatre autres.
              */}
              <p className="fineprint" id="multiLobbyCodeHint" data-i18n="salon.dicteCode">
                SAY IT OUT LOUD, OR SEND THE LINK
              </p>
              {/*
                 Maquette 8.1 : pour qui est dans la même pièce, le QR mène au
                 même lien que COPIER LE LIEN. Posé par `setRoomCode`.
              */}
              <div className="roomqr hidden" id="multiLobbyQrBox">
                <div
                  className="roomqr__img"
                  id="multiLobbyQr"
                  aria-label="Room QR code"
                  data-i18n-aria="salon.qrAria"
                />
                <p className="roomqr__quoi" data-i18n="salon.qr">Same room? Scan.</p>
              </div>
            </div>
            {/*
               La regle du jeu, rappelee la ou les joueurs attendent le
               lancement. Sans la case depliable : le salon est deja dense,
               et le brief de chaque manche porte le detail.
            */}
            <p className="piege" id="lobbyPiege" data-i18n="piege.court">
              If an order breaks your rule, do NOTHING.
            </p>
            {/*
               `settings--seg` : les options se touchent, en une seule barre
               segmentée. C'est le seul groupe de réglages du site à l'être —
               l'allure du brief garde ses boutons séparés et ses jauges.
            */}
            <div className="settings settings--seg" id="multiSettings" aria-label="Room settings">
              <p className="settings__who" id="settingsWho">SETTINGS</p>
              <div className="settings__row" data-key="speed">
                <span className="settings__label" data-i18n="salon.vitesse">SPEED</span>
                <div className="settings__opts" id="optSpeed" />
                {/*
                   ⚠️ CE QUE LA VITESSE CHANGE, en millisecondes.
                   Une barre de cinq mots ne dit pas combien de temps on
                   aura : c'est le defaut mesure en soiree — trois joueurs
                   sur quatre ne savaient pas regler la vitesse. La phrase
                   est CALCULEE depuis `windowMs`, jamais ecrite a la main :
                   une valeur en dur divergerait au premier changement de
                   courbe, et personne ne le verrait.
                */}
                <p className="settings__quoi" id="speedQuoi" />
              </div>
              {/*
                 Deux réglages à trois ou quatre valeurs courtes : côte à côte
                 ils tiennent sur une ligne, et la colonne respire.
              */}
              <div className="settings__pair">
                <div className="settings__row" data-key="lives">
                  <span className="settings__label" data-i18n="salon.vies">LIVES</span>
                  <div className="settings__opts" id="optLives" />
                </div>
                <div className="settings__row" data-key="rotationEvery">
                  <span className="settings__label" data-i18n="salon.rotation">ROTATION</span>
                  <div className="settings__opts" id="optRotation" />
                </div>
              </div>
              {/*
                 DUO : les joueurs sont appariés deux à deux et partagent une
                 réserve de vies. Réglage de SALON — on ne choisit pas d'être
                 en duo tout seul — et fixé au lancement, sinon des vies
                 apparaîtraient sous les yeux des joueurs.
              */}
              <div className="settings__row" data-key="mode">
                <span className="settings__label" data-i18n="salon.mode">MODE</span>
                <div className="settings__opts" id="optDuo" />
                <p className="settings__quoi" id="modeQuoi" />
              </div>
              <p className="warn hidden" id="multiStartErr" />
              <p className="settings__hint" id="settingsHint" />
            </div>
            {/*
               Le lancement ferme la colonne : c'est la dernière chose qu'on
               fait, elle est en bas et elle est seule de sa taille.
            */}
            <div className="room__acts">
              {/*
                 TABLE PUBLIQUE : personne ne lance, la table part seule. La
                 ligne dit quand, ou qu'on attend quelqu'un. Une feuille,
                 écrite à chaque seconde par `majDepartAuto`.
              */}
              <p className="room__auto hidden" id="multiAuto" aria-live="polite" />
              <button
                className="btn btn--launch hidden"
                id="btnMultiStart"
                data-i18n="salon.lancer"
              >
                START THE MATCH
              </button>
              {" "}
              {/*
                 Arrivé par un lien : on entre d'abord, on se nomme ensuite.
                 Ce bouton n'apparaît que pour qui n'a pas encore de nom —
                 il porte le nommage APRÈS l'entrée, là où il ne coûte plus
                 rien à personne. Voir openFromInvite dans src/multi.ts.
              */}
              {" "}
              <button className="btn hidden" id="btnMultiNom" data-i18n="salon.nom">
                PICK YOUR NAME
              </button>
              {" "}
              <button className="btn btn--ghost" id="btnMultiLeave" data-i18n="salon.quitter">
                LEAVE THE ROOM
              </button>
              <p className="fineprint" id="multiInviteHint" />
            </div>
          </div>
          <div className="col room__live">
            <div className="room__head">
              <h2 className="room__title" id="multiLobbyTitle">WAITING</h2>
              <p className="room__count" id="multiLobbyCount" />
            </div>
            <div className="seats room__list" id="multiPlayers" />
          </div>
        </div>
      </div>
      <aside
        className="chatdock"
        id="chatSlot"
        aria-label="Room chat"
        data-i18n-aria="aria.discussion"
      />
    </Screen>
  );
}
