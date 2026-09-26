import { colorHex } from "./scene";
import { briefCourtDeRegle, CHAINES, composePhrase, composeSous, langue, nomDeRegle, t } from "../i18n";
import type { OneRule, Round } from "../engine/types";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function livesDots(n: number, max: number): string {
  let html = "";
  const slots = Math.max(1, max);
  for (let i = 0; i < slots; i++) {
    html += `<i${i < n ? ' class="is-on"' : ""}></i>`;
  }
  return html;
}

/**
 * Le mot par defaut de la cellule de gauche du pied.
 *
 * ⚠️ Lu dans `CHAINES`, c'est-a-dire la table que `data-i18n` utilise deja pour
 * ce meme span. Le recopier dans le dictionnaire dynamique aurait donne deux
 * sources pour un seul mot, et le depot sait ou ca mene : la divergence ne se
 * voit que dans la langue qu'on ne relit jamais.
 */
const motManche = (): string => CHAINES[langue()]["hud.manche"] ?? "";

export class Hud {
  private band = $("band");
  private bandRule = $("bandRule");
  private bandBrief = $("bandBrief");
  private bandMeta = $("bandMeta");
  private instr = $("instr");
  private vies = $("bandVies");
  private viesLabel = $("bandViesLabel");
  private droite = $("bandVies").parentElement as HTMLElement;
  private sub = $("sub");
  private fill = $("timerFill");
  private fScore = $("fScore");
  private fBest = $("fBest");
  private fMode = $("fMode");
  private fMidLabel = $("fMidLabel");
  private fScoreLabel = $("fScoreLabel");
  private stamp = $("stamp");
  private stampText = $("stampText");

  private lastText = "";
  private lastRuleName = "";
  private lastLigne = "";
  private urgentShown = false;
  private announceTimer: ReturnType<typeof setTimeout> | null = null;
  private puces: string[] = [];

  /**
   * L'HORLOGE DE LECTURE — depuis quand cette manche est SOUS LES YEUX.
   *
   * ⚠️ Ce n'est PAS le temps de jeu, et c'est tout l'objet de ce champ.
   *
   * Deux effets de règle se règlent sur une durée d'affichage : L'ÉCLAIR cache
   * la consigne à `hideTextAtMs`, LE MENTEUR la corrige à `revealAtMs`. Les
   * deux lisaient `elapsedMs`, c'est-à-dire le temps de la MANCHE, qui n'est
   * pas le temps où le texte a été lisible :
   *
   *   · en multi, `elapsedMs = clock.now() − startAt` court depuis l'instant
   *     SERVEUR. Le temps de vol du message est donc déjà consommé quand la
   *     première image s'affiche. Avec `hideTextAtMs` à 320 ms dans les
   *     manches tardives, un joueur à 300 ms de latence ne voit RIEN — c'est le
   *     « L'ÉCLAIR ne fait littéralement pas apparaître les consignes »
   *     rapporté au playtest, et il frappe d'autant plus fort que la connexion
   *     est mauvaise, donc sur téléphone ;
   *   · en kill-cam, `syncFrame` passe `camRound.durationMs` comme temps
   *     écoulé — soit une valeur toujours supérieure à `hideTextAtMs`. La
   *     consigne du mort n'y était donc JAMAIS montrée, alors que la kill-cam
   *     n'existe que pour montrer ce qui vient de se passer.
   *
   * Le temps de lecture est LOCAL par nature, et il n'a pas à être synchronisé :
   * il ne décide de rien qui soit jugé — la décision n°3 (client et serveur
   * jugent la même action) porte sur `resolveAction`, qui garde `elapsedMs` et
   * n'est pas touché ici. Ce qui se joue ici est ce que l'œil a eu le temps de
   * prendre.
   */
  private lectureRound: Round | null = null;
  private lectureDebut = 0;

