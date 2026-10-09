## Contexte

<!-- Le problème, tel qu'on l'a constaté : un retour de joueur, une mesure, un
     test. Lien vers l'issue, la discussion ou la section de CLAUDE.md. -->

## Ce qui change

<!-- Une ligne par commit ou par idée. L'effet, pas l'opération. -->

## Comment c'est vérifié

- [ ] `npm run lint` · `npm run typecheck` · `npm run coverage`
- [ ] `npm run build` · `npm run taille`
- [ ] `npm run e2e` · `npm run e2e:navigateur` (seuls, machine au repos)
- [ ] `npm run integration` (si `server/`, `shared/` ou le `Dockerfile` bougent)
- [ ] le test ajouté a des dents : correctif cassé → il tombe → restauré

<!-- Les chiffres mesurés, avant et après. Une mise en page se mesure
     (getBoundingClientRect), elle ne se juge pas sur une capture. -->

## Déploiement

<!-- Fly, Vercel, les deux, ou aucun. Si le protocole bouge : FLY D'ABORD.
     Migrations Supabase à appliquer, variables à poser, secrets Fly
     (`fly secrets set` redémarre la machine : quand personne ne joue). -->

## Risques et ce qui n'est pas fait

<!-- Ce qui n'a pas pu être vérifié, et pourquoi. Les directions laissées à
     la décision de Pierre. -->
