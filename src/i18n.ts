/**
 * La langue du site — et, depuis, celle de tout ce que le joueur lit.
 *
 * Ce module ne couvrait au départ que l'accueil. Il couvre maintenant les
 * consignes (composées depuis une `Phrase`), les briefs de règles, le salon,
 * les verdicts et les motifs de mort. Ce qui reste français est court et
 * délibéré :
 *
 *   — le texte mensonger de LE MENTEUR, qui emprunte une phrase plausible en
 *     comparant des textes ;
 *   — les diagnostics d'anti-triche de `verifyRun`, qui ne sont pas de
 *     l'interface et ne s'affichent que dans un mode masqué.
 *
 * ⚠️ LE PRINCIPE, qui vaut pour tout ce qui s'ajoutera : le MOTEUR garde le
 * français canonique et reste ignorant des langues, l'AFFICHAGE recompose
 * depuis un identifiant. C'est ce qui permet au serveur de rejouer un run et
 * au multijoueur de faire voyager un verdict sans qu'aucun des deux n'ait à
 * savoir dans quelle langue joue qui.
 *
 * C'est un réglage d'appareil, pas un agrégat de compte : il ne voyage pas.
 */

import { MOTIFS } from "./engine/motifs";
import type { MotifId } from "./engine/motifs";
import type { SeatStatus } from "./render/seat";

import { PARCOURS, STATIQUE_PARCOURS } from "./i18n-parcours";
import type { TextesParcours } from "./i18n-parcours";

export type Lang = "fr" | "en";

export const estLang = (v: unknown): v is Lang => v === "fr" || v === "en";

/**
 * La langue du navigateur, pour la PREMIERE visite seulement.
 *
 * Le defaut etait « fr » pour tout le monde, quel que soit le navigateur. Un
 * anglophone atterrissait donc en francais, Chrome lui proposait de traduire,
 * il acceptait — et la traduction automatique rendait le jeu injouable : elle
 * retraduit les noeuds mutes de facon asynchrone, or la consigne mute a chaque
 * manche. Les trois retours de playtest disent exactement ca.
 *
 * Traduire le jeu sans corriger ce defaut n'aurait servi a rien : personne
 * n'aurait vu l'anglais sans cliquer sur EN, et personne ne clique sur EN
 * quand la page est deja en francais et que le navigateur propose de faire le
 * travail.
 *
 * Tout ce qui n'est pas francais tombe en anglais : ce sont les deux seules
 * langues qu'on sait dire, et l'anglais est le repli le moins mauvais pour un
 * hispanophone ou un germanophone — certainement meilleur que le francais.
 *
 * Pur : la liste des langues est passee, jamais lue depuis `navigator`. C'est
 * ce qui le rend testable sans navigateur.
 */
export function langueDuNavigateur(langues: readonly string[] | undefined): Lang {
  const premiere = langues?.[0];
  if (typeof premiere !== "string") return "fr";
  return premiere.toLowerCase().startsWith("fr") ? "fr" : "en";
}

type Textes = {
  ledeHtml: string;
  failleLabel: string;
  soloDesc: string;
  multiDesc: string;
  fineprintHtml: string;
  fineprintReglagesHtml: string;
  menu: string;
  reglages: string;
  brandAria: string;
  langAria: string;
  runFait: (score: number) => string;
  runDuJour: (nom: string) => string;
  serie: (n: number) => string;
  multiOk: string;
  multiOff: string;
  /** Le titre de l'onglet — il porte le slogan. */
  titre: string;
};

export const TEXTES: Record<Lang, Textes> = {
  fr: {
    ledeHtml: "Une règle.<br>Des ordres.<br><em>Parfois, obéir est la faute.</em>",
    failleLabel: "Modes de jeu",
    soloDesc: "Run du jour, escalade, entraînement.",
    multiDesc: "Ton code, tes potes, une règle chacun.",
    /*
     * ⚠️ CETTE LIGNE A CHANGÉ DE SENS AVEC L'ACCUEIL.
     *
     * Elle listait les raccourcis clavier — « SOURIS ET CLAVIER · R POUR
     * RELANCER · ÉCHAP POUR LE MENU » — sur une page où l'on n'a encore rien
     * lancé. Sous PLAY, ce qu'il faut dire n'est pas comment relancer, c'est
     * ce qui va se passer si on appuie : un entraînement, sans risque, et la
     * touche qui y mène.
     *
     * L'écran des RÉGLAGES garde l'ancienne, qui y est à sa place — d'où deux
     * clés au lieu d'une.
     */
    fineprintHtml: "2 MINUTES POUR APPRENDRE · SANS COMPTE",
    fineprintReglagesHtml:
      "SOURIS ET CLAVIER · <b>R</b> POUR RELANCER · <b>ÉCHAP</b> POUR LE MENU",
    menu: "MENU",
    reglages: "RÉGLAGES",
    brandAria: "THE ONE RULE, retour à l'accueil",
    langAria: "Langue",
    runFait: (score) => `RUN DU JOUR FAIT · ${score}`,
    runDuJour: (nom) => `RUN DU JOUR : ${nom}`,
    serie: (n) => `SÉRIE ${n}`,
    multiOk: "DE 2 À 10 JOUEURS",
    multiOff: "SERVEUR DE SALONS HORS LIGNE",
    titre: "THE ONE RULE — parfois, obéir est la faute",
  },
  en: {
    ledeHtml: "One rule.<br>Orders.<br><em>Sometimes, obeying is the mistake.</em>",
    failleLabel: "Game modes",
    soloDesc: "Daily run, climb, training.",
    multiDesc: "Your code, your friends, one rule each.",
    fineprintHtml: "2 MINUTES TO LEARN · NO ACCOUNT",
    fineprintReglagesHtml:
      "MOUSE AND KEYBOARD · <b>R</b> TO RESTART · <b>ESC</b> FOR THE MENU",
    menu: "MENU",
    reglages: "SETTINGS",
    brandAria: "THE ONE RULE, back to home",
    langAria: "Language",
    runFait: (score) => `DAILY RUN DONE · ${score}`,
    runDuJour: (nom) => `DAILY RUN : ${nom}`,
    serie: (n) => `STREAK ${n}`,
    multiOk: "2 TO 10 PLAYERS",
    multiOff: "LOBBY SERVER OFFLINE",
    titre: "THE ONE RULE — sometimes, obeying is the mistake",
  },
};

/**
 * LES CHAÎNES STATIQUES DE L'INTERFACE.
 *
 * Portées par un attribut `data-i18n` dans `index.html` plutôt que par un
 * identifiant chacune : à 72 éléments, une liste d'identifiants dans ce
 * fichier serait une seconde source de vérité qui diverge au premier ajout.
 * L'attribut vit à côté du texte qu'il traduit.
 *
 * ⚠️ CE QUI N'EN PORTE PAS, ET POURQUOI. Les éléments réécrits par le JS à
 * l'exécution — le verdict, l'état du salon, `SON : ON`, l'état de la face
 * SOLO — sont exclus volontairement. Leur poser un `data-i18n` ferait
 * effacer une valeur VIVANTE au moment où l'on change de langue : on
 * verrait un verdict disparaître en cliquant sur EN. Ceux-là sont traduits
 * là où ils sont écrits.
 *
 * ⚠️ LES NOMS DE RÈGLES RESTENT EN FRANÇAIS. « LE SANG » est un nom, pas
 * une étiquette — au même titre qu'on ne traduit pas le titre d'un jeu. Et
 * surtout, `ONE_RULES[].id` sert de clé au carnet, aux performances et à la
 * clé de comparabilité : y toucher rendrait tout l'historique incomparable,
 * puisque `VERSION_CONTENU` se calcule depuis ce contenu.
 */
const STATIQUE: Record<Lang, Record<string, string>> = {
  fr: {
    "piege.court": "Si une consigne enfreint ta règle, NE FAIS RIEN.",
    "aide.titre": "COMMENT ÇA MARCHE",
    "aide.pas1": "Une règle unique tient toute la partie. Elle reste affichée.",
    "aide.pas2": "Une consigne toutes les deux secondes. Obéis, vite.",
    "aide.pas3": "Mais quand la consigne enfreint la règle, c'est un PIÈGE. Ne fais rien et elle passe.",
    "aide.regleEx": "RÈGLE : ne clique jamais le rouge",
    "aide.regleEx2": "RÈGLE : ne clique jamais le rouge",
    "aide.consigneOk": "CONSIGNE : CLIQUE LE CARRÉ",
    "aide.consignePiege": "CONSIGNE : CLIQUE LE ROUGE",
    "aide.verdictOk": "→ Clique-le. Le carré bleu n'enfreint rien.",
    "aide.verdictPiege": "→ Ne fais rien. Obéir enfreindrait la règle.",
    "mesure.texte":
      "Ce jeu compte les parties jouées, les scores et les jours de retour, sous un identifiant aléatoire. Pas de compte, pas de cookie, pas de revente, aucune donnée personnelle. Ça sert uniquement à savoir si le jeu mérite d'être continué.",
    "hud.regle": "RÈGLE UNIQUE",
    "hud.fantome": "FANTÔME",
    "hud.regarde": "JE REGARDE",
    "hud.manche": "MANCHE",
    "hud.mode": "MODE",
    "mesure.refuser": "REFUSER",
    "mesure.accord": "D'ACCORD",
    "solo.eyebrow": "SOLO",
    "solo.titre": "TOI CONTRE TOI",
    "carte.daily.titre": "RUN DU JOUR",
    "carte.escalade.titre": "LA PILE",
    "carte.escalade.desc": "Une règle. Puis deux. Puis trois.",
    "carte.training.titre": "ENTRAÎNEMENT",
    "carte.training.desc": "Sans risque. Pour comprendre.",
    "carte.ranked.titre": "CLASSÉ",
    "carte.ranked.desc": "Quelqu'un de ton niveau. La même partie que lui.",
    "carnet.titre": "CARNET DES RÈGLES",
    "brief.meme": "MÊME PARTIE POUR TOUT LE MONDE",
    "brief.go": "J'Y VAIS",
    "brief.training": "D'ABORD S'ENTRAÎNER",
    "brief.allure": "ALLURE",
    "commun.retour": "RETOUR",
    "commun.menu": "MENU",
    "fin.quetes": "QUÊTES DU JOUR",
    "fin.enregistrer": "ENREGISTRER",
    "fin.rejouer": "ENCORE · R",
    "fin.partager": "PARTAGER",
    "fin.defier": "DÉFIER UN AMI",
    "fin.titres": "TITRES DU MATCH",
    "fin.rejouerMulti": "REJOUER · MÊME SALON",
    "fin.quitter": "QUITTER",
    "mur.eyebrow": "CLASSEMENT",
    "mur.titre": "LE MUR DES RECORDS",
    "mur.tenter": "JOUER LE RUN DU JOUR",
    "mur.records": "TES RECORDS",
    "mur.recordsVide": "Ta première partie inscrit ton chiffre ici.",
    "solo.reste": "CE QUI RESTE À FAIRE AUJOURD'HUI",
    "solo.demain": "DEMAIN",
    "reglages.titre": "RÉGLAGES",
    "reglages.sous": "COMME TU VEUX",
    "commun.on": "ON",
    "commun.off": "OFF",
    "rgl.son": "SON",
    "rgl.musique": "MUSIQUE",
    "rgl.musiqueQuoi": "Le tempo monte avec la difficulté.",
    "rgl.effets": "EFFETS",
    "rgl.effetsQuoi": "Alerte au dernier quart de la fenêtre.",
    "rgl.lisibilite": "LISIBILITÉ",
    "rgl.apparence": "APPARENCE",
    "profil.carte": "TA CARTE",
    "profil.carteAide": "GAGNE D'AUTRES CARTES EN JOUANT : CHACUNE PEUT TE REPRÉSENTER.",
    "profil.photo": "TA PHOTO",
    "profil.photoChoisir": "CHOISIR UNE PHOTO",
    "profil.photoRetirer": "RETIRER",
    "profil.photoAide": "SEULS LES JOUEURS DE TES SALONS LA VOIENT. CHACUN PEUT MASQUER LES PHOTOS DES AUTRES DANS LES RÉGLAGES.",
    "amis.titre": "TES AMIS",
    "amis.anon": "CONNECTE-TOI POUR AJOUTER TES AMIS ET COMPARER VOS RUNS DU JOUR.",
    "amis.connecter": "SE CONNECTER",
    "amis.tonCode": "TON CODE",
    "amis.copier": "COPIER",
    "amis.ph": "CODE D'UN AMI",
    "amis.ajoute": "DEMANDER",
    "amis.chapo": "Donne ton code, ton ami accepte, et vous comparez vos runs du jour.",
    "amis.recues": "VEULENT ÊTRE TES AMIS",
    "amis.partager": "ENVOYER MON CODE",
    "amis.ajouterTitre": "AJOUTER UN AMI",
    "amis.envoyees": "EN ATTENTE DE LEUR RÉPONSE",
    "amis.cercle": "LE RUN DU JOUR, ENTRE VOUS",
    "amis.indispo": "Les amis ne sont pas encore ouverts.",
    "amis.voir": "Comparez vos runs du jour",
    "rgl.photos": "PHOTOS DES AUTRES",
    "rgl.photosQuoi": "Les photos de profil des joueurs de ton salon.",
    "rgl.apparenceQuoi": "AUTO suit ton appareil. SOMBRE ménage les yeux le soir.",
    "rgl.motifs": "MOTIFS SUR LES PIÈCES",
    "rgl.motifsQuoi": "Chaque couleur porte aussi une trame.",
    "rgl.allure": "ALLURE PAR DÉFAUT · ENTRAÎNEMENT",
    "rgl.allureQuoi": "Elle ne vaut que pour l'entraînement. Le run du jour est le même pour tout le monde.",
    "tuto.passer": "PASSER",
    "avis.question": "DEUX PARTIES. ALORS, CE JEU ?",
    "avis.bof": "BOF",
    "avis.sympa": "SYMPA",
    "avis.accro": "ACCRO",
    "avis.plus": "UN MOT POUR L'AMÉLIORER ? (FACULTATIF)",
    "avis.ph": "Ce qui t'a plu, ce qui t'a perdu…",
    "avis.prive": "Anonyme. Rien de personnel, s'il te plaît.",
    "avis.envoyer": "ENVOYER",
    "avis.non": "NON MERCI",
    "avis.merci": "MERCI. CHAQUE MOT EST LU.",
    "installer.titre": "JOUE EN PLEIN ÉCRAN",
    "installer.ajouter": "AJOUTER",
    "installer.non": "PAS MAINTENANT",
    "rgl.langue": "LANGUE",
    "rgl.mesure": "MESURE",
    "rgl.compter": "COMPTER MES PARTIES",
    "rgl.compterQuoi": "Identifiant aléatoire local. Aucun compte, aucun cookie, rien de vendu.",
    "compte.eyebrow": "COMPTE",
    "cpt.collection": "TA COLLECTION",
    "cpt.jour": "RUN DU JOUR",
    "cpt.opposable": "OPPOSABLE",
    "cpt.fine": "Seuls les runs rejoués par le serveur sont opposables. Carnet, série et records d'entraînement sont des déclarations de ton appareil — ils ne touchent aucun classement.",
    "gout.carte": "TA CARTE",
    "gout.run": "CE RUN",
    "fin.avance": "CE QUE CE RUN A FAIT AVANCER",
    "fin.decouverte": "RÈGLE DÉCOUVERTE",
    "prof.jour": "DU JOUR",
    "prof.jourNom": "Le run de tout le monde",
    "prof.jourNote": "MÊME RÈGLE · 3 ESSAIS · UNE FOIS PAR JOUR",
    "prof.classement": "CLASSEMENT",
    "prof.classementNom": "Le mur des scores",
    "prof.classementNote": "VÉRIFIÉ CÔTÉ SERVEUR",
    "prof.multi": "MULTI",
    "prof.multiNom": "Ton code, tes potes",
    "prof.multiNote": "UNE RÈGLE CHACUN · JUSQU'À 10",
    "prof.escalade": "ESCALADE",
    "prof.escaladeNom": "Une règle. Puis deux.",
    "prof.escaladeNote": "JUSQU'OÙ TU TIENS",
    "prof.cartes": "CARNET",
    "prof.cartesNom": "Tes 16 cartes",
    "nav.cartes": "CARTES",
    "nav.jouer": "JOUER",
    "nav.multi": "MULTI",
    "carnet.collection": "COLLECTION",
    "salle.resiste": "CELLE QUI TE RÉSISTE",
    "fiche.retour": "‹ LA COLLECTION",
    "compte.nom": "NOM ET SIGNE",
    "profil.eyebrow": "PROFIL",
    "compte.deconnexion": "SE DÉCONNECTER",
    "compte.supprimer": "SUPPRIMER LE COMPTE",
    "multi.eyebrow": "MULTIJOUEUR",
    "multi.signe": "TON SIGNE",
    "multi.max": "14 CARACTÈRES MAX",
    "multi.signeVoyage": "LE SIGNE VOYAGE DANS TON JETON DE COMPTE : IL SURVIT À UN CHANGEMENT D'APPAREIL.",
    "multi.signe.lede":
      "Ton nom et ton signe te suivent dans tous les salons. C'est à ça que les autres te reconnaissent.",
    "multi.continuer": "CONTINUER",
    "multi.titre": "JOUER À PLUSIEURS",
    "multi.attend": "ON T'ATTEND",
    "multi.rejoindre": "REJOINDRE",
    "multi.code.aide": "Le code de quatre caractères qu'on t'a donné.",
    "multi.ouvres": "TU OUVRES",
    "multi.royale": "SEUL CONTRE TOUS",
    "multi.royale.desc": "Chacun sa règle. Le dernier debout gagne. De 2 à 10.",
    "multi.ouvrir": "OUVRIR UN SALON",
    "multi.duo": "DUO",
    "multi.duo.desc": "À deux, une seule réserve de vies. Jusqu'à 5 équipes.",
    "multi.coop": "COOP",
    "multi.coop.desc": "Une vie pour tous. Chacun son interdit. Douze vagues. 4 à 6.",
    "multi.changerSigne": "CHANGER DE SIGNE",
    "ph.nom": "TON NOM",
    "ph.code": "CODE",
    "ph.chat": "TAPE ICI POUR PARLER",
    "aria.nom": "Ton nom",
    "aria.signe": "Ton signe",
    "aria.chat": "Message",
    "aria.emotes": "Réactions",
    "aria.regles": "Règles à travailler",
    "podium.titre": "LES MEILLEURS DU JOUR",
    "brief.choisis": "TRAVAILLER UNE RÈGLE",
    "aria.joueurs": "Joueurs",
    "aria.spectateur": "Spectateur",
    "aria.chutes": "Chutes",
    "aria.salon": "Salon",
    "aria.modesSolo": "Modes solo",
    "aria.allure": "Allure",
    "aria.codeSalon": "Code du salon",
    "aria.discussion": "Discussion du salon",
    "aria.titres": "Titres du match",
    "salon.code": "CODE DU SALON",
    "salon.copierCode": "COPIER LE CODE",
    "salon.copierLien": "COPIER LE LIEN",
    "salon.dicteCode": "DICTE-LE À VOIX HAUTE, OU ENVOIE LE LIEN",
    "coupure.titre": "ON TE REMET EN JEU",
    "coupure.quoi": "Ta place est gardée 25 secondes et tu ne joues aucune manche pendant ce temps. Une coupure n'est pas une défaite.",
    "observe.prev": "PRÉCÉDENT",
    "observe.next": "SUIVANT",
    "observe.quoi": "LES DIX MANCHES. LA RÈGLE RESTE CACHÉE.",
    "observe.vote": "CONFIRMER",
    "salon.vitesse": "VITESSE",
    "salon.vies": "VIES",
    "salon.rotation": "ROTATION",
    "salon.mode": "MODE",
    "salon.lancer": "LANCER LA PARTIE",
    "coop.vies": "VIES",
    "coop.score": "SCORE",
    "salon.nom": "CHOISIR TON NOM",
    "salon.quitter": "QUITTER LE SALON",
    "vide.titre": "Seize règles t'attendent.",
    "vide.trouver": "EN TROUVER UNE",
    "aria.micro": "Annonce",
    "aria.toast": "Notification",
  },
  en: {
    "piege.court": "If an order breaks your rule, do NOTHING.",
    "aide.titre": "HOW IT WORKS",
    "aide.pas1": "One rule holds for the whole run. It stays on screen.",
    "aide.pas2": "A new order every two seconds. Obey it, fast.",
    "aide.pas3": "But when the order breaks the rule, it is a TRAP. Do nothing and it passes.",
    "aide.regleEx": "RULE : never click red",
    "aide.regleEx2": "RULE : never click red",
    "aide.consigneOk": "ORDER : CLICK THE SQUARE",
    "aide.consignePiege": "ORDER : CLICK THE RED",
    "aide.verdictOk": "→ Click it. The blue square breaks no rule.",
    "aide.verdictPiege": "→ Do nothing. Obeying would break the rule.",
    "mesure.texte":
      "This game counts games played, scores and return days, under a random identifier. No account, no cookie, nothing sold, no personal data. It only serves to know whether the game deserves to go on.",
    "hud.regle": "ONE RULE",
    "hud.fantome": "GHOST",
    "hud.regarde": "WATCHING",
    "hud.manche": "ROUND",
    "hud.mode": "MODE",
    "mesure.refuser": "DECLINE",
    "mesure.accord": "GOT IT",
    "solo.eyebrow": "SOLO",
    "solo.titre": "YOU VS YOU",
    "carte.daily.titre": "DAILY RUN",
    "carte.escalade.titre": "THE STACK",
    "carte.escalade.desc": "One rule. Then two. Then three.",
    "carte.training.titre": "TRAINING",
    "carte.training.desc": "No risk. Just to get it.",
    "carte.ranked.titre": "RANKED",
    "carte.ranked.desc": "Someone at your level. The very same run.",
    "carnet.titre": "RULE BOOK",
    "brief.meme": "SAME RUN FOR EVERYONE",
    "brief.go": "I'M IN",
    "brief.training": "TRAIN FIRST",
    "brief.allure": "PACE",
    "commun.retour": "BACK",
    "commun.menu": "MENU",
    "fin.quetes": "TODAY'S QUESTS",
    "fin.enregistrer": "SAVE THIS",
    "fin.rejouer": "AGAIN · R",
    "fin.partager": "SHARE",
    "fin.defier": "CHALLENGE A FRIEND",
    "fin.titres": "MATCH TITLES",
    "fin.rejouerMulti": "PLAY AGAIN · SAME ROOM",
    "fin.quitter": "LEAVE",
    "mur.eyebrow": "LEADERBOARD",
    "mur.titre": "THE WALL OF RECORDS",
    "mur.tenter": "PLAY THE DAILY RUN",
    "mur.records": "YOUR RECORDS",
    "mur.recordsVide": "Your first run puts your number here.",
    "solo.reste": "WHAT IS LEFT TODAY",
    "solo.demain": "TOMORROW",
    "reglages.titre": "SETTINGS",
    "reglages.sous": "HOW YOU LIKE IT",
    "commun.on": "ON",
    "commun.off": "OFF",
    "rgl.son": "SOUND",
    "rgl.musique": "MUSIC",
    "rgl.musiqueQuoi": "The tempo rises with the difficulty.",
    "rgl.effets": "EFFECTS",
    "rgl.effetsQuoi": "Alert on the last quarter of the window.",
    "rgl.lisibilite": "READABILITY",
    "rgl.apparence": "APPEARANCE",
    "profil.carte": "YOUR CARD",
    "profil.carteAide": "WIN MORE CARDS BY PLAYING: EACH ONE CAN REPRESENT YOU.",
    "profil.photo": "YOUR PHOTO",
    "profil.photoChoisir": "CHOOSE A PHOTO",
    "profil.photoRetirer": "REMOVE",
    "profil.photoAide": "ONLY THE PLAYERS OF YOUR ROOMS SEE IT. EVERYONE CAN HIDE OTHERS' PHOTOS IN SETTINGS.",
    "amis.titre": "YOUR FRIENDS",
    "amis.anon": "SIGN IN TO ADD FRIENDS AND COMPARE YOUR DAILY RUNS.",
    "amis.connecter": "SIGN IN",
    "amis.tonCode": "YOUR CODE",
    "amis.copier": "COPY",
    "amis.ph": "FRIEND'S CODE",
    "amis.ajoute": "ASK",
    "amis.chapo": "Give your code, they accept, and you compare your daily runs.",
    "amis.recues": "WANT TO BE YOUR FRIEND",
    "amis.partager": "SEND MY CODE",
    "amis.ajouterTitre": "ADD A FRIEND",
    "amis.envoyees": "WAITING FOR THEIR ANSWER",
    "amis.cercle": "TODAY'S RUN, BETWEEN YOU",
    "amis.indispo": "Friends aren't open yet.",
    "amis.voir": "Compare your daily runs",
    "rgl.photos": "OTHERS' PHOTOS",
    "rgl.photosQuoi": "Profile photos of the players in your room.",
    "rgl.apparenceQuoi": "AUTO follows your device. DARK is easier on the eyes at night.",
    "rgl.motifs": "PATTERNS ON PIECES",
    "rgl.motifsQuoi": "Every colour also carries a texture.",
    "rgl.allure": "DEFAULT PACE · TRAINING",
    "rgl.allureQuoi": "It only applies to training. The daily run is the same for everyone.",
    "tuto.passer": "SKIP",
    "avis.question": "TWO RUNS IN. SO, THIS GAME?",
    "avis.bof": "MEH",
    "avis.sympa": "NICE",
    "avis.accro": "HOOKED",
    "avis.plus": "ONE WORD TO MAKE IT BETTER? (OPTIONAL)",
    "avis.ph": "What hooked you, what lost you…",
    "avis.prive": "Anonymous. Nothing personal, please.",
    "avis.envoyer": "SEND",
    "avis.non": "NO THANKS",
    "avis.merci": "THANKS. EVERY WORD IS READ.",
    "installer.titre": "PLAY IT FULL SCREEN",
    "installer.ajouter": "ADD IT",
    "installer.non": "NOT NOW",
    "rgl.langue": "LANGUAGE",
    "rgl.mesure": "METRICS",
    "rgl.compter": "COUNT MY GAMES",
    "rgl.compterQuoi": "A random local id. No account, no cookie, nothing sold.",
    "compte.eyebrow": "ACCOUNT",
    "cpt.collection": "YOUR COLLECTION",
    "cpt.jour": "DAILY RUN",
    "cpt.opposable": "VERIFIED",
    "cpt.fine": "Only runs replayed by the server can be held against anyone else. Codex, streak and training records are claims from your device — they touch no leaderboard.",
    "gout.carte": "YOUR CARD",
    "gout.run": "THIS RUN",
    "fin.avance": "WHAT THIS RUN ADVANCED",
    "fin.decouverte": "RULE DISCOVERED",
    "prof.jour": "DAILY",
    "prof.jourNom": "Everyone's run",
    "prof.jourNote": "SAME RULE · 3 TRIES · ONCE A DAY",
    "prof.classement": "LEADERBOARD",
    "prof.classementNom": "The wall of scores",
    "prof.classementNote": "VERIFIED SERVER-SIDE",
    "prof.multi": "MULTI",
    "prof.multiNom": "Your code, your friends",
    "prof.multiNote": "ONE RULE EACH · UP TO 10",
    "prof.escalade": "ESCALATION",
    "prof.escaladeNom": "One rule. Then two.",
    "prof.escaladeNote": "HOW FAR DO YOU HOLD",
    "prof.cartes": "CODEX",
    "prof.cartesNom": "Your 16 cards",
    "nav.cartes": "CARDS",
    "nav.jouer": "PLAY",
    "nav.multi": "MULTI",
    "carnet.collection": "COLLECTION",
    "salle.resiste": "THE ONE THAT KEEPS GETTING YOU",
    "fiche.retour": "‹ COLLECTION",
    "compte.nom": "NAME AND SIGN",
    "profil.eyebrow": "PROFILE",
    "compte.deconnexion": "SIGN OUT",
    "compte.supprimer": "DELETE ACCOUNT",
    "multi.eyebrow": "MULTIPLAYER",
    "multi.signe": "YOUR SIGN",
    "multi.max": "14 CHARACTERS MAX",
    "multi.signeVoyage": "YOUR SIGN TRAVELS IN YOUR ACCOUNT TOKEN: IT SURVIVES A CHANGE OF DEVICE.",
    "multi.signe.lede":
      "Your name and sign follow you into every room. That is how the others know you.",
    "multi.continuer": "CONTINUE",
    "multi.titre": "PLAY TOGETHER",
    "multi.attend": "THEY'RE WAITING",
    "multi.rejoindre": "JOIN",
    "multi.code.aide": "The four-character code you were given.",
    "multi.ouvres": "YOU OPEN",
    "multi.royale": "FREE FOR ALL",
    "multi.royale.desc": "Everyone gets a rule. Last one standing wins. 2 to 10.",
    "multi.ouvrir": "OPEN A ROOM",
    "multi.duo": "DUO",
    "multi.duo.desc": "Two players, one shared pool of lives. Up to 5 teams.",
    "multi.coop": "COOP",
    "multi.coop.desc": "One shared life. Each player a forbid. Twelve waves. 4 to 6.",
    "multi.changerSigne": "CHANGE SIGN",
    "ph.nom": "YOUR NAME",
    "ph.code": "CODE",
    "ph.chat": "TYPE HERE TO TALK",
    "aria.nom": "Your name",
    "aria.signe": "Your sign",
    "aria.chat": "Message",
    "aria.emotes": "Reactions",
    "aria.regles": "Rules to train",
    "podium.titre": "TODAY'S BEST",
    "brief.choisis": "TRAIN A RULE",
    "aria.joueurs": "Players",
    "aria.spectateur": "Spectating",
    "aria.chutes": "Eliminations",
    "aria.salon": "Room",
    "aria.modesSolo": "Solo modes",
    "aria.allure": "Pace",
    "aria.codeSalon": "Room code",
    "aria.discussion": "Room chat",
    "aria.titres": "Match awards",
    "salon.code": "ROOM CODE",
    "salon.copierCode": "COPY THE CODE",
    "salon.copierLien": "COPY THE LINK",
    "salon.dicteCode": "SAY IT OUT LOUD, OR SEND THE LINK",
    "coupure.titre": "PUTTING YOU BACK IN",
    "coupure.quoi": "Your seat is held for 25 seconds and you play no round during that time. A cut is not a defeat.",
    "observe.prev": "PREVIOUS",
    "observe.next": "NEXT",
    "observe.quoi": "THE TEN ROUNDS. THE RULE STAYS HIDDEN.",
    "observe.vote": "CONFIRM",
    "salon.vitesse": "SPEED",
    "salon.vies": "LIVES",
    "salon.rotation": "ROTATION",
    "salon.mode": "MODE",
    "salon.lancer": "START THE MATCH",
    "coop.vies": "LIVES",
    "coop.score": "SCORE",
    "salon.nom": "PICK YOUR NAME",
    "salon.quitter": "LEAVE THE ROOM",
    "vide.titre": "Sixteen rules are waiting.",
    "vide.trouver": "FIND ONE",
    "aria.micro": "Announcement",
    "aria.toast": "Notice",
  },
};

