import { Screen } from "./Screen";

/**
 * MULTI — REJOINDRE
 */

/**
 * MULTI — REJOINDRE OU OUVRIR
 * Cinq intentions, une grille : rejoindre le salon de quelqu'un, ou
 * ouvrir le sien dans l'un des QUATRE modes. IMPOSTEUR et COOP
 * n'existaient que dans la barre MODE du salon — un mode qu'il
 * fallait connaître pour trouver. Ils sont désormais des portes, à
 * égalité avec DUO. Le défaut reste SEUL CONTRE TOUS.
 *
 * REJOINDRE occupe toute la largeur et vient en premier : c'est ce que
 * font la plupart des gens, et le code est déjà dans leur presse-papier
 * ou dans leur oreille.
 */
export function MultiJoin() {
  return (
    <Screen id="multi-join">
      <div className="screen__scroll screen__scroll--wide join">
        <div className="join__head">
          <p className="eyebrow" data-i18n="multi.eyebrow">MULTIPLAYER</p>
          <h2 className="rulename" data-i18n="multi.titre">PLAY TOGETHER</h2>
        </div>
        {/*
           LA PARTIE RAPIDE, en tête : c'est la seule porte qui ne demande
           ni code ni ami. Une table publique, qui part seule dès deux
           joueurs et repart seule après chaque match (`server/rapide.ts`).
           Pleine largeur (`panel--large`), comme REJOINDRE.
        */}
        <div className="col panel panel--large panel--rapide">
          <p className="eyebrow" data-i18n="multi.rapide.eyebrow">NO CODE</p>
          <h3 className="panel__title" data-i18n="multi.rapide">QUICK MATCH</h3>
          <p className="panel__text" data-i18n="multi.rapide.desc">
            A public table that starts by itself as soon as two players are in, and starts again
            after every match.
          </p>
          <p className="warn hidden" id="multiRapideErr" />
          <div className="btnrow">
            <button className="btn btn--primary" id="btnMultiRapide" data-i18n="multi.rapide.go">
              PLAY NOW
            </button>
          </div>
        </div>
        <div className="col panel panel--large">
          <p className="eyebrow" data-i18n="multi.attend">THEY'RE WAITING</p>
          <h3 className="panel__title" data-i18n="multi.rejoindre">JOIN</h3>
          {/*
             « caractères » et non « lettres » : l'alphabet des codes
             contient aussi des chiffres (CODE_ALPHABET, sans I/L/O/0/1
             pour qu'un code se dicte). Un joueur à qui l'on annonce
             quatre LETTRES et qui reçoit « 3PS8 » croit s'être trompé.
          */}
          <p className="panel__text" data-i18n="multi.code.aide">
            The four-character code you were given.
          </p>
          {/*
             LE CODE EN QUATRE CASES.
             C'est l'objet le plus utilise du multijoueur : on le dicte a
             voix haute, caractere par caractere. Quatre cases disent
             « quatre caracteres » sans l'ecrire, et montrent ou l'on en
             est.

             ⚠️ IL N'Y A QU'UN SEUL CHAMP, et c'est deliberé. Quatre
             `<input>` demanderaient de gerer le focus, le collage, le
             retour arriere et les claviers mobiles a la main — quatre
             occasions de casser la seule entree obligatoire du jeu. Le
             vrai champ est transparent PAR-DESSUS les cases ; le collage,
             la selection et le clavier restent ceux du navigateur, et
             `#multiCode` garde son identifiant, donc tout ce qui le lit
             continue de marcher.

             Les cases sont `aria-hidden` : le champ porte deja son
             etiquette, et un lecteur d'ecran n'a que faire de quatre
             boites decoratives.
          */}
          <div className="codein" id="codeIn">
            <div className="codein__cases" id="codeInCases" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <input
              className="field codein__champ"
              id="multiCode"
              type="text"
              maxLength={4}
              spellCheck="false"
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              placeholder="CODE"
              data-i18n-ph="ph.code"
              aria-label="Room code"
              data-i18n-aria="aria.codeSalon"
            />
          </div>
          <div className="joinmort hidden" id="joinMort" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <p className="warn hidden" id="multiJoinErr" />
          {/*
             ⚠️ UNE ERREUR PROPOSE UNE SORTIE.
             « AUCUN SALON À CE CODE » laissait le joueur devant un mur
             rouge : il faut retaper (le 2 se confond avec le Z quand on
             dicte) ou ouvrir le sien, et rien ne le disait. Chaque message
             nomme ses issues — et seulement celles qui répondent vraiment
             à lui.
          */}
          <div className="sorties hidden" id="multiJoinSorties" />
          <div className="btnrow">
            <button className="btn btn--primary" id="btnMultiJoin" data-i18n="multi.rejoindre">
              JOIN
            </button>
          </div>
        </div>
        <div className="col panel">
          <p className="eyebrow" data-i18n="multi.ouvres">YOU OPEN</p>
          <h3 className="panel__title" data-i18n="multi.royale">FREE FOR ALL</h3>
          <p className="panel__text" data-i18n="multi.royale.desc">
            Everyone gets a rule. Last one standing wins. 2 to 10.
          </p>
          <div className="btnrow">
            <button className="btn" id="btnMultiCreate" data-i18n="multi.ouvrir">
              OPEN A ROOM
            </button>
          </div>
        </div>
        {/*
           DUO : les joueurs sont appariés deux à deux et partagent une
           réserve de vies. C'est un réglage de SALON — on ne choisit pas
           d'être en duo tout seul — donc l'ouvrir ici le pose d'emblée,
           et l'hôte peut encore le changer dans le salon.
        */}
        <div className="col panel">
          <p className="eyebrow" data-i18n="multi.ouvres">YOU OPEN</p>
          <h3 className="panel__title" data-i18n="multi.duo">DUO</h3>
          <p className="panel__text" data-i18n="multi.duo.desc">
            Two players, one shared pool of lives. Up to 5 teams.
          </p>
          <div className="btnrow">
            <button className="btn" id="btnMultiCreateDuo" data-i18n="multi.ouvrir">
              OPEN A ROOM
            </button>
          </div>
        </div>
        {/*
           ⚠️ **LA PORTE IMPOSTEUR A ETE RETIREE, LE MODE EXISTE TOUJOURS.**

           Playtest : les joueurs n'aiment pas, et preferent le coop, « plus
           simple a comprendre ». Le defaut n'est pas d'habillage, il est
           dans le moteur : `IMPOSTEUR_PIEGES` contient l'indice 0, donc la
           PREMIERE manche est un piege force — et l'imposteur, qui n'a pas
           de regle (`SANS_REGLE.forbids` rend toujours faux), doit obeir.
           Les villageois se figent, lui agit, et les plaques disent AGI /
           RIEN en direct. La partie est decidee avant que personne n'ait
           rien appris. Quand ce n'est pas trivial, c'est du bruit :
           `acteDe()` range « mort au temps » et « piege dejoue » dans la
           meme case, donc un joueur lent est indiscernable d'un joueur qui
           s'est retenu.

           Moteur, serveur et tests restent en place — c'est une porte
           qu'on ferme, pas du code qu'on jette. La barre MODE du salon ne
           l'offre plus non plus (voir `MODES_OFFERTS`), sinon la retirer
           d'ici n'aurait rien change : c'est la que les hotes changent de
           mode. Un salon deja en imposteur reste representable et
           modifiable.

           COOP garde sa porte : preuve immediate, pas de deduction, et le
           piege y reste central.
        */}
        <div className="col panel">
          <p className="eyebrow" data-i18n="multi.ouvres">YOU OPEN</p>
          <h3 className="panel__title" data-i18n="multi.coop">COOP</h3>
          <p className="panel__text" data-i18n="multi.coop.desc">
            One shared life. Each player a forbid. Twelve waves. 4 to 6.
          </p>
          <div className="btnrow">
            <button className="btn" id="btnMultiCreateCoop" data-i18n="multi.ouvrir">
              OPEN A ROOM
            </button>
          </div>
        </div>
        <div className="join__foot">
          <div className="btnrow">
            <button className="btn btn--ghost" id="btnMultiIdentity" data-i18n="multi.changerSigne">
              CHANGE SIGN
            </button>
            {" "}
            <button className="btn btn--ghost" id="btnMultiJoinBack" data-i18n="commun.retour">
              BACK
            </button>
          </div>
        </div>
      </div>
    </Screen>
  );
}
