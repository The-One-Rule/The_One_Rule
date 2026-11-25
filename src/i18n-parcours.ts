/**
 * Les textes du PARCOURS, de la BOUTIQUE et de l'écran de fin de niveau.
 *
 * À part de `i18n.ts` (3000 lignes) pour une raison simple : tout ce qui est
 * neuf s'écrit ici, typé, et `Record<Lang, TextesParcours>` refuse de
 * compiler si une langue oublie une clé. Les chaînes STATIQUES (celles des
 * attributs `data-i18n`) sont versées dans la table commune par `i18n.ts`.
 */
import type { Lang } from "./i18n.js";
import type { NiveauId } from "./game/parcours.js";

export const STATIQUE_PARCOURS: Record<Lang, Record<string, string>> = {
  fr: {
    "bienvenue.jouer": "JOUER",
    "tuto.consigne": "LA CONSIGNE",
    "tuto.fallait": "IL FALLAIT",
    "tuto.rejouer": "REJOUER LA MANCHE",
    "acc.multiEyebrow": "MULTI · JUSQU'À 10",
    "acc.multiTitre": "Joue avec tes amis",
    "acc.creer": "CRÉER UN SALON",
    "acc.code": "CODE",
    "acc.codeAria": "Code du salon",
    "acc.rejoindre": "REJOINDRE",
    "acc.rapide": "PARTIE RAPIDE",
    "acc.sansCode": "sans code",
    "acc.jourTitre": "La même partie pour tout le monde",
    "acc.parcours": "PARCOURS SOLO",
    "invite.titre": "C'est encore mieux à plusieurs.",
    "invite.quoi": "Un code de 4 lettres, jusqu'à 10 amis, chacun sa règle.",
    "invite.creer": "CRÉER UN SALON",
    "invite.seul": "CONTINUER SEUL",
    "invite.modes": "Voir tous les modes",
    "salon.qr": "Dans la même pièce ? Scannez.",
    "salon.qrAria": "QR code du salon",
    "annonce.titre": "Échauffement terminé",
    "annonce.quoi": "À partir de maintenant, le cadre se vide plus vite.",
    "annonce.suite": "TOUCHE POUR CONTINUER",
    "vitrine.regle": "TA RÈGLE",
    "vitrine.jamais": "JAMAIS DE ROUGE",
    "vitrine.titre": "Parfois, obéir est l'erreur.",
    "vitrine.code": "J'ai un code de salon",
    "prof.libre": "LIBRE",
    "prof.libreNom": "Sans fin, à ton rythme",
    "prof.libreNote": "CHOISIS UNE CARTE · BATS TON RECORD",
    "prof.escalade": "LA PILE",
    "prof.escaladeNom": "Une règle. Puis deux.",
    "parcours.titre": "LE PARCOURS",
    "nav.parcours": "PARCOURS",
    "nav.boutique": "BOUTIQUE",
    "niveau.pieces": "PIÈCES",
    "niveau.pieges": "PIÈGES DÉJOUÉS",
    "niveau.manches": "MANCHES",
    "niveau.parcours": "PARCOURS",
    "boutique.titre": "BOUTIQUE",
    "boutique.chapo": "Des plateaux : ils habillent toute ta partie. Jamais la règle.",
    "boutique.retour": "RETOUR",
  },
  en: {
    "bienvenue.jouer": "PLAY",
    "tuto.consigne": "THE ORDER",
    "tuto.fallait": "YOU HAD TO",
    "tuto.rejouer": "PLAY THE ROUND AGAIN",
    "acc.multiEyebrow": "MULTIPLAYER · UP TO 10",
    "acc.multiTitre": "Play with your friends",
    "acc.creer": "CREATE A ROOM",
    "acc.code": "CODE",
    "acc.codeAria": "Room code",
    "acc.rejoindre": "JOIN",
    "acc.rapide": "QUICK GAME",
    "acc.sansCode": "no code",
    "acc.jourTitre": "The same game for everyone",
    "acc.parcours": "SOLO PATH",
    "invite.titre": "It's even better together.",
    "invite.quoi": "A 4-letter code, up to 10 friends, each with their own rule.",
    "invite.creer": "CREATE A ROOM",
    "invite.seul": "CONTINUE ALONE",
    "invite.modes": "See every mode",
    "salon.qr": "Same room? Scan.",
    "salon.qrAria": "Room QR code",
    "annonce.titre": "Warm-up over",
    "annonce.quoi": "From now on, the frame empties faster.",
    "annonce.suite": "TAP TO CONTINUE",
    "vitrine.regle": "YOUR RULE",
    "vitrine.jamais": "NEVER RED",
    "vitrine.titre": "Sometimes, obeying is the mistake.",
    "vitrine.code": "I have a room code",
    "prof.libre": "FREE PLAY",
    "prof.libreNom": "Endless, your pace",
    "prof.libreNote": "PICK A CARD · BEAT YOUR RECORD",
    "prof.escalade": "THE STACK",
    "prof.escaladeNom": "One rule. Then two.",
    "parcours.titre": "THE PATH",
    "nav.parcours": "PATH",
    "nav.boutique": "SHOP",
    "niveau.pieces": "COINS",
    "niveau.pieges": "TRAPS DODGED",
    "niveau.manches": "ROUNDS",
    "niveau.parcours": "PATH",
    "boutique.titre": "SHOP",
    "boutique.chapo": "Boards: they dress your whole game. Never the rule.",
    "boutique.retour": "BACK",
  },
};

