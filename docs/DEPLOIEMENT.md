# Déploiement — The One Rule

Deux services séparés, et ils ne peuvent pas vivre au même endroit :

| | où | pourquoi |
|---|---|---|
| Front (jeu, solo, API edge) | **Vercel** | statique + fonctions edge |
| Serveur de salons (WebSocket) | **Fly.io** ou Railway | Vercel ne maintient pas de WebSocket ouverte |

---

## 1. Le serveur de salons — Fly.io

**Cette étape vient en premier, et ce n'est pas un détail d'ordre :** son URL est
une entrée de compilation du front (`VITE_WS_URL`, §2). La faire après coûte un
redéploiement complet de Vercel.

Installation, une fois pour toutes :

```powershell
# Windows
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
# macOS / Linux : curl -L https://fly.io/install.sh | sh
```

L'installateur ouvre une fenêtre UAC — il crée un lien symbolique `fly.exe` —
puis demande de **rouvrir le terminal** : il vient de modifier le PATH.

**Il faut une carte bancaire sur le compte Fly, et ce n'est pas contournable
ici.** Depuis octobre 2024, un compte neuf n'a plus d'allocation gratuite mais un
essai de 2 heures-machine, dont les machines **s'arrêtent d'office au bout de 5
minutes d'exécution**. Nos salons vivent en mémoire : une machine qui s'arrête
tue toutes les parties en cours, ce qui est exactement ce que
`auto_stop_machines = "off"` existe pour empêcher. Une `shared-cpu-1x` de 512 Mo
allumée en permanence tourne autour de 2 $ par mois, et Fly exonère les factures
de moins de 5 $ sur les organisations personnelles.

```bash
fly auth login

# depuis la racine du projet (fly.toml y est déjà)
fly launch --no-deploy      # accepte le fly.toml existant, choisis un nom
fly deploy
```

Récupère l'URL affichée (`https://ton-app.fly.dev`) et vérifie la sonde :

```bash
curl https://ton-app.fly.dev/health
# {"ok":true,"rooms":0,"players":0,"uptime":12}
```

Cette sonde est servie **sur le même port que la WebSocket** : `fly.toml` la
tape toutes les 30 s, et une instance qui n'y répond pas est déclarée morte et
redémarrée en boucle.

Puis **verrouille les origines**. Tant que ce secret n'est pas posé, le serveur
refuse toute connexion navigateur en production — c'est volontaire, et c'est
testé (`tests/origin.test.ts`) :

```bash
fly secrets set ALLOWED_ORIGINS="https://www.theonerule.party,https://theonerule.party,https://the-one-rule-rho.vercel.app"
```

Plusieurs origines se séparent par des virgules. L'URL WebSocket à donner au
front est la même qu'au-dessus, en `wss://` : `wss://ton-app.fly.dev`.

**Chaque domaine ajouté doit repasser ici.** C'est la panne la plus sournoise
du projet : le solo continue de tourner, seul le multijoueur tombe, et le
message ressemble à une panne de serveur. Vérifié en une commande, depuis la
racine du dépôt :

```bash
node -e "import('ws').then(({default:W})=>{const w=new W('wss://the-one-rule-salons.fly.dev',{origin:'https://www.theonerule.party'});w.on('open',()=>{console.log('ACCEPTE');w.close()});w.on('unexpected-response',(_q,r)=>console.log('REFUSE',r.statusCode))})"
```

Le journal de démarrage dit lequel des deux cas s'applique — il affiche soit la
liste des origines autorisées, soit un avertissement explicite.

### Railway, en alternative

Railway détecte le `Dockerfile` tout seul. Crée le projet depuis le dépôt,
ajoute la variable `ALLOWED_ORIGINS`, et prends l'URL publique en `wss://`.

---

## 2. Le front — Vercel

Importe le dépôt (le `vercel.json` est déjà là), puis règle les variables
d'environnement **avant** le premier build — Vite les inline à la compilation,
les changer après exige un redéploiement :

