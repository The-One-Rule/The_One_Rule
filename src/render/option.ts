/**
 * Boutons d'option de réglage — allure, vitesse, vies, rotation.
 *
 * Ils étaient des `<button class="chip">` ne portant que leur libellé. Deux
 * défauts, mesurés plutôt que devinés :
 *
 * 1. `.chip` ne déclarait AUCUN fond. Un `<button>` sans fond déclaré prend
 *    celui du système — `rgb(240,240,240)` sur Windows — sous un texte en
 *    `--paper` (239,234,224). Contraste nul : les options non retenues étaient
 *    littéralement illisibles, et rien ne distinguait le choix courant.
 * 2. Le libellé seul ne dit pas ce qu'il change. « ×8 » ou « 1.3 » n'informent
 *    personne. Rapporté en soirée : trois joueurs sur quatre ne savaient pas
 *    modifier la vitesse, ni laquelle était sélectionnée.
 *
 * Un bouton porte donc trois choses : une jauge qui montre la quantité, le
 * libellé, et une précision facultative. La jauge suit `currentColor`, donc
 * elle s'inverse avec le bouton sans une seule règle de plus.
 *
 * Aucun SVG, aucune icône chargée : des rectangles, comme les points de vie et
 * les hachures du bandeau. C'est la même grammaire partout.
 */

/** `bars` : une quantité croissante (vitesse). `dots` : un compte (vies). */
export type OptionIcon = "bars" | "dots";

export interface OptionSpec {
  /** Valeur transportée, lue par les gestionnaires de clic. */
  value: string;
  label: string;
  /** Précision facultative : une durée, un rappel. */
  hint?: string;
  /** Repères allumés. */
  level: number;
  /** Repères en tout. */
  steps: number;
  icon: OptionIcon;
  selected: boolean;
  disabled?: boolean;
  /** Lu par les lecteurs d'écran, où la jauge ne dit rien. */
  aria?: string;
}

function marks(spec: OptionSpec): HTMLElement {
  const box = document.createElement("span");
  box.className = `opt__marks opt__marks--${spec.icon}`;
  box.setAttribute("aria-hidden", "true");
  for (let i = 0; i < spec.steps; i++) {
    const m = document.createElement("i");
    if (i < spec.level) m.className = "is-on";
    box.appendChild(m);
  }
  return box;
}

export function optionButton(spec: OptionSpec): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "opt" + (spec.selected ? " is-on" : "");
  btn.dataset.value = spec.value;
  btn.disabled = !!spec.disabled;
  btn.setAttribute("aria-pressed", spec.selected ? "true" : "false");
  if (spec.aria) btn.setAttribute("aria-label", spec.aria);

  btn.appendChild(marks(spec));

  const label = document.createElement("span");
  label.className = "opt__label";
  label.textContent = spec.label;
  btn.appendChild(label);

  if (spec.hint) {
    const hint = document.createElement("span");
    hint.className = "opt__hint";
    hint.textContent = spec.hint;
    btn.appendChild(hint);
  }
  return btn;
}

/**
 * Remplit un groupe d'options.
 *
 * Marque d'un `is-fresh` l'option qui vient de PRENDRE la sélection — et
 * seulement elle, seulement si le groupe affichait déjà autre chose. C'est ce
 * qui déclenche l'animation : sans cette mémoire, un salon qui se repeint à
 * chaque message rejouerait l'animation en boucle, et un premier affichage
 * animerait un choix que personne n'a fait.
 *
 * Effet secondaire heureux en multijoueur : quand l'hôte change un réglage,
 * tout le salon voit l'option bouger, sans qu'on ait à l'annoncer.
 */
export function fillOptions(host: HTMLElement, specs: readonly OptionSpec[]): void {
  const avant = host.dataset.on;
  const choisie = specs.find((s) => s.selected)?.value;
  host.innerHTML = "";
  for (const spec of specs) {
    const btn = optionButton(spec);
    if (spec.selected && avant !== undefined && avant !== choisie) btn.classList.add("is-fresh");
    host.appendChild(btn);
  }
  if (choisie === undefined) delete host.dataset.on;
  else host.dataset.on = choisie;
}
