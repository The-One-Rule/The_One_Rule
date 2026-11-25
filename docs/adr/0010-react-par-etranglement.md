# 0010 — React par étranglement, un écran à la fois

- **Statut** : Acceptée pour Réglages. Les autres écrans feuilles restent à migrer.
- **Date** : 25/11/2026

## Contexte

`main.ts` pilotait tous les écrans. Une branche expérimentale (`test_migration_react`, 15/10) rendait tout le HTML en composants statiques et annonçait +74 Ko gzip hors Vite. Elle n'a pas été fusionnée : un Shell sans interaction ne livrait rien, et `flushSync` y était un choix de design.

## Décision

React 19 n'entre que là où il possède un écran.

- `src/nav.ts` est le seul endroit qui pose `hidden`. `main.ts` appelle `montre`.
- Un écran migré vit dans `src/features/<écran>/`. `main.ts` ne cite plus ses identifiants.
- Réglages est le premier : il lit `progress` et demande les effets de bord (son, thème, langue, canvas) par un objet `EffetsReglages`. Pas de magasin global.
- La boutique suit : l'achat reste dans `game/boutique.ts`. S'il échoue, une phrase s'affiche et les pièces ne bougent pas. Le plateau porté est un effet (`appliqueSkin`), pas du dessin React.
- Le composant se démonte quand on quitte l'écran. L'abonnement `souscrisReglages` se retire avec lui.
- `flushSync` n'est pas utilisé au démarrage. Il ne sert que dans les tests, pour lire le DOM tout de suite.

Les clés inconnues d'un message WebSocket restent ignorées (un champ facultatif n'incrémente pas `PROTOCOL_VERSION`). Une valeur du mauvais type est refusée avant toute mutation. Voir `valideClient`.

Le mode classé (`api/_ranked.ts`) est retiré. L'écran Classement, lui, est le podium de `api/perf.ts`. Il n'est pas encore migré.

## Budget

Chargement initial, build Vite du 25/11 :

| | avant | après Réglages et boutique |
|---|---|---|
| JS d'entrée, gzip niveau 9 | 110,8 Ko | 179,1 Ko |
| CSS, gzip niveau 9 | 35,6 Ko | 35,6 Ko |
| HTML, gzip (rapport Vite) | 34,5 Ko | 33,1 Ko |

La hausse du JS est React et ReactDOM dans le paquet d'entrée, parce que l'écran est monté avec le jeu. Le plafond du cliquet passe de 120 Ko à 190 Ko, au-dessus de 179,1. On ne le relève pas pour absorber les écrans suivants.

## Conséquences

La boutique est migrée. Classement, Amis et Compte restent : `ouvreAmis` écrit encore dans le profil (`profilAmisDit`), donc les trois bougent ensemble. Le jeu, le HUD et le salon restent impératifs.
