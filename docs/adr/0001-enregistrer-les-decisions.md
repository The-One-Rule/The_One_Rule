# 0001 — Enregistrer les décisions d'architecture dans des ADR

- **Statut** : Acceptée
- **Date** : 09/10/2026
- **Décideur** : proposée en phase 6 de l'audit, dans le cadre de la directive
  de Pierre (« que le nettoyage soit fait tel en entreprise … adr »)

## Contexte

Les décisions qui structurent le code vivaient dans `CLAUDE.md` (§6
« Décisions à ne pas défaire », §12 « Où en est le travail ») : un document de
près de 4 000 lignes, chronologique, où une décision et la panne qui l'a
imposée sont parfois séparées par des centaines de lignes. Il remplit son
rôle — une mémoire de travail —, mais il ne répond pas vite à « pourquoi le
moteur n'a-t-il pas le droit d'appeler `Date.now()` ? ».

## Décision

Chaque décision d'architecture a son ADR dans `docs/adr/`, numérotée, au
format du gabarit `0000-gabarit.md`. Une ADR acceptée ne se réécrit pas : on
la remplace par une nouvelle. `CLAUDE.md` garde l'historique, les pièges et
le détail ; l'ADR garde la décision.

## Conséquences

- Un contributeur trouve la raison d'une contrainte sans lire tout `CLAUDE.md`.
- Toute nouvelle décision structurante s'accompagne d'une ADR dans la même PR.
- Une directive de Pierre l'emporte toujours (`CLAUDE.md` §0) : l'ADR suit la
  décision, elle ne s'y oppose pas.

## Références

`CLAUDE.md` §0, §6 ; `docs/adr/README.md`.
