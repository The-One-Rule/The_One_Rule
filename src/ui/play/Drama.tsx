export function Drama() {
  return (
    <div id="drama" className="drama hidden" aria-live="assertive" aria-hidden="true">
      <div className="drama__panel">
        <p className="drama__eyebrow" id="dramaEyebrow" />
        <p className="drama__old hidden" id="dramaOld" />
        <p className="drama__names" id="dramaNames" />
        <p className="drama__rule" id="dramaRule" />
        <p className="drama__reason" id="dramaReason" />
        <p className="drama__extra" id="dramaExtra" />
      </div>
    </div>
  );
}
