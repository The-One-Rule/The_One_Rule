# 0012 — Prisma : le schéma est la source, et les fonctions de compte tournent en Node

- **Statut** : Acceptée
- **Date** : 25/11/2026
- **Décideur** : Pierre (directive : « mettre en place une ORM (Prisma) pour
  éviter les migrations de la base dans le code ») ; périmètre choisi par lui
  parmi trois — schéma ET accès, runtime Node, fonctions SQL réécrites en
  TypeScript

## Contexte

Le schéma n'existait qu'en neuf migrations SQL écrites à la main
(`supabase/migrations/0001` à `0009`, 1 375 lignes). Pour savoir ce que
contenait une table, il fallait rejouer l'histoire de tête.

La loi d'écriture vivait à deux endroits. Les fonctions `api/` tournaient en
**edge** : pas de socket TCP, donc pas de connexion Postgres, et chaque requête
REST (PostgREST) était sa propre transaction. Toute écriture à plusieurs lignes
était donc une fonction SQL (0009, ADR 0011), recopiée dans `DepotMemoire` pour
les tests. CLAUDE.md §9 notait la dette : « une fonction SQL modifiée sans son
double en mémoire laisse les tests verts sur un dépôt qui ne tourne pas », et
l'audit d'architecture l'avait payée deux fois.

Prisma ne parle pas à PostgreSQL depuis le runtime edge, sauf par un service
payant (Accelerate). Trois périmètres ont été proposés ; Pierre a retenu le
plus complet.

## Décision

1. **`prisma/schema.prisma` est la source du schéma.** Les migrations sont
   générées par `prisma migrate dev --create-only`, relues, complétées à la
   main de ce que Prisma n'écrit pas (RLS, `check`, catalogue), puis
   committées dans `prisma/migrations/`. Chaque modèle, champ, index et
   contrainte porte son nom en base (`@@map`, `@map`, `map:`).
2. **La ligne de base est l'histoire.** `0_ligne_de_base` est la
   concaténation exacte de 0001 → 0009. La production (à 0009) la marque comme
   appliquée (`migrate resolve --applied`) et ne l'exécute pas.
3. **Les fonctions qui touchent la base tournent en runtime Node** (`amis`,
   `auth`, `authcb`, `boutique`, `moi`, `perf`), par `@prisma/adapter-pg`, sur
   le pooler Supabase en mode transaction. `collect` reste en edge.
4. **Les treize fonctions SQL de 0009 sont réécrites en TypeScript**
   (`api/_depot-prisma.ts`, `$transaction`), avec les mêmes verrous et les
   mêmes issues, puis retirées (migration `1_fonctions_en_typescript`). Le
   déclencheur de la bannière, la colonne générée `termine` et la clé
   `SET NULL (colonne)`, que Prisma ne sait pas décrire, sont remplacés par du
   code ou par une forme qu'il sait décrire.
5. **Une seule suite pour les deux dépôts.** `tests/depot-contrat.test.ts`
   fait passer les mêmes scénarios sur `DepotMemoire` et sur `DepotPrisma`
   contre un vrai PostgreSQL. En CI, cette base est obligatoire.

## Conséquences

- La dette « logique d'écriture en deux exemplaires » change de nature. Le
  double en mémoire existe encore, mais une divergence fait maintenant tomber
  le contrat. Le premier passage en a trouvé une, antérieure : `DepotMemoire`
  rendait un compte supprimé.
- **Imports `.js` obligatoires** sur tout le graphe des fonctions Node. En
  Node, Vercel transpile fichier par fichier sans regrouper, et un import ESM
  sans extension lève `ERR_MODULE_NOT_FOUND`. Mesuré avec `vercel build` :
  toutes les routes de compte auraient répondu 500, avec un build, des tests
  et un `tsc` verts. `tests/imports-node.test.ts` le garde.
- **Ordre de déploiement** : le code d'abord, la migration 1 ensuite. Le
  nouveau code tourne sur la base d'avant (mesuré : 39 tests sur 39) ;
  l'ancien code casse dès que les fonctions SQL disparaissent.
- **Une connexion par instance de fonction**, en petit pool (3). Le pooler en
  mode transaction fait le multiplexage. C'est la contrainte qu'impose le
  serverless.
- **Le moteur de schéma de Prisma est un binaire** téléchargé depuis
  `binaries.prisma.sh`. Les sessions de travail cloud ne l'atteignent pas :
  `migrate dev` et `migrate diff` n'y tournent pas, alors que `generate` et
  `validate` si. L'accord schéma ↔ migrations est donc gardé par le job
  `base` de la CI.
- Ce que Prisma ne voit pas (l'index d'expression `demande_ami_paire`, les
  clés `NOT VALID`, le RLS, les `check`) vit dans le SQL des migrations. Une
  migration générée doit être LUE avant d'être acceptée.
- `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` ne servent plus ; la clé
  publique ne lit toujours rien (RLS sans politique).

## Références

`prisma/schema.prisma`, `prisma/migrations/`, `prisma/retours/1-0.sql`,
`api/_depot-prisma.ts`, `tests/depot-contrat.test.ts`,
`tests/imports-node.test.ts`, `tests/migrations.test.ts`,
`.github/workflows/verification.yml` (jobs `rapide` et `base`),
docs/BASE-DE-DONNEES.md §6, §8, §9 ; remplace en partie l'ADR 0011
(point 3).
