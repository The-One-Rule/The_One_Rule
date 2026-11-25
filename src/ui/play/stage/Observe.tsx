/**
 * OBSERVATION IMPOSTEUR, HORS FLUX.
 * Après les dix manches : rejouer les scènes, règles masquées.
 * Absolu dans `#stage` comme `#tuto` : `#cv` ne bouge pas.
 * `pointer-events: none` sur le calque, `auto` sur les boutons.
 */
export function Observe() {
  return (
    <div id="observe" className="observe hidden" aria-live="polite">
      <div className="observe__bar">
        <button
          type="button"
          id="btnObservePrev"
          className="btn btn--ghost"
          data-i18n="observe.prev"
        >
          PREVIOUS
        </button>
        <p className="observe__tour" id="observeTour">1 / 10</p>
        <button
          type="button"
          id="btnObserveNext"
          className="btn btn--ghost"
          data-i18n="observe.next"
        >
          NEXT
        </button>
      </div>
      <p className="observe__quoi" data-i18n="observe.quoi">
        THE TEN ROUNDS. THE RULE STAYS HIDDEN.
      </p>
      <p className="observe__detail" id="observeDetail" />
      {/*
         Vote : les glyphes sont déjà sur les plaques. Pas une liste
         des seize règles, pas un champ texte. Le wrapper se masque pour
         un spectateur (`.observe__vote.hidden`, pas un `.hidden` générique).
      */}
      <div id="observeVote" className="observe__vote">
        <button
          type="button"
          id="btnObserveVote"
          className="btn btn--ghost"
          data-i18n="observe.vote"
        >
          CONFIRM
        </button>
        <p className="observe__vote-etat" id="observeVoteEtat" />
      </div>
    </div>
  );
}
