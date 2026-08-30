# THE ONE RULE — mémoire de travail

Ce fichier existe pour reprendre le projet sans perdre ce qui a été appris.
Il ne décrit pas le code — le code se lit — mais **ce qui ne se déduit pas de
sa lecture** : les décisions, les pièges déjà payés, et la façon de vérifier.

> **Langue** : tout en français. Code, commentaires, messages de commit,
> réponses. Sans exception.

---

## 0. LES DIRECTIVES DE PIERRE PASSENT AVANT TOUT LE RESTE

**Ce fichier est une mémoire, pas une autorité.** Tout ce qu'il contient —
décisions, conventions, invariants, goûts — a été écrit à un moment donné avec
l'information de ce moment-là. Une directive de Pierre est plus récente et plus
informée que n'importe laquelle de ces lignes. **Elle gagne.**

Concrètement, et sans exception :

- Une consigne de Pierre l'emporte sur une « décision à ne pas défaire » du §6,
  sur une convention du §11, sur un parti pris visuel du §7. Aucune ligne de ce
  document ne se cite pour refuser de faire ce qu'il demande.
- **Ne pas demander la permission d'appliquer sa propre directive.** Il l'a
  déjà donnée.
- Ce qui reste de ce fichier après une directive contraire doit être
  **corrigé**, pas contourné : la mémoire suit la décision.

**Une seule chose est due en échange, et elle vient de lui** (§11) : « il veut
être **contredit quand il a tort**, et prévenu quand on s'est trompé ». Donc
quand une directive croise un piège déjà payé — un bug réel, mesuré, documenté
— on le **dit une fois, brièvement, avec le chiffre**, puis **on exécute la
directive quand même**. Signaler n'est pas discuter, et surtout pas retarder.

Trois exemples de ce que ça veut dire en pratique :

- « Fais un header » ⇒ on le fait, même si le §6 n°10 dit que la place est du
  gameplay. On le fait **hors flux** pour honorer les deux, et si c'est
  impossible, on le fait quand même en le disant.
- « Mets du pixel art » ⇒ on en met, même si le §7 décrit une autre identité.
  On l'écrit dans le §7 ensuite.
- « Ne fais pas X » ⇒ on ne fait pas X, y compris si ce document le recommande.

Les seules choses que ça ne recouvre pas sont celles qui ne relèvent pas du
goût ni de la direction : ne pas corrompre un fichier à l'encodage (§3), ne pas
prétendre qu'un test passe quand il échoue, ne pas annoncer fait ce qui ne
l'est pas. Ce ne sont pas des préférences, ce sont des conditions pour que le
travail veuille dire quelque chose.

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
shared/
  protocol.ts  protocole typé unique, importé des deux côtés
  jeton.ts     noyau JWT PUR — la primitive HMAC vient de l'appelant (§12)
  compte.ts    types du compte + fusion PURE + clé de comparabilité
server/
  match.ts     logique de match PURE (règles, vies, verdicts, forfaits, tension)
  index.ts     serveur ws : salons, ordonnancement, heartbeat, arrêt propre
  origin.ts    liste blanche d'origines
  jeton.ts     vérification SYNCHRONE du jeton (node:crypto)
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
  compte/      client du compte : jeton local, revendication, file PERSISTÉE
  env.ts       cleanEnv() — nettoie BOM/blancs des variables de build
api/           fonctions edge Vercel : collect, ranked, auth, moi, perf
               (`_jeton`, `_depot`, `_debit` : le `_` les exclut du routage)
supabase/migrations/  0001 identité · 0002 performances
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
`buildMultiRound(seed, idx, rule, pool)` = `draftShared` (scène commune) +
`applyRule` (piège + déformations). Serveur autorité sur le temps.

**Le pool de consignes s'adapte au SALON, pas au joueur** (`poolMulti`). Chaque
client annonce `clavier` dans son `hello` ; le serveur n'élargit que si TOUS
les sièges l'annoncent, fige la décision au lancement et la transmet dans
`match_start`. Trois raisons de ne pas le faire par joueur :

