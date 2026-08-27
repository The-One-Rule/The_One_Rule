# THE ONE RULE — Phase 1

Jeu de réflexes web. Une **règle unique** est tirée pour toute la partie et reste affichée en haut. Par-dessus, une **consigne** change toutes les deux secondes. Quand la consigne demande d'enfreindre la règle unique, la manche devient un **piège** et la bonne réponse bascule sur *ne rien faire*.

C'est le seul élément non copiable du jeu. Le reste (cosmétiques, ranked, boutique) est de l'amplification.

## Commandes

```bash
npm install
npm run dev        # serveur local
npm run test       # 137 tests
npm run typecheck
npm run build      # dist/
node inline.mjs    # dist/ → the-one-rule-v1.html, un seul fichier autonome
```

Aucune dépendance runtime. Vite, TypeScript et Vitest sont en dev uniquement.

## Architecture

```
shared/
  protocol     protocole client↔serveur, source unique, importé des deux côtés
server/
  match        logique de match PURE — règles, vies, verdicts, forfaits
  index        serveur ws : salons, ordonnancement, heartbeat, arrêt propre
  origin       liste blanche des origines (refus à la poignée de main)
src/
  engine/      PUR — aucun DOM, aucune horloge, aucun Math.random()
    rng        mulberry32 + helpers
    scene      placement sur grille 5×3, chevauchement impossible par construction
    instructions/  19 consignes paramétriques, dont 15 tactiles (pool multi)
    rules/     12 règles uniques nommées
    round      assemblage + détection du conflit macro↔micro
    multiround draftShared (scène commune) + applyRule (piège et déformations)
    resolve    verdict d'une action
    verify     rejeu serveur d'un run — la raison d'être de la pureté
    difficulty courbe de fenêtre, paliers, pièges forcés (solo uniquement)
  game/        orchestration — daily, session, quests, progress, replay
  net/         NetClient + ServerClock + glyphes de joueur, zéro DOM
  render/      canvas, HUD, et layout (placement des plaques, PUR et testé)
  ranked/      elo, antibot, client du mode classé
  analytics/   file groupée, sendBeacon, transport injectable
  audio/       WebAudio synthétisé, aucun fichier
api/           fonctions edge Vercel — collect, ranked
scripts/       pull, report, check-deploy, check-salons
```

**La contrainte structurante : `engine/` est pur.** Il reçoit un `Rng` seedé et des timestamps en paramètre. Ça paraît pédant aujourd'hui, mais c'est ce qui permettra en Phase 2 de rejouer une partie côté serveur pour valider un score. Un moteur qui touche au DOM rend l'anti-triche impossible sans réécriture.

## Le moteur de règles

Une consigne est un générateur, pas du code sur mesure :

```ts
gen(rng, level) → { text, specs, want }
```

Une règle unique agit par trois leviers, cumulables :

| Levier | Rôle | Exemples |
|---|---|---|
| `forbids` | ce round est-il un piège ? | LE SANG, LA POINTE, LE COLOSSE |
| `judge` | cette action enfreint-elle la règle ? | idem + LA SECONDE, LA MAIN GAUCHE |
| `transform` | déformer la présentation | LE MENTEUR, L'ÉCLAIR, LE DALTONIEN, LE JUMEAU |

Ajouter une consigne = un générateur de 10 lignes. Ajouter une règle unique = un objet avec un ou deux de ces leviers.

## Les tests, et pourquoi ils comptent

Deux d'entre eux protègent le seul risque fatal du projet — que le joueur pense que le jeu triche :

- **Unicité des cibles** : 3 000 générations par consigne, la cible désignée doit être l'unique entité satisfaisant l'énoncé. Une consigne ambiguë ne se voit pas en dix minutes de jeu et détruit la perception d'équité.
- **Taux de pièges** : entre 5 % et 28 % par règle piégeuse. C'est ce test qui a attrapé LE GAUCHER à 31 % (la moitié de l'écran interdite transformait un tiers des manches en « ne rien faire ») — le seuil a été ramené à la première colonne de la grille, soit 13,8 %.

Taux actuels : LE SANG 15,9 % · LA POINTE 20,1 % · LE GAUCHER 13,8 % · LE COLOSSE 8,3 % · LA VOYELLE 5,8 %.