/*
 * Les chaînes du PARCOURS s'écrivent dans leur propre module, typé, et sont
 * versées ici : l'attribut `data-i18n` n'a qu'une table à lire. Elles passent
 * APRÈS, donc un intitulé renommé (« ESCALADE » devenue « LA PILE ») gagne.
 */
for (const l of ["fr", "en"] as const) Object.assign(STATIQUE[l], STATIQUE_PARCOURS[l]);

/** Le dictionnaire statique, exposé pour que les tests puissent l'éprouver. */
export const CHAINES = STATIQUE;


/* ------------------------------------------------------------------ *
 * LES CHAÎNES ÉCRITES À L'EXÉCUTION
 *
 * Celles-ci ne peuvent PAS porter d'attribut `data-i18n` : elles sont
 * posées par le code au moment où quelque chose arrive — un verdict, un
 * état de salon, une erreur. Un attribut sur ces éléments-là ferait
 * effacer la valeur vivante au changement de langue.
 *
 * ⚠️ CERTAINES SONT ÉCRITES EN PARTIE (verdicts, bandeau de manche,
 * panneau de chute). L'accès doit donc être une simple lecture de table —
 * pas de parcours du DOM, pas de construction d'objet, rien qui alloue par
 * image. `t()` est un accès à un `Record` déjà construit au chargement du
 * module, et `langue()` lit une variable. C'est ce qui permet de traduire
 * l'écran de jeu sans rien coûter à la boucle.
 * ------------------------------------------------------------------ */