| variable | valeur | note |
|---|---|---|
| `VITE_WS_URL` | `wss://ton-app.fly.dev` | **`wss://`**, jamais `ws://` |
| `VITE_COLLECT_URL` | `/api/collect` | inutile sans le stockage du §5 |
| `VITE_RANKED_URL` | *(vide)* | à laisser vide : la fonction classée est retirée, le podium est `perf` |

Les routes des comptes (`VITE_AUTH_URL`, `VITE_MOI_URL`, `VITE_PERF_URL`,
`VITE_AMIS_URL`) ont pour défaut les fonctions du dépôt : rien à poser.

---

## 2 bis. Les comptes — optionnels

Sans ces réglages, le bouton de connexion reste masqué et le jeu se comporte
exactement comme sans comptes : aucune fonctionnalité de jeu n'en dépend.

1. Un projet **Supabase**, puis les migrations **dans l'ordre** :
   `supabase/migrations/0001_comptes.sql` → `0005_purge_performances_supprimees.sql`.
2. Deux applications OAuth (**Google**, **Discord**), avec pour URL de retour
   `https://www.theonerule.party/api/authcb`.
3. Les variables, côté **Vercel** : `TOR_AUTH_SECRET`, `TOR_APP_URL`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID/SECRET`,
   `DISCORD_CLIENT_ID/SECRET` — et côté **Fly** : `TOR_AUTH_SECRET`, **le même**
   (le serveur de salons vérifie les jetons sans base). `fly secrets set`
   redémarre la machine : à faire quand personne ne joue.

---

## 3. Les quatre pièges qui coûtent une soirée

**`ws://` depuis une page `https://`** — le navigateur bloque silencieusement,
sans message lisible. Si le multijoueur « ne marche pas » en production alors
qu'il marche en local, c'est ça dans neuf cas sur dix.

**`ALLOWED_ORIGINS` oublié** — le deuxième cas le plus probable, et il ressemble
beaucoup au premier vu du navigateur : la socket est refusée à la poignée de
main. La différence se voit dans les logs du serveur, qui annoncent au démarrage
que toute connexion sera refusée.

**Une seule instance — et `fly.toml` ne suffit PAS à l'obtenir.** Les salons
vivent en mémoire : deux machines = deux jeux de salons disjoints, et un joueur
routé sur la mauvaise ne trouvera jamais le code de son ami.

`min_machines_running = 1` est un **minimum, pas un plafond**. Fly provisionne
deux machines par défaut pour la haute disponibilité, et ce réglage ne l'en
empêche pas. C'est arrivé en production le 27/08/2026 : deux machines, toutes
deux en `cdg` — donc même pas une histoire de distance, juste de répartition de
charge. Symptôme côté joueur : **« SALON INTROUVABLE » à chaque tentative**, ce
qui ressemble à une faute de frappe sur le code. Aucune erreur nulle part, les
deux joueurs voient un serveur qui répond parfaitement.

```bash
fly scale count 1 --app the-one-rule-salons
node scripts/check-salons.mjs https://the-one-rule-salons.fly.dev
```

Le sondage compare le champ `instance` de `/health` sur quatorze appels. **À
relancer après chaque `fly deploy`** : le nombre de machines est une décision de
jeu ici, pas une décision d'exploitation, et rien dans le dépôt ne peut
l'imposer à ta place. Ne remonte pas en échelle tant que les salons ne sont pas
dans un stockage partagé.

**Redémarrage = parties perdues.** Un déploiement coupe les salons en cours. Le
serveur ferme proprement ses sockets sur SIGTERM (code 1001, « going away »),
donc les clients le voient tout de suite au lieu de croire à un gel — mais la
partie est perdue quand même. Ne déploie pas pendant la soirée de test.

---

## 4. Avant d'inviter qui que ce soit

La CI (`.github/workflows/verification.yml`) refait tout ce qui suit sur
chaque PR. En local :

