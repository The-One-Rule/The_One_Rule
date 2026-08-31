/**
 * Langue de l'accueil.
 *
 * Le jeu, lui, ne change pas de langue : les règles s'appellent LE SANG,
 * les consignes restent celles du moteur, et le canvas n'est pas touché.
 * Seul l'habillage de l'accueil (accroche, faces de la faille, chrome de
 * la barre) suit le choix. C'est un réglage d'appareil, pas un agrégat
 * de compte : il ne voyage pas.
 */

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
};

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
    piegeDejoue: "TRAP AVOIDED",
    tenu: "HELD",
    faitMaj: "DONE",
    cptNom: "NAME",
    cptSansNom: "NO NAME",
    cptCarnet: "RULE BOOK",
    cptRegles: (n, tot) => `${n} / ${tot} RULES`,
    cptSerie: "STREAK",
    cptJours: (n) => `${n} DAY${n > 1 ? "S" : ""}`,
    cptRecordEntrainement: "TRAINING BEST",
    cptManches: (n) => `${n} ROUNDS`,
    cptRunsEnregistres: "DAILY RUNS SAVED",
    cptMeilleurRun: "BEST DAILY RUN",
    dailyFait: "Done for today.",
    dailyRevient: (n) => `${n} ROUNDS · COME BACK TOMORROW`,
    dailyUnEssai: "ONE ATTEMPT ONLY",
    escaladeEtat: "HOW FAR DO YOU HOLD?",
    trainingNeuf: "START HERE · NOTHING TO LOSE",
    trainingRecord: (n) => `BEST · ${n} ROUNDS`,
    teaserDefaut: "A rule is waiting for you.",
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

  poseHtml(doc.getElementById("ledeHome"), t.ledeHtml);
  poseHtml(doc.getElementById("homeFineprint"), t.fineprintHtml);
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
