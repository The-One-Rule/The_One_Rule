import type { Libelle } from "../libelle";
import { Screen } from "./Screen";

interface ReglageProps {
  /** Id du bouton : c'est lui que `main.ts` branche et dont il pose `aria-checked`. */
  id: string;
  nom: Libelle;
  quoi: Libelle;
  /** État affiché avant que `main.ts` ne lise la sauvegarde. */
  coche?: boolean;
}

/**
 * Une ligne de réglage : le nom, la conséquence en une phrase, et un
 * interrupteur à deux faces (ON / OFF) où l'on voit les deux états à la fois.
 */
function Reglage({ id, nom, quoi, coche = true }: ReglageProps) {
  return (
    <div className="rgl__ligne">
      <div className="rgl__txt">
        <p className="rgl__nom" data-i18n={nom[0]}>
          {nom[1]}
        </p>
        <p className="rgl__quoi" data-i18n={quoi[0]}>
          {quoi[1]}
        </p>
      </div>
      <button type="button" className="rgl__inter" id={id} role="switch" aria-checked={coche ? "true" : "false"}>
        <i data-i18n="commun.on">ON</i>
        <i data-i18n="commun.off">OFF</i>
      </button>
    </div>
  );
}

/**
 * RÉGLAGES
 * Ils quittent le pied de l'accueil : on ne choisit pas « MOTIFS : ON »
 * comme on choisit une partie, et les laisser là leur donnait le même
 * poids qu'une carte de mode.
 */
export function Reglages() {
  return (
    <Screen id="reglages">
      <div className="screen__scroll">
        <p className="eyebrow" data-i18n="reglages.titre">SETTINGS</p>
        <h2 className="rulename" data-i18n="reglages.sous">HOW YOU LIKE IT</h2>
        {/*
           ⚠️ UNE LIGNE, PAS UN BOUTON.
           « MUSIQUE : ON » dit dans quel état on est, jamais ce que ça
           change. Chaque réglage porte donc son nom, la CONSÉQUENCE écrite
           en une phrase, et un interrupteur à deux faces où l'on voit les
           deux états à la fois. Le seul qui gagne un aperçu est MOTIFS :
           c'est le seul dont personne ne peut deviner l'effet.
        */}
        <div className="rgl__section">
          <p className="eyebrow rgl__groupe" data-i18n="rgl.son">SOUND</p>
          <div className="rgl__bloc">
            <Reglage
              id="btnMusic"
              nom={["rgl.musique", "MUSIC"]}
              quoi={["rgl.musiqueQuoi", " The tempo rises with the difficulty. "]}
            />
            <Reglage
              id="btnSound"
              nom={["rgl.effets", "EFFECTS"]}
              quoi={["rgl.effetsQuoi", " Alert on the last quarter of the window. "]}
            />
          </div>
        </div>
        <div className="rgl__section">
          {/*
             Le libellé dit ce que ça FAIT, pas à qui ça s'adresse : on ne
             demande à personne de se déclarer daltonien pour trouver un
             réglage qui rend simplement les pièces plus lisibles.
          */}
          <p className="eyebrow rgl__groupe" data-i18n="rgl.lisibilite">READABILITY</p>
          <div className="rgl__bloc rgl__bloc--vedette">
            <Reglage
              id="btnMotifs"
              nom={["rgl.motifs", "PATTERNS ON PIECES"]}
              quoi={["rgl.motifsQuoi", " Every colour also carries a texture. "]}
              coche={false}
            />
            {/*
               L'APERÇU montre les quatre trames réelles du jeu. Il est
               décoratif : ce qu'il dit, la phrase au-dessus le dit aussi.
            */}
            <div className="rgl__apercu" aria-hidden="true">
              <span className="rgl__ech rgl__ech--garance" />
              {" "}
              <span className="rgl__ech rgl__ech--azur" />
              {" "}
              <span className="rgl__ech rgl__ech--jade" />
              {" "}
              <span className="rgl__ech rgl__ech--ambre" />
            </div>
          </div>
        </div>
        <div className="rgl__section">
          {/*
             L'APPARENCE. Trois crans et non un interrupteur : AUTO suit le
             système, et c'est la bonne réponse par défaut — un interrupteur
             CLAIR / SOMBRE forcerait à choisir avant d'avoir eu à le faire.
          */}
          <p className="eyebrow rgl__groupe" data-i18n="rgl.apparence">APPEARANCE</p>
          <div className="settings settings--seg rgl__theme">
            <div className="settings__opts" id="rglTheme" />
          </div>
          <p className="rgl__note" data-i18n="rgl.apparenceQuoi">
            AUTO follows your device. DARK is easier on the eyes at night.
          </p>
          {/*
             LES PHOTOS DES AUTRES. Une photo est un contenu que personne ne
             modère : on doit pouvoir ne plus les voir sans quitter le salon.
             Les signes et les cartes de visite restent.
          */}
          <div className="rgl__bloc">
            <Reglage
              id="btnPhotosAutres"
              nom={["rgl.photos", "OTHERS' PHOTOS"]}
              quoi={["rgl.photosQuoi", " Profile photos of the players in your room. "]}
            />
          </div>
        </div>
        <div className="rgl__section">
          <p className="eyebrow rgl__groupe" data-i18n="rgl.allure">DEFAULT PACE · TRAINING</p>
          <div className="opts" id="rglAllure" />
          <p className="rgl__note" data-i18n="rgl.allureQuoi">
            It only applies to training. The daily run is the same for everyone.
          </p>
        </div>
        <div className="rgl__section">
          <p className="eyebrow rgl__groupe" data-i18n="rgl.langue">LANGUAGE</p>
          <div className="lang" id="lang" role="group" aria-label="Language">
            <button
              type="button"
              className="lang__btn"
              id="btnLangFr"
              lang="fr"
              aria-pressed="false"
            >
              FRANÇAIS
            </button>
            {" "}
            <button
              type="button"
              className="lang__btn is-on"
              id="btnLangEn"
              lang="en"
              aria-pressed="true"
            >
              ENGLISH
            </button>
          </div>
        </div>
        <div className="rgl__section">
          <p className="eyebrow rgl__groupe" data-i18n="rgl.mesure">METRICS</p>
          <div className="rgl__bloc">
            <Reglage
              id="btnMetrics"
              nom={["rgl.compter", "COUNT MY GAMES"]}
              quoi={["rgl.compterQuoi", " A random local id. No account, no cookie, nothing sold. "]}
            />
          </div>
        </div>
        <p className="fineprint" id="reglagesFineprint">
          MOUSE AND KEYBOARD ·
          {" "}
          <b>R</b>
          {" "}
          TO RESTART ·
          {" "}
          <b>ESC</b>
          {" "}
          FOR THE MENU
        </p>
        <div className="btnrow">
          <button className="btn btn--ghost" id="btnReglagesBack" data-i18n="commun.retour">
            BACK
          </button>
        </div>
      </div>
    </Screen>
  );
}