Le troisième fichier monte l'application réelle dans un DOM simulé, déroule la boucle de jeu image par image et vérifie qu'un run va jusqu'à l'écran de fin.

Quatre autres protègent des pannes qui ne se voient pas :

- **Le serveur survit aux messages malformés.** `decodeClient` ne valide que la présence d'un `t` : un `input` sans `action` levait une exception non capturée qui **terminait le processus**, donc tous les salons, depuis une seule socket non authentifiée.
- **Aucune règle du pool multi n'est inerte** sur son porteur — comparaison à une règle témoin sans levier, plus un sondage du juge, puisque certaines règles ne déforment rien et se contentent de sanctionner un geste.
- **La mise en page ne peut pas osciller** : 8 100 tailles de fenêtre, aucune ne doit posséder de cycle. L'ancienne règle en avait 407.
- **La liste blanche du collecteur suit `EventName`** : un nom oublié partirait du navigateur, recevrait un 204, et n'arriverait jamais.

> **Attention aux tests qui prennent leur référence au mauvais endroit.** Deux tests e2e comparaient des vies lues dans un message antérieur au match, donc les vies de *réglage* : selon la règle unique tirée — donc selon le hasard — un joueur peut mourir légitimement avant la mesure, et l'écart constaté n'avait plus rien à voir avec ce que le test prétendait vérifier. Ils passaient par chance.

## Identité visuelle

Implémentation de « The One Rule · Identité, Phase 1 » (système Nocturne).

- **Sol** nuit `#161826`, ardoise `#232532`, fonds pleins indigo `#262a60` sur l'annonce de la règle et le verdict.
- **Accent** `#9184d9` — la règle unique et elle seule. Il ne touche jamais une pièce jouable.
- **Typographie** Inter 600 pour la consigne (jamais sous 34 px) et le logotype, Inter 500 partout ailleurs, JetBrains Mono 400 pour le HUD. Deux poids, comme le prescrit le document. Polices auto-hébergées : aucun appel externe, le jeu démarre hors ligne.
- **Le signe** : un panneau d'interdiction reconstruit avec le vocabulaire du jeu — le cadre est la règle, le disque est la pièce désignée, la barre est le refus d'agir. Grille de 96, cadre à 6, rayon 18, disque au rayon 19, barre d'angle à angle.

### Trois écarts au document, tous mécaniques

**1. Les pièces sont saturées, pas désaturées vers le sol.** Le document affaiblissait les couleurs de jeu pour que l'accent reste la couleur la plus chargée. Or les pièces portent l'information et la consigne *nomme* la couleur : un joueur qui confond deux pièces n'a aucun moyen de compenser. Les quatre teintes de l'identité sont conservées, saturées et écartées en clarté.

| ΔE minimal entre deux pièces | document | ici |
|---|---|---|
| vision normale | 62 | 77 |
| protanopie | 24 (indistinct) | 48 |
| deutéranopie | 22 (indistinct) | 40 |
| tritanopie | 19 (indistinct) | 41 |

`tests/palette.test.ts` verrouille ces seuils pour qu'une future passe esthétique ne puisse pas les défaire.

**2. Aplats, arêtes vives.** Le document arrondissait les pièces au cinquième de leur taille et les remplissait en dégradé. Un carré à 20 px de rayon glisse visuellement vers le rond, alors que les distinguer en 200 ms est une tâche du jeu ; et une pièce en dégradé n'a plus une couleur mais une moyenne. L'échelle de tailles du document est en revanche adoptée telle quelle : 60 / 84 / 118, rapport constant de 0,71.

**3. L'état PIÈGE est post-mortem.** Le document le listait parmi les états de pièce, en anneau accent et halo pulsant. Affiché pendant la manche, il désigne la réponse et supprime la seule mécanique du jeu. Il n'apparaît donc qu'après la mort, pendant le gel de 520 ms, pour montrer au joueur ce qu'il n'a pas vu.

Deux ajustements mineurs : les couleurs portent les noms d'identité (`garance`, `azur`, `jade`, `ambre`) dans le code et la marque, mais s'affichent en mots courts (ROUGE, BLEU, VERT, JAUNE) sur la ligne de consigne — le joueur a ~600 ms pour reconnaître le mot, pas pour déchiffrer un terme de teinturier. Et l'état SURVOL est abandonné : il n'existe pas dans un jeu de deux secondes, et pas du tout sur mobile.