export interface TextesParcours {
  chapitre: (n: number) => string;
  niveau: Record<NiveauId, string>;
  /** Ce que le niveau demande, en une ligne. */
  objectif: (manches: number, vies: number) => string;
  /** Ce que le niveau ajoute par rapport au précédent. */
  apport: Record<NiveauId, string>;
  jouerNiveau: (chapitre: number, niveau: number) => string;
  commencer: string;
  eyebrowHero: (chapitre: number, niveau: number, nom: string) => string;
  parfait: string;
  parfaitNote: string;
  verrouChapitre: (n: number) => string;
  inconnue: string;
  horsAppareil: string;
  etoilesSur: (n: number, max: number) => string;
  bossBattu: string;
  // Écran de fin de niveau
  reussi: string;
  rate: string;
  rateNote: (manches: number, cible: number) => string;
  reussiNote: (vies: number) => string;
  suivant: (chapitre: number, niveau: number) => string;
  chapitreSuivant: string;
  reessayer: string;
  retourParcours: string;
  carteGagnee: string;
  carteGagneeNote: string;
  chapitreBoucle: string;
  chapitreBoucleNote: (nom: string) => string;
  nouvellesPieces: (n: number) => string;
  // En jeu
  vieperdue: string;
  piedNiveau: (chapitre: number, niveau: number) => string;
  piedCible: string;
  // Verrous des modes
  verrouMode: (chapitre: number) => string;
  /** L'étiquette d'un mode qui vient de s'ouvrir. */
  nouveau: string;
  /** La ligne qui compte les chapitres qu'on ne montre pas encore. */
  chapitresRestants: (n: number) => string;
  /** Au-dessus des modes de l'accueil. */
  modesTitre: string;
  // Boutique
  skinNom: Record<string, string>;
  skinDesc: Record<string, string>;
  acheter: (prix: number) => string;
  porte: string;
  porter: string;
  manque: (n: number) => string;
  achete: (nom: string) => string;
  // Brief d'un niveau
  briefEyebrow: (chapitre: number, niveau: number) => string;
  briefObjectif: (manches: number, vies: number) => string;
  briefPiegeAnnonce: string;
  // Fiche d'une carte
  ficheChapitre: (chapitre: number, etoiles: number) => string;
  ficheProchain: (niveau: number, nom: string) => string;
  ficheBoucle: string;
  ficheParfait: string;
  ficheJouer: (chapitre: number, niveau: number) => string;
  ficheLibre: string;
  ficheHorsParcours: string;
}

const NIVEAUX_FR: Record<NiveauId, string> = {
  premiers: "PREMIERS PAS",
  piege: "LE PIÈGE",
  sansFilet: "SANS FILET",
  tempo: "TEMPO",
  boss: "LE BOSS",
};

const NIVEAUX_EN: Record<NiveauId, string> = {
  premiers: "FIRST STEPS",
  piege: "THE TRAP",
  sansFilet: "NO NET",
  tempo: "TEMPO",
  boss: "THE BOSS",
};

