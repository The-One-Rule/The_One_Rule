# THE ONE RULE — mémoire de travail

Ce fichier existe pour reprendre le projet sans perdre ce qui a été appris.
Il ne décrit pas le code — le code se lit — mais **ce qui ne se déduit pas de
sa lecture** : les décisions, les pièges déjà payés, et la façon de vérifier.

> **Langue** : tout en français. Code, commentaires, messages de commit,
> réponses. Sans exception.

---

## 1. Le jeu en trois phrases

Jeu de réflexes web. Une **règle unique** est tirée pour toute la partie et
reste affichée. Une **consigne** change toutes les ~2 s ; quand elle demande
d'enfreindre la règle unique, la manche est un **piège** et la bonne réponse
est *ne rien faire*.

Le piège est le seul élément non copiable du jeu. Tout le reste est de
l'amplification, et doit être jugé à l'aune de ce qu'il fait pour lui.

**Statut** : le concept est validé — deux playtests, les joueurs relancent,
rient, s'invitent. Ce qui manque n'est pas l'intérêt du gameplay.

---

## 2. Comment vérifier — la section la plus importante

**Mesure, n'estime pas.** Ce projet a produit une longue série de bugs
invisibles à la lecture : un BOM devant une URL, une règle jugée à `x = 0`, un
spectateur avec 3 vies, une carte d'accueil qui se détruisait elle-même. Tous
trouvés en mesurant, aucun en relisant.

```bash
npx tsc --noEmit
npx vitest run
npx tsx e2e.mjs
npx vite build
```

### Les quatre pièges de mesure, tous déjà payés

**Ne juge jamais une mise en page sur une capture d'écran.** Le volet du
navigateur les met à l'échelle et ment sur les positions. Utilise
`getBoundingClientRect`, et `elementFromPoint` pour confirmer. Erreur commise
trois fois : « le bloc est décentré », « l'app ne fait que 440 px de haut » —
faux les deux fois, les nombres disaient l'inverse.

**Le volet ne compose pas toujours de frames** (`visibilityState: hidden`, 0
`requestAnimationFrame`). Alors ni la boucle de jeu, ni `ResizeObserver`, ni
les **transitions et animations CSS** n'avancent. Conséquences :

- une géométrie fausse peut être un artefact **ou** un vrai bug — vérifie
  `requestAnimationFrame` avant de conclure ;
- pour mesurer un état cible animé, **neutralise le mouvement d'abord** :

```js
const st = document.createElement('style');
st.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
document.head.appendChild(st);
// … mesurer ici …
st.remove();
```

**Un test doit avoir des dents.** Avant de le croire : casse le correctif,
relance, vérifie qu'il tombe, restaure. Plusieurs tests de ce dépôt passaient
**par chance** — `pace.test.ts` comparait à `windowMs(0)` écrit en dur et ne
tenait que parce que la manche 0 de sa graine n'a qu'une étape.

**L'e2e est bavard, sers-t'en.** Chaque assertion porte son numéro, son
horodatage et — pour les grandeurs mesurées — **sa marge au seuil**. Un
récapitulatif final liste celles qui passent à moins de 30 % : ce sont les
seules candidates sérieuses à un échec intermittent. Deux `E2E : 1 échec(s)`
sans nom d'assertion ont coûté des heures avant ça.

### Les documents mentent

`PLAN-SALON-VIVANT.md` a décrit trois fois du travail déjà fait. **Avant
d'attaquer quoi que ce soit d'annoncé comme « à faire », vérifie dans le
code** — un `git grep` sur les symboles cités suffit — et corrige le document.

---

## 3. Environnement — et le piège qui a corrompu deux fichiers

Windows, **PowerShell 5.1**. Pas de `&&`, pas de ternaire, pas de `??`.

### ⚠️ N'édite JAMAIS un fichier source avec `Get-Content` / `Set-Content`

