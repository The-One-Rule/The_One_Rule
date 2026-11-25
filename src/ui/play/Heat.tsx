/**
 * Couche d'ambiance : elle ne contient RIEN de lisible et ne reçoit
 * aucun clic. Tout ce qu'elle fait suit `--heat`, publiée par la
 * boucle de jeu. Deux calques séparés parce qu'ils ne bougent pas au
 * même rythme : le voile respire, le cadre bat.
 */
export function Heat() {
  return (
    <div id="heat" aria-hidden="true">
      <div className="heat__vignette" />
      <div className="heat__frame" />
    </div>
  );
}