- `instr.gen()` produit les pièces, donc deux consignes différentes donnent
  deux **plateaux** différents — la kill-cam montrerait un tableau que
  personne n'a vu ;
- tout le monde lit la même consigne au même instant, et c'est ça qui fait la
  salle ;
- **absent vaut NON**, donc un client d'une version antérieure fait retomber sa
  table sur le tactile — c'est-à-dire exactement ce qu'il sait reconstruire. Un
  aperçu qui contredit le verdict est le seul défaut tenu pour fatal, et ce
  défaut-là le rend impossible par construction.

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

**`MULTI_RULES` = 10, ou 11 en salon clavier** (`multiRulesFor`) :
`mainGauche` est exclue dans les deux cas — tenir ESPACE en recevant la
consigne par rotation reste injouable même au clavier. `voyelle` ne sort que du
pool TACTILE : elle ne piège que sur des consignes clavier, donc là-bas elle
serait inerte, c'est-à-dire un avantage gratuit. Marge zéro pour 10 joueurs en
tactile, verrouillée par test — et c'est ce que l'e2e exploite pour garantir
qu'à effectif plein chaque règle tombe exactement une fois.

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
12. **Aucune fonctionnalité de jeu ne dépend du compte.** Le compte est une
    couche AU-DESSUS de l'identité d'appareil, jamais un remplacement, jamais
    un préalable. Personne ne décide jamais de rendre un compte obligatoire :
    chaque nouveauté « a juste besoin » d'un compte, et six mois plus tard le
    jeu en exige un. `tests/invariants-compte.test.ts` refuse tout import de
    `compte` depuis `engine/` et `server/match.ts`, et refuse un `if` qui
    ferait décider `client.compte` de quoi que ce soit. Corollaire :
    **absent vaut anonyme**, un jeton faux ou périmé aussi, et le serveur ne
    renvoie jamais d'erreur pour ça — la même doctrine que `clavier`.
13. **La fusion est une union et un maximum, jamais une affectation** — donc
    idempotente, commutative, monotone (`shared/compte.ts`). C'est ce qui rend
    inoffensifs les doubles onglets, les reprises réseau et les synchros
    concurrentes. Et elle n'a lieu **qu'une fois par appareil**
    (`compte.revendiquePar`) : sans ce marquage, se connecter sur le téléphone
    d'un ami aspirerait son carnet. Un bug ici ne casse rien — il fait
    rétrécir un carnet en silence.
14. **Ce qui est opposable à autrui est REJOUÉ ; le reste ne l'est pas, et ne
    doit jamais se confondre avec.** La table `performance` ne contient que du
    vérifié par `verifyRun` ; carnet, série et records d'entraînement vivent
    dans `utilisateur.agregats`, qui sont des affirmations du client. Mélanger
    les deux ferait démarrer un futur classement sur des faits invérifiables.

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

### La faille : la vitrine du site

**Le composant SOLO / MULTI est UN objet fendu horizontalement**, pleine
largeur, et la FISSURE entre les deux est le sujet — pas la séparation.

Deux `<button>` superposés, chacun découpé par un `clip-path: polygon()` qui
suit la même suite de crans décalée : l'écart laisse voir le fond, et c'est lui
qu'on lit comme la déchirure. Aucun trait n'est dessiné. `clip-path` découpe
**aussi le test de survol** — chaque zone ne reçoit que les clics qui tombent
dedans, sans une ligne de géométrie en JS, et le clavier marche parce que ce
sont de vrais boutons. Mesuré : 50 % SOLO · 41 % MULTI · 9 % de couture.

**La fissure est un calque HORS des boutons.** Dans le découpage, tout ce
qu'elle émet serait rogné à son propre bord au lieu d'en sortir.