`Get-Content` lit en ANSI, `Set-Content -Encoding utf8` réécrit en UTF-8 : tout
accent est **doublement encodé**. « ÉLIMINÉ » devient « Ã‰LIMINÃ‰ ». Les tests
passent — le mojibake reste du texte valide — et la corruption part en commit.
C'est arrivé sur `src/multi.ts` et `e2e.mjs`, et il a fallu écrire un script de
réparation cp1252 pour s'en sortir.

- **Édite avec les outils Edit / Write.** Toujours.
- Si un script est vraiment nécessaire :
  `[System.IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)` puis
  `WriteAllText($p, $s, (New-Object Text.UTF8Encoding($false)))`.
- Un fichier `.ps1` doit être **100 % ASCII** : PS 5.1 lit les scripts en ANSI
  et casse le parsing sur le moindre accent.

Contrôle après coup :

```powershell
Get-ChildItem -Recurse -Include *.ts,*.mjs,*.css,*.html -Path src,server,shared,tests,index.html,e2e.mjs |
  ForEach-Object { $n = ([regex]::Matches([IO.File]::ReadAllText($_.FullName), 'Ã.|â€')).Count
                   if ($n) { "$($_.Name) : $n" } }
```

### Autres points d'environnement

- Message de commit accentué : `git commit -F fichier` (un here-string casse).
- `vercel --prod` est **bloqué par le classificateur de permissions** : c'est
  Pierre qui déploie. Ne jamais tenter.
- `vercel env pull .env.local` **écrase** le fichier. Remettre ensuite
  `VITE_WS_URL=ws://localhost:8787` et les identifiants Upstash à la main.
- `git stash` sur un fichier le rend en CRLF. Le contenu est intact, git
  normalise au commit, mais restaure depuis une copie si tu veux du LF pur.

---

## 4. Architecture

```
shared/protocol.ts   protocole typé unique, importé des deux côtés
server/
  match.ts     logique de match PURE (règles, vies, verdicts, forfaits, tension)
  index.ts     serveur ws : salons, ordonnancement, heartbeat, arrêt propre
  origin.ts    liste blanche d'origines
src/
  engine/      PUR — aucun DOM, aucune horloge, aucun Math.random()
    rng, scene (grille 5×3), instructions/ (19 dont 15 tactiles),
    rules/ (12 règles + withoutHold), round, multiround, resolve,
    verify, difficulty (windowMs, windowForSteps, STEP_MS)
  game/        daily (ruleOfDay, trainingRule), session, quests, progress, replay
  net/         NetClient + ServerClock + glyphes, zéro DOM
  render/      scene (canvas), hud, layout (PUR et testé), option, plate, seat
  ranked/      elo, antibot, client
  analytics/   file groupée, sendBeacon, transport injectable
  env.ts       cleanEnv() — nettoie BOM/blancs des variables de build
api/           fonctions edge Vercel : collect, ranked
public/        servi tel quel à la racine — favicon, icônes, og.png, manifeste
  brand/       le kit d'identité d'origine, son README et ses tokens
scripts/       pull, report, check-deploy, check-salons
```

**`render/plate.ts` et `render/seat.ts` sont purs et testés** pour la même
raison : ils portent des PRIORITÉS, et une priorité écrite en `if` successifs
est le genre de code qui se lit juste et se comporte faux. `plate.ts` a été
extrait après un vrai bug (le statut de débutant écrasait le verdict de la
manche). Toute nouvelle composition d'états doit suivre ce chemin.

**Contrainte structurante : `engine/` est pur.** C'est ce qui permet à
`verify.ts` de rejouer un run côté serveur et au multi de reconstruire les
scènes sans les transmettre.

**Netcode** — aucune scène sur le fil : `{seed, idx, deadline}` puis
`buildMultiRound(seed, idx, rule)` = `draftShared` (scène commune) +
`applyRule` (piège + déformations). Serveur autorité sur le temps.

