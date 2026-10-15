/**
 * BARRE HAUTE.
 * Hors flux, au-dessus des écrans (z-index 11 contre 10), et ABSENTE
 * pendant la partie : la taille du champ EST du gameplay, donc rien
 * ici ne doit pouvoir rogner la scène. Voir CLAUDE.md §6 n°10.
 *
 * Elle existe parce que le compte était perdu dans le pied de
 * l'accueil, entre MUSIQUE et MOTIFS — un réglage d'accessibilité et
 * une identité au même rang. Trois choses seulement : d'où l'on
 * vient, qui l'on est, ce qu'on règle.
 */

/**
 * BARRE HAUTE — enseigne a GAUCHE, commandes a DROITE.
 * Le signe etait au centre d'une grille en trois colonnes, mais MENU
 * est masque sur l'accueil : le tiers gauche restait vide, et tout le
 * poids tombait a droite. Mathematiquement centre, visuellement de
 * travers — rapporte comme tel.
 *
 * Deux bords occupes, plus de tiers mort. C'est aussi ce qui permet a
 * la barre de redescendre : elle n'a plus a etaler trois colonnes.
 */

/**
 * BARRE HAUTE — enseigne a GAUCHE, commandes a DROITE.
 * Le signe etait au centre d'une grille en trois colonnes, mais MENU
 * est masque sur l'accueil : le tiers gauche restait vide et tout le
 * poids tombait a droite. Deux bords occupes valent mieux qu'un
 * centre exact.
 *
 * La LANGUE sort du bandeau et se pose JUSTE EN DESSOUS : empilee
 * dedans, elle portait la barre a 126 px dont l'essentiel etait du
 * vide, et l'accueil se mettait a defiler. Dehors, le bandeau
 * retombe a sa hauteur d'une rangee et la langue reste au meme
 * endroit pour l'oeil.
 */

/**
 * LA BARRE DE NAVIGATION.
 * Cinq destinations, et JOUER surelevee au milieu : c'est la reponse
 * par defaut, elle ne doit pas se chercher.
 *
 * ⚠️ EN ABSOLU DANS `#app`, donc HORS FLUX. Tout ce qui prend de la
 * hauteur ici, le terrain le perd — et la taille du champ EST du
 * gameplay (decision n°10). Elle n'apparait que sur les ecrans de
 * menu, exactement comme la barre haute, et `fieldRect()` est mesure
 * avant/apres a chaque fois.
 *
 * Les icones sont des SVG PIXEL en `crispEdges`, pas une police
 * d'icones : la maquette generique proposait Phosphor, mais un jeu
 * dont l'identite est faite d'angles droits ne charge pas 300 Ko de
 * glyphes arrondis pour cinq formes de quatre rectangles.
 */
export function Nav() {
  return (
    <nav id="nav" className="nav hidden" aria-label="Navigation">
      {/*
         PARCOURS · CARTES · [JOUER] · BOUTIQUE · MULTI
         Le parcours est la maison : le premier bouton y ramène. Le défi
         du jour et le classement vivent sur l'accueil, dans les modes.
      */}
      <button type="button" className="nav__item" id="navParcours">
        <svg
          className="nav__ico"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="6" cy="18" r="2.4" />
          <circle cx="18" cy="6" r="2.4" />
          <path d="M8 17c5 0 3-9 8-10" />
        </svg>
        {" "}
        <span className="nav__lab" data-i18n="nav.parcours">PATH</span>
      </button>
      {" "}
      <button type="button" className="nav__item" id="navCartes">
        <svg
          className="nav__ico"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="10" height="14" rx="2" />
          <path d="M15 7.5l4.5 1.2-3 11.5-4-1" />
        </svg>
        {" "}
        <span className="nav__lab" data-i18n="nav.cartes">CARDS</span>
        <b className="nav__compte" id="navCartesCompte" />
      </button>
      <div className="nav__centre">
        <button type="button" className="nav__jouer" id="navJouer" data-i18n="nav.jouer">
          PLAY
        </button>
        {" "}
        <span className="nav__attend" id="navAttend" />
      </div>
      <button type="button" className="nav__item" id="navBoutique">
        <svg
          className="nav__ico"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        >
          <path d="M4 9h16l-1.5 11h-13z" />
          <path d="M8.5 9a3.5 3.5 0 0 1 7 0" />
        </svg>
        {" "}
        <span className="nav__lab" data-i18n="nav.boutique">SHOP</span>
        <b className="nav__compte" id="navBoutiquePieces" />
      </button>
      {" "}
      <button type="button" className="nav__item" id="navMulti">
        <svg
          className="nav__ico"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        >
          <circle cx="8" cy="9" r="3" />
          <circle cx="16.5" cy="10" r="2.4" />
          <path
            d="M3 19c.6-3 2.6-4.6 5-4.6s4.4 1.6 5 4.6M14 18.6c.4-2 1.4-3.2 3-3.2 1.7 0 3 1.2 3.4 3.2"
          />
        </svg>
        {" "}
        <span className="nav__lab" data-i18n="nav.multi">MULTI</span>
      </button>
    </nav>
  );
}