Trois plans qui ne battent pas au même rythme — même principe que `--heat`,
qui sépare le voile et le cadre : une **lueur** qui respire (3,2 s), un
**balayage** qui passe (5,2 s), des **éclats** qui montent (2,6 s). Trois
vitesses donnent de la vie ; une seule donne une boucle.

**Deux mondes derrière la cassure.** Au survol de SOLO, des flèches *montent*
(progression, escalade) ; au survol de MULTI, des épées *tombent*. Vérifié :
au repos les deux émetteurs sont à `animation: none`, et chacun ne s'allume
que sur sa moitié. La lueur accélère différemment — 1,4 s côté solo, 1,1 s
côté multi.

Les pictogrammes sont des **SVG en `data:`**, pas des emoji : le rendu d'un
emoji change d'un système à l'autre, et une épée qui devient un carré blanc
chez un joueur sur trois n'est pas un effet, c'est un bug.

⚠️ **Tout ce qui bouge est décoratif et `aria-hidden`.** C'est la condition
pour qu'un `prefers-reduced-motion` généreux reste honnête : rien ne se perd
quand le mouvement est coupé. Et seuls `transform` et `opacity` sont animés —
la même règle que `--heat`.

⚠️ **Aucun coût pendant une partie** : l'accueil est en `display: none` en
jeu, et une animation sur un élément non affiché ne compose pas.

### La couche pixel

**Le composant SOLO / MULTI est UN objet fendu**, pas deux boutons voisins.
Deux `<button>` superposés, chacun découpé par un `clip-path: polygon()` qui
suit la même suite de crans décalée : l'écart laisse voir le fond, et c'est
lui qu'on lit comme la déchirure. Aucun trait n'est dessiné.

`clip-path` découpe **aussi le test de survol** — chaque zone ne reçoit que
les clics qui tombent dedans, sans une ligne de géométrie en JS, et le clavier
marche parce que ce sont de vrais boutons.

Deux formes, pour une raison mesurée :

| | large | étroit (≤ 560 px) |
|---|---|---|
| axe | diagonale, 82 % à gauche → 15 % à droite | bande, 60 % → 51 % |
| répartition des clics | 45 / 48 / 8 % de couture | 55 / 37 / 8 % |

Sur un composant étroit ET court, une diagonale mange les deux coins et ne
laisse à aucune face la largeur d'écrire : **22 % de l'état de SOLO tombait
hors de sa propre zone de clic**. Raccourcir le texte n'aurait rien réglé —
le nom de la règle du jour varie, « LA MAIN GAUCHE » est plus long que
« LE SANG », donc ce qui tient aujourd'hui déborde demain. C'est la fente qui
change d'axe, et la correction devient indépendante du contenu.

⚠️ **Deux pièges de mesure payés sur ce seul composant.**

- **Une grille d'échantillonnage trop grossière ment dans le sens
  rassurant.** Un relevé 7×4 annonçait 0 % de débordement ; en 21×9, le même
  élément en montrait 22 %. Les points passaient entre les crans.
- **Le HMR de Vite n'applique pas toujours une media query ajoutée.** Trois
  relevés successifs ont lu du CSS périmé et donné le même chiffre après des
  correctifs pourtant réels. **Recharger la page avant de conclure qu'un
  correctif CSS ne fait rien.**

**La couche pixel** est de la MATIÈRE, pas une identité de remplacement :
`--px` comme module, un grain en `repeating-linear-gradient` à 45°/-45°, un
cadre en marches en `box-shadow` étagées, une ombre décalée d'un module sur le
logo, `image-rendering: pixelated` sur les glyphes. Les braises s'animent en
`steps()` — une flamme lissée jurerait avec des angles droits, une flamme en
crans est du même monde.

**Elle ne touche pas au canvas**, et c'est vérifié à chaque fois plutôt
qu'affirmé : buffer et `fieldRect()` identiques avant/après. Les pièces
gardent couleur, forme et trame — second canal du mode daltonien et géométrie
de test de collision.

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

