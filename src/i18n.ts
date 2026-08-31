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
