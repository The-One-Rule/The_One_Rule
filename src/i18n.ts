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
