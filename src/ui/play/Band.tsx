/**
 * LA RÈGLE UNIQUE.
 * C'est l'information dont dépend chaque décision de la partie, et
 * elle tenait dans 19 px au milieu d'une ligne. Elle occupe maintenant
 * la barre entière : intitulé au-dessus, nom en grand, explication sur
 * UNE ligne de hauteur fixe.
 *
 * La hauteur fixe n'est pas cosmétique : le bandeau est dans le flux,
 * donc tout ce qui l'étire rétrécit la scène — et la taille du champ
 * EST le gameplay. Un brief long ne doit pas changer la partie.
 */

/**
 * LES VIES SONT MONTEES ICI, contre la regle.
 * Les deux decident ensemble d'une manche : combien il te reste, et ce
 * que tu n'as pas le droit de faire. Le pied ne garde que ce qu'on
 * consulte entre deux manches.
 */
export function Band() {
  return (
    <header id="band">
      <div className="band__mark" aria-hidden="true" />
      <div className="band__body">
        <span className="band__tag" data-i18n="hud.regle">ONE RULE</span>
        {" "}
        <span className="band__rule" id="bandRule">—</span>
        <p className="band__brief" id="bandBrief" />
      </div>
      <div className="band__droite">
        <span className="band__vies lifedots" id="bandVies" />
        {" "}
        <span className="band__viesLabel" id="bandViesLabel" />
        {" "}
        <span className="band__meta" id="bandMeta">
          <b id="bandMetaVal" />
          <span id="bandMetaLab" />
        </span>
      </div>
    </header>
  );
}