type Dyn = {
  compteSupprimer: string;
  compteNom: string;
  /* --- les cartes --- */
  carteCases: (n: number) => string;
  carteParfaite: string;
  carteVerrouillee: string;
  carteDecouverte: string;
  carteEnCours: string;
  carteMaitrisee: string;
  carteNouvelle: string;
  codexVide: string;
  salleTitre: string;
  /* --- la salle de travail --- */
  filtreAMater: (n: number) => string;
  filtreMaitrisees: (n: number) => string;
  filtreToutes: (n: number) => string;
  filtreInterdits: (n: number) => string;
  filtreDeformations: (n: number) => string;
  filtreContraintes: (n: number) => string;
  filtreVerrouillees: (n: number) => string;
  salleJamaisVues: (n: number) => string;
  resisteNote: (runs: number, etoiles: number, max: number) => string;
  resisteBouton: string;
  etatCollReste: (n: number) => string;
  etatCollTout: string;
  etatJourFait: (n: number) => string;
  etatJourEpuise: string;
  etatJourVierge: string;
  etatJourReste: (n: number) => string;
  etatJourNote: (essais: number, manches: number) => string;
  etatGraceOui: string;
  etatGraceNon: string;
  filtreRien: string;
  navAttend: string;
  /* --- la fiche --- */
  famInterdit: string;
  famDeformation: string;
  famContrainte: string;
  ficheTaux: (t: string) => string;
  ficheMaitrise: (n: number) => string;
  ficheMeilleur: string;
  ficheSerie: string;
  fichePieges: string;
  casRencontree: string;
  casPiege: string;
  casSerie: (n: number) => string;
  casAllure: (nom: string, n: number) => string;
  casSansFaute: (n: number) => string;
  ficheManqueManches: (n: number, allure: string) => string;
  ficheManquePiege: string;
  ficheManqueSerie: (n: number) => string;
  ficheManqueSansFaute: (n: number) => string;
  ficheRienNeManque: string;
  ficheEntraine: (allure: string) => string;
  /* --- l'écran de jeu --- */
  hudGeste: string;
  hudTiens: string;
  hudGestes: (n: number) => string;
  hudDerniereVie: string;
  /* --- l'objectif de l'accueil --- */
  butManches: (n: number) => string;
  butUnite: string;
  butMieux: string;
  butDejaBattu: string;
  butSien: (n: number) => string;
  butModeJour: string;
  avanceRegle: (regle: string, cases: number) => string;
  avancePieges: (n: number) => string;
  avanceManches: (n: number, allure: string) => string;
  avanceCase: string;
  avanceRien: string;
  avanceTravailler: (regle: string) => string;
  goutFaitAvancer: (quoi: string) => string;
  goutRienAAvancer: string;
  cptConnecte: string;
  cptMeilleur: string;
  cptCourtRecord: string;
  cptCourtCartes: string;
  cptCourtSerie: string;
  cptRegleCarnet: string;
  cptMaitrisees: string;
  cptSerieEnCours: string;
  cptEnJours: (n: number) => string;
  cptRepartition: (p: number, m: number, d: number, v: number) => string;
  cptJourFait: (score: number) => string;
  cptJourRang: (rang: number) => string;
  cptJourRien: string;
  cptGarde: (score: number) => string;
  cptGardeRien: string;
  decouverteNote: (manche: number, vues: number, total: number) => string;
  butModeEntrainement: string;
  /* --- première arrivée --- */
  tutoEtape: (n: number, total: number) => string;
  tutoObeis: string;
  tutoOui: string;
  tutoOuiNote: string;
  tutoRienFaitBravo: string;
  tutoRienFaitNote: string;
  /** Temps 3 du tutoriel : le second piège, tenu comme le premier. */
  tutoSecondPiege: string;
  tutoPret: string;
  /** L'aide posée sur le terrain pendant les deux temps joués. */
  tutoVasy: string;
  tutoSansChrono: string;
  tutoRelis: string;
  tutoRienFaire: string;
  tutoRalenti: string;
  tutoPasCelleLa: string;
  tutoInterdit: string;
  cptNomRate: string;
  compteConfirmer: string;
  compteTitreConnecte: string;
  compteTitreAnonyme: string;
  compteIndispo: string;
  compteSuppressionKo: string;
  briefUneDePlus: string;
  briefEspace: string;
  rankedRecherche: string;
  rankedNom: string;
  rankedIndispo: string;
  rankedEnvoi: string;
  rankedInjoignable: string;
  rankedEyebrow: (division: string, elo: number) => string;
  goMaintiens: string;
  goEntrer: string;
  goDefi: string;
  quetesValidees: (pieces: number) => string;
  serieEnCours: string;
  defiRecu: string;
  defiDe: (qui: string) => string;
  defiMemeOrdre: (manches: number) => string;
  defierAmi: string;
  defierHorsLigne: string;
  lienCopie: string;
  partager: string;
  copieOk: string;
  /* --- salon --- */
  reactiverMessages: string;
  couperMessages: string;
  reactiver: string;
  couper: string;
  muet: string;
  sourdine: string;
  exclure: string;
  inviteQuelquun: string;
  enAttente: string;
  reglagesHote: string;
  reglagesSalon: string;
  connexion: string;
  ilFautUnNom: string;
  codeCopie: (code: string) => string;
  lienInvitation: string;
  /* --- ce qui s'écrit PENDANT la partie --- */
  regleChange: string;
  regleUnique: string;
  duel: string;
  elimineSous: (regle: string) => string;
  matchTermine: string;
  egalite: string;
  tuAsGagne: string;
  /** « MARGOT GAGNE » — le titre de l'écran de fin, quand ce n'est pas toi. */
  finGagne: (nom: string) => string;
  vainqueur: string;
  finDuMatch: string;
  /* --- le brief, vu avant CHAQUE partie --- */
  modeDaily: (jour: number) => string;
  modeEscalade: string;
  modeTraining: string;
  piedDaily: (jour: number) => string;
  piedSur: string;
  piedRegles: string;
  piedRecord: string;
  /** Cellule gauche du pied en COOP : des pieces nettoyees, pas des manches. */
  piedScore: string;
  briefEscalade: (palier: number) => string;
  briefDailyLignes: (manches: number) => string;
  briefEscaladeLignes: (max: number) => string;
  briefTiens: string;
  goCommencer: string;
  goUnSeulEssai: string;
  /* --- les essais du run du jour --- */
  dailyEssaisRestants: (n: number) => string;
  dailyEpuise: (score: number) => string;
  dailyTermine: (score: number) => string;
  /* --- ce que le pied et le bandeau affichent EN PARTIE --- */
  piedVies: string;
  piedSpectateur: string;
  piedMulti: string;
  echauffement: string;
  echauffementFini: string;
  piegeDejoue: string;
  tenu: string;
  faitMaj: string;
  /* --- ecran de compte --- */
  cptSansNom: string;
  profilLocal: string;
  profilTop: string;
  cptCarnet: string;
  cptRegles: (n: number, total: number) => string;
  cptSerie: string;
  cptJours: (n: number) => string;
  cptRecordEntrainement: string;
  cptManches: (n: number) => string;
  cptRunsEnregistres: string;
  cptMeilleurRun: string;
  /* --- cartes de l'ecran SOLO --- */
  dailyFait: string;
  dailyRevient: (score: number) => string;
  dailyUnEssai: string;
  escaladeEtat: string;
  trainingNeuf: string;
  trainingRecord: (n: number) => string;
  teaserDefaut: string;
  /* --- l'allure, sur le brief d'entrainement --- */
  /* --- choisir sa règle d'entrainement --- */
  pickAleatoire: string;
  pickVerrouille: string;
  pickCompte: (vues: number, total: number, maitrisees: number) => string;
  pickAideAleatoire: string;
  pickAideChoisie: (regle: string) => string;
  pickResteManches: (n: number) => string;
  pickRestePiege: string;
  pickMaitrisee: string;
  /* --- le podium du jour --- */
  podiumRang: (rang: number, score: number) => string;
  podiumAbsent: string;
  /**
   * Ce qu'il reste à faire, PONCTUATION COMPRISE.
   *
   * Le français met une espace avant les deux-points, l'anglais non. Composer
   * la ligne ailleurs avec un ` : ` en dur donnait « TO MASTER IT : 6 ROUNDS »,
   * ce qui trahit une traduction au premier coup d'œil. La ponctuation
   * appartient à la langue, pas au code d'affichage.
   */
  pickPourMaitriser: (reste: string) => string;
  /* --- le carnet --- */
  carnetProgres: (vues: number, total: number, tenues: number) => string;
  carnetJamais: string;
  carnetMeilleur: (best: number) => string;
  /* --- l'ecran de fin --- */
  finReglesTenues: (n: number, score: number) => string;
  finSansFaute: string;
  finSurTotal: (total: number) => string;
  finManchesTenues: string;
  overCompRecord: (n: number) => string;
  overCompMediane: (n: number) => string;
  overCompAbsolu: (n: number) => string;
  finBattu: string;
  overAncien: (n: number) => string;
  overCarteRegle: (regle: string, pieges: number) => string;
  overManque: (n: number) => string;
  overManquePas: string;
  finPartagerCarte: string;
  microDecouverte: string;
  microMaitrisee: string;
  microEchauffement: string;
  microEchauffementQuoi: string;
  microMaitriseQuoi: string;
  microCarnet: (vues: number, total: number) => string;
  toastLien: string;
  toastEntre: (nom: string, n: number, max: number) => string;
  toastAllure: string;
  pastilleSur: (n: number) => string;
  pastilleRecord: (n: number) => string;
  installerAndroid: string;
  installerIos: string;
  installerCompris: string;
  hudVite: string;
  puceDe: (id: string) => string;
  allureRef: string;
  alluurePlus: (ref: string) => string;
  allureMoins: (ref: string) => string;
  /* --- le salon, ce qu'il dit de lui-meme --- */
  salonJoueurs: (n: number, max: number) => string;
  salonSeulHint: string;
  salonPlaceLibre: string;
  reglagesVerrouilles: string;
  reglagesTuDecides: string;
  reglagesInvite: string;
  /** Ce que la vitesse choisie change, en millisecondes, a une manche témoin. */
  vitesseQuoi: (nom: string, delta: number) => string;
  vitesseQuoiRef: (nom: string, ms: number) => string;
  rythmeImposteur: string;
  rythmeCoop: string;
  optJamais: string;
  optDuos: string;
  optChacun: string;
  optImposteur: string;
  optCoop: string;
  plaqueAgi: string;
  plaqueRien: string;
  observeTour: (n: number, sur: number) => string;
  modeImposteurQuoi: string;
  modeCoopQuoi: string;
  issueVillage: string;
  issueImposteur: string;
  imposteurEtait: (nom: string) => string;
  voteRecu: string;
  ariaVitesse: (nom: string) => string;
  ariaVies: (n: number) => string;
  ariaRotationJamais: string;
  ariaRotation: (n: number) => string;
  ariaDuos: string;
  ariaChacun: string;
  ariaImposteur: string;
  ariaCoop: string;
  ariaSigne: (n: number, total: number) => string;
  /** Le choix « pas de carte de visite ». */
  carteAucune: string;
  /** La photo choisie n'a pas pu être lue ou réduite. */
  photoIllisible: string;
  /** Les amis : erreurs d'ajout, une par cause — chacune dit quoi faire. */
  amisErr: Record<"code" | "soi" | "inconnu" | "plein" | "reseau", string>;
  /** Le mur des records. */
  murJourTitre: string;
  murJourMien: (score: number | null, essais: number) => string;
  recordJour: string;
  recordAllure: (allure: string) => string;
  recordPile: string;
  recordUnite: string;
  recordUnitePile: string;
  amisSeul: string;
  amisNote: string;
  amisPasJoue: string;
  amisCopie: string;
  amisAccepter: string;
  amisRefuser: string;
  amisAnnuler: string;
  amisEnAttente: string;
  amisDemandee: (qui: string) => string;
  amisLie: (qui: string) => string;
  amisDemandes: (n: number) => string;
  amisPartageTexte: (code: string) => string;
  ariaAccepterAmi: (qui: string) => string;
  ariaRefuserAmi: (qui: string) => string;
  amisMeilleur: (n: number) => string;
  ariaRetirerAmi: (qui: string) => string;
  ariaSemaine: (qui: string, scores: string) => string;
  ariaCouper: (qui: string) => string;
  ariaReactiver: (qui: string) => string;
  ariaExclure: (qui: string) => string;
  dicteLeCode: string;
  /* --- ce que la tuile d'un siege dit sous le nom --- */
  siegeHorsLigne: string;
  siegeHote: string;
  siegeDebutant: string;
  siegePret: string;
  siegeEnMatch: (vies: number, score: number) => string;
  /* --- le tampon : trois mots, lus en 200 ms --- */
  tamponLent: string;
  tamponInfraction: string;
  tamponRate: string;
  /* --- la kill-cam --- */
  tuEsElimine: string;
  tuPerdsUneVie: string;
  elimine: string;
  viePerdue: string;
  sousRegle: (regle: string) => string;
  ilsNeSontPlusQue: (n: number) => string;
  jeRegarde: (qui: string) => string;
  reglesTournent: (regle: string) => string;
  /* --- le classement de fin de match --- */
  titreReflexe: string;
  titreFlair: string;
  titreSerie: string;
  titreBrulee: string;
  titreSurvivante: string;
  titrePremiereFois: string;
  rangEme: (n: number) => string;
  manchesN: (n: number) => string;
  aRegarde: string;
  /* --- ce que le serveur de salons refuse --- */
  errDeconnecte: string;
  signeChoisis: (n: number) => string;
  sortieRetaper: string;
  reconnexion: string;
  perfRefusee: string;
  cptEcart: string;
  cptEcartQuoi: string;
  piedDepasse: string;
  objectifReste: (n: number) => string;
  exerciceValide: string;
  /** Les cinq régimes du run (`TIER_NAMES`), annoncés toutes les 10 manches. */
  nomsPaliers: readonly string[];
  briefLongueur: string;
  briefEssais: string;
  briefEchauffement: string;
  avanceMaitrisee: (regle: string) => string;
  avanceParfaite: (regle: string) => string;
  resteFait: (score: number, sur: number) => string;
  resteEpuise: (score: number) => string;
  resteTravailler: (regle: string, etoiles: number, max: number) => string;
  coupureEtat: (essai: number, sur: number, s: number) => string;
  sortieOuvrir: string;
  sortieRecharger: string;
  errSalonInconnu: string;
  errSalonComplet: (max: number) => string;
  errNeedPlayers: (min: number, max: number) => string;
  coopFinRang: (vagues: number, score: number) => string;
  coopTenu: string;
  coopKo: string;
  errPasHote: string;
  errEnMatch: string;
  errVersion: string;
  errExclu: string;
  errInjoignable: string;
  errReconnexion: string;
  errCode4: string;
  errConnexionPerdue: string;
  /* --- l'ecran de compte --- */
  cptEnregistre: string;
  cptSansCompte: string;
  cptCeQuiSerait: string;
  cptGoogle: string;
  cptDiscord: string;
  cptSupprimerAvert1: string;
  cptSupprimerAvert2: string;
  cptRecordLocal: string;
  cptManchesLocal: string;
  cptErrAnnule: string;
  cptErrEchange: string;
  cptErrExpire: string;
  cptErrSuspendu: string;
  cptErrNonConfig: string;
  cptErrRetour: (code: string) => string;
  /* --- la fin d'un run solo --- */
  finTenu: string;
  finRegleEnfreinte: string;
  finRompu: string;
  finElimine: string;
  /**
   * Manche que ce bundle ne sait pas reconstruire (voir `syncFrame`).
   *
   * Elle ne s'excuse pas et ne nomme pas la cause : elle DIT quoi faire.
   * L'écran gelait sans un mot, et recharger suffit — le décalage de versions
   * entre le front et les salons est la seule cause connue.
   */
  multiRegleInconnue: string;
  /** « 2 pièges déjoués » — la ligne du bandeau, pendant la partie. */
  hudPieges: (n: number) => string;
  /** « TU FINIS 2ᵉ SUR 6 · MANCHE 22 » — l'écran de fin d'un match. */
  finTonRang: (place: number, total: number, manches: number) => string;
  /** Même ligne, pour un rang PARTAGÉ : jamais « 1er sur 3 » sous « ÉGALITÉ ». */
  finExAequo: (place: number, total: number, manches: number) => string;
  /** Les trois repères sous le score de fin de run. */
  finReperRecord: (n: number) => string;
  finReperMediane: (n: number) => string;
  finReperMeilleur: (n: number) => string;
  /** La légende de la frise : ce que chaque marque veut dire. */
  finLegTenue: string;
  finLegPiege: string;
  finLegFaute: string;
  finLegChute: string;
  /** Les trois tuiles de bilan, sur l'écran de fin. */
  bilanQuetes: string;
  bilanSerie: string;
  bilanCarnet: string;


  /* ---- LE MODE ATTRACT ---- */
  /** L'intitulé au-dessus du nom de la règle, coin haut gauche. */
  /** « À BATTRE AUJOURD'HUI · 31 » sur la carte DU JOUR. */
  profJourRecord: (n: number) => string;
  profJourBattu: (n: number) => string;
  attractRegle: string;
  /** « DÉMO · MANCHE 7 » */
  attractManche: (n: number) => string;
  /** ⚠️ Sans cette ligne, un visiteur croit que le site ne répond pas. */
  attractPersonne: string;
  attractTenu: string;
  attractPiege: string;

  /* ---- LA DÉMO DE L'ACCUEIL ---- */
  /*
   * ⚠️ CES CINQ CHAÎNES SONT DU CONTENU DE JEU, PAS DE L'INTERFACE. Elles
   * imitent une manche : une règle unique, deux consignes, deux verdicts. Elles
   * doivent donc suivre le vocabulaire réel — « PIÈGE DÉJOUÉ » est le mot que le
   * jeu emploie, et en inventer un autre ici apprendrait un lexique faux.
   */
  demoRegle: string;
  demoConsigneA: string;
  demoConsigneB: string;
  demoVerdictA: string;
  demoVerdictB: string;

  /* ---- L'EXPLOIT DE FIN DE RUN, ET LA CARTE DE PARTAGE ---- */
  /** Le bandeau, quand le record tombe. */
  finRecordTitre: string;
  /** « ANCIEN · 23 » — ce qu'on vient de dépasser. */
  finRecordAncien: (n: number) => string;
  /** « +8 » — l'écart, seul chiffre qui dise la taille du progrès. */
  finRecordAvance: (n: number) => string;
  /** Le record ÉGALÉ. Un mot différent : « record » doit rester rare. */
  finEgaleTitre: string;
  /** L'exploit tel qu'il paraît SUR la carte de partage, en une ligne. */
  finRecordCarte: (n: number) => string;
  /** Le bouton, et son accusé de réception. */
  finCarte: string;
  finCartePrete: string;
  finCarteRatee: string;
  /**
   * Le slogan, imprimé sur la carte.
   *
   * ⚠️ C'est la seule phrase de l'image qui s'adresse à quelqu'un qui n'a jamais
   * ouvert le jeu — donc la seule chose qui puisse transformer une capture en
   * visite. Il est repris du `<title>`, mot pour mot : deux formulations
   * différentes du même jeu dilueraient l'une et l'autre.
   */
  slogan: string;
  modeClasse: string;

  /**
   * Une ALLURE écrite : « 1,5 » en français, « 1.5 » en anglais.
   *
   * ⚠️ Deux relevés à l'écran, deux corrections, et elles vivent ICI toutes les
   * deux parce que ce sont des conventions de LANGUE — comme l'ordre des mots
   * d'une consigne ou le pluriel à zéro :
   *
   *   · « × 1.5 » — le point décimal est anglais, et il saute d'autant plus
   *     aux yeux que le reste de la ligne est en capitales ;
   *   · « × 2 » à côté de « × 1,5 » — une échelle dont un cran perd sa
   *     décimale ne se lit plus comme une échelle. La maquette écrit d'ailleurs
   *     « × 2,0 » et « × 0,8 », jamais « × 2 ».
   */
  allureTxt: (a: number) => string;
  /** Le nom d'un cran d'APPARENCE. */
  themeNom: (t: "auto" | "clair" | "sombre") => string;
  /** L'annonce du piège EN JEU — premiers niveaux d'un chapitre, jamais ailleurs. */
  escAnnonce: string;
  defiGagne: (score: number, cible: number) => string;
  defiEgalite: (cible: number) => string;
  defiPerdu: (score: number, cible: number) => string;
  finJours: (n: number) => string;
  goMatchSuivant: string;
  goRevanche: string;
  goReviensDemain: string;
  goRejouer: string;
  regleAjoutee: (regle: string) => string;
  partageTexte: (score: number, regle: string, url: string) => string;
  partageTitreJour: (jour: number) => string;
  partageTitreEntrainement: string;
  partageTenu: (total: number) => string;
  partageRompu: (score: number) => string;
  promptPseudo: string;
  rankedContre: (qui: string, elo: number, score: number) => string;
  rankedEtalon: string;
  rankedPromotion: string;
  rankedPlancher: string;
  rankedRunEtalon: (elo: number) => string;
  rankedControle: (verdict: string) => string;
  /* --- bascules de reglages : « SON : ON » --- */
  prefSon: string;
  prefMusique: string;
  prefMotifs: string;
  prefMesure: string;
  on: string;
  off: string;
};

/**
 * Le suffixe ordinal anglais. Le français n'en a qu'un (« ᵉ »), l'anglais
 * quatre, et ils dépendent des DEUX derniers chiffres : 11, 12 et 13 prennent
 * « th » alors que 1, 2 et 3 prennent « st », « nd », « rd ». Un salon plafonne
 * à dix joueurs, donc le cas ne se pose pas aujourd'hui — mais une table de
 * traduction qui a raison par accident finit par avoir tort.
 */
/**
 * Puces d'interdit sous la consigne — escalade à deux règles et plus.
 *
 * Le bandeau ne tient qu'UNE ligne de brief. Deux interdits deviennent
 * deux puces, fusionnées à `#sub` pour ne pas rogner le champ.
 */
const PUCES: Record<Lang, Record<string, string>> = {
  fr: {
    sang: "PAS DE ROUGE",
    azur: "PAS DE BLEU",
    pointe: "PAS DE TRIANGLE",
    roue: "PAS DE ROND",
    voyelle: "PAS DE VOYELLE",
    colosse: "PAS LE PLUS GROS",
    gaucher: "PAS À GAUCHE",
    solitaire: "PAS DE SEUL",
    angles: "PAS LES COINS",
    seconde: "PAS TROP TÔT",
    eclair: "ÇA DISPARAÎT",
    menteur: "MÉFIE-TOI",
    daltonien: "PAS LE MOT",
    jumeau: "DEUX FOIS",
    acceleration: "PLUS VITE",
    mainGauche: "MAIN GAUCHE",
  },
  en: {
    sang: "NO RED",
    azur: "NO BLUE",
    pointe: "NO TRIANGLE",
    roue: "NO CIRCLE",
    voyelle: "NO VOWEL",
    colosse: "NOT THE BIGGEST",
    gaucher: "NOT LEFT",
    solitaire: "NOT ALONE",
    angles: "NO CORNERS",
    seconde: "NOT TOO SOON",
    eclair: "IT VANISHES",
    menteur: "DON'T TRUST",
    daltonien: "NOT THE WORD",
    jumeau: "TWICE",
    acceleration: "FASTER",
    mainGauche: "LEFT HAND",
  },
};

function rangSuffixe(n: number): string {
  const d = n % 10;
  const c = n % 100;
  if (d === 1 && c !== 11) return "st";
  if (d === 2 && c !== 12) return "nd";
  if (d === 3 && c !== 13) return "rd";
  return "th";
}