### Jour 3 (30/08/2026) — les deux correctifs tiennent, et un effet de bord

50 joueurs uniques sur trois jours, 181 runs, dont **39 joueurs le jour 240** —
le déploiement tombe entre le 239 et le 240, et c'est ce qui rend le tableau
lisible. **Ne JAMAIS lire ce rapport en agrégé** : sur les trois jours réunis,
les morts au temps ressortaient à 41,4 % contre 39,4 % au relevé précédent,
c'est-à-dire un correctif inefficace. Découpé, il dit l'inverse.

| | j238 | j239 | **j240** |
|---|---|---|---|
| règles vues à l'entraînement | 1 | 2 | **12** |
| LE SANG | 100 % | 96,8 % | **29,7 %** |
| mort au temps | 21,4 % | 52,7 % | **31,1 %** |
| mort sur un mauvais choix | 35,7 % | 40,9 % | **64,9 %** |
| mort sur la règle unique | 42,9 % | 6,5 % | **4,1 %** |

- **Le catalogue d'entraînement fonctionne.** Une règle visible sur douze est
  devenue douze sur douze. C'était le premier bug de conception du jour 2.
- **La fenêtre qui tient compte du nombre d'actions fonctionne.** Les morts au
  temps tombent de moitié, et les joueurs meurent désormais sur une DÉCISION
  plutôt que sur l'horloge — c'est exactement ce que le rapport appelle de ses
  vœux.
- **L'effet de bord, et il n'est pas mince** : les morts sur la règle unique —
  donc sur le PIÈGE, le seul élément non copiable du jeu — passent de 42,9 % à
  **4,1 %**. La cause est mécanique : **cinq règles sur douze seulement portent
  `traps: true`**, les sept autres sont des déformations qui ne piègent jamais.
  Tant que LE SANG sortait 96 % du temps, le piège était constamment en jeu ;
  en ouvrant le catalogue, on a divisé son exposition. Le correctif était juste
  et nécessaire — mais il a dilué le cœur du jeu, et personne ne l'avait prévu.
  **Décision en attente** : pondérer le tirage vers les règles piégeantes,
  donner des pièges aux sept déformations, ou assumer la variété.
- **Session médiane 1 min 05 s** contre 10 min 02 s au jour 2. Ne pas y lire une
  régression : la population a changé — 39 visiteurs largement nouveaux contre
  9 amis réunis pour jouer. C'est le rebond d'un entonnoir élargi.
- D1 **35,7 %** (n=14), stable. D7 toujours pas mesurable.

### Jour 2 (28/08/2026)

14 joueurs, 33 runs, D1 37,5 % (n=8), session médiane
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
| ~~Pas de comptes~~ | **levée** — comptes optionnels livrés (§12). Reste à configurer : sans les variables, tout se comporte comme avant |
| `api/ranked.ts` en `MemoryStore` | mode classé masqué en production. **Ne pas rebrancher `a=top` tel quel** : il accepte `body.id` sans aucune vérification, donc n'importe qui peut soumettre sous n'importe quelle identité. Le vrai chemin est `api/perf.ts`, qui exige un jeton |
| ~~Pas de version de génération sur les runs stockés~~ | **levée** — `VERSION_CONTENU` est calculée depuis le contenu (§12) |
| Jeton révoqué encore valable en salon ≤ 24 h | le serveur Fly n'a pas de base, donc il ne peut pas vérifier `version_jeton` : la péremption du jeton EST la fenêtre de révocation. Assumé, borné, documenté dans `shared/jeton.ts` |
| Agrégats non vérifiables | carnet, série et records montent du client sans preuve. Sans conséquence tant qu'ils ne servent qu'au joueur — **fatal le jour où ils toucheraient un classement** (décision n°14) |
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

**Un test ne doit jamais dépendre en silence de QUELLE règle tombe où.**
L'attribution multijoueur a été figée pendant des mois — siège 0 = LE SANG, à
vie — et quatre tests plus deux mécanismes de l'e2e s'y étaient adossés sans le
dire. La dépermuter a révélé **trois** aides qui passaient par chance :