  /**
   * Les deux moitiés de la ligne du bandeau, tenues séparément.
   *
   * L'interdit vient de la règle et ne change qu'à la rotation ; le compteur de
   * pièges monte en cours de partie. Les garder à part évite de redemander la
   * traduction à chaque piège déjoué, et surtout évite qu'une des deux écrase
   * l'autre selon l'ordre des appels — c'est la faute que ce dépôt a déjà payée
   * partout où deux écritures visaient le même nœud.
   */
  private briefRegle = "";
  private briefPieges = 0;

  /**
   * LE COMPTEUR DE PIÈGES DÉJOUÉS, sur la ligne du bandeau.
   *
   * Repris de la maquette téléphone : « Jamais de rouge · 2 pièges déjoués ».
   * C'est la seule chose que le joueur gagne pendant une partie et qu'aucun
   * autre élément de l'écran de jeu ne dit — le pied porte la manche, le
   * record et le mode, jamais ce qu'on vient d'éviter.
   *
   * Muet à zéro : « 0 pièges déjoués » occuperait la ligne pour annoncer qu'il
   * ne s'est rien passé.
   */
  setPieges(n: number): void {
    if (n === this.briefPieges) return;
    this.briefPieges = n;
    this.peintBrief();
  }

  /** Recompose la ligne. Appelée par les deux seules choses qui la changent. */
  private peintBrief(): void {
    const p = this.briefPieges;
    this.bandBrief.textContent =
      p > 0 ? `${this.briefRegle} · ${t("hudPieges")(p)}` : this.briefRegle;
  }

  /**
   * Pose la règle unique — et l'ANNONCE quand elle change.
   *
   * Une règle qui change en silence est une règle qu'on découvre en mourant :
   * c'était la première cause de perte de vie à la rotation. Le bandeau joue
   * donc un balayage court à chaque nom nouveau. L'animation est relancée en
   * retirant puis reposant la classe — sans quoi deux rotations consécutives
   * n'en produiraient qu'une.
   */
  setRule(rule: OneRule | null, opts?: { vide?: boolean }): void {
    const nom = opts?.vide ? "" : rule ? nomDeRegle(rule.id, rule.name) : "—";
    const change = nom !== this.lastRuleName && !!rule;
    this.lastRuleName = nom;
    this.bandRule.textContent = nom;
    /*
     * Le brief du bandeau, traduit ici et pas ailleurs.
     *
     * C'est le seul brief que le joueur lit PENDANT la partie — les autres
     * sont sur des écrans d'annonce. Il était resté français sous un nom déjà
     * anglais : « THE SPIKE » au-dessus de « Ne clique jamais un triangle ».
     *
     * Une PILE d'escalade a un identifiant composé (« pointe+sang ») absent
     * de la table : elle retombe donc sur le `brief` qu'on lui passe, que
     * `regleAffichee()` a déjà traduit. Rien n'est traduit deux fois.
     */
    /*
     * LA FORME COURTE, et elle seule — voir `briefCourtDeRegle`.
     *
     * Le bandeau affichait le brief long, coupe a l'ellipse : « Ne clique
     * jamais la premiere colonne. Elle est h… » sur 375 px. Une phrase coupee
     * en plein mot n'informe pas. L'ecran d'annonce garde le brief entier, ou
     * il y a la place et le temps de le lire.
     */
    this.briefRegle = opts?.vide ? "" : rule ? briefCourtDeRegle(rule.id, rule.brief) : "";
    this.peintBrief();
    this.band.classList.toggle("is-armed", !!rule && !opts?.vide);
    if (change) {
      this.band.classList.remove("is-new");
      void this.band.offsetWidth;
      this.band.classList.add("is-new");
    } else if (!rule) {
      this.band.classList.remove("is-new");
    }
  }

  setMeta(text: string): void {
    const val = document.getElementById("bandMetaVal");
    const lab = document.getElementById("bandMetaLab");
    const chiffre = /^(\d+)\s+(.+)$/.exec(text);
    if (val && lab) {
      if (chiffre) {
        val.textContent = chiffre[1];
        lab.textContent = chiffre[2];
        this.bandMeta.classList.add("is-stat");
      } else {
        val.textContent = "";
        lab.textContent = text;
        this.bandMeta.classList.remove("is-stat");
      }
    } else {
      this.bandMeta.textContent = text;
    }
    this.bandMeta.classList.toggle("is-on", !!text);
  }

