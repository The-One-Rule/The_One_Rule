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