---

## 5. Constantes clés

| | |
|---|---|
| Champ | `FIELD_W 1000 × FIELD_H 420`, `FIELD_GUTTER 24` |
| Fenêtre | `windowMs` : `<12 → 1500−42·lvl`, sinon `max(760, 996−9·(lvl−12))` |
| Étapes | `STEP_MS 280` — chaque action **supplémentaire** ajoute ce temps |
| Multi | `MIN_ROUND_MS 700`, `MAX_ROUND_MS 2400`, `INPUT_TOLERANCE_MS 120` |
| Interludes | normal 1100 · vie perdue 2400 · élimination 4200 · duel 500 · rotation 3400 |
| Compte à rebours | `COUNTDOWN_MS 4500` — c'est le temps de LIRE sa règle |
| Tension | duel `0.7` · warm `max(0.9, 1.45−0.02·idx)` · `ROTATION_GRACE_FACTOR 1.5` |
| Salon | `MAX_PLAYERS 10`, `MAX_ROUNDS 60`, `ROTATION_EVERY 8` |
| Réglages hôte | vitesse `[1.7 … 0.65]` · vies `[1,3,5]` · rotation `[4,8,16,999]` |
| Allure solo | `PACE_CHOICES [1.5, 1, 0.8]`, `PACE_DEFAULT 1`, défaut du joueur **1.5** |
| Solo | `DAILY_LENGTH 40`, `GRACE_ROUNDS 3`, `FORCED_TRAP_ROUNDS {2,5,9}` |
| Reconnexion | `RECONNECT_GRACE_MS 25000` · `ROOKIE_BONUS_LIVES 1` |
| UI | `--tap 44px` · `COLUMN_MIN 176` / `COLUMN_ENTER 232` ↔ `.plate min-width 150` |

**`MULTI_RULES` = 10** : `mainGauche` exclue (tenir ESPACE par rotation est
injouable) et `voyelle` exclue (ne piège que sur consignes clavier, absentes du
pool multi). Marge zéro pour 10 joueurs, verrouillée par test.

---

## 6. Décisions à ne pas défaire

1. **Aucune règle du pool ne doit être inerte sur son porteur** — un avantage
   gratuit et invisible. A coûté 3 bugs (`voyelle`, `acceleration`, `gaucher`),
   et c'est ce qui interdit de simplement « laisser passer » LA MAIN GAUCHE sur
   un appareil tactile.
2. **Rien ne se décide sur une grandeur que la décision modifie**
   (`render/layout.ts`) — 407 tailles de fenêtre sur 8100 oscillaient.
3. **Client et serveur jugent la même action.** Le serveur reconstruit la
   position depuis l'entité, le client fait pareil (`vueServeur`). Un aperçu
   qui contredit le verdict = « le jeu triche », seul risque tenu pour fatal.
4. **Une coupure n'est pas une défaite.**
5. **Le piège n'est révélé qu'après la mort.** Jamais pendant.
6. **`.screen` ne centre pas par `align-items`** mais par `margin: auto` —
   sinon le haut d'un contenu débordant devient inatteignable. Même famille :
   `justify-content: flex-end` dans un conteneur en défilement rend le début du
   contenu **définitivement** inatteignable (`scrollHeight === clientHeight`).
   Le remède est `margin-top: auto` sur le premier enfant.
7. **Le carnet n'explique que les règles rencontrées** — ne pas brûler la
   surprise du run du jour.
8. **Identité Nocturne** : pas de dégradé, pas d'arrondi hors pièces de jeu,
   capitales, accent `--signal` réservé à la règle unique et à l'action
   évidente, `prefers-reduced-motion` respecté. Les angles droits ne sont pas
   un défaut de finition — c'est l'identité. Ce qui manquait était une
   hiérarchie de **matière** (épaisseurs, espacements), pas des arrondis.
