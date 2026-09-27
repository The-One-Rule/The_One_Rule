/**
 * LES ADRESSES DU SITE — une par écran, et un vrai bouton RETOUR.
 *
 * Demandé par Pierre : « je voudrais que chaque partie du site ait une page
 * différente, par exemple dans l'url lelien/entrainement ou lelien/home ». Et,
 * dans le même message : « pas de bouton pour revenir en arrière pour taper le
 * code d'un salon, juste direct au menu ».
 *
 * ⚠️ **CE SONT DEUX SYMPTÔMES DU MÊME MANQUE.** L'application ne savait pas
 * d'où l'on venait. Chaque bouton RETOUR portait une destination ÉCRITE EN
 * DUR — `btnMultiJoinBack` faisait littéralement `exitToMenu(); show("home")`,
 * donc il ne revenait pas, il éjectait. Sept boutons de ce genre, sept
 * destinations devinées à l'écriture. Une histoire de navigation répond aux
 * deux d'un coup : elle donne une adresse à chaque écran ET elle sait ce qui
 * précède.
 *
 * ⚠️ **DEUX CATÉGORIES D'ÉCRANS, ET LA DIFFÉRENCE EST DE FOND.**
 *
 * Un écran ADRESSABLE se tient tout seul : ouvrir `/cartes` dans un onglet neuf
 * a un sens. Un écran CONTEXTUEL n'existe qu'au bout d'un parcours — un salon
 * sans code, une fiche sans règle, un écran de fin sans run sont des cadres
 * vides. Ils reçoivent quand même une adresse pendant la navigation, parce que
 * c'est elle qui rend le retour possible ; mais une arrivée FROIDE dessus
 * retombe sur leur parent. Montrer un cadre vide se lirait comme un chargement
 * raté, et le joueur n'aurait rien à réparer — c'est déjà la doctrine du
 * podium.
 *
 * ⚠️ **LES CHEMINS SONT EN FRANÇAIS**, comme tout le reste du dépôt, et ils ne
 * suivent PAS la langue de l'interface. Une adresse est un identifiant : si
 * elle changeait avec la langue, un lien partagé par un francophone tomberait
 * en 404 chez un anglophone qui a basculé son réglage.
 *
 * Module PUR : pas de `location`, pas de `history`. C'est ce qui permet de le
 * tester, et c'est là que vivent les décisions.
 */

/**
 * Les écrans du jeu, tels que `main.ts` les nomme.
 *
 * `null` est l'écran de PARTIE — le canvas seul, sans habillage. Il a une
 * adresse lui aussi : sans elle, le bouton précédent du navigateur sauterait
 * par-dessus la partie en cours comme si elle n'avait pas eu lieu.
 */
export type EcranId =
  | "home"
  | "fiche"
  | "niveau"
  | "boutique"
  | "solo"
  | "brief"
  | "over"
  | "codex"
  | "compte"
  | "classement"
  | "amis"
  | "reglages"
  | "multi-id"
  | "multi-join"
  | "multi-lobby"
  | "multi-end"
  | "partie";

interface Route {
  chemin: string;
  /** Vrai si l'écran se tient seul : ouvrir son adresse à froid a un sens. */
  adressable: boolean;
  /** Où retomber quand on arrive à froid sur un écran contextuel. */
  parent: EcranId;
}

/**
 * LA TABLE. Un chemin par écran, et le parent de chacun.
 *
 * ⚠️ L'ordre n'a aucune importance, mais l'UNICITÉ des chemins en a une : deux
 * écrans sous la même adresse rendraient le retour non déterministe. Un test le
 * vérifie plutôt que de compter sur la relecture.
 */
