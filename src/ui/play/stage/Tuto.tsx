export function Tuto() {
  return (
    <div id="tuto" className="tuto hidden" aria-live="polite">
      <p className="tuto__aide" id="tutoAide" />
      <p className="tuto__note" id="tutoNote" />
      {/*
         PASSER vit SUR le terrain : il n'y a plus d'écran d'explication
         où le poser. Le seul élément cliquable du calque.
      */}
      <button type="button" className="tuto__passer" id="btnTutoPasser" data-i18n="tuto.passer">
        SKIP
      </button>
    </div>
  );
}