9. **Aucun `setTimeout` pour décider d'une reprise** : la reprise, c'est le
   message `round`. Corollaire : un état de manche s'efface au message suivant,
   pas sur minuterie.
10. **La taille du champ EST du gameplay.** La grille se balaie en 800 ms.
    Tout ce qui grossit le bandeau ou le pied rogne la scène et change la
    difficulté. Chaque gain de présence doit être mesuré contre ce coût et
    rendu ailleurs. Corollaire : un habillage latéral doit vivre **hors flux**
    (comme `#app.has-gutters .plates`), jamais dans le flux.
11. **Le run du jour reste identique pour tout le monde** — c'est ce qui donne
    un sens aux scores et aux liens de défi. Seule exception admise : une règle
    matériellement injouable sur l'appareil (voir `withoutHold`).

---

## 7. La couche visuelle

### Échelle typographique

Relevé avant refonte : 47 déclarations de taille, 40 sous 14 px, interlettrage
de 0 à 0,28em **sans corrélation avec la taille** — du 10 px à 0,26em contre du
13 px à 0,2em. À cette taille, l'écartement fait lire lettre par lettre.

| rôle | taille | écartement | pour |
|---|---|---|---|
| `--t-micro` | 11px | 0,08em | mentions, méta, unités |
| `--t-petit` | 12px | 0,10em | états, valeurs, aides |
| `--t-base` | 13px | 0,04em | texte courant, libellés de bouton |
| `--t-lire` | 15px | 0,02em | briefs, descriptions, phrases |
| `--t-intitule` | 11px | 0,18em | intitulés — seul endroit où l'écartement informe |

**Règle** : l'écartement décroît quand la taille descend. Plancher 11 px.
L'écran de **jeu** (bandeau, consigne, pied, plaques, panneaux) garde ses
valeurs propres : sa densité est calée sur une lecture en 200 ms.

### La chaleur — `--heat`

Une seule grandeur, 0 → 1, publiée sur `#app` par la boucle de jeu. Elle agrège
le temps consommé de la manche et l'avancement de la partie — **deux valeurs
qui existaient déjà**, aucune donnée nouvelle.

- Écrite **par crans de 5 %** et jamais deux fois à l'identique : une propriété
  personnalisée invalide le style de tout ce qui l'utilise.
- Elle ne pilote que du décor **hors flux** : halo de bord, cadre qui bat.
- Seuls `opacity` et `transform` sont animés.
- `#app.is-critical` est posée au même seuil que `sfx.urgent` (0,76) : l'œil et
  l'oreille disent la même chose au même instant.

**Un vignettage radial ne marche pas sur cet écran** : mesuré, les quatre coins
du terrain tombent à 85–102 % du rayon, donc en pleine zone assombrie. Le jeu
occupe presque toute la surface. D'où le halo de bord (60 px, pour une
gouttière mesurée à 64).

### Autres pièges CSS déjà payés

- **Il n'y a pas de `.hidden` générique** dans la feuille, et c'est délibéré :
  une règle unique perdrait la cascade contre les `display: flex` des
  composants. Chaque composant déclare la sienne — et `tests/hidden.test.ts`
  refuse tout élément masqué sans règle qui le masque.
- **Un `order` sur une partie seulement des enfants d'une grille** renvoie les
  autres (`order: 0` implicite) devant. N'en pose aucun, ou pose-les tous.
  Payé une seconde fois en enveloppant `.room__title` dans `.room__head` : la
  règle visait alors un enfant dont le frère passait devant, et le salon
  affichait « 6 / 10 JOUEURS » PUIS « EN ATTENTE ». **Poser l'`order` sur
  l'enfant de la grille, jamais sur un descendant.**
- **`animation-fill-mode: backwards` + `prefers-reduced-motion`** : neutraliser
  l'animation sans remettre `opacity: 1` laisse l'élément **invisible**.
