# THE ONE RULE

> *Sometimes, obeying is the mistake.*

Jeu de réflexes web, solo et multijoueur — [www.theonerule.party](https://www.theonerule.party).

Une **règle unique** est tirée pour toute la partie et reste affichée. Une
**consigne** change toutes les deux secondes environ. Quand la consigne demande
d'enfreindre la règle unique, la manche est un **piège** : la bonne réponse est
de *ne rien faire*. Le piège est le seul élément non copiable du jeu ; tout le
reste l'amplifie.

---

## Démarrer

Prérequis : **Node 22** (`engines` du `package.json`), npm 10.

```bash
npm ci
cp .env.example .env.local     # puis ajuster (voir « Configuration »)
npm run server                 # serveur de salons sur ws://localhost:8787
npm run dev                    # le jeu sur http://localhost:5173
```

Le solo tourne sans aucune variable ni aucun service. Le multijoueur demande le
serveur de salons (`npm run server`) et `VITE_WS_URL=ws://localhost:8787`.

## Vérifier

Les mêmes commandes que la CI (`.github/workflows/verification.yml`) :

| commande | ce qu'elle prouve |
|---|---|
| `npm run lint` | ESLint, réglé sur la justesse (pas de style) |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run coverage` | 1 355 tests vitest + seuils de couverture des couches pures |
| `npm run e2e` | serveur de salons réel, clients WebSocket réels (≈ 165 assertions) |
| `npm run e2e:navigateur` | le vrai client dans Chromium : coupure réseau, deux onglets (33 assertions) |
| `npm run integration` | l'image Fly reconstituée, lancée et sondée |
| `npm run build` puis `npm run taille` | paquet de production et plafonds de taille |

Les deux e2e jugent des délais réels : **les lancer seuls**, sans autre
processus qui charge la machine. Chromium est cherché à son chemin par défaut,
ou dans `CHROMIUM_PATH`.

## Organisation du dépôt

```
src/       le client (Vite, TypeScript, sans framework)
  engine/  moteur PUR : aucun DOM, aucune horloge, aucun hasard non seedé
server/    serveur de salons WebSocket (Fly.io)
shared/    protocole et logique pure partagés client ↔ serveur ↔ API
api/       fonctions edge Vercel (mesure, comptes, performances, amis)
supabase/  migrations SQL de la base des comptes
tests/     tests unitaires et d'intégration (vitest) ; e2e/ : les deux scénarios de bout en bout
scripts/   vérification de déploiement, mesure, taille du paquet
docs/      déploiement, audits, archives
```

La contrainte qui structure tout : **`src/engine/` est pur**. C'est ce qui
permet au serveur de rejouer un run pour le vérifier (`verifyRun`) et au
multijoueur de reconstruire chaque manche à partir d'une graine, sans jamais
transmettre de scène.

## Configuration

Toutes les variables sont facultatives : absentes, la fonctionnalité qu'elles
portent se tait, et le reste du jeu tourne.

| où | variable | rôle |
|---|---|---|
| front (build) | `VITE_WS_URL` | serveur de salons ; **`wss://`** en production |
| front (build) | `VITE_COLLECT_URL` | collecteur de mesure (`/api/collect`) |
| salons (Fly) | `ALLOWED_ORIGINS` | liste blanche des origines — **obligatoire** en production |
| salons + edge | `TOR_AUTH_SECRET` | signature des jetons de compte, la même des deux côtés |
| edge (Vercel) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | base des comptes |
| edge (Vercel) | `GOOGLE_CLIENT_ID/SECRET`, `DISCORD_CLIENT_ID/SECRET`, `TOR_APP_URL` | connexion OAuth |
| edge (Vercel) | `KV_REST_API_URL/TOKEN` (ou `UPSTASH_REDIS_REST_*`) | stockage de la mesure, limites de débit |

⚠️ Les `VITE_*` sont lues **à la compilation** : les changer sans redéployer ne
fait rien.

## Déployer

Deux services, déployés séparément — **Fly d'abord, Vercel ensuite** dès qu'une
évolution touche le protocole. Procédure, pièges et vérifications :
[`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — la mémoire de travail du projet : décisions à ne
  pas défaire, pièges déjà payés, état du travail. **À lire avant de toucher au
  code.**
- [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) — Vercel, Fly, comptes, mesure.
- [`docs/audits/`](docs/audits/) — l'audit d'architecture et son suivi point par
  point, l'audit UX.
- [`docs/archives/`](docs/archives/) — documents de conception périmés, gardés
  pour les raisons qu'ils expliquent.