  /**
   * Puces d'interdit — escalade à deux règles et plus.
   *
   * Elles se fusionnent à `#sub` (une ligne, zéro pixel de terrain). Le
   * bandeau ne tient qu'un brief : deux interdits n'y rentrent pas.
   */
  setPuces(labels: string[]): void {
    this.puces = labels.filter(Boolean);
  }

  /**
   * LES VIES, DANS LE BANDEAU — contre la règle unique.
   *
   * Les deux décident ensemble d'une manche : combien il te reste, et ce que
   * tu n'as pas le droit de faire. Elles vivaient au pied, où l'on ne regarde
   * qu'entre deux manches.
   *
   * Des SYMBOLES et jamais un nombre : « VIES 2 » se lit, « ▪▪▫ » se voit —
   * et c'est la seule information qu'on consulte pendant une fenêtre de
   * 800 ms.
   *
   * @param lives `null` efface le bloc : le solo n'a pas de vies, et un
   * emplacement vide qui garde son étiquette se lit comme une donnée perdue.
   */
  setVies(lives: number | null, max = 3): void {
    if (lives === null) {
      this.vies.innerHTML = "";
      this.viesLabel.textContent = "";
      this.droite.classList.remove("is-last");
      return;
    }
    const n = Math.max(0, lives);
    this.vies.innerHTML = livesDots(n, max);
    this.viesLabel.textContent = n === 1 ? t("hudDerniereVie") : t("piedVies");
    this.droite.classList.toggle("is-last", n === 1);
  }

  setFooter(score: number, best: number, mode: string, midLabel = t("piedRecord")): void {
    // Le coop a pu poser SCORE ici : on rend son mot a la cellule, sinon il
    // resterait sur l'ecran d'apres. Meme discipline que le libelle du bouton
    // COMMENCER apres un rebours — une cellule au repos ne garde jamais le mot
    // d'un autre mode.
    this.fScoreLabel.textContent = motManche();
    this.fScore.textContent = String(score);
    this.fBest.className = "foot__value";
    this.fBest.textContent = String(best);
    this.fMidLabel.textContent = midLabel;
    this.fMode.textContent = mode;
  }

  /**
   * LE DÉPASSEMENT DE RECORD, EN DIRECT.
   *
   * La case du milieu affichait « TON RECORD · 23 » pendant qu'on venait de
   * faire 24 : le seul instant du run qui vaut d'être vécu passait sans un
   * mot, et on l'apprenait sur l'écran de fin, une fois mort.
   *
   * ⚠️ Elle ne prend pas un pixel de plus. Le pied garde ses trois cellules et
   * ses hauteurs — la taille du champ EST du gameplay (n°10) — c'est la même
   * case qui change de mot. Rien à mesurer parce que rien ne bouge.
   */
  setFooterRecord(score: number, avance: number, mode: string): void {
    this.fScoreLabel.textContent = motManche();
    this.fScore.textContent = String(score);
    this.fBest.className = "foot__value foot__value--record";
    this.fBest.textContent = `+${avance}`;
    this.fMidLabel.textContent = t("piedDepasse");
    this.fMode.textContent = mode;
  }

  /**
   * Pied du multijoueur — les VIES sont MONTÉES dans le bandeau.
   *
   * Elles occupaient la case du milieu, c'est-à-dire l'endroit qu'on regarde
   * entre deux manches et pas pendant. Le pied garde le score et le mode ; la
   * case du milieu redevient ce qu'elle dit être.
   */
  /**
   * @param gauche Ce que compte la cellule de GAUCHE. Absent = « MANCHE »,
   * vrai partout sauf en coop, ou le chiffre est le score du groupe.
   */
  setFooterLives(
    score: number,
    lives: number,
    max: number,
    mode: string,
    gauche = motManche(),
  ): void {
    this.fScoreLabel.textContent = gauche;
    this.fScore.textContent = String(score);
    this.fMidLabel.textContent = t("piedVies");
    this.fBest.className = "foot__value";
    this.fBest.textContent = String(Math.max(0, lives));
    this.fMode.textContent = mode;
    this.setVies(lives, max);
  }