```bash
npm run lint && npm run typecheck && npm run coverage && npm run build
npm run e2e && npm run e2e:navigateur      # seuls, machine au repos
npm run integration                        # l'image reconstituée et lancée
```

L'e2e vérifie aussi la sonde `/health`, sur le même port que les sockets.

Pour éprouver la vraie image Docker sans déployer :

```bash
docker build -t one-rule-salons .
docker run --rm -p 8080:8080 -e ALLOWED_ORIGINS=https://integration.theonerule.test one-rule-salons
node scripts/integration-image.mjs --url http://localhost:8080
```

### Déployer et revenir en arrière depuis GitHub

Deux flux **manuels** (onglet *Actions* → *Run workflow*), jamais déclenchés
par un push. Prérequis : le secret `FLY_API_TOKEN` (`fly tokens create deploy`)
dans l'environnement `production` du dépôt, idéalement protégé par une règle
*Required reviewers*.

- **Déploiement des salons** — taper `DEPLOYER`. Vérification rapide, refus
  s'il y a des salons en cours (sauf « forcer »), `fly deploy`, `fly scale
  count 1`, `check-salons`. L'image en place AVANT est écrite au résumé.
- **Retour arrière des salons** — coller cette image. `fly deploy --image`,
  une machine, une instance, et `/health` doit annoncer l'image demandée.

Le front, lui, se déploie et se ramène depuis Vercel (*Deployments* →
*Promote to Production*). Si le retour arrière des salons défait une évolution
du protocole, le front qui l'attend doit revenir aussi.

Puis, dans l'ordre :

1. Ouvre le front déployé sur **deux téléphones en données mobiles** — pas en
   wifi local. C'est le seul moyen de tester la synchro d'horloge avec de la
   vraie latence, et c'est le risque technique numéro un du multijoueur.
2. Vérifie qu'une partie solo se lance (elle doit marcher même si le serveur de
   salons est éteint).
3. Coupe volontairement le serveur et recharge : le bouton MULTIJOUEUR doit
   disparaître proprement, sans casser le solo.

---

## 5. Ce qu'on mesure pendant la bêta

**Cette étape n'est pas optionnelle si tu veux des chiffres.** Sans stockage,
`api/collect.ts` retombe sur `console.log` : les logs d'exécution Vercel sont
éphémères et les *log drains* sont payants, donc D1 se lirait à l'œil pendant la
soirée et D7 serait tout simplement incalculable.

Dans Vercel, onglet **Storage → Upstash for Redis** (offre gratuite). Rien
d'autre à configurer : les événements partent dans une liste par jour de
réception, qui expire au bout de 40 jours.

**Les noms de variables dépendent du chemin d'installation**, et c'est un piège
qui a coûté un aller-retour : l'intégration **Marketplace** injecte
`KV_REST_API_URL` / `KV_REST_API_TOKEN`, l'intégration **Upstash directe**
injecte `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Même API REST
derrière. `api/collect.ts` et `scripts/pull.mjs` acceptent désormais les deux —
mais si tu vois `KV_URL` et `REDIS_URL` dans `vercel env ls` sans jumeau
`*_REST_API_*`, c'est que l'intégration n'a pas exposé l'API REST, et le runtime
edge ne peut pas ouvrir de connexion TCP : il lui faut la variante REST.

Redéploie une fois l'intégration branchée — la fonction lit ces variables à
l'exécution, mais le front, lui, a besoin de `VITE_COLLECT_URL` au build.

### La séquence, dans cet ordre

L'ordre n'est pas cosmétique : chaque cran rend le suivant vérifiable, et le
seul cran qu'on ne peut pas rattraper est le temps. Un D7 exige sept jours
**après** que la collecte soit vivante. Chaque journée passée à croire qu'on
mesure alors qu'on ne mesure pas est une journée reculée sur la décision.

1. **Storage → Upstash for Redis** dans le projet Vercel.
2. Variable `VITE_COLLECT_URL=/api/collect` (Production).
3. **Redéployer.** Pas « sauvegarder la variable » : redéployer. Vite inline
   cette valeur à la compilation, la poser sans rebuild ne fait strictement rien.
