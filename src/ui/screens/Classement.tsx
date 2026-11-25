import { Screen } from "./Screen";

/**
 * LE MUR DES RECORDS
 * Vue 17/27. Le podium existait, mais il ne paraissait que sur l'ecran
 * de FIN, apres un run du jour : les trois joueurs sur quatre qui ne
 * lancent jamais une partie ne l'ont jamais vu. C'est le levier nomme
 * dans la memoire du depot — le porter la ou on decide de jouer.
 *
 * ⚠️ Aucune infrastructure de classement inventee. Ce qui est ici
 * existe : `MEILLEUR_CONNU` (mesure gelee, etiquetee ENTRAINEMENT),
 * `recordDeSonAllure`, et `classementDuJour` — la meme route que
 * l'ecran de fin. Rien d'autre n'est affiche, parce que rien d'autre
 * n'est vrai.
 */
export function Classement() {
  return (
    <Screen id="classement">
      {/*
         LE MUR DES RECORDS.
         Rapporté par Pierre : « pas de réel classement, il est mal
         présenté ». Il posait en grand un 201 figé à la main au-dessus d'un
         « TON MIEUX · — » vide. Trois blocs désormais, et chacun dit son
         épreuve : le RUN DU JOUR (le même pour tous, rejoué par le
         serveur), tes AMIS, et TES RECORDS.
      */}
      <div className="screen__scroll screen__scroll--wide mur">
        <div className="mur__tete">
          <p className="eyebrow" data-i18n="mur.eyebrow">LEADERBOARD</p>
          <h2 className="rulename" data-i18n="mur.titre">THE WALL OF RECORDS</h2>
        </div>
        <div className="col mur__col">
          <div className="mur__bloc" id="murJour">
            <p className="eyebrow" id="murJourTitre" />
            <p className="mur__regle" id="murJourRegle" />
            {/*
               Le podium se TAIT plutôt que de montrer un cadre vide.
            */}
            <div className="podium hidden" id="murPodium">
              <ol className="podium__liste" id="murPodiumListe" />
              <p className="podium__moi" id="murPodiumMoi" />
            </div>
            <p className="mur__mien" id="murJourMien" />
            <button className="btn btn--primary" id="btnMurJouer" data-i18n="mur.tenter">
              PLAY THE DAILY RUN
            </button>
          </div>
          {/*
             LES AMIS ont leur écran (/amis) : rapporté par Pierre, « c'est dans
             classement donc mal pensé niveau UX, pas de page dédiée ». Le
             mur n'en garde qu'une porte.
          */}
          <button type="button" className="murlien hidden" id="btnMurAmis">
            <span className="murlien__quoi" data-i18n="amis.titre">YOUR FRIENDS</span>
            {" "}
            <span className="murlien__dit" id="murAmisDit" data-i18n="amis.voir">
              Compare your daily runs
            </span>
            {" "}
            <span className="murlien__fleche" aria-hidden="true">›</span>
          </button>
        </div>
        <div className="col mur__col">
          <div className="mur__bloc">
            <p className="eyebrow" data-i18n="mur.records">YOUR RECORDS</p>
            <ol className="records" id="murRecords" />
            <p className="mur__vide hidden" id="murRecordsVide" data-i18n="mur.recordsVide">
              Your first run puts your number here.
            </p>
          </div>
        </div>
        <div className="mur__pied">
          <button className="btn btn--ghost" id="btnMurBack" data-i18n="commun.retour">BACK</button>
        </div>
      </div>
    </Screen>
  );
}
