# THE ONE RULE — Phase 1

Jeu de réflexes web. Une **règle unique** est tirée pour toute la partie et reste affichée en haut. Par-dessus, une **consigne** change toutes les deux secondes. Quand la consigne demande d'enfreindre la règle unique, la manche devient un **piège** et la bonne réponse bascule sur *ne rien faire*.

C'est le seul élément non copiable du jeu. Le reste (cosmétiques, ranked, boutique) est de l'amplification.

## Commandes

```bash
npm install
npm run dev        # serveur local
npm run test       # 29 tests
npm run typecheck
npm run build      # dist/
node inline.mjs    # dist/ → the-one-rule-v1.html, un seul fichier autonome
```

Aucune dépendance runtime. Vite, TypeScript et Vitest sont en dev uniquement.

## Architecture

```
src/
  engine/      PUR — aucun DOM, aucune horloge, aucun Math.random()
    rng        mulberry32 + helpers
    scene      placement sur grille 5×3, chevauchement impossible par construction
    instructions/  19 consignes paramétriques
    rules/     12 règles uniques nommées
    round      assemblage + détection du conflit macro↔micro
    resolve    verdict d'une action
  game/        orchestration — daily, session, quests, progress
  render/      canvas + HUD, lit l'état, ne le modifie jamais
  audio/       WebAudio synthétisé, aucun fichier
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
- **Entraînement** : illimité, mais uniquement les règles déjà rencontrées. La surprise du run du jour est le seul contenu neuf, il ne faut pas la brûler.
- **3 quêtes** : présence (toujours faisable), exploration, et performance **calée sur la moyenne des 5 derniers runs**. Jamais un seuil fixe : « atteindre 30 » est un mur pour un débutant et une formalité pour un bon joueur.
- **Série avec un jour de grâce par semaine.** Non négociable : sans lui, le premier jour manqué détruit la série et le joueur ne revient jamais.
- **Teaser** : `DEMAIN · LE MENTEUR`, juste le nom. C'est le déclencheur de retour, placé au moment où l'émotion est maximale.

## Mesure

Quatre chiffres, et rien d'autre : **D1, D7, durée médiane de session, taux de partage**. Ce sont eux qui décident du passage de la Porte 1.

- `src/analytics/` — file d'attente groupée, envoi en `sendBeacon` (le seul qui survive à la fermeture d'onglet), transport injectable pour les tests. Un échec du collecteur ne peut pas remonter dans le jeu : `flush()` avale ses erreurs.
- `api/collect.ts` — fonction edge Vercel. Écrit une ligne NDJSON par événement dans les logs, valide le nom d'événement contre une liste blanche, tronque les chaînes, plafonne le corps et la taille des lots. Ne journalise ni IP, ni user-agent, ni en-tête d'identification. Pour passer à une vraie base plus tard, seule la fonction `sink()` change.
- `scripts/report.mjs` — calcule les quatre chiffres, la courbe de rétention, les causes de mort et la difficulté par règle.

```bash
vercel logs --output raw | node scripts/report.mjs
node scripts/report.mjs events.ndjson
```

Le rapport corrige les cohortes : pour Dn, il ne compte que les joueurs dont la cohorte a eu le temps d'atteindre le jour n. Sans ce filtre, les inscrits récents écrasent le chiffre vers le bas et le résultat ne veut rien dire.

Événements : `first_open`, `day_return`, `visit_end`, `run_start`, `run_end`, `quest_complete`, `share`, `optout`.

**Vie privée.** Identifiant aléatoire local, aucun compte, aucun cookie, aucune donnée personnelle, aucun service tiers. Un bandeau court explique ce qui est mesuré et pourquoi ; le refus est persistant et coupe tout. Sans `VITE_COLLECT_URL`, le module est totalement inerte — pas de bandeau, pas de file, pas d'appel réseau. C'est le cas du fichier HTML autonome.

## Déploiement

```bash
vercel                      # détection Vite automatique, api/ pris en charge
# puis, dans les variables d'environnement du projet :
VITE_COLLECT_URL=/api/collect
```

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

**Netcode.** Aucune scène ne transite : le serveur envoie `{seed, idx, deadline}` et chaque client reconstruit la manche via `buildMultiRound(seed, idx, rule)` — `draftShared` (scène commune, RNG dérivé par hachage de `seed:idx`, accès direct à la manche N sans rejouer les précédentes) puis `applyRule` (piège + déformations, RNG dérivé de `seed:idx:ruleId`, donc identique chez le client et le serveur qui juge). Le serveur fait **autorité sur le temps** : dates serveur partout, horloge client reconstruite par ping (médiane d'échantillons, `ServerClock`), inputs horodatés côté client et **bornés serveur** (tolérance 120 ms, plancher `now − tolérance` pour empêcher l'antidatage).

- `shared/protocol.ts` — protocole typé unique, importé des deux côtés
- `server/match.ts` — logique de match **pure** (distribution/rotation des règles, vies, verdicts, forfaits) ; LA MAIN GAUCHE exclue du pool (recevoir « tiens ESPACE » par rotation en pleine manche est injouable)
- `server/index.ts` — serveur ws : salons, ordonnancement des manches, clôture anticipée quand tous ont répondu, heartbeat ; `npm run server`
- `src/net/client.ts` — `NetClient` + `ServerClock`, zéro DOM

Vérifié par `tests/multi.test.ts` (déterminisme, rotation, match complet simulé, horloge) et **`e2e.mjs`** : serveur réel + trois clients ws réels jouent un match — profils distincts (juste / clique-tout / absent), éliminations, verdicts identiques chez tous. `npx tsx e2e.mjs` → `E2E OK`.

**Reste à assembler : l'interface du mode** (écrans salon, plaques joueurs, boucle de manche branchée sur `NetClient`). Le prompt `PROMPT-CURSOR-MULTI.md` guide cet assemblage lot par lot sans toucher au cœur livré. Déploiement : le serveur ws va sur Fly.io/Railway/VPS — pas Vercel.

## Ce qui n'est pas fait

Pas de comptes véritables : l'identité classée repose sur l'identifiant anonyme local, donc un joueur qui change de navigateur perd son classement. C'est le prochain vrai chantier (lien magique ou OAuth), et il conditionne toute persistance sérieuse du classement.

Le stockage en mémoire ne survit pas à un redémarrage d'instance ni à plusieurs régions. Utilisable pour tester le mode avec un petit groupe, pas pour un lancement public.

Pas de boutique, pas de duo à réanimation.

**La Porte 1 n'a toujours pas de chiffres.** La Phase 2 a été construite sans données de rétention. C'est un pari assumé sur une seule chose : la validation serveur est impossible à ajouter après coup, alors que le reste du classé peut attendre.

Les sons ne sont pas encore calés sur un BPM. Ils fonctionnent, mais ils ne produisent pas la sensation de flow qui fait passer le jeu de « test de réflexes » à « rythme ».