const TABLE: Record<EcranId, Route> = {
  home: { chemin: "/", adressable: true, parent: "home" },
  solo: { chemin: "/solo", adressable: true, parent: "home" },
  codex: { chemin: "/cartes", adressable: true, parent: "home" },
  classement: { chemin: "/classement", adressable: true, parent: "home" },
  amis: { chemin: "/amis", adressable: true, parent: "home" },
  reglages: { chemin: "/reglages", adressable: true, parent: "home" },
  compte: { chemin: "/compte", adressable: true, parent: "home" },
  "multi-join": { chemin: "/multi", adressable: true, parent: "home" },
  boutique: { chemin: "/boutique", adressable: true, parent: "home" },
  niveau: { chemin: "/niveau", adressable: false, parent: "home" },

  // Contextuels : ils ont une adresse pour que le retour marche, mais une
  // arrivée à froid retombe sur leur parent.
  fiche: { chemin: "/carte", adressable: false, parent: "codex" },
  brief: { chemin: "/entrainement", adressable: false, parent: "solo" },
  partie: { chemin: "/partie", adressable: false, parent: "solo" },
  over: { chemin: "/fin", adressable: false, parent: "solo" },
  "multi-id": { chemin: "/multi/nom", adressable: false, parent: "multi-join" },
  "multi-lobby": { chemin: "/salon", adressable: false, parent: "multi-join" },
  "multi-end": { chemin: "/salon/fin", adressable: false, parent: "multi-join" },
};

/**
 * LES AUTRES ORTHOGRAPHES QU'ON PEUT TAPER.
 *
 * ⚠️ **RAPPORTÉ** : « quand je tape ma propre url vers une page du site elle me
 * ramène directement à la page principale ». Et pour cause — la demande de
 * départ disait « lelien/entrainement ou **lelien/home** », et `/home` n'était
 * dans aucune table : l'accueil s'écrit `/`, donc `/home` tombait dans le cas
 * « adresse inconnue » et rendait l'accueil. Le comportement était juste, la
 * table était incomplète.
 *
 * ⚠️ **UN ALIAS N'EST PAS UNE SECONDE ADRESSE.** Il est LU, jamais ÉCRIT :
 * `cheminDe` ne rend que la forme canonique, donc un lien copié depuis la barre
 * porte toujours la même. C'est ce qui préserve la propriété qui compte — une
 * adresse est un identifiant — tout en étant tolérant sur ce qu'on tape, comme
 * `normalise` l'est déjà sur la casse et la barre finale.
 *
 * L'anglais est ici pour une raison précise : la moitié des joueurs jouent en
 * anglais et devineront `/cards` ou `/settings` avant `/cartes`.
 */
const ALIAS: Record<string, EcranId> = {
  "/home": "home",
  "/friends": "amis",
  "/accueil": "home",
  "/index": "home",
  "/play": "solo",
  "/jouer": "solo",
  "/cards": "codex",
  "/carnet": "codex",
  "/collection": "codex",
  "/leaderboard": "classement",
  "/settings": "reglages",
  "/account": "compte",
  "/training": "brief",
  // L'ancien écran ESCALIER a disparu ; ses liens retombent sur la collection.
  "/climb": "codex",
  "/escalier": "codex",
  "/room": "multi-lobby",
  "/multiplayer": "multi-join",
};

/** Le chemin d'un écran. Toujours défini : la table les couvre tous. */
export const cheminDe = (id: EcranId): string => TABLE[id].chemin;

/** Le parent d'un écran — où retomber quand on ne peut pas l'ouvrir. */
export const parentDe = (id: EcranId): EcranId => TABLE[id].parent;

export const estAdressable = (id: EcranId): boolean => TABLE[id].adressable;

/**
 * L'écran désigné par un chemin, ou `null` si aucun.
 *
 * ⚠️ Tolérant sur la barre finale et sur la casse : une adresse recopiée à la
 * main dans une conversation revient rarement telle qu'elle est partie, et
 * répondre « page inconnue » à `/Cartes/` serait une rigueur qui ne sert
 * personne.
 */
export function ecranDe(chemin: string): EcranId | null {
  const c = normalise(chemin);
  for (const [id, r] of Object.entries(TABLE) as [EcranId, Route][]) {
    if (normalise(r.chemin) === c) return id;
  }
  return ALIAS[c] ?? null;
}

function normalise(chemin: string): string {
  const sansBarre = chemin.toLowerCase().replace(/\/+$/, "");
  return sansBarre === "" ? "/" : sansBarre;
}

/**
 * L'écran à MONTRER pour une adresse ouverte à froid.
 *
 * Trois cas, et le troisième est celui qui compte : une adresse inconnue rend
 * l'accueil plutôt qu'une erreur. Un lien mal recopié, une ancienne adresse,
 * un chemin inventé — dans les trois cas, le joueur atterrit sur quelque chose
 * de jouable au lieu d'une page blanche.
 */
export function ecranAuChargement(chemin: string): EcranId {
  const id = ecranDe(chemin);
  if (!id) return "home";
  return estAdressable(id) ? id : parentDe(id);
}