- **Ne jamais écrire `textContent` sur une carte** (`#btnDaily`, `#btnMulti`,
  `#btnTraining`, `#btnRanked`) : ce sont des `<button>` à trois `<span>`, et
  l'écriture les détruit. `tests/cartes.test.ts` le refuse. Même piège sur
  `#multiLobbyCode`, qui porte maintenant quatre cases : passer par
  `setRoomCode()`.
- **`1fr` n'est pas `minmax(0, 1fr)`.** Le minimum d'une piste `1fr` est le
  `min-content` de son plus large élément : mesuré, la barre des vitesses en
  réclamait 273 px et la piste passait à 273 dans un conteneur de 189 — tout
  sortait d'une zone qui ne défile qu'en vertical. Même famille : un élément
  flexible ne rétrécit pas sous son contenu sans `min-width: 0`.
- **Une barre segmentée se règle en `flex: 1 1 0` + `min-width: max-content`.**
  Trois essais mesurés avant d'y arriver : base nulle seule → les libellés se
  chevauchent ; base fixe → les groupes courts se replient pour rien ; `1 0
  auto` → segments inégaux, dont trois sous les 44 px tactiles. La base nulle
  donne la part égale, le plancher `max-content` interdit d'écraser un mot et
  sert de largeur de repli.
- **`aspect-ratio` + un plancher de taille** impose la dimension croisée : sur
  les cases du code, `aspect-ratio: 1` avec `min-height: 56px` forçait 56 px de
  large chacune, donc 248 px de rangée qui débordait. Hauteur fixe, largeur
  libre.
- **Une ombre part de la BOÎTE, pas du texte.** Un halo posé sous le filet de
  l'écran de fin débordait des deux côtés du mot, puisque la tête fait toute la
  largeur de la colonne. Rapporté comme « mal centré ». Supprimé.

---

## 8. Ce que les playtests ont établi

**Jour 2 (28/08/2026)** — 14 joueurs, 33 runs, D1 37,5 % (n=8), session médiane
10 min 02 s, 28,6 % de joueurs qui invitent, **0 % de partage de score**.

- Le social est **synchrone** : on donne le code à l'oral, on invite au salon.
  Le duel asynchrone (replay, fantôme) n'a jamais été utilisé.
- Les joueurs demandent spontanément : leaderboard, ELO, battle royale, shop,
  version non-web. Ce sont des demandes de joueurs **contents**, pas un plan
  produit : aucune ne vient d'un manque constaté. Le battle royale à 10 existe
  déjà — ce qu'ils veulent probablement, c'est rejoindre **sans code**.
- Un joueur a proposé de développer le projet avec Pierre. C'est le retour le
  plus fort de la soirée, et le seul qui ne soit pas une demande de feature.
- Reproche constant : l'UI faisait « prototype ». D'où la refonte.

**Trois bugs de conception trouvés grâce à ces chiffres** (tous corrigés) :

- `LE SANG` sortait **30 fois sur 33** : l'entraînement ne tirait que parmi les
  règles déjà rencontrées, avec LE SANG pour repli — un joueur neuf tournait en
  boucle dessus, et onze règles étaient invisibles.
- **39,4 % de morts par dépassement de temps** : la fenêtre ignorait le nombre
  d'actions. Sous LE JUMEAU, une séquence de deux donnait 235 ms par geste, et
  165 en duel.
- La règle n'était jamais rappelée en enchaînant : `REJOUER` sautait le brief.

---

## 9. Dettes connues

