/**
 * Plaques, spectateur, emotes. `#liveHud` est `display: contents` :
 * sur bureau ils restent des enfants flex de `#app`, et `has-gutters`
 * pose encore les plaques dans les colonnes. Sous 720 px le calque
 * sort du flux et se pose au bas de `#stage`, au-dessus du pied.
 *
 */
export function LiveHud() {
  return (
    <div id="liveHud">
      <div id="plates" className="plates hidden" aria-label="Players" data-i18n-aria="aria.joueurs">
        <div className="plates__col" id="platesL" />
        <div className="plates__col" id="platesR" />
      </div>
      <div
        id="watchBar"
        className="watchbar hidden"
        aria-label="Spectating"
        data-i18n-aria="aria.spectateur"
      >
        <span className="watchbar__label" data-i18n="hud.regarde">WATCHING</span>
        <div className="watchbar__targets" id="watchTargets" />
      </div>
      <div
        id="emotes"
        className="emotes hidden"
        aria-label="Reactions"
        data-i18n-aria="aria.emotes"
      />
    </div>
  );
}

/**
 * LE FIL DES CHUTES.
 * Qui vient de tomber, et pourquoi — sans arrêter la partie. Le
 * panneau plein cadre reste pour les morts qui méritent un temps
 * d'arrêt ; toutes les autres passaient jusqu'ici par un simple
 * clignotement de plaque, qu'on rate en regardant la scène.
 */
export function Feed() {
  return (
    <div
      id="feed"
      className="feed"
      aria-live="polite"
      aria-label="Eliminations"
      data-i18n-aria="aria.chutes"
    />
  );
}
