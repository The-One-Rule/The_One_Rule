import { Screen } from "./Screen";

/**
 * MULTI — FIN DE MATCH
 */

/**
 * Même découpe que le salon : le classement et les titres occupent la
 * zone qui défile, le chat tient la bande de droite sur toute la
 * hauteur. C'est l'écran où l'on commente le match — la discussion
 * doit y être aussi grande que le classement.
 */
export function MultiEnd() {
  return (
    <Screen id="multi-end" dock>
      <div className="screen__pane">
        <div className="screen__scroll screen__scroll--wide end">
          <div className="end__head">
            {/*
               L'intitulé disait « MATCH TERMINÉ » quoi qu'il arrive, et le
               titre ne portait qu'un nom : celui qui perdait lisait le nom
               du vainqueur sans qu'on lui dise qu'il avait perdu.
            */}
            <p className="eyebrow" id="multiEndKicker">MATCH OVER</p>
            <h2 className="verdict" id="multiEndTitle">MATCH OVER</h2>
            {/*
               OU FINIT CELUI QUI LIT, et c'est le seul a ne pas le savoir.
               Le titre porte le nom du vainqueur : pour les cinq autres, cet
               ecran nommait quelqu'un d'autre et se taisait sur eux. La
               maquette telephone tranche par « TU FINIS 2e SUR 6 · MANCHE
               22 » — un rang, un effectif, et combien de temps la table a
               tenu. Le podium le dit deja en detail ; cette ligne le dit
               avant qu'on ait a le chercher.
            */}
            <p className="end__issue" id="multiEndIssue" />
            <p className="end__rang" id="multiEndRang" />
            {/*
               LES PIÈCES DU MATCH (kanban) : la place finale et les manches
               jouées. Vide — donc masquée par `.end__rang:empty` — pour un
               spectateur, ou quand le plafond du jour est déjà atteint.
            */}
            <p className="end__rang end__pieces" id="multiEndPieces" />
          </div>
          <div className="col end__podium">
            <div className="lobby" id="multiPodium" />
          </div>
          <div className="col end__titles">
            <p className="eyebrow" data-i18n="fin.titres">MATCH TITLES</p>
            <div
              id="multiTitles"
              className="titles hidden"
              aria-label="Match awards"
              data-i18n-aria="aria.titres"
            />
          </div>
          <div className="end__foot">
            {/*
               TABLE PUBLIQUE : le match suivant part seul, et la ligne dit
               quand. Même feuille que celle du salon.
            */}
            <p className="room__auto hidden" id="multiEndAuto" aria-live="polite" />
            <div className="btnrow">
              <button className="btn btn--primary" id="btnMultiReplay" data-i18n="fin.rejouerMulti">
                PLAY AGAIN · SAME ROOM
              </button>
              {" "}
              <button className="btn" id="btnMultiEndInvite" data-i18n="salon.copierLien">
                COPY THE LINK
              </button>
              {" "}
              <button className="btn btn--ghost" id="btnMultiEndHome" data-i18n="fin.quitter">
                LEAVE
              </button>
            </div>
            <p className="fineprint" id="multiEndInviteHint">INVITE LINK · ONE CLICK TO COPY</p>
          </div>
        </div>
      </div>
      <aside
        className="chatdock"
        id="chatSlotEnd"
        aria-label="Room chat"
        data-i18n-aria="aria.discussion"
      />
    </Screen>
  );
}