## Son

Deux couches indépendantes, entièrement synthétisées — aucun fichier, aucun poids dans le bundle, démarrage hors ligne.

**La musique** est un séquenceur à *lookahead* : les notes sont programmées ~120 ms à l'avance sur l'horloge WebAudio, jamais sur `setTimeout`. C'est la seule façon d'obtenir un tempo stable — le fil principal est occupé par le rendu, et 20 ms de décalage sur une pulsation s'entendent. Le tempo monte de 104 à 150 BPM avec le niveau, et les couches s'ouvrent une à une (pulsation → contretemps → basse → arpège → tension). La difficulté ne se contente plus de raccourcir la fenêtre : elle s'entend.

**Les effets** : réussite montant sur une pentatonique (le combo ne sonne jamais faux), piège déjoué au timbre distinct, mort, échauffement, tic de manche, alerte d'urgence au dernier quart de la fenêtre, passage du fantôme.

Tout passe par un garde `safely()`. Le son est un agrément, jamais une dépendance : un navigateur dont WebAudio est incomplet doit donner un jeu silencieux, pas un jeu cassé. `tests/smoke.test.ts` utilise volontairement un stub WebAudio **partiel** pour le vérifier.

## Duel asynchrone

Le mode en ligne, sans backend, sans compte, sans appariement.

Un 1v1 temps réel exigerait de trouver un adversaire de niveau en moins de quinze secondes ; avec la population d'un lancement, la file est vide et le mode meurt en trois jours. On enregistre donc le run — graine, règle, instants de franchissement — et l'adversaire rejoue **exactement la même partie** avec cette progression affichée à côté de la sienne, en direct.

Le tout tient dans un fragment d'URL : un run de 40 manches fait moins de 220 caractères, splits en deltas base36 au centième de seconde. Le décodeur refuse un lien trafiqué (règle inconnue, splits qui reculent) plutôt que de planter. `tests/replay.test.ts` vérifie notamment que les deux joueurs obtiennent bien la même suite de manches.

Un duel se rejoue à volonté — c'est la même partie, la comparaison reste valable. Le run du jour, lui, garde son essai unique.

## Sensation de jeu

- **Cadre de temps** sur le canvas, qui se rétracte symétriquement autour de l'aire de jeu. Lisible en vision périphérique pendant que le regard balaie la grille : plus besoin de quitter la consigne des yeux. Il double la barre du HUD, il ne la remplace pas.
- **Particules** à la réussite, dans la couleur de la pièce cliquée. Bac de 96 préalloué, aucune allocation par frame.
- **Secousse** réservée à la mort, plus forte sur une infraction à la règle unique que sur une erreur ordinaire. Banalisée, elle ne dirait plus rien.
- **Alerte sonore** au dernier quart de la fenêtre.

## Rétention

- **Run du jour** : 40 manches, un seul essai, seed déterministe. Les 3 premières manches ne tuent pas.
- **Entraînement** : illimité, uniquement les règles déjà rencontrées, **échauffement inclus** et **allure réglable** (DÉCOUVERTE / NORMAL / RAPIDE). La surprise du run du jour est le seul contenu neuf, il ne faut pas la brûler.

