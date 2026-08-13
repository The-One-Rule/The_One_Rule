# Salon vivant — journal et plan

Ce document reprend le fil **depuis le lot kill-cam** : ce qui est livré, la
décision de design prise sur l'objet dramatique, et les lots restants dans
l'ordre où ils doivent être faits.

Il sert de source unique pour rédiger les prompts suivants : chaque lot liste
les fichiers autorisés et les pièges connus, pour qu'un agent ne parte pas
réécrire le netcode en croyant améliorer une bordure.

État à la rédaction : `npx tsc --noEmit` silencieux, `npx vitest run` **97
verts**, `npx tsx e2e.mjs` **E2E OK**.

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
| 5 | Fin immédiate au dernier vivant | **réglé** |
| 4 | Respirations / rythme social | **réglé** (pauses + kill-cam + duel) |
| 8 | Plaques illisibles | partiel — glyphe, vies, pulses ; encore petites |
| 10 | Vies en chiffre | partiel — points sur les plaques, `VIES n` au pied |
| 14 | Identité timide | partiel — glyphes 14–16 px, pas de variantes ni d'emotes |
| 13 | Rien ne célèbre | partiel — burst, pulse violet, kill-cam |
| 7 | HUD spectateur à zéro | partiel — méta `SPECTATEUR · NOM`, pied encore faux |
| 15 | Silence des interstices | partiel — compte à rebours, `cut` à l'élimination |
| 1 | Laboratoire, pas un lieu | **non** |
| 2 | Objet dramatique | **non** — traité autrement, voir lot 1 |
| 3 | Chat, kick, mute | **non** |
| 6 | Métriques de fierté | **non** |
| 9 | Letterbox 1060 × 720 | **non** |
| 11 | Formes petites et inertes | **réglé** — naissance 120 ms + respiration ±1,5 % |
| 12 | Scène vide | **réglé** — `fillCount` densifie le décor (3 → 6 en moyenne, 11 au pire) |

---

## 4. Les lots, dans l'ordre

### Lot 1 — Le cadre (plein écran, hit-test, cadre vivant)

Débloque tout le reste du visuel **et corrige un bug réel** : les plaques
réduisent le canvas sans que `SceneRenderer` soit redimensionné, donc le point
cliqué ne tombe plus sur la forme visible (« parfois le clic ne passe pas »).

- `#app` en `100vw / 100dvh` (`dvh`, pas `vh` : barre d'URL iOS)
- échelle **uniforme** dans `draw()` (`min(sx, sy)`, champ centré) — aujourd'hui
  `sx` et `sy` sont calculés séparément et étirent la scène
- `ResizeObserver` sur `#stage` → `scene.resize()`
- `drawTimeFrame` devient l'objet dramatique : épaisseur 4 → 14–18 px,
  couleur `LINE` → `--rouge` par paliers francs, pulsation dont la fréquence
  accélère avec `ratio`

Fichiers : `src/style.css`, `src/render/scene.ts`, `src/main.ts`.

Pièges :
- la pulsation se dérive de `ratio` (déjà passé à `draw`), **pas** d'une
  horloge interne au renderer
- le rouge du cadre doit être **nettement plus sombre que la garance**
  (`#F74058`) : des consignes disent « CLIQUE LE ROUGE »
- pas de dégradé : hachures ou segments à arêtes vives, comme `#band`
- sous `prefers-reduced-motion`, la pulsation tombe, l'épaisseur et la couleur
  restent — l'information ne dépend jamais de l'animation

### Lot 2 — Incarnation

- plaques **autour** de l'aire de jeu (colonnes jusqu'à 6 joueurs)
- glyphe en 48–64 px, plus le choix parmi quelques `glyphVariant(id, n)`
  (déjà écrit dans `glyph.ts`, jamais utilisé)
- vies en symboles dégradés **partout**, y compris au pied de page
- chute incarnée : à un verdict `death`, le glyphe tombe ou se barre
- HUD spectateur : `setFooter` doit montrer les vies, le score et la manche du
  **joueur observé** (point 7)

Fichiers : `src/multi.ts`, `index.html`, `src/style.css`, `src/render/hud.ts`.

### Lot 3 — Mise en scène des pauses

Le centre est libre pendant la kill-cam : c'est là que va le théâtre.

- tampon `INFRACTION` qui s'abat en plein cadre
- piège déjoué : gerbe à l'échelle de l'écran, flash violet, secousse légère
- sting sonore à la reprise, ambiance de salon basse intensité entre les
  parties (le `Music` sait déjà moduler par `intensity`)

Fichiers : `src/multi.ts`, `src/render/scene.ts`, `src/style.css`,
`src/audio/index.ts`.

### Lot 4 — Emotes

La voix la moins chère, jouable au pouce, sans modération à écrire.

- `{ t: "emote", k: 0..5 }`, limite ~1 / 1,5 s côté serveur, rediffusion à tous
- rendu : un grand signe qui pop au-dessus de la plaque, ~800 ms
- six signes suffisent (rire, choc, applaudissement, « vu venir », salut, ptdr)

Fichiers : `shared/protocol.ts`, `server/index.ts`, `src/net/client.ts`,
`src/multi.ts`, `index.html`, `src/style.css`.

### Lot 5 — Fierté

Le serveur reçoit déjà l'horodatage de chaque input et calcule `elapsed` : il
jette une donnée qu'il suffit de conserver.

- par siège : temps de réaction (**médiane**), pièges déjoués, plus longue série
- affichage **en direct** sur la plaque : c'est ce qui rend le skill lisible
- titres de fin de match (« RÉFLEXE DU MATCH : 187 ms — PIERRE »)
- ~~records du salon, persistants tant que la room existe~~ **reporté** : demande
  un état dans `Room`, une politique de remise à zéro, et une surface d'affichage
  au salon — terrain du lot suivant (après chat / scène)

Piège : un joueur au-delà de `INPUT_TOLERANCE_MS` de latence voit ses temps
gonflés (anti-triche) ; la médiane limite le bruit sans corriger ce biais.

### Lot 6 — Chat et modération

- `{ t: "chat", text }` → 140 caractères max, ~3 messages / 2 s, rediffusion
- `{ t: "kick", playerId }` réservé à l'hôte, plus un mute local
- trois messages en surimpression pendant le match, panneau complet au salon

**Piège majeur** : le clavier est un input de jeu (`typeLetter`, `typeShown`,
`arrow`). `Entrée` ouvre le chat et **suspend le routage des inputs**, `Échap`
referme ; hors focus, aucune touche n'est capturée. Sur mobile, chat au salon
et pendant les pauses seulement — en match, les emotes suffisent.

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
8. Vérification de fin de lot : `npx tsc --noEmit`, `npx vitest run`,
   `npx tsx e2e.mjs`, `npx vite build`.
