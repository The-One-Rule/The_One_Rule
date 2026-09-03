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
  menu: string;
  reglages: string;
  compte: string;
  monCompte: string;
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
    ledeHtml: "Une <b>règle unique</b>. Parfois, obéir est la faute.",
    failleLabel: "Modes de jeu",
    soloDesc: "Run du jour, escalade, entraînement.",
    multiDesc: "Ton code, tes potes, une règle chacun.",
    fineprintHtml:
      "SOURIS ET CLAVIER · <b>R</b> POUR RELANCER · <b>ÉCHAP</b> POUR LE MENU",
    menu: "MENU",
    reglages: "RÉGLAGES",
    compte: "COMPTE",
    monCompte: "MON COMPTE",
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
    ledeHtml: "One <b>unique rule</b>. Sometimes, obeying is the mistake.",
    failleLabel: "Game modes",
    soloDesc: "Daily run, climb, training.",
    multiDesc: "Your code, your friends, one rule each.",
    fineprintHtml:
      "MOUSE AND KEYBOARD · <b>R</b> TO RESTART · <b>ESC</b> FOR THE MENU",
    menu: "MENU",
    reglages: "SETTINGS",
    compte: "ACCOUNT",
    monCompte: "MY ACCOUNT",
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
    "home.play": "JOUER",
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
    "solo.titre": "TU JOUES CONTRE TOI",
    "carte.daily.titre": "RUN DU JOUR",
    "carte.escalade.titre": "ESCALADE",
    "carte.escalade.desc": "Une règle. Puis deux. Puis trois.",
    "carte.training.titre": "ENTRAÎNEMENT",
    "carte.training.desc": "Un petit échauffement ?",
    "carte.ranked.titre": "CLASSÉ",
    "carte.ranked.desc": "Quelqu'un de ton niveau. La même partie que lui.",
    "carnet.titre": "CARNET DES RÈGLES",
    "carnet.palmares": "TON PALMARÈS",
    "brief.go": "COMMENCER",
    "brief.training": "D'ABORD S'ENTRAÎNER",
    "brief.allure": "ALLURE",
    "commun.retour": "RETOUR",
    "commun.menu": "MENU",
    "fin.quetes": "QUÊTES DU JOUR",
    "fin.enregistrer": "ENREGISTRER",
    "fin.rejouer": "REJOUER · R",
    "fin.partager": "PARTAGER",
    "fin.defier": "DÉFIER UN AMI",
    "fin.titres": "TITRES DU MATCH",
    "fin.rejouerMulti": "REJOUER",
    "fin.quitter": "QUITTER",
    "reglages.titre": "RÉGLAGES",
    "reglages.sous": "CE QUE TU PRÉFÈRES",
    "compte.eyebrow": "COMPTE",
    "compte.deconnexion": "SE DÉCONNECTER",
    "compte.supprimer": "SUPPRIMER LE COMPTE",
    "multi.eyebrow": "MULTIJOUEUR",
    "multi.signe": "TON SIGNE",
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
    "multi.changerSigne": "CHANGER DE SIGNE",
    "ph.nom": "TON NOM",
    "ph.code": "CODE",
    "ph.chat": "TAPE ICI POUR PARLER",
    "aria.nom": "Ton nom",
    "aria.signe": "Ton signe",
    "aria.chat": "Message",
    "aria.emotes": "Réactions",
    "aria.regles": "Règles à travailler",
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
    "salon.vitesse": "VITESSE",
    "salon.vies": "VIES",
    "salon.rotation": "ROTATION",
    "salon.equipes": "ÉQUIPES",
    "salon.lancer": "LANCER LA PARTIE",
    "salon.nom": "CHOISIR TON NOM",
    "salon.quitter": "QUITTER LE SALON",
  },
  en: {
    "home.play": "PLAY",
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
    "solo.titre": "YOU AGAINST YOURSELF",
    "carte.daily.titre": "DAILY RUN",
    "carte.escalade.titre": "CLIMB",
    "carte.escalade.desc": "One rule. Then two. Then three.",
    "carte.training.titre": "TRAINING",
    "carte.training.desc": "A quick warm-up?",
    "carte.ranked.titre": "RANKED",
    "carte.ranked.desc": "Someone at your level. The very same run.",
    "carnet.titre": "RULE BOOK",
    "carnet.palmares": "YOUR RECORD",
    "brief.go": "START",
    "brief.training": "TRAIN FIRST",
    "brief.allure": "PACE",
    "commun.retour": "BACK",
    "commun.menu": "MENU",
    "fin.quetes": "TODAY'S QUESTS",
    "fin.enregistrer": "SAVE THIS",
    "fin.rejouer": "PLAY AGAIN · R",
    "fin.partager": "SHARE",
    "fin.defier": "CHALLENGE A FRIEND",
    "fin.titres": "MATCH TITLES",
    "fin.rejouerMulti": "PLAY AGAIN",
    "fin.quitter": "LEAVE",
    "reglages.titre": "SETTINGS",
    "reglages.sous": "WHAT YOU PREFER",
    "compte.eyebrow": "ACCOUNT",
    "compte.deconnexion": "SIGN OUT",
    "compte.supprimer": "DELETE ACCOUNT",
    "multi.eyebrow": "MULTIPLAYER",
    "multi.signe": "YOUR SIGN",
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
    "multi.changerSigne": "CHANGE SIGN",
    "ph.nom": "YOUR NAME",
    "ph.code": "CODE",
    "ph.chat": "TYPE HERE TO TALK",
    "aria.nom": "Your name",
    "aria.signe": "Your sign",
    "aria.chat": "Message",
    "aria.emotes": "Reactions",
    "aria.regles": "Rules to train",
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
    "salon.vitesse": "SPEED",
    "salon.vies": "LIVES",
    "salon.rotation": "ROTATION",
    "salon.equipes": "TEAMS",
    "salon.lancer": "START THE MATCH",
    "salon.nom": "PICK YOUR NAME",
    "salon.quitter": "LEAVE THE ROOM",
  },
};

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
  briefEscalade: (palier: number) => string;
  briefDailyLignes: (manches: number) => string;
  briefEscaladeLignes: (max: number) => string;
  briefTiens: string;
  goCommencer: string;
  goUnSeulEssai: string;
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
  cptNom: string;
  cptSansNom: string;
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
  allureRef: string;
  alluurePlus: (ref: string) => string;
  allureMoins: (ref: string) => string;
  /* --- le salon, ce qu'il dit de lui-meme --- */
  salonJoueurs: (n: number, max: number) => string;
  salonSeulHint: string;
  reglagesVerrouilles: string;
  reglagesTuDecides: string;
  reglagesInvite: string;
  optJamais: string;
  optDuos: string;
  optChacun: string;
  ariaVitesse: (nom: string) => string;
  ariaVies: (n: number) => string;
  ariaRotationJamais: string;
  ariaRotation: (n: number) => string;
  ariaDuos: string;
  ariaChacun: string;
  ariaSigne: (n: number, total: number) => string;
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
  rangEme: (n: number) => string;
  manchesN: (n: number) => string;
  aRegarde: string;
  /* --- ce que le serveur de salons refuse --- */
  errDeconnecte: string;
  errSalonInconnu: string;
  errSalonComplet: (max: number) => string;
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
    vainqueur: "VAINQUEUR",
    finDuMatch: "FIN DU MATCH",
    modeDaily: (j) => `RUN DU JOUR · #${j}`,
    modeEscalade: "ESCALADE",
    modeTraining: "ENTRAÎNEMENT",
    piedDaily: (j) => `JOUR #${j}`,
    piedSur: "SUR",
    piedRegles: "RÈGLES",
    piedRecord: "RECORD",
    briefEscalade: (p) =>
      `Tu commences avec une règle. Toutes les ${p} manches, une autre s'ajoute — et tu les tiens toutes. Jusqu'où ?`,
    briefDailyLignes: (m) => `${m} MANCHES · UN SEUL ESSAI PAR JOUR`,
    briefEscaladeLignes: (m) => `${m} RÈGLES AU MAXIMUM · LE SCORE EST CE QUE TU TIENS`,
    briefTiens: "APPUIE SUR ESPACE ET GARDE-LA ENFONCÉE",
    goCommencer: "COMMENCER",
    goUnSeulEssai: "COMMENCER · UN SEUL ESSAI",
    piedVies: "VIES",
    piedSpectateur: "SPECTATEUR",
    piedMulti: "MULTI",
    echauffement: "ÉCHAUFFEMENT — TU NE PEUX PAS MOURIR",
    echauffementFini: "À TOI DE JOUER",
    piegeDejoue: "PIÈGE DÉJOUÉ",
    tenu: "TENU",
    faitMaj: "FAIT",
    cptNom: "NOM",
    cptSansNom: "SANS NOM",
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
    dailyUnEssai: "UN SEUL ESSAI",
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
    pickPourMaitriser: (r) => `POUR LA MAÎTRISER : ${r}`,
    carnetProgres: (v, t, k) => `${v} / ${t} RENCONTRÉES · ${k} MAÎTRISÉE${k > 1 ? "S" : ""}`,
    carnetJamais: "JAMAIS RENCONTRÉE",
    carnetMeilleur: (b) => `MEILLEUR ${b}`,
    finReglesTenues: (n, sc) => `RÈGLE${n > 1 ? "S" : ""} TENUE${n > 1 ? "S" : ""} · ${sc} MANCHES`,
    finSansFaute: "MANCHES · SANS FAUTE",
    finSurTotal: (t) => `MANCHES SUR ${t}`,
    finManchesTenues: "MANCHES TENUES",
    allureRef: "ALLURE DE RÉFÉRENCE · C'EST ELLE QUI INSCRIT LE RECORD",
    alluurePlus: (r) => `PLUS DE TEMPS POUR APPRENDRE · LE RECORD NE S'INSCRIT QU'EN ${r}`,
    allureMoins: (r) => `MOINS DE TEMPS QUE LA RÉFÉRENCE · LE RECORD NE S'INSCRIT QU'EN ${r}`,
    salonJoueurs: (n, max) => `${n} / ${max} JOUEURS`,
    salonSeulHint: "LA PARTIE SE LANCE DÈS QUE QUELQU'UN ARRIVE",
    reglagesVerrouilles: "RÉGLAGES VERROUILLÉS PENDANT UN MATCH",
    reglagesTuDecides: "TU DÉCIDES POUR TOUT LE SALON · TOUCHE UNE OPTION POUR LA CHANGER",
    reglagesInvite: "SEUL CELUI QUI A CRÉÉ LE SALON PEUT CHANGER CES RÉGLAGES",
    optJamais: "JAMAIS",
    optDuos: "DUOS",
    optChacun: "CHACUN",
    ariaVitesse: (nom) => `Vitesse ${nom}`,
    ariaVies: (n) => `${n} vie${n > 1 ? "s" : ""}`,
    ariaRotationJamais: "Les règles ne tournent jamais",
    ariaRotation: (n) => `Rotation toutes les ${n} manches`,
    ariaDuos: "Duos : deux joueurs par équipe, une réserve de vies commune",
    ariaChacun: "Chacun pour soi",
    ariaSigne: (n, total) => `Signe ${n} sur ${total}`,
    ariaCouper: (qui) => `Couper ${qui}`,
    ariaReactiver: (qui) => `Réactiver ${qui}`,
    ariaExclure: (qui) => `Exclure ${qui}`,
    dicteLeCode: "DICTE-LE : IL EST JUSTE AU-DESSUS",
    siegeHorsLigne: "HORS LIGNE",
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
    rangEme: (n) => `${n}${n === 1 ? "ᵉʳ" : "ᵉ"}`,
    // Le singulier compte : « 1 MANCHES » se remarque, et un joueur éliminé à la
    // première manche est le cas le plus fréquent de tout l'écran de fin.
    manchesN: (n) => `${n} MANCHE${n > 1 ? "S" : ""}`,
    aRegarde: "A REGARDÉ",
    errDeconnecte: "DÉCONNECTÉ — REJOINS POUR REPRENDRE TA PLACE",
    errSalonInconnu: "AUCUN SALON À CE CODE — VÉRIFIE LES 4 CARACTÈRES, OU CRÉE LE TIEN",
    errSalonComplet: (max) => `SALON COMPLET (${max} JOUEURS) — CRÉE-EN UN AUTRE`,
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
    defiGagne: (sc, cible) => `GAGNÉ · ${sc} CONTRE ${cible}`,
    defiEgalite: (cible) => `ÉGALITÉ · ${cible} PARTOUT`,
    defiPerdu: (sc, cible) => `PERDU · ${sc} CONTRE ${cible}`,
    finJours: (n) => `${n} JOUR${n > 1 ? "S" : ""}`,
    goMatchSuivant: "MATCH SUIVANT · R",
    goRevanche: "REVANCHE · R",
    goReviensDemain: "REVIENS DEMAIN",
    goRejouer: "REJOUER · R",
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
    vainqueur: "WINNER",
    finDuMatch: "MATCH OVER",
    modeDaily: (j) => `DAILY RUN · #${j}`,
    modeEscalade: "CLIMB",
    modeTraining: "TRAINING",
    piedDaily: (j) => `DAY #${j}`,
    piedSur: "OF",
    piedRegles: "RULES",
    piedRecord: "BEST",
    briefEscalade: (p) =>
      `You start with one rule. Every ${p} rounds another one is added — and you hold them all. How far?`,
    briefDailyLignes: (m) => `${m} ROUNDS · ONE ATTEMPT PER DAY`,
    briefEscaladeLignes: (m) => `${m} RULES AT MOST · YOUR SCORE IS WHAT YOU HOLD`,
    briefTiens: "PRESS SPACE AND HOLD IT DOWN",
    goCommencer: "START",
    goUnSeulEssai: "START · ONE ATTEMPT ONLY",
    piedVies: "LIVES",
    piedSpectateur: "SPECTATING",
    piedMulti: "MULTI",
    echauffement: "WARM-UP — YOU CANNOT DIE",
    echauffementFini: "NOW IT COUNTS",
    piegeDejoue: "TRAP AVOIDED",
    tenu: "HELD",
    faitMaj: "DONE",
    cptNom: "NAME",
    cptSansNom: "NO NAME",
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
    dailyUnEssai: "ONE ATTEMPT ONLY",
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
    pickPourMaitriser: (r) => `TO MASTER IT: ${r}`,
    carnetProgres: (v, t, k) => `${v} / ${t} MET · ${k} MASTERED`,
    carnetJamais: "NEVER MET",
    carnetMeilleur: (b) => `BEST ${b}`,
    finReglesTenues: (n, sc) =>
      `${n === 1 ? "RULE" : "RULES"} HELD · ${sc} ROUND${sc === 1 ? "" : "S"}`,
    finSansFaute: "ROUNDS · FLAWLESS",
    finSurTotal: (t) => `ROUNDS OUT OF ${t}`,
    finManchesTenues: "ROUNDS HELD",
    allureRef: "REFERENCE PACE · THIS IS THE ONE THAT SETS YOUR BEST",
    alluurePlus: (r) => `MORE TIME TO LEARN · ONLY ${r} SETS YOUR BEST`,
    allureMoins: (r) => `LESS TIME THAN THE REFERENCE · ONLY ${r} SETS YOUR BEST`,
    salonJoueurs: (n, max) => `${n} / ${max} PLAYERS`,
    salonSeulHint: "THE MATCH STARTS AS SOON AS SOMEONE ARRIVES",
    reglagesVerrouilles: "SETTINGS LOCKED DURING A MATCH",
    reglagesTuDecides: "YOU DECIDE FOR THE WHOLE ROOM · TAP AN OPTION TO CHANGE IT",
    reglagesInvite: "ONLY WHOEVER CREATED THE ROOM CAN CHANGE THESE SETTINGS",
    optJamais: "NEVER",
    optDuos: "DUOS",
    optChacun: "EACH",
    ariaVitesse: (nom) => `Speed ${nom}`,
    ariaVies: (n) => `${n} live${n === 1 ? "" : "s"}`,
    ariaRotationJamais: "Rules never rotate",
    ariaRotation: (n) => `Rotation every ${n} rounds`,
    ariaDuos: "Duos: two players per team, one shared pool of lives",
    ariaChacun: "Every player for themselves",
    ariaSigne: (n, total) => `Sign ${n} of ${total}`,
    ariaCouper: (qui) => `Mute ${qui}`,
    ariaReactiver: (qui) => `Unmute ${qui}`,
    ariaExclure: (qui) => `Kick ${qui}`,
    dicteLeCode: "SAY IT OUT LOUD: IT IS RIGHT ABOVE",
    siegeHorsLigne: "OFFLINE",
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
    rangEme: (n) => `${n}${rangSuffixe(n)}`,
    manchesN: (n) => `${n} ROUND${n === 1 ? "" : "S"}`,
    aRegarde: "WATCHED",
    errDeconnecte: "DISCONNECTED — REJOIN TO TAKE YOUR SEAT BACK",
    errSalonInconnu: "NO ROOM WITH THAT CODE — CHECK THE 4 CHARACTERS, OR CREATE YOUR OWN",
    errSalonComplet: (max) => `ROOM FULL (${max} PLAYERS) — CREATE ANOTHER ONE`,
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
    defiGagne: (sc, cible) => `WON · ${sc} AGAINST ${cible}`,
    defiEgalite: (cible) => `DRAW · ${cible} EACH`,
    defiPerdu: (sc, cible) => `LOST · ${sc} AGAINST ${cible}`,
    finJours: (n) => `${n} DAY${n === 1 ? "" : "S"}`,
    goMatchSuivant: "NEXT MATCH · R",
    goRevanche: "REMATCH · R",
    goReviensDemain: "COME BACK TOMORROW",
    goRejouer: "PLAY AGAIN · R",
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

