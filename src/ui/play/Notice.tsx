export function Notice() {
  return (
    <div id="notice" className="notice hidden">
      <p data-i18n="mesure.texte">
        This game counts games played, scores and return days, under a random identifier. No
        account, no cookie, nothing sold, no personal data. It only serves to know whether the game
        deserves to go on.
      </p>
      <div className="notice__btns">
        <button className="btn btn--ghost" id="btnMetricsOff" data-i18n="mesure.refuser">
          DECLINE
        </button>
        {" "}
        <button className="btn" id="btnMetricsOk" data-i18n="mesure.accord">GOT IT</button>
      </div>
    </div>
  );
}
