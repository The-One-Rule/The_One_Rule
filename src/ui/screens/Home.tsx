import type { ReactNode } from "react";
import type { Libelle } from "../libelle";
import { Screen } from "./Screen";

interface ProfProps {
  id: string;
  quoi: Libelle;
  nom: Libelle;
  /** Texte fixe de la note ; sans lui, `main.ts` écrit la note à l'exécution. */
  note?: Libelle;
  noteId?: string;
  /** Ce qui suit la note (le chiffre du run du jour). */
  children?: ReactNode;
}

/** Une porte de l'accueil : nom du mode, accroche, et une note d'état. */
function Prof({ id, quoi, nom, note, noteId, children }: ProfProps) {
  return (
    <button className="prof" id={id}>
      <span className="prof__quoi" data-i18n={quoi[0]}>
        {quoi[1]}
      </span>{" "}
      <span className="prof__nom" data-i18n={nom[0]}>
        {nom[1]}
      </span>{" "}
      <span className="prof__note" id={noteId} data-i18n={note?.[0]}>
        {note?.[1]}
      </span>
      {children && <> {children}</>}
    </button>
  );
}

/**
 * ACCUEIL
 */

/**
 * ACCUEIL
 * DEUX portes, et c'est tout.
 *
 * Mesure de l'accueil precedent, mobile 375x812, defilement en haut :
 * 1271 px de contenu pour 812 de haut, la premiere carte cliquable a
 * y=465 — 57 % de l'ecran a franchir avant de pouvoir faire quoi que
 * ce soit — et le bloc serie/quetes/carnet ENTIEREMENT sous la ligne
 * de flottaison. Quatre cartes de mode, dont la quatrieme coupee sur
 * les deux tailles testees.
 *
 * L'etat du run du jour vit desormais SUR le bouton SOLO plutot que
 * dans un troisieme element : c'est le seul mode a un essai par jour,
 * et celui qui porte la serie. L'enterrer sans le dire aurait ete le
 * seul vrai cout de ce rangement.
 */