const DYN: Record<Lang, Dyn> = {
  fr: {
    compteSupprimer: "SUPPRIMER LE COMPTE",
    compteNom: "CHANGER DE NOM",
    carteCases: (n) => `${n} / 6 · MAÎTRISE`,
    carteParfaite: "PARFAITE",
    carteVerrouillee: "VERROUILLÉE",
    carteDecouverte: "DÉCOUVERTE",
    carteEnCours: "EN COURS",
    carteMaitrisee: "MAÎTRISÉE",
    carteNouvelle: "NOUVELLE",
    salleTitre: "MAÎTRISE TES RÈGLES",
    codexVide:
      "Aucune règle rencontrée pour l'instant. Lance une partie : une carte se débloque en JOUANT, jamais en lisant.",
    filtreAMater: (n) => `À MATER · ${n}`,
    filtreMaitrisees: (n) => `MAÎTRISÉES · ${n}`,
    filtreToutes: (n) => `TOUTES · ${n}`,
    filtreInterdits: (n) => `INTERDITS · ${n}`,
    filtreDeformations: (n) => `DÉFORMATIONS · ${n}`,
    filtreContraintes: (n) => `CONTRAINTES · ${n}`,
    filtreVerrouillees: (n) => `VERROUILLÉES · ${n}`,
    salleJamaisVues: (n) =>
      n === 0
        ? "Tu as rencontré les seize règles."
        : `Il te reste ${n} règle${n > 1 ? "s" : ""} que tu n'as jamais vue${n > 1 ? "s" : ""}. Elles n'arrivent qu'en jouant.`,
    resisteNote: (runs, et, max) =>
      `${runs} run${runs > 1 ? "s" : ""} sous cette règle · ★ ${et} / ${max} au chapitre.`,
    resisteBouton: "TRAVAILLER CELLE-LÀ",
    etatCollReste: (n) =>
      `${n} règle${n > 1 ? "s" : ""} que tu n'as jamais vue${n > 1 ? "s" : ""}. Elles n'arrivent qu'en jouant.`,
    etatCollTout: "Tu les as toutes rencontrées.",
    etatJourFait: (n) => `${n} MANCHES`,
    etatJourEpuise: "TROIS ESSAIS JOUÉS",
    etatJourVierge: "PAS ENCORE JOUÉ",
    etatJourReste: (n) => `${n} ESSAI${n > 1 ? "S" : ""} RESTANT${n > 1 ? "S" : ""}`,
    etatJourNote: (essais, manches) =>
      `${essais} ESSAI${essais > 1 ? "S" : ""} · ${manches} MANCHES`,
    etatGraceOui: "1 JOUR DE GRÂCE DISPONIBLE",
    etatGraceNon: "JOUR DE GRÂCE DÉJÀ UTILISÉ",
    filtreRien: "Rien dans cette catégorie pour l'instant.",
    navAttend: "TA RÈGLE T'ATTEND",
    famInterdit: "INTERDIT",
    famDeformation: "DÉFORMATION",
    famContrainte: "CONTRAINTE",
    ficheTaux: (t) => `PIÈGE ${t} DES MANCHES`,
    ficheMaitrise: (n) => `MAÎTRISE · ${n} / 6`,
    ficheMeilleur: "MEILLEUR",
    ficheSerie: "SÉRIE",
    fichePieges: "PIÈGES",
    casRencontree: "Rencontrée en partie",
    casPiege: "Un piège déjoué au moins une fois",
    casSerie: (n) => `${n} manches d'affilée sans faute`,
    casAllure: (nom, n) => `${n} manches à l'allure ${nom}`,
    casSansFaute: (n) => `Un run de ${n} manches sans une seule faute`,
    ficheManqueManches: (n, allure) =>
      `Il te manque ${n} manche${n > 1 ? "s" : ""} à l'allure ${allure}.`,
    ficheManquePiege: "Il te reste à déjouer un piège sous cette règle.",
    ficheManqueSerie: (n) => `Il te manque ${n} manche${n > 1 ? "s" : ""} d'affilée sans faute.`,
    ficheManqueSansFaute: (n) => `Il te reste un run de ${n} manches sans aucune faute.`,
    ficheRienNeManque: "Rien ne manque. Cette règle est parfaite.",
    ficheEntraine: (allure) => `S'ENTRAÎNER · ${allure}`,
    hudGeste: "1 GESTE",
    hudTiens: "LÂCHE QUAND LE CERCLE EST PLEIN",
    hudGestes: (n) => `${n} GESTES`,
    hudDerniereVie: "DERNIÈRE VIE",
    butManches: (n) => `${n} MANCHE${n > 1 ? "S" : ""}`,
    butUnite: "MANCHES",
    butMieux: "Tu peux faire mieux ?",
    butDejaBattu: "Tu fais mieux que ça.",
    butSien: (n) => `TON SCORE DU JOUR · ${n}`,
    butModeJour: "RUN DU JOUR",
    avanceRegle: (regle, cases) => `${regle} · MAÎTRISE ${cases} / 6`,
    avancePieges: (n) => `+${n} piège${n > 1 ? "s" : ""} déjoué${n > 1 ? "s" : ""}.`,
    avanceManches: (n, allure) => `Meilleur à l'allure ${allure} : ${n} manches.`,
    avanceCase: "Une case de plus.",
    avanceRien: "Rien de neuf sur cette règle cette fois.",
    avanceTravailler: (regle) => `TRAVAILLER ${regle}`,
    goutFaitAvancer: (quoi) => `Ce run fait avancer : ${quoi}`,
    goutRienAAvancer: "Cette carte est parfaite.",
    cptConnecte: "CONNECTÉ",
    cptMeilleur: "MEILLEUR SCORE",
    cptCourtRecord: "RECORD",
    cptCourtCartes: "CARTES",
    cptCourtSerie: "SÉRIE",
    cptRegleCarnet: "RÈGLES AU CARNET",
    cptMaitrisees: "MAÎTRISÉES",
    cptSerieEnCours: "SÉRIE EN COURS",
    cptEnJours: (n) => `${n} J`,
    cptRepartition: (p, m, d, v) =>
      `${p} parfaite${p > 1 ? "s" : ""} · ${m} maîtrisée${m > 1 ? "s" : ""} · ${d} découverte${d > 1 ? "s" : ""} · ${v} verrouillée${v > 1 ? "s" : ""}`,
    cptJourFait: (score) => `${score} aujourd'hui`,
    cptJourRang: (rang) => `${rang}ᵉ du jour · vérifié par rejeu`,
    cptJourRien: "Pas encore joué aujourd'hui.",
    cptGarde: (score) => `GARDE CE ${score}`,
    cptGardeRien: "GARDE TA PROGRESSION",
    decouverteNote: (manche, vues, total) =>
      `Rencontrée à la manche ${manche}. Entrée au carnet · ${vues} / ${total}.`,
    butModeEntrainement: "ENTRAÎNEMENT",
    tutoEtape: (n, total) => `DÉCOUVERTE ${n} / ${total}`,
    tutoObeis: "TA RÈGLE : JAMAIS DE ROUGE. ICI, OBÉIS.",
    tutoOui: "OUI. LE BLEU N'ENFREINT PAS TA RÈGLE.",
    tutoOuiNote: "LA PLUPART DES CONSIGNES SONT AUSSI SIMPLES. PAS TOUTES.",
    tutoRienFaitBravo: "TU N'AS RIEN FAIT : PIÈGE DÉJOUÉ.",
    tutoRienFaitNote: "OBÉIR AURAIT ÉTÉ LA FAUTE. C'EST TOUT LE JEU.",
    tutoSecondPiege: "UN AUTRE PIÈGE. TIENS BON JUSQU'AU BOUT.",
    tutoPret: "À TOI. LA VRAIE PARTIE COMMENCE.",
    tutoVasy: "VAS-Y, PRENDS TON TEMPS",
    tutoSansChrono: "LE CHRONO EST DÉSACTIVÉ",
    tutoRelis: "RELIS TA RÈGLE AVANT D'AGIR",
    tutoRienFaire: "NE TOUCHE À RIEN — LAISSE PASSER",
    tutoRalenti: "CHRONO RALENTI POUR CETTE MANCHE",
    tutoPasCelleLa: "PAS CELLE-LÀ — REGARDE LA COULEUR DEMANDÉE",
    tutoInterdit: "TA RÈGLE INTERDIT LE ROUGE",
    cptNomRate: "LE NOM N'A PAS PU ÊTRE ENREGISTRÉ — IL RESTE VALABLE SUR CET APPAREIL",
    compteConfirmer: "CONFIRMER LA SUPPRESSION",
    compteTitreConnecte: "TON COMPTE",
    compteTitreAnonyme: "ENREGISTRER TES PERFS",
    compteIndispo: "LES COMPTES NE SONT PAS DISPONIBLES POUR L'INSTANT.",
    compteSuppressionKo: "SUPPRESSION IMPOSSIBLE POUR L'INSTANT. RÉESSAIE PLUS TARD.",
    briefUneDePlus: "UNE DE PLUS",
    briefEspace: "APPUIE SUR ESPACE ET GARDE-LA ENFONCÉE POUR LANCER",
    rankedRecherche: "RECHERCHE…",
    rankedNom: "CLASSÉ",
    rankedIndispo: "CLASSÉ INDISPONIBLE",
    rankedEnvoi: "ENVOI DU RUN…",
    rankedInjoignable: "SERVEUR INJOIGNABLE · RUN NON CLASSÉ",
    rankedEyebrow: (d, e) => `CLASSÉ · ${d} · ${e}`,
    goMaintiens: "MAINTIENS ESPACE",
    goEntrer: "ENTRER EN LICE",
    goDefi: "RELEVER LE DÉFI",
    quetesValidees: (p) => `QUÊTES VALIDÉES · +${p} PIÈCES`,
    serieEnCours: "SÉRIE EN COURS",
    defiRecu: "DÉFI REÇU",
    defiDe: (q) => `DÉFI DE ${q}`,
    defiMemeOrdre: (m) => `MÊME PARTIE, MÊME ORDRE · L'ADVERSAIRE A TENU ${m} MANCHES`,
    defierAmi: "DÉFIER UN AMI",
    defierHorsLigne: "OUVRE LE JEU EN LIGNE POUR DÉFIER",
    lienCopie: "LIEN COPIÉ ✓",
    partager: "PARTAGER",
    copieOk: "COPIÉ ✓",
    reactiverMessages: "Réactiver ses messages",
    couperMessages: "Couper ses messages",
    reactiver: "Réactiver",
    couper: "Couper",
    muet: "MUET",
    sourdine: "SOURDINE",
    exclure: "EXCLURE",
    inviteQuelquun: "INVITE QUELQU'UN",
    enAttente: "EN ATTENTE",
    reglagesHote: "RÉGLAGES · HÔTE",
    reglagesSalon: "RÉGLAGES DU SALON",
    connexion: "CONNEXION…",
    ilFautUnNom: "IL FAUT UN NOM POUR QUE LES AUTRES TE VOIENT",
    codeCopie: (c) => `CODE ${c} COPIÉ`,
    lienInvitation: "LIEN D'INVITATION · UN CLIC POUR COPIER",
    regleChange: "TA RÈGLE CHANGE",
    regleUnique: "TA RÈGLE UNIQUE",
    duel: "DUEL",
    elimineSous: (r) => `ÉLIMINÉ · ${r}`,
    matchTermine: "MATCH TERMINÉ",
    egalite: "ÉGALITÉ",
    tuAsGagne: "TU AS GAGNÉ",
    finGagne: (nom) => `${nom} GAGNE`,
    vainqueur: "VAINQUEUR",
    finDuMatch: "FIN DU MATCH",
    modeDaily: (j) => `RUN DU JOUR · #${j}`,
    modeEscalade: "LA PILE",
    modeTraining: "ENTRAÎNEMENT",
    piedDaily: (j) => `JOUR #${j}`,
    piedSur: "SUR",
    piedRegles: "RÈGLES",
    piedRecord: "RECORD",
    piedScore: "SCORE",
    briefEscalade: (p) =>
      `Tu commences avec une règle. Toutes les ${p} manches, une autre s'ajoute — et tu les tiens toutes. Jusqu'où ?`,
    briefDailyLignes: (m) => `${m} MANCHES · LE MEILLEUR DE TES ESSAIS COMPTE`,
    briefEscaladeLignes: (m) => `${m} RÈGLES AU MAXIMUM · LE SCORE EST CE QUE TU TIENS`,
    briefTiens: "APPUIE SUR ESPACE ET GARDE-LA ENFONCÉE",
    goCommencer: "COMMENCER",
    goUnSeulEssai: "COMMENCER",
    dailyEssaisRestants: (n) => `${n} ESSAI${n > 1 ? "S" : ""} RESTANT${n > 1 ? "S" : ""}`,
    dailyEpuise: (sc) => `${sc} MANCHE${sc > 1 ? "S" : ""} · REVIENS DEMAIN`,
    dailyTermine: (sc) => `TERMINÉ · ${sc} MANCHES`,
    piedVies: "VIES",
    piedSpectateur: "SPECTATEUR",
    piedMulti: "MULTI",
    echauffement: "ÉCHAUFFEMENT — TU NE PEUX PAS MOURIR",
    echauffementFini: "À TOI DE JOUER",
    piegeDejoue: "PIÈGE DÉJOUÉ",
    tenu: "TENU",
    faitMaj: "FAIT",
    cptSansNom: "SANS NOM",
    profilLocal: "SUR CET APPAREIL",
    profilTop: "PROFIL",
    cptCarnet: "CARNET",
    cptRegles: (n, tot) => `${n} / ${tot} RÈGLES`,
    cptSerie: "SÉRIE",
    cptJours: (n) => `${n} JOUR${n > 1 ? "S" : ""}`,
    cptRecordEntrainement: "RECORD À L'ENTRAÎNEMENT",
    cptManches: (n) => `${n} MANCHES`,
    cptRunsEnregistres: "RUNS DU JOUR ENREGISTRÉS",
    cptMeilleurRun: "MEILLEUR RUN DU JOUR",
    dailyFait: "C'est fait pour aujourd'hui.",
    dailyRevient: (n) => `${n} MANCHES · REVIENS DEMAIN`,
    dailyUnEssai: "TROIS ESSAIS",
    escaladeEtat: "JUSQU'OÙ TU TIENS ?",
    trainingNeuf: "COMMENCE ICI · TU NE PERDS RIEN",
    trainingRecord: (n) => `RECORD · ${n} MANCHES`,
    teaserDefaut: "Une règle t'attend.",
    pickAleatoire: "AU HASARD",
    pickVerrouille: "— — —",
    /*
     * COURT : il vit dans le SOMMAIRE du repli, à côté de son libellé.
     *
     * « 4 / 12 DÉCOUVERTES · 2 MAÎTRISÉES » mesurait 156 px et passait sur deux
     * lignes à 375 px, sous un libellé qui en prenait déjà deux. Le mot
     * « découvertes » est de toute façon dit par le libellé juste à gauche :
     * « TRAVAILLER UNE RÈGLE · 4 / 12 » se lit sans lui.
     *
     * « MAÎTRISÉE » est un compte NU, il accorde donc avec son propre nombre —
     * contrairement au « 4 / 12 », qui accorde avec le 12 comme au carnet.
     */
    pickCompte: (v, t, m) => `${v} / ${t} · ${m} MAÎTRISÉE${m > 1 ? "S" : ""}`,
    pickAideAleatoire:
      "Le jeu choisit, les règles jamais vues d'abord — chacune rejoint la liste une fois jouée.",
    pickAideChoisie: (r) => `Tu travailles ${r}.`,
    pickResteManches: (n) => `${n} MANCHE${n > 1 ? "S" : ""}`,
    pickRestePiege: "1 PIÈGE",
    pickMaitrisee: "MAÎTRISÉE",
    podiumRang: (r, sc) => `TU ES ${r}${r === 1 ? "ᵉʳ" : "ᵉ"} · ${sc} MANCHE${sc > 1 ? "S" : ""}`,
    podiumAbsent: "CRÉE UN COMPTE POUR Y FIGURER",
    pickPourMaitriser: (r) => `POUR LA MAÎTRISER : ${r}`,
    carnetProgres: (v, t, k) => `${v} / ${t} RENCONTRÉES · ${k} MAÎTRISÉE${k > 1 ? "S" : ""}`,
    carnetJamais: "JAMAIS RENCONTRÉE",
    carnetMeilleur: (b) => `MEILLEUR ${b}`,
    finReglesTenues: (n, sc) => `RÈGLE${n > 1 ? "S" : ""} TENUE${n > 1 ? "S" : ""} · ${sc} MANCHES`,
    finSansFaute: "MANCHES · SANS FAUTE",
    finSurTotal: (t) => `MANCHES SUR ${t}`,
    finManchesTenues: "MANCHES TENUES",
    overCompRecord: (n) => `TON RECORD · ${n}`,
    overCompMediane: (n) => `MÉDIANE · ${n}`,
    overCompAbsolu: (n) => `RECORD · ${n}`,
    finBattu: "TU AS BATTU TON RECORD",
    overAncien: (n) => `ANCIEN · ${n}`,
    overCarteRegle: (regle, pieges) =>
      `${regle} · ${pieges} PIÈGE${pieges > 1 ? "S" : ""} DÉJOUÉ${pieges > 1 ? "S" : ""}`,
    overManque: (n) =>
      `IL TE MANQUE ${n} MANCHE${n > 1 ? "S" : ""} POUR LE RECORD`,
    overManquePas: "TU FAIS MIEUX QUE LE RECORD CONNU",
    finPartagerCarte: "PARTAGER LA CARTE",
    microDecouverte: "RÈGLE DÉCOUVERTE",
    microMaitrisee: "RÈGLE MAÎTRISÉE",
    microEchauffement: "L'ÉCHAUFFEMENT EST FINI",
    microEchauffementQuoi: "À partir de maintenant, une erreur coûte une vie.",
    microMaitriseQuoi:
      "Tu as tenu 15 manches ET déjoué ses pièges. C'est ça, maîtriser une règle.",
    microCarnet: (vues, total) => `ELLE ENTRE AU CARNET · ${vues} / ${total}`,
    toastLien: "LIEN COPIÉ",
    toastEntre: (nom, n, max) => `${nom} ENTRE · ${n} / ${max}`,
    toastAllure: "ALLURE",
    pastilleSur: (n) => `+${n} SUR TON MIEUX`,
    pastilleRecord: (n) => `RECORD DÉPASSÉ · ${n}`,
    installerAndroid: "Ajoute TOR à ton écran d'accueil : plus de barre du navigateur, plus de terrain.",
    installerIos: "Touche Partager, puis « Sur l'écran d'accueil » : plus de barre du navigateur, plus de terrain.",
    installerCompris: "COMPRIS",
    hudVite: "VITE",
    puceDe: (id) => (debout && id === "gaucher" ? GAUCHER_DEBOUT.fr.puce : (PUCES.fr[id] ?? "")),
    allureRef: "ALLURE DE RÉFÉRENCE · C'EST ELLE QUI INSCRIT LE RECORD",
    alluurePlus: (r) => `PLUS DE TEMPS POUR APPRENDRE · LE RECORD NE S'INSCRIT QU'EN ${r}`,
    allureMoins: (r) => `MOINS DE TEMPS QUE LA RÉFÉRENCE · LE RECORD NE S'INSCRIT QU'EN ${r}`,
    salonJoueurs: (n, max) => `${n} / ${max} JOUEURS`,
    salonSeulHint: "LA PARTIE SE LANCE DÈS QUE QUELQU'UN ARRIVE",
    salonPlaceLibre: "EMPLACEMENT LIBRE",
    reglagesVerrouilles: "RÉGLAGES VERROUILLÉS PENDANT UN MATCH",
    reglagesTuDecides: "TU DÉCIDES POUR TOUT LE SALON · TOUCHE UNE OPTION POUR LA CHANGER",
    reglagesInvite: "SEUL CELUI QUI A CRÉÉ LE SALON PEUT CHANGER CES RÉGLAGES",
    vitesseQuoi: (nom, delta) =>
      `${nom} · ${delta > 0 ? "+" : ""}${delta} MS À LA MANCHE 20`,
    vitesseQuoiRef: (nom, ms) => `${nom} · ${ms} MS À LA MANCHE 20`,
    rythmeImposteur: "LE RYTHME APPARTIENT AU MODE · DÉCOUVERTE",
    rythmeCoop: "LE RYTHME APPARTIENT AU MODE · 12 VAGUES DE 20 À 40 S",
    optJamais: "JAMAIS",
    optDuos: "DUOS",
    optChacun: "CHACUN",
    optImposteur: "IMPOSTEUR",
    optCoop: "COOP",
    plaqueAgi: "AGI",
    plaqueRien: "RIEN",
    observeTour: (n, sur) => `${n} / ${sur}`,
    modeImposteurQuoi: "DIX MANCHES · PERSONNE N'EST ÉLIMINÉ · UN IMPOSTEUR · UN VOTE",
    modeCoopQuoi: "UNE VIE COMMUNE · CHACUN SON INTERDIT · 12 VAGUES · 4 À 6",
    issueVillage: "LE VILLAGE A TROUVÉ",
    issueImposteur: "L'IMPOSTEUR S'EN TIRE",
    imposteurEtait: (nom) => `L'IMPOSTEUR ÉTAIT ${nom}`,
    voteRecu: "VOIX ENREGISTRÉE",
    ariaVitesse: (nom) => `Vitesse ${nom}`,
    ariaVies: (n) => `${n} vie${n > 1 ? "s" : ""}`,
    ariaRotationJamais: "Les règles ne tournent jamais",
    ariaRotation: (n) => `Rotation toutes les ${n} manches`,
    ariaDuos: "Duos : deux joueurs par équipe, une réserve de vies commune",
    ariaChacun: "Chacun pour soi",
    ariaImposteur: "Imposteur : une règle commune secrète, dix manches, personne n'est éliminé, un vote",
    ariaCoop: "Coop : une vie commune, une scène identique, chacun un interdit de cible, 12 vagues, 4 à 6 joueurs",
    ariaSigne: (n, total) => `Signe ${n} sur ${total}`,
    carteAucune: "Aucune carte",
    photoIllisible: "CETTE IMAGE NE SE LIT PAS. ESSAIE UNE AUTRE PHOTO.",
    amisErr: {
      code: "UN CODE FAIT SIX LETTRES OU CHIFFRES.",
      soi: "C'EST TON PROPRE CODE.",
      inconnu: "AUCUN JOUEUR N'A CE CODE. VÉRIFIE-LE AVEC LUI.",
      plein: "LISTE PLEINE : 50 AMIS ET 30 DEMANDES AU PLUS.",
      reseau: "PAS DE RÉPONSE. RÉESSAIE DANS UN INSTANT.",
    },
    amisSeul: "DONNE TON CODE À UN AMI, OU TAPE LE SIEN.",
    murJourTitre: "RUN DU JOUR · LE MÊME POUR TOUS",
    murJourMien: (score, essais) =>
      score !== null && score > 0
        ? `TON MEILLEUR AUJOURD'HUI · ${score} / 40${essais > 0 ? ` · ${essais} ESSAI${essais > 1 ? "S" : ""} RESTANT${essais > 1 ? "S" : ""}` : ""}`
        : essais > 0
          ? `PAS ENCORE JOUÉ · ${essais} ESSAI${essais > 1 ? "S" : ""}`
          : "PLUS D'ESSAI AUJOURD'HUI · RENDEZ-VOUS DEMAIN",
    recordJour: "RUN DU JOUR · AUJOURD'HUI",
    recordAllure: (allure) => `ENTRAÎNEMENT · ${allure}`,
    recordPile: "LA PILE",
    recordUnite: "MANCHES",
    recordUnitePile: "RÈGLES TENUES",
    amisNote: "CLASSÉS SUR LE RUN DU JOUR — LE MÊME POUR TOUT LE MONDE. LES BARRES : LES 7 DERNIERS JOURS. « 30 J » : LE MEILLEUR DU MOIS.",
    amisPasJoue: "PAS JOUÉ",
    amisCopie: "COPIÉ",
    amisAccepter: "ACCEPTER",
    amisRefuser: "NON",
    amisAnnuler: "ANNULER",
    amisEnAttente: "EN ATTENTE",
    amisDemandee: (qui) => `DEMANDE ENVOYÉE${qui ? ` À ${qui}` : ""}. ELLE ATTEND SA RÉPONSE.`,
    amisLie: (qui) => `${qui || "VOUS"} ET TOI, AMIS. VOS RUNS SE COMPARENT.`,
    amisDemandes: (n) => (n === 1 ? "1 DEMANDE D'AMI" : `${n} DEMANDES D'AMIS`),
    amisPartageTexte: (code) => `Mon code ami sur The One Rule : ${code}`,
    ariaAccepterAmi: (qui) => `Accepter ${qui}`,
    ariaRefuserAmi: (qui) => `Refuser ${qui}`,
    amisMeilleur: (n) => `30 J · ${n}`,
    ariaRetirerAmi: (qui) => `Retirer ${qui} de tes amis`,
    ariaSemaine: (qui, scores) => `${qui}, 7 derniers jours : ${scores}`,
    ariaCouper: (qui) => `Couper ${qui}`,
    ariaReactiver: (qui) => `Réactiver ${qui}`,
    ariaExclure: (qui) => `Exclure ${qui}`,
    dicteLeCode: "DICTE-LE : IL EST JUSTE AU-DESSUS",
    /*
     * ⚠️ « RECONNEXION… » ET PAS « HORS LIGNE ».
     *
     * C'est la decision n°4 vue depuis le SALON : une coupure n'est pas une
     * defaite, et les autres doivent le savoir. « HORS LIGNE » se lit « il est
     * parti », donc on l'exclut ou on relance sans lui ; « RECONNEXION… » se
     * lit « il revient, sa place est gardee » — ce que le serveur fait
     * reellement pendant `RECONNECT_GRACE_MS`.
     *
     * ⚠️ PAS DE REBOURS ICI, et c'est deliberé. La maquette affiche « 18 S ».
     * Le client ne connait pas l'instant ou le serveur a vu la coupure : il ne
     * peut horodater que le moment ou LUI l'a apprise, donc deux ecrans du
     * meme salon afficheraient deux chiffres differents pour le meme siege.
     * Le mot est vrai sans horloge ; les secondes seraient une supposition.
     */
    siegeHorsLigne: "RECONNEXION…",
    siegeHote: "HÔTE",
    siegeDebutant: "1RE PARTIE · +1 VIE",
    siegePret: "PRÊT",
    siegeEnMatch: (v, sc) => `${v} VIE${v > 1 ? "S" : ""} · ${sc} MANCHES`,
    tamponLent: "TROP LENT",
    tamponInfraction: "INFRACTION",
    tamponRate: "RATÉ",
    tuEsElimine: "TU ES ÉLIMINÉ",
    tuPerdsUneVie: "TU PERDS UNE VIE",
    elimine: "ÉLIMINÉ",
    viePerdue: "VIE PERDUE",
    sousRegle: (r) => `SOUS ${r}`,
    ilsNeSontPlusQue: (n) => `ILS NE SONT PLUS QUE ${n}`,
    jeRegarde: (qui) => `JE REGARDE ${qui}`,
    reglesTournent: (r) => `LES RÈGLES TOURNENT · ${r}`,
    titreReflexe: "RÉFLEXE DU MATCH",
    titreFlair: "FLAIR",
    titreSerie: "SÉRIE",
    titreBrulee: "TÊTE BRÛLÉE",
    titreSurvivante: "SURVIVANT",
    titrePremiereFois: "1re PARTIE",
    rangEme: (n) => `${n}${n === 1 ? "ᵉʳ" : "ᵉ"}`,
    // Le singulier compte : « 1 MANCHES » se remarque, et un joueur éliminé à la
    // première manche est le cas le plus fréquent de tout l'écran de fin.
    manchesN: (n) => `${n} MANCHE${n > 1 ? "S" : ""}`,
    aRegarde: "A REGARDÉ",
    errDeconnecte: "DÉCONNECTÉ — REJOINS POUR REPRENDRE TA PLACE",
    signeChoisis: (n) => `CHOISIS TON SIGNE · ${n} DISPONIBLES`,
    sortieRetaper: "RETAPER",
    reconnexion: "RECONNEXION…",
    perfRefusee: "CE RUN N'A PAS ÉTÉ ENREGISTRÉ",
    cptEcart: "PAS ENCORE SYNCHRONISÉ",
    cptEcartQuoi: "TON SCORE DU JOUR EST PLUS HAUT ICI QUE SUR LE SERVEUR",
    piedDepasse: "SUR TON MIEUX",
    objectifReste: (n) => `OBJECTIF · ${n} MANCHE${n > 1 ? "S" : ""}`,
    exerciceValide: "EXERCICE VALIDÉ",
    nomsPaliers: ["ÉCHAUFFEMENT", "PRESSION", "ÉTAU", "ASPHYXIE", "AU-DELÀ"],
    briefLongueur: "MANCHES",
    briefEssais: "ESSAIS",
    briefEchauffement: "SANS RISQUE",
    avanceMaitrisee: (regle) => `${regle} · MAÎTRISÉE`,
    avanceParfaite: (regle) => `${regle} · PARFAITE · 6 / 6`,
    resteFait: (score, sur) => `Run du jour bouclé · ${score} sur ${sur} manches.`,
    resteEpuise: (score) => `Trois essais joués · ${score} manches retenues.`,
    resteTravailler: (regle, et, max) => `TRAVAILLER ${regle} · ★ ${et}/${max}`,
    coupureEtat: (essai, sur, s) => `ESSAI ${essai} SUR ${sur} · ${s} S RESTANTES`,
    sortieOuvrir: "OUVRIR LE MIEN",
    sortieRecharger: "RECHARGER",
    /*
     * ⚠️ LE MESSAGE DIT LA CAUSE, les boutons disent le geste.
     *
     * Il disait « VÉRIFIE LES 4 CARACTÈRES, OU CRÉE LE TIEN » — exactement ce
     * que RETAPER et OUVRIR LE MIEN portent désormais, donc lu deux fois. Ce
     * qu'aucun bouton ne peut dire, c'est POURQUOI : le 2 et le Z sont tous
     * deux dans `CODE_ALPHABET` et se confondent quand on dicte, et un salon
     * ne survit pas au redémarrage du serveur.
     */
    errSalonInconnu:
      "CE SALON N'EXISTE PLUS — SOIT LE CODE EST MAL RECOPIÉ (LE 2 ET LE Z SE RESSEMBLENT), SOIT L'HÔTE A FERMÉ",
    errSalonComplet: (max) => `SALON COMPLET · ${max} JOUEURS`,
    errNeedPlayers: (min, max) => `IL FAUT ENTRE ${min} ET ${max} JOUEURS POUR LANCER`,
    coopFinRang: (vagues, score) =>
      `${vagues} VAGUE${vagues > 1 ? "S" : ""} · SCORE ${score}`,
    coopTenu: "TENU",
    coopKo: "À SEC",
    errPasHote: "SEUL CELUI QUI A CRÉÉ LE SALON PEUT LANCER — DEMANDE-LUI",
    errEnMatch: "MATCH EN COURS — TU ENTRES À LA PROCHAINE PARTIE",
    errVersion: "VERSION INCOMPATIBLE — RECHARGE LA PAGE",
    errExclu: "TU AS ÉTÉ SORTI DU SALON — TU PEUX EN CRÉER UN À TOI",
    errInjoignable: "SERVEUR INJOIGNABLE — VÉRIFIE TA CONNEXION, PUIS RÉESSAIE",
    errReconnexion: "RECONNEXION IMPOSSIBLE — RÉESSAIE",
    errCode4: "UN CODE DE SALON FAIT EXACTEMENT 4 CARACTÈRES",
    errConnexionPerdue: "CONNEXION PERDUE — REJOINS POUR REPRENDRE TA PLACE",
    cptEnregistre: "Ta progression est enregistrée. Elle te suivra sur tes autres appareils.",
    cptSansCompte:
      "Le jeu marche sans. Un compte ne sert qu'à garder ce que tu fais quand tu changes de navigateur ou d'appareil.",
    cptCeQuiSerait:
      "CE QUI SERAIT ENREGISTRÉ : TON CARNET, TA SÉRIE ET TES RECORDS. RIEN D'AUTRE.",
    cptGoogle: "CONTINUER AVEC GOOGLE",
    cptDiscord: "CONTINUER AVEC DISCORD",
    cptSupprimerAvert1: "TON COMPTE, TON HISTORIQUE ET TES RUNS ENREGISTRÉS SERONT EFFACÉS. ",
    cptSupprimerAvert2: "TA PROGRESSION SUR CET APPAREIL RESTE. C'EST DÉFINITIF.",
    cptRecordLocal: "RECORD PERSONNEL · <b></b>. IL N'EXISTE QUE DANS CE NAVIGATEUR.",
    cptManchesLocal: "<b></b> MANCHES. CE NAVIGATEUR EST LE SEUL À S'EN SOUVENIR.",
    cptErrAnnule: "CONNEXION ANNULÉE.",
    cptErrEchange:
      "LE FOURNISSEUR A REFUSÉ L'ÉCHANGE. VÉRIFIE L'URI DE RETOUR DÉCLARÉE CHEZ LUI.",
    cptErrExpire: "LIEN DE RETOUR EXPIRÉ OU ROUVERT DEUX FOIS. RÉESSAIE.",
    cptErrSuspendu: "CE COMPTE EST SUSPENDU.",
    cptErrNonConfig: "LES COMPTES NE SONT PAS CONFIGURÉS SUR CE DÉPLOIEMENT.",
    cptErrRetour: (c) => `RETOUR REFUSÉ (${c}).`,
    finTenu: "TENU",
    finRegleEnfreinte: "RÈGLE UNIQUE ENFREINTE",
    finRompu: "ROMPU",
    finElimine: "ÉLIMINÉ",
    multiRegleInconnue: "MANCHE ILLISIBLE — RECHARGE LA PAGE",
    hudPieges: (n) => `${n} piège${n > 1 ? "s" : ""} déjoué${n > 1 ? "s" : ""}`,
    /*
     * ⚠️ L'ORDINAL N'EST PAS LE MEME EN FRANCAIS ET EN ANGLAIS, et il ne se
     * traduit pas par un suffixe unique : « 1er » puis « 2e », contre « 1st,
     * 2nd, 3rd, 4th ». Deux fonctions separees, chacune dans sa langue — une
     * table commune aurait fini par produire « 2er » ou « 1th ».
     */
    finTonRang: (place, total, manches) =>
      `TU FINIS ${place}${place === 1 ? "ᵉʳ" : "ᵉ"} SUR ${total} · MANCHE ${manches}`,
    finExAequo: (place, total, manches) =>
      `EX ÆQUO ${place}${place === 1 ? "ᵉʳ" : "ᵉ"} SUR ${total} · MANCHE ${manches}`,
    finReperRecord: (n) => `TON RECORD · ${n}`,
    finReperMediane: (n) => `MÉDIANE · ${n}`,
    finReperMeilleur: (n) => `RECORD · ${n}`,
    finLegTenue: "TENUE",
    finLegPiege: "PIÈGE DÉJOUÉ",
    finLegFaute: "ÉCHAUFFEMENT",
    finLegChute: "CHUTE",
    bilanQuetes: "QUÊTES",
    bilanSerie: "SÉRIE",
    bilanCarnet: "CARNET",

    profJourRecord: (n) => `À BATTRE AUJOURD'HUI · ${n}`,
    profJourBattu: (n) => `TU FAIS MIEUX QUE ${n}`,
    attractRegle: "TA RÈGLE",
    attractManche: (n) => `DÉMO · MANCHE ${n}`,
    attractPersonne: "PERSONNE NE JOUE ICI",
    attractTenu: "TENU",
    attractPiege: "PIÈGE DÉJOUÉ",
    demoRegle: "TA RÈGLE · JAMAIS DE ROUGE",
    demoConsigneA: "Clique le rond bleu",
    demoConsigneB: "Clique le carré rouge",
    demoVerdictA: "TENU",
    demoVerdictB: "PIÈGE DÉJOUÉ",
    finRecordTitre: "TU AS BATTU TON RECORD",
    finRecordAncien: (n) => `ANCIEN · ${n}`,
    finRecordAvance: (n) => `+${n}`,
    finEgaleTitre: "TU AS ÉGALÉ TON RECORD",
    finRecordCarte: (n) => `NOUVEAU RECORD · +${n}`,
    finCarte: "CARTE À PARTAGER",
    finCartePrete: "CARTE PRÊTE",
    finCarteRatee: "CARTE IMPOSSIBLE ICI",
    slogan: "PARFOIS, OBÉIR EST LA FAUTE",
    modeClasse: "CLASSÉ",
    allureTxt: (a) => a.toFixed(1).replace(".", ","),
    themeNom: (x) => (x === "auto" ? "AUTO" : x === "clair" ? "CLAIR" : "SOMBRE"),
    escAnnonce: "PIÈGE",
    defiGagne: (sc, cible) => `GAGNÉ · ${sc} CONTRE ${cible}`,
    defiEgalite: (cible) => `ÉGALITÉ · ${cible} PARTOUT`,
    defiPerdu: (sc, cible) => `PERDU · ${sc} CONTRE ${cible}`,
    finJours: (n) => `${n} JOUR${n > 1 ? "S" : ""}`,
    goMatchSuivant: "MATCH SUIVANT · R",
    goRevanche: "REVANCHE · R",
    goReviensDemain: "REVIENS DEMAIN",
    goRejouer: "ENCORE · R",
    regleAjoutee: (r) => `+ ${r}`,
    partageTexte: (sc, r, url) =>
      `Je tiens ${sc} manches sur ${r}. Même partie, même ordre. ${url}`,
    partageTitreJour: (j) => `THE ONE RULE #${j}`,
    partageTitreEntrainement: "THE ONE RULE · ENTRAÎNEMENT",
    partageTenu: (tot) => `TENU · ${tot} manches`,
    partageRompu: (sc) => `rompu à la manche ${sc}`,
    promptPseudo: "Ton pseudo pour le classement (14 caractères max) :",
    rankedContre: (qui, elo, sc) => `CONTRE ${qui} (${elo}) · IL A TENU ${sc} MANCHES`,
    rankedEtalon: "AUCUN ADVERSAIRE DISPONIBLE · CE RUN SERVIRA D'ÉTALON AUX SUIVANTS",
    rankedPromotion: "PROMOTION",
    rankedPlancher: "PLANCHER DE DIVISION : AUCUNE PERTE",
    rankedRunEtalon: (elo) => `RUN ÉTALON ENREGISTRÉ · <b>${elo}</b>`,
    rankedControle: (v) => `RUN ÉCARTÉ · CONTRÔLE : ${v}`,
    prefSon: "SON",
    prefMusique: "MUSIQUE",
    prefMotifs: "MOTIFS",
    prefMesure: "MESURE",
    on: "ON",
    off: "OFF",
  },
  en: {
    compteSupprimer: "DELETE ACCOUNT",
    compteNom: "CHANGE NAME",
    carteCases: (n) => `${n} / 6 · MASTERY`,
    carteParfaite: "PERFECT",
    carteVerrouillee: "LOCKED",
    carteDecouverte: "DISCOVERED",
    carteEnCours: "IN PROGRESS",
    carteMaitrisee: "MASTERED",
    carteNouvelle: "NEW",
    salleTitre: "MASTER YOUR RULES",
    codexVide:
      "No rule met yet. Start a run: a card unlocks by PLAYING, never by reading.",
    filtreAMater: (n) => `TO MASTER · ${n}`,
    filtreMaitrisees: (n) => `MASTERED · ${n}`,
    filtreToutes: (n) => `ALL · ${n}`,
    filtreInterdits: (n) => `FORBIDS · ${n}`,
    filtreDeformations: (n) => `DISTORTIONS · ${n}`,
    filtreContraintes: (n) => `CONSTRAINTS · ${n}`,
    filtreVerrouillees: (n) => `LOCKED · ${n}`,
    salleJamaisVues: (n) =>
      n === 0
        ? "You have met all sixteen rules."
        : `${n} rule${n === 1 ? "" : "s"} you have never seen. They only come up by playing.`,
    resisteNote: (runs, et, max) =>
      `${runs} run${runs === 1 ? "" : "s"} under this rule · ★ ${et} / ${max} in the chapter.`,
    resisteBouton: "WORK ON THAT ONE",
    etatCollReste: (n) =>
      `${n} rule${n === 1 ? "" : "s"} you have never seen. They only turn up by playing.`,
    etatCollTout: "You have met them all.",
    etatJourFait: (n) => `${n} ROUNDS`,
    etatJourEpuise: "THREE TRIES PLAYED",
    etatJourVierge: "NOT PLAYED YET",
    etatJourReste: (n) => `${n} TR${n === 1 ? "Y" : "IES"} LEFT`,
    etatJourNote: (essais, manches) =>
      `${essais} TR${essais > 1 ? "IES" : "Y"} · ${manches} ROUNDS`,
    etatGraceOui: "1 GRACE DAY AVAILABLE",
    etatGraceNon: "GRACE DAY ALREADY USED",
    filtreRien: "Nothing in this category yet.",
    navAttend: "YOUR RULE IS WAITING",
    famInterdit: "FORBIDS",
    famDeformation: "DISTORTION",
    famContrainte: "CONSTRAINT",
    ficheTaux: (t) => `TRAPS ${t} OF ROUNDS`,
    ficheMaitrise: (n) => `MASTERY · ${n} / 6`,
    ficheMeilleur: "BEST",
    ficheSerie: "STREAK",
    fichePieges: "TRAPS",
    casRencontree: "Met in a run",
    casPiege: "One trap defused at least once",
    casSerie: (n) => `${n} clean rounds in a row`,
    casAllure: (nom, n) => `${n} rounds at ${nom} pace`,
    casSansFaute: (n) => `A ${n}-round run without a single slip`,
    ficheManqueManches: (n, allure) =>
      `${n} more round${n === 1 ? "" : "s"} at ${allure} pace.`,
    ficheManquePiege: "You still have a trap to defuse under this rule.",
    ficheManqueSerie: (n) => `${n} more clean round${n === 1 ? "" : "s"} in a row.`,
    ficheManqueSansFaute: (n) => `A ${n}-round run without a single slip.`,
    ficheRienNeManque: "Nothing left. This rule is perfect.",
    ficheEntraine: (allure) => `TRAIN · ${allure}`,
    hudGeste: "1 MOVE",
    hudTiens: "LET GO WHEN THE RING IS FULL",
    hudGestes: (n) => `${n} MOVES`,
    hudDerniereVie: "LAST LIFE",
    butManches: (n) => `${n} ROUND${n === 1 ? "" : "S"}`,
    butUnite: "ROUNDS",
    butMieux: "Think you can do better?",
    butDejaBattu: "You are already past that.",
    butSien: (n) => `YOUR SCORE TODAY · ${n}`,
    butModeJour: "DAILY RUN",
    avanceRegle: (regle, cases) => `${regle} · MASTERY ${cases} / 6`,
    avancePieges: (n) => `+${n} trap${n === 1 ? "" : "s"} defused.`,
    avanceManches: (n, allure) => `Best at ${allure} pace: ${n} rounds.`,
    avanceCase: "One more box.",
    avanceRien: "Nothing new on this rule this time.",
    avanceTravailler: (regle) => `WORK ON ${regle}`,
    goutFaitAvancer: (quoi) => `This run advances: ${quoi}`,
    goutRienAAvancer: "This card is perfect.",
    cptConnecte: "SIGNED IN",
    cptMeilleur: "BEST SCORE",
    cptCourtRecord: "BEST",
    cptCourtCartes: "CARDS",
    cptCourtSerie: "STREAK",
    cptRegleCarnet: "RULES IN CODEX",
    cptMaitrisees: "MASTERED",
    cptSerieEnCours: "CURRENT STREAK",
    cptEnJours: (n) => `${n} D`,
    cptRepartition: (p, m, d, v) =>
      `${p} perfect · ${m} mastered · ${d} discovered · ${v} locked`,
    cptJourFait: (score) => `${score} today`,
    cptJourRang: (rang) => `#${rang} today · replayed by the server`,
    cptJourRien: "Not played today yet.",
    cptGarde: (score) => `KEEP THAT ${score}`,
    cptGardeRien: "KEEP YOUR PROGRESS",
    decouverteNote: (manche, vues, total) =>
      `Met at round ${manche}. Added to the codex · ${vues} / ${total}.`,
    butModeEntrainement: "TRAINING",
    tutoEtape: (n, total) => `DISCOVERY ${n} / ${total}`,
    tutoObeis: "YOUR RULE: NEVER RED. HERE, OBEY.",
    tutoOui: "YES. BLUE DOES NOT BREAK YOUR RULE.",
    tutoOuiNote: "MOST ORDERS ARE THIS SIMPLE. NOT ALL OF THEM.",
    tutoRienFaitBravo: "YOU DID NOTHING: TRAP AVOIDED.",
    tutoRienFaitNote: "OBEYING WOULD HAVE BEEN THE MISTAKE. THAT IS THE GAME.",
    tutoSecondPiege: "ANOTHER TRAP. HOLD ON TO THE END.",
    tutoPret: "YOUR TURN. THE REAL RUN STARTS.",
    tutoVasy: "GO AHEAD, TAKE YOUR TIME",
    tutoSansChrono: "THE CLOCK IS OFF",
    tutoRelis: "READ YOUR RULE AGAIN BEFORE ACTING",
    tutoRienFaire: "TOUCH NOTHING — LET IT PASS",
    tutoRalenti: "CLOCK SLOWED FOR THIS ROUND",
    tutoPasCelleLa: "NOT THAT ONE — LOOK AT THE COLOUR ASKED FOR",
    tutoInterdit: "YOUR RULE FORBIDS RED",
    cptNomRate: "COULD NOT SAVE THE NAME — IT STILL WORKS ON THIS DEVICE",
    compteConfirmer: "CONFIRM DELETION",
    compteTitreConnecte: "YOUR ACCOUNT",
    compteTitreAnonyme: "SAVE YOUR RUNS",
    compteIndispo: "ACCOUNTS ARE NOT AVAILABLE RIGHT NOW.",
    compteSuppressionKo: "DELETION FAILED FOR NOW. TRY AGAIN LATER.",
    briefUneDePlus: "ONE MORE",
    briefEspace: "PRESS SPACE AND HOLD IT DOWN TO START",
    rankedRecherche: "SEARCHING…",
    rankedNom: "RANKED",
    rankedIndispo: "RANKED UNAVAILABLE",
    rankedEnvoi: "SENDING THE RUN…",
    rankedInjoignable: "SERVER UNREACHABLE · RUN NOT RANKED",
    rankedEyebrow: (d, e) => `RANKED · ${d} · ${e}`,
    goMaintiens: "HOLD SPACE",
    goEntrer: "ENTER THE ARENA",
    goDefi: "TAKE THE CHALLENGE",
    quetesValidees: (p) => `QUESTS CLEARED · +${p} COINS`,
    serieEnCours: "STREAK RUNNING",
    defiRecu: "CHALLENGE RECEIVED",
    defiDe: (q) => `CHALLENGE FROM ${q}`,
    defiMemeOrdre: (m) => `SAME RUN, SAME ORDER · THEY HELD ${m} ROUNDS`,
    defierAmi: "CHALLENGE A FRIEND",
    defierHorsLigne: "OPEN THE GAME ONLINE TO CHALLENGE",
    lienCopie: "LINK COPIED ✓",
    partager: "SHARE",
    copieOk: "COPIED ✓",
    reactiverMessages: "Unmute their messages",
    couperMessages: "Mute their messages",
    reactiver: "Unmute",
    couper: "Mute",
    muet: "MUTED",
    sourdine: "MUTE",
    exclure: "KICK",
    inviteQuelquun: "INVITE SOMEONE",
    enAttente: "WAITING",
    reglagesHote: "SETTINGS · HOST",
    reglagesSalon: "ROOM SETTINGS",
    connexion: "CONNECTING…",
    ilFautUnNom: "YOU NEED A NAME SO THE OTHERS CAN SEE YOU",
    codeCopie: (c) => `CODE ${c} COPIED`,
    lienInvitation: "INVITE LINK · ONE CLICK TO COPY",
    regleChange: "YOUR RULE CHANGES",
    regleUnique: "YOUR ONE RULE",
    duel: "DUEL",
    elimineSous: (r) => `OUT · ${r}`,
    matchTermine: "MATCH OVER",
    egalite: "DRAW",
    tuAsGagne: "YOU WON",
    finGagne: (nom) => `${nom} WINS`,
    vainqueur: "WINNER",
    finDuMatch: "MATCH OVER",
    modeDaily: (j) => `DAILY RUN · #${j}`,
    modeEscalade: "THE STACK",
    modeTraining: "TRAINING",
    piedDaily: (j) => `DAY #${j}`,
    piedSur: "OF",
    piedRegles: "RULES",
    piedRecord: "BEST",
    piedScore: "SCORE",
    briefEscalade: (p) =>
      `You start with one rule. Every ${p} rounds another one is added — and you hold them all. How far?`,
    briefDailyLignes: (m) => `${m} ROUNDS · YOUR BEST ATTEMPT COUNTS`,
    briefEscaladeLignes: (m) => `${m} RULES AT MOST · YOUR SCORE IS WHAT YOU HOLD`,
    briefTiens: "PRESS SPACE AND HOLD IT DOWN",
    goCommencer: "START",
    goUnSeulEssai: "START",
    dailyEssaisRestants: (n) => `${n} ATTEMPT${n === 1 ? "" : "S"} LEFT`,
    dailyEpuise: (sc) => `${sc} ROUND${sc === 1 ? "" : "S"} · COME BACK TOMORROW`,
    dailyTermine: (sc) => `CLEARED · ${sc} ROUNDS`,
    piedVies: "LIVES",
    piedSpectateur: "SPECTATING",
    piedMulti: "MULTI",
    echauffement: "WARM-UP — YOU CANNOT DIE",
    echauffementFini: "NOW IT COUNTS",
    piegeDejoue: "TRAP AVOIDED",
    tenu: "HELD",
    faitMaj: "DONE",
    cptSansNom: "NO NAME",
    profilLocal: "ON THIS DEVICE",
    profilTop: "PROFILE",
    cptCarnet: "RULE BOOK",
    cptRegles: (n, tot) => `${n} / ${tot} RULES`,
    cptSerie: "STREAK",
    cptJours: (n) => `${n} DAY${n === 1 ? "" : "S"}`,
    cptRecordEntrainement: "TRAINING BEST",
    cptManches: (n) => `${n} ROUND${n === 1 ? "" : "S"}`,
    cptRunsEnregistres: "DAILY RUNS SAVED",
    cptMeilleurRun: "BEST DAILY RUN",
    dailyFait: "Done for today.",
    dailyRevient: (n) => `${n} ROUND${n === 1 ? "" : "S"} · COME BACK TOMORROW`,
    dailyUnEssai: "THREE ATTEMPTS",
    escaladeEtat: "HOW FAR DO YOU HOLD?",
    trainingNeuf: "START HERE · NOTHING TO LOSE",
    trainingRecord: (n) => `BEST · ${n} ROUND${n === 1 ? "" : "S"}`,
    teaserDefaut: "A rule is waiting for you.",
    pickAleatoire: "RANDOM",
    pickVerrouille: "— — —",
    pickCompte: (v, t, m) => `${v} / ${t} · ${m} MASTERED`,
    pickAideAleatoire:
      "The game picks, unseen rules first — each joins the list once you have played it.",
    pickAideChoisie: (r) => `You are training ${r}.`,
    pickResteManches: (n) => `${n} ROUND${n === 1 ? "" : "S"}`,
    pickRestePiege: "1 TRAP",
    pickMaitrisee: "MASTERED",
    podiumRang: (r, sc) => `YOU ARE ${r}${rangSuffixe(r)} · ${sc} ROUND${sc === 1 ? "" : "S"}`,
    podiumAbsent: "CREATE AN ACCOUNT TO APPEAR HERE",
    pickPourMaitriser: (r) => `TO MASTER IT: ${r}`,
    carnetProgres: (v, t, k) => `${v} / ${t} MET · ${k} MASTERED`,
    carnetJamais: "NEVER MET",
    carnetMeilleur: (b) => `BEST ${b}`,
    finReglesTenues: (n, sc) =>
      `${n === 1 ? "RULE" : "RULES"} HELD · ${sc} ROUND${sc === 1 ? "" : "S"}`,
    finSansFaute: "ROUNDS · FLAWLESS",
    finSurTotal: (t) => `ROUNDS OUT OF ${t}`,
    finManchesTenues: "ROUNDS HELD",
    overCompRecord: (n) => `YOUR BEST · ${n}`,
    overCompMediane: (n) => `MEDIAN · ${n}`,
    overCompAbsolu: (n) => `RECORD · ${n}`,
    finBattu: "YOU BEAT YOUR RECORD",
    overAncien: (n) => `PREVIOUS · ${n}`,
    overCarteRegle: (regle, pieges) =>
      `${regle} · ${pieges} TRAP${pieges === 1 ? "" : "S"} DEFUSED`,
    overManque: (n) =>
      `YOU NEED ${n} MORE ROUND${n === 1 ? "" : "S"} TO MATCH THE RECORD`,
    overManquePas: "YOU ARE PAST THE KNOWN RECORD",
    finPartagerCarte: "SHARE THE CARD",
    microDecouverte: "RULE DISCOVERED",
    microMaitrisee: "RULE MASTERED",
    microEchauffement: "WARM-UP IS OVER",
    microEchauffementQuoi: "From now on, a mistake costs a life.",
    microMaitriseQuoi:
      "You held 15 rounds AND defused its traps. That is what mastering a rule means.",
    microCarnet: (vues, total) => `IT ENTERS THE CODEX · ${vues} / ${total}`,
    toastLien: "LINK COPIED",
    toastEntre: (nom, n, max) => `${nom} JUST IN · ${n} / ${max}`,
    toastAllure: "PACE",
    pastilleSur: (n) => `+${n} OVER YOUR BEST`,
    pastilleRecord: (n) => `RECORD BEATEN · ${n}`,
    installerAndroid: "Add TOR to your home screen: no browser bar, more board.",
    installerIos: "Tap Share, then “Add to Home Screen”: no browser bar, more board.",
    installerCompris: "GOT IT",
    hudVite: "FAST",
    puceDe: (id) => (debout && id === "gaucher" ? GAUCHER_DEBOUT.en.puce : (PUCES.en[id] ?? "")),
    allureRef: "REFERENCE PACE · THIS IS THE ONE THAT SETS YOUR BEST",
    alluurePlus: (r) => `MORE TIME TO LEARN · ONLY ${r} SETS YOUR BEST`,
    allureMoins: (r) => `LESS TIME THAN THE REFERENCE · ONLY ${r} SETS YOUR BEST`,
    salonJoueurs: (n, max) => `${n} / ${max} PLAYERS`,
    salonSeulHint: "THE MATCH STARTS AS SOON AS SOMEONE ARRIVES",
    salonPlaceLibre: "FREE SLOT",
    reglagesVerrouilles: "SETTINGS LOCKED DURING A MATCH",
    reglagesTuDecides: "YOU DECIDE FOR THE WHOLE ROOM · TAP AN OPTION TO CHANGE IT",
    reglagesInvite: "ONLY WHOEVER CREATED THE ROOM CAN CHANGE THESE SETTINGS",
    vitesseQuoi: (nom, delta) =>
      `${nom} · ${delta > 0 ? "+" : ""}${delta} MS ON ROUND 20`,
    vitesseQuoiRef: (nom, ms) => `${nom} · ${ms} MS ON ROUND 20`,
    rythmeImposteur: "THE PACE BELONGS TO THE MODE · DISCOVERY",
    rythmeCoop: "THE PACE BELONGS TO THE MODE · 12 WAVES OF 20 TO 40 S",
    optJamais: "NEVER",
    optDuos: "DUOS",
    optChacun: "EACH",
    optImposteur: "IMPOSTOR",
    optCoop: "COOP",
    plaqueAgi: "ACTED",
    plaqueRien: "WAIT",
    observeTour: (n, sur) => `${n} / ${sur}`,
    modeImposteurQuoi: "TEN ROUNDS · NOBODY IS ELIMINATED · ONE IMPOSTOR · ONE VOTE",
    modeCoopQuoi: "ONE SHARED LIFE · EACH PLAYER A FORBID · 12 WAVES · 4 TO 6",
    issueVillage: "THE VILLAGE FOUND THEM",
    issueImposteur: "THE IMPOSTOR WALKS FREE",
    imposteurEtait: (nom) => `THE IMPOSTOR WAS ${nom}`,
    voteRecu: "VOTE IN",
    ariaVitesse: (nom) => `Speed ${nom}`,
    ariaVies: (n) => `${n} live${n === 1 ? "" : "s"}`,
    ariaRotationJamais: "Rules never rotate",
    ariaRotation: (n) => `Rotation every ${n} rounds`,
    ariaDuos: "Duos: two players per team, one shared pool of lives",
    ariaChacun: "Every player for themselves",
    ariaImposteur: "Impostor: one secret shared rule, ten rounds, nobody is eliminated, one vote",
    ariaCoop: "Co-op: one shared life, one identical scene, each player a target forbid, 12 waves, 4 to 6 players",
    ariaSigne: (n, total) => `Sign ${n} of ${total}`,
    carteAucune: "No card",
    photoIllisible: "THIS IMAGE CANNOT BE READ. TRY ANOTHER PHOTO.",
    amisErr: {
      code: "A CODE IS SIX LETTERS OR DIGITS.",
      soi: "THAT'S YOUR OWN CODE.",
      inconnu: "NO PLAYER HAS THIS CODE. CHECK IT WITH THEM.",
      plein: "LIST FULL: 50 FRIENDS AND 30 REQUESTS AT MOST.",
      reseau: "NO ANSWER. TRY AGAIN IN A MOMENT.",
    },
    amisSeul: "GIVE YOUR CODE TO A FRIEND, OR TYPE THEIRS.",
    murJourTitre: "DAILY RUN · THE SAME FOR EVERYONE",
    murJourMien: (score, essais) =>
      score !== null && score > 0
        ? `YOUR BEST TODAY · ${score} / 40${essais > 0 ? ` · ${essais} ${essais === 1 ? "TRY" : "TRIES"} LEFT` : ""}`
        : essais > 0
          ? `NOT PLAYED YET · ${essais} ${essais === 1 ? "TRY" : "TRIES"}`
          : "NO TRIES LEFT TODAY · SEE YOU TOMORROW",
    recordJour: "DAILY RUN · TODAY",
    recordAllure: (allure) => `TRAINING · ${allure}`,
    recordPile: "THE STACK",
    recordUnite: "ROUNDS",
    recordUnitePile: "RULES HELD",
    amisNote: "RANKED ON THE DAILY RUN — THE SAME FOR EVERYONE. THE BARS: THE LAST 7 DAYS. “30 D”: THE BEST OF THE MONTH.",
    amisPasJoue: "NOT YET",
    amisCopie: "COPIED",
    amisAccepter: "ACCEPT",
    amisRefuser: "NO",
    amisAnnuler: "CANCEL",
    amisEnAttente: "PENDING",
    amisDemandee: (qui) => `REQUEST SENT${qui ? ` TO ${qui}` : ""}. IT WAITS FOR THEIR ANSWER.`,
    amisLie: (qui) => `YOU AND ${qui || "THEM"}, FRIENDS. YOUR RUNS NOW COMPARE.`,
    amisDemandes: (n) => (n === 1 ? "1 FRIEND REQUEST" : `${n} FRIEND REQUESTS`),
    amisPartageTexte: (code) => `My friend code on The One Rule: ${code}`,
    ariaAccepterAmi: (qui) => `Accept ${qui}`,
    ariaRefuserAmi: (qui) => `Decline ${qui}`,
    amisMeilleur: (n) => `30 D · ${n}`,
    ariaRetirerAmi: (qui) => `Remove ${qui} from your friends`,
    ariaSemaine: (qui, scores) => `${qui}, last 7 days: ${scores}`,
    ariaCouper: (qui) => `Mute ${qui}`,
    ariaReactiver: (qui) => `Unmute ${qui}`,
    ariaExclure: (qui) => `Kick ${qui}`,
    dicteLeCode: "SAY IT OUT LOUD: IT IS RIGHT ABOVE",
    siegeHorsLigne: "RECONNECTING…",
    siegeHote: "HOST",
    siegeDebutant: "FIRST GAME · +1 LIFE",
    siegePret: "READY",
    siegeEnMatch: (v, sc) => `${v} ${v === 1 ? "LIFE" : "LIVES"} · ${sc} ROUND${sc === 1 ? "" : "S"}`,
    tamponLent: "TOO SLOW",
    tamponInfraction: "RULE BROKEN",
    tamponRate: "MISSED",
    tuEsElimine: "YOU ARE OUT",
    tuPerdsUneVie: "YOU LOSE A LIFE",
    elimine: "OUT",
    viePerdue: "LIFE LOST",
    sousRegle: (r) => `UNDER ${r}`,
    ilsNeSontPlusQue: (n) => `ONLY ${n} LEFT`,
    jeRegarde: (qui) => `WATCHING ${qui}`,
    reglesTournent: (r) => `RULES ARE ROTATING · ${r}`,
    titreReflexe: "FASTEST OF THE MATCH",
    titreFlair: "FLAIR",
    titreSerie: "STREAK",
    titreBrulee: "HOTHEAD",
    titreSurvivante: "SURVIVOR",
    titrePremiereFois: "1st GAME",
    rangEme: (n) => `${n}${rangSuffixe(n)}`,
    manchesN: (n) => `${n} ROUND${n === 1 ? "" : "S"}`,
    aRegarde: "WATCHED",
    errDeconnecte: "DISCONNECTED — REJOIN TO TAKE YOUR SEAT BACK",
    signeChoisis: (n) => `PICK YOUR SIGN · ${n} AVAILABLE`,
    sortieRetaper: "TYPE IT AGAIN",
    reconnexion: "RECONNECTING…",
    perfRefusee: "THIS RUN WAS NOT RECORDED",
    cptEcart: "NOT SYNCED YET",
    cptEcartQuoi: "YOUR SCORE TODAY IS HIGHER HERE THAN ON THE SERVER",
    piedDepasse: "OVER YOUR BEST",
    objectifReste: (n) => `GOAL · ${n} ROUND${n === 1 ? "" : "S"}`,
    exerciceValide: "EXERCISE CLEARED",
    nomsPaliers: ["WARM-UP", "PRESSURE", "VICE", "SUFFOCATION", "BEYOND"],
    briefLongueur: "ROUNDS",
    briefEssais: "TRIES",
    briefEchauffement: "RISK-FREE",
    avanceMaitrisee: (regle) => `${regle} · MASTERED`,
    avanceParfaite: (regle) => `${regle} · PERFECT · 6 / 6`,
    resteFait: (score, sur) => `Daily run done · ${score} of ${sur} rounds.`,
    resteEpuise: (score) => `Three tries played · ${score} rounds kept.`,
    resteTravailler: (regle, et, max) => `WORK ON ${regle} · ★ ${et}/${max}`,
    coupureEtat: (essai, sur, s) => `TRY ${essai} OF ${sur} · ${s} S LEFT`,
    sortieOuvrir: "OPEN MY OWN",
    sortieRecharger: "RELOAD",
    errSalonInconnu:
      "THAT ROOM IS GONE — EITHER THE CODE WAS MISTYPED (2 AND Z LOOK ALIKE), OR THE HOST CLOSED IT",
    errSalonComplet: (max) => `ROOM FULL · ${max} PLAYERS`,
    errNeedPlayers: (min, max) => `YOU NEED ${min} TO ${max} PLAYERS TO START`,
    coopFinRang: (vagues, score) =>
      vagues === 1 ? `1 WAVE · SCORE ${score}` : `${vagues} WAVES · SCORE ${score}`,
    coopTenu: "HELD",
    coopKo: "DRAINED",
    errPasHote: "ONLY WHOEVER CREATED THE ROOM CAN START — ASK THEM",
    errEnMatch: "MATCH IN PROGRESS — YOU JOIN THE NEXT ONE",
    errVersion: "INCOMPATIBLE VERSION — RELOAD THE PAGE",
    errExclu: "YOU WERE REMOVED FROM THE ROOM — YOU CAN CREATE ONE OF YOUR OWN",
    errInjoignable: "SERVER UNREACHABLE — CHECK YOUR CONNECTION, THEN TRY AGAIN",
    errReconnexion: "CANNOT RECONNECT — TRY AGAIN",
    errCode4: "A ROOM CODE IS EXACTLY 4 CHARACTERS",
    errConnexionPerdue: "CONNECTION LOST — REJOIN TO TAKE YOUR SEAT BACK",
    cptEnregistre: "Your progress is saved. It will follow you onto your other devices.",
    cptSansCompte:
      "The game works without one. An account only keeps what you do when you switch browser or device.",
    cptCeQuiSerait:
      "WHAT WOULD BE SAVED: YOUR RULE BOOK, YOUR STREAK AND YOUR BESTS. NOTHING ELSE.",
    cptGoogle: "CONTINUE WITH GOOGLE",
    cptDiscord: "CONTINUE WITH DISCORD",
    cptSupprimerAvert1: "YOUR ACCOUNT, YOUR HISTORY AND YOUR SAVED RUNS WILL BE ERASED. ",
    cptSupprimerAvert2: "YOUR PROGRESS ON THIS DEVICE STAYS. THIS IS FINAL.",
    cptRecordLocal: "PERSONAL BEST · <b></b>. IT EXISTS ONLY IN THIS BROWSER.",
    cptManchesLocal: "<b></b> ROUNDS. THIS BROWSER IS THE ONLY ONE THAT REMEMBERS.",
    cptErrAnnule: "SIGN-IN CANCELLED.",
    cptErrEchange: "THE PROVIDER REFUSED THE EXCHANGE. CHECK THE REDIRECT URI DECLARED THERE.",
    cptErrExpire: "RETURN LINK EXPIRED OR OPENED TWICE. TRY AGAIN.",
    cptErrSuspendu: "THIS ACCOUNT IS SUSPENDED.",
    cptErrNonConfig: "ACCOUNTS ARE NOT CONFIGURED ON THIS DEPLOYMENT.",
    cptErrRetour: (c) => `RETURN REFUSED (${c}).`,
    finTenu: "HELD",
    finRegleEnfreinte: "ONE RULE BROKEN",
    finRompu: "BROKEN",
    finElimine: "OUT",
    multiRegleInconnue: "ROUND UNREADABLE — RELOAD THE PAGE",
    hudPieges: (n) => `${n} trap${n === 1 ? "" : "s"} defused`,
    finTonRang: (place, total, manches) => {
      const d = place % 10;
      const c = place % 100;
      const suf =
        d === 1 && c !== 11 ? "st" : d === 2 && c !== 12 ? "nd" : d === 3 && c !== 13 ? "rd" : "th";
      return `YOU FINISH ${place}${suf} OF ${total} · ROUND ${manches}`;
    },
    finExAequo: (place, total, manches) => `TIED ${place}${rangSuffixe(place)} OF ${total} · ROUND ${manches}`,
    finReperRecord: (n) => `YOUR BEST · ${n}`,
    finReperMediane: (n) => `MEDIAN · ${n}`,
    finReperMeilleur: (n) => `RECORD · ${n}`,
    finLegTenue: "HELD",
    finLegPiege: "TRAP DEFUSED",
    finLegFaute: "WARM-UP",
    finLegChute: "FALL",
    bilanQuetes: "QUESTS",
    bilanSerie: "STREAK",
    bilanCarnet: "CODEX",

    profJourRecord: (n) => `TO BEAT TODAY · ${n}`,
    profJourBattu: (n) => `YOU ARE ABOVE ${n}`,
    attractRegle: "YOUR RULE",
    attractManche: (n) => `DEMO · ROUND ${n}`,
    attractPersonne: "NOBODY IS PLAYING HERE",
    attractTenu: "HELD",
    attractPiege: "TRAP AVOIDED",
    demoRegle: "YOUR RULE · NEVER RED",
    demoConsigneA: "Click the blue circle",
    demoConsigneB: "Click the red square",
    demoVerdictA: "HELD",
    demoVerdictB: "TRAP AVOIDED",
    finRecordTitre: "YOU BEAT YOUR RECORD",
    finRecordAncien: (n) => `PREVIOUS · ${n}`,
    finRecordAvance: (n) => `+${n}`,
    finEgaleTitre: "YOU MATCHED YOUR RECORD",
    finRecordCarte: (n) => `NEW RECORD · +${n}`,
    finCarte: "SHAREABLE CARD",
    finCartePrete: "CARD READY",
    finCarteRatee: "NO CARD HERE",
    slogan: "SOMETIMES, OBEYING IS THE MISTAKE",
    modeClasse: "RANKED",
    allureTxt: (a) => a.toFixed(1),
    themeNom: (x) => (x === "auto" ? "AUTO" : x === "clair" ? "LIGHT" : "DARK"),
    escAnnonce: "TRAP",
    defiGagne: (sc, cible) => `WON · ${sc} AGAINST ${cible}`,
    defiEgalite: (cible) => `DRAW · ${cible} EACH`,
    defiPerdu: (sc, cible) => `LOST · ${sc} AGAINST ${cible}`,
    finJours: (n) => `${n} DAY${n === 1 ? "" : "S"}`,
    goMatchSuivant: "NEXT MATCH · R",
    goRevanche: "REMATCH · R",
    goReviensDemain: "COME BACK TOMORROW",
    goRejouer: "AGAIN · R",
    regleAjoutee: (r) => `+ ${r}`,
    partageTexte: (sc, r, url) => `I held ${sc} rounds under ${r}. Same run, same order. ${url}`,
    partageTitreJour: (j) => `THE ONE RULE #${j}`,
    partageTitreEntrainement: "THE ONE RULE · TRAINING",
    partageTenu: (tot) => `HELD · ${tot} rounds`,
    partageRompu: (sc) => `broken at round ${sc}`,
    promptPseudo: "Your name for the leaderboard (14 characters max):",
    rankedContre: (qui, elo, sc) => `AGAINST ${qui} (${elo}) · THEY HELD ${sc} ROUNDS`,
    rankedEtalon: "NO OPPONENT AVAILABLE · THIS RUN BECOMES THE BENCHMARK",
    rankedPromotion: "PROMOTED",
    rankedPlancher: "DIVISION FLOOR: NOTHING LOST",
    rankedRunEtalon: (elo) => `BENCHMARK RUN SAVED · <b>${elo}</b>`,
    rankedControle: (v) => `RUN REJECTED · CHECK: ${v}`,
    prefSon: "SOUND",
    prefMusique: "MUSIC",
    prefMotifs: "PATTERNS",
    prefMesure: "METRICS",
    on: "ON",
    off: "OFF",
  },
};

