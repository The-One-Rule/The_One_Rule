# Journal des versions

Ce qui change dans le jeu, PR par PR. Le **pourquoi** de chaque changement est
dans le corps des commits et dans [`CLAUDE.md`](CLAUDE.md) §12 ; ce journal en
est la table des matières.

À partir du prochain déploiement, chaque mise en production reçoit une
étiquette datée `AAAA.MM.JJ` sur le commit de `master` déployé
([ADR 0009](docs/adr/0009-historique-publie-non-reecrit.md)). Les entrées
antérieures sont datées par leur fusion, pas par leur déploiement : les deux
n'ont pas toujours coïncidé.

## Non publié

**Audit d'architecture, phases 3 à 7** — [#18](https://github.com/Alexestgrand/The_One_Rule/pull/18)

- *Tests* : requêtes Supabase figées, entrées malformées, concurrence, coupure
  réseau et deux onglets dans un vrai navigateur (deux pannes de reprise
  trouvées : l'ami arrivé par un lien ne revenait jamais seul), couverture
  avec cliquets.
- *Performance* : terrain qui ne se repeint plus derrière les menus, limites
  de débit du serveur de salons, compression du fil (÷4), routes d'amis moins
  profondes, 263 règles CSS mortes retirées, HUD qui n'écrit plus à
  l'identique (téléphone ×4 : 30 → 40-60 images/s).
- *CI/CD* : lint, couverture, build de production vérifié, image Docker
  lancée, deux e2e, audits de dépendances, Dependabot, préversions,
  déploiement et retour arrière des salons à la main.
- *Nettoyage* : README, documentation rangée dans `docs/`, types Node alignés
  sur la production, v1 autonome retirée, conventions de contribution,
  architecture et ADR, pureté du moteur gardée par un test.
- ⚠️ **Déploiement** : Fly d'abord (limites de débit, compression, reprise),
  puis Vercel.

## Septembre – octobre 2026

| fusion | PR | changement |
|---|---|---|
| 02/10 | [#17](https://github.com/Alexestgrand/The_One_Rule/pull/17) | Maquette appliquée : arrivée, multi d'abord, consigne dessinée, salon — et plus de « NE FAIS RIEN » |
| 30/09 | [#16](https://github.com/Alexestgrand/The_One_Rule/pull/16) | Salons qui plantaient en boucle, et session perdue après un jour |
| 30/09 | [#15](https://github.com/Alexestgrand/The_One_Rule/pull/15) | Lot « addiction » : relance en un geste, rival du jour, partie rapide |
| 27/09 | [#14](https://github.com/Alexestgrand/The_One_Rule/pull/14) | Lien d'ami qui pré-remplit, série multi remise à zéro, mémoire CI |
| 27/09 | [#13](https://github.com/Alexestgrand/The_One_Rule/pull/13) | Téléphone vivant : intensité gagnée, rupture à la mort, amis avec demande, accueil qui se découvre |
| 26/09 | [#12](https://github.com/Alexestgrand/The_One_Rule/pull/12) | Profil, émotes, montée de tension, MAINTENIR / GLISSER, audit des écrans |
| 25/09 | [#11](https://github.com/Alexestgrand/The_One_Rule/pull/11) | Le double appui : une consigne neuve, négociée sur le fil (multijoueur) |
| 25/09 | [#10](https://github.com/Alexestgrand/The_One_Rule/pull/10) | Plafond d'allure, CI, plateaux, profil joueur, amis, double appui |
| 25/09 | [#9](https://github.com/Alexestgrand/The_One_Rule/pull/9) | DÉJOUER retiré, et le temps mort des pièges coupé en deux |
| 25/09 | [#8](https://github.com/Alexestgrand/The_One_Rule/pull/8) | PARCOURS : refonte onboarding / récompenses, et retrait de l'écran ESCALIER |
| 18/09 | [#7](https://github.com/Alexestgrand/The_One_Rule/pull/7) | Paysage serré : le téléphone couché, et un terrain qui changeait de taille en partie |
| 18/09 | [#6](https://github.com/Alexestgrand/The_One_Rule/pull/6) | Polissage UI/UX, stabilité, et les flammes du pack OVERBURN |
| 17/09 | [#5](https://github.com/Alexestgrand/The_One_Rule/pull/5) | DÉJOUER, terrain debout, flammes, tutoriel joué : le lot Ystart |
| 07/09 | [#4](https://github.com/Alexestgrand/The_One_Rule/pull/4) | Correctifs du playtest du jour 247 (4ᵉ lot) |
| 07/09 | [#3](https://github.com/Alexestgrand/The_One_Rule/pull/3) | Correctifs du playtest du jour 247 (3ᵉ lot) |
| 06/09 | [#2](https://github.com/Alexestgrand/The_One_Rule/pull/2) | Correctifs du playtest du jour 247 (2ᵉ lot) |
| 06/09 | [#1](https://github.com/Alexestgrand/The_One_Rule/pull/1) | Correctifs du playtest du jour 247 (1er lot) |

Avant le 04/09/2026, l'historique n'a pas été importé sur GitHub ; le récit
de cette période est dans `CLAUDE.md` §8 et §12 et dans
[`docs/archives/`](docs/archives/).