4. Vérifier le câblage — lecture seule, rien n'est écrit :

```bash
node scripts/check-deploy.mjs https://ton-app.vercel.app
```

5. Jouer **un vrai run** sur la production, puis vérifier que le stockage a
   retenu quelque chose :

```bash
node scripts/pull.mjs | node scripts/report.mjs
```

**`vercel env pull` ne suffit PAS pour ça, et c'est un piège.** Deux raisons
cumulées :

- sans argument, il télécharge l'environnement **`development`**, où les
  variables Upstash n'existent pas — elles sont sur *Production, Preview* ;
- et même avec `--environment production`, l'intégration marque ses variables
  comme **sensibles** : Vercel les renvoie **vides**, par conception.

Les identifiants se copient donc **à la main**, une fois, dans `.env.local` :
tableau de bord Upstash → ta base → l'encart `.env.local`. Il te faut
`KV_REST_API_URL` et `KV_REST_API_TOKEN` (les variantes REST : le runtime edge
n'ouvre pas de connexion TCP, donc `KV_URL` et `REDIS_URL` ne servent à rien
ici).

> ⚠️ `vercel env pull .env.local` **écrase** le fichier. Si tu l'utilises pour
> autre chose, remets ensuite ton `VITE_WS_URL=ws://localhost:8787` de dev et
> tes identifiants Upstash.

**Vérifier sans aucun identifiant.** `vercel logs <url>` diffuse les logs
d'exécution, et `api/collect.ts` a trois comportements distincts :

| état | ce qu'on voit dans les logs |
|---|---|
| Upstash OK | **rien** — les événements partent en Redis, silencieusement |
| Upstash absent | **une ligne JSON par événement** (repli `console.log`) |
| Upstash en échec | `collect_sink_error …` puis les lignes |

Laisser le flux ouvert, ouvrir le jeu dans un onglet, et lire. Le silence est
la bonne réponse.

6. Seulement là, inviter la cohorte.

**Le piège que le point 4 attrape.** Sans `VITE_COLLECT_URL` au build, le
module de mesure est totalement inerte : pas de bandeau, pas de file, aucune
requête, aucune erreur. Le jeu tourne parfaitement. C'est indistinguable d'un
déploiement sain tant qu'on ne va pas chercher les chiffres — c'est-à-dire une
semaine trop tard. Le script lit le bundle servi et dit si l'URL y a été
inlinée. Vérifié à deux faces : il échoue sur un build sans la variable et
passe sur un build avec.

Le point 5 n'est pas redondant : le point 4 prouve que le navigateur *enverra*,
pas que le serveur *retient*. Sans Upstash, `api/collect.ts` retombe sur
`console.log`, répond 204, et tout a l'air normal — mais les logs d'exécution
Vercel sont éphémères, donc D7 restera incalculable.

`pull.mjs` ressort le NDJSON brut, `report.mjs` le lit sans rien savoir de
Redis : c'est la raison pour laquelle rien de plus savant qu'une ligne n'est
stocké. Le rapport marche donc aussi sur un fichier, ou sur une sortie de
`vercel logs`.

Les seuils fixés au début du projet :

- **D1 ≥ 30 %**, **D7 ≥ 12 %**, session médiane **≥ 4 min**

Ce qui ne se mesure pas mais décide autant, et qui n'attend aucun stockage : à
observer pendant la soirée.

- relancent-ils une partie **sans qu'on le demande** ?
- ~~le chat vit-il **pendant les kill-cams** ?~~ — **réponse : non**, les
  joueurs soufflent pendant la pause plutôt que de lire (CLAUDE.md §12).
- quelqu'un **rit-il à voix haute** en voyant un autre se faire piéger ?
- le chat sert-il **pendant les premières manches** ? Si non, la fenêtre
  bavarde ne sert à rien et le facteur `1.45` de `tensionAt` doit descendre
  vers `1.15`.