> **Pourquoi une allure, et pourquoi seulement là.** La courbe suppose un joueur ayant automatisé la vérification de sa règle unique. Un débutant fait encore trois gestes conscients par manche — lire, confronter à sa règle, chercher la cible — et le deuxième coûte 300 à 500 ms tant qu'il n'est pas réflexe. À la manche 10 la fenêtre vaut 1080 ms pour un besoin réel de 1000 à 1300 : il est au bord, ce qu'un test réel a confirmé. On ne peut pas attendre que le geste devienne réflexe si le joueur meurt avant.
>
> L'allure multiplie la **fenêtre**, jamais le tirage : `place()` consomme le RNG avant que la durée soit posée, donc deux allures produisent **exactement les mêmes scènes**. C'est ce qui permet de l'ajouter sans invalider une graine du jour ni un lien de défi — verrouillé par `tests/pace.test.ts`, qui compare les manches 0 à 44 champ par champ.
>
> Elle ne s'applique **qu'à l'entraînement**, et pas aux duels, qui passent pourtant par ce mode : un duel se compare aux temps de passage d'un fantôme, élargir sa fenêtre rendrait la comparaison fausse sans que personne ne le voie. Et `bestTraining` ne s'inscrit qu'à l'allure de référence — un record qui mélange les allures ne veut plus rien dire.
>
> L'échauffement, lui, était à **zéro en entraînement** contre trois dans le run du jour : le mode censé servir à apprendre tuait à la première faute, alors que l'épreuve pardonnait. C'était inversé.
- **3 quêtes** : présence (toujours faisable), exploration, et performance **calée sur la moyenne des 5 derniers runs**. Jamais un seuil fixe : « atteindre 30 » est un mur pour un débutant et une formalité pour un bon joueur.
- **Série avec un jour de grâce par semaine.** Non négociable : sans lui, le premier jour manqué détruit la série et le joueur ne revient jamais.
- **Teaser** : `DEMAIN · LE MENTEUR`, juste le nom. C'est le déclencheur de retour, placé au moment où l'émotion est maximale.
- **Accueil du débutant, en multijoueur** : une vie de plus pour une première partie, et le statut est affiché sur la plaque. Un nouveau invité par un ami meurt en trois manches devant cinq personnes et ne revient pas ; la vie de plus ne le fait pas gagner, elle lui laisse le temps de comprendre que la règle unique existe. Un handicap caché se découvre et transforme une victoire en fraude — affiché, il fait l'inverse, et c'est aussi la seule protection contre l'abus puisque le serveur ne peut pas vérifier la déclaration.

**Ce qui n'est pas mesuré ne compte pas.** Tout ce qui précède est une hypothèse, pas un résultat : la chaîne de mesure n'a jamais produit un événement stocké (voir § Mesure et § Ce qui n'est pas fait).

## Mesure

Quatre chiffres, et rien d'autre : **D1, D7, durée médiane de session, taux de partage**. Ce sont eux qui décident du passage de la Porte 1.

- `src/analytics/` — file d'attente groupée, envoi en `sendBeacon` (le seul qui survive à la fermeture d'onglet), transport injectable pour les tests. Un échec du collecteur ne peut pas remonter dans le jeu : `flush()` avale ses erreurs.
- `api/collect.ts` — fonction edge Vercel. Une ligne NDJSON par événement, poussée dans une liste Redis par jour de réception (Upstash en REST : le runtime edge n'ouvre pas de connexion TCP), avec expiration à 40 jours. Valide le nom d'événement contre une liste blanche, tronque les chaînes, plafonne le corps et la taille des lots. Ne journalise ni IP, ni user-agent, ni en-tête d'identification. Sans Redis configuré, retombe sur `console.log` — utilisable en local, mais sans mémoire, et donc sans D7.
- `scripts/pull.mjs` — ressort le NDJSON brut depuis Redis. Rien d'autre : le rapport n'a pas à savoir où les événements dorment.
- `scripts/report.mjs` — calcule les quatre chiffres, la courbe de rétention, les causes de mort, la difficulté par règle, **l'entonnoir social**, et il porte une **règle de décision écrite avant de connaître les chiffres** : sans elle, on construit ce qu'on avait envie de construire en rationalisant le résultat après coup.
- `scripts/check-deploy.mjs` — vérifie qu'un déploiement mesure vraiment. `VITE_COLLECT_URL` est lu par Vite **à la compilation** : la poser dans Vercel sans redéployer ne fait rien, et l'état résultant est indiscernable d'un déploiement sain — le jeu tourne, aucun bandeau, aucune requête, aucune erreur. Ça ne se découvre qu'en cherchant les chiffres, une semaine trop tard. C'est arrivé : la production a mesuré le vide pendant treize jours.

```bash
node scripts/pull.mjs | node scripts/report.mjs
node scripts/report.mjs events.ndjson
node scripts/check-deploy.mjs https://ton-app.vercel.app
```

Le rapport corrige les cohortes : pour Dn, il ne compte que les joueurs dont la cohorte a eu le temps d'atteindre le jour n. Sans ce filtre, les inscrits récents écrasent le chiffre vers le bas et le résultat ne veut rien dire.

Événements : `first_open`, `day_return`, `visit_end`, `run_start`, `run_end`, `quest_complete`, `share`, `duel_sent`, `duel_opened`, `invite_sent`, `invite_opened`, `optout`.

**L'entonnoir social se lit en trois crans**, comptés séparément parce qu'ils échouent pour des raisons différentes et que la réparation n'est pas la même : *envoyé* (le jeu donne-t-il envie d'être montré), *ouvert* (l'objet partagé donne-t-il envie de cliquer), *joué* (`run_start` porte un drapeau `duel`, sans lequel un défi relevé est indiscernable d'un entraînement). Les deux surfaces — duel asynchrone et invitation au salon — sont instrumentées symétriquement : n'en mesurer qu'une ferait lire « le social ne prend pas » là où c'est l'autre qui sert.

