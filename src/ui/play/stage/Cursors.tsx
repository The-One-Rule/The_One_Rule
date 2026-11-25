/**
 * CURSEURS COOP, HORS FLUX.
 * Relais décoratif : les clics percent jusqu'au canvas
 * (`pointer-events: none`). Six sièges max. Les noms sont
 * écrits à l'exécution sur la feuille `.curseur__nom`.
 */
/** Six sièges au plus : un curseur par adversaire, noms écrits à l'exécution. */
const SIEGES = 6;

export function Cursors() {
  return (
    <div id="cursors" className="cursors hidden" aria-hidden="true">
      {Array.from({ length: SIEGES }, (_, i) => (
        <div className="curseur" key={i}>
          <i className="curseur__trace" />
          <i className="curseur__trace" />
          <i className="curseur__trace" />
          <b className="curseur__pointe" />
          <span className="curseur__nom" />
        </div>
      ))}
    </div>
  );
}
