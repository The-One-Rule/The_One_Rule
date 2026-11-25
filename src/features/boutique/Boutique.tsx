import { useEffect, useLayoutEffect, useState } from "react";
import { achete, porte, SKINS } from "../../game/boutique";
import type { SkinId } from "../../game/boutique";
import * as P from "../../game/progress";
import { tp } from "../../i18n";
import { dessineApercu } from "../../render/skins";
import { souscrisReglages } from "../reglages/etat";
import type { EffetsBoutique } from "./effets";

/**
 * La boutique. L'achat est local (les pièces sont sur l'appareil).
 * S'il échoue quand même, une phrase le dit : on ne reste pas sur un bouton mort.
 */
export function Boutique({ effets }: { effets: EffetsBoutique }) {
  const [, setN] = useState(0);
  const [erreur, setErreur] = useState("");
  useEffect(() => souscrisReglages(() => setN((x) => x + 1)), []);

  const s = P.load();
  const T = tp();

  useLayoutEffect(() => {
    for (const skin of SKINS) {
      const toile = document.getElementById(`apercu-${skin.id}`);
      if (toile instanceof HTMLCanvasElement) dessineApercu(toile, skin.id);
    }
  });

  const relis = () => setN((x) => x + 1);

  const porter = (id: SkinId) => {
    effets.ui();
    P.mutate((st) => {
      st.boutique = porte(st.boutique, id);
    });
    effets.skin(id);
    setErreur("");
    relis();
  };

  const acheter = (id: SkinId) => {
    const skin = SKINS.find((x) => x.id === id);
    if (!skin) return;
    let ok = false;
    P.mutate((st) => {
      const r = achete(st.boutique, st.coins, id);
      if (!r.ok) return;
      st.boutique = r.etat;
      st.coins = r.pieces;
      ok = true;
    });
    if (!ok) {
      const manque = Math.max(0, skin.prix - P.load().coins);
      setErreur(T.manque(manque));
      return;
    }
    effets.gagne();
    effets.skin(id);
    effets.achat(id, skin.prix, T.skinNom[id] ?? id);
    setErreur("");
    relis();
  };

  return (
    <div className="screen__scroll boutique">
      <div className="boutique__tete">
        <h2 className="boutique__titre" data-i18n="boutique.titre">SHOP</h2>
        <span className="pstat pstat--pieces">
          <i aria-hidden="true">●</i>
          <b id="boutiquePieces">{s.coins}</b>
        </span>
      </div>
      <p className="boutique__chapo" data-i18n="boutique.chapo">
        Boards: they dress your whole game. Never the rule.
      </p>
      {erreur ? (
        <p className="warn" id="boutiqueErr" role="alert">
          {erreur}
        </p>
      ) : null}
      <div className="skins" id="skins">
        {SKINS.map((skin) => {
          const possede = s.boutique.possedes.includes(skin.id);
          const estPorte = s.boutique.porte === skin.id;
          const manque = skin.prix - s.coins;
          return (
            <div
              key={skin.id}
              className={"skin" + (estPorte ? " is-porte" : "") + (possede ? " is-possede" : "")}
            >
              <canvas className="skin__apercu" id={`apercu-${skin.id}`} width={240} height={120} aria-hidden="true" />
              <div className="skin__corps">
                <b className="skin__nom">{T.skinNom[skin.id] ?? skin.id}</b>
                <span className="skin__desc">{T.skinDesc[skin.id] ?? ""}</span>
              </div>
              {estPorte ? (
                <button type="button" className="btn skin__btn" disabled>
                  {T.porte}
                </button>
              ) : possede ? (
                <button type="button" className="btn skin__btn" onClick={() => porter(skin.id)}>
                  {T.porter}
                </button>
              ) : (
                <button
                  type="button"
                  className={"btn skin__btn" + (manque <= 0 ? " btn--primary" : "")}
                  disabled={manque > 0}
                  onClick={() => acheter(skin.id)}
                >
                  {manque > 0 ? T.manque(manque) : T.acheter(skin.prix)}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button className="btn" id="btnBoutiqueRetour" data-i18n="boutique.retour" onClick={() => effets.retour()}>
        BACK
      </button>
    </div>
  );
}
