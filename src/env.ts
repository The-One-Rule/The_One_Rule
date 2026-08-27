/**
 * Lecture des variables d'environnement de compilation.
 *
 * Une variable traverse des mains, des interfaces web et des shells avant
 * d'arriver ici. Elle peut donc porter un espace de trop, un retour ligne
 * collé par un copier-coller, ou — vécu en production — un **BOM UTF-8**
 * ajouté par Windows PowerShell quand il encode une valeur passée par un tube.
 *
 * Le cas réel, et il a coûté cher : `VITE_COLLECT_URL` valait "﻿/api/collect".
 * Chaque envoi de mesure partait donc sur `/%EF%BB%BF/api/collect` et recevait
 * un 404. Le jeu tournait parfaitement, le bandeau de consentement s'affichait,
 * aucune erreur nulle part — et la collecte ne retenait rien. Pire, le
 * vérificateur de déploiement passait au vert : il cherchait la sous-chaîne
 * `/api/collect`, que "﻿/api/collect" contient.
 *
 * On nettoie donc à la lecture, une fois, plutôt que d'espérer que chaque
 * procédure de déploiement soit parfaite. Le caractère est écrit en échappement
 * (`﻿`) et non en littéral : un BOM dans un fichier source est invisible à
 * la relecture, ce qui est exactement le défaut qu'on répare.
 */
export function cleanEnv(v: string | undefined): string | undefined {
  return v?.replace(/^﻿/, "").trim() || undefined;
}
