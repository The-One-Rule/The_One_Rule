# 0011 — Base normalisée en UUID ; les écritures multiples sont des fonctions SQL

- **Statut** : Proposée
- **Date** : 25/11/2026
- **Décideur** : directive de refonte de la base (modèle cible fourni), à accepter par Pierre

## Contexte

Aucune écriture à plusieurs lignes n'était transactionnelle. Les fonctions
edge parlent à Supabase par PostgREST — le runtime edge n'ouvre pas de socket
Postgres — et une suite de requêtes REST n'est pas une transaction. Mesuré dans
`api/_depot.ts` : créer un compte = 2 requêtes (orphelin possible), supprimer
un compte = 7 (état à moitié effacé possible), accepter un ami = lire, lier,
recompter, défaire (audit C4). La progression, la possession et les records
n'avaient aucune table. Les identifiants de compte étaient du texte
(`u_<32 hex>`) alors qu'ils étaient déjà des UUID.

## Décision

1. Les identifiants sont des **UUID** ; la conversion est faite en place,
   sans perte (0006), et `idCompte` lit l'ancienne forme là où elle circule.
2. Le catalogue (règles, cartes, styles, modes, chapitres) a des tables qui
   sont le **miroir** du code, lequel reste la source ; un test compare les deux.
3. Toute écriture à plusieurs lignes est une **fonction SQL** appelée en RPC,
   donc une transaction, sous verrou de ligne. `EXECUTE` est retiré à `PUBLIC`.
4. La **fusion** des agrégats reste en TypeScript, écrite une fois ; la base
   range des projections, au maximum.
5. Ce qui est opposable (`meilleur_score`, `statistique`) ne se nourrit que de
   `performance` (décision 0006).

## Conséquences

- Une partie de la logique d'écriture vit désormais en SQL : elle ne se teste
  pas avec `vitest` seul. `DepotMemoire` en reproduit la loi pour les tests ;
  `scripts/base/` l'éprouve sur un vrai PostgreSQL ; `tests/migrations-sql.test.ts`
  garde ce qui se lit dans le texte. Une fonction SQL modifiée sans son double
  en mémoire divergera : c'est le prix, et le §9 de docs/BASE-DE-DONNEES.md
  dit où regarder.
- Déploiement couplé : base d'abord, puis le code, sans attendre (voir
  docs/BASE-DE-DONNEES.md §8).
- Le modèle MySQL et le projet NestJS fournis ne sont pas adoptés ; les écarts
  sont listés et justifiés au §1 du même document.

## Références

`supabase/migrations/0006` à `0009`, `supabase/retours/0009-0006.sql`,
`api/_depot.ts`, `api/_projection.ts`, `api/boutique.ts`, `shared/boutique.ts`,
`docs/BASE-DE-DONNEES.md`, décisions n°12, 13, 14 de `CLAUDE.md`.