/**
 * La langue courante du module.
 *
 * Une variable et non un paramètre traîné partout : les chaînes ci-dessus
 * sont écrites depuis des dizaines d'endroits, dont la boucle de jeu, et
 * faire passer la langue à chacun d'eux serait du bruit dans des chemins
 * qui doivent rester lisibles.
 *
 * `appliqueLangue` la pose. Les tests la posent aussi — c'est pour ça que
 * `poseLangue` est exportée.
 */
let courante: Lang = "fr";

export const langue = (): Lang => courante;

/** Les textes du parcours, de la boutique et de la fin de niveau, dans la langue courante. */
export const tp = (): TextesParcours => PARCOURS[courante];

export function poseLangue(l: Lang): void {
  courante = l;
}

/*
 * ------------------------------------------------------------------
 * LE TERRAIN DEBOUT — ce qui se DIT autrement quand il est transposé.
 *
 * Sur un téléphone tenu droit, le champ est transposé (`render/orientation.ts`) :
 * son axe x court vers le bas de l'écran. Le moteur ne change pas d'un iota —
 * LE GAUCHER interdit toujours `x < 200` — mais « à gauche » devient FAUX à
 * l'écran : la bande interdite est en haut.
 *
 * ⚠️ Une consigne qui décrit l'écran de travers est pire qu'une consigne
 * absente : « CLIQUE LE PLUS À GAUCHE » ferait cliquer une autre pièce que
 * celle que le moteur attend. D'où ces variantes, choisies À L'AFFICHAGE.
 *
 * ⚠️ `text` reste le français canonique, couché : LE MENTEUR compare des
 * textes, et `tests/consignes.test.ts` exige que la composition redonne
 * exactement `text`. Seul ce qui se lit change.
 * ------------------------------------------------------------------
 */
