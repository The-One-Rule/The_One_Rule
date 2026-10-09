# 0005 — Comptes optionnels, fusion par union et maximum

- **Statut** : Acceptée
- **Date** : rétro-documentée le 09/10/2026 ; décision d'origine à la
  livraison des comptes (septembre 2026)
- **Décideur** : Pierre (comptes demandés), conception de la fusion

## Contexte

Les joueurs réclamaient des comptes (garder sa progression d'un appareil à
l'autre, se comparer). Mais 74 à 76 % des visiteurs repartent sans lancer une
seule partie : tout ce qui se place **devant** la première partie coûte des
joueurs. Et chaque nouveauté « a juste besoin » d'un compte — six mois plus
tard, le jeu en exige un sans que personne l'ait décidé.

## Décision

1. **Aucune fonctionnalité de jeu ne dépend du compte.** Le compte est une
   couche au-dessus de l'identité d'appareil (`localStorage`), jamais un
   préalable. Absent, faux ou périmé, un jeton vaut **anonyme**, sans erreur.
2. **La fusion est une union et un maximum, jamais une affectation**
   (`shared/compte.ts`) : idempotente, commutative, monotone.
3. Elle n'a lieu **qu'une fois par appareil** (`revendiquePar`).

## Conséquences

- Le jeu se joue entièrement sans compte, et sans aucune variable de
  déploiement des comptes.
- Doubles onglets, reprises réseau et synchros concurrentes sont inoffensifs
  par construction.
- Un champ ajouté au carnet doit être branché aux trois bouts (`majCarnet`,
  `fusionne`, le nettoyage de `api/moi.ts`) — `tests/carnet-voyage.test.ts`
  retire chaque clé à tour de rôle et exige qu'elle survive au voyage.
- Une liste d'amis EST un compte : elle seule l'exige, aucun chemin de jeu.
- **Gardée par** `tests/invariants-compte.test.ts` (aucun import du compte
  depuis le moteur ni la logique de match, aucun `if` qui ferait décider le
  compte).

## Références

`CLAUDE.md` §6 n°12 et n°13, §12 « Comptes optionnels ».
