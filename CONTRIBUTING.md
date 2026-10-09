# Contribuer à THE ONE RULE

Ce document fixe **comment le travail entre dans le dépôt** : branches,
commits, pull requests, revue, déploiement. Les décisions de conception et les
pièges déjà payés vivent dans [`CLAUDE.md`](CLAUDE.md) — à lire avant de
toucher au code.

> **Langue** : tout en français — code, commentaires, commits, PR, revues.

---

## 1. Le cycle d'un changement

```
master ──┬──────────────────────────────── merge ──▶ master
         └─ fix/reprise-lien-anonyme ── PR ─┘
             commits · CI verte · revue
```

1. Partir de `master` à jour, sur une branche nommée (§2).
2. Des commits qui se lisent seuls (§3), chacun vérifié (§5).
3. Une PR vers `master`, avec son gabarit rempli (§4).
4. CI verte, revue, puis **fusion par commit de fusion** (§4).
5. Déploiement par Pierre, dans l'ordre du §6.

`master` ne reçoit **jamais** de push direct : tout passe par une PR, ne
serait-ce que pour que la CI ait tourné sur la tête exacte qui est fusionnée.

## 2. Les branches

`<type>/<sujet-court>`, en minuscules, mots séparés par des tirets :

| type | pour |
|---|---|
| `feat/` | une fonctionnalité de jeu ou de produit |
| `fix/` | un défaut constaté (de préférence : celui qu'on a mesuré) |
| `perf/` | une amélioration mesurée avant et après |
| `refactor/` | un changement de structure sans changement de comportement |
| `test/` | tests seuls |
| `docs/` | documentation seule |
| `ci/` | intégration continue, flux de déploiement |
| `chore/` | dépendances, nettoyage, outillage |
| `audit/` | un audit et ses correctifs, point par point |
| `claude/` | réservé aux sessions d'agent, nommées par l'outil |

Exemples : `fix/seconde-lever-du-doigt`, `feat/partie-rapide`,
`perf/hud-ecritures`.

Une branche **fusionnée est supprimée** (le bouton de GitHub après la fusion
suffit) : l'historique garde ses commits, la liste des branches ne garde que
le travail en cours. Une branche qui contient des commits de quelqu'un
d'autre ne se réécrit jamais (pas de `rebase`, pas de `push --force`) ; sur
SA branche, avant d'ouvrir la PR, on fait ce qu'on veut.

## 3. Les commits

**Le sujet** — une ligne, lisible dans `git log --oneline` :

```
<domaine> : <ce qui change, dit par son effet>
```

- `domaine` : `jeu`, `solo`, `multi`, `salons`, `api`, `comptes`, `ui`,
  `perf`, `sécurité`, `tests`, `ci`, `docs`, `dépendances`, `nettoyage` ;
- l'effet, pas l'opération : « la reprise ne perd plus l'ami arrivé par un
  lien », pas « modifie attemptRejoin » ;
- visé à 72 caractères, 100 au plus.

**Le corps** — c'est lui qui rend un commit relisible dans six mois :

1. le **symptôme observé** (ce qu'un joueur, un test ou une mesure a vu) ;
2. la **cause exacte** ;
3. **pourquoi ce correctif** plutôt qu'un autre ;
4. les **chiffres mesurés**, avant et après ;
5. comment c'est **vérifié**, et que le test a des dents (§5).

Pas un journal de modifications : le diff dit déjà quels fichiers ont bougé.
Un commit = une idée. Un message accentué s'écrit dans un fichier et se
commite avec `git commit -F fichier`.

## 4. Les pull requests

- Le gabarit (`.github/pull_request_template.md`) se remplit en entier ; une
  section sans objet se dit « sans objet », elle ne se supprime pas.
- **CI verte sur la tête de la PR**, sans exception. Un test ne se désactive
  jamais pour passer ; un échec intermittent se diagnostique (`CLAUDE.md` §2).
- **Commit de fusion, pas de squash.** Les commits de ce dépôt portent chacun
  un point documenté et ses chiffres : les écraser en un seul perdrait
  exactement ce qui fait la valeur de l'historique.
- Une PR qui prend une **décision d'architecture** — une frontière entre
  couches, un choix d'hébergement, une règle sur ce qui voyage — l'écrit dans
  une ADR (`docs/adr/`, gabarit `0000-gabarit.md`) dans la même PR. Une ADR
  acceptée ne se réécrit pas : une nouvelle la remplace.
- Une PR qui touche le **protocole** (`shared/protocol.ts`, ce que se disent
  client et serveur) le dit en titre de section « Déploiement », avec l'ordre
  à suivre.

## 5. Vérifier avant de pousser

Les commandes de la CI, dans l'ordre (détail dans le [README](README.md)) :

```bash
npm run lint && npm run typecheck && npm run coverage && npm run build && npm run taille
npm run e2e && npm run e2e:navigateur     # seuls, machine au repos
npm run integration                       # si server/, shared/ ou le Dockerfile bougent
```

**Un test doit avoir des dents** : casser le correctif, voir le test tomber,
restaurer. Plusieurs tests de ce dépôt passaient par chance.

## 6. Déployer

Deux services, déployés **par Pierre** :

- les **salons** (Fly) — par le flux manuel « Déploiement des salons »
  (*Actions → Run workflow*) ou `fly deploy` ; retour arrière par « Retour
  arrière des salons » ;
- le **front** (Vercel) — `vercel --prod`, retour arrière par *Promote to
  Production* sur le déploiement précédent.

**Fly d'abord, Vercel ensuite** dès que le protocole bouge : un client plus
récent que son serveur a déjà planté la production (30/09/2026). Procédure
complète : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).
