import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PACE_CHOICES, PACE_LABELS, fenetreAllure, windowMs } from "../../engine/difficulty";
import { appliqueLangue, estLang, langue, nomAllure, t } from "../../i18n";
import type { Lang } from "../../i18n";
import { THEMES } from "../../game/progress";
import type { Theme } from "../../game/progress";
import * as P from "../../game/progress";
import { fillOptions } from "../../render/option";
import { souscrisReglages } from "./etat";
import type { EffetsReglages } from "./effets";

function Inter(props: { id: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={"rgl__inter" + (props.on ? " is-on" : "")}
      id={props.id}
      role="switch"
      aria-checked={props.on}
      onClick={props.onToggle}
    >
      <i data-i18n="commun.on">ON</i>
      <i data-i18n="commun.off">OFF</i>
    </button>
  );
}

/**
 * L'écran Réglages. Il lit la sauvegarde et demande les effets de bord
 * (son, thème, langue) au reste du jeu. Il ne connaît ni le canvas ni `main`.
 */
export function Reglages({ effets }: { effets: EffetsReglages }) {
  const [n, setN] = useState(0);
  const themeRef = useRef<HTMLDivElement>(null);
  const allureRef = useRef<HTMLDivElement>(null);
  const effetsRef = useRef(effets);
  effetsRef.current = effets;

  useEffect(() => souscrisReglages(() => setN((x) => x + 1)), []);

  const s = P.load();
  const lang: Lang = estLang(s.lang) ? s.lang : "fr";

  useLayoutEffect(() => {
    appliqueLangue(document, langue());
  });

  useLayoutEffect(() => {
    const hote = themeRef.current;
    if (!hote) return;
    const courant = P.load().theme;
    fillOptions(
      hote,
      THEMES.map((v) => ({
        value: v,
        label: t("themeNom")(v),
        level: 0,
        steps: 0,
        icon: "dots" as const,
        selected: v === courant,
        compact: true,
      })),
    );
    const boutons = Array.from(hote.querySelectorAll("button"));
    const clic = (ev: Event) => {
      const v = (ev.currentTarget as HTMLElement).dataset.value as Theme;
      effetsRef.current.ui();
      effetsRef.current.theme(v);
      setN((x) => x + 1);
    };
    for (const b of boutons) b.addEventListener("click", clic);
    return () => {
      for (const b of boutons) b.removeEventListener("click", clic);
    };
  }, [s.theme, lang, n]);

  useLayoutEffect(() => {
    const hote = allureRef.current;
    if (!hote) return;
    const current = P.load().trainingPace;
    const lentesDabord = [...PACE_CHOICES].sort((a, b) => b - a);
    fillOptions(
      hote,
      lentesDabord.map((v, i) => ({
        value: String(v),
        label: nomAllure(v, PACE_LABELS[v] ?? String(v)),
        hint: `${Math.round(fenetreAllure(windowMs(10), v))} MS`,
        level: i + 1,
        steps: lentesDabord.length,
        icon: "bars" as const,
        selected: v === current,
        aria: `${nomAllure(v, PACE_LABELS[v] ?? String(v))} — ${Math.round(fenetreAllure(windowMs(10), v))} ms`,
      })),
    );
    const boutons = Array.from(hote.querySelectorAll("button"));
    const clic = (ev: Event) => {
      const v = Number((ev.currentTarget as HTMLElement).dataset.value);
      effetsRef.current.ui();
      effetsRef.current.allure(v);
      setN((x) => x + 1);
    };
    for (const b of boutons) b.addEventListener("click", clic);
    return () => {
      for (const b of boutons) b.removeEventListener("click", clic);
    };
  }, [s.trainingPace, lang, n]);

  const bascule = (ecrit: (on: boolean) => void, on: boolean) => {
    effets.ui();
    ecrit(!on);
    setN((x) => x + 1);
  };

  return (
    <div className="screen__scroll">
      <p className="eyebrow" data-i18n="reglages.titre">SETTINGS</p>
      <h2 className="rulename" data-i18n="reglages.sous">HOW YOU LIKE IT</h2>

      <div className="rgl__section">
        <p className="eyebrow rgl__groupe" data-i18n="rgl.son">SOUND</p>
        <div className="rgl__bloc">
          <div className="rgl__ligne">
            <div className="rgl__txt">
              <p className="rgl__nom" data-i18n="rgl.musique">MUSIC</p>
              <p className="rgl__quoi" data-i18n="rgl.musiqueQuoi">The tempo rises with the difficulty.</p>
            </div>
            <Inter id="btnMusic" on={s.music} onToggle={() => bascule(effets.musique, s.music)} />
          </div>
          <div className="rgl__ligne">
            <div className="rgl__txt">
              <p className="rgl__nom" data-i18n="rgl.effets">EFFECTS</p>
              <p className="rgl__quoi" data-i18n="rgl.effetsQuoi">Alert on the last quarter of the window.</p>
            </div>
            <Inter id="btnSound" on={s.sound} onToggle={() => bascule(effets.son, s.sound)} />
          </div>
        </div>
      </div>

      <div className="rgl__section">
        <p className="eyebrow rgl__groupe" data-i18n="rgl.lisibilite">READABILITY</p>
        <div className="rgl__bloc rgl__bloc--vedette">
          <div className="rgl__ligne">
            <div className="rgl__txt">
              <p className="rgl__nom" data-i18n="rgl.motifs">PATTERNS ON PIECES</p>
              <p className="rgl__quoi" data-i18n="rgl.motifsQuoi">Every colour also carries a texture.</p>
            </div>
            <Inter id="btnMotifs" on={s.daltonien} onToggle={() => bascule(effets.motifs, s.daltonien)} />
          </div>
          <div className="rgl__apercu" aria-hidden="true">
            <span className="rgl__ech rgl__ech--garance"></span>
            <span className="rgl__ech rgl__ech--azur"></span>
            <span className="rgl__ech rgl__ech--jade"></span>
            <span className="rgl__ech rgl__ech--ambre"></span>
          </div>
        </div>
      </div>

      <div className="rgl__section">
        <p className="eyebrow rgl__groupe" data-i18n="rgl.apparence">APPEARANCE</p>
        <div className="settings settings--seg rgl__theme">
          <div className="settings__opts" id="rglTheme" ref={themeRef}></div>
        </div>
        <p className="rgl__note" data-i18n="rgl.apparenceQuoi">AUTO follows your device. DARK is easier on the eyes at night.</p>
        <div className="rgl__bloc">
          <div className="rgl__ligne">
            <div className="rgl__txt">
              <p className="rgl__nom" data-i18n="rgl.photos">OTHERS' PHOTOS</p>
              <p className="rgl__quoi" data-i18n="rgl.photosQuoi">Profile photos of the players in your room.</p>
            </div>
            <Inter id="btnPhotosAutres" on={s.photosAutres} onToggle={() => bascule(effets.photos, s.photosAutres)} />
          </div>
        </div>
      </div>

      <div className="rgl__section">
        <p className="eyebrow rgl__groupe" data-i18n="rgl.allure">DEFAULT PACE · TRAINING</p>
        <div className="opts" id="rglAllure" ref={allureRef}></div>
        <p className="rgl__note" data-i18n="rgl.allureQuoi">It only applies to training. The daily run is the same for everyone.</p>
      </div>

      <div className="rgl__section">
        <p className="eyebrow rgl__groupe" data-i18n="rgl.langue">LANGUAGE</p>
        <div className="lang" id="lang" role="group" aria-label="Language">
          <button type="button" className="lang__btn" id="btnLangFr" lang="fr" aria-pressed="false" onClick={() => effets.langue("fr")}>
            FRANÇAIS
          </button>
          <button type="button" className="lang__btn is-on" id="btnLangEn" lang="en" aria-pressed="true" onClick={() => effets.langue("en")}>
            ENGLISH
          </button>
        </div>
      </div>

      <div className="rgl__section">
        <p className="eyebrow rgl__groupe" data-i18n="rgl.mesure">METRICS</p>
        <div className="rgl__bloc">
          <div className="rgl__ligne">
            <div className="rgl__txt">
              <p className="rgl__nom" data-i18n="rgl.compter">COUNT MY GAMES</p>
              <p className="rgl__quoi" data-i18n="rgl.compterQuoi">A random local id. No account, no cookie, nothing sold.</p>
            </div>
            <Inter id="btnMetrics" on={s.metrics.on} onToggle={() => bascule(effets.mesure, s.metrics.on)} />
          </div>
        </div>
      </div>

      <p className="fineprint" id="reglagesFineprint">MOUSE AND KEYBOARD · <b>R</b> TO RESTART · <b>ESC</b> FOR THE MENU</p>
      <div className="btnrow">
        <button className="btn btn--ghost" id="btnReglagesBack" data-i18n="commun.retour" onClick={() => effets.retour()}>
          BACK
        </button>
      </div>
    </div>
  );
}
