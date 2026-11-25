import { Screen } from "./Screen";

/**
 * LES AMIS — un écran à eux, et une DEMANDE avant l'amitié.
 * Rapporté par Pierre : « si on veut ajouter quelqu'un en ami on ne
 * lui demande même pas l'autorisation, et c'est dans classement donc
 * mal pensé ». L'ordre de l'écran suit ce qu'on vient y faire, du plus
 * pressant au plus lent : répondre à qui t'a demandé, donner son code,
 * en taper un, puis comparer. Tout se tait sans comptes au déploiement
 * (n°12) ; anonyme, une invitation, jamais un préalable au jeu.
 */
export function Amis() {
  return (
    <Screen id="amis">
      <div className="screen__scroll amisecran">
        <div className="amisecran__tete">
          <h2 className="amisecran__titre" data-i18n="amis.titre">YOUR FRIENDS</h2>
          <p className="amisecran__chapo" data-i18n="amis.chapo">
            Give your code, they accept, and you compare your daily runs.
          </p>
        </div>
        <div className="amis hidden" id="murAmis">
          <div className="amis__anon hidden" id="amisAnon">
            <p className="amis__anontxt" data-i18n="amis.anon">
              SIGN IN TO ADD FRIENDS AND COMPARE YOUR DAILY RUNS.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              id="btnAmisCompte"
              data-i18n="amis.connecter"
            >
              SIGN IN
            </button>
          </div>
          <div className="amis__connecte hidden" id="amisConnecte">
            {/*
               Les demandes REÇUES d'abord : c'est la seule chose de l'écran
               qui attend quelqu'un.
            */}
            <div className="amisbloc amisbloc--recues hidden" id="amisRecuesBloc">
              <p className="amisbloc__titre">
                <span data-i18n="amis.recues">WANT TO BE YOUR FRIEND</span>
                {" "}
                <b className="amisbloc__n" id="amisRecuesN" />
              </p>
              <ul className="demandes" id="amisRecues" />
            </div>
            <div className="moncode">
              <p className="moncode__quoi" data-i18n="amis.tonCode">YOUR CODE</p>
              <b className="moncode__val" id="amisCode">······</b>
              <div className="moncode__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  id="btnAmisPartager"
                  data-i18n="amis.partager"
                >
                  SEND MY CODE
                </button>
                {" "}
                <button type="button" className="btn" id="btnAmisCopier" data-i18n="amis.copier">
                  COPY
                </button>
              </div>
            </div>
            <form className="amis__ajout" id="amisForm" autoComplete="off">
              <label className="amisbloc__titre" htmlFor="amisSaisie" data-i18n="amis.ajouterTitre">
                ADD A FRIEND
              </label>
              <div className="amis__ajoutrang">
                <input
                  className="field amis__saisie"
                  id="amisSaisie"
                  type="text"
                  maxLength={9}
                  spellCheck="false"
                  autoCapitalize="characters"
                  placeholder="FRIEND'S CODE"
                  data-i18n-ph="amis.ph"
                  aria-label="FRIEND'S CODE"
                  data-i18n-aria="amis.ph"
                />
                {" "}
                <button
                  type="submit"
                  className="btn btn--primary"
                  id="btnAmisAjoute"
                  data-i18n="amis.ajoute"
                >
                  ASK
                </button>
              </div>
            </form>
            <p className="warn hidden" id="amisErr" />
            <p className="amis__ok hidden" id="amisOk" aria-live="polite" />
            <div className="amisbloc hidden" id="amisEnvoyeesBloc">
              <p className="amisbloc__titre" data-i18n="amis.envoyees">WAITING FOR THEIR ANSWER</p>
              <ul className="demandes" id="amisEnvoyees" />
            </div>
            <div className="amisbloc">
              <p className="amisbloc__titre" data-i18n="amis.cercle">TODAY'S RUN, BETWEEN YOU</p>
              <ol className="amis__liste" id="amisListe" />
              <p className="fineprint" id="amisNote" />
            </div>
          </div>
        </div>
        <p className="amis__indispo hidden" id="amisIndispo" data-i18n="amis.indispo">
          Friends aren't open yet.
        </p>
      </div>
    </Screen>
  );
}