- `playPerfect` ne jouait que la PREMIÈRE étape — mortel sous LE JUMEAU, qui
  demande chaque geste deux fois ;
- elle posait `x: 0, y: 0` comme position de clic, soit l'angle du terrain —
  mortel sous LE GAUCHER, qui interdit `x < 200` ;
- le pilote de l'e2e agissait à **230 ms** — mortel sous LA SECONDE, qui refuse
  toute action avant 400. Il tire désormais à 460 : au-dessus des 400
  interdits, sous les 700 de `MIN_ROUND_MS`. La fenêtre est étroite et le
  chiffre n'est pas libre.

Le symptôme était toujours le même et toujours trompeur : le test accusait le
jeu d'avoir éliminé le mauvais joueur, alors que c'est l'aide qui jouait mal.

Deux façons propres de s'en passer, toutes deux en place :

- **nommer la règle dont on a besoin** — `matchAvec("sang", …)` cherche une
  graine qui la donne au siège 0, et le test dit alors ce qu'il exige ;
- **jouer à effectif plein** — dix règles au pool, dix sièges au maximum, donc
  `rulesAt` distribue une bijection : à dix joueurs, chaque règle tombe
  exactement une fois. C'est ce qui rend le scénario GAUCHER de l'e2e
  déterministe sans rien tirer au sort.

---

## 12. Où en est le travail

**Branche** `master`. **Vérification** : `tsc` · 396 tests (34 fichiers) ·
e2e 74 assertions (~2 min 20) · `vite build` — tous verts.

⚠️ **Casser le correctif pour éprouver un test ne marche plus partout** : le
classificateur de permissions refuse de lancer les tests quand une
vérification de signature vient d'être neutralisée dans la source. Sur du code
cryptographique, il faut donc donner les dents au test lui-même — par exemple
en reconstruisant une charge modifiée avec l'ancienne signature, ce que fait
`tests/jeton.test.ts`, plutôt qu'en désactivant le contrôle.

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

### Mode motifs (daltonien) — fait

Réglage `MOTIFS`, persisté. Chaque couleur porte une trame en plus de sa
teinte : hachures montantes pour la garance, points pour le jade, barres pour
l'azur, hachures descendantes pour l'ambre — choisies pour se distinguer AU
SEIN de chaque paire qui se confond, pas seulement les unes des autres.

**L'encre de la trame se calcule, elle n'est pas choisie** (`encrePour`). Une
encre sombre unique donnait 33 sur l'ambre et 12,7 seulement sur l'azur. Et le
piège : décider sur la clarté en vision NORMALE donne la mauvaise réponse pour
la garance — 105, donc « sombre », alors qu'un deutéranope la perçoit à 181,
donc claire. Il faut juger sur la clarté **perçue**. Après correction, l'écart-
type de clarté dans la pièce, en simulation de deutéranopie :

| | éteint | allumé |
|---|---|---|
| garance | 3,0 | 28,3 |
| ambre | 1,1 | 33,3 |
| azur | 4,2 | 30,1 |
| jade | 1,8 | 16,6 |

Deux autres surfaces : la frise de fin de run gagne des silhouettes (rond,
losange, triangle, croix) — c'était la seule chose du jeu qui ne disait son
affaire QUE par la teinte. Et **LE DALTONIEN sort du tirage** (`withoutInk`) :
elle joue sur le conflit entre le mot et l'encre, donc elle ne devient pas
injouable mais INERTE — un avantage gratuit, la famille de la décision n°1.

Le reste du jeu portait déjà un second canal : les plaques distinguent par
remplissage plein contre liseré, le verdict porte le mot autant que le filet,
et l'état critique parle à l'oreille au même seuil qu'à l'œil.

### Pool par salon — fait

