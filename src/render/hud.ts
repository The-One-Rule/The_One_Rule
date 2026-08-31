import { colorHex } from "./scene";
import { composePhrase, composeSous, t } from "../i18n";
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

export class Hud {
  private band = $("band");
  private bandRule = $("bandRule");
  private bandBrief = $("bandBrief");
  private bandMeta = $("bandMeta");
  private instr = $("instr");
  private sub = $("sub");
  private fill = $("timerFill");
  private fScore = $("fScore");
  private fBest = $("fBest");
  private fMode = $("fMode");
  private fMidLabel = $("fMidLabel");
  private stamp = $("stamp");
  private stampText = $("stampText");

  private lastText = "";
  private lastRuleName = "";
  private urgentShown = false;
  private announceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Pose la règle unique — et l'ANNONCE quand elle change.
   *
   * Une règle qui change en silence est une règle qu'on découvre en mourant :
   * c'était la première cause de perte de vie à la rotation. Le bandeau joue
   * donc un balayage court à chaque nom nouveau. L'animation est relancée en
   * retirant puis reposant la classe — sans quoi deux rotations consécutives
   * n'en produiraient qu'une.
   */
  setRule(rule: OneRule | null): void {
    const nom = rule ? rule.name : "—";
    const change = nom !== this.lastRuleName && !!rule;
    this.lastRuleName = nom;
    this.bandRule.textContent = nom;
    this.bandBrief.textContent = rule ? rule.brief : "";
    this.band.classList.toggle("is-armed", !!rule);
    if (change) {
      this.band.classList.remove("is-new");
      void this.band.offsetWidth;
      this.band.classList.add("is-new");
    } else if (!rule) {
      this.band.classList.remove("is-new");
    }
  }

  setMeta(text: string): void {
    this.bandMeta.textContent = text;
  }

  setFooter(score: number, best: number, mode: string, midLabel = t("piedRecord")): void {
    this.fScore.textContent = String(score);
    this.fBest.className = "foot__value";
    this.fBest.textContent = String(best);
    this.fMidLabel.textContent = midLabel;
    this.fMode.textContent = mode;
  }

  /**
   * Pied de page du multijoueur. Les vies sont des symboles, jamais un nombre :
   * « VIES 2 » se lit, « ▪▪▫ » se voit — et c'est la seule information qu'on
   * consulte en pleine manche.
   */
  setFooterLives(score: number, lives: number, max: number, mode: string): void {
    this.fScore.textContent = String(score);
    this.fMidLabel.textContent = t("piedVies");
    this.fBest.className = "foot__value lifedots";
    this.fBest.innerHTML = livesDots(lives, max);
    this.fMode.textContent = mode;
    // La dernière vie se signale : c'est l'information qui change une décision.
    this.fBest.classList.toggle("is-last", lives === 1);
  }

  clearRound(): void {
    this.instr.innerHTML = "&nbsp;";
    this.instr.className = "";
    this.instr.style.color = "";
    this.sub.textContent = "";
    this.fill.style.transform = "scaleX(0)";
    this.fill.classList.remove("is-urgent");
    this.urgentShown = false;
    this.lastText = "";
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
    let text = composePhrase(round.phrase, round.text);
    if (round.falseText && round.revealAtMs !== undefined && elapsedMs < round.revealAtMs) {
      text = round.falseText;
    }
    const hidden = round.hideTextAtMs !== undefined && elapsedMs > round.hideTextAtMs;

    const shown = hidden ? "" : (round.glyph ?? text);
    if (shown !== this.lastText) {
      this.instr.textContent = shown || "\u00a0";
      this.lastText = shown;
    }
    this.instr.className = round.glyph && !hidden ? "is-glyph" : "";
    this.instr.style.color = round.inkColor ? colorHex(round.inkColor) : "";

    const subText = hidden ? "" : round.glyph ? text : composeSous(round.sousPhrase, round.sub ?? "");
    if (this.sub.textContent !== subText) this.sub.textContent = subText;

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