let debout = false;

/** Posée par le rendu à chaque recadrage : le texte suit le terrain. */
export function poseDebout(d: boolean): void {
  debout = d;
}

export const estDebout = (): boolean => debout;

/** Clé de consigne couchée → clé debout. */
const PHRASE_DEBOUT: Record<string, string> = {
  clicGauche: "clicHaut",
  clicDroite: "clicBas",
};

/** Ce que LE GAUCHER dit debout, sur chaque surface. */
const GAUCHER_DEBOUT: Record<
  Lang,
  { puce: string; brief: string; court: string; accroche: [string, string] }
> = {
  fr: {
    puce: "PAS EN HAUT",
    brief: "Ne clique jamais la bande du haut. Elle est hachurée, aucun clic n'y est toléré.",
    court: "Jamais la bande du haut",
    accroche: ["Le haut est un terrain miné.", "Un bord de l'écran te déteste."],
  },
  en: {
    puce: "NOT AT THE TOP",
    brief: "Never click the top strip. It is hatched, and no click is tolerated there.",
    court: "Never the top strip",
    accroche: ["The top is a minefield.", "One edge of the screen hates you."],
  },
};

/** Un accès à une table déjà construite. Rien n'alloue, rien ne parcourt. */
export function t<K extends keyof Dyn>(cle: K): Dyn[K] {
  return DYN[courante][cle];
}

