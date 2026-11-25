# Registre des décisions d'architecture (ADR)

Une ADR fixe **une** décision qui structure le code : le contexte qui l'a
imposée, ce qui a été décidé, ce que ça coûte. Elle se lit avant de défaire
quoi que ce soit qu'elle protège.

- **Immuable une fois acceptée** : on ne réécrit pas une ADR, on en écrit une
  nouvelle qui la **remplace** (statut « Remplacée par NNNN »).
- **Une directive de Pierre l'emporte** sur une ADR, comme sur toute ligne de
  `CLAUDE.md` (§0). L'ADR qui en résulte enregistre le changement.
- **Numérotée, jamais renumérotée.** Gabarit : [`0000-gabarit.md`](0000-gabarit.md).

Les ADR 0002 à 0008 sont **rétro-documentées** (phase 6 de l'audit,
09/10/2026) : les décisions étaient prises et appliquées depuis des semaines,
écrites jusque-là dans `CLAUDE.md` seulement. Chacune dit d'où elle vient.

| n° | décision | statut |
|---|---|---|
| [0001](0001-enregistrer-les-decisions.md) | Enregistrer les décisions d'architecture | Acceptée |
| [0002](0002-moteur-pur-et-rejeu-serveur.md) | Un moteur pur, que le serveur rejoue | Acceptée |
| [0003](0003-netcode-graine-et-index.md) | Le fil ne transporte ni scène ni coordonnée | Acceptée |
| [0004](0004-salons-en-memoire-instance-unique.md) | Salons en mémoire, sur une seule instance | Acceptée |
| [0005](0005-comptes-optionnels-et-fusion-monotone.md) | Comptes optionnels, fusion par union et maximum | Acceptée |
| [0006](0006-opposable-signifie-rejoue.md) | Ce qui est opposable à autrui est rejoué | Acceptée |
| [0007](0007-deux-hmac-synchrone-et-asynchrone.md) | Deux implémentations HMAC, un seul noyau | Acceptée |
| [0008](0008-negociation-sur-le-fil-et-ordre-de-deploiement.md) | Tout ce qui voyage est négocié ; Fly d'abord | Acceptée |
| [0009](0009-historique-publie-non-reecrit.md) | L'historique publié ne se réécrit pas | Acceptée |