> La liste blanche de `api/collect.ts` est volontairement recopiée plutôt qu'importée de `src/` : le runtime edge ne doit pas tirer le jeu dans son bundle. Le prix de cette duplication est un test qui verrouille les deux listes — un nom oublié partirait du navigateur, recevrait un 204, et n'arriverait jamais.

> Les noms de variables Upstash dépendent du chemin d'installation : l'intégration **Marketplace** pose `KV_REST_API_URL` / `KV_REST_API_TOKEN`, l'intégration **directe** pose `UPSTASH_REDIS_REST_*`. Les deux sont acceptés. Ne lire qu'un seul jeu de noms était une panne muette de plus.

> **`vercel env pull` ne récupère pas ces identifiants**, pour deux raisons cumulées : sans argument il télécharge l'environnement `development`, où ils n'existent pas ; et l'intégration les marque *sensibles*, donc Vercel les renvoie vides même avec `--environment production`. Ils se copient à la main depuis le tableau de bord Upstash, une fois. Voir [DEPLOIEMENT.md](DEPLOIEMENT.md) §5, qui donne aussi une vérification **sans aucun identifiant**, par les logs d'exécution.

> **Et les valeurs sont nettoyées à la lecture** ([src/env.ts](src/env.ts)). Une variable traverse des mains, des interfaces web et des shells : `VITE_COLLECT_URL` est arrivée en production avec un **BOM UTF-8** collé devant, ajouté par Windows PowerShell en encodant une valeur passée par un tube. Chaque envoi partait sur `/%EF%BB%BF/api/collect` et recevait un 404 — jeu parfaitement fonctionnel, bandeau affiché, aucune erreur, et rien de collecté. Le vérificateur de déploiement passait même au vert, parce qu'il cherchait la sous-chaîne `/api/collect` que la valeur souillée contient.

**Vie privée.** Identifiant aléatoire local, aucun compte, aucun cookie, aucune donnée personnelle, aucun service tiers. Un bandeau court explique ce qui est mesuré et pourquoi ; le refus est persistant et coupe tout. Sans `VITE_COLLECT_URL`, le module est totalement inerte — pas de bandeau, pas de file, pas d'appel réseau. C'est le cas du fichier HTML autonome.

## Déploiement

Deux services, et ils ne peuvent pas vivre au même endroit : le front sur Vercel, le serveur de salons WebSocket sur Fly.io ou Railway — une fonction edge ne maintient pas de socket ouverte. `Dockerfile` et `fly.toml` sont dans le dépôt, la marche à suivre complète est dans **[DEPLOIEMENT.md](DEPLOIEMENT.md)**.

```bash
vercel                      # front : détection Vite automatique, api/ pris en charge
fly deploy                  # serveur de salons, sonde GET /health
```

Variables du front : `VITE_COLLECT_URL=/api/collect` pour la mesure, `VITE_WS_URL=wss://…` pour le multijoueur. Côté serveur de salons, `ALLOWED_ORIGINS` est obligatoire en production : sans lui, toute connexion navigateur est refusée.

## Phase 2 — le mode classé

### La validation serveur, raison d'être de la pureté du moteur

`src/engine/verify.ts` rejoue un run entier depuis la graine et un journal d'entrées. Il tourne à l'identique dans le navigateur et dans la fonction edge, parce que `engine/` n'a jamais eu le droit de toucher au DOM ni à l'horloge.

**Le serveur ne stocke jamais un score.** Il reçoit un journal, le rejoue, et le score est ce que le rejeu produit. Le journal enregistre l'*index* de la pièce cliquée, jamais des coordonnées d'écran : le serveur reconstruit la scène depuis la graine et n'a aucune idée de la résolution du joueur.

