import { colorHex } from "./scene";
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
  private fMid = $("fMid");
  private stamp = $("stamp");
  private stampText = $("stampText");

  private lastText = "";
  private announceTimer: ReturnType<typeof setTimeout> | null = null;

  setRule(rule: OneRule | null): void {
    this.bandRule.textContent = rule ? rule.name : "—";
    this.bandBrief.textContent = rule ? rule.brief : "";
    this.band.classList.toggle("is-armed", !!rule);
  }

  setMeta(text: string): void {
    this.bandMeta.textContent = text;
  }

  setFooter(score: number, best: number, mode: string, midLabel = "RECORD"): void {
    this.fScore.textContent = String(score);
    this.fBest.className = "";
    this.fBest.textContent = String(best);
    this.fMid.childNodes[0]!.nodeValue = midLabel + " ";
    this.fMode.textContent = mode;
  }

  /**
   * Pied de page du multijoueur. Les vies sont des symboles, jamais un nombre :
   * « VIES 2 » se lit, « ▪▪▫ » se voit — et c'est la seule information qu'on
   * consulte en pleine manche.
   */
  setFooterLives(score: number, lives: number, max: number, mode: string): void {
    this.fScore.textContent = String(score);
    this.fMid.childNodes[0]!.nodeValue = "VIES ";
    this.fBest.className = "lifedots";
    this.fBest.innerHTML = livesDots(lives, max);
    this.fMode.textContent = mode;
  }

  clearRound(): void {
    this.instr.innerHTML = "&nbsp;";
    this.instr.className = "";
    this.instr.style.color = "";
    this.sub.textContent = "";
    this.fill.style.transform = "scaleX(0)";
    this.lastText = "";
  }

  /**
   * Rafraîchit consigne et minuteur. Appelé à chaque frame parce que trois
   * règles uniques déforment l'affichage dans le temps : LE MENTEUR corrige
   * son texte en cours de manche, L'ÉCLAIR le fait disparaître, et la barre
   * doit rester calée sur l'horloge réelle plutôt que sur une transition CSS.
   */
  updateRound(round: Round, elapsedMs: number, ratio: number): void {
    let text = round.text;
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

    const subText = hidden ? "" : round.glyph ? text : (round.sub ?? "");
    if (this.sub.textContent !== subText) this.sub.textContent = subText;

    this.fill.style.transform = `scaleX(${1 - ratio})`;
    this.fill.style.background = ratio > 0.72 ? "var(--rouge)" : "var(--paper)";
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
