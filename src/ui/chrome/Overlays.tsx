/**
 * MICRO-ÉTATS — hors flux, pointer-events none sauf la maîtrise.
 * La découverte se cale sur le terrain ; la maîtrise couvre la fin
 * de run. Le toast et la pastille ne prennent aucun pixel au champ.
 */
export function Micro() {
  return (
    <div
      id="micro"
      className="micro hidden"
      aria-live="polite"
      aria-hidden="true"
      aria-label="Announcement"
      data-i18n-aria="aria.micro"
    >
      <div className="micro__panel">
        <p className="micro__eyebrow" id="microEyebrow" />
        <p className="micro__nom" id="microNom" />
        <p className="micro__quoi" id="microQuoi" />
      </div>
    </div>
  );
}

/**
 * L'INVITATION D'UN AMI (kanban) — reçue d'un ami, via le serveur de salons.
 * Hors flux, en haut ; jamais pendant une manche (le serveur ne la remet
 * pas à un joueur en partie). REJOINDRE mène au salon, PLUS TARD la ferme.
 */
export function InvitationAmi() {
  return (
    <div id="invitationAmi" className="invitami hidden" role="alert">
      <p className="invitami__texte" id="invitamiTexte" />
      <div className="invitami__actions">
        <button className="btn btn--primary" id="btnInvitamiOui" data-i18n="invitami.oui">
          JOIN
        </button>
        {" "}
        <button className="btn btn--ghost" id="btnInvitamiNon" data-i18n="invitami.non">
          LATER
        </button>
      </div>
    </div>
  );
}

export function Toast() {
  return (
    <div
      id="toast"
      className="toast hidden"
      aria-live="polite"
      aria-label="Notice"
      data-i18n-aria="aria.toast"
    >
      <p className="toast__titre" id="toastTitre" />
      <p className="toast__quoi hidden" id="toastQuoi" />
    </div>
  );
}

export function Pastille() {
  return (
    <div id="pastille" className="pastille hidden" aria-hidden="true">
      <b id="pastilleScore" />
      {" "}
      <span id="pastilleNote" />
    </div>
  );
}