Le test qui compte est `navigateur → serveur` : pour **chacune des 12 règles**, une partie est jouée par une vraie `Session`, son journal est rejoué par le vérificateur, et les deux scores doivent coïncider. Un vérificateur qui refuse les runs honnêtes serait pire que pas de vérificateur — il bannirait les joueurs légitimes et laisserait passer ceux qui savent forger un journal propre.

### Détection d'automatisation

`src/ranked/antibot.ts` analyse la distribution des temps de réaction issus du **rejeu**, jamais de chiffres envoyés par le client. Quatre signaux : médiane sous le plancher physiologique (140 ms), coefficient de variation trop faible, proportion de réactions impossibles, absence totale d'hésitation sur un run long.

Le signal le plus fiable est la **régularité**, pas la vitesse : l'attention humaine fluctue toujours, un script non. Un bot qui ralentit à 300 ms pour se cacher reste détecté par son CV, et l'imiter revient à perdre son avantage.

Un run « douteux » compte pour le classement mais n'entre pas dans le vivier des fantômes — on ne fait pas affronter à tout le monde une partie possiblement truquée, sans sanctionner sur un doute.

> **Subtilité attrapée par les tests** : une manche « ne fais rien » se franchit en laissant filer le temps. L'enregistrer comme une réaction de 2400 ms polluerait la distribution et ferait passer un bot pour un humain en gonflant sa dispersion. Seules les manches franchies par une action produisent un délai.

### Classement

`src/ranked/elo.ts`, deux corrections au Elo scolaire imposées par la variance du jeu :

- **La marge compte.** Gagner 31 à 4 n'est pas gagner 19 à 18. Poids logarithmique borné entre 0,5 et 1,5, pour qu'un score fleuve ne fasse pas exploser le classement.
- **Plancher par division.** On ne redescend jamais sous une division atteinte. C'est ce qui empêche d'abandonner après trois défaites.

Divisions : BOIS → BRONZE → ARGENT → OR → PLATINE → OBSIDIENNE. K variable selon l'expérience. La fenêtre d'appariement s'élargit avec l'attente — mieux vaut un adversaire imparfait qu'une file vide.

### Appariement asynchrone

Pas de temps réel : le serveur sert le **run enregistré** d'un joueur de classement voisin, sur la même graine et la même règle. File vide → le run devient un étalon pour les suivants, et le joueur ne patiente jamais.

### API

`api/ranked.ts`, fonction edge, stockage derrière une interface `Store`. La version en mémoire fait tourner l'API en local ; pour passer en production on implémente `Store` sur Postgres ou KV — c'est le seul fichier à toucher.

```bash
VITE_RANKED_URL=/api/ranked   # vide = bouton CLASSÉ masqué, le reste fonctionne
```

Le client ne lève jamais : réseau coupé, il retombe sur l'entraînement et le dit.

## Multijoueur — salons simultanés (pivot .io)

Modèle BombParty adapté : salon par code de 4 lettres, tout le monde joue **chaque manche simultanément** sur la même scène, mais chacun porte une **règle unique différente, affichée publiquement**. Un piège est personnel — et les autres le voient venir : c'est le spectacle. 3 vies, élimination, **rotation des règles toutes les 8 manches**, dernier en vie gagne.

Cinq vitesses, décidées par l'hôte pour tout le salon — un réglage par joueur casserait la simultanéité, qui est tout le spectacle. `DÉCOUVERTE` (1,7) a été ajouté après un test réel : même en `LENT`, la fenêtre tombe à 1261 ms à la manche 20 et 976 à la manche 30. `LENT` ne supprimait pas le mur, il le déplaçait de dix manches. Les premières manches ne bougent pas — elles sont déjà au plafond `MAX_ROUND_MS` — donc le réglage n'agit que là où le mur se trouve : **+388 ms à la manche 20, +300 à la manche 30**.

**Netcode.** Aucune scène ne transite : le serveur envoie `{seed, idx, deadline}` et chaque client reconstruit la manche via `buildMultiRound(seed, idx, rule)` — `draftShared` (scène commune, RNG dérivé par hachage de `seed:idx`, accès direct à la manche N sans rejouer les précédentes) puis `applyRule` (piège + déformations, RNG dérivé de `seed:idx:ruleId`, donc identique chez le client et le serveur qui juge).

