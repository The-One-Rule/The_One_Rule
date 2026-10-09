# 0006 — Ce qui est opposable à autrui est rejoué

- **Statut** : Acceptée
- **Date** : rétro-documentée le 09/10/2026 ; décision d'origine au
  classement du jour (septembre 2026)
- **Décideur** : conception, à la livraison des performances et des amis

## Contexte

Deux sortes de données montent du client : des **affirmations** (carnet,
série, records d'entraînement — utiles au joueur, invérifiables) et des
**runs du jour**, que le serveur peut rejouer (ADR 0002). Les mélanger ferait
démarrer un classement sur des faits invérifiables. Et ce qu'un classement
publie est public pour toujours.

## Décision

- La table `performance` ne contient que du **rejoué** par `verifyRun`, et
  seul ce qui est `verifiee` et jugé `humain` par l'anti-triche alimente un
  classement — filtré par le DÉPÔT, pas par l'affichage.
- Les agrégats (`utilisateur.agregats`) ne touchent jamais un classement.
- Un classement ne publie que `rang`, `pseudo`, `glyphe`, `valeur`, `valeur2`
  et `moi` — **jamais un identifiant de compte**.
- Forme **quotidienne et entre amis**, pas mondiale et permanente : une
  graine ne vaut d'être forgée que 24 h, et un cercle d'amis rend la triche
  sociale plutôt que technique.

## Conséquences

- La limite de fond reste : un journal cohérent forgé hors ligne passe le
  rejeu. Elle est bornée par la forme quotidienne et l'unicité d'une
  soumission par compte et par jour.
- Pas de classement permanent tant que cette limite n'a pas de réponse.
- **Gardée par** les tests de `api/perf` et `api/amis` qui comparent la liste
  EXACTE des clés publiées et cherchent l'identifiant dans la réponse brute.

## Références

`CLAUDE.md` §6 n°14, §12 « Le classement du jour », « Les amis » ;
`api/perf.ts`, `api/_depot.ts`.
