/**
 * Le point d'entrée du client : deux imports, et leur ORDRE est le contrat.
 *
 *  1. `monte` écrit le DOM de l'application dans `#app` (le balisage vit dans
 *     `src/ui/`) ;
 *  2. `main` s'y branche. Il lit les éléments par leur `id` dès son évaluation
 *     (`$("cv")`, `$("home")`…) : il ne doit jamais s'exécuter avant le rendu.
 *
 * Des imports STATIQUES et non un `import()` dynamique, pour trois raisons : un
 * module ES n'est évalué qu'une fois ses dépendances évaluées, DANS L'ORDRE
 * où elles sont écrites ; le jeu reste dans le paquet que la page référence
 * (`scripts/check-deploy.mjs` y cherche l'URL du collecteur et celle des salons,
 * et ne lit que les `<script>` de la page) ; et le navigateur ne fait pas deux
 * allers-retours en cascade pour charger l'entrée puis le jeu.
 *
 * Ne pas réordonner, et ne pas laisser un formateur ou un tri d'imports le
 * faire : `tests/ui.test.ts` tient cet ordre.
 */
import "./monte";
import "./main";
