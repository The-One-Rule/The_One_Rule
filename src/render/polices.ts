/**
 * LES DEUX FAMILLES DU JEU, ET LA SEULE SOURCE QUI LES NOMME.
 *
 * ⚠️ **POURQUOI CE FICHIER EXISTE.** Le canvas ne lit pas le CSS : `ctx.font`
 * veut une chaîne complète, donc `var(--display)` n'y sert à rien. Les noms
 * étaient par conséquent recopiés à la main à quatre endroits — trois dans la
 * carte à partager, un dans le badge de concours du terrain. Trois de ces
 * quatre copies disaient encore « Inter » et « JetBrains Mono » APRÈS le
 * changement de polices : la carte qu'on envoie à ses amis, c'est-à-dire la
 * seule image du jeu qui sorte du site, serait restée dans l'ancienne
 * identité sans que rien ne le signale.
 *
 * Le CSS garde forcément sa propre déclaration — une feuille de style ne peut
 * pas importer du TypeScript. Les deux ne peuvent donc pas être fusionnées,
 * seulement TENUES D'ACCORD : `tests/polices.test.ts` lit la feuille et ce
 * fichier, et refuse qu'ils nomment des familles différentes.
 *
 * ⚠️ **LES REPLIS NE SONT PAS DÉCORATIFS.** La police met un instant à
 * charger, et le premier écran se peint avant. Un repli absent donnerait du
 * Times New Roman sur l'accueil pendant ce laps de temps.
 */

/** Titres, chiffres, tout ce qui se lit en grand. */
export const DISPLAY_FAMILLE = "Chakra Petch";
/** Intitulés, valeurs, tout ce qui se lit en petit — plancher 11 px. */
export const MONO_FAMILLE = "DM Mono";

export const DISPLAY_STACK = `"${DISPLAY_FAMILLE}", system-ui, -apple-system, sans-serif`;
export const MONO_STACK = `"${MONO_FAMILLE}", ui-monospace, SFMono-Regular, Menlo, monospace`;

/** `ctx.font` complet — le canvas veut la graisse et la taille dans la chaîne. */
export const policeDisplay = (poids: number, px: number): string =>
  `${poids} ${px}px ${DISPLAY_STACK}`;

export const policeMono = (poids: number, px: number): string =>
  `${poids} ${px}px ${MONO_STACK}`;
