# 0004 — Salons en mémoire, sur une seule instance

- **Statut** : Acceptée (dette assumée, voir « Remplacement »)
- **Date** : rétro-documentée le 09/10/2026 ; décision d'origine au premier
  déploiement Fly (14/08/2026), confirmée après la panne du 27/08/2026
- **Décideur** : conception d'origine

## Contexte

Un salon vit quelques minutes, entre quelques amis. Le stocker dans une base
partagée demanderait un service de plus, de la latence sur chaque manche et
une synchronisation entre instances — pour un jeu dont toute la charge tient
dans **4,3 % d'un cœur** à 20 salons de 10 joueurs (mesuré, phase 4).

## Décision

Les salons vivent **dans la mémoire du processus** de `server/index.ts`, sur
**une seule machine Fly** (`shared-cpu-1x`, 512 Mo, `auto_stop_machines =
"off"`).

## Conséquences

- ⚠️ **Deux instances = deux jeux de salons disjoints** : un joueur routé sur
  l'autre machine lit « SALON INTROUVABLE ». C'est arrivé le 27/08/2026 : Fly
  provisionne deux machines par défaut, et `min_machines_running = 1` est un
  minimum, pas un plafond. D'où `fly scale count 1` après chaque déploiement,
  vérifié par `scripts/check-salons.mjs` — étapes intégrées au flux
  « Déploiement des salons ».
- Un déploiement ou un redémarrage **perd les parties en cours** (fermeture
  propre en 1001). D'où le refus de déployer quand `/health` compte des salons.
- Une seule machine porte tous les joueurs : d'où les limites de débit par
  socket et par adresse (`server/debit.ts`), un client hostile pouvant sinon
  la saturer (mesuré : 96 % d'un cœur).

## Remplacement

Le jour où il faut plus d'une instance (charge, régions, déploiement sans
perte), cette ADR est remplacée : salons dans un stockage partagé, ou
routage collant par code de salon. Pas avant — c'est une décision de jeu ici,
pas d'exploitation.

## Références

`CLAUDE.md` §9, §10 ; `fly.toml` ; `scripts/check-salons.mjs` ;
`.github/workflows/deploiement-salons.yml`.
