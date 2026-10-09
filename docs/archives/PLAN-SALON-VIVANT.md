> ⛔ **ARCHIVE — plan entièrement réalisé** (état au 27/08/2026). CLAUDE.md
> §2 en tire la leçon « les documents mentent » : il a décrit trois fois du
> travail déjà fait. Ne pas l'exécuter ; l'état actuel est dans
> [`CLAUDE.md`](../../CLAUDE.md).

# Salon vivant — journal et plan

Ce document reprend le fil **depuis le lot kill-cam** : ce qui est livré, la
décision de design prise sur l'objet dramatique, et les lots restants dans
l'ordre où ils doivent être faits.

Il sert de source unique pour rédiger les prompts suivants : chaque lot liste
les fichiers autorisés et les pièges connus, pour qu'un agent ne parte pas
réécrire le netcode en croyant améliorer une bordure.

État au 27/08/2026 : `npx tsc --noEmit` silencieux, `npx vitest run` **137
verts**, `npx tsx e2e.mjs` **E2E OK**, `npx vite build` OK.

> **Ce document a menti trois fois.** Le lot 1 y a été décrit comme à faire
> alors que tout son contenu était dans le commit initial. Puis les lots 3, 4,
> 5 et 6 y sont restés listés comme à faire longtemps après avoir été livrés.
>
> Un plan qui décrit du travail déjà fait coûte plus cher qu'un plan absent :
> il envoie réécrire du code correct. **Avant d'attaquer un lot, vérifier dans
> le code qu'il reste à faire** — un `git grep` sur les symboles annoncés suffit
> — et corriger cette liste si ce n'est pas le cas. Le coût de la correction est
> de dix minutes ; celui de la croyance, d'une demi-journée.
>
> **Il n'y a plus de lot en attente.** Ce qui reste est en section 6, et ce ne
> sont pas des fonctionnalités.

---

## 1. Ce qui est livré

### Tempo dramatique — serveur (`shared/protocol.ts`, `server/match.ts`, `server/index.ts`)

L'unité dramatique du jeu n'est pas la manche (1,5 s, trop courte pour qu'on
réagisse) mais **la mort**. Le serveur porte donc quatre longueurs de pause,
et le client se contente de les lire dans `nextRoundAt` :

| situation | constante | durée |
|---|---|---|
| rien de notable | `INTERLUDE_MS` | 1100 ms |
| une vie perdue | `INTERLUDE_LIFE_MS` | 2400 ms |
| une élimination | `INTERLUDE_ELIM_MS` | 4200 ms |
| duel (≤ 2 vivants) | `INTERLUDE_DUEL_MS` | 500 ms |

`MatchLogic.closeRound()` retourne `interludeMs` en plus des verdicts. La
règle du duel **écrase** les autres : pendant l'apnée finale, même une vie
perdue ne suspend rien. Si le duel s'arrêtait à chaque erreur, ce ne serait
plus une apnée.

Deux ajustements par rapport au design initial :

- **Deux niveaux de kill-cam, pas un.** À 10 joueurs × 3 vies, il peut y avoir
  jusqu'à 27 morts avant la première élimination. Geler 4 s à chaque vie
  perdue ferait plus de deux minutes de pauses cumulées. La hiérarchie
  2,4 s / 4,2 s rend l'élimination plus dramatique **parce qu'**elle est rare.
- **Fin immédiate au dernier survivant.** L'ancienne règle (« le vainqueur
  joue jusqu'à sa propre mort ») produisait l'inverse de l'effet voulu : sept
  personnes regardaient un joueur seul pendant quarante manches. `matchOver`
  tombe désormais dès `alive.length <= 1`.

`openRound()` applique aussi un facteur de fenêtre côté serveur uniquement :
un salon à deux part large et se resserre (`max(0.9, 1.45 − idx × 0.02)`), un
duel de fin de table accélère (`max(0.7, 0.95 − idx × 0.01)`). `input()` borne
sur `roundDurationMs`, donc juge exactement la fenêtre annoncée.

