import { Screen } from "./Screen";

/**
 * SOLO
 * Les trois modes, et ce qui les entoure : la serie, les quetes, le
 * carnet. Tout ce qui etait sous la ligne de flottaison de l'accueil
 * est ici, ou il a la place d'exister.
 */
export function Solo() {
  return (
    <Screen id="solo">
      <div className="screen__scroll screen__scroll--wide home">
        <div className="home__brand">
          <p className="eyebrow" data-i18n="solo.eyebrow">SOLO</p>
          <h2 className="rulename" data-i18n="solo.titre">YOU VS YOU</h2>
        </div>
        <div className="col home__cards">
          <div className="cards" aria-label="Solo modes" data-i18n-aria="aria.modesSolo">
            <button className="card" id="btnDaily">
              <span className="card__title" data-i18n="carte.daily.titre">DAILY RUN</span>
              {" "}
              <span className="card__desc" id="cardDailyDesc" />
              {" "}
              <span className="card__state" id="cardDailyState" />
            </button>
            {" "}
            {/*
               L'escalade existe pour une raison chiffrée : les morts sur
               le piège étaient tombées à 4,1 %, parce que cinq règles sur
               douze seulement piègent. Empiler les multiplie sans écrire
               une règle de plus. Voir src/game/escalade.ts.
            */}
            {" "}
            <button className="card" id="btnEscalade">
              <span className="card__title" data-i18n="carte.escalade.titre">THE STACK</span>
              {" "}
              <span className="card__desc" data-i18n="carte.escalade.desc">
                One rule. Then two. Then three.
              </span>
              {" "}
              <span className="card__state" id="cardEscaladeState">HOW FAR DO YOU HOLD?</span>
            </button>
            {" "}
            <button className="card" id="btnTraining">
              <span className="card__title" data-i18n="carte.training.titre">TRAINING</span>
              {" "}
              <span className="card__desc" data-i18n="carte.training.desc">
                No risk. Just to get it.
              </span>
              {" "}
              <span className="card__state" id="cardTrainingState" />
            </button>
            {" "}
            <button className="card hidden" id="btnRanked">
              <span className="card__title" data-i18n="carte.ranked.titre">RANKED</span>
              {" "}
              <span className="card__desc" data-i18n="carte.ranked.desc">
                Someone at your level. The very same run.
              </span>
              {" "}
              <span className="card__state" id="cardRankedState" />
            </button>
          </div>
        </div>
        <div className="col home__state">
          <div className="strip" id="homeStreak" />
          <div id="homeQuests" className="quests" />
          {/*
             CE QUI RESTE À FAIRE AUJOURD'HUI.
             Vue 21/27 : « rien à faire aujourd'hui » est l'état pauvre le
             plus facile à rater. Un joueur qui a fini son run du jour
             lisait « FAIT » et rien d'autre — donc un cul-de-sac, sur
             l'écran même qui existe pour donner envie de rejouer.

             ⚠️ IL NE REPÈTE PAS LES CARTES. L'escalade et l'entraînement
             sont juste au-dessus, à trois centimètres : les relister
             serait deux façons de répondre à la même question, exactement
             la faute du « filtre PLUS la grille ». Il ne porte que ce
             qu'aucune carte ne dit — QUELLE règle travailler, et ce qui
             vient demain.
          */}
          <div className="reste hidden" id="soloReste">
            <p className="eyebrow" data-i18n="solo.reste">WHAT IS LEFT TODAY</p>
            <p className="reste__fait" id="soloResteFait" />
            <button
              className="btn btn--ghost reste__act hidden"
              type="button"
              id="btnResteTravailler"
            />
            <p className="reste__demain">
              <span className="reste__kicker" data-i18n="solo.demain">TOMORROW</span>
              {" "}
              <b id="soloDemain" />
            </p>
          </div>
          <div className="btnrow btnrow--tight">
            <button className="btn btn--ghost" id="btnCodex" data-i18n="carnet.titre">
              RULE BOOK
            </button>
            {" "}
            <button className="btn btn--ghost" id="btnMur" data-i18n="mur.eyebrow">
              LEADERBOARD
            </button>
          </div>
        </div>
      </div>
    </Screen>
  );
}
