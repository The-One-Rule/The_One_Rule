# 0003 — Le fil ne transporte ni scène ni coordonnée

- **Statut** : Acceptée
- **Date** : rétro-documentée le 09/10/2026 ; décision d'origine au pivot
  multijoueur (août 2026)
- **Décideur** : conception d'origine

## Contexte

Dix joueurs reçoivent la même consigne au même instant ; chacun porte sa
propre règle unique. Transmettre la scène de chaque manche coûterait du
trafic, et surtout ouvrirait la porte au défaut tenu pour fatal dans ce
projet : un **aperçu qui contredit le verdict** (« le jeu triche »), si le
client dessine une chose et que le serveur en juge une autre.

## Décision

- Le serveur envoie `round { seed, idx, deadline, tirage? }` ; chaque client
  reconstruit la manche avec `buildMultiRound(seed, idx, règle, pool)` —
  `draftShared` (scène commune) puis `applyRule` (piège et déformations
  propres au joueur). Moteur pur (ADR 0002).
- Une action voyage comme un **index de pièce** et un instant projeté sur
  l'horloge serveur — jamais de coordonnée, jamais de durée personnelle.
- Le serveur est **autorité sur le temps** et reconstruit la position depuis
  l'entité ; le client juge de la même façon (`vueServeur`).
- Ce qui change le plateau (le pool de consignes) se décide au niveau du
  **salon**, pas du joueur : tout le monde voit le même tableau.

## Conséquences

- Trafic faible (0,92 Ko/s par client en match, ÷4 avec la compression).
- **Toute règle nouvelle ou modifiée se pense à travers le fil** : trois
  règles ont déjà été cassées par le transport alors qu'elles marchaient en
  solo (`CLAUDE.md` §11). `tests/rules.test.ts` couvre les propriétés.
- Le pool d'un salon est figé au lancement et transmis dans `match_start` ;
  « absent vaut non » (ADR 0008).

## Références

`CLAUDE.md` §4 « Netcode », §6 n°3, §11 ; `src/engine/multiround.ts`,
`server/match.ts`, `shared/protocol.ts`.
