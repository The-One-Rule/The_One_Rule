export function Chat() {
  return (
    <div id="chat" className="chat hidden" aria-label="Room" data-i18n-aria="aria.salon">
      <div className="chat__log" id="chatLog" aria-live="polite" />
      <form className="chat__form" id="chatForm">
        <input
          className="chat__input"
          id="chatInput"
          type="text"
          autoComplete="off"
          spellCheck="false"
          aria-label="Message"
          data-i18n-aria="aria.chat"
          placeholder="TYPE HERE TO TALK"
          data-i18n-ph="ph.chat"
        />
      </form>
    </div>
  );
}
