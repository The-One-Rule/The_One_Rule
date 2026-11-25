import { CoopHud } from "./stage/CoopHud";
import { Cursors } from "./stage/Cursors";
import { Coupure } from "./stage/Coupure";
import { Tuto } from "./stage/Tuto";
import { TutoRate } from "./stage/TutoRate";
import { Annonce } from "./stage/Annonce";
import { Invite } from "./stage/Invite";
import { Relance } from "./stage/Relance";
import { Observe } from "./stage/Observe";

/**
 * La scène : le canvas du jeu et tout ce qui se pose dessus.
 */
export function Stage() {
  return (
    <main id="stage">
      <canvas id="cv" />
      {/*
         Quatre equerres d'accent qui doublent le cadre de temps du canvas.
         Purement decoratives et hors flux : elles ne rognent pas le champ.
      */}
      <span className="equerres" aria-hidden="true" />
      <CoopHud />
      <Cursors />
      <Coupure />
      <Tuto />
      <TutoRate />
      <Annonce />
      <Invite />
      <Relance />
      <Observe />
    </main>
  );
}