  clearRound(): void {
    this.instr.innerHTML = "&nbsp;";
    this.instr.className = "";
    this.instr.style.color = "";
    this.sub.textContent = "";
    this.lastLigne = "";
    this.fill.style.transform = "scaleX(0)";
    this.fill.classList.remove("is-urgent");
    this.urgentShown = false;
    this.lastText = "";
    this.lectureRound = null;
    this.lectureDebut = 0;
  }

  /**
   * Rafraîchit consigne et minuteur. Appelé à chaque frame parce que trois
   * règles uniques déforment l'affichage dans le temps : LE MENTEUR corrige
   * son texte en cours de manche, L'ÉCLAIR le fait disparaître, et la barre
   * doit rester calée sur l'horloge réelle plutôt que sur une transition CSS.
   */
  updateRound(round: Round, elapsedMs: number, ratio: number): void {
    /*
     * La consigne est COMPOSEE dans la langue du joueur a partir de sa forme
     * structuree ; `round.text` (francais) ne sert que de secours si une cle
     * manquait. Une consigne muette en pleine manche serait pire qu'une
     * consigne dans la mauvaise langue.
     *
     * ⚠️ LE MENTEUR (`falseText`) n'est PAS compose : c'est une phrase
     * empruntee a une autre consigne, deja fabriquee, et la remplacer par sa
     * version composee demanderait de transporter la phrase du mensonge. Elle
     * reste donc en francais — a corriger quand on traduira le mensonge, et
     * c'est le seul reste connu de l'ecran de jeu.
     */
    /*
     * L'horloge de LECTURE repart à chaque manche nouvelle — voir le champ.
     *
     * La manche est identifiée par sa RÉFÉRENCE et non par son contenu : le
     * multi reconstruit un objet neuf à chaque `rebuildViewRound`, le solo à
     * chaque `nextRound`, et deux manches successives peuvent parfaitement
     * porter le même texte. Comparer les textes ferait repartir l'horloge une
     * fois sur deux, ce qui est pire qu'un bug franc.
     */
    if (round !== this.lectureRound) {
      this.lectureRound = round;
      this.lectureDebut = performance.now();
    }
    const msLus = performance.now() - this.lectureDebut;

    let text = composePhrase(round.phrase, round.text);
    if (round.falseText && round.revealAtMs !== undefined && msLus < round.revealAtMs) {
      text = round.falseText;
    }
    const hidden = round.hideTextAtMs !== undefined && msLus > round.hideTextAtMs;

    const shown = hidden ? "" : (round.glyph ?? text);
    if (shown !== this.lastText) {
      this.instr.textContent = shown || "\u00a0";
      this.lastText = shown;
    }
    this.instr.className = round.glyph && !hidden ? "is-glyph" : "";
    this.instr.style.color = round.inkColor ? colorHex(round.inkColor) : "";

    /*
     * LA LIGNE SOUS LA CONSIGNE : la sous-consigne, PUIS le nombre de gestes.
     *
     * `windowForSteps` ajoute déjà 280 ms par geste supplémentaire — la
     * fenêtre en tenait compte, mais rien ne le DISAIT. Sous LE JUMEAU, qui
     * double chaque action, on découvrait qu'il en fallait deux en ratant le
     * premier.
     *
     * ⚠️ Les deux partagent UNE ligne, jamais deux. Mesuré : un second bloc
     * coûtait 21 px de terrain (616 → 595), et la taille du champ est du
     * gameplay.
     */
    const subText = hidden ? "" : round.glyph ? text : composeSous(round.sousPhrase, round.sub ?? "");
    const n = round.steps.length;
    // MAINTENIR ne se compte pas, il se TIENT : la ligne dit quand lâcher —
    // la jauge autour de la pièce passe au vert (`scene.drawGeste`).
    const compte = round.steps.some((s) => s.kind === "hold")
      ? t("hudTiens")
      : n > 1
        ? t("hudGestes")(n)
        : t("hudGeste");
    const critique = document.getElementById("app")?.classList.contains("is-critical");
    const vite = !hidden && !!critique && n > 0 ? t("hudVite") : "";
    const puces = !hidden && this.puces.length > 1 ? this.puces : [];
    /*
     * ⚠️ LA CLÉ PORTE CE QUI EST PEINT, pas ce qui est calculé. Elle contenait
     * `compte` même quand la manche n'a aucun geste — le texte n'était retiré
     * qu'au moment de peindre. Après une manche à un geste, « NE FAIS RIEN »
     * gardait donc « 1 GESTE » (vu en jouant le niveau 1-1 au téléphone) : une
     * consigne d'agir sur la seule manche où il faut s'abstenir.
     */
    const comptePeint = n > 0 ? compte : "";
    const ligne = hidden ? "" : [subText, comptePeint, puces.join("|"), vite].join("\0");
    if (ligne !== this.lastLigne) {
      this.lastLigne = ligne;
      this.peintSub(hidden, subText, comptePeint, vite, puces);
    }

    /*
     * La barre est le seul élément écrit à chaque image : elle ne change donc
     * QUE par `transform`, qui ne coûte ni mise en page ni repeinture. La
     * couleur passait auparavant par `style.background` à chaque frame — une
     * écriture de style soixante fois par seconde pour un changement qui
     * n'arrive qu'une fois par manche. C'est une classe, désormais.
     */
    this.fill.style.transform = `scaleX(${1 - ratio})`;
    const urgent = ratio > 0.72;
    if (urgent !== this.urgentShown) {
      this.urgentShown = urgent;
      this.fill.classList.toggle("is-urgent", urgent);
    }
  }

