import { asset } from "../../assets";

/**
 * « C'EST ENCORE MIEUX À PLUSIEURS » (maquette, après la première
 * partie). Un calque posé UNE fois sur l'écran de fin déjà prêt :
 * CONTINUER SEUL le referme et rend cet écran tel quel.
 */
export function Invite() {
  return (
    <div
      id="invite"
      className="aplusieurs hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inviteTitre"
    >
      <div className="aplusieurs__carte">
        <p className="aplusieurs__eyebrow" id="inviteEyebrow" />
        <img
          className="aplusieurs__img"
          src={asset("poses/amis.png")}
          alt=""
          width="600"
          height="432"
          loading="lazy"
        />
        <h2 className="aplusieurs__titre" id="inviteTitre" data-i18n="invite.titre">
          It's even better together.
        </h2>
        <p className="aplusieurs__quoi" data-i18n="invite.quoi">
          A 4-letter code, up to 10 friends, each with their own rule.
        </p>
        <button
          type="button"
          className="btn btn--gros aplusieurs__creer"
          id="btnInviteCreer"
          data-i18n="invite.creer"
        >
          CREATE A ROOM
        </button>
        {" "}
        <button
          type="button"
          className="btn aplusieurs__seul"
          id="btnInviteSeul"
          data-i18n="invite.seul"
        >
          CONTINUE ALONE
        </button>
        {" "}
        <button
          type="button"
          className="aplusieurs__modes"
          id="btnInviteModes"
          data-i18n="invite.modes"
        >
          See every mode
        </button>
      </div>
    </div>
  );
}
