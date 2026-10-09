# 0009 — L'historique publié ne se réécrit pas ; il se rend lisible par le haut

- **Statut** : Acceptée
- **Date** : 09/10/2026
- **Décideur** : proposée en phase 7 de l'audit ; la directive de Pierre la
  laissait ouverte (« reconstruire proprement l'historique si tu veux
  vraiment le faire »)

## Contexte

Relevé de `master` au 09/10/2026 : 166 commits depuis le 04/09/2026, 18
fusions, 17 PR fusionnées (#1 à #17), aucune étiquette de version, un dépôt de
1,7 Mo. Les sujets de commit sont hétérogènes (« Phase 4, point 24 »,
« Bureau », « CI », des phrases entières), mais **chaque commit porte un corps
long** — symptôme, cause, chiffres — qui est la vraie valeur de cet
historique.

Réécrire (`rebase -i`, `filter-repo`, sujets harmonisés, commits regroupés)
donnerait un `git log --oneline` plus régulier. En échange :

- **tous les SHA changeraient** — ceux que citent `CLAUDE.md`, les messages de
  commit eux-mêmes (« corrigé au commit précédent », `329f154^`), les 17 PR,
  les liens partagés et les journaux de déploiement ;
- tout clone existant (le poste de Pierre, les sessions en cours) devrait être
  réinitialisé à la main, et un clone oublié repousserait l'ancien historique ;
- `master` exigerait un `push --force` sur une branche partagée ;
- **regrouper perdrait des corps de commit**, c'est-à-dire des mesures ;
- et aucun poids à gagner : 1,7 Mo, aucun binaire lourd (la v1 de 150 Ko est
  un texte, et elle est déjà retirée de l'arbre au point 41).

## Décision

1. **L'historique publié sur `master` n'est pas réécrit**, ni maintenant ni
   plus tard. Pas de `push --force` sur `master`, jamais.
2. Il se rend lisible **par le haut** :
   - les conventions de `CONTRIBUTING.md` valent pour tout commit à venir
     (branches `type/sujet`, sujet `domaine : effet`, fusion par commit de
     fusion) ;
   - `CHANGELOG.md` raconte le projet par PR fusionnée, ce qu'un
     `git log` brut ne fait pas ;
   - chaque déploiement de production reçoit une **étiquette datée**
     `AAAA.MM.JJ` (une seconde le même jour : `AAAA.MM.JJ.2`) sur le commit
     de `master` déployé — c'est ce qui manquait pour dire « qu'est-ce qui
     tourne en production ? » ;
   - les branches fusionnées sont supprimées.
3. Sur SA propre branche, avant d'ouvrir la PR, chacun réécrit ce qu'il veut.

## Conséquences

- Les SHA cités restent valides pour toujours.
- `git log --oneline` reste hétérogène avant le 09/10/2026 ; `CHANGELOG.md`
  et les titres de PR sont la lecture de haut niveau de cette période.
- Les étiquettes ne se rattrapent pas avec exactitude : le commit déployé à
  une date passée n'est connu que par les journaux Vercel et Fly. Elles
  commencent au prochain déploiement.

## Références

`CONTRIBUTING.md` ; `CHANGELOG.md` ; `CLAUDE.md` §11 ; phase 7 de l'audit
(`docs/audits/AUDIT-ARCHITECTURE.md`).