/** Exposé pour que les tests éprouvent les deux langues sans le DOM. */
export const DYNAMIQUES = DYN;

const poseHtml = (el: HTMLElement | null, html: string): void => {
  if (el) el.innerHTML = html;
};

const poseTexte = (el: HTMLElement | null, texte: string): void => {
  if (el) el.textContent = texte;
};

/**
 * Peint l'accueil et le chrome dans la langue choisie.
 *
 * N'écrit JAMAIS dans `#btnSolo` ni `#btnMulti` : ce sont des boutons à
 * trois `<span>`, et un `textContent` les détruit (voir `tests/cartes.test.ts`).
 */
export function appliqueLangue(doc: Document, lang: Lang): void {
  const t = TEXTES[lang];
  poseLangue(lang);
  doc.documentElement.lang = lang;
  /*
   * Le titre de l'onglet suit la langue. Celui du HTML servi est l'anglais —
   * c'est lui que voient les robots, et l'anglais porte plus loin en
   * recherche. Un joueur francais, lui, doit lire du francais dans son onglet.
   */
  doc.title = t.titre;

  /*
   * Les chaines statiques d'abord, par leur attribut.
   *
   * On ecrit dans le `textContent` de la FEUILLE qui porte l'attribut,
   * jamais dans un conteneur : les cartes et les faces de la faille sont des
   * boutons a plusieurs `<span>`, et un `textContent` sur le bouton les
   * detruirait (voir `tests/cartes.test.ts`). L'attribut est donc pose sur le
   * span, ce que le test d'i18n verifie.
   */
  const table = STATIQUE[lang];
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[data-i18n]'))) {
    const cle = el.dataset.i18n;
    if (!cle) continue;
    const valeur = table[cle];
    // Une cle inconnue laisse le texte en place plutot que de le vider : une
    // traduction manquante doit se voir comme du francais, pas comme un trou.
    if (valeur !== undefined) el.textContent = valeur;
  }

  /*
   * PUIS les attributs.
   *
   * Un `placeholder` ou un `aria-label` n'est pas du contenu : `textContent`
   * ne l'atteint pas, et le balayage qui cherche du français dans le DOM ne le
   * voit pas non plus. Trois champs sont restés en français pendant toute la
   * traduction pour cette seule raison — dont le premier que remplit quelqu'un
   * qui arrive par un lien d'invitation.
   */
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-i18n-ph]"))) {
    const valeur = table[el.dataset.i18nPh ?? ""];
    if (valeur !== undefined) el.setAttribute("placeholder", valeur);
  }
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-i18n-aria]"))) {
    const valeur = table[el.dataset.i18nAria ?? ""];
    if (valeur !== undefined) el.setAttribute("aria-label", valeur);
  }

  poseHtml(doc.getElementById("ledeHome"), t.ledeHtml);
  poseHtml(doc.getElementById("homeFineprint"), t.fineprintHtml);
  poseHtml(doc.getElementById("reglagesFineprint"), t.fineprintReglagesHtml);
  /*
   * ⚠️ LA FAILLE A QUITTÉ L'ACCUEIL, ET SES TROIS LIGNES AVEC.
   *
   * L'objet fendu SOLO / MULTI était la vitrine du site ; il est remplacé par
   * le MODE ATTRACT — « le fond EST le jeu » — et par la rangée de profondeur,
   * qui porte les cinq modes au lieu de deux. Les chaînes `soloDesc`,
   * `multiDesc` et `failleLabel` restent dans la table : le multijoueur les
   * emploie encore ailleurs, et les retirer demanderait de vérifier chaque
   * appelant pour un gain nul.
   */

  const langBox = doc.getElementById("lang");
  if (langBox) langBox.setAttribute("aria-label", t.langAria);

  poseTexte(doc.getElementById("btnTopMenu"), t.menu);
  poseTexte(doc.getElementById("btnTopReglages"), t.reglages);
  // PROFIL n'est pas posé ici : le bouton porte un visage et un nom
  // (`peintBoutonProfil`), et un `textContent` les détruirait.

  const brand = doc.getElementById("btnTopBrand");
  if (brand) brand.setAttribute("aria-label", t.brandAria);

  const fr = doc.getElementById("btnLangFr");
  const en = doc.getElementById("btnLangEn");
  if (fr instanceof HTMLButtonElement) {
    fr.classList.toggle("is-on", lang === "fr");
    fr.setAttribute("aria-pressed", lang === "fr" ? "true" : "false");
  }
  if (en instanceof HTMLButtonElement) {
    en.classList.toggle("is-on", lang === "en");
    en.setAttribute("aria-pressed", lang === "en" ? "true" : "false");
  }
}

export function etatSolo(
  lang: Lang,
  opts: { played: boolean; score: number; ruleName: string; streak: number },
): string {
  const t = TEXTES[lang];
  const morceaux = [
    opts.played ? t.runFait(opts.score) : t.runDuJour(opts.ruleName),
  ];
  if (opts.streak > 0) morceaux.push(t.serie(opts.streak));
  return morceaux.join(" · ");
}


/* ------------------------------------------------------------------ *
 * LA CONSIGNE, COMPOSÉE
 *
 * Le moteur décrit ce qu'il demande (`Phrase`) ; c'est ici qu'on en fait
 * une phrase, donc dans la langue du joueur.
 *
 * ⚠️ POURQUOI CETTE COUCHE EXISTE. La consigne change toutes les deux
 * secondes et la fenêtre de décision fait 760 à 1500 ms. Les trois
 * playtesters anglophones passaient par la traduction automatique du
 * navigateur, qui retraduit les nœuds mutés de façon ASYNCHRONE : le texte
 * arrivait après une bonne partie de leur fenêtre, à chaque manche. « I was
 * always running out of time ». Ce n'était pas un problème de vitesse mais
 * d'incompatibilité de structure, et aucune optimisation ne l'aurait réglé.
 *
 * ⚠️ L'ORDRE DES MOTS CHANGE ENTRE LES DEUX LANGUES. « CLIQUE LE CARRÉ
 * ROUGE » devient « CLICK THE RED SQUARE » : la forme et la couleur
 * s'inversent. C'est précisément ce qu'une table de mots à mots ne sait pas
 * faire, et la raison pour laquelle la consigne est structurée plutôt que
 * traduite.
 * ------------------------------------------------------------------ */

/** Les couleurs et formes telles que le joueur les lit. */
const MOTS: Record<Lang, { couleur: Record<string, string>; forme: Record<string, string> }> = {
  fr: {
    couleur: { garance: "ROUGE", azur: "BLEU", jade: "VERT", ambre: "JAUNE" },
    forme: { carre: "CARRÉ", rond: "ROND", triangle: "TRIANGLE" },
  },
  en: {
    couleur: { garance: "RED", azur: "BLUE", jade: "GREEN", ambre: "YELLOW" },
    forme: { carre: "SQUARE", rond: "CIRCLE", triangle: "TRIANGLE" },
  },
};

/** Les sous-titres, rares mais lus au même moment. */
const SOUS: Record<Lang, Record<string, string>> = {
  fr: { nImporteOu: "N'IMPORTE OÙ" },
  en: { nImporteOu: "ANYWHERE" },
};

type Compo = (m: { couleur: string; couleur2: string; forme: string; lettre: string }) => string;

const PHRASES: Record<Lang, Record<string, Compo>> = {
  fr: {
    clicCouleur: (m) => `CLIQUE LE ${m.couleur}`,
    clicForme: (m) => `CLIQUE LE ${m.forme}`,
    clic: () => "CLIQUE",
    rienFaire: () => "NE FAIS RIEN",
    nePasCliquer: () => "NE CLIQUE PAS",
    clicGrosse: () => "CLIQUE LA PLUS GROSSE",
    clicPetite: () => "CLIQUE LA PLUS PETITE",
    tapeLettre: (m) => `TAPE ${m.lettre}`,
    tapeAffichee: () => "TAPE LA LETTRE AFFICHÉE",
    tape: () => "TAPE",
    clicFormeCouleur: (m) => `CLIQUE LE ${m.forme} ${m.couleur}`,
    clicPasCouleur: (m) => `CLIQUE CELUI QUI N'EST PAS ${m.couleur}`,
    clicPasForme: (m) => `CLIQUE CELUI QUI N'EST PAS UN ${m.forme}`,
    clicIntrus: () => "CLIQUE L'INTRUS",
    clicImmobile: () => "CLIQUE CELUI QUI NE BOUGE PAS",
    clicMobile: () => "CLIQUE CELUI QUI BOUGE",
    clicGauche: () => "CLIQUE LE PLUS À GAUCHE",
    clicDroite: () => "CLIQUE LE PLUS À DROITE",
    // Terrain debout : voir `PHRASE_DEBOUT`.
    clicHaut: () => "CLIQUE LE PLUS EN HAUT",
    clicBas: () => "CLIQUE LE PLUS EN BAS",
    clicPlusGrosCouleur: (m) => `CLIQUE LE PLUS GROS ${m.couleur}`,
    clicPlusPetitCouleur: (m) => `CLIQUE LE PLUS PETIT ${m.couleur}`,
    tapeInitiale: () => "TAPE L'INITIALE DE LA COULEUR",
    couleurPuis: (m) => `${m.couleur} PUIS ${m.couleur2}`,
    deuxFoisCouleur: (m) => `CLIQUE DEUX FOIS LE ${m.couleur}`,
    deuxFoisForme: (m) => `CLIQUE DEUX FOIS LE ${m.forme}`,
    tiensCouleur: (m) => `MAINTIENS LE ${m.couleur}`,
    tiensForme: (m) => `MAINTIENS LE ${m.forme}`,
    glisseCouleur: (m) => `GLISSE LE ${m.couleur} SUR LE ${m.couleur2}`,
    clicSauf: (m) => `CLIQUE PARTOUT SAUF SUR DU ${m.couleur}`,
    "coop.nettoyez": () => "NETTOIEZ LE TERRAIN",
  },
  en: {
    clicCouleur: (m) => `CLICK THE ${m.couleur}`,
    clicForme: (m) => `CLICK THE ${m.forme}`,
    clic: () => "CLICK",
    rienFaire: () => "DO NOTHING",
    nePasCliquer: () => "DON'T CLICK",
    clicGrosse: () => "CLICK THE BIGGEST",
    clicPetite: () => "CLICK THE SMALLEST",
    tapeLettre: (m) => `TYPE ${m.lettre}`,
    tapeAffichee: () => "TYPE THE LETTER SHOWN",
    tape: () => "TYPE",
    // L'ordre s'inverse : couleur puis forme.
    clicFormeCouleur: (m) => `CLICK THE ${m.couleur} ${m.forme}`,
    clicPasCouleur: (m) => `CLICK THE ONE THAT ISN'T ${m.couleur}`,
    clicPasForme: (m) => `CLICK THE ONE THAT ISN'T A ${m.forme}`,
    clicIntrus: () => "CLICK THE ODD ONE OUT",
    clicImmobile: () => "CLICK THE ONE THAT ISN'T MOVING",
    clicMobile: () => "CLICK THE ONE THAT'S MOVING",
    clicGauche: () => "CLICK THE LEFTMOST",
    clicDroite: () => "CLICK THE RIGHTMOST",
    clicHaut: () => "CLICK THE TOPMOST",
    clicBas: () => "CLICK THE BOTTOMMOST",
    clicPlusGrosCouleur: (m) => `CLICK THE BIGGEST ${m.couleur}`,
    clicPlusPetitCouleur: (m) => `CLICK THE SMALLEST ${m.couleur}`,
    /*
     * Les DEUX initiales sont acceptees par le moteur (`Want.keyAlt`), donc
     * cette formulation est honnete dans les deux langues : le joueur tape
     * l'initiale de la couleur telle QU'IL la nomme.
     */
    tapeInitiale: () => "TYPE THE COLOUR'S INITIAL",
    couleurPuis: (m) => `${m.couleur} THEN ${m.couleur2}`,
    deuxFoisCouleur: (m) => `CLICK THE ${m.couleur} TWICE`,
    deuxFoisForme: (m) => `CLICK THE ${m.forme} TWICE`,
    tiensCouleur: (m) => `HOLD THE ${m.couleur}`,
    tiensForme: (m) => `HOLD THE ${m.forme}`,
    glisseCouleur: (m) => `DRAG THE ${m.couleur} ONTO THE ${m.couleur2}`,
    clicSauf: (m) => `CLICK ANYWHERE BUT ON ${m.couleur}`,
    "coop.nettoyez": () => "CLEAR THE FIELD",
  },
};

/* ------------------------------------------------------------------ *
 * LES QUETES ET LES JETONS DE L'ECRAN SOLO
 *
 * Meme schema que les consignes : `game/quests.ts` fabrique un `label`
 * francais, et l'affichage recompose depuis l'IDENTIFIANT — le seul element
 * variable etant la cible. Le module de quetes reste donc pur et ignorant
 * des langues, et son `label` demeure le francais canonique.
 * ------------------------------------------------------------------ */

const QUETES: Record<Lang, Record<string, (cible: number) => string>> = {
  fr: {
    p_daily: () => "Termine le run du jour",
    p_runs3: () => "Joue 3 parties",
    p_rounds40: () => "Survis à 40 manches en tout",
    e_traps3: () => "Déjoue 3 pièges",
    e_traps6: () => "Déjoue 6 pièges",
    e_nokey: () => "Atteins la manche 8 sans toucher au clavier",
    e_rounds80: () => "Survis à 80 manches en tout",
    x_beat: (c) => `Dépasse ${c} manches dans une partie`,
  },
  en: {
    p_daily: () => "Finish today's run",
    p_runs3: () => "Play 3 games",
    p_rounds40: () => "Survive 40 rounds in total",
    e_traps3: () => "Dodge 3 traps",
    e_traps6: () => "Dodge 6 traps",
    e_nokey: () => "Reach round 8 without touching the keyboard",
    e_rounds80: () => "Survive 80 rounds in total",
    x_beat: (c) => `Beat ${c} rounds in a single game`,
  },
};

/**
 * Le libelle d'une quete. `secours` est le francais fabrique par le moteur de
 * quetes : une quete inconnue s'affiche donc, plutot que de disparaitre.
 */
export function libelleQuete(id: string, cible: number, secours: string): string {
  return QUETES[courante][id]?.(cible) ?? secours;
}

/** Les jetons de l'ecran SOLO — serie, pieces, regles, regle du jour. */
export const JETONS: Record<Lang, {
  serie: string;
  pieces: string;
  regles: string;
  jourFait: (jour: number) => string;
  aujourdhui: string;
}> = {
  fr: {
    serie: "SÉRIE",
    pieces: "PIÈCES",
    regles: "RÈGLES",
    jourFait: (j) => `JOUR ${j}`,
    aujourdhui: "AUJOURD'HUI",
  },
  en: {
    serie: "STREAK",
    pieces: "COINS",
    regles: "RULES",
    jourFait: (j) => `DAY ${j}`,
    aujourdhui: "TODAY",
  },
};

export const jetons = (): (typeof JETONS)[Lang] => JETONS[courante];

/**
 * LES ACCROCHES DU RUN DU JOUR.
 *
 * Deux par regle, alternees selon la parite du jour : elles taquinent la
 * regle sans la nommer. C'est de l'ecriture, pas de l'etiquette — donc une
 * table a part, et une traduction qui cherche l'effet plutot que le mot.
 *
 * Une regle absente de la table rend `teaserDefaut` : ajouter une regle ne
 * doit pas laisser une carte muette.
 */
const ACCROCHES: Record<Lang, Record<string, [string, string]>> = {
  fr: {
    sang: ["Aujourd'hui, évite de voir rouge.", "Le rouge ne te veut aucun bien."],
    pointe: ["Méfie-toi de ce qui pique.", "Les angles ne sont pas tes amis."],
    voyelle: ["Certaines lettres se retiennent.", "L'alphabet a ses interdits."],
    colosse: ["La taille, ça compte. En mal.", "Les gros ennuis sont les plus visibles."],
    gaucher: ["La gauche est un terrain miné.", "Un côté de l'écran te déteste."],
    seconde: ["La patience paie. Littéralement.", "Ne te précipite surtout pas."],
    eclair: ["Lis vite. Très vite.", "Ça passe, et c'est parti."],
    menteur: ["Ne crois pas tout ce que tu lis.", "Quelqu'un te raconte des histoires."],
    daltonien: ["Fais confiance aux mots, pas à tes yeux.", "Tes yeux vont te trahir."],
    jumeau: ["Une fois ne suffira pas.", "Tout est à refaire. Deux fois."],
    acceleration: ["Prends une inspiration avant.", "Ce sera plus court que prévu."],
    mainGauche: ["Prévois une main de libre.", "Tu vas tenir quelque chose."],
  },
  en: {
    sang: ["Today, avoid seeing red.", "Red means you no good."],
    pointe: ["Beware of anything sharp.", "Corners are not your friends."],
    voyelle: ["Some letters must be held back.", "The alphabet has its forbidden ones."],
    colosse: ["Size matters. Badly.", "Big trouble is the easiest to spot."],
    gaucher: ["The left side is a minefield.", "One half of the screen hates you."],
    seconde: ["Patience pays. Literally.", "Whatever you do, don't rush."],
    eclair: ["Read fast. Very fast.", "It flashes by, and it's gone."],
    menteur: ["Don't believe everything you read.", "Someone is telling you stories."],
    daltonien: ["Trust the words, not your eyes.", "Your eyes are about to betray you."],
    jumeau: ["Once will not be enough.", "Do it all again. Twice."],
    acceleration: ["Take a breath first.", "This will be shorter than you think."],
    mainGauche: ["Keep one hand free.", "You are going to hold something."],
  },
};

/** L'accroche du jour pour une règle, dans la langue courante. */
export function accrocheDuJour(ruleId: string, jour: number): string {
  const paire =
    debout && ruleId === "gaucher" ? GAUCHER_DEBOUT[courante].accroche : ACCROCHES[courante][ruleId];
  return paire ? paire[jour % 2 === 0 ? 0 : 1] : DYN[courante].teaserDefaut;
}


/* ------------------------------------------------------------------ *
 * LES BRIEFS DE RÈGLES
 *
 * Le NOM de la règle reste français — « LE SANG » est un nom, et son
 * identifiant est la clé du carnet, des performances et de la
 * comparabilité. Son BRIEF, lui, est une explication : c'est le seul
 * endroit où le joueur apprend ce que la règle lui interdit, et il le lit
 * juste avant de jouer. Le laisser en français revenait à annoncer une
 * contrainte que l'anglophone ne pouvait pas comprendre.
 *
 * Même schéma que les consignes et les quêtes : `engine/rules` garde le
 * français canonique, l'affichage recompose depuis l'IDENTIFIANT. Le
 * moteur reste pur et ignorant des langues.
 * ------------------------------------------------------------------ */
