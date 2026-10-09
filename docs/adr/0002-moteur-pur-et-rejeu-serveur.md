# 0002 — Un moteur pur, que le serveur rejoue

- **Statut** : Acceptée
- **Date** : rétro-documentée le 09/10/2026 ; décision d'origine à la phase 1
  (août 2026), avant le mode classé
- **Décideur** : conception d'origine, confirmée par chaque lot depuis

## Contexte

Un score qu'on affiche à côté de celui des autres — classement du jour, amis
— ne vaut que s'il est vérifiable. Un client peut envoyer n'importe quel
score ; il faut pouvoir **rejouer** le run côté serveur et retrouver le même
résultat. Et le multijoueur doit pouvoir reconstruire une manche identique
sur dix appareils sans la transmettre (ADR 0003).

Les deux exigent la même chose : que le calcul d'une manche et de son verdict
soit **déterministe et portable** — mêmes entrées, même sortie, sur un
navigateur, sur Node et sur l'edge.

## Décision

`src/engine/` est **pur** :

- aucun DOM, aucune API de navigateur ;
- aucune horloge : les instants sont des paramètres ;
- aucun hasard qui ne vienne d'un `Rng` seedé (`rng.ts`) ;
- il n'importe que lui-même et `shared/`.

Le run du jour soumis par un client est rejoué par `verifyRun`
(`src/engine/verify.ts`), appelé par `api/perf.ts`, sur le même catalogue que
celui que le client a joué (`catalogue`, `capacites` dans la revendication).

## Conséquences

- Le classement et la comparaison entre amis ne contiennent que du vérifié
  (ADR 0006).
- Toute horloge, tout tirage, tout accès au stockage vit hors du moteur et lui
  est **passé** : `Session` (`src/game/`) porte l'horloge, le moteur reçoit des
  millisecondes.
- Une modification du contenu (règles, consignes, pondérations, loi de
  tirage) change les manches jouées : `VERSION_CONTENU` est **calculée** depuis
  le contenu (`src/engine/version.ts`) et sépare les classements.
- ⚠️ Limite connue : `verifyRun` prouve qu'un journal est **cohérent**, pas
  qu'un humain l'a produit.
- **Gardée par** `tests/architecture.test.ts` (imports, horloges, hasard,
  API de navigateur), éprouvé en glissant un `Date.now()` et un import du
  client dans `rng.ts`.

## Références

`CLAUDE.md` §4, §6 n°3 et n°14, §12 « Comptes optionnels », « Le rejeu
serveur jugeait les runs de téléphone sur d'AUTRES manches ».