| Dette | Quand ça mord |
|---|---|
| Salons en mémoire | un `fly deploy` tue les parties en cours |
| Pas de comptes | l'identité meurt avec le navigateur — **bloque tout leaderboard** |
| `api/ranked.ts` en `MemoryStore` | mode classé masqué en production |
| Pas de version de génération sur les runs stockés | le jour où `Store` passe sur Postgres |
| Aucun filet sur la mise en page | jsdom ne calcule pas de layout — décision Playwright en attente |
| Hôte coupé | bloque le lancement ≤ 25 s |
| Plafond de contenu | 12 règles ; 45 combinaisons possibles à deux règles |
| Pièces sans dépense | `st.coins` s'accumule et ne sert à rien |
| Domaine écrit en dur dans `index.html` | `og:image` exige une URL absolue — si le site déménage, la vignette meurt en silence. `tests/marque.test.ts` vérifie au moins que `og:url` et `og:image` restent d'accord |
| Couleur sans second canal | les pièces ne se distinguent que par la teinte, et garance/jade est la collision classique du daltonisme rouge-vert. Voir la note en §12 |

---

## 10. Déploiement et mesure

Front **Vercel**, servi sur **`www.theonerule.party`** (l'apex répond 308 vers
`www` ; `the-one-rule-rho.vercel.app` reste actif) · salons **Fly**
(`the-one-rule-salons.fly.dev`). Deux déploiements distincts, **par Pierre**.

```bash
vercel --prod --yes
fly deploy
node scripts/check-deploy.mjs https://www.theonerule.party
node scripts/check-salons.mjs https://the-one-rule-salons.fly.dev
node scripts/pull.mjs | node scripts/report.mjs
```

⚠️ **Un nouveau domaine casse le multijoueur en silence.** `server/origin.ts`
refuse toute socket dont l'origine n'est pas dans `ALLOWED_ORIGINS`, et l'échec
ressemble à « le serveur est tombé », pas à « ton origine est refusée » —
mesuré sur `theonerule.party` le jour de sa mise en service : HTTP 401 sur les
deux nouveaux hôtes, pendant que le solo tournait normalement.

```bash
fly secrets set ALLOWED_ORIGINS="https://www.theonerule.party,https://theonerule.party,https://the-one-rule-rho.vercel.app"
```

`fly secrets set` **redémarre la machine**, donc tue les salons en cours : à
faire quand personne ne joue, et revérifier `fly scale count 1` juste après.
L'apex figure dans la liste bien qu'il redirige : la redirection se fait côté
navigateur avant l'ouverture de la socket, mais un client qui arriverait
directement sur l'apex enverrait cette origine-là.

⚠️ **Une seule instance Fly, obligatoirement.** Les salons vivent en mémoire ;
`min_machines_running = 1` est un *minimum*, pas un plafond — Fly en
provisionne 2 par défaut, ce qui donne « SALON INTROUVABLE » entre amis. À
revérifier après chaque `fly deploy`.

⚠️ `VITE_*` sont lues **à la compilation** : les changer sans redéployer ne
fait rien.

`report.mjs` porte une règle de décision écrite avant les chiffres, muette sous
30 joueurs. Upstash accepte `KV_REST_API_*` ou `UPSTASH_REDIS_REST_*` ;
`vercel env pull` ne récupère **pas** ces identifiants.

---

## 11. Conventions de travail

**Commits** : message long en français qui explique **le symptôme observé, la
cause exacte, et pourquoi le correctif est celui-là**. Pas un journal de
modifications. Les chiffres mesurés y ont leur place — ce sont eux qui rendent
le commit relisible dans six mois.

**Ce que Pierre attend** : de vrais retours de playtest, précis et honnêtes. Il
dit « enchaîne tout » quand il veut que ça avance, mais il veut qu'on lui dise
quand un point est une **refonte qui demande une décision** plutôt qu'un
correctif. Ne demande pas la permission pour un correctif évident ; demande-la
pour une direction. Il veut être **contredit quand il a tort**, et prévenu
quand on s'est trompé — nommer clairement une erreur vaut mieux que la lisser.

**La famille de bugs qui revient** : trois règles ont été cassées par le
transport multijoueur alors qu'elles marchaient en solo. Le fil ne transporte
qu'un index de pièce, jamais de coordonnées ni de durée personnelle. **Toute
règle nouvelle ou modifiée doit être pensée à travers le fil.**
`tests/rules.test.ts` couvre les propriétés qui comptent.