export function Home() {
  return (
    <Screen id="home" visible>
      {/*
         ══════════════════════════════════════════════════════════
         LE MODE ATTRACT — « LE CHAMP, PLEIN ÉCRAN : LE FOND EST LE JEU »

         ⚠️ LE CHIFFRE QUI L'EXIGE : 118 nouveaux visiteurs sur 159 (74 %)
         repartent sans lancer une seule partie, mediane 6 secondes. Un jeu
         de reflexes se comprend en deux secondes de video et pas du tout en
         trois lignes de texte — et l'accueil ne montrait AUCUN jeu.

         ⚠️ CE N'EST PAS UNE IMITATION. La premiere tentative dessinait cinq
         formes a la main dans une bande de 108 px : « la demo est mal
         faite ». Ici tourne une VRAIE Session, avec le vrai buildRound,
         dessinee par le vrai SceneRenderer. Il n'y a plus rien a tenir
         d'accord avec le jeu, parce que c'est le jeu.

         ⚠️ TOUT CE CALQUE EST `aria-hidden` ET NON CLIQUABLE. Rien de ce
         qu'il montre n'est necessaire pour jouer : le chapo le dit en
         toutes lettres, et `prefers-reduced-motion` peut donc l'arreter
         sans rien perdre.
         ══════════════════════════════════════════════════════════
      */}
      <div className="attract" id="attract" aria-hidden="true">
        <canvas className="attract__cvs" id="attractCvs" />
        {" "}
        {/*
           Le curseur de la main qui joue. En SVG pixel, pas en emoji : le
           rendu d'un emoji change d'un systeme a l'autre.
        */}
        {" "}
        <span className="attract__curseur" id="attractCurseur">
          <svg viewBox="0 0 11 13" shapeRendering="crispEdges">
            <path
              d="M0 0h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h-5v1h-1v1h-1v-1h-1v-11z"
              fill="#efeae0"
            />
            <path d="M1 1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h-2v1h-1v1h-1v-1h-1v-8z" fill="#0e1520" />
          </svg>
        </span>
        {" "}
        {/*
           La chaleur : le cadre bat, et il rougit quand ca tourne mal.
        */}
        {" "}
        <span className="attract__chaleur" id="attractChaleur" />
        {" "}
        {/*
           ⚠️ LE FOND DE NUIT — REPLI DU MOUVEMENT REDUIT, PLUS DU TELEPHONE.
           Il ne s'affiche que sous `.attract--nuit`, et c'est le JS qui pose
           cette classe : le seuil est decide a un seul endroit (voir
           `SANS_DEMO` dans main.ts, `prefers-reduced-motion`). Trois plans
           qui ne battent pas au meme rythme, comme la fissure et comme
           `--heat`. Rien que `transform` et `opacity`.
        */}
        {" "}
        <span className="attract__nuit" id="attractNuit" />
      </div>
      <div className="screen__scroll home">
        {/*
           LA REGLE — la carte au coin haut gauche, discrete. C'est le seul
           endroit de l'accueil ou l'on voit une carte du jeu.
        */}
        <div className="home__regle" id="attractRegle">
          <span className="home__reglecarte" id="attractCarte" aria-hidden="true" />
          {" "}
          <span className="home__regletxt">
            <span className="eyebrow" id="attractRegleLabel" />
            {" "}
            <b className="home__reglenom" id="attractRegleNom" />
          </span>
        </div>
        {/*
           LA CONSIGNE — comme en jeu : posee SUR le champ, sans cadre.
        */}
        <div className="home__consigne" id="attractConsigne" aria-hidden="true">
          <p className="home__instr" id="attractInstr" />
          <span className="home__chrono">
            <i id="attractChrono" />
          </span>
          <p className="home__verdict" id="attractVerdict" />
        </div>
        {/*
           « DEMO · MANCHE 7 / PERSONNE NE JOUE ICI ». La seconde ligne
           compte autant que la premiere : sans elle, un visiteur croit
           que le jeu ne repond pas a sa souris ou a son doigt.
        */}
        <p className="home__demo" id="attractMeta" />
        {/*
           ░ LA PREMIÈRE ARRIVÉE ░
           Un visiteur neuf voit la démo qui tourne derrière et UN geste :
           JOUER, qui ouvre le tutoriel joué. Rien d'autre à choisir.
        */}
        <div className="home__centre bienvenue" id="bienvenue">
          {/*
             LA VITRINE (maquette 1a) : une démo ÉCRITE de 8 s, la même pour
             tout le monde — obéir au bleu, puis renoncer au rouge. Voir
             `render/vitrine.ts`. Décorative : tout ce qu'elle montre, le
             titre le dit.
          */}
          <div className="vitrine" id="vitrine" aria-hidden="true">
            <div className="vitrine__regle">
              <span className="vitrine__interdit" />
              {" "}
              <span className="vitrine__regletxt">
                <small data-i18n="vitrine.regle">YOUR RULE</small>
                {" "}
                <b data-i18n="vitrine.jamais">NEVER RED</b>
              </span>
            </div>
            <div className="vitrine__haut">
              <p className="vitrine__consigne" id="vitConsigne" />
              <p className="vitrine__badge" id="vitBadge" />
            </div>
            <div className="vitrine__terrain" id="vitTerrain">
              <span className="vitrine__chrono" id="vitChrono" />
              {" "}
              <span className="vitrine__piece vitrine__piece--bleu" id="vitBleu" />
              {" "}
              <span className="vitrine__piece vitrine__piece--vert" />
              {" "}
              <span className="vitrine__piece vitrine__piece--rouge" />
              {" "}
              <span className="vitrine__main" id="vitMain">
                <svg viewBox="0 0 24 28">
                  <path
                    d="M8 2a2 2 0 0 1 4 0v9l1-.2a2 2 0 0 1 2.4 1.9l1.6-.2a2 2 0 0 1 2.3 2l.7-.1A2 2 0 0 1 22 16.4V20a7 7 0 0 1-7 7h-2.5a7 7 0 0 1-5.6-2.8L3 19.2a2 2 0 0 1 3-2.6l2 2.1z"
                  />
                </svg>
              </span>
            </div>
          </div>
          <div className="vitrine__appel">
            <h1 className="bienvenue__titre" id="ledeHome" data-i18n="vitrine.titre">
              Sometimes, obeying is the mistake.
            </h1>
            <button className="btn play" id="btnPlay" data-i18n="bienvenue.jouer">PLAY</button>
            {" "}
            <button
              type="button"
              className="vitrine__code"
              id="btnArriveeCode"
              data-i18n="vitrine.code"
            >
              I have a room code
            </button>
          </div>
        </div>
        {/*
           ░ LE PARCOURS ░
           Dès la première partie jouée, l'accueil EST le parcours : ce qui
           vient ensuite en grand, puis la carte des chapitres, puis les
           autres façons de jouer.
        */}
        <div className="parcours hidden" id="parcours">
          <div className="pstats" id="pstats" aria-live="polite">
            <span className="pstat pstat--etoiles">
              <i aria-hidden="true">★</i>
              <b id="pstatEtoiles">0</b>
            </span>
            {" "}
            <span className="pstat pstat--pieces">
              <i aria-hidden="true">●</i>
              <b id="pstatPieces">0</b>
            </span>
            {" "}
            <span className="pstat pstat--serie">
              <i aria-hidden="true">▲</i>
              <b id="pstatSerie">0</b>
            </span>
          </div>
          {/*
             LE MULTI D'ABORD (maquette 7.1) : TOR est un jeu de soirée. Le
             bloc ne fait que DÉLÉGUER à l'écran d'entrée du multi
             (`multi.depuisAccueil`), où vivent l'identité et les erreurs
             de code avec leurs issues.
          */}
          <div className="accmulti" id="accMulti">
            <p className="acc__eyebrow">
              <i className="acc__ico acc__ico--amis" aria-hidden="true" />
              <span data-i18n="acc.multiEyebrow">MULTIPLAYER · UP TO 10</span>
            </p>
            <h2 className="acc__titre" data-i18n="acc.multiTitre">Play with your friends</h2>
            <button
              type="button"
              className="btn btn--gros accmulti__creer"
              id="btnAccCreer"
              data-i18n="acc.creer"
            >
              CREATE A ROOM
            </button>
            <div className="accmulti__rejoindre">
              <input
                className="accmulti__code"
                id="accCode"
                maxLength={4}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck="false"
                inputMode="text"
                placeholder="CODE"
                data-i18n-ph="acc.code"
                aria-label="Room code"
                data-i18n-aria="acc.codeAria"
              />
              {" "}
              <button
                type="button"
                className="btn accmulti__rejoindreBtn"
                id="btnAccRejoindre"
                data-i18n="acc.rejoindre"
              >
                JOIN
              </button>
            </div>
            <p className="accmulti__err hidden" id="accCodeErr" role="alert" />
            <button type="button" className="btn accmulti__rapide" id="btnAccRapide">
              <span data-i18n="acc.rapide">QUICK GAME</span>
              <small data-i18n="acc.sansCode">no code</small>
            </button>
          </div>
          {/*
             Le jour et le parcours forment UNE colonne au bureau : des enfants
             de grille séparés couplaient leurs rangées à la hauteur du
             bloc multi, et laissaient un trou de 140 px (mesuré à 1440).
          */}
          <div className="acc__droite">
            <div className="accjour" id="accJour">
              <p className="acc__eyebrow">
                <span id="accJourDate">DAILY RUN</span>
                <span className="accjour__essais" id="accJourEssais" aria-hidden="true" />
              </p>
              <h3 className="acc__titre acc__titre--petit" data-i18n="acc.jourTitre">
                The same game for everyone
              </h3>
              <button type="button" className="btn accjour__jouer" id="btnAccJour" />
            </div>
            <p className="acc__section" data-i18n="acc.parcours">SOLO PATH</p>
            <div className="hero" id="hero">
              <div className="hero__carte" id="heroCarte" aria-hidden="true" />
              <div className="hero__corps">
                <p className="hero__eyebrow" id="heroEyebrow" />
                <h2 className="hero__nom" id="heroNom" />
                <p className="hero__brief" id="heroBrief" />
                <ol className="piste" id="heroPiste" aria-label="Niveaux" />
                <button className="btn btn--gros" id="btnHeroJouer" />
              </div>
            </div>
          </div>
          <h3 className="modes__titre hidden" id="modesTitre" />
          <div className="profondeur modes" id="profondeur">
            <Prof
              id="profJour"
              quoi={["prof.jour", "DAILY"]}
              nom={["prof.jourNom", "Everyone's run"]}
              noteId="profJourNote"
              note={["prof.jourNote", " SAME RULE · 3 TRIES · ONCE A DAY "]}
            >
              {/*
              Le chiffre du jour, en CHIFFRE : « À BATTRE AUJOURD'HUI · 31 »
              en capitales grises se lisait comme une ligne de plus.
              */}
              <span className="prof__chiffre hidden" id="profJourChiffre">
                <b id="profJourChiffreN" />
                <small id="profJourChiffreQuoi" />
              </span>
            </Prof>
            {" "}
            <Prof id="btnMulti" quoi={["prof.multi", "MULTI"]} nom={["prof.multiNom", "Your code, your friends"]} noteId="profMultiNote" note={["prof.multiNote", " ONE RULE EACH · UP TO 10 "]} />
            {" "}
            <Prof id="profLibre" quoi={["prof.libre", "FREE PLAY"]} nom={["prof.libreNom", "Endless, your pace"]} noteId="profLibreNote" note={["prof.libreNote", " PICK A CARD · BEAT YOUR RECORD "]} />
            {" "}
            <Prof id="profEscalade" quoi={["prof.escalade", "THE STACK"]} nom={["prof.escaladeNom", "One rule. Then two."]} noteId="profEscaladeNote" note={["prof.escaladeNote", " HOW FAR DO YOU HOLD "]} />
            {" "}
            <Prof id="profClassement" quoi={["prof.classement", "LEADERBOARD"]} nom={["prof.classementNom", "The wall of scores"]} note={["prof.classementNote", " VERIFIED SERVER-SIDE "]} />
            {" "}
            <Prof id="profCartes" quoi={["prof.cartes", "CODEX"]} nom={["prof.cartesNom", "Your 16 cards"]} noteId="profCartesNote" />
          </div>
          <h2 className="parcours__titre" data-i18n="parcours.titre">THE PATH</h2>
          <ol className="chemin" id="chemin" />
        </div>
      </div>
    </Screen>
  );
}