Voir §4. Entre claviers, les 19 consignes s'ouvrent et LA VOYELLE rentre au
pool de règles ; dès qu'un téléphone s'assoit, on retombe sur les 15 tactiles
et elle ressort. Vérifié sur le fil : salon tout-clavier, `typeLetter` tirée et
jouée, **0 mort sur 21 verdicts** — un désaccord de pool les aurait tous fait
rater, puisque les indices de pièces ne désigneraient pas les mêmes formes.

### Deux modes ajoutés — à mesurer

**ESCALADE** (solo). Une règle, puis une de plus toutes les 8 manches, plafond
à 4. Le score est le nombre de règles TENUES, pas de manches. Existe pour
remonter la densité de pièges, et le fait — mesuré, proportion de manches
piégeuses : catalogue actuel 5,4 % · palier 1 **11,3 %** · palier 2 23,4 % ·
palier 3 32,7 % · palier 4 **39,4 %**.

⚠️ 39 % veut dire quatre manches sur dix où il faut NE RIEN FAIRE. Ça peut
basculer d'exigeant à passif — une épreuve d'inhibition plutôt que de réflexe.
`PALIER_MAX` est le bouton. **C'est la première chose à regarder en soirée.**

**DUO** (multi). Réglage de salon ÉQUIPES. Deux joueurs par équipe, une réserve
commune, même règle pour les deux, consignes identiques. Un impair joue seul
avec une réserve réduite de moitié.

Les deux reposent sur la même astuce, qui vaut d'être retenue : **le mode
existant devient un cas particulier du nouveau.** Une pile d'une règle rend
cette règle elle-même ; une équipe d'un joueur est un joueur. Aucun
branchement de mode dans les chemins chauds, donc l'existant ne peut pas
régresser — et c'est vérifié par test dans les deux cas.

### Ce qui reste sur DUO

- Les **règles coordonnées** (une action à deux) ne sont pas faites : c'est un
  nouveau modèle de résolution, le serveur juge aujourd'hui chaque joueur
  séparément.
- Les **consignes différentes entre partenaires** non plus. Elles supposeraient
  une scène qui satisfait DEUX consignes sans ambiguïté — `instr.gen()`
  construit les pièces pour qu'une seule satisfasse la sienne. C'est le vrai
  problème de génération, et il n'est pas résolu.
- L'appariement suit l'ordre d'ARRIVÉE. Pas de choix de partenaire.

### Comptes optionnels — fait, jamais vus par un joueur

Quatre lots livrés d'affilée : socle d'identité, revendication, performances,
durcissement. **Rien n'est visible tant que le déploiement n'est pas
configuré** — sans `TOR_AUTH_SECRET`, sans Supabase ou sans fournisseur OAuth,
le bouton COMPTE reste masqué et le jeu se comporte exactement comme avant.
Vérifié en dev : accueil rendu, zéro erreur console, bouton masqué.

```
shared/jeton.ts       noyau JWT PUR (encodage, revendications, péremption)
server/jeton.ts       HMAC node:crypto — SYNCHRONE
api/_jeton.ts         HMAC crypto.subtle — asynchrone
api/_depot.ts         interface Depot + Supabase REST + mémoire
api/_debit.ts         limitation adossée à l'Upstash existant
api/auth.ts           OAuth Google/Discord, jeton, rafraîchissement, révocation
api/moi.ts            profil, fusion, identité, perfs, suppression
api/perf.ts           soumission du run du jour, rejouée par verifyRun
src/compte/           client : jeton local, revendication, file PERSISTÉE
supabase/migrations/  0001 identité · 0002 performances
```

**Pourquoi DEUX implémentations HMAC.** Le `hello` de `server/index.ts` est
traité dans un `switch` synchrone ; une vérification asynchrone ferait entrer
le joueur dans le salon sous son identité anonyme, et son nom changerait sous
les yeux des autres une milliseconde plus tard. `node:crypto` sait signer sans
promesse, `crypto.subtle` non. La logique est écrite une fois dans
`shared/jeton.ts`, et `tests/jeton.test.ts` **signe avec l'un et vérifie avec
l'autre, dans les deux sens, plus une comparaison OCTET POUR OCTET** — sans ce
croisement, les deux chemins divergeraient en silence et le symptôme serait
« le multi ne me reconnaît pas », c'est-à-dire indébogable.