const BRIEFS: Record<Lang, Record<string, string>> = {
  fr: {
    sang: "Ne clique jamais sur du rouge. Une consigne finira par te le demander.",
    azur: "Ne clique jamais sur du bleu. Une consigne finira par te le demander.",
    roue: "Ne clique jamais un rond, même quand la consigne le désigne.",
    solitaire: "Ne clique jamais une forme seule de son genre à l'écran. Compte avant d'agir.",
    angles: "Ne clique jamais dans les quatre coins. Ils sont hachurés.",
    pointe: "Ne clique jamais un triangle, même quand la consigne le désigne.",
    voyelle: "Ne tape jamais A E I O U Y, même si la consigne l'exige.",
    colosse: "Ne clique jamais la plus grosse forme de l'écran. Repère-la avant d'agir.",
    gaucher: "Ne clique jamais la première colonne. Elle est hachurée, aucun clic n'y est toléré.",
    seconde: "N'agis jamais dans les 400 premières millisecondes d'une manche. Attends.",
    eclair: "La consigne ne s'affiche qu'un instant, puis disparaît. Lis vite, retiens.",
    menteur:
      "Une consigne sur cinq est fausse et se corrige après un instant. Ne te fie pas au premier regard.",
    daltonien:
      "Les noms de couleur s'affichent dans la mauvaise couleur. Lis le mot, ignore l'encre.",
    jumeau: "Chaque action doit être faite deux fois de suite. Une seule ne compte pas.",
    acceleration: "Tout va 30 % plus vite, du début à la fin. Aucun interdit, juste moins de temps.",
    mainGauche: "Garde ESPACE enfoncée du début à la fin. Joue avec la souris et l'autre main.",
  },
  en: {
    sang: "Never click on red. Sooner or later an order will ask you to.",
    azur: "Never click on blue. Sooner or later an order will ask you to.",
    roue: "Never click a circle, even when the order points at one.",
    solitaire: "Never click a shape that is alone of its kind on screen. Count before you act.",
    angles: "Never click the four corners. They are hatched.",
    pointe: "Never click a triangle, even when the order points at one.",
    voyelle: "Never type A E I O U Y, even if the order demands it.",
    colosse: "Never click the biggest shape on screen. Spot it before you act.",
    gaucher: "Never click the first column. It is hatched, and no click is tolerated there.",
    seconde: "Never act in the first 400 milliseconds of a round. Wait.",
    eclair: "The order shows for an instant, then vanishes. Read fast, remember.",
    menteur:
      "One order in five is false and corrects itself after a moment. Do not trust the first glance.",
    daltonien: "Colour names appear in the wrong colour. Read the word, ignore the ink.",
    jumeau: "Every action must be done twice in a row. Once does not count.",
    acceleration: "Everything runs 30 % faster, start to finish. Nothing forbidden, just less time.",
    mainGauche: "Hold SPACE down from start to finish. Play with the mouse and your other hand.",
  },
};

/* ------------------------------------------------------------------ *
 * LE NOM DES RÈGLES
 *
 * Il est resté français quand tout le reste a été traduit, et l'argument était
 * bon : c'est un NOM, et l'identifiant — jamais le nom — est la clé du carnet,
 * des performances et de la comparabilité. Vérifié avant de changer d'avis :
 * `rule.name` n'est utilisé nulle part ailleurs qu'à l'affichage, `calculeVersion`
 * ne hache que `id` / `minLevel` / `weight` / `touch`, le fil ne transporte que
 * `ruleId`, et toute la télémétrie envoie `rule.id`. Traduire le nom ne change
 * donc RIEN de mesurable.
 *
 * Ce qui a fait pencher : le nom est affiché en permanence dans le bandeau,
 * c'est l'ancre qu'on regarde pour se rappeler sa contrainte au milieu d'une
 * fenêtre de 760 ms. « LE COLOSSE » ne dit rien à un anglophone — pire, posé
 * au-dessus d'un brief anglais, il devient un intermédiaire à traduire dans sa
 * tête au pire moment. Les trois testeurs anglophones ont abandonné sur du
 * TEMPS, pas sur du vocabulaire.
 *
 * ⚠️ LES NOMS SONT CHOISIS POUR CE QUE LA RÈGLE FAIT, pas mot à mot.
 *
 *   · LA POINTE → THE SPIKE, et non « THE POINT » qui veut d'abord dire l'idée ;
 *   · L'ACCÉLÉRATION → THE RUSH, parce que « THE ACCELERATION » est un mot de
 *     manuel de physique, pas un nom qu'on lit en 200 ms ;
 *   · LA SECONDE → THE BEAT : la règle demande d'attendre un temps, et « THE
 *     SECOND » se lit comme un ordinal ;
 *   · LE DALTONIEN → THE INK. C'est le seul qui s'éloigne vraiment, et c'est
 *     délibéré : nommer une règle d'après un handicap passe mal en anglais, et
 *     ce que la règle oppose est justement le MOT à l'ENCRE.
 * ------------------------------------------------------------------ */

const NOMS: Record<Lang, Record<string, string>> = {
  fr: {
    sang: "LE SANG",
    azur: "L'AZUR",
    pointe: "LA POINTE",
    roue: "LA ROUE",
    solitaire: "LE SOLITAIRE",
    angles: "LES ANGLES",
    voyelle: "LA VOYELLE",
    colosse: "LE COLOSSE",
    gaucher: "LE GAUCHER",
    seconde: "LA SECONDE",
    eclair: "L'ÉCLAIR",
    menteur: "LE MENTEUR",
    daltonien: "LE DALTONIEN",
    jumeau: "LE JUMEAU",
    acceleration: "L'ACCÉLÉRATION",
    mainGauche: "LA MAIN GAUCHE",
  },
  en: {
    sang: "THE BLOOD",
    azur: "THE AZURE",
    pointe: "THE SPIKE",
    roue: "THE CIRCLE",
    solitaire: "THE LONER",
    angles: "THE CORNERS",
    voyelle: "THE VOWEL",
    colosse: "THE COLOSSUS",
    gaucher: "THE SOUTHPAW",
    seconde: "THE BEAT",
    eclair: "THE FLASH",
    menteur: "THE LIAR",
    daltonien: "THE INK",
    jumeau: "THE TWIN",
    acceleration: "THE RUSH",
    mainGauche: "THE OFF HAND",
  },
};

/**
 * Le nom d'une règle, dans la langue courante.
 *
 * Accepte aussi bien `"sang"` qu'une PILE d'escalade `"sang+pointe"` :
 * `combineRules` compose son identifiant avec des `+`, donc on découpe,
 * on traduit chaque part et on recompose. C'est ce qui évite d'avoir à faire
 * remonter la langue jusque dans le moteur, qui n'en connaît aucune.
 *
 * `secours` est le nom que porte le moteur : une règle absente de la table
 * s'affiche donc quand même, en français, plutôt que de laisser un bandeau
 * vide. Un bandeau vide, c'est un joueur qui joue sans savoir ce qui lui est
 * interdit — pire qu'un mot dans la mauvaise langue.
 */
export function nomDeRegle(id: string, secours: string): string {
  const parts = id.split("+");
  const traduits = parts.map((p) => NOMS[courante][p]);
  if (traduits.some((n) => n === undefined)) return secours;
  return traduits.join(" + ");
}

/** Exposée pour que les tests éprouvent les deux langues sans le DOM. */
export const NOMS_REGLES = NOMS;

/**
 * Le brief d'une règle, dans la langue courante.
 *
 * `secours` est le français que porte le moteur : une règle absente de la
 * table s'explique donc quand même, plutôt que de rester muette. Une règle
 * sans explication serait pire qu'une règle mal traduite.
 */
export function briefDeRegle(ruleId: string, secours: string): string {
  if (debout && ruleId === "gaucher") return GAUCHER_DEBOUT[courante].brief;
  return BRIEFS[courante][ruleId] ?? secours;
}

/** Exposé pour que les tests éprouvent les deux langues sans le DOM. */
export const BRIEFS_REGLES = BRIEFS;

/**
 * LE BRIEF COURT — celui du BANDEAU, pendant la partie.
 *
 * ⚠️ Ce n'est pas un doublon du brief long, c'est un autre objet.
 *
 * Le brief long s'explique : il est lu une fois, sur l'ecran d'annonce, ou
 * l'on a tout le temps et toute la largeur. Le bandeau, lui, est relu d'un
 * coup d'oeil au milieu d'une fenetre de 760 ms, sur une ligne de hauteur
 * FIGEE — figee parce que tout ce qui grossit le bandeau rogne le terrain, et
 * que la taille du champ est du gameplay (n°10).
 *
 * Mesure a 375 x 812 : la ligne dispose de 312 px a 10 px, soit environ 52
 * caracteres. Les briefs longs vont jusqu'a 76, et quatre d'entre eux
 * depassent meme en ne gardant que leur premiere phrase. Le bandeau affichait
 * donc « Ne clique jamais la premiere colonne. Elle est h… » — une phrase
 * coupee en plein mot, qui n'informe pas et signale surtout que l'ecran est
 * trop petit pour son contenu.
 *
 * La maquette telephone tranche autrement, et c'est la bonne reponse :
 * « Jamais de rouge · 2 pieges dejoues ». L'INTERDIT, en trois mots, plus ce
 * que le joueur a deja gagne. Le reste appartient a l'ecran d'annonce.
 *
 * Aucune de ces formes ne depasse 31 caracteres.
 */
const BRIEFS_COURTS: Record<Lang, Record<string, string>> = {
  fr: {
    sang: "Jamais de rouge",
    azur: "Jamais de bleu",
    pointe: "Jamais de triangle",
    roue: "Jamais de rond",
    solitaire: "Jamais une forme unique",
    angles: "Jamais dans les coins",
    voyelle: "Jamais A E I O U Y",
    colosse: "Jamais la plus grosse",
    gaucher: "Jamais la premiere colonne",
    seconde: "Rien avant 400 ms",
    eclair: "La consigne s'efface",
    menteur: "Une consigne sur cinq ment",
    daltonien: "Les noms mentent sur la couleur",
    jumeau: "Chaque geste deux fois",
    acceleration: "30 % plus vite",
    mainGauche: "Garde ESPACE enfoncee",
  },
  en: {
    sang: "Never red",
    azur: "Never blue",
    pointe: "Never a triangle",
    roue: "Never a circle",
    solitaire: "Never a lone shape",
    angles: "Never the corners",
    voyelle: "Never A E I O U Y",
    colosse: "Never the biggest",
    gaucher: "Never the first column",
    seconde: "Nothing before 400 ms",
    eclair: "The order vanishes",
    menteur: "One order in five lies",
    daltonien: "Colour names lie",
    jumeau: "Every move twice",
    acceleration: "30% faster",
    mainGauche: "Hold SPACE down",
  },
};

/**
 * Le brief COURT d'une regle, pour le bandeau de jeu.
 *
 * Retombe sur le brief long quand la regle n'est pas dans la table — une pile
 * d'escalade a un identifiant compose (« pointe+sang ») qui n'y figure pas, et
 * un bandeau muet serait pire qu'un bandeau trop long.
 */
export function briefCourtDeRegle(ruleId: string, secours: string): string {
  if (debout && ruleId === "gaucher") return GAUCHER_DEBOUT[courante].court;
  return BRIEFS_COURTS[courante][ruleId] ?? briefDeRegle(ruleId, secours);
}

/** Exposé pour que les tests éprouvent les deux langues sans le DOM. */
export const BRIEFS_COURTS_REGLES = BRIEFS_COURTS;

/* ------------------------------------------------------------------ *
 * L'ALLURE
 * ------------------------------------------------------------------ */

const ALLURES: Record<Lang, Record<string, string>> = {
  // Court, et pour une raison mesurée : la barre des allures est segmentée en
  // `flex: 1 1 0` avec un plancher `max-content`, donc le libellé le plus long
  // fixe la largeur de tous. Un quatrième segment resserre encore — vérifié à
  // 375 px que chacun garde ses 44 px tactiles.
  fr: { "2": "DÉBUT", "1.5": "DÉCOUVERTE", "1": "NORMAL", "0.8": "RAPIDE" },
  en: { "2": "GENTLE", "1.5": "DISCOVERY", "1": "NORMAL", "0.8": "FAST" },
};

/** Le nom d'une allure. `secours` est l'étiquette française du moteur. */
export function nomAllure(valeur: number, secours: string): string {
  return ALLURES[courante][String(valeur)] ?? secours;
}

/**
 * Compose une consigne dans la langue courante.
 *
 * `secours` est le texte français que le moteur produit déjà : une clé
 * inconnue rend ce texte plutôt qu'une chaîne vide. Une consigne muette au
 * milieu d'une partie serait pire qu'une consigne dans la mauvaise langue.
 */
export function composePhrase(
  phrase: { cle: string; couleur?: string; couleur2?: string; forme?: string; lettre?: string } | undefined,
  secours: string,
  lang: Lang = courante,
): string {
  if (!phrase) return secours;
  const cle = debout ? (PHRASE_DEBOUT[phrase.cle] ?? phrase.cle) : phrase.cle;
  const compo = PHRASES[lang][cle];
  if (!compo) return secours;
  const mots = MOTS[lang];
  return compo({
    couleur: phrase.couleur ? (mots.couleur[phrase.couleur] ?? phrase.couleur) : "",
    couleur2: phrase.couleur2 ? (mots.couleur[phrase.couleur2] ?? phrase.couleur2) : "",
    forme: phrase.forme ? (mots.forme[phrase.forme] ?? phrase.forme) : "",
    lettre: phrase.lettre ?? "",
  });
}

/** Le sous-titre d'une consigne, même principe. */
export function composeSous(cle: string | undefined, secours: string, lang: Lang = courante): string {
  if (!cle) return secours;
  return SOUS[lang][cle] ?? secours;
}

/* ------------------------------------------------------------------ *
 * LES MOTIFS DE MORT
 *
 * Ce que le joueur lit à l'instant précis où il perd. Le moteur les produit
 * en français canonique (`engine/motifs.ts`) et les fait voyager tels quels
 * sur le fil ; la traduction est un dernier geste d'affichage.
 *
 * La table est indexée par `MotifId`, donc TypeScript refuse d'en oublier un.
 * C'est la seule raison pour laquelle les phrases ont quitté les règles : une
 * table indexée par des chaînes libres aurait accepté l'oubli en silence, et
 * un motif non traduit ne se voit pas — il ne s'affiche qu'au moment où l'on
 * regarde ailleurs, c'est-à-dire sa propre mort.
 * ------------------------------------------------------------------ */

const MOTIFS_EN: Record<MotifId, string> = {
  temps: "TIME IS UP",
  sequence: "SEQUENCE UNFINISHED",
  piegeRate: "THE ORDER BROKE YOUR ONE RULE — YOU HAD TO DO NOTHING",
  rienFaire: "YOU HAD TO DO NOTHING",
  fallaitTaper: "YOU HAD TO TYPE, NOT CLICK",
  fallaitCliquer: "YOU HAD TO CLICK, NOT TYPE",
  mauvaiseTouche: "WRONG KEY",
  couleurInterdite: "YOU CLICKED THE FORBIDDEN COLOUR",
  leVide: "YOU CLICKED EMPTY SPACE",
  lacheTot: "YOU LET GO TOO SOON",
  lacheAilleurs: "YOU DROPPED IT IN THE WRONG PLACE",
  fallaitGlisser: "YOU HAD TO DRAG, NOT CLICK",
  mauvaiseForme: "WRONG SHAPE",
  mauvaiseCible: "WRONG TARGET",
  rouge: "YOU CLICKED ON RED",
  bleu: "YOU CLICKED ON BLUE",
  rond: "YOU CLICKED A CIRCLE",
  solitaire: "YOU CLICKED A ONE-OF-A-KIND COLOUR",
  angle: "YOU CLICKED A CORNER",
  triangle: "YOU CLICKED A TRIANGLE",
  voyelle: "YOU TYPED A VOWEL",
  plusGrosse: "YOU CLICKED THE BIGGEST SHAPE",
  zoneInterdite: "YOU CLICKED THE FORBIDDEN ZONE",
  tropTot: "YOU ACTED TOO SOON",
  espace: "YOU RELEASED SPACE",
  parti: "LEFT",
};

/**
 * Le français vers l'anglais, construit une fois au chargement du module.
 *
 * L'inverse d'une table constante : la clé de recherche est la phrase qui
 * voyage sur le fil, donc rien n'a besoin de changer côté protocole ni côté
 * serveur de salons.
 */
const MOTIFS_VERS_EN = new Map<string, string>(
  (Object.keys(MOTIFS) as MotifId[]).map((id) => [MOTIFS[id], MOTIFS_EN[id]]),
);

/**
 * Traduit un motif de mort. Un motif inconnu ressort TEL QUEL : un serveur
 * d'une version plus récente peut en nommer un que ce bundle ignore, et une
 * phrase étrangère vaut mieux qu'un champ vide au moment de comprendre
 * pourquoi on vient de mourir. Même doctrine que les clés `data-i18n`.
 */
export function traduisMotif(motif: string): string {
  if (courante === "fr") return motif;
  return MOTIFS_VERS_EN.get(motif) ?? motif;
}

/** Exposée pour que les tests éprouvent la table sans passer par le DOM. */
export const MOTIFS_ANGLAIS = MOTIFS_EN;

/* ------------------------------------------------------------------ *
 * LE STATUT D'UN SIÈGE
 *
 * `render/seat.ts` décide QUOI dire — c'est une priorité, et elle est testée
 * comme telle. Ici on ne fait que l'écrire.
 * ------------------------------------------------------------------ */

export function statutSiege(st: SeatStatus): string {
  switch (st.id) {
    case "horsLigne":
      return t("siegeHorsLigne");
    case "spectateur":
      return t("piedSpectateur");
    case "enMatch":
      return t("siegeEnMatch")(st.lives, st.score);
    case "hote":
      return t("siegeHote");
    case "debutant":
      return t("siegeDebutant");
    case "pret":
      return t("siegePret");
  }
}

/* ------------------------------------------------------------------ *
 * LES VITESSES DU SALON
 *
 * Cinq crans dans une barre segmentée : le libellé est ABRÉGÉ pour tenir, le
 * mot entier ne vit que dans l'`aria-label`. Les deux tables sont donc
 * distinctes, et ce n'est pas une redondance.
 * ------------------------------------------------------------------ */

const VITESSES: Record<Lang, Record<string, [court: string, entier: string]>> = {
  fr: {
    "1.7": ["DÉCOUV.", "Découverte"],
    "1.3": ["LENT", "Lent"],
    "1": ["NORMAL", "Normal"],
    "0.8": ["RAPIDE", "Rapide"],
    /*
     * ⚠️ BRUTAL, et pas « ÉCLAIR ».
     *
     * L'ÉCLAIR est le nom d'une RÈGLE du catalogue. Deux objets differents qui
     * portent le meme mot dans le meme ecran — la plaque annonce la regle, la
     * barre annonce la vitesse — se confondent exactement au moment ou l'on
     * n'a pas le temps de lire.
     */
    "0.65": ["BRUTAL", "Brutal"],
  },
  en: {
    "1.7": ["EASY", "Discovery"],
    "1.3": ["SLOW", "Slow"],
    "1": ["NORMAL", "Normal"],
    "0.8": ["FAST", "Fast"],
    "0.65": ["BRUTAL", "Brutal"],
  },
};

/** Le libellé court d'une vitesse de salon, ou le nombre s'il est inconnu. */
export function nomVitesse(valeur: number): string {
  return VITESSES[courante][String(valeur)]?.[0] ?? String(valeur);
}

/** Le mot entier, pour l'`aria-label`, qui n'a pas de contrainte de largeur. */
export function nomVitesseEntier(valeur: number): string {
  return VITESSES[courante][String(valeur)]?.[1] ?? String(valeur);
}

/* ------------------------------------------------------------------ *
 * LES ÉMOTES DU SALON
 *
 * Le fil ne transporte QUE l'index : les six libellés sont de l'interface,
 * donc chacun les lit dans sa langue sans que rien ne change côté serveur.
 * Deux joueurs de langues différentes voient le même bouton, au même rang, et
 * s'envoient donc bien la même chose.
 *
 * Le visuel est un glyphe commun, pas le mot : six libellés longs ne tiennent
 * pas une rangée de cibles `--tap` sur téléphone. `aria-label` garde le mot.
 * ------------------------------------------------------------------ */

const EMOTES: Record<Lang, readonly string[]> = {
  fr: ["SALUT", "BRAVO", "HA !", "AÏE", "VU VENIR", "NON…"],
  en: ["HI", "NICE", "HA!", "OUCH", "SAW IT", "NO…"],
};

/** Même glyphe FR et EN. Le fil reste un index 0–5. */
export const EMOTE_GLYPHE = ["👋", "👏", "😂", "💥", "👀", "🚫"] as const;

export const emotes = (): readonly string[] => EMOTES[courante];

export const emoteGlyphe = (k: number): string => EMOTE_GLYPHE[k] ?? "";