**Le pool multi est tactile, pour tout le monde, toujours.** La scène étant partagée, on ne peut pas servir des consignes différentes selon l'appareil sans casser le déterminisme — et un salon mélange par nature téléphones et PC. C'est donc la règle de l'appareil le moins capable : un joueur PC perd quatre consignes clavier, un joueur mobile ne perd plus de vies sur des manches qu'il ne pouvait pas jouer. Le premier coût est cosmétique, le second tuait des parties. Le serveur fait **autorité sur le temps** : dates serveur partout, horloge client reconstruite par ping (médiane d'échantillons, `ServerClock`), inputs horodatés côté client et **bornés serveur** (tolérance 120 ms, plancher `now − tolérance` pour empêcher l'antidatage).

- `shared/protocol.ts` — protocole typé unique, importé des deux côtés
- `server/match.ts` — logique de match **pure** (distribution/rotation des règles, vies, verdicts, forfaits) ; deux règles hors pool, chacune pour une impossibilité matérielle : LA MAIN GAUCHE (recevoir « tiens ESPACE » par rotation en pleine manche est injouable) et LA VOYELLE (elle ne piège que sur consignes clavier — voir ci-dessous — donc son porteur aurait une règle incapable de le piéger). Il reste exactement 10 règles pour 10 joueurs : marge zéro, verrouillée par un test
- `server/index.ts` — serveur ws : salons, ordonnancement des manches, clôture anticipée quand tous ont répondu, heartbeat ; `npm run server`
- `src/net/client.ts` — `NetClient` + `ServerClock`, zéro DOM

**Une règle du pool ne doit jamais être sans effet sur son porteur.** Une règle qui ne peut pas l'atteindre est un avantage gratuit et invisible — pire qu'une règle dure. LA VOYELLE en est sortie pour ça. L'ACCÉLÉRATION y était sans qu'on le voie : sa déformation porte sur la **durée**, et le serveur calculait la fenêtre depuis la manche partagée, donc sans elle. Il juge maintenant chaque geste sur la fenêtre **personnelle**, et la barre de temps du client porte le même facteur — sinon on corrige le serveur en transformant le symptôme en « je clique dans les temps affichés et ça ne compte pas », ce qui est pire. Un test vérifie qu'aucune règle du pool n'est inerte.

**Une coupure n'est pas une défaite.** Les identifiants étaient attribués par connexion : une micro-coupure éliminait définitivement, et revenir donnait un siège de spectateur. Sur mobile — bascule d'application, tunnel, changement de cellule — c'est le cas normal. Le siège est désormais gardé 25 s (`RECONNECT_GRACE_MS`), l'absent ne joue **aucune** manche (`Seat.away`, sinon il était éliminé en cinq secondes, bien avant de pouvoir revenir), il reprend son identifiant par sa clé locale stable, et le serveur lui **renvoie un `match_start`** pour qu'il puisse se reconstruire — sans quoi il récupérait son siège mais restait bloqué au salon jusqu'à la fin. Côté client, la reprise est automatique : trois essais espacés, sans rien démonter.

**Accueil du débutant.** Une vie de plus pour une première partie, et le statut est **annoncé sur la plaque**. Ce n'est pas décoratif : le serveur n'a aucune mémoire entre les salons, il ne peut donc pas vérifier la déclaration — la seule garantie contre l'abus est que tout le salon le voie.

Vérifié par `tests/multi.test.ts` (déterminisme, rotation, match complet simulé, horloge, fenêtre personnelle, accueil du débutant) et **`e2e.mjs`** : serveur réel et clients ws réels — un match à trois profils distincts (juste / clique-tout / absent), la reprise de siège après coupure, l'accueil du débutant, et **douze messages malformés** que le serveur doit survivre. Ce dernier bloc est une régression : un `{"t":"input","round":0}` sans `action` levait une exception non capturée dans le gestionnaire `message`, ce qui **terminait le processus** — donc tous les salons de l'instance, depuis une seule socket. `npx tsx e2e.mjs` → `E2E OK`.

L'interface du mode est complète : écrans salon et identité, plaques, kill-cam à quatre tempos, annonce de duel, emotes, chat et modération, statistiques de fierté et titres de fin. Le découpage historique et les invariants vivent dans **[PLAN-SALON-VIVANT.md](PLAN-SALON-VIVANT.md)** — **plus aucun lot n'y est en attente**, il ne reste que des dettes et une décision suspendue aux chiffres.

