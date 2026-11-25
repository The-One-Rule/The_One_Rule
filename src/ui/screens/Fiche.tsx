import { Screen } from "./Screen";

/**
 * BRIEF
 */

/**
 * PREMIÈRE ARRIVÉE — SIX TEMPS.
 * Les temps 3 et 5 ne sont PAS ici : ils se jouent sur le vrai
 * terrain, avec le vrai canvas et le vrai test de clic. Ce qu'on
 * apprend doit être ce qu'on retrouvera.
 */

/**
 * LA FICHE D'UNE CARTE.
 * Elle existe pour une seule raison : rendre la maitrise ACTIONNABLE.
 * « 3 / 6 » dit ou l'on en est ; « il te manque 4 manches a l'allure
 * normale » dit quoi faire, et le bouton l'ouvre.
 */
export function Fiche() {
  return (
    <Screen id="fiche">
      <div className="screen__scroll fiche">
        <div className="fiche__tete">
          <div className="fiche__vue" id="ficheVue" />
          <div className="fiche__ident">
            <p className="eyebrow" id="ficheFamille" />
            <h2 className="fiche__nom" id="ficheNom" />
            <p className="lede" id="ficheBrief" />
          </div>
        </div>
        <div className="fiche__chiffres" id="ficheChiffres" />
        <p className="eyebrow" id="ficheMaitrise" />
        <ol className="fiche__cases" id="ficheCases" />
        <p className="fiche__manque" id="ficheManque" />
        <div className="btnrow">
          <button className="btn btn--primary" id="btnFicheTrain" />
          {" "}
          {/*
             Le prochain niveau du chapitre de cette règle.
          */}
          {" "}
          <button className="btn" id="btnFicheEsc" />
          {" "}
          <button className="btn btn--ghost" id="btnFicheBack" data-i18n="fiche.retour">
            ‹ COLLECTION
          </button>
        </div>
      </div>
    </Screen>
  );
}