---

## 12. Où en est le travail

**Branche** `master`, propre, poussée. Dernier commit `981ca61`, **déployé**.
**Vérification** : `tsc` · 203 tests (22 fichiers) · e2e 64 assertions ·
`vite build` — tous verts.

Fait récemment, dans l'ordre : refonte de l'espace des 6 écrans · boutons
d'option lisibles · correction des plaques · bande de chat · revue complète du
site (5 bugs) · écran de perte de vie · échelle typographique · salon adaptatif
· correctifs du playtest jour 2 · refonte UI en trois passes · **direction
artistique (le terrain devient une surface)** · **salon reconstruit sur
maquette** · **identité de marque**.

### Le canvas a été touché, une fois

Il ne l'avait jamais été. Le terrain est désormais une surface à lui (`SOL
#111A28`, trame de points tous les 50) et chaque pièce reçoit trois passes :
ombre portée, couleur pleine, arête de lumière. **`fieldRect()` est inchangé**
— mesuré `{x:24, y:30, w:952, h:400}` avant et après. C'est la condition : la
géométrie de test de collision ne bouge pas, l'habillage est décoratif.

Les pièces restent des **aplats de couleur**. C'est là qu'il faut regarder si
l'impression « prototype » persiste, et c'est aussi ce qui rend le mode
daltonien nécessaire (voir ci-dessous).

### Ce qui n'a pas été fait, et pourquoi

- **La montée de tension n'a pas pu être vue en conditions réelles** : le volet
  ne compose pas de frames. Les états cibles sont vérifiés, le ressenti non.
- **L'onboarding** n'a pas été traité directement. Le pari est que l'ouverture
  du catalogue d'entraînement en règle une bonne partie — un joueur qui
  découvre une règle différente à chaque partie apprend le jeu en jouant. **À
  vérifier au prochain playtest avant d'ajouter quoi que ce soit.**
- **Toute la refonte UI n'a JAMAIS été vue par un joueur.** Deux playtests l'ont
  informée, aucun ne l'a validée. Le point le plus suspect : les réglages du
  salon ont perdu leurs jauges et leurs « 1620 MS » au profit d'une barre
  segmentée, sur la foi d'une maquette — alors que ces jauges venaient d'un
  problème mesuré (trois joueurs sur quatre ne savaient pas régler la vitesse).

### Le pari central du pivot a reçu sa réponse, et elle est NON

*Le chat vit-il pendant les kill-cams ?* Rapporté après usage : « les joueurs
sont tellement focus et le temps court qu'ils **soufflent** pendant la pause
plutôt que de s'intéresser au chat, ils discutent ». La pause est un moment de
respiration, pas un moment de lecture.

Ça ne condamne pas la bande de chat — elle sert le salon **avant** la partie —
mais ça retire sa justification à tout ce qui viserait à l'animer **pendant**.
Ne pas reconstruire ce pari sans nouvelle preuve.

### Ce qui manque vraiment

**Une session avec des inconnus**, et le rapport du jour 3 — qui sera enfin
lisible, puisque la difficulté par règle portera sur douze règles au lieu
d'une. Un chiffre y est réfutable : les **39,4 % de morts par dépassement de
temps**. La fenêtre tient maintenant compte du nombre d'actions ; si ce nombre
n'a pas bougé, le correctif était faux.

### Backlog en cours d'arbitrage

1. **Mode daltonien.** Garance `#F74058` et jade `#40F7C0` sont la collision
   classique du daltonisme rouge-vert (~6 % des hommes en deutéranomalie), et
   ce sont exactement les deux couleurs qui portent LE SANG et le couple
   vie/mort. La couleur n'est pas décorative ici, **c'est de l'état de jeu**.
2. **Salons publics**, à la manière de BombParty — rejoindre sans code.