export function poseLangue(l: Lang): void {
  courante = l;
}

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
export function appliqueLangue(
  doc: Document,
  lang: Lang,
  extra?: { compte?: string },
): void {
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
  poseHtml(doc.getElementById("reglagesFineprint"), t.fineprintHtml);
  poseTexte(doc.getElementById("failleSoloDesc"), t.soloDesc);
  poseTexte(doc.getElementById("failleMultiDesc"), t.multiDesc);

  const faille = doc.getElementById("faille");
  if (faille) faille.setAttribute("aria-label", t.failleLabel);

  const langBox = doc.getElementById("lang");
  if (langBox) langBox.setAttribute("aria-label", t.langAria);

  poseTexte(doc.getElementById("btnTopMenu"), t.menu);
  poseTexte(doc.getElementById("btnTopReglages"), t.reglages);
  poseTexte(doc.getElementById("btnTopCompte"), extra?.compte ?? t.compte);

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

export function libelleCompte(lang: Lang, pseudo: string | null): string {
  const t = TEXTES[lang];
  if (pseudo === null) return t.compte;
  return pseudo || t.monCompte;
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
    clicPlusGrosCouleur: (m) => `CLIQUE LE PLUS GROS ${m.couleur}`,
    clicPlusPetitCouleur: (m) => `CLIQUE LE PLUS PETIT ${m.couleur}`,
    tapeInitiale: () => "TAPE L'INITIALE DE LA COULEUR",
    couleurPuis: (m) => `${m.couleur} PUIS ${m.couleur2}`,
    clicSauf: (m) => `CLIQUE PARTOUT SAUF SUR DU ${m.couleur}`,
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
    clicPlusGrosCouleur: (m) => `CLICK THE BIGGEST ${m.couleur}`,
    clicPlusPetitCouleur: (m) => `CLICK THE SMALLEST ${m.couleur}`,
    /*
     * Les DEUX initiales sont acceptees par le moteur (`Want.keyAlt`), donc
     * cette formulation est honnete dans les deux langues : le joueur tape
     * l'initiale de la couleur telle QU'IL la nomme.
     */
    tapeInitiale: () => "TYPE THE COLOUR'S INITIAL",
    couleurPuis: (m) => `${m.couleur} THEN ${m.couleur2}`,
    clicSauf: (m) => `CLICK ANYWHERE BUT ON ${m.couleur}`,
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
  const paire = ACCROCHES[courante][ruleId];
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
  return BRIEFS[courante][ruleId] ?? secours;
}

/** Exposé pour que les tests éprouvent les deux langues sans le DOM. */
export const BRIEFS_REGLES = BRIEFS;

/* ------------------------------------------------------------------ *
 * L'ALLURE
 * ------------------------------------------------------------------ */

const ALLURES: Record<Lang, Record<string, string>> = {
  fr: { "1.5": "DÉCOUVERTE", "1": "NORMAL", "0.8": "RAPIDE" },
  en: { "1.5": "DISCOVERY", "1": "NORMAL", "0.8": "FAST" },
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
  const compo = PHRASES[lang][phrase.cle];
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
    "0.8": ["VITE", "Vite"],
    "0.65": ["ÉCLAIR", "Éclair"],
  },
  en: {
    "1.7": ["EASY", "Discovery"],
    "1.3": ["SLOW", "Slow"],
    "1": ["NORMAL", "Normal"],
    "0.8": ["FAST", "Fast"],
    "0.65": ["FLASH", "Flash"],
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
 * ------------------------------------------------------------------ */

const EMOTES: Record<Lang, readonly string[]> = {
  fr: ["SALUT", "BRAVO", "HA !", "AÏE", "VU VENIR", "NON…"],
  en: ["HI", "NICE", "HA!", "OUCH", "SAW IT", "NO…"],
};

export const emotes = (): readonly string[] => EMOTES[courante];