### Tempo dramatique — présentation (`src/multi.ts`, `index.html`, `src/style.css`)

Le client ne calcule aucun tempo : il mesure `nextRoundAt − clock.now()` et en
déduit l'écran.

- `> 3500 ms` → kill-cam **élimination** : `ÉLIMINÉ`, compteur de survivants,
  `musicApi.cut()`, `sfx.elimImpact()`
- `> 1800 ms` → kill-cam **courte** : nom, règle unique, raison de la mort
- `≤ 800 ms` avec 2 vivants → annonce **DUEL**, une seule fois par match
- sinon → interlude muet

La scène de la kill-cam est reconstruite localement avec
`buildMultiRound(seed, idx, règleDuMort)` et la révélation post-mortem
existante du `SceneRenderer` (`reveal`). Rien de neuf sur le fil.

La barre de temps passe en mode `is-recharge` pendant les pauses longues, pour
que la reprise ne surprenne personne. **Aucun `setTimeout` ne décide d'une
reprise** : la reprise, c'est la réception du message `round`.

### Salon (`shared/protocol.ts`, `server/`, `src/net/glyph.ts`, `src/multi.ts`)

- `MAX_PLAYERS = 10` (le pool multi compte 11 règles : chacun garde la sienne)
- `RoomSettings { speed, lives, rotationEvery }`, décidés par l'hôte seul et
  validés par `sanitizeSettings` — un réglage par joueur casserait la
  simultanéité, qui est tout le spectacle
- **Signe de joueur** dérivé de l'identifiant (3 formes × 8 couleurs ×
  6 motifs = 144 signes), rendu en SVG inline. Aucun téléversement d'image :
  sans compte ni modération, un salon partagé finit toujours de la même façon
- **Spectateur** : `watch(playerId)` ne coûte rien au serveur — la scène étant
  déterministe, le spectateur la reconstruit lui-même

### Rétention solo (`src/engine/difficulty.ts`, `round.ts`, `session.ts`)

- Courbe en deux pentes : `1500 − 42 × level` sous la manche 12, puis descente
  lente jusqu'au plancher 760 ms vers la manche 38
- `FORCED_TRAP_ROUNDS = {2, 5, 9}` : le piège est **garanti** tôt, pendant
  l'échauffement où l'erreur ne tue pas. Avant, un joueur sur dix terminait un
  run entier sans jamais rencontrer la seule mécanique qui distingue le jeu
- Pool tactile (`TOUCH_INSTRUCTIONS`) : sur téléphone, les consignes clavier
  sortent du tirage. Perdre une manche qu'on ne pouvait pas jouer est la pire
  chose qu'un jeu de réflexes puisse faire
- Paliers tous les 10 niveaux, annoncés par `hud.announce`

### Moteur musical (`src/audio/index.ts`)

Matière harmonique importée d'une composition MIDI : alternance Do majeur /
Si♭ mineur (phrygien dominant), motif Sol4↔Sol#4, neuvième mineure en tension
finale. Trois leviers montent ensemble avec le niveau — BPM 91 → 176,
ouverture des couches, densification de l'arpège.

---

## 2. La décision de design du jour : pas d'objet central

Le diagnostic pointait l'absence d'**objet dramatique** — la bombe de
BombParty, que tout le monde regarde ensemble. La première proposition était
un grand tampon animé au centre.

**Écartée.** Le jeu repose sur le balayage rapide d'une grille 5×3, et la
densité de la scène doit augmenter. Un objet mobile au centre entrerait en
concurrence directe avec la seule tâche du joueur.

À la place, deux principes :

> **Pendant la manche, seule la périphérie parle.**
> **Pendant la pause, le centre fait le spectacle.**