export const PARCOURS: Record<Lang, TextesParcours> = {
  fr: {
    chapitre: (n) => `CHAPITRE ${n}`,
    niveau: NIVEAUX_FR,
    objectif: (m, v) => `${m} manches · ${v} vies`,
    apport: {
      premiers: "Lent, sans piège forcé. Apprends ta règle.",
      piege: "Le piège arrive — et le jeu te le signale.",
      sansFilet: "Plus de signal. À toi de le voir.",
      tempo: "La vitesse du vrai jeu.",
      boss: "Plus long, plus de pièges. Bats-le pour ouvrir la suite.",
    },
    jouerNiveau: (c, n) => `JOUER · ${c}-${n}`,
    commencer: "COMMENCER",
    eyebrowHero: (c, n, nom) => `CHAPITRE ${c} · NIVEAU ${n} — ${nom}`,
    parfait: "PARCOURS PARFAIT",
    parfaitNote: "Toutes les étoiles. Le défi du jour t'attend.",
    verrouChapitre: (n) => `Bats le boss du chapitre ${n}`,
    inconnue: "???",
    horsAppareil: "Se joue au clavier",
    etoilesSur: (n, max) => `${n} / ${max}`,
    bossBattu: "MAÎTRISÉE",
    reussi: "NIVEAU RÉUSSI !",
    rate: "PAS CETTE FOIS",
    rateNote: (m, c) => `${m} manche${m > 1 ? "s" : ""} sur ${c}. Chaque essai t'apprend la règle.`,
    reussiNote: (v) =>
      v >= 3 ? "Sans perdre une vie. Parfait." : v === 2 ? "Une vie perdue. Encore une étoile à aller chercher." : "De justesse. Rejoue pour plus d'étoiles.",
    suivant: (c, n) => `NIVEAU ${c}-${n} ▸`,
    chapitreSuivant: "CHAPITRE SUIVANT ▸",
    reessayer: "RÉESSAYER",
    retourParcours: "PARCOURS",
    carteGagnee: "NOUVELLE CARTE",
    carteGagneeNote: "Elle rejoint ta collection.",
    chapitreBoucle: "CHAPITRE BOUCLÉ",
    chapitreBoucleNote: (nom) => `${nom} est maîtrisée. Un nouveau chapitre s'ouvre.`,
    nouvellesPieces: (n) => `+${n}`,
    vieperdue: "−1 VIE",
    piedNiveau: (c, n) => `NIVEAU ${c}-${n}`,
    piedCible: "OBJECTIF",
    verrouMode: (c) => `APRÈS LE CHAPITRE ${c}`,
    nouveau: "NOUVEAU",
    chapitresRestants: (n) => (n === 1 ? "+ 1 chapitre à découvrir" : `+ ${n} chapitres à découvrir`),
    modesTitre: "AUTRES FAÇONS DE JOUER",
    skinNom: {
      sticker: "STICKER",
      neon: "NÉON",
      bonbon: "BONBON",
      pixel: "PIXEL",
      craie: "CRAIE",
    },
    skinDesc: {
      sticker: "Le style maison. Contour franc, ombre nette.",
      neon: "Des tubes qui brillent dans le noir.",
      bonbon: "Brillant, sucré, un peu gourmand.",
      pixel: "Tout en carrés, comme en 1989.",
      craie: "Dessiné à la main sur un tableau noir.",
    },
    acheter: (p) => `ACHETER · ${p}`,
    porte: "PORTÉ",
    porter: "PORTER",
    manque: (n) => `ENCORE ${n}`,
    achete: (nom) => `${nom} DÉBLOQUÉ`,
    briefEyebrow: (c, n) => `CHAPITRE ${c} · NIVEAU ${n}`,
    briefObjectif: (m, v) => `Tiens ${m} manches. Tu as ${v} vies.`,
    briefPiegeAnnonce: "Quand une consigne est un piège, le jeu l'affiche. Profites-en.",
    ficheChapitre: (c, e) => `CHAPITRE ${c} · ★ ${e} / 15`,
    ficheProchain: (n, nom) => `Prochain : niveau ${n} — ${nom}.`,
    ficheBoucle: "Boss battu : cette règle est maîtrisée. Reste à aller chercher toutes les étoiles.",
    ficheParfait: "Quinze étoiles sur quinze. Rien à ajouter.",
    ficheJouer: (c, n) => `JOUER LE CHAPITRE · ${c}-${n}`,
    ficheLibre: "ENTRAÎNEMENT LIBRE",
    ficheHorsParcours: "Ce chapitre n'est pas encore ouvert dans ton parcours.",
  },
  en: {
    chapitre: (n) => `CHAPTER ${n}`,
    niveau: NIVEAUX_EN,
    objectif: (m, v) => `${m} rounds · ${v} lives`,
    apport: {
      premiers: "Slow, no forced traps. Learn your rule.",
      piege: "The trap arrives — and the game flags it.",
      sansFilet: "No more flag. Spot it yourself.",
      tempo: "Real game speed.",
      boss: "Longer, more traps. Beat it to open what's next.",
    },
    jouerNiveau: (c, n) => `PLAY · ${c}-${n}`,
    commencer: "START",
    eyebrowHero: (c, n, nom) => `CHAPTER ${c} · LEVEL ${n} — ${nom}`,
    parfait: "PERFECT PATH",
    parfaitNote: "Every star. The daily run awaits.",
    verrouChapitre: (n) => `Beat chapter ${n}'s boss`,
    inconnue: "???",
    horsAppareil: "Keyboard only",
    etoilesSur: (n, max) => `${n} / ${max}`,
    bossBattu: "MASTERED",
    reussi: "LEVEL CLEARED!",
    rate: "NOT THIS TIME",
    rateNote: (m, c) => `${m} round${m === 1 ? "" : "s"} out of ${c}. Every try teaches you the rule.`,
    reussiNote: (v) =>
      v >= 3 ? "Without losing a life. Perfect." : v === 2 ? "One life lost. One more star to grab." : "Just made it. Replay for more stars.",
    suivant: (c, n) => `LEVEL ${c}-${n} ▸`,
    chapitreSuivant: "NEXT CHAPTER ▸",
    reessayer: "TRY AGAIN",
    retourParcours: "PATH",
    carteGagnee: "NEW CARD",
    carteGagneeNote: "It joins your collection.",
    chapitreBoucle: "CHAPTER COMPLETE",
    chapitreBoucleNote: (nom) => `${nom} is mastered. A new chapter opens.`,
    nouvellesPieces: (n) => `+${n}`,
    vieperdue: "−1 LIFE",
    piedNiveau: (c, n) => `LEVEL ${c}-${n}`,
    piedCible: "GOAL",
    verrouMode: (c) => `AFTER CHAPTER ${c}`,
    nouveau: "NEW",
    chapitresRestants: (n) => (n === 1 ? "+ 1 chapter to discover" : `+ ${n} chapters to discover`),
    modesTitre: "OTHER WAYS TO PLAY",
    skinNom: {
      sticker: "STICKER",
      neon: "NEON",
      bonbon: "CANDY",
      pixel: "PIXEL",
      craie: "CHALK",
    },
    skinDesc: {
      sticker: "The house style. Bold outline, crisp shadow.",
      neon: "Tubes glowing in the dark.",
      bonbon: "Shiny, sweet, a little greedy.",
      pixel: "All squares, like it's 1989.",
      craie: "Hand-drawn on a blackboard.",
    },
    acheter: (p) => `BUY · ${p}`,
    porte: "EQUIPPED",
    porter: "EQUIP",
    manque: (n) => `${n} MORE`,
    achete: (nom) => `${nom} UNLOCKED`,
    briefEyebrow: (c, n) => `CHAPTER ${c} · LEVEL ${n}`,
    briefObjectif: (m, v) => `Hold ${m} rounds. You have ${v} lives.`,
    briefPiegeAnnonce: "When an order is a trap, the game shows it. Use it.",
    ficheChapitre: (c, e) => `CHAPTER ${c} · ★ ${e} / 15`,
    ficheProchain: (n, nom) => `Next: level ${n} — ${nom}.`,
    ficheBoucle: "Boss beaten: this rule is mastered. Every star is still up for grabs.",
    ficheParfait: "Fifteen stars out of fifteen. Nothing left to add.",
    ficheJouer: (c, n) => `PLAY THE CHAPTER · ${c}-${n}`,
    ficheLibre: "FREE PLAY",
    ficheHorsParcours: "This chapter isn't open in your path yet.",
  },
};