Déploiement : le serveur ws va sur Fly.io/Railway/VPS — pas Vercel. **Une seule instance, obligatoirement** : les salons vivent en mémoire, donc deux machines = deux jeux de salons disjoints et un « SALON INTROUVABLE » systématique entre amis. `min_machines_running = 1` dans `fly.toml` est un *minimum*, pas un plafond, et Fly en provisionne deux par défaut — c'est arrivé en production. `node scripts/check-salons.mjs <url>` le vérifie en dix secondes, **à relancer après chaque `fly deploy`**.

## Interface

Deux principes tenus, et une contrainte.

**Toute cible actionnable fait au moins 44 px** (`--tap`), et la règle ne s'applique **qu'à ce qui s'actionne** : les puces d'état de l'accueil, qui ne se cliquent pas, restent compactes — agrandir ce qui ne se touche pas dilue ce qui se touche. Tous les chips interactifs étant des `<button>`, le sélecteur `button.chip` les couvre exactement, sans liste à tenir.

**Le focus clavier est visible partout**, par une règle unique en `:where()` donc de spécificité nulle. L'anneau est en `--paper` et non en `--signal` : l'accent est réservé à la règle unique, lui faire désigner autre chose l'affaiblirait. Il ne doit jamais être annulé — `.btn:focus-visible { outline: none }` supprimait la seule marque qui distinguait le focus clavier du survol souris.

**La contrainte** : l'identité Nocturne ne bouge pas. Pas de dégradés, pas d'arrondis hors pièces de jeu, capitales, `prefers-reduced-motion` respecté. Les écarts au document d'identité sont ceux listés plus haut, et ils ont tous une raison mécanique.

> Un couplage à connaître : `.plate { min-width }` détermine `COLUMN_MIN` dans `src/render/layout.ts`. Une colonne plus étroite que `min-width + 20` **rogne** la plaque, qui est en `overflow: hidden`. Les deux nombres bougent ensemble. Le dimensionnement est calé sur le pire nom de règle du pool, mesuré — `L'ACCÉLÉRATION`, 124 px — et non sur celui qu'on croyait le plus long.

> Et un principe qui a coûté cher : **rien ne se décide sur une grandeur que la décision modifie.** La place des plaques se calculait sur la gouttière courante, que la bascule change — 407 tailles de fenêtre sur 8 100 oscillaient sans fin, le navigateur abandonnait des notifications de redimensionnement, et la géométrie restait figée sur une valeur fausse : pièces invisibles, plaques qui changent de côté. `layout.ts` calcule désormais la gouttière que produirait **toujours** le mode colonnes, donc une grandeur identique dans les deux états. La boucle n'est pas amortie, elle n'existe plus. Un test balaie 8 100 tailles et vérifie qu'aucune ne possède de cycle.

Aucun test automatique ne protège les tailles : jsdom ne calcule pas de mise en page. Les mesures ont été prises dans un vrai navigateur, mais **rien n'attrapera la prochaine régression** — un `padding` réduit repassera sous 44 px en silence.

## Ce qui n'est pas fait

Pas de comptes véritables : l'identité repose sur l'identifiant anonyme local, donc un joueur qui change de navigateur perd son classement — et, en multijoueur, sa capacité à reprendre un siège. C'est le prochain vrai chantier (lien magique ou OAuth), et il conditionne toute persistance sérieuse.

Le stockage en mémoire ne survit pas à un redémarrage d'instance ni à plusieurs régions. Un `fly deploy` tue les parties en cours ; le serveur ferme proprement (code 1001) pour que les clients le voient tout de suite, mais la partie est perdue. Ne pas déployer pendant une soirée de test.

Pas de boutique, pas de duo à réanimation.

**La Porte 1 n'a toujours pas de chiffres, et c'est désormais le seul vrai blocage.** Le carnet de commandes du plan est vide, la Phase 2 a été construite sans données de rétention, et la chaîne de mesure n'a jamais produit un événement stocké. Tant que `node scripts/pull.mjs | node scripts/report.mjs` ne sort rien, chaque fonctionnalité ajoutée est un pari de plus posé sur un empilement de paris.

Les sons ne sont pas encore calés sur un BPM. Ils fonctionnent, mais ils ne produisent pas la sensation de flow qui fait passer le jeu de « test de réflexes » à « rythme ».
