/**
 * Un texte traduisible : [clé i18n, texte par défaut].
 *
 * Le texte par défaut est celui que voient les robots et le joueur avant que
 * `appliqueLangue()` (src/i18n.ts) ne le remplace d'après la clé.
 */
export type Libelle = readonly [cle: string, defaut: string];