/**
 * Les textes que le CODE écrit (tutoriel, vitrine), jamais posés par
 * `data-i18n`. À part du dictionnaire statique : celui-ci exige que chaque clé
 * soit posée dans le document, et c'est un bon filet — ici, c'est le TYPE qui
 * garantit qu'aucune clé ne manque dans une langue.
 */
export type CleEcrite =
  | "tuto.craque"
  | "tuto.titreInterdit"
  | "tuto.titreAilleurs"
  | "tuto.titreTemps"
  | "tuto.fallaitRien"
  | "tuto.fallaitBleu"
  | "tuto.bien"
  | "tuto.piegeDejoue"
  | "tuto.slogan"
  | "tuto.echauffement"
  | "vitrine.bleu"
  | "vitrine.rouge"
  | "vitrine.bien"
  | "vitrine.piege"
  | "acc.jourEyebrow"
  | "acc.jourJouer1"
  | "acc.jourJouerN"
  | "acc.jourFini"
  | "acc.jourEpuise"
  | "acc.code4"
  | "invite.eyebrow"
  | "preuve.rien"
  | "preuve.plusVite"
  | "preuve.sansTaRegle"
  | "craque.un"
  | "craque.elim"

export const ECRITS: Record<Lang, Record<CleEcrite, string>> = {
  fr: {
    "tuto.craque": "CRAQUÉ · MANCHE",
    "tuto.titreInterdit": "Ta règle interdit le rouge.",
    "tuto.titreAilleurs": "Pas celle-là.",
    "tuto.titreTemps": "Le cadre s'est vidé.",
    "tuto.fallaitRien": "Ne rien faire : la consigne était un piège.",
    "tuto.fallaitBleu": "Toucher le bleu, avant que le cadre se vide.",
    "tuto.bien": "BIEN",
    "tuto.piegeDejoue": "PIÈGE DÉJOUÉ",
    "tuto.slogan": "Parfois, obéir est l'erreur.",
    "tuto.echauffement": "ÉCHAUFFEMENT",
    "vitrine.bleu": "CLIQUE LE BLEU",
    "vitrine.rouge": "CLIQUE LE ROUGE",
    "vitrine.bien": "BIEN",
    "vitrine.piege": "PIÈGE DÉJOUÉ",
    "acc.jourEyebrow": "RUN DU JOUR",
    "acc.jourJouer1": "JOUER · DERNIER ESSAI",
    "acc.jourJouerN": "JOUER · {n} ESSAIS",
    "acc.jourFini": "BOUCLÉ · VOIR LE JOUR",
    "acc.jourEpuise": "REVIENS DEMAIN",
    "acc.code4": "Un code de salon fait 4 lettres.",
    "invite.eyebrow": "PREMIÈRE PARTIE · MANCHE {n}",
    "preuve.rien": "Ne rien faire : la consigne était un piège.",
    "preuve.plusVite": "{c}, plus vite.",
    "preuve.sansTaRegle": "Obéir, sans enfreindre ta règle : {r}.",
    "craque.un": "{n} A CRAQUÉ",
    "craque.elim": "{n} EST ÉLIMINÉ",
  },
  en: {
    "tuto.craque": "CRACKED · ROUND",
    "tuto.titreInterdit": "Your rule forbids red.",
    "tuto.titreAilleurs": "Not that one.",
    "tuto.titreTemps": "The frame ran out.",
    "tuto.fallaitRien": "Do nothing: the order was a trap.",
    "tuto.fallaitBleu": "Touch the blue, before the frame runs out.",
    "tuto.bien": "NICE",
    "tuto.piegeDejoue": "TRAP DODGED",
    "tuto.slogan": "Sometimes, obeying is the mistake.",
    "tuto.echauffement": "WARM-UP",
    "vitrine.bleu": "CLICK THE BLUE",
    "vitrine.rouge": "CLICK THE RED",
    "vitrine.bien": "NICE",
    "vitrine.piege": "TRAP DODGED",
    "acc.jourEyebrow": "DAILY RUN",
    "acc.jourJouer1": "PLAY · LAST TRY",
    "acc.jourJouerN": "PLAY · {n} TRIES",
    "acc.jourFini": "DONE · SEE TODAY",
    "acc.jourEpuise": "COME BACK TOMORROW",
    "acc.code4": "A room code is 4 letters.",
    "invite.eyebrow": "FIRST GAME · ROUND {n}",
    "preuve.rien": "Do nothing: the order was a trap.",
    "preuve.plusVite": "{c}, faster.",
    "preuve.sansTaRegle": "Obey without breaking your rule: {r}.",
    "craque.un": "{n} CRACKED",
    "craque.elim": "{n} IS OUT",
  },
};
