export function Head() {
  return (
    <section id="head">
      <div id="instr">&nbsp;</div>
      {/*
         LA LIGNE SOUS LA CONSIGNE porte deux choses, jamais sur deux
         lignes : la sous-consigne quand il y en a une, et COMBIEN DE
         GESTES la manche demande.

         ⚠️ Une ligne et pas deux, pour une raison mesuree : un second
         bloc coutait 21 px de hauteur, donc 21 px de terrain — 616 → 595.
         La taille du champ EST du gameplay. La maquette n'en a d'ailleurs
         qu'une seule elle aussi.
      */}
      <div id="sub" />
      <div id="timer">
        <div id="timerFill" />
      </div>
      <div id="ghost" className="ghost hidden">
        <span className="ghost__tag" data-i18n="hud.fantome">GHOST</span>
        <div className="ghost__track">
          <div className="ghost__fill" id="ghostFill" />
        </div>
        <span className="ghost__num" id="ghostNum">0</span>
      </div>
    </section>
  );
}