  /**
   * Une ligne sous la consigne, et une seule.
   *
   * Les puces d'escalade sont des chips, pas un second bloc : un rang de plus
   * coûtait 21 px de terrain. `nowrap` tient tout sur la hauteur déjà prévue.
   */
  private peintSub(
    hidden: boolean,
    subText: string,
    compte: string,
    vite: string,
    puces: string[],
  ): void {
    this.sub.replaceChildren();
    if (hidden) return;
    const sep = () => {
      if (this.sub.childNodes.length) this.sub.append(" · ");
    };
    if (subText) {
      sep();
      this.sub.append(subText);
    }
    if (compte) {
      sep();
      this.sub.append(compte);
    }
    for (const p of puces) {
      sep();
      const chip = document.createElement("i");
      chip.className = "puce";
      chip.textContent = p;
      this.sub.append(chip);
    }
    if (vite) {
      sep();
      const urgent = document.createElement("i");
      urgent.className = "sub__vite";
      urgent.textContent = vite;
      this.sub.append(urgent);
    }
  }

  showStamp(label: string): void {
    this.stampText.textContent = label;
    this.stamp.classList.remove("is-on");
    void this.stamp.offsetWidth;
    this.stamp.classList.add("is-on");
  }

  hideStamp(): void {
    this.stamp.classList.remove("is-on");
  }

  /**
   * Annonce brève d'un changement de régime.
   *
   * Un run sans jalon est un run sans texture : le score monte mais rien ne
   * dit qu'on progresse. Trois mots, une seconde, et le joueur sait qu'il
   * vient de franchir quelque chose.
   */
  announce(label: string): void {
    if (!label) return;
    const el = document.getElementById("tier");
    if (!el) return;
    el.textContent = label;
    el.classList.add("is-on");
    if (this.announceTimer) clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => el.classList.remove("is-on"), 1400);
  }
}