**Le glyphe est devenu adressable** (`glyphIndex` / `glyphFromIndex`, bijection
testée sur les 144). Il n'existait que dérivé de l'`anonId`, donc il ne
survivait pas à un changement d'appareil — alors qu'un signe est précisément ce
à quoi les autres vous reconnaissent. Il voyage maintenant comme une VALEUR
dans le jeton, ce qui lui donne d'avance la forme d'un identifiant d'objet
possédé. `utilisateur.apparence` est un **JSONB à clés ouvertes** : l'habillage
des cartes de partie s'y ajoutera sans migration, et `apparenceAutorisee()` est
le point d'accroche unique d'une future possession.

**`VERSION_CONTENU` est CALCULÉE** (`src/engine/version.ts`), pas tenue à la
main : ajouter une règle ou changer une pondération de consigne la change, que
l'on y pense ou non. C'était la dette « pas de version de génération sur les
runs stockés ». Elle ignore volontairement l'ordre de déclaration et
l'habillage — une version qui change tout le temps ne segmente plus rien.

⚠️ **La limite de fond de l'anti-triche, à ne pas oublier.** `verifyRun` prouve
qu'un journal est COHÉRENT, pas qu'un humain l'a produit. La graine du jour
étant publique et déterministe, on peut chercher un journal optimal hors ligne
et y injecter des délais d'apparence humaine : `antibot` ne verra rien, il
n'observe qu'une dispersion que le forgeur choisit. C'est la raison pour
laquelle un classement **mondial** n'est pas la bonne première forme — un
classement d'amis rend le problème social au lieu de le rendre technique.

**Ce qui reste à faire pour que ça vive** (côté Pierre, non codable ici) :
projet Supabase + les deux migrations, applications OAuth Google et Discord,
puis les variables : `TOR_AUTH_SECRET` (le même des deux côtés), `TOR_APP_URL`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID/SECRET`,
`DISCORD_CLIENT_ID/SECRET` sur Vercel — et `TOR_AUTH_SECRET` sur Fly.
⚠️ `fly secrets set` redémarre la machine et tue les salons : à faire quand
personne ne joue, puis revérifier `fly scale count 1`.

**Pas de classement, et c'est délibéré.** L'index `performance_classement`
existe, la clé de comparabilité existe, aucune route ne rend les performances
de quelqu'un d'autre. Ce qu'il faut regarder d'abord, ce sont les trois
événements `compte_invite` → `compte_start` → `compte_lie` : les testeurs ont
RÉCLAMÉ les comptes, ce qui n'est pas la même chose que les utiliser — le
partage de score aussi était réclamé, et il est resté à 0 %.

### Backlog

1. **Nouvelles consignes** — glisser, balayer, double-appui, maintien. De
   nouveaux types d'entrée, donc de nouvelles actions sur le fil et une
   nouvelle résolution : un chantier, pas un ajout de contenu. C'est aussi ce
   qui donnerait des pièges aux sept règles qui n'en ont pas.
2. **Salons publics**, à la manière de BombParty — rejoindre sans code. Mis de
   côté : sa valeur est proportionnelle au nombre de joueurs SIMULTANÉS, et une
   liste vide dit « personne ne joue ».

### Ce qui a été écarté avec des chiffres

**« Les joueurs de ce soir étaient plus forts »** — proposé comme explication
alternative à la chute des morts sur la règle unique. Ne tient pas : à règle
égale (LE SANG), le score médian du jour 240 est de **11,5** contre **13** au
jour 239. Ils n'étaient pas plus forts. La dilution est mécanique.