L'objet dramatique existe déjà : c'est `SceneRenderer.drawTimeFrame`, le cadre
qui se rétracte autour de l'aire de jeu. Il est simplement peint en `LINE`
(#26344A), 4 px, sans vie. Il ne manque pas un objet, il manque du volume sur
celui-là — voir le lot 1.

Et le besoin qui restait derrière le tampon (un moment collectif) est déjà
couvert **gratuitement** par les pauses : pendant la kill-cam le gameplay est
gelé, le centre est libre, aucune surcharge n'est possible.

---

## 3. État du diagnostic (15 points)

| # | Point | État |
|---|---|---|
| 2 | Objet dramatique | **réglé** — `drawTimeFrame` porte le volume (paliers, hachures, battement qui accélère) |
| 3 | Chat, kick, mute | **réglé** — `chatForm`, `kick` hôte, sourdine locale jamais transmise |
| 4 | Respirations / rythme social | **réglé** — pauses, kill-cam, duel |
| 5 | Fin immédiate au dernier vivant | **réglé** |
| 6 | Métriques de fierté | **réglé** — réaction médiane, pièges déjoués, série, plus les titres de fin (`RÉFLEXE DU MATCH`) |
| 7 | HUD spectateur à zéro | **réglé** — `setFooterLives` publie score, vies et manche du joueur OBSERVÉ |
| 8 | Plaques illisibles | **réglé** — nom 13 px, règle unique 12 px (était 9), vies 9 px |
| 10 | Vies en chiffre | **réglé** — points partout, `livesDots` sur plaques et au pied |
| 11 | Formes petites et inertes | **réglé** — naissance 120 ms + respiration ±1,5 % |
| 12 | Scène vide | **réglé** — `fillCount` densifie le décor (3 → 6 en moyenne, 11 au pire) |
| 13 | Rien ne célèbre | **réglé** — gerbe, voile violet, tampon, kill-cam, titres de fin |
| 14 | Identité timide | **réglé** — signe CHOISI parmi 8 variantes (écran `multi-id`), 40 px sur la plaque, plus les emotes |
| 15 | Silence des interstices | **réglé** — compte à rebours, `cut` à l'élimination, `resumeSting` à la reprise |
| 1 | Laboratoire, pas un lieu | **non** — et c'est le seul point de décor qui reste |
| 9 | Letterbox 1060 × 720 | **sans objet** — le champ est letterboxé par `fieldRect()`, les gouttières servent les plaques ; la dimension fixe n'a jamais eu de raison d'être |

Quatorze points sur quinze. Le diagnostic initial est **épuisé**.

---

## 4. Les lots, dans l'ordre

### Lot 1 — Le cadre (plein écran, hit-test, cadre vivant) ✅ déjà livré

**Rien à faire. Ce lot était intégralement dans le commit initial**, y compris
le bug qu'il prétendait corriger et les quatre pièges qu'il listait. Vérifié
ligne à ligne le 27/08/2026 :

| annoncé comme à faire | où c'est déjà | état |
|---|---|---|
| `#app` en `100vw / 100dvh` | `src/style.css` `#app` | `height: 100vh` puis `100dvh` en repli |
| échelle uniforme, champ centré | `src/render/scene.ts` `resize()` | `Math.min(usableW / FIELD_W, usableH / FIELD_H)`, `offX/offY` centrés — les axes n'ont jamais été calculés séparément |
| `ResizeObserver` → `scene.resize()` | `src/main.ts` `syncField()` | observe `cv`, plus `window.resize` et `visualViewport.resize` |
| cadre 4 → 14–18 px | `scene.ts` `drawTimeFrame()` | `band = [0, 9, 16]` + battement jusqu'à +5 |
| couleur par paliers francs | idem | `#5E1526` puis `#8E1226` — bien plus sombres que la garance `#F74058`, le piège est tenu |
| pulsation qui accélère | idem | période `1100 − ratio × 700`, dérivée de `ratio`, pas d'horloge interne |
| pas de dégradé | idem | aplats + hachures à `stage === 2` |
| `prefers-reduced-motion` | idem | `if (stage > 0 && !this.reduced)` : le battement tombe, épaisseur et couleur restent |

Et le hit-test a une seconde ceinture que le lot ne mentionnait pas :
`SceneRenderer.toField()` compare la boîte mesurée à la boîte mémorisée et
appelle `resize()` avant de projeter. Les plaques sont par ailleurs en
`pointer-events: none`, donc elles ne peuvent pas manger un clic.

**Ce qui n'a PAS pu être vérifié**, et reste donc ouvert : le comportement à
l'exécution. Une tentative de mesure dans le navigateur intégré a donné une
géométrie fausse (backing store 1×1, `--field-h: 0px`) — artefact d'un onglet
qui ne compose pas : `visibilityState: hidden`, 0 frame de `requestAnimationFrame`
en 600 ms, donc ni `ResizeObserver` ni boucle de jeu, les deux étant attachés au
cycle de rendu. **Ce n'est pas une preuve que le code est bon, seulement que ce
banc-là ne prouve rien.** Si « parfois le clic ne passe pas » est réellement
observé, il faut le reproduire dans un vrai navigateur visible, en notant taille
de fenêtre, nombre de joueurs et si `#app` porte `has-gutters` — le code lu ne
montre pas de défaut, donc sans reproduction il n'y a rien à corriger.

### Lot 2 — Incarnation ✅ livré

Plaques en colonnes latérales quand la place existe (`src/render/layout.ts`),
sinon en bandeau ; signe **choisi** parmi 8 variantes via l'écran `multi-id`,
rendu à 40 px sur la plaque (24 en compact) ; vies en points partout, plaques
et pied ; HUD spectateur qui publie le score, les vies et la manche du joueur
observé.

Non fait, et assumé : la « chute incarnée » (le glyphe qui tombe à la mort).
La kill-cam joue déjà ce rôle, et plus fort.

### Lot 3 — Mise en scène des pauses ✅ livré

Tampon (`hud.showStamp`), gerbe à l'échelle de l'écran et voile violet sur un
piège déjoué (`burstScreen`, `flashViolet`), secousse dosée selon la cause,
`sfx.resumeSting()` à la reprise après une pause longue, `musicApi.cut()` à
l'élimination puis relance.

### Lot 4 — Emotes ✅ livré

Six réactions, débit borné côté serveur (`EMOTE_COOLDOWN_MS`), rediffusion à
tous, bulle au-dessus de la plaque. Les boutons font désormais 44 px : ils
étaient à 28, alors que ce lot les décrit comme « jouables au pouce ».

### Lot 5 — Fierté ✅ livré

Réaction médiane, pièges déjoués, série et meilleure série par siège, affichés
en direct sur la plaque ; titres de fin de match (`RÉFLEXE DU MATCH`, …).

Piège toujours valable : un joueur au-delà de `INPUT_TOLERANCE_MS` de latence
voit ses temps gonflés (anti-triche) ; la médiane limite le bruit sans corriger
ce biais.

Toujours reporté : les records du salon persistants — ils demandent un état
dans `Room`, une politique de remise à zéro et une surface d'affichage.

### Lot 6 — Chat et modération ✅ livré

Chat 140 caractères, débit borné, exclusion réservée à l'hôte, sourdine locale
**jamais transmise ni persistée**. Le piège du clavier a été tenu : `Entrée`
ouvre le chat et suspend le routage des inputs de jeu, `Échap` referme.

### Lot 7 — Scène vivante ✅

Densité, naissance, respiration — sans toucher au hit-test.

- `fillCount(rng, level, min)` = `min + min(6, level / 5) + rInt(2)`, plafonné à
  `MAX_ENTITIES`. Un seul tirage RNG, comme l'ancien `rInt`. Mesuré sur 300 runs :
  **3,1 formes en moyenne aux niveaux 0-4, 6,2 à partir du niveau 30, maximum
  observé 11** — le plafond de 15 n'est jamais atteint. La moyenne reste basse
  parce que les consignes à effectif fixe ne densifient pas
- Appliqué aux consignes décoratives seulement (`clickColor`, `clickShape`,
  `clickAny`, `nothing`, `compound`, `notColor`, `notShape`, `odd`, `moving`,
  `extremeSide`). Pas à `extreme`, `smallestOfColor`, `nothingLure`, ni aux
  consignes clavier — l'effectif y fait partie de l'énoncé
- Naissance 120 ms (échelle 0,62 → 1) détectée par référence `Round` ; zone
  cliquable pleine dès la frame 0
- Respiration ±1,5 % / ~2,6 s via `e.phase` ; coupée si une forme `moving` est
  présente, et sous `prefers-reduced-motion`
- `path(e, r = e.r)` : zéro allocation par frame sur le dessin des formes
- Taux de pièges : bornes `[0.04, 0.28]` **inchangées** après densification ;
  unicité des cibles intacte. Mesure par bande de niveau : LA POINTE fait 20,1 %
  aux niveaux 10-19 et 21,5 % aux niveaux 35-44, alors que la densité y passe de
  +2 à +6 formes. **La densité est neutre sur l'équilibrage** — ce qui se
  comprend : la cible est tirée indépendamment de l'effectif
- En revanche le taux agrégé sur 0-44 est dominé par `FORCED_TRAP_ROUNDS` :
  44,9 % aux niveaux 0-9 contre ~21 % ensuite. LA POINTE ressort donc à 26,4 %
  pour un plafond de test à 28 %. **Cette marge de 1,6 point n'a rien à voir
  avec ce que le test prétend mesurer** : élargir la fenêtre de pièges forcés,
  ou ajouter une règle piégeuse un peu vive, ferait échouer un test
  d'équilibrage pour une raison pédagogique. À scinder si on y retouche

**Dette laissée derrière.** Ce lot change `buildRound`, donc toutes les scènes,
donc ce que le rejeu de `api/ranked.ts` reconstruit. C'était gratuit aujourd'hui
parce que `const store: Store = new MemoryStore()` perd tout au redémarrage. Le
jour où `Store` passe sur Postgres ou KV, il faudra une version de génération
attachée à chaque run stocké : sans elle, un run vérifié hier deviendra
invérifiable après le moindre réglage de densité, et deux joueurs du même jour
ne joueront plus la même partie sous la même graine.

Fichiers : `src/engine/scene.ts`, `src/engine/instructions/index.ts`,
`src/render/scene.ts`, `tests/engine.test.ts` (si bornes),
`PLAN-SALON-VIVANT.md`.

---

## 5. Invariants à rappeler dans chaque prompt

1. Aucune scène ne transite sur le réseau. Le client reconstruit avec
   `buildMultiRound(seed, idx, rule)`.
2. Toutes les dates sont sur l'horloge serveur (`net.clock`). Jamais de
   `Date.now()` brut pour une échéance.
3. Le serveur est le seul juge. Le verdict anticipé du client est du confort,
   jamais de l'autorité.
4. Aucun `setTimeout` pour décider d'une reprise : la reprise, c'est le
   message `round`.
5. `src/engine/` reste pur : aucun DOM, aucune horloge, aucun `Math.random()`.
6. Le piège forcé est **solo** (`buildRound`). Le porter dans
   `multiround.ts` casserait la scène partagée du multijoueur.
7. Signalétique stricte : pas de dégradés, pas d'arrondis hors pièces de jeu,
   capitales, et les animations respectent `prefers-reduced-motion`.
8. **Aucune règle du pool multi ne doit être sans effet sur son porteur.** Une
   règle qui ne peut pas atteindre celui qui la porte est un avantage gratuit
   et invisible. LA VOYELLE en est sortie pour ça ; L'ACCÉLÉRATION y était sans
   qu'on le voie, parce que sa déformation portait sur la durée et que le
   serveur jugeait sur la manche partagée. Verrouillé par un test.
9. **Rien ne se décide sur une grandeur que la décision modifie.** La place des
   plaques se calculait sur la gouttière courante, que la bascule change : 407
   tailles de fenêtre sur 8 100 oscillaient sans fin. Voir `render/layout.ts`.
10. **Le multijoueur tire dans le pool TACTILE, pour tout le monde.** La scène
    est partagée, donc on applique la règle de l'appareil le moins capable.
11. **Une coupure n'est pas une défaite.** Le siège est gardé, le joueur absent
    ne joue aucune manche (`Seat.away`), et il reprend son identifiant par sa
    clé locale. Un `leave` explicite, lui, reste immédiat.
12. Vérification de fin de lot : `npx tsc --noEmit`, `npx vitest run`,
    `npx tsx e2e.mjs`, `npx vite build`. Et pour le serveur de salons,
    `node scripts/check-salons.mjs <url>` après chaque `fly deploy`.

---

## 6. Ce qui reste — et ce ne sont pas des fonctionnalités

Le carnet de commandes du diagnostic est vide. Ce qui suit sont des **dettes**
et une **décision en attente de données**, dans l'ordre où elles comptent.

### La mesure, qui n'a jamais tourné

`VITE_COLLECT_URL` a été posée et le front redéployé, mais le stockage Upstash
n'est pas confirmé — et les jetons de la base ont été exposés, donc à
régénérer. **Le compteur des sept jours n'a pas démarré.** Tant que
`node scripts/pull.mjs | node scripts/report.mjs` ne sort pas d'événements
réels, aucune décision produit ne repose sur autre chose que des intuitions.

`scripts/report.mjs` porte une **règle de décision écrite avant les chiffres**,
qui tranche entre construire la boucle sociale et finir autre chose. Elle n'a
de valeur que si on la lit avant de choisir.

### Avant toute cohorte : une vraie soirée

Quatre questions qui ne demandent aucune instrumentation, et qui valent plus
que n'importe quel D1 (elles sont aussi dans `DEPLOIEMENT.md` §5) :

- relancent-ils une partie **sans qu'on le demande** ?
- le chat vit-il **pendant les kill-cams** ? c'est le pari de tout le pivot
- quelqu'un **rit-il à voix haute** en voyant un autre se faire piéger ?
- le chat sert-il pendant les premières manches ? sinon `tensionAt` doit
  descendre de 1,45 vers 1,15

### Dettes techniques, aucune ne bloque une soirée de test

| Dette | Conséquence | Quand ça mord |
|---|---|---|
| Salons en mémoire | un `fly deploy` tue les parties en cours | dès qu'on déploie en soirée |
| Une seule instance obligatoire | deux machines = deux jeux de salons disjoints, « SALON INTROUVABLE » | à la moindre montée en charge |
| Pas de comptes | l'identité meurt avec le navigateur | dès qu'un classement doit persister |
| `api/ranked.ts` en `MemoryStore` | classement effacé à chaque démarrage à froid | le mode est masqué en production |
| Version de génération absente sur les runs stockés | un run vérifié hier devient invérifiable après un réglage de densité | le jour où `Store` passe sur Postgres |
| Aucun filet sur la mise en page | jsdom ne calcule pas de layout : rien n'attrape un `padding` qui repasse sous 44 px | à la prochaine régression CSS |

### Ce qui n'est pas une dette mais un plafond

Douze règles, dont dix jouables en multi. Un joueur qui les a toutes vues a vu
le jeu. Les trois leviers (`forbids`, `judge`, `transform`) étant **cumulables**
par construction, deux règles simultanées donnent 45 combinaisons pour dix
règles — un contenu combinatoire que l'architecture supporte déjà. À garder
pour le jour où les chiffres diront que la profondeur manque, pas avant.
