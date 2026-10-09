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
npm run lint                 # ESLint, justesse seulement (pas de style)
npx tsc --noEmit
npx vitest run
npx tsx e2e.mjs
npx tsx e2e-navigateur.mjs   # le VRAI client dans Chromium (Vite en dev)
npm run coverage             # cliquet sur engine, game, shared, api
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
    escalade     tirage de la pile de règles (ici, pas dans game/ : `verify`
                 en a besoin côté serveur)
    rng, scene (grille 5×3), instructions/ (19 dont 15 tactiles),
    rules/ (16 règles + withoutHold), round, multiround, resolve,
    verify, difficulty (windowMs, windowForSteps, STEP_MS)
  game/        daily (ruleOfDay, trainingRule), session, quests, progress, replay
  i18n.ts      FR/EN : chaînes statiques, dynamiques, et COMPOSITION des
               consignes depuis leur forme structurée (`Phrase`)
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
| Fenêtre | `windowMs` : `<12 → 4000−180·lvl`, sinon `max(700, 1840−30·(lvl−12))` — redescendue sur directive de Pierre ; puis `fenetreAllure(base, allure) = min(base·allure, max(base, 4000))` : une allure lente n'AJOUTE jamais au-delà de 4 s |
| Étapes | `STEP_MS 280` — chaque action **supplémentaire** ajoute ce temps |
| Multi | `MIN_ROUND_MS 700`, `MAX_ROUND_MS 2400`, `INPUT_TOLERANCE_MS 120` |
| Interludes | normal 1100 · vie perdue 2400 · élimination 4200 · duel 500 · rotation 3400 |
| Compte à rebours | `COUNTDOWN_MS 4500` — c'est le temps de LIRE sa règle |
| Lecture solo | `LECTURE_NEUVE_MS 3000` / `LECTURE_CONNUE_MS 1200` — même rôle, côté solo |
| Tension | duel `0.7` · warm `max(0.9, 1.45−0.02·idx)` · `ROTATION_GRACE_FACTOR 1.5` |
| Salon | `MAX_PLAYERS 10`, `MAX_ROUNDS 60`, `ROTATION_EVERY 8` |
| Réglages hôte | vitesse `[1.7 … 0.65]` · vies `[1,3,5]` · rotation `[4,8,16,999]` |
| Allure solo | `PACE_CHOICES [2, 1.5, 1, 0.8]`, `PACE_DEFAULT 1`, défaut du joueur **2** |
| Solo | `DAILY_LENGTH 40`, `DAILY_ESSAIS 3`, `GRACE_ROUNDS 3`, `FORCED_TRAP_ROUNDS {2,5,9}` |
| Reconnexion | `RECONNECT_GRACE_MS 25000` · `ROOKIE_BONUS_LIVES 1` · client : `ATTENTES_REPRISE_MS` couvre 20 s du sursis (`net/reprise.ts`) |
| UI | `--tap 44px` · `COLUMN_MIN 176` / `COLUMN_ENTER 232` ↔ `.plate min-width 150` |

**`MULTI_RULES` = 14, ou 15 en salon clavier** (`multiRulesFor`) :
`mainGauche` est exclue dans les deux cas : tenir ESPACE en recevant la
consigne par rotation reste injouable même au clavier. `voyelle` ne sort que du
pool TACTILE : elle ne piège que sur des consignes clavier, donc là-bas elle
serait inerte, c'est-à-dire un avantage gratuit.

⚠️ **LA BIJECTION EST MORTE, et elle était exploitée.** Le pool tactile faisait
exactement 10 règles pour 10 sièges : à effectif plein, chaque règle tombait une
fois et une seule. L'e2e s'en servait pour garantir qu'un siège portait LE
GAUCHER. À 14 règles pour 10 sièges, il n'apparaît plus que 10 fois sur 14 —
l'assertion serait devenue intermittente, environ une fois sur trois, sans
qu'aucun code de jeu n'ait changé. **Le scénario relance donc le match jusqu'à
l'obtenir**, boucle bornée et échec nommé. Mesuré : obtenu au premier lancement
sur deux passages.

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
8. **Identité STICKER** (remplace « Nocturne » depuis la refonte parcours,
   carte blanche de Pierre) : fond sable, encre prune `--encre`, contours
   épais, ombres FRANCHES sans flou, arrondis, Fredoka + Nunito, accent
   violet `--signal` pour l'action évidente. Invariants qui, eux, ne bougent
   pas : les quatre teintes des pièces (calibrage daltonien, au chiffre près),
   la géométrie du champ, `prefers-reduced-motion`. Voir §7 et `src/theme.css`.
   **Elle a une NUIT** (réglage APPARENCE : AUTO / CLAIR / SOMBRE, AUTO par
   défaut) : mêmes formes, jetons retournés — voir §7.
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

15. ~~DÉJOUER n'entre jamais dans `resolveAction`~~ — **DÉJOUER EST RETIRÉ**
    (directive de Pierre, 25/09 : « elle rend le jeu assez facile »). Sur le
    papier il ne changeait aucune issue ; en pratique il ôtait au joueur la
    fenêtre où il CRAQUE, et remplaçait « ne rien faire » par « appuie sur
    F » — la retenue, seule mécanique non copiable, par un réflexe de plus.
    Au niveau 1-2, où le jeu ANNONCE le piège, il le rendait gratuit. Ne pas
    le réintroduire sous une autre forme sans répondre à ça ; le vrai
    problème qu'il traitait — le temps mort des pièges — est au §12.
16. **Le terrain debout est une transformation d'AFFICHAGE, jamais de jeu.**
    Tout ce qui convertit entre champ et écran passe par
    `render/orientation.ts` — dessin, clic, curseurs, gouttières. Une
    conversion écrite « par axe » (`x / FIELD_W * w`) est fausse debout. Les
    bandes réservées (consigne 112 px, plaques/tutoriel 150 px) sont des
    CONSTANTES : caler le terrain sur un contenu le ferait bouger en partie.
17. **AUCUNE BANDE DE HUD N'A LE DROIT D'AVOIR UNE HAUTEUR VARIABLE.** C'est
    le corollaire de la n°10 et de la n°2 réunies, et il a été payé : couché,
    `#head` était dans le flux et sa hauteur suivait la consigne, donc le
    champ rétrécissait DE 24 % EN PLEINE MANCHE quand une consigne passait sur
    deux lignes — et de 9 % sur un bureau quand une consigne à glyphe
    arrivait. Une bande se dimensionne sur son pire cas, une fois, et ce qui
    déborde déborde dans le letterbox ; jamais l'inverse.

---

## 7. La couche visuelle

> ⚠️ **Depuis la refonte PARCOURS, l'identité est « STICKER »** (§6 n°8,
> §12). `src/theme.css` est chargée APRÈS `style.css` et **échange les valeurs**
> de `--ink` (fond, devenu sable) et `--paper` (texte, devenu prune) : les
> 15 000 lignes d'origine basculent sans être réécrites. `--signal-pale`,
> qui servait de TEXTE sur fond noir (68 déclarations), devient un violet
> profond. Tout ce qui suit décrit l'ancienne couche ; les pièges CSS qu'il
> documente restent vrais. Les tests qui lisent la feuille ne lisent que
> `style.css`, sauf `hidden.test.ts` qui lit les deux — **un composant neuf
> se style dans `theme.css`, et sa règle `.hidden` aussi.**
>
> **LA NUIT.** `theme.css` redéfinit ses jetons sous `:root[data-theme="sombre"]`
> ET sous `prefers-color-scheme: dark` + `:root:not([data-theme="clair"])` — deux
> portes, un seul jeu de valeurs, et `tests/theme.test.ts` exige qu'elles restent
> identiques et que chaque jeton de couleur du jour ait sa valeur de nuit (un
> jeton oublié garde sa valeur de jour : du prune sur du noir).
> - `--encre` est à la fois TEXTE, CONTOUR et OMBRE le jour ; la nuit il passe
>   au crème, donc **une ombre portée s'écrit `var(--ombre-c)`, jamais
>   `var(--encre)`** — sinon elle devient une barre claire sous le bouton.
> - Pas de couleur en dur dans `theme.css` hors du bloc `:root` : l'or est
>   `--or` / `--or-fond`, pour la même raison.
> - Le CANVAS ne lit pas de CSS : `appliqueTheme` pose `scene.sombre`, et
>   écoute `matchMedia` pour suivre une bascule système en cours de partie. Il
>   ne change QUE le terrain du style maison (`terrainDe`) et l'encre du cadre
>   de temps, qui vit hors du champ, sur la page. Les teintes des pièces ne
>   bougent pas d'un chiffre.

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
largeur du `#app` (plus de padding latéral sur `#home`), et la FISSURE
entre les deux est le sujet — pas la séparation.

Deux `<button>` superposés, chacun découpé par un `clip-path: polygon()` qui
suit la même suite de crans décalée : l'écart laisse voir le fond, et c'est lui
qu'on lit comme la déchirure. Aucun trait n'est dessiné. `clip-path` découpe
**aussi le test de survol** — chaque zone ne reçoit que les clics qui tombent
dedans, sans une ligne de géométrie en JS, et le clavier marche parce que ce
sont de vrais boutons. Mesuré à 1440 × 900, animations coupées : faille
1407 px / `#app` 1424 px (**98,8 %**, `left: 1`) — c'est un objet pleine
largeur, plus deux zones posées au milieu. Hits (grille 28 × 16) : **51 %
SOLO · 31 % MULTI · 18 % de couture**. La couture a grossi avec la hauteur
(451 px) : le ruban garde la même amplitude en %, donc plus de pixels morts
au milieu. C'est le prix de la vitrine, pas un oubli.

**La fissure est un calque HORS des boutons.** Dans le découpage, tout ce
qu'elle émet serait rogné à son propre bord au lieu d'en sortir.

⚠️ **Un abîme trop sombre est invisible.** Premier essai : poches chaudes
sur du `#0a0715`, presque `--ink`. La fente se lisait comme une couture,
pas comme une déchirure. L'abîme est maintenant un ruban LUMINEUX — noir
d'abord, mais percés de `--signal` / `--signal-pale` / `--paper` francs.
C'est le contraste, pas la largeur, qui fait la cassure.

Plusieurs plans qui ne battent pas au même rythme — même principe que
`--heat` : balayage, braises, débris, éclats, traversées. Pas de halo
pulsant : il se lisait comme une lampe, pas comme une cassure. Une seule
vitesse donne une boucle.

**Deux mondes derrière la cassure.** Au survol de SOLO, des chevrons
*montent* et l'abîme blanchit ; au survol de MULTI, des lames *tombent* et
l'abîme s'embrase. Vérifié : au repos les deux émetteurs sont à
`animation: none`, et chacun ne s'allume que sur sa moitié.

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

### Jours 238-245 — LE CHIFFRE QUI COMMANDE TOUT LE RESTE

139 joueurs uniques, 572 runs, sept jours. Et une mesure qui écrase les autres :

> **106 joueurs sur 139 — 76 % — n'ont JAMAIS lancé une partie.**
> 9 en ont joué une seule, 24 en ont joué deux ou plus.

Tant que ce nombre ne bouge pas, aucune métrique de jeu ne veut dire
grand-chose : elles décrivent les 24 % qui restent. La collecte est fiable pour
en juger — `metrics.on` vaut `true` par DÉFAUT et le bandeau ne conditionne
rien, donc on mesure bien tout le monde, y compris ceux qui repartent.

**Le jeu n'est PAS trop dur — sauf à la première manche qui compte.** Sur les
572 runs : score médian **12**, p75 **20**, record **201**. Mais le PREMIER run
de chaque joueur a une médiane de **4**, et la moitié de ces morts sont des
dépassements de temps.

⚠️ **LA FALAISE, et elle est de conception.** Répartition des morts par manche,
tous runs confondus :

| manche | 0 | 1 | 2 | **3** | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| morts | 0 | 0 | 0 | **76** | 30 | 42 | 21 | 22 | 26 | 16 |

`GRACE_ROUNDS = 3`. Zéro mort tant que l'échauffement protège, puis **76 à la
manche 3** — plus du double de n'importe quelle autre. Pendant trois manches on
APPREND au joueur que se tromper ne coûte rien, et le bandeau le lui écrit ;
puis le message disparaît en silence et la manche suivante tue.
L'échauffement n'enseignait pas, il repoussait. Corrigé par une ANNONCE
(« À TOI DE JOUER »), pas en touchant à la courbe : `GRACE_ROUNDS` et `windowMs`
entrent dans `VERSION_CONTENU` et couperaient la comparabilité de tous les
scores déjà enregistrés.

Le pic secondaire de la manche 5 est un `FORCED_TRAP_ROUNDS` **hors
échauffement** — le commentaire de `difficulty.ts` annonce « deux fois, pendant
l'échauffement où l'erreur ne tue pas », or seule la manche 2 y est. Constaté,
pas corrigé : le changer modifie le run du jour. À trancher avec une mesure.

**Autres chiffres du relevé** : entraînement **538 runs** contre 13 pour le run
du jour et 18 pour l'escalade — le bouton JOUER de l'accueil mène droit à
l'entraînement, et les deux autres modes sont devenus invisibles. Quêtes
validées par 15 % des joueurs. Invitations envoyées par 5 %. Partage **0 %**,
comme depuis le début. D1 **8,3 %** — à ne pas comparer aux 35,7 % du jour 3,
qui portaient sur 14 amis contre 120 inconnus.

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
| **Front et salons déployés séparément** — ⚠️ **a planté la prod le 30/09** (§12) | Vercel et Fly ne bougent pas ensemble : le serveur peut nommer une règle absente du bundle d'un client resté sur l'onglet de la veille. Le jeu ne gèle plus (§12, playtest 247) mais la manche reste illisible pour lui. `multi_manche_illisible` le mesure ; toute valeur non nulle au rapport veut dire « redéployer celui des deux qui est en retard » |
| ~~Pas de comptes~~ | **levée** — comptes optionnels livrés (§12). Reste à configurer : sans les variables, tout se comporte comme avant |
| `api/_ranked.ts` en `MemoryStore` | mode classé masqué ET hors routage (le `_`, depuis l'audit d'architecture du 07/10). **Ne pas le renommer tel quel** : `submit` accepte `body.id` sans aucune vérification, donc n'importe qui soumet et se renomme sous n'importe quelle identité. Le score de l'adversaire est désormais relu du stockage (`opponentRunId`), et `a=top` ne rend plus l'`id`. Le vrai chemin est `api/perf.ts`, qui exige un jeton |
| ~~Pas de version de génération sur les runs stockés~~ | **levée** — `VERSION_CONTENU` est calculée depuis le contenu (§12) |
| Jeton révoqué encore valable en salon ≤ 24 h | le serveur Fly n'a pas de base, donc il ne peut pas vérifier `version_jeton` : la péremption du jeton EST la fenêtre de révocation. Assumé, borné, documenté dans `shared/jeton.ts` |
| Agrégats non vérifiables | carnet, série et records montent du client sans preuve. Sans conséquence tant qu'ils ne servent qu'au joueur — **fatal le jour où ils toucheraient un classement** (décision n°14) |
| Aucun filet sur la mise en page | jsdom ne calcule pas de layout. Playwright a fait ses preuves À LA MAIN (salon, tutoriel, nuit : une dizaine de défauts trouvés) mais n'est pas dans le dépôt |
| Hôte coupé | bloque le lancement ≤ 25 s |
| Plafond de contenu | 16 règles ; 120 combinaisons possibles à deux règles |
| ~~Pièces sans dépense~~ | **levée** — la boutique de styles de pièces (§12, refonte PARCOURS) |
| Domaine écrit en dur dans `index.html` | `og:image` exige une URL absolue — si le site déménage, la vignette meurt en silence. `tests/marque.test.ts` vérifie au moins que `og:url` et `og:image` restent d'accord |
| ~~Couleur sans second canal~~ | **levée** — mode MOTIFS (§12) |
| ~~Aucune intégration continue~~ | **levée** — `.github/workflows/verification.yml` relance tsc, vitest, le build (et l'absence de `__tor` dans `dist`) puis l'e2e, sur les PR vers `master`. ⚠️ L'e2e y tourne sur une machine partagée : les faux échecs de charge ([001], [005]) peuvent y paraître |

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

**Branche** `master`. **Vérification** : `tsc` · vitest · e2e · `vite build`.

### Phase 3 de l'audit : les tests (08/10/2026)

Directive de Pierre : « je te laisse choisir ces décisions », puis les phases
3 à 7 dans l'ordre, un commit par point. Ce qui ne se déduit pas du code :

- **16 — `DepotSupabase`** : 44 tests figent les requêtes des 24 méthodes
  (`fetch` remplacé par un enregistreur). Trouvé : `leveDrapeau` ignorait la
  réponse du PATCH — un drapeau d'anti-triche perdu en silence.
- **17 — Entrées malformées** (`tests/entrees-malformees.test.ts`, et un
  client FUZZ dans l'e2e). Trouvé : un corps `null` faisait LEVER perf, moi,
  amis et collect (500). `api/_corps.ts` (`litObjet`) ne rend qu'un objet.
  ⚠️ Dans l'e2e, le corpus commençait par des `hello` de mauvaise version :
  la socket se fermait et le reste n'arrivait jamais — « 0 erreur » ne
  prouvait rien. Version fausse envoyée EN DERNIER.
- **18 — Concurrence** (`tests/concurrence.test.ts`). ⚠️ Le dépôt en mémoire
  répond sans attendre : le premier jet passait AUSSI sur l'ancien code. Le
  proxy `lent` fait attendre chaque appel d'un tour de boucle, et les deux
  requêtes s'entrelacent comme en production. Trouvé : deux demandes
  croisées restaient en attente (C4), deux acceptations dépassaient
  `MAX_AMIS`.
- **19 — Coupure réseau, VRAI client** (`e2e-navigateur.mjs`). ⚠️
  `context.setOffline` ne coupe pas une socket déjà ouverte (mesuré : 10 s
  hors ligne, siège toujours `connected`). Le navigateur passe donc par un
  RELAIS TCP qu'on tranche. **Deux pannes trouvées, aucune visible à la
  lecture :**
  - **l'ami arrivé par un LIEN ne revenait JAMAIS seul.** Il est anonyme, et
    `attemptRejoin` appelait `ensureConnected()` sans `anonyme` : rendu
    `null` à chaque essai, sans ouvrir une socket. Le cas le plus courant
    du jeu (« code/lien → rejoindre → jouer ») ;
  - **le client abandonnait à 1,6 s** (3 essais × 800 ms) pour un siège
    gardé 25 s. Le calendrier (`net/reprise.ts`) couvre maintenant 20 s.
  Chacune éprouvée seule : 4 assertions tombent.
- **20 — Deux onglets, un appareil** (même fichier). Une écriture de
  réglage dans l'onglet B survit à celle de A (écouteur `storage`) ; le
  même salon ouvert deux fois : B garde le siège, A affiche « TA PLACE A
  ÉTÉ REPRISE », aucun ping-pong sur 6 s. Rien de neuf à corriger : les
  correctifs C1 et C2 de l'audit tenaient. Dents : sans l'écouteur, [017]
  tombe ; serveur sans `reprise`, trois tombent ; sans `departSubi`, le
  motif est écrasé par « DÉCONNECTÉ » ([020]) — le ping-pong, lui, est
  déjà tenu par `lastRoomCode = ""`.
- **21 — Couverture** (`npm run coverage`, v8). 51 % au total, et la
  moyenne ne dit rien : moteur 98 %, jeu 95 %, `shared` 95 %, `api` 86 % ;
  `main.ts` 45 %, `multi.ts` 7 %. ⚠️ `server/index.ts` lit **0 % sous
  vitest et 92 % sous l'e2e** (mesuré une fois avec `npx c8`, sans
  dépendance) : ne pas conclure qu'il est intesté. Les seuils sont un
  CLIQUET posé sous la mesure, et seulement sur les couches pures — une
  baisse y veut dire « de la logique sans test ». Trouvé : `api/authcb.ts`,
  le retour OAuth RÉEL en production, n'était appelé par aucun test.

### Phase 4 de l'audit : la performance, mesurée d'abord (08/10/2026)

Méthode commune : build de production servi par `vite preview`, Chromium,
processeur ralenti ×4 par CDP (`Emulation.setCPUThrottlingRate`) pour
approcher un téléphone moyen, profil par `Profiler` résolu par la carte de
source. Les scripts vivent dans le scratchpad, pas dans le dépôt.

- **22 — Front.** Relevé au téléphone ×4 : premier affichage 336-480 ms,
  LCP ≤ 960 ms, accueil à 60 i/s, tas 2 Mo, ~500 ms de tâches longues au
  démarrage — dont 609 ms de `(program)` natif (analyse, styles, mise en
  page de 3 465 nœuds et 232 Ko de CSS : points 26 et 27). ⚠️ **Le terrain se
  repeignait à 60 i/s derrière TOUS les menus**, invisibles sous leur fond
  sable (0 point sur 49, cinq écrans, deux formats) : `draw` était la
  première fonction du profil de l'accueil. `show()` lit maintenant le fond
  CALCULÉ de l'écran (`terrainMasque`) — lu et non supposé, un écran rendu
  translucide un jour se repeindra seul. Prouvé dans `e2e-navigateur.mjs`
  en comptant les `clearRect` de `#cv` : 60/s avant, 0 après, 61/s en match.
  Et `peintVitrine` créait un `matchMedia` par image (`MOUVEMENT_REDUIT`).
  `syncField` force deux mises en page au démarrage, pas plus : laissé.
- **23 — Backend.** Charge : 20 salons × 10 joueurs = 4,3 % d'un cœur,
  retard de boucle p99 11 ms, 104 Mo RSS. Le serveur n'est PAS un goulot.
  ⚠️ **Mais il n'avait AUCUNE limite de débit**, et un seul client suffisait
  à le saturer : `profil` en rafale → 60 Mo/s émis, 96 % d'un cœur (la
  machine Fly porte TOUS les salons) ; `join` en rafale → 34 000 codes/s,
  l'espace entier (31⁴) balayé en 27 s. `server/debit.ts` (pur, testé) :
  un SEAU par socket (40/s, réserve 80 ; le plus haut débit légitime est
  20/s, les curseurs du coop), coupure 1008 après 200 refus d'affilée ; et
  au-delà de 20 codes inconnus BIEN FORMÉS par minute et par ADRESSE
  (`fly-client-ip` derrière Fly), `room_unknown` sans regarder la table.
  Le `profil` regroupe sa diffusion (`diffuseEtatBientot`, 150 ms) : ÷5,5.
  ⚠️ **Le scénario de débit est le DERNIER de l'e2e** : il bloque
  127.0.0.1 une minute, et tous ses clients partagent cette adresse. Et le
  corpus FUZZ est CADENCÉ (30/s), sinon le seau le coupe avant la fin.
  À déployer côté Fly seulement ; aucun client à changer.
  ⚠️ **Collision de NOM DE FICHIER, la même famille que les classes CSS** :
  `tests/debit.test.ts` existait déjà (10 tests du limiteur EDGE,
  `api/_debit.ts`) et je l'ai écrasé par un `cat >` sans le regarder — vu
  au décompte (1339 au lieu de 1349), restauré au commit suivant. Le test
  du serveur de salons vit dans `tests/debit-salons.test.ts`. **Avant de
  créer un fichier, `ls` le chemin** ; l'outil Write refuse d'écraser un
  fichier non lu, un `cat >` ne refuse rien.
- **24 — Réseau.** Par client en match : 0,92 Ko/s sur le fil, dont 72 %
  de `verdict` (3,2 Ko : la liste des joueurs à chaque manche). Compression
  `permessage-deflate` SANS contexte partagé : 0,22 Ko/s (÷4), ~2 points de
  processeur, et la mémoire ne dépend pas du nombre de joueurs. Avec
  contexte : ÷13, mais ~100 Ko × 400 connexions sur une machine de 512 Mo.
  Négociée par le navigateur, aucun changement de protocole ; l'e2e
  navigateur vérifie que Chromium l'obtient. **Direction, pas faite** :
  alléger `verdict` (ne renvoyer que ce qui change) toucherait le protocole,
  donc les deux déploiements.
- **25 — Redis et base.** Redis est déjà sobre : un aller-retour par appel
  (`RPUSH`+`EXPIRE`, `INCR`+`EXPIRE` par le pipeline). Les index couvrent les
  lectures des amis (lu dans les migrations, pas d'`EXPLAIN` sans base). Pas
  de N+1. ⚠️ **Mais la latence suit la PROFONDEUR, pas le nombre** : AJOUTER
  enchaînait 11 allers-retours vers Supabase, ACCEPTER 13, LIRE 4 — des
  lectures indépendantes faites l'une après l'autre. Parallélisées, mêmes
  décisions dans le même ordre : 7, 9, 3 (−30 % environ à 25 ms par appel).
  `tests/amis-profondeur.test.ts` mesure la profondeur SANS HORLOGE : un
  proxy libère les appels par vagues, le nombre de vagues est la profondeur.
  Ce qui reste en série a sa raison : `codeAmi` ÉCRIT, donc attend `parId`.
- **26 — Paquet.** 334 Ko, 113 Ko gzip, et AUCUNE bibliothèque tierce
  (mesuré par la carte de source : main 83 Ko, i18n 70, multi 47, rendu
  43). Le seul tiers, l'encodeur QR, est à la demande. Pas découpé plus :
  séparer les deux langues gagnerait ~10 Ko gzip contre une attente avant
  le premier affichage, et sortir le multi EST le découpage R1/R2 de
  l'audit — une direction. Ce qui manquait est un GARDE-FOU :
  `npm run taille` (en CI après le build) plafonne chaque morceau en gzip
  et refuse l'encodeur QR dans le paquet principal. Éprouvé avec un
  `import` statique de `render/qr.ts`. Un plafond se relève, avec sa raison.
- **27 — CSS.** 100 classes que ni le HTML ni le code ne nomment, reliques
  d'écrans retirés (`onb`, `faille`, `fissure`, `codexrow`, `but__`,
  `etat__`, `mur__`…) : 238 règles, 49 Ko (41,3 → 36,6 Ko gzip, 1 867 →
  1 682 règles). Le temps de calcul des styles ne bouge PAS de façon
  mesurable (dans le bruit au ×4) : le gain est en octets et en lecture.
  ⚠️ **Le premier scan était faux** : `carte is-${etat}` fabrique
  `is-maitrisee`, et un motif qui ne voyait que les gabarits en début de
  chaîne l'aurait supprimée. Le scan relève désormais chaque fragment avant
  un `${`. ⚠️ **La preuve n'est PAS une capture d'écran** : deux passages
  du même code différaient sur 80 captures sur 80 (hasard, canvas). Elle
  est une EMPREINTE des styles calculés de chaque élément visible, 80
  écrans (10 routes dont le salon, 375 et 1280, clair et sombre, nouveau
  venu et vétéran), avec hasard figé et SANS les propriétés `--*` —
  `--field-top` et `--or` varient au minutage, et par héritage elles
  faisaient diverger tous les éléments. Stable 8 878/8 878 d'un passage à
  l'autre, puis 8 878/8 878 identiques après le retrait. Les deux feuilles
  sont des SOUS-SUITES exactes des anciennes : rien d'ajouté.
  ⚠️ Les §7 « La faille » et « La couche pixel » décrivent des composants
  dont les règles sont parties : à corriger en phase 6 (docs).
- **28 — Boucle de jeu.** Mesuré en partie solo jouée juste, téléphone ×4
  (serveur de dev, `__tor.joue()`) : **30 images/s**, et le premier poste
  n'était PAS le script mais le calcul des styles (2 057 ms sur 12 s), avec
  un recalcul ET une mise en page complète à CHAQUE image (370 et 369). Un
  `MutationObserver` a nommé la cause : le pied et le bandeau RÉÉCRIVAIENT à
  chaque image cinq textes et trois classes identiques — réécrire un
  `textContent` à l'identique remplace le nœud, un `classList.add` d'une
  classe présente repose l'attribut. `hud.ts` n'écrit plus que ce qui change
  (`ecrisTexte`, `ecrisClasse`, `bascule`). Après : 463-502 images, p50
  16,7 ms, styles 95-346 ms, 11-23 mises en page en 12 s. Au bureau ×4 :
  504 → 675 images, mise en page 1 001 → 31-44 ms. Ne reste à chaque image
  que la barre de temps, un `transform`. `tests/hud-ecritures.test.ts`
  l'exige d'un `MutationObserver` jsdom ; éprouvé sur l'ancien HUD, trois
  tombent. **Même doctrine que `--heat` : jamais deux fois à l'identique.**

**Deux bombes de calendrier trouvées en route** (09/10) : mes tests des
points 17 et 18 signaient un jeton au 07/10 et `moi` le jugeait à
`Date.now()` — il reçoit maintenant `maintenant`, comme `amis` et `perf`.
Et `smoke` tirait le run du jour du calendrier : il tombait 3 jours sur 10
(date figée au 08/10). Toute la suite repasse au 15/11/2026 et au
02/03/2027. ⚠️ **vitest ne vérifie pas les types** : le premier correctif a
ajouté un argument de trop à `auth` sans qu'un test rougisse ; `tsc` l'a vu.

### Phase 5 de l'audit : l'intégration continue (09/10/2026)

Directive de Pierre : « vas-y enchaîne la phase 5 ». Un commit par point.

- **29 — Lint** (`npm run lint`, ESLint 9 + typescript-eslint, en CI avant
  `tsc`). Réglé sur la JUSTESSE, jamais sur le style, et AUCUN formateur :
  reformater 30 000 lignes casserait `git blame` sans corriger un bug.
  Premier passage : 15 signalements seulement, `tsc` strict faisait le gros
  du travail. ⚠️ Neuf étaient des BOM LITTÉRAUX voulus (ils documentent et
  testent le bug du BOM, `src/env.ts`) : `no-irregular-whitespace` ignore
  donc chaînes et commentaires. Un `_` en tête marque un inutilisé assumé.
  Trouvé : l'e2e recevait un libellé d'attente (`quoi`) et l'ignorait — une
  attente épuisée le dit maintenant au journal.
- **30 — Typecheck.** `tsc` couvre aussi `vite.config.ts`, typé par
  `vitest/config` : une faute sur `thresholds` y désactivait EN SILENCE le
  cliquet de couverture (vitest ignore une clé inconnue). Les scripts JS
  (`e2e*.mjs`, `scripts/*.mjs`) restent HORS du typage, décision mesurée :
  `checkJs` y rend 41 erreurs, toutes des artefacts d'inférence (objet figé
  par sa première affectation, globales posées par l'e2e) — aucune n'est un
  bug, et les rendre propres demanderait du JSDoc sur des milliers de lignes.
- **31 — Unitaires.** La CI lançait `vitest run`, jamais le cliquet de
  couverture : une baisse n'y était pas vue. Elle lance `npm run coverage`
  (mêmes tests, plus les seuils ; code 1 vérifié sur un seuil manqué).
- **32 — Intégration : l'image Fly LANCÉE** (`npm run integration`, et un job
  CI qui fait le vrai `docker build`). Le script LIT les `COPY` et le `CMD`
  du Dockerfile, reconstitue l'image dans un dossier vide (`npm ci
  --omit=dev --ignore-scripts`), la lance en production, puis : `/health`,
  un salon ouvert depuis une origine autorisée, une origine inconnue
  refusée, `SIGTERM` → 1001 et sortie 0. En CI, `--url` sonde la vraie
  image. Éprouvé en retirant `COPY src/env.ts` : la panne du 30/08 revient,
  et le journal la NOMME (`Cannot find module …/src/env`). Pas de démon
  Docker dans les sessions cloud : le mode sans Docker est celui-là.
- **33 — E2E.** L'e2e des salons tournait déjà en CI ; `e2e-navigateur.mjs`,
  le seul qui pilote le VRAI client (reprise après coupure, deux onglets,
  terrain qui ne se repeint pas derrière un menu, compression négociée),
  n'y était pas — alors que les deux pannes de reprise du point 19 n'ont été
  trouvées QUE par lui. Job à part, `CHROMIUM_PATH=/usr/bin/google-chrome` :
  le runner Ubuntu porte Chrome, `playwright-core` ne télécharge rien.
  Vérifié en local avec un chemin explicite : 33/33.
- **34 — Build.** La CI construisait SANS aucune `VITE_*` : multi inerte,
  mesure coupée — pas le paquet servi aux joueurs. Un job pose la
  configuration de production, lance LA commande de `vercel.json` (`npm run
  build`), puis : pas de `__tor`, l'URL `wss://` présente, plafonds de taille
  (111,1 Ko gzip, la même mesure qu'à vide), et `check-deploy.mjs` sur `dist`
  servi par `vite preview`. Éprouvé : sans `VITE_COLLECT_URL`, le
  vérificateur sort en 1. ⚠️ Il ne fait qu'AVERTIR sur un `wss://` absent
  (normal pour un solo seul) : la CI l'exige par un `grep` à part.
- **35 — Sécurité.** Production : 0 avis. Outils : `undici` (via jsdom, 11
  avis dont 2 « high »), `source-map-js` (high), `@vitest/mocker`. ⚠️ **Le
  verrou faisait PLANTER npm 10** (`Cannot read properties of null (reading
  'edgesOut')`, dans `#loadPeerSet`) — `audit fix`, `update`, `install` :
  tout. Résolu une fois par npm 11, après quoi npm 10 (celui de la CI)
  repasse en `ci` comme en `install`. Correctifs : vitest 4.1.11 (même
  mineure), `overrides` sur `undici` et `source-map-js`. En CI, l'audit de
  PRODUCTION bloque dès « high » ; celui des outils n'avertit que — un avis
  neuf peut tomber un matin sans rapport avec la PR. Éprouvé avec `ws@8.17.0`
  posé dans une copie : code 1. Dependabot hebdomadaire, REGROUPÉ (un seul
  relecteur). Historique git balayé : aucun motif de secret, aucun `.env`
  jamais commité hors `.env.example`.
- **36 — Préversion** (`.github/workflows/preversion.yml`). Sur chaque
  `deployment_status` réussi hors production, la préversion VERCEL — le
  paquet construit avec SES variables — passe à `check-deploy.mjs`. Une
  préversion protégée répond 401 : le secret de dépôt
  `VERCEL_AUTOMATION_BYPASS_SECRET` passe la porte (éprouvé sur un serveur
  qui exige l'en-tête). ⚠️ **Le MULTI ne s'y joue pas, délibérément** : la
  liste blanche refuse une adresse qui change à chaque commit, et un joker
  `*.vercel.app` ouvrirait nos salons à N'IMPORTE QUEL projet Vercel. ⚠️ Non
  vu tourner : cette session ne lit pas les déploiements du dépôt (403).
  Sans l'intégration GitHub de Vercel, le flux ne se déclenche jamais.
- **37 — Déploiement** (`deploiement-salons.yml`). Les SALONS seulement,
  et seulement par « Run workflow » en tapant `DEPLOYER` : aucun push ne
  déploie. Il refait la procédure du §10 sans en sauter une étape :
  vérification rapide (tsc, tests, image reconstituée), refus s'il y a des
  salons en cours (`/health.rooms`, sauf « forcer »), `fly deploy`, `fly
  scale count 1`, `check-salons`. L'image en place AVANT est lue dans
  `/health` (`FLY_IMAGE_REF`, posée par Fly) et écrite au résumé : c'est
  l'entrée du retour arrière. Le front reste à Pierre (`vercel --prod`),
  APRÈS Fly. ⚠️ **À poser par Pierre** : `FLY_API_TOKEN` dans
  l'environnement `production`, et une règle « Required reviewers ». ⚠️
  Jamais lancé pour de vrai (pas de jeton, Fly injoignable d'ici) : les
  étapes shell sont éprouvées contre un faux `/health` (2 salons → refus,
  0 → passe), pas `flyctl`.
- **38 — Retour arrière** (`retour-arriere-salons.yml`, à la main). On
  ne répare pas en production : on redéploie l'image d'avant (`fly deploy
  --image`), donnée par le résumé du dernier déploiement. Image d'une AUTRE
  application refusée ; puis une machine, une instance, et `/health` doit
  annoncer l'image DEMANDÉE — sinon le retour n'a pas eu lieu (une forme
  peut contenir l'autre : `FLY_IMAGE_REF` porte étiquette et empreinte). Pas
  de garde « personne ne joue » : on ne revient que parce que c'est déjà
  cassé. ⚠️ Le FRONT revient à part, par Pierre (Vercel → Deployments →
  « Promote to Production »), et DOIT revenir si le retour défait une
  évolution du fil : sinon, la panne du 30/09 à l'envers.

**Bilan de la phase 5** : quatre flux. `verification.yml` (lint, tsc,
couverture, build à vide et de production, taille, audits, e2e salons, e2e
navigateur, image Docker) sur chaque PR et chaque push sur `master` ;
`preversion.yml` sur les déploiements Vercel ; deux flux MANUELS pour les
salons. ⚠️ **Rien de tout ça n'a encore tourné sur GitHub** : la
vérification ne part que sur une PR, et aucune n'est ouverte depuis le
point 29.

### L'audit d'architecture, et ses dix priorités traitées (07/10/2026)

Directive de Pierre : auditer tout le dépôt sans rien supposer
(`AUDIT-ARCHITECTURE.md`, chaque point prouvé), puis « vas-y dans l'ordre ».
Un commit par priorité. Ce qui ne se déduit pas du code :

- ⚠️ **À faire côté Pierre** : appliquer la migration **0005** (purge des
  performances des comptes déjà supprimés). Déployer Fly ET Vercel : le
  `hello` porte `reprise`, et `remplace` est un code d'erreur neuf.
- **Les tests passaient sur le dépôt qui ne tourne pas.** `DepotMemoire` et
  `DepotSupabase` divergeaient deux fois (suppression qui laissait les scores
  au podium ; égalité de score jamais départagée par la durée). Désormais
  `tests/depot-supabase.test.ts` fige les REQUÊTES émises, `fetch` remplacé
  par un enregistreur. Ce n'est pas une vraie base : une requête que
  PostgREST refuserait passerait tant qu'elle ressemble à l'attendu.
- **`verifyRun` valide chaque entrée** (`entreeValide`) : avant, un `t` en
  texte était ACCEPTÉ et les échéances ne s'appliquaient plus.
- **La collecte** ne laisse plus un événement réécrire `id`, `day`, `at`.
- **Le classé** est sorti du routage (`api/_ranked.ts`), relit l'adversaire
  dans le vivier (`opponentRunId`) et ne publie plus d'`id`. `body.id` reste
  non authentifié : ne pas le renommer tel quel (§9).
- **La reprise de siège** : la CLÉ suffit, même si l'ancienne socket paraît
  ouverte (coupure à moitié ouverte, 15 à 30 s avant le battement de cœur).
  La plus récente gagne ; l'ancienne reçoit `remplace` et ne revient pas.
  ⚠️ Seulement chez un client qui a annoncé `reprise: true` : deux VIEUX
  onglets ignoreraient `remplace` et se renverraient le siège en boucle.
- **Deux onglets** : `progress.ts` oublie sa copie sur l'événement `storage`.
- **Le vote imposteur** se clôt aussi au départ d'un votant (si les présents
  ont tous voté) et au bout de `OBSERVATION_MAX_MS` (90 s).
- **Point 10, premier pas seulement** : `lancementRefuse` (render/jour.ts)
  remplace trois copies du verrou du jour dans main.ts. `initMulti` et
  `finishRun` restent à découper — une direction.

### La navigation aux places habituelles, et trois écrans réparés (01/10/2026)

Dernière passe de la directive : le style de la maquette sur le reste du site,
la navigation aux emplacements habituels, la chasse aux bugs d'affichage.
Relevé de neuf écrans, téléphone et bureau, par `getBoundingClientRect` et
`elementFromPoint`. Les écrans de service (solo, cartes, classement, amis,
profil, boutique) portaient déjà l'autocollant : on n'a touché qu'à ce que la
mesure montrait.

- **MENU a quitté la barre haute.** L'enseigne et PARCOURS ramènent déjà à
  l'accueil ; ce troisième chemin, absent de l'accueil seulement, décalait
  toute la navigation du bureau (x = 675 sur l'accueil, 589 ailleurs). Et
  PROFIL suivait la longueur du nom (124 / 115 px) : largeur fixe, nom en
  ellipse. Mesuré après : x = 649 sur les neuf écrans.
- **L'entrée MULTI porte la barre haute et la barre du bas** (`AVEC_BARRE`).
  C'était le seul écran de menu sans navigation. Le SALON, lui, reste sans :
  la barre y ferait quitter une table d'un clic.
- ⚠️ **La barre du bas était INERTE sur l'entrée MULTI** : écrans et barre à
  `z-index: 10`, donc l'ordre du document tranchait, et les écrans du multi
  sont déclarés après elle. `#app > .nav` passe à 11. Vérifié : les cinq
  boutons répondent à `elementFromPoint` sur les neuf écrans.
- ⚠️ **Le champ REJOINDRE était une boîte vide** depuis STICKER : le
  `<input>` transparent posé sur les quatre cases recevait le fond et le
  cadre de `.field` (même spécificité, `theme.css` chargée après).
  `.field.codein__champ` lui rend sa transparence.
- RÉGLAGES : un filet d'1 px, l'ancien séparateur de liste, flottait seul
  entre APPARENCE et sa barre ; LANGUE était restée en aplat sombre — passée
  en barre segmentée comme APPARENCE.
- **Pas touché, délibérément** : le choix actif des options (`.opt.is-on`)
  reste prune, alors que les barres segmentées des réglages sont violettes.
  C'est la règle générique du brief et du salon ; la changer est un parti
  pris visuel, pas un bug.

### LOT D : le salon — QR, tuiles, « X A CRAQUÉ », et deux pavés trouvés en jouant (01/10/2026)

- **Le QR du salon** (`render/qr.ts`, pur ; encodeur `qrcode-generator`,
  MIT, sans dépendance — première dépendance de rendu ajoutée au front) : même
  lien que COPIER LE LIEN, toujours encre foncée sur clair (un QR inversé
  échoue sur beaucoup de lecteurs), zone de silence de 4 modules. ⚠️ Chargé
  À LA DEMANDE (`import()` dans `setRoomCode`) : sinon 25 Ko de plus pour
  chaque visiteur de l'accueil. Le paquet principal est à 333 Ko.
- **Les tuiles du code** se lisent depuis le canapé : 76 px de haut au
  téléphone, 80 au bureau.
- ⚠️ **Le QR poussait LANCER sous la ligne de flottaison au bureau** (881-943
  pour 900, hôte à 1440 × 900) : QR compacté, et la rangée d'actions colle au
  bas de l'écran comme au téléphone. Au téléphone, QUITTER touchait LANCER
  bord à bord sous son ombre, et la rangée collée laissait 22 px de jour où
  les réglages défilaient à vue — corrigés.
- **« SAM A CRAQUÉ »** (`#craque`) : la chute d'un AUTRE, en pastille sur le
  pied, 2,4 s. Ancrée sur `#app`, pas sur `#foot` : poser `position:
  relative` sur le pied dans `theme.css` (chargée après) écraserait son
  `absolute` du paysage serré. Couché, le pied fait 30 px : la pastille de 33
  débordait (377 pour 375), réduite.
- ⚠️ **LE PANNEAU DUEL ÉTAIT UN PAVÉ PRUNE, en salon réel**, depuis la
  refonte : `.drama--duel .drama__panel` et `--elim` (0,2,0) réinjectaient
  les huit dégradés d'équerres de l'identité nocturne, à pleine taille — en
  STICKER, `--paper` est le prune. Le texte « DUEL » était peint dessous.
  `tests/drama.test.ts` exige que le thème neutralise toute variante qui
  peint un fond ; éprouvé.
- ⚠️ **COLLISION DE CLASSE, la troisième du dépôt, et de mon fait** : le
  calque d'invitation du lot B s'appelait `.invite`, déjà porté par
  `#compteInvite` sur l'écran de fin. Ma règle (fixe, plein écran) l'aurait
  transformé en calque dès sa parution. Renommé `.aplusieurs`. Toutes les
  classes ajoutées depuis le lot A ont été cherchées dans les deux feuilles :
  aucune autre.
- **Pas fait, délibérément** : les plaques EN HAUT au téléphone (maquette
  9.1). Elles vivent déjà dans leur bande à hauteur fixe sous le terrain, sans
  le recouvrir ; les déplacer ne rend aucun pixel de terrain et rouvre la
  mesure de `RESERVE_HUD_MULTI` (n°10). Une direction, pas un correctif.

### LOT C : la consigne dessinée, et la preuve de la mort (01/10/2026)

- **La consigne dessinée** (`render/pictogramme.ts`, pur) : sur la ligne des
  gestes, la pièce désignée dans ses forme et teinte de terrain, et le geste
  (deux pièces pour le double appui, anneau pour MAINTIENS, flèche pour
  GLISSE, chevron pour « puis »). Muet sur les négations, l'intrus, les
  lettres. ⚠️ **Trois règles se jouent du texte, et un dessin les rendrait
  inertes (n°1)** : LE MENTEUR (le dessin dénoncerait le mensonge), LE
  DALTONIEN (il trancherait le mot contre l'encre), L'ÉCLAIR (il resterait
  quand la consigne s'efface). Sur ces manches, rien n'est dessiné ; trois
  tests, éprouvés un par un. ⚠️ Le dessin vit sur une ligne qui existait
  déjà, en marges négatives : `#head` mesuré identique avec et sans (106 px
  à 1280, terrain inchangé à 390, 1280 et 812 × 375 — n°17).
- **La preuve** (`render/preuve.ts`, pur) dans la carte de relance : la
  manche fatale en miniature, la pièce visée entourée (ou une croix dans le
  vide), LA CONSIGNE et IL FALLAIT (ne rien faire / plus vite / sans
  enfreindre ta règle / la consigne). Un appui de plus de 4 s n'entoure
  rien : il viendrait d'une autre manche. ⚠️ **Au téléphone, une miniature
  couchée ne ressemblait pas au terrain debout** qu'on venait de quitter :
  elle passe par `scene.versEcran` (n°16), bornée à 112 px de haut. Sous
  520 px de haut, la miniature part, la phrase reste.
- Trouvé en chemin, antérieur : `finishRun` vidait le bandeau avant de
  poser la carte sur le terrain figé — un tiret orphelin à la place de la
  règle. Il la garde quand la carte paraît.

### LOT B : l'accueil met le MULTI d'abord, et l'invitation après la 1re partie (01/10/2026)

- **Accueil d'un joueur qui revient** (maquette 7.1) : bloc MULTI en tête
  (CRÉER UN SALON, code + REJOINDRE, PARTIE RAPIDE), puis RUN DU JOUR (date,
  essais en pastilles, « JOUER · 3 ESSAIS »), puis le parcours. DU JOUR et
  MULTI quittent « autres façons de jouer » — masqués, PAS retirés : le
  bloc du jour délègue à `#profJour` (seule porte de l'écran SOLO) et
  `multi.ts` tient `#btnMulti`.
- **Le bloc ne réimplémente rien** : `multi.depuisAccueil(action, code)`
  passe par l'écran d'entrée — identité d'abord (`needIdentity`), puis
  l'action. Seule l'erreur « pas 4 lettres » se dit sur l'accueil ; un code
  inconnu se dit sur l'écran d'entrée, avec ses issues (RETAPER, OUVRIR LE
  MIEN). Joué avec un vrai serveur : créer, rejoindre, code inconnu.
- ⚠️ **Au bureau, le jour et le parcours sont UNE colonne** (`.acc__droite`)
  : en enfants de grille séparés, leurs rangées suivaient la hauteur du bloc
  multi et laissaient un trou de 140 px. La colonne couvre cinq rangées dont
  une `1fr` qui absorbe son excédent.
- **L'invitation** (`#invite`) : calque posé UNE fois sur l'écran de fin
  déjà prêt (niveau, relance ou fin), jamais sur un duel ni un classé, ni
  sans serveur de salons, ni pour un habitué (`recent.length <= 2`) — le
  drapeau `inviteVue` se pose aussi quand on décide de ne pas la montrer.
  CONTINUER SEUL la referme ; ÉCHAP aussi, et aucun raccourci n'agit dessous.
  Image : `public/poses/amis.png`, reprise de la maquette. Mesure :
  `invite_vue`, `invite_salon` (dans les DEUX listes blanches).

### « NE FAIS RIEN » retiré, et jamais deux pièges d'affilée (01/10/2026)

Directive de Pierre : « garde la courbe de temps actuelle, supprime les
consignes "ne rien faire" et fais en sorte que deux consignes ne puissent
jamais demander à la fois de ne rien faire ». La courbe (`windowMs`) n'a pas
bougé.

- **SOLO — catalogue 3** (`CATALOGUE_SOLO`, annoncé dans chaque
  revendication) : `INSTRUCTIONS_SOLO` sans `CONSIGNES_RIEN`, et
  `buildRound(…, apresPiege)` retire la consigne tant qu'elle piège quand la
  manche d'avant en était un (le piège forcé cède). `Session` passe la manche
  précédente ; `verifyRun` rejoue chaque run sur SON catalogue (1, 2 =
  `INSTRUCTIONS_SOLO_V2`, 3). ⚠️ **`VERSION_CONTENU` 1h63n7k → `bi44iq`** :
  records d'entraînement affichés repartis d'une clé neuve, classement du
  jour du déploiement coupé en deux. La loi de tirage est NOMMÉE dans
  `calculeVersion` : elle change les manches sans toucher une consigne.
- **Le tutoriel** enchaînait deux pièges (temps 2 et 3) : le temps 3 est
  devenu une REPRISE — obéir de nouveau, un carré rouge à côté du carré bleu
  demandé, 6 s.
- **MULTI — version 4** (`CONSIGNES_VERSION`). La consigne est COMMUNE et la
  règle PERSONNELLE : retirer un piège pour un joueur change la manche de
  tous. C'est donc le SERVEUR qui choisit : `tirageSansDoublePiege` essaie
  `draftShared(…, tirage)` 0, 1, 2… et garde le premier où aucun joueur
  vivant sortant d'un piège n'en reçoit un second ; le numéro voyage dans
  `round.tirage` (absent = 0 = la manche d'hier). Le client n'a rien à
  décider, donc rien sur quoi diverger (n°3). `TIRAGES_MAX` = 32, mesuré :
  à 8, 17 enchaînements sur 2400 manches à six règles piégeuses ; à 32,
  aucun. L'imposteur n'y entre pas (il force ses pièges). Les quatre
  combinaisons de déploiement retombent sur la version 3 tant qu'un côté
  l'ignore — rien n'oblige à déployer Fly d'abord ici, mais rien ne vit
  avant que les DEUX soient en ligne.
- ⚠️ **L'e2e n'a vu AUCUN tirage retiré** sur son scénario (0 sur 13
  manches, 3 pièges) : le trajet du fil avec `tirage > 0` est prouvé par
  `tests/sans-double-piege.test.ts` (`MatchLogic` → `draftShared`), pas de
  bout en bout. L'assertion « aucune faute de reconstruction » le verrait.
- **Taux de pièges** remesurés enchaînés (comme `Session` joue) : tous
  baissent de 2 à 5 points, LA POINTE 27,2 → 22,6 % (`TAUX_PIEGE`).
- Deux tests passaient par chance et l'ont montré : `maingauche` laissait
  expirer une manche HORS échauffement que sa graine rendait sans geste ;
  `pause-echauffement` ne savait jouer qu'un clic simple.

### LOT A de la maquette : l'arrivée 1a, le tutoriel sans indice, l'échauffement annoncé (01/10/2026)

Maquette de Claude Design rapportée par Pierre, lots A à D proposés et
acceptés. Ses arbitrages, mot pour mot résumés : arrivée **1a** ; l'indice de
piège de la maquette (hachures autour du terrain) est **trop voyant, non
gardé** ; nos propres solutions gardées là où elles existaient.

- **LA VITRINE** (`render/vitrine.ts`, pure, testée) remplace le mode attract,
  qui faisait tourner une vraie `Session` sous une règle TIRÉE AU SORT —
  mesuré : LA POINTE, sans piège, consigne peinte sur les pièces. C'est une
  chronologie écrite de 8 s : « CLIQUE LE BLEU » → BIEN, puis « CLIQUE LE
  ROUGE », la main s'approche, renonce → PIÈGE DÉJOUÉ. Un test exige que la
  main ne POSE jamais le doigt près du rouge. Peinte par la boucle de jeu
  (une seule boucle), en DOM + `transform` seulement, figée sous mouvement
  réduit sur l'instant qui dit tout. Ne paraît qu'à un nouveau venu
  (`estNouveau`) — la barre du bas reste là, rien n'est verrouillé.
  ⚠️ Spécificité payée : `#home .home__centre.bienvenue` (1,2,0) battait
  `#home .bienvenue` et imposait ses rangées `300px 0 0 0 300px` — la vitrine
  passait sous la barre haute. Les nouvelles règles reprennent le MÊME
  sélecteur.
- **LE TUTORIEL** ne donne plus aucune aide écrite : trois pastilles
  d'ÉCHAUFFEMENT, la manche 1 a un chrono de 9 s (`CHRONO_OBEIS_MS` — la
  moitié des morts d'une 1re partie sont au temps, le cadre qui se vide se
  rencontre ici sans danger), BIEN / PIÈGE DÉJOUÉ en pastille, le slogan sous
  le premier piège déjoué. Une faute ouvre la carte CRAQUÉ (`#tutoRate`) :
  une phrase, la consigne, ce qu'il fallait, un appui rejoue LA MÊME manche.
  Les textes écrits par le code vivent dans `ECRITS` (`i18n-parcours.ts`),
  typés par `CleEcrite` — le dictionnaire statique exige qu'une clé soit
  posée par `data-i18n`, et c'est un filet qu'on garde.
- **« ÉCHAUFFEMENT TERMINÉ »** (`#annonce`) remplace le toast « À TOI DE
  JOUER » : un plein écran ENTRE deux manches, partie SUSPENDUE —
  `Session.decale(ms)` décale `runStart` ET `roundStart`, donc le journal
  rejoué par `verifyRun` est identique avec ou sans pause
  (`tests/pause-echauffement.test.ts`, éprouvé). Ferme au toucher ou à
  ENTRÉE, jamais à ESPACE (une règle à maintien la tient enfoncée). Aussi
  servie à la sortie du tutoriel. ⚠️ **Ne pas tiquer ne suffisait pas** : la
  barre et le seuil critique lisaient l'horloge réelle, la barre se vidait
  derrière l'annonce (0,94 → 0,05 en 3 s) — tout le bloc de session lit
  maintenant l'instant de la pause. ⚠️ Les deux calques sont en `position:
  fixed` : au bureau `#stage` commence sous la consigne, un calque limité à
  lui laissait une bande de terrain vide au-dessus.
- `tests/smoke.test.ts` touche l'annonce quand elle paraît et EXIGE qu'elle
  ait paru pendant le run du jour (éprouvé en la coupant).

### Les salons plantaient en boucle, et la session durait un jour (30/09/2026)

Rapporté par Pierre : « impossible de créer un salon pendant plusieurs
secondes, ça déconnecte tout seul », et « ça me demande de me connecter alors
que je suis déjà connecté ».

⚠️ **LES SALONS : `fly logs` a tranché.** `RangeError: Max payload size
exceeded` → `Unhandled 'error' event` → processus mort → Fly relance →
recommence ~20 s plus tard. C'est EXACTEMENT le bug corrigé le 25/09
(`2ac1915`, écouteur `error` + `maxPayload` relevé pour la photo). Fly
tournait donc une version d'AVANT, pendant que Vercel servait un site qui
envoie la photo (4-8 Ko) à un serveur plafonné à 4 Ko : chaque joueur avec une
photo tuait tous les salons en se connectant, puis en se reconnectant. La
dette du §9 « front et salons déployés séparément » a mordu pour de vrai.
**Toute évolution du fil se déploie des DEUX côtés, Fly d'abord.** Ne pas lire
« commit: 6172d83 » dans les journaux Fly comme une version du jeu : c'est
celle de leur système de démarrage.

Même lot, en défense : les MINUTERIES (manches, vagues, sursis, départ
automatique) et la fermeture de socket passent par `guarded` (`plusTard`), plus
un filet `uncaughtException`. Éprouvé par une panne injectée : l'ancien code
meurt, le nouveau survit et un autre salon se crée encore. `/health` expose
`demarre`, `memoireMo`, `image`, `erreurs` ; `check-salons` alerte sur un
redémarrage de moins de 15 min et sur les erreurs rattrapées.

⚠️ **LA SESSION : elle ne tenait que si l'on revenait chaque jour.** Jeton de
24 h, renouvelé seulement à l'OUVERTURE du site s'il lui restait < 6 h, et le
serveur refusait de renouveler un jeton périmé. Revenir après un jour
déconnectait en silence — la barre du haut, qui lit la SAUVEGARDE, affichait
toujours nom et signe. Et `compte()` ne relisait l'expiration qu'au premier
appel : un onglet de téléphone resté ouvert se croyait connecté avec un jeton
refusé partout. Correctif : un jeton périmé reste ÉCHANGEABLE 30 jours
(`FENETRE_RENOUVELLEMENT_MS`, `?a=refresh` seulement — la révocation reste
vérifiée en base, et il n'ouvre ni salon ni classement) ; `compte()` relit
l'expiration ; renouvellement au retour sur l'onglet, toutes les 30 min, et
AVANT l'envoi du run du jour ; l'invitation « connecte-toi » se tait quand la
session est récupérable (`sessionRecuperable`).

### Le site s'ouvre d'emblée, les gros doigts, et les menus en colonnes (30/09/2026)

Trois directives de Pierre, livrées ensemble.

**« Le tuto ne doit plus être la condition pour débloquer le jeu. »** Les
nouveaux venus devaient faire le tutoriel avant de voir le site (accueil à un
seul bouton, modes cachés jusqu'au chapitre 1 ou 3), et ça les rendait
réticents. Désormais :
- `DECOUVERTE_LIBRE` court-circuite `VERROU_MODES` : RUN DU JOUR, LIBRE et LA
  PILE sont là dès l'arrivée (sans étiquette NOUVEAU : trois « nouveau » sur un
  premier écran seraient du bruit) ;
- l'accueil « neuf » à un bouton n'est plus servi (`const neuf = false`) ;
- le tutoriel se joue au PREMIER lancement, quel qu'il soit, puis conduit à la
  partie CHOISIE (`modeApresTuto`), y compris par PASSER. Par JOUER ou un
  niveau, il mène au 1-1 comme avant. `tests/decouverte.test.ts`.
- ⚠️ Coût assumé : un nouveau venu peut brûler un essai du run du jour sans
  connaître le jeu — c'était la raison du verrou.

**Les gros doigts** (`render/toucher.ts`, pur, testé). Au téléphone, une petite
pièce faisait 34 px de diamètre à l'écran (terrain debout 234 × 558, échelle
0,557, borné par la HAUTEUR). Au doigt (`TOUCH_ONLY`), les pièces se DESSINENT
×1,2 (plafond 66 unités : la grande tient dans sa cellule de 140) et se
TOUCHENT là où on les voit, plus 12 px d'écran de marge : petite pièce ≈ 40 px
visibles, ≈ 64 px touchables. ⚠️ Rien de jugé ne bouge : le moteur, le serveur
et `verifyRun` ne reçoivent qu'un INDEX de pièce (n°3). `HIT` reste 1,22 et la
souris garde exactement l'ancienne zone (testé). Départage par le CENTRE le
plus proche — par le bord, la grande pièce volait l'appui de la petite (le
test l'a montré contre mon premier commentaire). Coût : sous « n'importe où »,
un appui PRÈS d'une pièce interdite la touche désormais.

**Les menus en colonnes, suite.** RÉGLAGES : chaque groupe dans une
`.rgl__section` en `display: contents` au téléphone (positions identiques au
pixel, relevé comparé), grille 2 × 3 au bureau. BRIEF (quand il a une allure à
régler) et FICHE : colonnes CSS avec un saut forcé (`break-before: column`),
jamais une grille qui alignerait les rangées des deux moitiés.

### LA SECONDE tuait au lever du doigt, et les menus au bureau (30/09/2026)

Rapporté par Pierre : « LA SECONDE retire une vie peu importe quand on
clique ». ⚠️ **Le clic était juste, c'est le LEVER qui tuait.** Un clic réussi
ouvre la manche suivante, le doigt se lève ~80 ms plus tard — donc dans les
400 premières ms de la manche d'APRÈS — et `resolveAction` passait ce lever à
la règle unique AVANT de voir qu'il ne répondait à rien. Le rejeu serveur ne
voyait rien (un lever inutile n'est pas journalisé) : l'écran tuait un run
que le serveur aurait validé. Corrigé en tête de `resolveAction` : un lever
sans `leverAttendu` est ignoré avant tout juge. `tests/seconde.test.ts`,
éprouvé (sans la garde, il tombe dès la manche 0). **Leçon : toute règle qui
juge le TEMPS doit se demander quels événements arrivent juste après une
transition de manche.**

**Les menus au bureau** (bloc « LE BUREAU » en fin de `theme.css`). Mesuré à
1920 × 1080 : accueil dans 700 px, réglages et profil dans 510, pour un
`#app` de 1680. Deux leviers : un `zoom` par paliers de FENÊTRE (1,15 dès
1500 × 860, 1,3 dès 1800 × 1000, 1,55, 2) posé sur les enfants de `.screen`
— barre haute et contenu — jamais sur `#app` ni `#stage` ; et des colonnes :
accueil (niveau | parcours), profil (qui tu es | compte, seulement si le
compte est visible), entrée multi (deux portes, puis trois salons), boutique
sur une rangée. ⚠️ Canvas et `champ()` mesurés IDENTIQUES avant/après à
1280, 1920 et 2560. Les réglages restent une liste. Le salon et l'écran de
jeu n'ont pas été touchés.

### Le lot « addiction » (28/09/2026) — jamais vu par un joueur

Directive de Pierre : « c'est juste un petit jeu plutôt sympa mais pas
addictif comme un Suika Game ou Bomb Party, les gens adorent se comparer ».
Trois chantiers, dans l'ordre du moins cher au plus ambitieux. Ce qui les
relie : **tout ce qu'on a proposé de DIFFÉRÉ est mort** (partage 0 %, duel
par lien jamais utilisé). La comparaison et la relance doivent donc arriver
là où le joueur est déjà, au moment où il y est.

**LA CARTE DE RELANCE** (`render/relance.ts`, pur). À la mort, sur le terrain
figé : motif, score, écart au record (« À 2 MANCHES DE TON RECORD » si l'on
voyait la ligne, deux manches ou 15 %). Un appui n'importe où relance, par le
brief ET son battement de lecture : la règle se relit pendant le rebours
(§8, jour 2). ⚠️ Elle REPOUSSE l'écran de fin, elle ne le remplace pas.
`finishRun` écrit tout comme avant, et l'écran passe devant dès qu'il a
quelque chose à DONNER : carte, maîtrise, quête, mesure, avis, installation.
Jamais sur un duel, un niveau, un classé ou un jour sans essai. ⚠️ Une GARDE
de 450 ms ignore le tapotement réflexe de la mort ; le premier relevé
Playwright a cru à une panne, c'était la garde. Trouvé en chemin : REJOUER
après une PILE lançait un ENTRAÎNEMENT, et la pile comparait ses manches au
record d'entraînement. Les deux sont corrigés.

**LE RIVAL DU JOUR** (`game/rival.ts`, pur). Pendant le run du jour, la case
du milieu du pied vise le plus FAIBLE des amis encore devant (« LÉA · 14 »).
Une pastille « TU PASSES LÉA » tombe, puis la cible monte d'un barreau.
Sans ami ou devant tous : les paliers anonymes TOP 50/25/10/1 %. La carte de
mort raconte, dans cet ordre : un dépassement de CE run, un ami presque eu,
« MIEUX QUE N % DES JOUEURS AUJOURD'HUI ». ⚠️ Que du REJOUÉ (n°14) :
`GET /api/perf?a=repartition` rend des SCORES nus, derrière les filtres du
podium ; un test cherche l'identifiant, le pseudo et la durée dans la
réponse brute. Muet sous 10 joueurs. Rien n'est attendu : sans compte ou
sans réseau, le pied redit « SUR 40 ».

**LA PARTIE RAPIDE** (`server/rapide.ts`, pur). `{ t: "quick" }` range à une
table PUBLIQUE qui part seule dès deux joueurs (15 s de fenêtre, 5 s à six)
et REPART seule 12 s après chaque match. ⚠️ Une arrivée ne repousse jamais
l'échéance (testé), sinon un flux d'arrivées la tiendrait en attente pour
toujours. `start`, `settings` et `kick` y sont ignorés : personne n'est
l'hôte de personne. `room` gagne `public` et `autoAt`, absents d'une table
privée. `PROTOCOL_VERSION` inchangée. ⚠️ Un serveur de salons d'avant ce lot
se TAIT sur `quick` : le client le dit après 5 s. **Il faut donc déployer
Fly ET Vercel pour que la porte vive.** L'e2e mesure tout sur le fil (14
assertions). ⚠️ Une table publique rend COURANT le spectateur au podium de
fin : sa rangée débordait de 27 px à 375, corrigé.

⚠️ **Le risque écrit au backlog tient toujours** : une table publique vaut
ce que vaut le nombre de joueurs SIMULTANÉS. Seul, on lit « EN ATTENTE
D'UN AUTRE JOUEUR · ENVOIE LE LIEN ». Le chiffre à lire est `salon_rapide`,
à rapprocher de `match_debut`. Idée écartée pour ce lot : jouer le run du
jour en attendant qu'une table se forme.

Mesure du lot : `relance_rejoue`, `relance_bilan`, `salon_rapide` (dans les
DEUX listes blanches). Le chiffre qui juge le tout : les runs par session, et
D1.

### Le lot « téléphone vivant » (26/09/2026) — jamais vu par un joueur

Directive de Pierre après une soirée entre amis : groupe 1 et 2 du téléphone,
les amis, et surtout « le gameplay est encore trop statique … le potentiel de
TOR c'est "MERDE ÇA VA TROP VITE" … l'intensité doit être GAGNÉE ».

**L'intensité** (`render/intensite.ts`, pur, testé) = 40 % palier de la partie
+ 60 % SÉRIE (manches tenues d'affilée ; une faute la fait retomber). Mesuré
au téléphone : 0,33 à la série 10, 0,78 à 20, 1 à 30. Tout ce qui en découle
est du DESSIN : gerbe, onde, coup de poing du terrain (≤ 1,2 %, sous la marge
du hit-test), « ×N », cadre épaissi dont les deux têtes brûlent, traînées dans
les bandes vides, pièces qui battent avec le cœur, cascade à l'ouverture,
consigne qui claque (transform seul, n°17). Débutant = rien de tout ça (testé).
⚠️ **La mort est une RUPTURE** : éclair, terrain éteint, fissures déterministes
(épaisseur plancher À L'ÉCRAN : l'échelle tombe à 0,46 au téléphone).
`FREEZE_MS` 520 → 820 : hors jeu, le rejeu ne le voit pas. Le multi la reçoit
sur le verdict SERVEUR (`MultiFx.mort` / `reussi`). **Jamais vu en salon
réel** — seulement en solo, 50 manches jouées.

- **Une seule horloge** au téléphone : `#timer` masqué (visibility). L'annonce
  de palier vit DEBOUT dans la bande gauche (elle chevauchait la ligne des
  gestes sur une consigne à deux lignes).
- **Toucher la consigne ne tue plus** (debout) : ses enfants absorbent.
- **Écran allumé** en partie et au salon (`eveil.ts`, Wake Lock).
- **LA VOYELLE au doigt** remplacée (`withoutLetters`) ; `capacites.lettres`
  dans la revendication, ABSENT = non remplacée. Le tirage d'entraînement
  libre ne filtrait que le maintien : il reçoit `estJouableIci`.
- **Le manifeste forçait le PAYSAGE** : `any`. Balises iOS, couleurs sable.
  Invitation à installer (`game/installer.ts`) : une fois, après 3 parties,
  jamais sur un écran déjà sollicité ; iOS seulement dans Safari.
- Couché : COMMENCER et REJOUER collés en bas (au-dessus de la barre, 57 px).
- **Style pixel** : pas r/7 — le rond différait du carré de 6 %, il diffère de 21 %.

**Les amis** : AJOUTER envoie une DEMANDE (migration **0004**, à appliquer par
Pierre) ; l'amitié naît de l'acceptation ; deux demandes croisées valent
accord ; on n'accepte que ce qu'on a reçu ; un refus ne prévient personne ;
une demande ne montre qu'un visage, aucun score (clés exactes testées).
Écran `/amis` (demandes reçues d'abord, son code en grand, partage natif avec
`/amis?code=…` qui PRÉ-REMPLIT sans demander) ; le mur et le profil n'en
gardent qu'une porte ; pastille sur PROFIL. Les amitiés d'avant restent.

**L'accueil se découvre** : un mode fermé ne s'affiche PAS (il paraît marqué
NOUVEAU, `Save.modesVus`, ABSENT = déjà vus) ; une pastille à zéro se tait ;
le chemin s'arrête au prochain chapitre fermé (2 550 → 914 px après une
partie). Typographie : UN élément fort par bloc, le reste un palier en dessous
(taille ET graisse ET couleur). Le chiffre du jour est un CHIFFRE, pas une
phrase. ⚠️ Ce qui contredit l'ancien §12 « les règles verrouillées restent
VISIBLES » vaut pour la grille d'entraînement, pas pour les modes de l'accueil.

### ⚠️ Le serveur de salons tombait sur UN message (25/09/2026)

Trouvé en portant la photo de profil sur le fil, et c'est antérieur à elle.
`server/index.ts` n'écoutait pas `error` sur ses sockets. Or `ws` émet
`error` sur toute trame qu'il refuse — plus grosse que `maxPayload`, UTF-8
invalide, opcode inconnu — et un `EventEmitter` sans écouteur d'`error` LÈVE :
**le processus mourait, et tous les salons en mémoire avec lui**, sur une seule
trame d'un seul client. Mesuré : `RangeError: Max payload size exceeded` non
rattrapée. Corrigé par un écouteur ; l'e2e envoie une trame de 40 Ko et exige
que la fautive soit coupée (1009) ET que le serveur réponde encore aux autres.

Même lot : `maxPayload` valait **4096**, taillé sur un chat de 140 caractères.
Une photo de téléphone réduite pèse 4 à 8 Ko : `ws` aurait fermé la socket du
joueur au moment où il la choisit. Il vaut désormais `PHOTO_MAX + 1024`.
**Tout nouveau message plus gros qu'un chat doit relever ce plafond.**

### MAINTENIR et GLISSER — deux gestes qui ne sont pas un clic (25/09/2026)

Demandé par Pierre (« glisser, maintenir etc. »). « MAINTIENS LE ROUGE »
(`tiens`, niveau 4, par la COULEUR seulement) et « GLISSE LE ROUGE SUR LE
BLEU » (`glisse`, niveau 6), tactiles.

⚠️ **OUVERTES AU SOLO le 26/09, sur directive de Pierre** (« met les nouvelles
consignes en déploiement »), avec le double appui. `INSTRUCTIONS` NE BOUGE
PAS — c'est la base du multi v1 et le réservoir de LE MENTEUR — : le solo a son
catalogue, `INSTRUCTIONS_SOLO`, et `VERSION_CONTENU` se calcule sur lui :
**`5m4fgw` → `1h63n7k`**, les records d'entraînement affichés repartent d'une
clé neuve (coût annoncé). La revendication porte `catalogue: 2` (absent = 1,
l'ancien catalogue : une file écrite avant se rejoue comme avant), le lever est
journalisé (`{k:"l"}`) seulement quand `leverAttendu` dit qu'il répond à
quelque chose.

⚠️ **La calibration a fait trois coupes, toutes mesurées** (120 runs × 45
manches, plafond 28 %) : aux poids d'origine, LE SOLITAIRE montait à **31,0 %**
— le chiffre que ce dépôt tient pour mortel — parce qu'une consigne qui vise
une FORME unique est un piège garanti sous lui. D'où : MAINTIENS par la couleur
seulement ; le double appui du SOLO par la couleur seulement (celui des salons
garde ses deux variantes, il est négocié en v2) ; poids 1 au solo, et 0,5 pour
GLISSER, qui touche deux pièces (LA ROUE à 28,4 % au poids 1). Après : plus
haute règle à 27,4 %. `TAUX_PIEGE` (fiche) remesurée sur le catalogue solo.
Joué en vrai (Playwright, 375 × 812) : 5 runs sur 5 jusqu'à la manche 61, 10
maintiens, 6 glisser, 6 doubles appuis.

**Une seule action neuve : le LEVER** (`Action.lift`, `{k:"l", i}` sur le fil).
L'appui reste un `click` — il arrive devant les règles et sur le fil comme
aujourd'hui — et c'est le lever qui conclut :
- `hold` : l'appui sur la pièce pose `progress.holdAt` ; un lever avant
  `HOLD_MS` (600) tue (« TU AS LÂCHÉ TROP TÔT »), après il fait survivre ;
- `drag` compile en `[click from, drop to]` ; le lever doit tomber sur `to`.
- ⚠️ **Partout ailleurs, un lever est IGNORÉ** — un clic ordinaire se lève
  aussi. C'est l'assertion qui a le plus de dents (éprouvée en retirant la
  garde : deux tests tombent). Et le client ne l'ENVOIE que s'il répond à
  quelque chose : sinon chaque clic doublerait le trafic, et un serveur
  ancien recevrait un message qu'il ne sait pas lire.
- Client et serveur jugent la même durée : l'appui et le lever portent
  chacun leur `at`, projeté sur l'horloge serveur (décision n°3).

**Le temps** : `poidsGestes` remplace `steps.length` dans les fenêtres. Un
maintien pèse 1 + 3 gestes (840 ms ≥ 600 tenus), un lever de glisser 2.
⚠️ Pour toute étape d'avant, le poids EST le nombre d'étapes (testé) : aucune
fenêtre existante ne bouge.

**Les règles** : `targets` voit la pièce tenue et LES DEUX pièces d'un glisser
— poser sur du rouge, c'est toucher du rouge. LE SANG piège donc un glisser
qui prend OU pose du rouge, et aucun autre (testé sur 400 tirages).

**Négocié** : `CONSIGNES_VERSION` = 3, `VERSION_DE_CONSIGNE` dit à partir de
quelle version chacune sort ; à la version 2 le pool est EXACTEMENT celui
d'avant (testé). À l'écran : une jauge autour de la pièce, qui passe au VERT
quand le lever sera accepté (`drawGeste`), et « TIENS JUSQU'AU VERT » sur la
ligne des gestes ; un trait pointillé de la pièce prise au doigt. Le canvas
capture le pointeur à l'appui : un glisser qui sort du terrain lève encore
sur lui.

### L'écran de jeu au téléphone, et les modes multi joués pour de vrai (26/09/2026)

Rapporté par Pierre : « beaucoup de bugs sur les modes multi, sur téléphone
l'écran de jeu est juste atroce et les icônes sont mal placées ». Tout a été
JOUÉ (Playwright, hôte au téléphone, joueurs pilotés par `__tor.joueMulti`,
dev seulement : il retient chaque manche et n'agit qu'à 460 ms, LA SECONDE).

- ⚠️ **« NE FAIS RIEN » affichait « 1 GESTE »** après une manche à un geste :
  la clé de repeinture de la ligne portait le compte CALCULÉ, pas le compte
  PEINT. `tests/hud-gestes.test.ts`, éprouvé.
- **Une seule horloge** : le cadre de temps épouse le TERRAIN (plus les bords
  de l'écran, donc plus de barres parasites derrière la consigne), sans
  hachures ; équerres et bordure critique de `#app` retirées.
- Cœurs en MASQUE SVG (un `clip-path: path()` est en pixels : réduit à 7 px il
  restait un demi-disque) ; badge « 1RE » en onglet (il couvrait le nom) ;
  émotes 2 × 3 ; plaques qui se partagent la largeur, avatar 16 px, noms en
  ellipse ; annonce de régime traduite (`nomsPaliers`) et posée hors du
  terrain ; fil des chutes tu au téléphone ; panneau de perte de vie en
  autocollant ; au-delà de six vies, un cœur et « ×12 ».
- **Salon** : LANCER était à y = 1208 pour un écran de 812 — la rangée
  d'actions colle au bas du panneau, au-dessus de la discussion.
- **Fin de match** : « ÉGALITÉ » au-dessus de 1er, 2e, 3e pour trois ex æquo,
  et « TU FINIS 1er SUR 3 ». Le rang se COMPTE (`render/rangs.ts`, pur,
  testé : 1 + le nombre strictement devant) et la ligne de rang et le podium
  lisent la MÊME fonction — ils triaient chacun de leur côté, l'un avec
  `winnerId`, l'autre sans. « MANCHE 59 » sous 60 manches tenues (`idx` part de
  0). Un titre à égalité au sommet se TAIT (SÉRIE allait au premier arrivé) ;
  SURVIVANT lit `winnerId` (il se décernait sur une égalité). La rangée d'un
  joueur en vie débordait de 47 px.
- **Coop au téléphone** : le compteur « VIES 12 · SCORE 0 » se peignait sur la
  consigne et doublait le pied (tu) ; les pastilles d'appuis faisaient 9 px
  (taille plancher de 22 px à l'écran).
- Imposteur : sa porte est fermée depuis le playtest (voir le commentaire dans
  `index.html`), non rejoué.

### Le rejeu serveur jugeait les runs de téléphone sur d'AUTRES manches (26/09/2026)

Trouvé en ouvrant les consignes au solo, antérieur à elles. Le téléphone tire
dans le catalogue TACTILE et remplace une règle à maintien ; `verifyRun`
rejouait dans le catalogue complet sous la règle brute. Mesuré sur 200 graines :
divergence dès la manche 3 (au plus tard la 7), 200 sur 200 — **tout run du
jour mobile avait un score vérifié faux**, donc podium et amis faux. La
revendication porte `capacites: { clavier, maintien, encre }` (absent = clavier,
comme avant). Reste une direction : la clé de comparabilité ne sépare pas
téléphone et clavier, qui ne jouent pas les mêmes manches.

### Le double appui — première consigne neuve, multijoueur seulement (25/09/2026)

« CLIQUE DEUX FOIS LE ROUGE / LE ROND » (`doubleTap`, niveau 4, poids 2,
tactile). C'est une `sequence` qui désigne deux fois la même pièce : le fil ne
transporte que des index, `resolve` et les règles (`targets`) lisaient déjà
les séquences. Aucune mécanique neuve, donc aucune prise pour la famille du
§11. Le terrain est en `touch-action: none` : pas de zoom au double-tap.

⚠️ **Elle n'est PAS au catalogue solo, et c'est mesuré** : `VERSION_CONTENU`
se calcule sur `INSTRUCTIONS`, et les records d'entraînement AFFICHÉS sont
indexés sur elle (`cleEntrainement`). L'y mettre ferait lire « TON RECORD · 0 »
à chaque joueur au déploiement et couperait en deux le classement du jour de
la mise en ligne. Elle vit dans `CONSIGNES_MULTI` ; l'ouvrir au solo est une
ligne (la déplacer dans `INSTRUCTIONS`) — **une décision de Pierre**, coût
écrit. `VERSION_CONTENU` = `5m4fgw` avant et après, gardée par un test.

⚠️ **NÉGOCIÉE sur le fil**, parce que front et salons se déploient séparément :
`hello.consignes` (absent = 1), le serveur retient le MINIMUM du sien et de
chaque siège, le fige au lancement et l'envoie dans `match_start` (absent = 1).
Les quatre combinaisons de versions retombent sur un pool que les deux côtés
connaissent. `CONSIGNES_VERSION` monte à chaque ajout à `CONSIGNES_MULTI`, ne
descend jamais. `PROTOCOL_VERSION` inchangée.

**L'e2e a failli la valider par chance, deux fois :**
- un scénario de 16 s ne couvrait que les manches 0 à 4 — or la consigne
  n'entre au tirage qu'à la 4 : un client resté en version 1 passait sans une
  faute (éprouvé). Il dure 40 s et exige d'avoir couvert 10 manches ;
- les verdicts du fil n'ont PAS de champ `cause` (`RoundOutcome` ne porte que
  `reason`) : un filtre `cause === "wrong"` ne pouvait rien attraper. On
  écarte les deux motifs d'horloge, et tout le reste compte.
- Et une faute « de désaccord » n'en était pas une : le **pilote** cliquait
  `ents[0]` sur « n'importe où », mortel sous LES ANGLES ou L'AZUR. Il choisit
  désormais une pièce que sa règle autorise. Même famille que `playPerfect`.

Mesuré : 5 passages sur 5 sans faute (double appui joué dans 4), 6 fautes
quand le client reste en version 1.

### Les amis — fait, jamais vus par un joueur (25/09/2026)

Demandé par Pierre : amis, classement des amis, comparer scores et runs.
`shared/amis.ts` (pur) · `api/amis.ts` · migration **0003** · `src/compte/amis.ts`
· bloc `#murAmis` sous le podium du mur des records.

- **Un CODE de six lettres**, pas une recherche par nom : il se dicte comme un
  code de salon (le social de TOR est synchrone, playtest jour 2), et une
  recherche ferait de chaque compte un annuaire. Ajouter un code lie les DEUX
  comptes — donner son code vaut accord. 50 amis au plus, des deux côtés.
- **On ne compare que du REJOUÉ** (n°14) : run du jour du cercle, semaine en
  sept barres, meilleur du mois — tout vient de `performance`, filtré comme le
  podium (`verdict_bot = humain`, même clé de comparabilité). Un test refuse
  qu'un record des AGRÉGATS apparaisse.
- **Jamais d'identifiant de compte publié** : le code sert de poignée. Un test
  fixe la liste EXACTE des clés d'une ligne, éprouvé en laissant fuiter l'id.
- Le compte est OBLIGATOIRE pour ça, et ça ne contredit pas n°12 : une liste
  d'amis EST un compte. Aucun chemin de jeu n'y touche ; sans comptes au
  déploiement, le bloc se tait comme le podium.
- La carte de visite monte dans `apparence.carte` (la clé était réservée
  depuis la migration 0001) ; `apparenceAutorisee` la valide, car elle finit
  dans une `url()` CSS chez les amis. La PHOTO ne monte jamais.
- ⚠️ La suppression d'un compte est LOGIQUE : `on delete cascade` ne joue pas.
  `supprime()` efface donc les amitiés et le code à la main (testé).
- Mesuré à l'écran avec le VRAI gestionnaire branché par Playwright : pistes
  fixes (une piste `auto` s'élargissait sous « PAS ENCORE JOUÉ » et décalait la
  semaine d'une ligne à l'autre), lignes à 56 px, rien ne déborde à 375.

**À faire côté Pierre pour que ça vive** : appliquer `0003_amis.sql` après les
deux premières. Rien d'autre — pas de variable neuve.

### Le joueur a un visage : carte de visite et photo (25/09/2026)

Demandé par Pierre (« l'essence du jeu c'est le multi »). `shared/profil.ts`
valide des DEUX côtés avec la même fonction ; absent vaut non, le douteux est
ignoré sans erreur. Message `profil` (client → serveur, renvoyé à chaque
`welcome`), `PlayerPublic.carte`, et `photos` (serveur → clients) : la photo
voyage À PART du `room`, une fois à l'arrivée, jamais à chaque état du salon.

- **La carte** ne se choisit que parmi les cartes GAGNÉES (n°7). Au salon et au
  classement : vignette carrée pleine opacité au bord droit. Premier essai
  mesuré en fond voilé à 80 % : une tache floue, rien de reconnaissable. Les
  plaques de match gardent le fond voilé (62 %) : elles descendent à 76 px.
  ⚠️ `.seat.is-me { background }` (0,2,0) effaçait la carte sur SON PROPRE
  siège — les états qui la portent sont nommés dans la règle ; les VERDICTS
  de plaque l'emportent exprès.
- **La photo** est réduite PAR LE CLIENT (`render/photo.ts`, 96 px, JPEG,
  ≤ `PHOTO_MAX`) : la pleine résolution et ses métadonnées ne quittent jamais
  l'appareil. SVG et URL refusés (script, sondage des clients). Un réglage
  masque les photos des AUTRES. Un changement de photo à moins de 1,5 s du
  précédent est ignoré par le serveur (relayer 14 Ko × 9 en rafale).
- Mesuré à deux navigateurs : plaques identiques avec et sans profil
  (210 × 102 bureau, 90/76 × 75 téléphone). La taille du champ ne bouge pas.

### Le PROFIL est un écran, pas un détour (25/09/2026)

Rapporté par Pierre : « c'est quand on clique sur changer de nom qu'on peut
changer sa photo de profil ». La carte de visite et la photo vivaient DERRIÈRE
l'écran NOM ET SIGNE du multi — et dans `multi.ts`, qui rend un objet INERTE
sans `VITE_WS_URL` : sans serveur de salons, elles n'existaient pas.

- `#compte` devient PROFIL : une carte d'identité (visage, nom, `SUR CET
  APPAREIL` / `CONNECTÉ`, bouton NOM ET SIGNE), la carte et la photo à
  découvert, puis la section COMPTE (`#profilCompte`) en dessous.
- ⚠️ **Le bouton de la barre haute est TOUJOURS visible** — il portait
  l'invariant « masqué sans fournisseur ». Il ouvre maintenant un profil qui se
  tient sans compte ; c'est `#profilCompte` qui se tait sans fournisseur, et
  `tests/invariants-compte` le vérifie là. Il porte un visage et un nom, donc
  **jamais de `textContent`** dessus (`peintBoutonProfil`) : `appliqueLangue`
  ne le touche plus, et `libelleCompte` est parti avec.
- `src/profil.ts` porte les deux sélecteurs, sans réseau ; `multi.envoieProfil()`
  prévient le salon. L'avatar du profil EST l'aperçu de la photo (un seul
  visage par écran) et lit `signeAffiche` comme la barre et les salons.
- ⚠️ Reste vrai : NOM ET SIGNE passe par `multi.ouvreIdentite`, donc il est
  inerte sans serveur de salons. Sans conséquence en production.

### Les émotes à côté des plaques, et le terrain qui grandit (25/09/2026)

Rapporté par Pierre : « les émojis en multijoueur apparaissent sous l'écran de
jeu ». Mesuré : une rangée de 60 px SOUS les plaques, seule en bas — et payée en
terrain, puisque `RESERVE_HUD_MULTI` réservait 180 px pour elle. En colonnes
(1600 × 700), une rangée DANS le flux sous la scène, et seulement dans ce mode :
la hauteur de scène dépendait donc de la décision des colonnes (n°2).

- Hors colonnes : grille 3 × 2 À CÔTÉ des plaques (la forme du salon couché,
  généralisée). La bande tombe à 119 px, `RESERVE_HUD_MULTI` 180 → **126**.
  Terrain en match : **863×362 → 994×417** à 1280 × 800, **169×402 → 192×456**
  à 375 × 812. Recouvrement terrain / bande : 0 sur neuf formats.
- En colonnes : bas de la gouttière droite, hors flux ; `#platesR` s'arrête
  100 px au-dessus. 851×357 → 996×418 à 1600 × 700.
- ⚠️ Trouvé en mesurant : à 812 × 375 la bande MORDAIT déjà 25 px sur le
  terrain — les plaques ne passaient en compact que sous 720 px de LARGE, alors
  que le paysage serré se décide sur les deux dimensions. `renderPlates` lit
  maintenant `paysageSerre`.
- `window.__tor.champ()` (dev seulement) rend le champ en coordonnées de page :
  c'est avec lui qu'on mesure un recouvrement, pas à l'œil.

### LA MONTÉE — la tension qui suit la PARTIE, pas la manche (25/09/2026)

Demandé par Pierre avec le retrait des flammes : « trouve un moyen de ressentir
vraiment la tension qui monte au fur et à mesure du jeu ». Deux constats :

- ⚠️ **`.heat__vignette` était invisible depuis la refonte** : elle peignait en
  `--ink`, et STICKER a fait de `--ink` le sable du fond. Elle peint maintenant
  en `--dead` (défini par le thème, la nuit ET chaque plateau).
- tout ce qui restait visible — le cadre de temps et son battement — suivait la
  MANCHE en cours. La manche 3 et la manche 40 s'ouvraient pareil.

`render/tension.ts` (pur, testé) : cinq paliers décidés sur la manche seule —
0 pendant l'échauffement, puis à +0, +7, +15, +25 manches (calés sur la
médiane 12 et le p75 20 du §8). Chaque palier a un CŒUR (période 1000 → 520 ms,
×0,7 en zone critique) qu'on entend (`sfx.coeur`, deux sinus graves, l'octave
au-dessus pour les haut-parleurs de téléphone) et qu'on voit : le canvas peint
un voile garance sur le POURTOUR du terrain (`scene.pression`, découpé en
`evenodd` autour de `fieldRect()` — le champ n'est jamais touché, n°5 et n°10),
plus dense aux bords de l'écran, qui bat avec le cœur. Un palier franchi : un
sursaut du voile, `sfx.palier`, 40 ms de vibration — pas de texte.

- ⚠️ Le battement est porté par la BOUCLE (`poseTension`), jamais par une
  minuterie : doctrine du battement de lecture.
- Le multi a une manche de mise en jambes (`grace: 1`), puis le même cœur.
- `prefers-reduced-motion` : le voile reste, il ne bat plus.
- Les faux contextes canvas des tests (`smoke`, `rebours`, `arrivee`) rendent
  désormais le contexte à chaque appel : `createRadialGradient` y rendait
  `undefined`, et le smoke est tombé — il exécute donc bien la montée.

### L'audit des écrans — ce que la mesure a trouvé (25/09/2026)

Suite de « certains mots sont juste flottants et ne suivent pas la DA ».
Contraste de chaque texte contre son fond effectif (seuil 3:1), débordement du
TEXTE hors de sa boîte (`Range`), dernier texte d'un écran défilé au maximum
contre le haut de la barre du bas — 8 routes plus brief, fin, fiche, niveau et
salon, jour et nuit, 375 et 1280.

- ⚠️ **Le dernier chapitre du parcours était INATTEIGNABLE** : `.home` restait
  calée à 722 px par le `flex: 1 1 0` de `#home`, le parcours débordait jusqu'à
  2416, et la marge réservée à la barre se posait au milieu de la page. Défilé au
  maximum, le chapitre 16 finissait sous la barre (790 pour 739). Après : 656.
- Trois titres alignés à gauche gardaient leur filet CENTRÉ (réglages, mur des
  records, collection en large) : un trait sous rien.
- Étoiles vides de la fiche 1,55:1, « HÔTE » la nuit 2,76:1, explication du
  piège dans le brief 2,30:1 (un corail en dur de l'identité nocturne).
- DÉFIER seul sur une demi-rangée de l'écran de fin au téléphone.
- ⚠️ **Piège de mesure** : un fond en `color-mix()` se lit `color(srgb 1 0.98
  0.95 / 0.7)` — composantes entre 0 et 1. Les lire comme du 0-255 fait voir
  du texte prune sur du NOIR, et invente des défauts (le bilan de fin, 1,29:1,
  était lisible). Les « — — — » à 1:1 de la grille d'entraînement sont les
  barres de censure, voulues.

### Les plateaux habillent toute la partie (25/09/2026)

Demandé par Pierre : un plateau acheté s'applique à toute la page de jeu, pas
qu'au canvas. `:root.en-partie[data-skin="…"]` redéfinit TOUS les jetons de
couleur (`tests/theme.test.ts` refuse un oubli) ; `en-partie` est posée par
`show(null)`. ⚠️ Sur la RACINE, jamais sur `#app` : `--ombre` se calcule là où
elle est déclarée. Les menus gardent le thème : le plateau est un décor de jeu.

### `smoke.test.ts` tombait une fois sur vingt — expliqué

Il laisse filer le temps sans jouer et parie que le 1-1 est perdu. Or la graine
vient de `Math.random`, et **5,2 % des graines** (156 sur 3000) font gagner le
1-1 à un joueur qui ne touche à rien : les manches piégées se survivent en
s'abstenant. Son hasard est désormais figé ; les valeurs 18 et 20 le font
tomber sur exactement cette assertion.

### DÉJOUER retiré, et le temps mort qu'il cachait (25/09/2026)

Retiré en entier : moteur (`resoudreDejoue`), `Session`, `game/dejoue.ts`,
réglages, bouton au pouce, ligne du brief, lettre réservée. Le tirage
d'entraînement redevient CELUI d'avant DÉJOUER (boucle de `buildRound`
restaurée à l'identique de `329f154^`) ; `VERSION_CONTENU` inchangée
(`5m4fgw`, vérifiée avant/après). Toute partie d'entraînement redevient
partageable en défi. Un vieux réglage `dejoue` dans une sauvegarde est lu et
oublié (testé).

Le tutoriel garde TROIS temps : le troisième est un second piège tenu
jusqu'au bout, sous une consigne plus légitime (« CLIQUE LE CARRÉ ROUGE »).

⚠️ **Deux défauts trouvés en le JOUANT (Playwright, tutoriel complet) :**
- `CHRONO_PIEGE_MS` valait `windowMs(0) * 2`, écrit quand la première
  fenêtre faisait 1500 ms : il avait dérivé à **8 s**, deux fois de suite,
  pour un joueur qui découvre le jeu. Son test gravait la FORMULE, donc il a
  suivi la dérive sans rien dire. Fixé à 3000 ms, et le test vérifie
  l'intention (2,5 à 4 s).
- `arc()` recevait un rayon NÉGATIF (−7,7) : l'onde de clic calcule
  `k = (now − pulse.t) / 220` avec `pulse.t` à l'instant du clic et `now` au
  début de l'image ; un clic entre les deux donne `k < 0`, et `arc` LÈVE —
  l'image s'arrête. Borné à zéro.

⚠️ **LE TEMPS MORT EST RÉEL, ET IL EST GROS.** Une manche piégée dure toute
sa fenêtre. Mesuré (`windowForSteps × allure`) : **8,0 s** au niveau 1-1/1-2
(allure 2, manche 0), 7,3 s à la manche 2, 6,2 s à la 5 — et c'est au 1-2
que le jeu ENSEIGNE le piège. En allure 1 : 4,0 / 3,6 / 3,1 s.

**RÉPONSE, sur directive de Pierre : `PLAFOND_ALLURE_MS = 4000`**
(`fenetreAllure`, `engine/difficulty.ts`). L'allure ne peut plus pousser une
fenêtre au-delà de 4 s, pour TOUTES les manches — donc rien ne distingue un
piège. Mesuré en jeu : manche 0 à ×2, **8000 → 4000 ms**. ⚠️ Le plafond ne
borne que le SUPPLÉMENT de l'allure (`max(base, 4000)`), jamais la fenêtre
nominale : à l'allure 1 le résultat est exactement `base`, y compris pour une
manche à trois gestes qui dépasse 4 s d'elle-même — run du jour, rejeu
serveur, escalade et `VERSION_CONTENU` (`5m4fgw`) inchangés, testé sur 70
manches × 5 nombres de gestes. Conséquences assumées : en début de partie,
DÉBUT, DÉCOUVERTE et NORMAL ont la même fenêtre (l'allure ne se distingue que
vers la manche 10 à ×2) ; les records d'entraînement aux allures lentes
gardent leur clé, et deviennent plus durs à battre, jamais plus faciles.

⚠️ **Ce qu'il ne faut PAS faire** : finir une manche piégée plus tôt que sa
fenêtre affichée. Le joueur apprendrait à ATTENDRE pour voir si la manche
s'arrête : sur 8 s de fenêtre, s'arrêter à 50 % laisse 4 s pour agir sur une
consigne légitime — le piège deviendrait un « attends et regarde ». Et une
barre qui file plus vite sur un piège le révèle avant la mort (n°5).

### LA REFONTE PARCOURS (25/09/2026) — branche `audit/ux-onboarding-recompenses`

Demandée par Pierre, carte blanche totale, après des retours « pas intuitif »,
« aucune sensation de récompense », « les escaliers sont durs à trouver ».
L'audit qui l'a motivée est dans `AUDIT-UX-RECOMPENSES.md`.

**Le jeu est une MONTÉE qu'on voit** (`src/game/parcours.ts`, pur, testé) :
un chapitre par règle (`CHAPITRES`, ordre pédagogique, LE SANG d'abord),
cinq niveaux par chapitre (`NIVEAUX` : premiers pas → le piège → sans filet →
tempo → boss), **trois vies par niveau, et les vies restantes SONT les
étoiles**. Le boss ouvre le chapitre suivant. JOUER lance toujours le
prochain niveau (`joueLaSuite`). Un niveau réutilise la plomberie des paliers
(`palierDeNiveau` → `palierDuRun()`), et `Session` gagne `vies` et `grace`,
**absents partout ailleurs** : run du jour, multi, rejeu serveur inchangés,
`VERSION_CONTENU` inchangée.

⚠️ **Le bug qui a déclenché tout ça** : après le tutoriel (qui enseigne LE
SANG), `openBrief("training")` → `trainingRule` sert une règle piégeuse
JAMAIS VUE — donc exclut LE SANG. Le joueur tombait sur LE GAUCHER. Le
tutoriel mène maintenant au niveau 1-1, et la première carte se GAGNE à la
fin du 1-1 (révélée), plus pendant le tutoriel.

⚠️ **`estNouveau()` est gardé dans `openBrief`**, le point de passage commun :
RUN DU JOUR / ESCALADE ne contournent plus le tutoriel.

~~**Les modes s'ouvrent en jouant**~~ — **levé le 30/09 sur directive de
Pierre** (`DECOUVERTE_LIBRE`, voir plus haut). C'était `VERROU_MODES` : jour et
libre après le chapitre 1, LA PILE — ex-escalade — après le 3. Le MULTI n'est jamais
verrouillé. ⚠️ `Save.veteran` : posé UNE fois à la relecture d'une sauvegarde
qui a un historique mais pas de `boutique` — les joueurs d'avant gardent tout
ouvert.

**Une seule maîtrise : battre le boss** (`estMaitrisee`). L'escalier ≥ 15 et
l'ancien seuil restent reconnus pour ce qu'ils ont DÉJÀ donné, mais le seuil
d'entraînement cesse de compter dès qu'une règle a des étoiles. La fiche
montre le chapitre ; l'échelle à six cases n'est plus affichée
(`AVANCE_ECHELLE = false`), la collection affiche `★ n/15`.

⚠️ **Les étoiles sont un champ de carnet** (`RuleRecord.etoiles`), branché aux
TROIS bouts : `majCarnet` (par le report `...prev`), `fusionne` (maximum case
par case, écrit dans `shared/compte.ts` sans import), `api/moi.ts` (borné à
5 cases × 0..3). `carnet-voyage` et `majcarnet` les ont réclamées d'eux-mêmes.

**La boutique** (`src/game/boutique.ts`) : les pièces achètent des styles de
pièces (`render/skins.ts` : sticker, néon, bonbon, pixel, craie). Un style ne
change QUE le dessin — le hit-test lit `e.x/e.y/e.r`. Local seulement (pas
dans le compte). Prix calés : un chapitre parfait (200) paie le premier.

**L'annonce du piège se pose sur la CONSIGNE** (barrée + pastille), classe
`#app.piege-annonce` : sur téléphone la case META est masquée, donc au
niveau 1-2 aucun signal n'était visible.

**Comment vérifier le rendu, puisque le volet ne compose pas de frames** :
Chrome headless via `playwright-core` installé dans le scratchpad (jamais
dans le dépôt), `executablePath` = le Chrome du système. En dev,
`window.__tor.joue()` joue la bonne réponse de la manche (bloc
`import.meta.env.DEV`, absent du bundle — vérifié `grep -c __tor dist` = 0).
⚠️ Le bouton JOUER « respire » : Playwright le juge instable, cliquer avec
`{ force: true }`.

**Ce qui reste, et c'est écrit** :
- ~~l'écran ESCALIER sans porte~~ **retiré** : écran, route (`/escalier` et
  `/climb` retombent sur la collection), armement `palierDemande`, retour
  « ‹ L'ESCALIER » de l'écran de fin, 35 chaînes par langue, 440 lignes de CSS.
  `game/escalier.ts` reste : le parcours joue ses leviers (`Palier`,
  `piegeIci`, `annonceIci`). Le champ `escalier` du carnet devient une DONNÉE
  HÉRITÉE — plus rien ne l'écrit, mais il voyage encore et le palier ≥ 15
  garde sa maîtrise : l'effacer ferait reculer des cartes en silence ;
- LA VOYELLE au doigt reste inerte sur le RUN DU JOUR (le parcours l'exclut) :
  la corriger demande une capacité `clavier` dans la revendication de
  `verifyRun`, comme `maintien` ;
- ~~les salons jamais vus avec un serveur~~ **vus**, deux navigateurs et un
  vrai serveur (voir « Le salon passe à l'autocollant » ci-dessous) ;
- **rien de tout ça n'a été vu par un joueur.** Les chiffres à lire :
  `onb_done` → `niveau_fin` (enchaîne-t-on après le tutoriel ?), la
  distribution des étoiles par niveau (le 1-3 sans filet est-il un mur ?),
  `boutique_achat`.

**Environnement** : ce poste est désormais macOS / zsh / Node 26. Node ≥ 25
expose un `localStorage` natif qui masquait jsdom (22 tests rouges) :
`vite.config.ts` passe `--no-experimental-webstorage` aux workers.

### Le salon passe à l'autocollant, et la nuit arrive (même branche)

Vu pour la première fois avec un vrai serveur et deux navigateurs (Playwright,
375 × 812 et 1280 × 800). **Aucun sélecteur du multijoueur n'avait été touché
par la refonte** : entrée, salon, plaques, fin de match, chat — et aussi
réglages, classement, compte, identité — étaient restés dans l'ancien monde.
Convertis dans `theme.css` (sections SALON et ÉCRANS DE SERVICE), sans toucher
à une seule dimension des plaques (`render/layout.ts` lit 150 px).

**Six défauts trouvés en JOUANT, aucun en relisant :**
- ⚠️ **le serveur déclarait l'HÔTE vainqueur d'une égalité.** Deux derniers
  tombés à la même manche, même score : `winner()` triait une égalité parfaite
  et rendait le premier siège. Son écran disait « TU AS GAGNÉ » au-dessus d'un
  classement qui le disait ÉLIMINÉ. `winner()` rend désormais `null` (le
  client savait déjà dire ÉGALITÉ) — sauf entre COÉQUIPIERS de DUO, qui sont
  toujours à égalité. Et le classement lit `winnerId` au lieu de redéduire le
  vainqueur : deux jugements sur un écran finissent par se contredire.
  ⚠️ Le premier test écrit passait À CÔTÉ : la manche 0 de sa graine était un
  « clique n'importe où », où cliquer dans le vide est une SURVIE. Il cherche
  maintenant une graine où les deux meurent (`tombentEnsemble`).
- « COPIER LE LIEN » invisible quand on est seul dans le salon : `btn--primary`
  (texte blanc) ET `btn--ghost` (sans fond) en même temps ;
- « 1RE PARTIE » en français sur les plaques anglaises : le mot vit dans un
  `content:` CSS, que l'i18n ne voit pas (`:root[lang="en"]` le traduit) ;
- les hachures de flanc de `.screen::before` peignaient SUR les réglages et le
  classement : un écran à dock commence à 24 px du bord ;
- la rangée d'un éliminé débordait à 375 px : 369 px pour 291 ;
- la case META du bandeau n'est jamais `:empty` (deux enfants) : son cadre se
  peignait vide sous les vies du multi.

⚠️ **Un intermittent de l'e2e, de conception** : `[074] coop curseur : une
graine avec GAUCHER…` cherchait au hasard, en DIX essais, un match où LE
GAUCHER tombe sur l'un des quatre sièges avec la pièce 3 hors zone — une chance
sur cinq par essai, donc un échec par pur hasard environ une fois sur dix. Vu
tomber une fois, sans aucun changement de code coop. Passé à quarante essais.

Hors salon, au passage : « YOU VS YOU » se lisait « YOUVS YOU » (espace de
Fredoka mangée par l'interlettrage négatif), et « celle qui te résiste »
parlait encore de « 2 cases sur 6 » — une échelle qu'aucun écran ne montre
plus. Elle parle en étoiles du chapitre.

**LA NUIT** — décision prise ici, avec la carte blanche de Pierre (« si tu le
juges nécessaire ») : tous les playtests ont eu lieu le SOIR, entre amis, et
un fond sable plein écran éblouit dans une pièce éteinte. AUTO par défaut, donc
un joueur dont le téléphone est en sombre la reçoit sans rien chercher. Le
mécanisme est en §7.

### Modes imposteur et coop — livrés sur master

Les deux modes sont des réglages de salon exclusifs (`settings.mode`,
absent = classique). `duo: boolean` reste pour les clients anciens.

**Imposteur** : cinq pièges locaux (`IMPOSTEUR_PIEGES`, indices pairs) —
**`FORCED_TRAP_ROUNDS` du run du jour n'a pas bougé**. Secret public/privé
(même `ruleId` pour tous, `{ t: "role" }` seulement à l'imposteur). Live
`{ t: "acted" }` peint AGI / RIEN. Après les dix manches : journal,
observation, **un seul vote**, puis l'écran de fin existant.

**Coop** : `MatchCoop` est un chemin séparé — `MatchLogic.input` fige le
siège, le coop demande plusieurs clics. Vie commune `3 × joueurs`, 12
vagues de 20–40 s, `need` 1–3 en **second signe** (badge cranté, jamais
une ColorId). Curseurs `{ t: "cursor" }` / `{ t: "cursors" }` hors
verdict (décision n°3). `winnerId` null n'est **pas** une égalité : le
score du groupe est le titre, TENU / À SEC l'issue.

`VERSION_CONTENU` inchangée (`5m4fgw`). `PROTOCOL_VERSION` = 1.

### Le bandeau de mesure a quitté l'accueil

Il s'affichait à l'ARRIVÉE, avant la première partie. Mesuré sur un 375×812 :
**223 px, 27 % de l'écran**, et `elementFromPoint` au centre de la faille rendait
le BANDEAU — donc les deux portes SOLO et MULTI étaient inertes tant qu'il était
là. JOUER, lui, restait cliquable.

Il se demande maintenant **après la première partie**, sur l'écran de fin.

⚠️ **Ce que ça change pour la collecte : RIEN.** `metrics.on` vaut déjà `true`
par défaut et le bandeau ne conditionnait aucune collecte — il informait et
offrait un refus. Les deux restent vrais, une minute plus tard. Le réglage
MESURE reste accessible en permanence. **L'arbitrage juridique appartient à
Pierre** ; ce qui est mesuré ici est un fait de produit.

Une seule sollicitation par écran : quand le bandeau paraît, l'invitation au
compte cède sa place pour ce run-là.

⚠️ **L'assertion INTERMITTENTE du scénario DUO est réparée.** `l'autre equipe
n'a rien perdu` lisait les vies de D3 APRÈS neuf secondes d'attente — or D3
joue, et rien ne garantit qu'il ne faute jamais sur neuf secondes. Elle
tombait une fois sur deux lancements, et le récapitulatif ne la voyait pas :
il ne surveille que les marges des grandeurs mesurées, et celle-ci est une
égalité. Ce qu'elle doit prouver n'est pas « D3 ne faute jamais » mais « les
réserves sont SÉPARÉES » : elle lit donc D3 à l'instant EXACT où la réserve de
l'autre équipe baisse pour la première fois. **La leçon vaut pour la
prochaine : une égalité mesurée à un instant CHOISI, jamais après une
attente.**

⚠️ **L'e2e est sensible à la CHARGE DE LA MACHINE.** Lancé pendant qu'un
serveur de salons tournait déjà, il a rendu deux échecs — `[001] match_end
reçu sans leave forcé` et `[005] CHLOE éliminée par timeouts` — puis 110/110
dès le serveur arrêté. Ses clients jugent des délais réels : un autre
processus qui mange le CPU produit de faux échecs. **Le lancer seul.**

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

### Pool par salon — fait, et re-mesuré sur le fil

Voir §4. Entre claviers, les 19 consignes s'ouvrent et LA VOYELLE rentre au
pool de règles ; dès qu'un téléphone s'assoit, on retombe sur les 15 tactiles
et elle ressort. Vérifié sur le fil : salon tout-clavier, `typeLetter` tirée et
jouée, **0 mort sur 21 verdicts** — un désaccord de pool les aurait tous fait
rater, puisque les indices de pièces ne désigneraient pas les mêmes formes.

**Remesuré de bout en bout, cinq configurations, vrais clients WebSocket** :
trois PC → `clavier: true`, pool de **19**, quatre consignes clavier sortent
(`typeLetter`, `arrow`, `typeShown`, `typeFirstLetter`) · deux PC et un mobile
→ `false`, pool de **15**, aucune consigne clavier sur 80 manches · un client
**sans le champ** (version antérieure) → `false` · un mobile seul → `false`.
Les règles distribuées viennent toujours du bon pool (10 en tactile, 11 au
clavier), et LA MAIN GAUCHE reste exclue des deux.

⚠️ **Le cas qui pouvait mordre, et qui ne mord pas** : le drapeau est figé au
lancement — c'est voulu, il ne doit pas changer sous les pieds d'un match en
cours. Mais le SALON survit au match et rejoue. Mesuré : un téléphone qui entre
**pendant** une partie tout-clavier fait bien se refermer le pool au match
suivant, parce que `room.match` repasse à `null` à la fin et que le drapeau est
recalculé à chaque `start`. Aucun test ne couvrait ça — ni les unitaires, qui
construisent un `MatchLogic` à la main, ni l'e2e, dont le salon mixte n'était
jamais rejoué. C'est maintenant l'assertion e2e n°34, éprouvée en mettant la
décision en cache sur le salon : elle tombe.

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

### Trois essais sur le run du jour

Réclamé par les joueurs, mais retenu pour une raison qu'ils n'avaient pas
donnée : le **PREMIER** run d'un joueur a une médiane de **4 manches**, et la
moitié de ces morts sont des dépassements de temps. À un essai par jour, toute
la relation d'un nouveau venu au run du jour était donc un échec à quatre
manches, sans recours avant le lendemain.

**Ce qui se compare ne change pas** : tout le monde en a trois, et c'est le
MEILLEUR qui compte.

⚠️ **`DAILY_ESSAIS` n'entre PAS dans `VERSION_CONTENU`**, et c'est délibéré. La
clé de comparabilité du run du jour porte déjà le JOUR : le classement d'hier
garde donc le sien, et celui d'aujourd'hui est uniforme puisque tout le monde
reçoit le même déploiement. L'y ajouter invaliderait en prime tous les records
d'entraînement et d'escalade, que ce réglage ne concerne pas.

⚠️ **Le score du jour était une AFFECTATION.** `st.daily = { …, score: end.score }`
écrasait : un second essai raté aurait effacé un bon premier. C'est désormais un
MAXIMUM — la même loi que le carnet et que la fusion des comptes. Et surtout, le
SERVEUR faisait déjà ça (`posePerf` améliore, ne remplace pas) : garder le
dernier aurait fait afficher à la carte SOLO un chiffre différent de celui du
classement, pour le même joueur et le même jour.

**La série ne triple pas** : `touchStreak` sort sans rien faire quand `lastDay`
est déjà aujourd'hui. Elle était idempotente par construction, vérifié avant de
s'y fier.

⚠️ **`essais` est arrivé après, donc absent des sauvegardes écrites.**
`essaisDuJour` retombe sur `played` : un joueur qui avait déjà fait son run reste
à un essai consommé. Sans ce repli, le déploiement aurait rendu trois essais
neufs à tous ceux déjà venus — un avantage sur ceux qui jouent après, et sur le
seul mode dont les résultats se comparent.

La formule est extraite en `majJour`, pour la même raison que `majCarnet` : une
formule écrite deux fois — une en production, une dans un test — finit par
diverger, et seule celle de production tourne.

### Le classement du jour — fait, jamais vu par un joueur

Livré parce que ce n'était plus une demande de joueurs contents : c'est le
TICKET d'un playtest sur un gros serveur, et la distribution est la ressource
que Pierre ne peut pas fabriquer.

**L'inventaire était déjà là**, et c'est ce qui a rendu le chantier court :
`api/perf.ts` remplissait la table en exigeant un jeton et en rejouant le run,
la colonne `verifiee` existait, l'index `performance_classement (cle, valeur
desc, valeur2 asc) where verifiee` était déjà une requête de classement, et le
départage — durée croissante — était tranché. Il manquait une route de lecture
et un écran.

`GET /api/perf?a=top&jour=N` rend **trois places** et, si l'appelant porte un
jeton, sa propre ligne marquée ou son rang. Trois et non dix : chaque place
publiée est une place qui vaut d'être forgée.

⚠️ **Le jeton est FACULTATIF en lecture.** Le podium se regarde sans compte,
comme le jeu se joue sans compte (n°12) : un jeton absent, faux ou périmé rend
un classement anonyme, jamais une erreur.

⚠️ **Trois filtres, et aucun n'est décoratif.** `cle` porte la loi de
comparabilité — sans elle on mélangerait deux jours ou deux versions de
contenu. `verifiee` écarte ce que le serveur n'a pas rejoué. Et `verdict_bot`
écarte ce que l'anti-triche juge douteux : le schéma de la migration l'exigeait
en toutes lettres depuis le début (« douteux est conservé mais ne devra jamais
alimenter un classement »), et c'est le DÉPÔT qui refuse, pas l'affichage —
filtrer à l'affichage aurait laissé la porte ouverte au prochain appelant.

⚠️ **Ce qu'un classement publie est public pour toujours.** La route ne rend que
`rang`, `pseudo`, `glyphe`, `valeur`, `valeur2`, `moi` — **jamais
d'identifiant de compte**, qui permettrait de suivre quelqu'un d'un jour à
l'autre et de le relier à un salon. Un test compare la liste exacte des clés et
cherche l'identifiant dans la réponse brute ; éprouvé en le laissant fuiter, il
tombe.

**Le rang hors podium se COMPTE**, il ne se déduit pas : `rangDe` dénombre ceux
qui font strictement mieux, avec le même départage que l'index. Deux tris écrits
séparément — un en SQL, un en mémoire pour les tests — finissent par diverger,
et le symptôme serait un rang différent selon l'écran ; l'ordre est donc écrit
une fois par dépôt et réutilisé.

**Le podium se TAIT plutôt que de montrer un cadre vide** : déploiement sans
comptes, réseau coupé, ou personne qui n'a encore joué aujourd'hui. Un tableau
vide se lirait comme un chargement raté, et le joueur n'a rien à réparer.

⚠️ **La limite de fond n'a pas bougé** : `verifyRun` prouve qu'un journal est
COHÉRENT, pas qu'un humain l'a produit. Ce qui borne le mal, c'est la forme
QUOTIDIENNE — une graine ne vaut d'être forgée que 24 h — et la contrainte
d'unicité de la table, qui impose une soumission par compte et par jour. Un
classement permanent n'aurait aucune de ces deux bornes.

**Pas de classement PERMANENT, et c'est délibéré.** L'index `performance_classement`
existe, la clé de comparabilité existe, aucune route ne rend les performances
de quelqu'un d'autre. Ce qu'il faut regarder d'abord, ce sont les trois
événements `compte_invite` → `compte_start` → `compte_lie` : les testeurs ont
RÉCLAMÉ les comptes, ce qui n'est pas la même chose que les utiliser — le
partage de score aussi était réclamé, et il est resté à 0 %.

### La barre du haut : trois zones, l'enseigne au milieu

Demandé par Pierre : réglages à gauche, compte à droite, signe au centre.

`.topbar__row` est passée de `space-between` à une **grille `1fr auto 1fr`**,
et ce n'est pas cosmétique : COMPTE est masqué tant que le déploiement n'est
pas configuré, MENU l'était sur l'accueil (retiré depuis, 01/10), et en flex
chaque disparition déplaçait l'enseigne. C'est exactement le défaut que l'ancien commentaire du
CSS décrivait (« deux bords occupés valent mieux qu'un centre exact »). La
grille rend la question sans objet.

⚠️ **Le HUD de jeu se peignait par-dessous.** Rapporté par Pierre : une barre
horizontale pleine largeur sous le bandeau, au niveau de FR/EN. `#band`,
`#head` et `#foot` vivent dans `#app`, à côté des écrans qui les recouvrent —
la plupart sont transparents, mais ces trois-là PEIGNENT (fond, bordure basse,
barre encadrée, filet haut). Masqués sur `#app.has-topbar`, qui marque
exactement les écrans de menu.

⚠️ **En `visibility`, jamais en `display`.** Les retirer du flux ferait remonter
`#stage`, donc redimensionner le canvas, donc changer `fieldRect()` — et la
taille du champ EST du gameplay (n°10). Vérifié : canvas à y=155, h=616, buffer
746×1232, identiques avant/après et identiques entre menu et partie.

Mesuré, animations coupées : centre du bandeau **267** = centre du signe
**267**, sur l'accueil comme sur SOLO, et `elementFromPoint` au centre rend
bien `topbar__mark`. À 375 px avec les QUATRE éléments visibles :
RÉGLAGES [13–95] · MENU [105–157] · signe [167–209] centré sur 188 = centre
exact · COMPTE [295–362]. Aucun chevauchement, aucun débordement horizontal,
44 px de haut partout.

### Deux langues — et pourquoi ce n'était pas un confort

Trois playtesters anglophones sur trois ont abandonné, et **aucun ne parlait
de traduction manquante — ils parlaient de TEMPS** :

> « the text on the top bar only loaded halfway through my time to complete
> the action » · « waiting to translate and then clicking, I was always
> running out of time »

La cause est structurelle, pas une lenteur : la consigne mute à **chaque
manche**, Chrome retraduit les nœuds mutés de façon **asynchrone**, et la
fenêtre de décision fait 760 à 1500 ms. Le texte arrivait donc après une bonne
partie de la fenêtre, à chaque manche. Aucune optimisation n'aurait réglé ça.

**Le moteur ne rend plus une phrase, il rend une `Phrase` structurée** — un
verbe et ses opérandes — et l'affichage compose. L'ordre des mots change entre
les langues (« CLIQUE LE CARRÉ ROUGE » → « CLICK THE RED SQUARE »), ce qu'une
table de mot à mot ne sait pas faire.

`text` reste le **français canonique** : LE MENTEUR compare des textes pour
emprunter une phrase plausible. `tests/consignes.test.ts` exige que composer
la phrase en français redonne EXACTEMENT `text`, sur 760 tirages.

⚠️ **Une consigne changeait ce qui est JUGÉ.** « TAPE L'INITIALE DE LA
COULEUR » attend la première lettre du nom français : V pour VERT, J pour
JAUNE. Un anglophone tape G et Y et échoue une manche sur deux. Les trois
issues étaient : exclure la consigne du pool anglais (le run du jour ne serait
plus identique pour tous, décision n°11), faire dépendre le jugement de la
langue (client et serveur divergeraient — le défaut fatal), ou **accepter les
deux lettres pour tout le monde**. C'est `Want.keyAlt`, et son coût est assumé :
sur VERT et JAUNE, deux lettres passent au lieu d'une.

**La langue suit le navigateur à la première visite.** Le défaut était « fr »
pour tous : un anglophone atterrissait en français, Chrome proposait de
traduire, il acceptait — et on retombait dans la panne. Traduire sans corriger
ça n'aurait servi à rien.

#### Le multijoueur et les motifs de mort — la seconde moitié du chantier

Le premier passage n'avait traduit que le solo. Signalé par Pierre, captures à
l'appui : la kill-cam disait « LE TEMPS EST ÉCOULÉ », le salon « 1 / 10
JOUEURS · HÔTE · DÉCOUV. · CHACUN », le brief de règle du multi restait
français, et les six émotes aussi.

**Ce qui a changé structurellement, et qui vaut pour la suite :**

- **Les motifs de mort ont quitté le clair** (`src/engine/motifs.ts`). Ils
  naissaient en dur dans `resolve.ts` et dans les `judge` des règles — donc
  dans le moteur PUR — et voyagent sur le fil dans `verdict.reason`. Ils sont
  maintenant une table indexée par `MotifId`, ce qui rend la table anglaise
  **impossible à laisser incomplète** (`Record<MotifId, string>` ne compile
  pas sinon). La traduction est un dernier geste d'affichage : **le protocole
  n'a pas bougé et le serveur de salons ignore toujours les langues.**
- **`render/seat.ts` rend un IDENTIFIANT, plus une phrase.** Son test y gagne :
  il dit quelle branche de la priorité a gagné, pas à quoi ressemblait le
  français.
- **`data-i18n-ph` et `data-i18n-aria`** : `textContent` n'atteint ni un
  `placeholder` ni un `aria-label`, et un balayage du DOM ne les voit pas.
  C'est pour cette seule raison que « TON NOM » — le premier champ que remplit
  quelqu'un arrivé par un lien d'invitation — était resté français.

**Quatre défauts trouvés en JOUANT, aucun en relisant** :

- les six émotes restaient françaises : `createMulti()` s'exécute pendant
  l'évaluation du module, donc AVANT que `renderHome()` n'ait posé la langue
  enregistrée. Tout ce que le multi peint à l'initialisation le fait en
  français. D'où `multi.onLangue()`, appelée une fois au démarrage et à chaque
  bascule ;
- `renderHome()` posait la langue APRÈS ses appels au HUD : l'intitulé du pied
  affichait « BEST » une fois passé en français, et « RECORD » une fois passé
  en anglais — **un cran de retard à chaque bascule** ;
- le **fil des chutes** écrivait `v.reason` tel quel : le bandeau disait « YOU
  CLICKED EMPTY SPACE » pendant que le fil, trois lignes plus bas, disait « TU
  AS CLIQUÉ DANS LE VIDE » pour la même mort ;
- ⚠️ **l'anglais met le pluriel à ZÉRO, le français le singulier.** Écrire
  `n > 1` — le réflexe quand on recopie la ligne française juste au-dessus —
  donne « 0 ROUND » et « 0 LIFE ». C'est le cas le plus FRÉQUENT de l'écran de
  fin. Un test lit la source de la table anglaise et refuse tout `n > 1`.

⚠️ **Le cliquet est devenu une LISTE.** Il figeait un nombre (23 et 34) et
refusait qu'il remonte : c'était le bon outil pour cinquante oublis. Il n'en
reste que **trois**, tous nommés avec leur raison dans `tests/i18n.test.ts` —
`"ÉCOUL"` et `"RÈGLE"` (clés de tri de `stampForReason`, qui **doivent** rester
sur le français puisque c'est lui qui voyage sur le fil) et `"déconnecté"` (un
jeton de protocole). Un nombre laisserait passer une chaîne nouvelle dès qu'une
ancienne partirait, et surtout ne dirait pas pourquoi celles-là restent.

#### Les noms de règles ont fini par passer eux aussi

Ils étaient le dernier îlot français, sur un argument juste : c'est un NOM, et
c'est l'**identifiant** — jamais le nom — qui est la clé du carnet, des
performances et de la comparabilité.

**Vérifié avant de changer d'avis**, parce que c'est ce qui rendait la décision
possible : `rule.name` n'est utilisé nulle part ailleurs qu'à l'affichage,
`calculeVersion` ne hache que `id` / `minLevel` / `weight` / `touch`, le fil ne
transporte que `ruleId`, et toute la télémétrie envoie `rule.id`. Traduire le
nom ne change **rien de mesurable**. Un test refuse désormais toute indexation
par le nom (`[x.name]`, `rule: x.name`) — c'est ce qui empêche qu'on le
transforme en clé plus tard, ce qui couperait un carnet en deux d'un
déploiement à l'autre, en silence.

**Ce qui a fait pencher** : le nom est affiché en permanence dans le bandeau,
c'est l'ancre qu'on regarde pour se rappeler sa contrainte au milieu d'une
fenêtre de 760 ms. « LE COLOSSE » posé au-dessus d'un brief anglais devient un
intermédiaire à traduire dans sa tête, au pire moment.

⚠️ **Les noms sont choisis pour ce que la règle FAIT, pas mot à mot.** LA
POINTE → THE SPIKE (« THE POINT » veut d'abord dire l'idée) · L'ACCÉLÉRATION →
THE RUSH · LA SECONDE → THE BEAT (la règle demande d'attendre un temps) · LE
DALTONIEN → **THE INK**, le seul qui s'éloigne vraiment : nommer une règle
d'après un handicap passe mal en anglais, et ce que la règle oppose est
justement le mot à l'encre.

Une PILE d'escalade se traduit sans que le moteur connaisse de langue :
`combineRules` compose son identifiant avec des `+` (« sang+pointe »), donc
`nomDeRegle` découpe, traduit chaque part et recompose.

⚠️ Un défaut trouvé dans la foulée, et resté du premier passage : le **brief du
bandeau** — le seul brief lu PENDANT la partie — était encore français sous un
nom déjà anglais. « THE SPIKE » au-dessus de « Ne clique jamais un triangle ».

⚠️ **Reste français, et c'est écrit** : le texte mensonger du MENTEUR, et les
diagnostics d'anti-triche de `verifyRun` — qui ne sont pas de l'interface et ne
s'affichent que dans un mode masqué.

⚠️ **La limite du filet est inchangée** : il ne voit que l'ACCENT, donc « VIES
RESTANTES » lui échappe. Il n'existe pas de moyen fiable de reconnaître du
français en ASCII pur.

### L'escalade est la même épreuve pour tout le monde — mesuré

Prérequis du classement global, et la mesure a **changé la conception**.

Je m'apprêtais à faire entrer les capacités de l'appareil dans la clé de
comparabilité : un téléphone ne tient pas ESPACE, sa pile aurait donc exclu LA
MAIN GAUCHE, et son classement se serait séparé. À 50 joueurs, ça vide un
podium.

**Sondé : `pileEscalade` ne tire JAMAIS LA MAIN GAUCHE ni LE DALTONIEN.** Elle
sert d'abord les règles piégeuses et plafonne à quatre — sur 400 graines,
**cinq règles seulement** apparaissent (colosse, gaucher, pointe, sang,
voyelle). Les deux filtres d'appareil sont inertes ici, donc aucune
fragmentation. Un test le vérifie sur 400 graines et tombera le jour où le
tirage changera.

⚠️ **Un bug grave trouvé par ce test** : le rejeu jugeait avec la règle
annoncée dans `ruleId` au lieu de la règle du PALIER. Le même journal donnait
**3 sous « sang » et 12 sous « jumeau »** — le joueur choisissait sa propre
contrainte en remplissant un champ.

`engine/escalade.ts` a quitté `game/` : `verify.ts` en a besoin côté serveur,
et le laisser dans `game/` faisait remonter persistance et quêtes dans une
fonction edge.

### Référencement — l'hygiène est faite, le canal n'existe pas

Relevé avant : `robots.txt` 404, `sitemap.xml` 404, pas de canonique, pas de
données structurées, `<title>` sans un mot-clé. Tout est corrigé et gardé par
`tests/seo.test.ts` — qui existe parce que **ces pannes-là sont muettes** :
un `Disallow: /` de trop et le site disparaît sans que rien ne casse. J'ai
d'ailleurs écrit `sitemap.org` au lieu de `sitemaps.org` en le créant.

**Mais « the one rule » est une phrase anglaise banale**, sur un domaine de
trois semaines sans lien entrant. Aucun réglage ne fera passer devant des
millions de pages. La découverte viendra d'itch.io, de Reddit et du lien de
partage — pas de Google. Le slogan **« sometimes, obeying is the mistake »**
est ce qui rend le titre cherchable, et il remplace « jusqu'où tu tiens ? »,
qui décrivait l'endurance — la partie *copiable* du jeu.

### Entraînement ciblé — fait, jamais vu par un joueur

Demandé par Pierre, et c'est la première boucle de progression du jeu : on
rencontre LE GAUCHER en multijoueur, on se fait massacrer, la règle entre au
carnet, on va la travailler seul, on revient. L'entraînement cesse d'être un
tutoriel pour devenir un outil.

**Le verrouillage est la valeur du dispositif**, pas une limite : on ne peut
pas apprendre tout le catalogue depuis l'entraînement, il faut être allé le
chercher ailleurs. C'est la même doctrine que le carnet (décision n°7), et la
grille reprend sa **barre de censure** hachurée plutôt que du texte pâle.

**Elle est REPLIÉE, et emprunte `.aide` en entier** — cadre, sommaire, chevron,
corps. Deux replis qui se ressemblent au trait près, c'est un geste à apprendre
au lieu de deux ; le CSS de `.pick` ne déclare que ce qui diffère. L'ALLURE
passe au-dessus d'elle : on règle comment on joue avant de choisir quoi.

Le sommaire porte le compteur, donc la progression reste lisible sans rien
ouvrir. ⚠️ Il est COURT (« 4 / 12 · 2 MAÎTRISÉES ») : la version longue
mesurait 156 px et se serrait contre son libellé à 375. Et le `data-i18n` est
sur la feuille DANS le `<summary>`, jamais sur le `<summary>` lui-même —
l'écrire là détruirait le compteur, le piège des cartes de l'accueil.

⚠️ **Une seule grille, pas un filtre PLUS une grille.** Le choix est unique,
donc le mécanisme doit l'être : un sélecteur de source (« rencontrées » /
« maîtrisées ») posé à côté d'une grille de règles, ce sont deux façons de
répondre à la même question. Les règles verrouillées restent VISIBLES — un
joueur du premier jour n'a qu'une règle au carnet, et une grille à un bouton se
lit comme une fonctionnalité cassée, pas comme une progression.

⚠️ **« MAÎTRISÉE » COMPTE LES PIÈGES, PAS LES MANCHES** (`game/maitrise.ts`).
C'est le point de conception, et il vient d'un chiffre : ouvrir le catalogue
d'entraînement a fait passer les règles vues de 1 à 12 et, du même coup, les
morts sur le piège de 42,9 % à **4,1 %**. S'entraîner règle par règle pousse
dans le même sens et plus fort — une règle piégeuse seule ne produit que 11 %
de manches piégeuses, et les sept règles sans `traps` en produisent zéro.
Récompenser les manches tenues récompenserait la moitié **copiable** de TOR.
D'où la condition en deux temps : avoir tenu `MANCHES_MAITRISE`, ET avoir
déjoué un piège quand la règle sait en poser.

⚠️ **UN JOUEUR NEUF NE VOIT PAS LA GRILLE.** À zéro règle rencontrée, elle est
masquée : douze barres censurées, un seul bouton actif et une ligne qui envoie
le joueur débloquer des règles ailleurs, c'était exactement la « fonctionnalité
cassée » que la grille visible devait éviter — et la ligne MENTAIT, puisque
c'est l'entraînement lui-même qui débloque, en jouant. Le seuil est UN : dès
qu'une règle est au carnet, choisir « celle que je viens de me prendre » est la
boucle. Signalé par Pierre, trouvé en effaçant la sauvegarde.

⚠️ **Le seuil compte les JOUABLES ICI, le compteur compte les RENCONTRÉES** —
deux questions, deux nombres. Les confondre affichait « 3 DÉCOUVERTES ·
3 MAÎTRISÉES » avec quatre règles au carnet, et pouvait donner plus de
maîtrisées que de découvertes. Le cas se produit dès qu'un compte est branché :
LA MAIN GAUCHE rencontrée sur un PC descend sur le téléphone, où elle est
verrouillée.

⚠️ `MANCHES_MAITRISE = 15` est un **premier chiffre, pas une mesure** — on n'a
aucune distribution de scores en entraînement. À remesurer au premier playtest
qui en donne.

**Deux pièges payés en le construisant :**

- **Le nettoyage de `api/moi.ts` RECONSTRUIT chaque entrée de carnet**, il ne la
  recopie pas — c'est voulu, on ne fait pas confiance au client. Conséquence :
  un champ ajouté au carnet et oublié là ne casse rien et se voit seulement
  quand un joueur change d'appareil et retrouve un compteur à zéro. Trouvé par
  `tests/revendication`, pas en relisant.
- **Le compteur s'ADDITIONNE en local et se fusionne au MAXIMUM**
  (`shared/compte.ts`). Sommer deux appareils doublerait le compteur à chaque
  synchro et déclencherait « maîtrisée » tout seul. On peut sous-compter en
  changeant d'appareil, jamais gonfler — le même marché que `best`.
- La formule d'écriture était **écrite deux fois**, et seule celle de `main.ts`
  tournait vraiment sans qu'aucun test ne l'atteigne. Extraite en `majCarnet`.

### Quatre règles de plus — et le catalogue double sa capacité à piéger

Le catalogue passe de **12 à 16 règles**, et surtout de **5 à 9 règles qui
piègent**. C'était le chiffre à bouger : le piège est le seul élément non
copiable du jeu, et sept règles sur douze n'en produisaient aucun.

**Ce que la mesure demandait, et pourquoi ces quatre-là.** Quatre des cinq
règles piégeantes étaient parmi les six plus DURES (médianes 5 à 7), et ce sont
elles qu'on sert en premier aux débutants depuis le correctif du jour 3. La
seule facile était LE SANG, à 12 — parce que la couleur est le canal perceptif
le plus rapide : on VOIT rouge, on ne le cherche pas.

| Règle | Interdit | Taux de pièges |
|---|---|---|
| **L'AZUR** / THE AZURE | le bleu | 21,9 % |
| **LA ROUE** / THE CIRCLE | les ronds | 26,8 % |
| **LE SOLITAIRE** / THE LONER | une forme seule de son genre | 27,6 % |
| **LES ANGLES** / THE CORNERS | les quatre coins de la grille | 24,4 % |

⚠️ **LE SOLITAIRE a été resserré par la mesure, pas par le goût.** En version
COULEUR il atteignait **31,9 %** — et le test de calibration l'a refusé, avec
exactement le chiffre que le commentaire de `BANNED_X` donne comme mortel
(« à la moitié de l'écran, 31 % des manches devenaient "ne rien faire" et le
jeu s'éteignait »). Passé à la FORME — trois valeurs au lieu de quatre, donc
l'unicité deux fois plus rare — il tombe à 27,6 %. Il reste **près du plafond
de 28 %** : la prochaine consigne ajoutée peut l'y pousser, et c'est le test qui
le dira.

⚠️ **LES ANGLES n'est pas « le bord », et la géométrie l'impose.** Pierre
demandait une règle pensée pour le pouce. « Ne clique pas au bord » au sens
littéral couvre l'anneau extérieur de la grille 5×3, soit **12 cellules sur
15 — 80 % du terrain**, injouable. Les quatre coins font 4 cellules sur 15,
soit 27 %, la même bande calibrée que LE GAUCHER — et les angles sont
exactement là où le pouce n'arrive pas.

Son jugement porte sur la position **AU REPOS** (`ox`, `oy`), jamais sur la
position animée : une forme mobile oscille de ±22 px, ce qui ne lui fait jamais
changer de cellule (200 px), mais juger sur une valeur qui bouge rendrait le
verdict dépendant de l'instant du clic — donc l'aperçu pourrait contredire le
verdict, le seul défaut tenu pour fatal.

**`zone` est devenue une LISTE de rectangles.** LES ANGLES en demande quatre, et
une pile d'escalade peut désormais porter DEUX règles spatiales : `combineRules`
concatène donc les zones au lieu de garder la première, sinon l'une des deux
serait invisible — donc injuste. Le champ est purement décoratif (les `judge`
décident sur la géométrie), donc l'élargir ne pouvait rien changer à un verdict.

**L'escalade tire maintenant 9 règles** au lieu de 5, et toujours ni LA MAIN
GAUCHE ni LE DALTONIEN : la propriété qui compte — le tirage ne dépend pas de
l'appareil — tient, et c'est elle que le test vérifie plutôt qu'une liste de
noms.

⚠️ **Un test passait par chance, et l'ajout l'a révélé.** `tests/multi.test.ts`
exigeait `streak === 1` après une mort suivie d'une survie. Mais l'aide
`surviveAt` ouvre des manches jusqu'à en trouver une jouable et referme celles
qu'elle saute — or **se taire sur un piège EST une survie**. Le compteur peut
donc monter de plusieurs crans en un appel. L'assertion tenait uniquement à la
distribution des règles, c'est-à-dire au nombre de règles au catalogue. Encore
la famille décrite au §11.

### Le carnet est devenu une COLLECTION de cartes

Une règle, une carte. C'était une liste de lignes ; une liste se consulte, une
collection se COMPLÈTE — et c'est la seule chose réclamée par les joueurs qui
manquait vraiment : mesuré, les pièces ne s'achètent rien et 15 % seulement des
joueurs valident une quête.

⚠️ **L'ILLUSTRATION EST ENGENDRÉE, PAS DESSINÉE.** Pierre demandait des cartes
« comme Genshin », en cherchant des bibliothèques d'images. TOR n'a aucune
illustration et son identité l'interdit — pas de dégradé, pas d'arrondi, angles
droits (n°8) — et douze dessins seraient douze fichiers à produire, licencier et
charger.

Or **chaque règle EST déjà une forme du jeu**. LE SANG interdit un carré
garance, LA ROUE un rond, LES ANGLES quatre coins hachurés — qui sont
littéralement déjà dessinés sur le terrain. L'emblème est donc une petite scène
faite des MÊMES primitives, en SVG inline : zéro fichier, zéro licence,
impossible d'être hors-marque, et ça dit exactement ce que la règle interdit.
Ajouter une règle, c'est ajouter quatre lignes de données, pas commander une
image.

**La grammaire est constante, et testée** : ce qui est BARRÉ d'une croix est ce
que la règle interdit, ce qui est PÂLE n'est là que pour la comparaison, une
BANDE hachurée est une zone. Un joueur qui a vu deux cartes sait lire la
troisième. Les déformations — LE JUMEAU, L'ACCÉLÉRATION — n'ont ni croix ni
bande, ce qui les distingue à l'œil des neuf règles qui piègent.

⚠️ **Une carte verrouillée ne laisse RIEN fuiter dans le DOM.** La censure
REMPLACE la scène, elle ne la couvre pas : un emblème caché sous un voile se
lirait en ouvrant l'inspecteur, et tout le catalogue avec — la décision n°7
tenue jusque dans le HTML. Éprouvé en voilant au lieu de remplacer : le test
tombe.

**L'enveloppe des emblèmes est vérifiée forme par forme** — un rond tient dans
son rayon, un triangle monte à 1,15 r et s'étale à 1,1 r, une pièce barrée porte
sa croix jusqu'à 1,35 r. LE COLOSSE débordait à 105,75 dans un cadre de 100 ;
trouvé par le test, pas à l'œil.

`Apparence.carte` reste le point d'accroche : le jour où un habillage se
possède, il remplacera les trois déclarations d'état du CSS et rien d'autre.

### La nuit d'audit — quatre correctifs, jamais vus par un joueur

Pierre a rapporté cinq points après un playtest, puis est allé se coucher.
L'audit complet est publié à part ; ce qui suit est ce qui ne se déduit pas du
code.

⚠️ **`VERSION_CONTENU` n'a PAS bougé** (`hdblrb`), vérifié par diff sur ses
entrées. Le classement et les records survivent au déploiement. L'allure n'y
entre pas : elle vit dans le *régime* de `cleEntrainement`, donc chaque allure a
déjà sa propre clé — c'est ce qui rend l'ajout d'une quatrième inoffensif.

**Le run du jour ne se validait jamais — régression du lot précédent.** En
passant à trois essais, tout l'écran s'est mis à dépendre de `restants === 0`
et l'état TERMINÉ a disparu de la priorité : un run bouclé 40/40 affichait
« 2 ESSAIS RESTANTS ». La priorité est sortie dans **`render/jour.ts`**, pur,
qui rend un IDENTIFIANT et non une phrase — troisième fois que ce projet paie
une priorité en ternaires successifs, après `plate.ts` et `seat.ts`. TERMINÉ
prime sur tout ; le run reste rejouable tant qu'il reste des essais.

**Le solo n'avait aucun temps de lecture : mesuré à 50 ms** entre COMMENCER et
la première consigne. Le brief s'affichait pourtant bien — vérifié avant de
conclure, et c'est pour ça que « il ne voit plus sa règle » était trompeur.
`game/lecture.ts` : **3000 ms** sur une règle jamais rencontrée, **1200 ms** sur
une règle au carnet. Le joueur reste sur le BRIEF, le bouton porte le rebours.

⚠️ **Le battement est porté par la BOUCLE DE JEU, pas par un `setTimeout`** —
et ce n'est pas un goût. `smoke.test.ts` déroule des frames à la main et ne
verrait jamais une minuterie : le correctif serait non testé sur le chemin le
plus chaud du jeu. Et une minuterie courrait sur un onglet qui ne compose pas.
La `Session` n'est construite qu'au terme, donc `verifyRun` voit exactement ce
qu'il voyait avant.

⚠️ **Trois branches du battement, toutes trouvées à la main, aucune par un
test :**

- une règle à MAINTIEN relâchée pendant le rebours entrait en partie sans
  maintien — donc mort immédiate et incompréhensible ;
- la REVANCHE d'un duel repart de l'écran de fin sans brief : le rebours courait
  sur un bouton invisible, soit une pause morte de plusieurs secondes. D'où
  `startRun(avecLecture)` ;
- **appuyer sur ESPACE pendant le rebours remplaçait le libellé du bouton par un
  chiffre, définitivement.** Le second appel relisait `bouton.textContent` pour
  mémoriser le libellé à restituer — il vaut « 3 » à cet instant. Le plus
  instructif des trois : mémoriser plutôt que recalculer était le bon choix (un
  quatrième calcul aurait divergé des trois autres) et il a ouvert une faille
  ailleurs. **Une valeur mémorisée doit l'être à un instant où l'on sait ce
  qu'elle vaut.**

`show()` annule le battement, pas le bouton RETOUR : c'est le passage obligé de
tout changement d'écran, donc ça couvre les sorties qu'on n'a pas prévues.
Vérifié : un rebours abandonné **ne consomme aucun essai** du run du jour.

**Le nom était impossible à changer, et ne rejoignait jamais le compte.** Deux
défauts : `ranked.name` n'est écrit que par l'écran d'identité du multi, donc un
joueur solo se connectait avec un pseudo **vide** (vérifié en production, le
classement rendait `pseudo: ""`) ; et **`changeIdentite` n'était appelée de
nulle part**, route serveur complète à l'appui. Du code mort qui ressemblait à
une fonctionnalité livrée — rien ne casse, rien n'avertit, la fonction se lit
parfaitement. C'est exactement ce qu'une relecture ne trouve pas.

On rouvre `#multi-id` plutôt que d'en bâtir un second : `multi.ouvreIdentite(revenir)`
prend une FONCTION et non un nom d'écran — le multi ne connaît que les siens.
Le crochet `multi.onIdentite` est posé sur la VALIDATION et non sur le bouton du
compte : le multijoueur passe par le même écran, et un nom changé avant d'entrer
dans un salon doit suivre pareil.

**Une quatrième allure, plus lente que toutes.** Mesuré : un débutant a besoin
d'environ 1100 ms, et à 1.5 la manche 39 en donne **1140** — quarante
millisecondes de marge, sur une seule action. Ce n'est pas une marge, c'est une
coïncidence. D'où **DÉBUT (2.0)**, nouveau défaut d'un joueur neuf. Rien n'a
été retiré : Pierre proposait de faire de NORMAL le plus dur, mais ce que la
mesure demande est qu'un joueur neuf ne le RENCONTRE plus par défaut.

⚠️ **La barre des allures se replie en 2×2 à 375 px.** Quatre segments réclament
~336 px, la colonne du brief en offre 250. Largeurs 84–110 px, hauteurs 66 px,
aucun débordement : le plancher `max-content` fait son travail plutôt que
d'écraser un segment. C'est la bonne réponse, mais c'est un changement visuel
que personne n'a encore vu.

**Le run du jour reste à 1.0 pour tout le monde**, et aucune allure ne s'y
applique (décision n°11). Trois leviers existent — `GRACE_ROUNDS` 3→5,
adoucir `windowMs`, ou ne rien faire — et **la recommandation est de ne rien
faire** : trois correctifs viennent d'atterrir sur ce problème, un quatrième
rendrait le relevé illisible.

**La preuve d'usage n'a pas été faite, délibérément.** Un compteur cumulé est
impossible — la collecte écrit dans des listes Redis à TTL, donc aucun cumul
historique n'est récupérable et le compteur repartirait de zéro. Un « N joueurs
en ce moment » dirait 0. **Le podium existe déjà et se tait quand il est vide**,
mais il ne paraît que sur l'écran de FIN après un run du jour — donc les trois
joueurs sur quatre qui ne jouent jamais ne le voient jamais. Le porter sur SOLO
est le levier ; c'est une direction, elle appartient à Pierre.

### La bascule produit — comprendre avant d'agrandir

Pierre a fixé un ordre après le déploiement : comprendre les joueurs engagés,
réparer l'entrée, donner une raison de jouer, puis Training + Cards + Mastery,
puis mesurer D1 — et **seulement ensuite** ranked, saisons, économie, skins. Sa
règle : « quel problème joueur cette feature résout-elle ? Si la réponse est
"ça serait cool" → ne pas la développer maintenant. »

Trois phases livrées. Ce qui suit est ce qui ne se déduit pas du code.

#### La mesure d'abord, parce qu'un « avant » ne se rattrape pas

`scripts/report.mjs` gagne l'ENTONNOIR D'ENTRÉE et la DISTRIBUTION PAR PALIERS.
Le chiffre qui commande tout — 106 joueurs sur 139 qui n'ont jamais lancé une
partie — n'était calculé nulle part : il avait été obtenu à la main sur un
export, donc impossible de dire si un correctif l'avait déplacé.

⚠️ **Deux crans, deux réparations différentes.** « N'a jamais cliqué sur JOUER »
est un problème de page d'accueil ; « a lancé une fois et jamais deux » est un
problème d'onboarding. Les confondre ferait travailler sur le mauvais.

On compte les runs **lancés** (`run_start`) et non terminés : `run_end` rate
celui qui ferme l'onglet en pleine partie, or c'est justement la population
qu'on cherche. Aucun événement nouveau — `first_open` et `run_start` existaient
déjà, le rapport lit autrement ce qui était écrit.

#### La première arrivée — le PIÈGE est la colonne vertébrale

Rapporté par Pierre : ses camarades ont adoré sans comprendre, et il était à
côté pour expliquer. Six temps (`src/game/onboarding.ts`), aucun chrono avant le
cinquième.

⚠️ **Ce qu'il faut enseigner en premier n'est pas ce qu'on croit.** Lire, viser,
cliquer : n'importe quel joueur le devine. Ce qui ne se devine pas, c'est qu'il
faut parfois DÉSOBÉIR — et la densité de manches piégeuses du catalogue est de
**5,4 %**, donc un nouveau venu peut faire vingt manches sans jamais rencontrer
ce qui distingue TOR. D'où : le temps 2 pose les deux cas, le temps 5 EST un
piège, le temps 6 dit « c'est exactement ça, le jeu ».

⚠️ **Le tutoriel ne passe pas par `Session`**, mais construit de vraies `Round`
et se joue sur le VRAI terrain (`show(null)`, vrai canvas, vrai `scene.hit()`).
Un tutoriel qui simule le jeu enseigne un jeu qui n'existe pas. L'aide est un
calque HORS FLUX dans `#stage` — vérifié : `#stage` à 246 et buffer 481×246,
identiques entre tutoriel et partie.

⚠️ **Il n'est PAS déclenché à l'arrivée sur le site**, mais par les portes de
jeu. Le joueur doit avoir choisi de jouer : un tutoriel imposé avant qu'on ait
vu de quoi il s'agit reproduirait la faute du bandeau de mesure. L'accueil
vend, la première partie enseigne.

⚠️ **Deux conditions pour « nouveau », pas une.** `onboarded` est absent des
sauvegardes écrites, donc faux pour tout le monde ; sans la seconde condition
(carnet vide), le déploiement renverrait tous les habitués au tutoriel. Même
piège que `essais`.

**Rien ne tue, et l'erreur est NOMMÉE** : cliquer le rouge rend « TA RÈGLE
INTERDIT LE ROUGE », pas « raté ». Survivre au piège écrit `sang` au carnet —
on ne LIT pas sa première carte, on la GAGNE.

#### L'objectif de l'accueil — atteignable, et étiqueté

⚠️ **LE RECORD AFFICHÉ VIENT DU CLASSEMENT DU JOUR quand il répond.** Il est
vérifié (`verifyRun` a rejoué le journal), VIVANT — il change chaque jour — et
bien plus atteignable qu'un record de tous les temps. C'est ce qui règle
l'objection d'origine : montrer 201 à quelqu'un dont le premier run fait 4
manches en médiane, c'est un mur ; un score du jour est à sa portée.

⚠️ **Le 201 n'est PAS un record de run du jour et ne doit JAMAIS être étiqueté
comme tel** — il a été fait en entraînement, à une allure choisie, sur une règle
choisie. Il sert de repli quand le classement se tait (comptes non configurés,
réseau coupé, personne n'a encore joué), et il porte alors « ENTRAÎNEMENT ». Un
test refuse explicitement l'étiquette « jour » sur lui.

Le mode est affiché dans les DEUX cas, sur sa propre ligne. Et le jeu ne dit
jamais à quelqu'un qu'il est moins bon que ce qu'il fait : à 240 contre 201, la
ligne devient « tu fais mieux que ça ».

⚠️ **Un score sans son mode est un chiffre faux.** Le 201 a été fait en
ENTRAÎNEMENT ; le poser nu près du run du jour comparerait deux épreuves. Voir
`src/render/but.ts`, quatrième module de priorité pure après `plate`, `seat` et
`jour`.

⚠️ **LA MESURE A CHANGÉ L'IMPLÉMENTATION.** Premier essai, un bloc ajouté :
relevé à 375×812, la faille finissait déjà à **818 pour 812 de haut** — six
pixels — et le bloc la poussait à **954**, soit la moitié basse de MULTI sous la
ligne de flottaison. L'accueil est à la limite au pixel près : **toute addition
le casse**. L'objectif PREND donc la place du chapo, et la faille revient à
**815**, mieux qu'avant. L'échange est aussi le bon geste : un nouveau venu a
besoin qu'on lui dise ce qu'EST le jeu, un habitué a besoin de son chiffre.

⚠️ **`inscritRecord` n'était appelée de NULLE PART** — `s.records` n'était rempli
que par une fusion de compte. Sans conséquence jusqu'à ce que DÉBUT devienne
l'allure par défaut : `bestTraining` ne s'écrit qu'à l'allure de référence, donc
un débutant n'avait aucun record nulle part. Chaque allure inscrit désormais le
sien, et `recordDeSonAllure` lit celle du joueur. Deuxième code mort de la
semaine qui ressemblait à une fonctionnalité livrée, après `changeIdentite`.

`MEILLEUR_CONNU` est une **mesure gelée**, relevée à la main : aucune route ne
la sert, et la table `performance` ne contient que des runs du jour. Elle
disparaîtra le jour où une route saura la servir.

#### Ce que le redesign apporte, et ce qu'il faut en écarter

Pierre a fourni une maquette travaillée avec un UX designer : 27 écrans, les
notes citent le code, la palette relevée est celle du dépôt au hexadécimal près.

⚠️ **Le zip contient DEUX systèmes qui se contredisent.** `_ds/nocturne-.../`
est du boilerplate d'outil — rayons de 8 px, icônes Phosphor, photographies,
Inter pour les deux rôles. L'écran SYSTÈME de la maquette dit l'inverse et c'est
lui qui a raison : `border-radius` n'y apparaît que **7 fois, toutes en 50 %**
pour des cercles. **Ne jamais lier `_ds/styles.css`** — il casserait la décision
n°8 en une ligne.

Deux corrections à la maquette : elle annonce « onze règles sur seize ne piègent
pas » — ce sont **sept** (9 portent `traps`) ; et son échelle de maîtrise est
juste, mais elle contredit le « GAUCHER 72 % » demandé par Pierre — six cases
nommées valent mieux qu'un pourcentage, parce qu'une case se joue et pas un
thermomètre.

**Tranché par Pierre : on applique la maquette, sans discuter l'identité.**
Les 16 PNG remplacent les emblèmes engendrés — le coût reste écrit : une 17ᵉ
règle demandera une commande graphique là où elle demandait quatre lignes de
données, et elles introduisent un personnage dans un jeu qui n'en avait aucun.

#### L'écran de jeu, et l'échelle à six cases

**Les VIES montent dans le bandeau**, contre la règle : les deux décident
ensemble d'une manche, et le pied ne garde que ce qu'on consulte ENTRE deux
manches. Elles se posent dans la troisième piste de la grille `auto 1fr auto`,
qui portait déjà `band__meta` — le bandeau ne grandit pas d'un pixel.

**La consigne dit combien de GESTES elle demande.** `windowForSteps` ajoutait
déjà 280 ms par geste supplémentaire, mais rien ne le DISAIT : sous LE JUMEAU on
découvrait qu'il en fallait deux en ratant le premier.

⚠️ **Mesure qui a changé l'implémentation** : un bloc à part sous `#sub` coûtait
`#head` 99 → 120 et le terrain **616 → 595 px**. La ligne est donc FUSIONNÉE
avec `#sub` (« N'IMPORTE OÙ · 2 GESTES »), ce que fait d'ailleurs la maquette.
Remesuré à 616 et buffer 746×1232, identiques à la référence.

⚠️ **Le bouton PRIMAIRE garde son aplat** — j'avais mal lu la maquette et
annoncé le contraire. Il gagne une ombre décalée d'un module sans flou ; c'est
la variante **LANCEMENT** qui prend le cadre d'accent (fond 12 %, bordure 4 px).
Le `.btn` de base était déjà exactement le SECONDAIRE de la maquette.

**L'échelle de maîtrise** (`src/game/echelle.ts`) : rencontrée · éprouvée · 15
manches à chacune des trois allures · un run sans faute. Six cases nommées et
**jamais un pourcentage** — Pierre demandait « 72 % », sa maquette dit l'inverse
et elle a raison : un pourcentage est un thermomètre, une case est une liste de
courses.

⚠️ **La case ÉPROUVÉE est REMPLACÉE, jamais offerte.** Sept règles sur seize ne
piègent pas (neuf le font — la maquette annonce onze, c'est faux). Leur donner
la case rendrait leur carte maîtrisée à meilleur compte ; elles doivent donc une
série de dix manches consécutives sans faute. La maquette voulait mieux — une
condition sur mesure par règle — et ça demande une instrumentation par règle
dans le moteur, donc une mesure avant.

⚠️ **Rien n'a été ajouté au moteur** : tout se lit dans les marques qu'il
produisait déjà (🟩 🟦 🟨 🟥). Une progression qui instrumente le chemin chaud se
paie à chaque manche.

⚠️ **`estMaitrisee` ne change PAS de sens** : elle décide de ce que le carnet
compte et de ce que l'entraînement ciblé déverrouille. La durcir de trois
allures d'un coup ferait reculer tous les compteurs de tous les joueurs le jour
du déploiement, sur un seuil déjà non mesuré.

⚠️ **Trois champs neufs sur `RuleRecord`** — `parAllure`, `serie`, `sansFaute` —
branchés aux TROIS bouts : `majCarnet`, `fusionne`, et le nettoyage de
`api/moi.ts` qui RECONSTRUIT chaque entrée. Ils ne s'écrivent que s'ils portent
quelque chose : « absent vaut zéro » est la doctrine du carnet, et c'est un test
existant qui l'a rappelé.

⚠️ **Une carte verrouillée ne charge AUCUNE image.** Mesuré : trois requêtes
pour trois règles débloquées, zéro pour les treize autres. La décision n°7
tenait dans le DOM ; elle tient maintenant dans le trafic.

#### La fiche de carte, et deux données qu'il fallait mesurer

`#fiche` rend la maîtrise ACTIONNABLE : les six cases avec leur état, **une
seule phrase** (celle de la première case non franchie — six choses à faire ne
se retiennent pas, une seule se fait), et un bouton qui pose l'allure ET la
règle avant d'ouvrir le brief. C'est ce bouton qui ferme la boucle ; sans lui la
fiche serait un tableau de bord.

**La FAMILLE est dérivée, jamais déclarée** (`src/game/famille.ts`) : `traps` →
INTERDIT (9), `transform` → DÉFORMATION (5), le reste → CONTRAINTE (2 — LA MAIN
GAUCHE tient une touche, LA SECONDE interdit d'agir trop tôt). Un champ posé à
la main se serait désynchronisé du comportement à la première règle ajoutée.

⚠️ **Le TAUX DE PIÈGE de la maquette est FAUX pour le catalogue actuel** : elle
annonce 15,9 % pour LE SANG, 13,8 % pour LE GAUCHER, 20,1 % pour LA POINTE.
Mesuré avec `buildRound` sur 120 runs × 45 niveaux — le protocole du test
d'équilibrage — c'est **21,8 · 19,6 · 26,4**. Les quatre règles ajoutées depuis
ont changé la distribution des consignes. La table est gelée (la recalculer à
l'affichage coûterait 5400 manches par règle) et **gardée par un test qui refait
la mesure** : il tombera le jour où une pondération changera.

⚠️ **Trois libellés ont encore débordé** : « MEILLEURE SÉRIE » et « PIÈGES
DÉJOUÉS » réclamaient 396 px pour 325 à 375 px. Raccourcis en SÉRIE et PIÈGES,
plus `flex-wrap`. C'est la troisième fois que ce projet paie un libellé long
dans une barre segmentée — après le sommaire de l'entraînement et la barre des
allures. **Le remède est toujours le même : raccourcir le mot, pas la barre.**

**La collection vide** montrait seize barres hachurées sans rien d'ouvrable —
un mur, pas une collection. Une phrase la retourne en invitation, et elle dit
vrai : une carte se débloque en JOUANT.

**Quatre par rangée à 1280** : `.screen__scroll` plafonne à une colonne de
LECTURE, juste partout sauf pour une grille. Mesuré 560 px et 3 cartes ;
débridé à 780 au-delà de 900 px → 4 cartes. Le téléphone ne bouge pas.

#### La salle de travail, et le desktop

⚠️ **UNE SEULE GRILLE, PAS UN FILTRE PLUS UNE GRILLE.** La maquette dessinait un
écran TRAINING séparé avec sa propre liste de règles. La collection en a déjà
une : deux façons de répondre à « quelle règle travailler ? » finissent par se
contredire. Les filtres se posent donc SUR la grille existante — c'est la même
règle que l'entraînement ciblé s'était déjà donnée.

**CELLE QUI TE RÉSISTE** : parmi les règles rencontrées et non maîtrisées, la
plus retentée (départage sur les cases franchies). C'est la seule ligne de
l'écran qui DÉSIGNE un exercice au lieu d'en proposer seize, donc le seul filet
d'accent — deux accents ne désignent plus rien. Elle ouvre la FICHE et non
l'exercice : la fiche dit ce qui manque, et c'est elle qui lance.

⚠️ **Deux seuils d'apparition** : la règle qui résiste attend DEUX runs (à un
seul, elle ferait passer une rencontre pour un échec) et les filtres attendent
deux règles rencontrées (trois boutons pour trier un élément se lisent comme une
fonctionnalité inutile). Un quatrième champ au carnet, `runs`, une somme comme
`pieges`.

⚠️ **L'ACCUEIL EN LARGE : le desktop manque de HAUTEUR, pas de largeur.**
Mesuré à 1280×860, la faille finissait à 906 pour 860 — 46 px sous la ligne.
L'enseigne et l'action passent côte à côte, la fissure reste pleine largeur, et
la faille remonte à 829, soit **31 px au-dessus** — 77 px regagnés.

⚠️ **Les rangées doivent être EXPLICITES** (`grid-row`). En placement
automatique, le trait de séparation — qui est entre les deux dans le document et
prend toute la largeur — s'intercalait et renvoyait le bouton sur une troisième
rangée.

#### La barre de navigation, et un salon qui existait déjà

**Cinq destinations, JOUER surélevée au milieu** — c'est la réponse par défaut,
elle ne doit pas se chercher. Icônes en SVG pixel `crispEdges`, pas une police :
le design system générique proposait Phosphor, et un jeu fait d'angles droits ne
charge pas une police de glyphes arrondis pour cinq formes de quatre rectangles.

⚠️ **En ABSOLU dans `#app`, donc hors flux.** Elle ne paraît que sur les écrans
de menu, jamais sur le jeu. Mesuré : `#stage` à 616 et buffer 746×1232 en
partie, identiques à la référence.

⚠️ **UN SEUL JOUER, et c'est celui de la barre.** L'accueil en portait un au
milieu de la page ; deux boutons du même nom à 300 px l'un de l'autre, ce n'est
pas une insistance, c'est une hésitation. Celui de la barre gagne parce qu'il
est PARTOUT. Sa disparition rend 74 px, et **l'accueil tient enfin sans
défiler** : la faille finit à 719 pour 812, la barre occupe 729-812. Elle
finissait à 818 avant l'objectif, 822 après.

Conséquence : l'accueil en large redevient UNE colonne — le partage
enseigne/bouton n'a plus rien à porter à droite.

⚠️ **UNE MESURE DE BOÎTES NE VOIT PAS TOUT.** « TA RÈGLE T'ATTEND » demande
~90 px dans une colonne de 82. En `nowrap`, la BOÎTE restait dans sa colonne —
relevée de 149 à 231, aucun chevauchement — mais le TEXTE peignait par-dessus
les libellés voisins. Le relevé disait « rien à signaler », l'écran disait
l'inverse. Il faut mesurer la largeur du TEXTE
(`Range.getBoundingClientRect`), pas celle de son élément.

⚠️ **LE SALON EN TROIS BANDES EXISTAIT DÉJÀ**, et j'ai failli le reconstruire.
Mesuré avec un vrai salon à 1280 : ce qu'on décide (x=25, 360 px), qui est là
(x=437, 511 px), ce qu'on se dit (x=972, 307 px, pleine hauteur). C'est le
piège du §2 — *les documents mentent* — et il vaut aussi pour la maquette :
plusieurs de ses écrans desktop décrivent du travail déjà fait. **Mesurer avant
de refaire.**

#### Les retours de manche, et la fin de run

**Le piège déjoué NE PARLE PLUS — il se sent.** Une réussite ordinaire ne dit
rien et n'arrête rien ; une mort révèle le piège APRÈS (n°5). Entre les deux, le
piège déjoué est le geste que le jeu existe pour apprendre, et il a eu droit
pendant un temps à une annonce écrite : la consigne qui piégeait, et l'avancement
de la carte.

⚠️ **Cette annonce a été retirée, et c'est une leçon d'usage, pas de code.**
Elle était posée `inset: 0` dans `#stage`, donc en 46 px AU CENTRE DU TERRAIN,
pendant 1500 ms — plus longtemps qu'une fenêtre tardive (760 ms). Elle
recouvrait donc la manche suivante. Déplacée hors du champ, elle restait de
trop : *« juste un petit retour haptique suffit »*. Le joueur qui vient de NE
RIEN FAIRE sait déjà pourquoi ; lui expliquer son propre geste pendant que la
manche suivante s'ouvre, c'est occuper les deux secondes où il doit lire autre
chose.

Restent trois canaux, tous instantanés et hors du chemin de lecture : le son
`trapAvoided`, le flash violet et la secousse du canvas, et
`navigator.vibrate`. Le compteur, lui, a trouvé sa place ailleurs — sur la
ligne du bandeau (« JAMAIS DE ROUGE · 2 pièges déjoués »), où il se consulte au
lieu de s'imposer.

⚠️ **UN BUG QUE SEUL LE JEU RÉEL MONTRE.** Première version à l'écran : « la
consigne demandait NE FAIS RIEN » — absurde. Cause : **`survive()` ouvre la
manche SUIVANTE avant de rendre son verdict**, donc au moment où `react`
s'exécute, `session.round` est déjà la manche d'après. La boucle capture
maintenant la manche AVANT le `tick` et la passe à `react` — les deux appelants
corrigés, la boucle et `sendAction`. Aucune relecture n'aurait vu ça : le code
se lit juste.

**« Ce que ce run a fait avancer »** répond à la question de l'écran de fin —
*qu'est-ce que je viens de gagner ?* Le score dit ce qu'on a FAIT, pas ce qu'on
a ACQUIS.

⚠️ **La photo d'AVANT se prend DANS la mutation**, juste avant `majCarnet` :
après elle, il n'y a plus aucun moyen de savoir ce qui a bougé — la fonction
remplace l'entrée, elle ne la complète pas.

⚠️ **Les deux blocs se taisent quand ils n'ont rien à dire.** Un bloc annonçant
une progression nulle transforme un run ordinaire en échec. Et une règle NEUVE a
sa propre annonce, donc le bloc de progression se tait pour ne pas dire deux fois
la même chose.

#### La nuit des écrans — dix lots, jamais vus par un joueur

Pierre a livré seize captures de la maquette et « je te laisse les faire ».
Ce qui suit est ce qui ne se déduit pas du code.

⚠️ **`VERSION_CONTENU` n'a PAS bougé** — aucune règle, aucune pondération,
aucune constante de difficulté n'est touchée. Les records et le classement
survivent au déploiement.

⚠️ **DEUX ÉCRANS EXISTAIENT DÉJÀ, et j'ai failli les refaire.** Les cinq crans
de vitesse du salon (`SPEED_CHOICES`, de 1,7 à 0,65) et **trois des quatre
titres de match** — réflexe, flair, série. C'est le piège du §2 : *les
documents mentent*, et la maquette aussi. Mesurer avant de refaire.

**Le bug le plus instructif : une COLLISION DE CLASSE, invisible depuis des
semaines.** `.piege` était déclaré deux fois dans la feuille, à 1400 lignes
d'écart, pour deux objets sans rapport : la ligne « si une consigne enfreint ta
règle, ne fais rien » du brief et du salon, et le calque plein écran du PIÈGE
DÉJOUÉ. La seconde posait `position: absolute; inset: 0` et gagnait la cascade
— ces deux lignes de TEXTE étaient donc absolument positionnées par-dessus tout
leur écran, sans leur cadre à arête gauche. Elles avaient l'air placées par
chance, et elles l'étaient. Le calque, renommé `piegefx`, a depuis été supprimé
— voir ci-dessus — mais la leçon vaut pour toute la feuille.

⚠️ Trouvé **en ajoutant**, pas en relisant, et **le relevé de boîtes ne le
voyait pas** : trois cellules à 360-419 px et un texte qui se peint dessus sans
qu'aucun rectangle ne se chevauche. Même leçon que « TA RÈGLE T'ATTEND ».
Balayage complet de la feuille après coup : aucune autre collision de cette
forme — les autres redéclarations (`.lifedots`, `.carte__img`, les émetteurs de
la fissure) sont des raffinements voulus, adjacents et complémentaires.

**Deuxième panne muette, même famille :** `#multiLobbyCodeHint` portait « SAY IT
OUT LOUD, OR SEND THE LINK » en dur, sans `data-i18n`, et aucun code ne le
réécrivait avant qu'on copie le code — la ligne restait anglaise pour tout le
monde, pour toujours, sur l'écran où l'on dicte son code. Le filet à accents ne
pouvait pas la voir : elle est en ASCII pur. **Le filet manquant est écrit** :
`tests/i18n.test.ts` refuse tout texte du document sans `data-i18n` dont
l'identifiant n'apparaît nulle part dans les sources. Éprouvé, il tombe.

**Ce qui a été livré, et pourquoi :**

- **Le compte devient une FICHE** — signe et nom en tête, quatre chiffres, la
  collection avec sa jauge, et le run du jour séparé par un badge OPPOSABLE.
  C'est la décision n°14 rendue visible : le badge ne paraît qu'après un
  aller-retour réussi vers `classementDuJour`. Le fournisseur n'est PAS affiché
  et c'est un manque assumé — `EtatCompte` ne le porte pas, l'ajouter
  demanderait une revendication de plus dans le jeton donc de toucher le
  serveur de salons. Deviner serait pire que se taire.
- **Les réglages deviennent des lignes à conséquence écrite.** Un bouton
  « MUSIQUE : ON » dit l'état, jamais ce que ça change. ⚠️ **Un interrupteur ne
  s'écrit pas en `textContent`** — il porte deux `<i>`, l'écriture les
  détruirait : le piège des cartes de l'accueil, payé une fois de plus.
  L'ALLURE PAR DÉFAUT y entre (elle n'existait que dans le brief, introuvable),
  et **LA LANGUE DÉMÉNAGE UNE TROISIÈME FOIS** — accueil, puis barre haute,
  puis section des réglages. Effet de bord mesuré et bon : la barre haute perd
  46 px, et **l'accueil tient enfin large** (fissure à 666, pied à 752, sur
  812).
- **Une erreur propose une SORTIE.** ⚠️ Chaque message nomme les siennes, et
  seulement celles qui répondent vraiment à lui : un code inconnu offre RETAPER
  et OUVRIR LE MIEN, un salon COMPLET n'offre qu'OUVRIR LE MIEN. Un jeu
  d'issues identique partout aurait menti trois fois sur quatre.
- **La coupure se voit** — décision n°4, rendue visible. Le joueur lisait
  « RECONNEXION… » en petit pendant que la scène restait figée, ce qui
  ressemble à une expulsion. ⚠️ **Le rebours est DÉCORATIF** : le sursis
  appartient au serveur, le panneau montre ce qu'il promet et ne le décide pas.
  ⚠️ Hors flux, vérifié : canvas identique panneau affiché et caché.
- **Le pied annonce le record DÉPASSÉ en direct.** Il affichait « TON RECORD ·
  23 » pendant qu'on venait de faire 24. Même case, même hauteur, zéro pixel
  ajouté. ⚠️ Le record de référence est PHOTOGRAPHIÉ au lancement, et l'annonce
  se tait sur le run du jour (sa case dit « SUR 40 ») et sans record du tout.
- **Le mur des records** (`#classement`) — le podium quittait l'écran de fin,
  où 76 % des joueurs ne le voient jamais. Trois sources, toutes existantes :
  `vueBut`, `recordDeSonAllure`, `classementDuJour`. Le rendu du podium est
  désormais **paramétré** (`peintPodium(quoi, ecran)`) et non dupliqué.
- **La journée close n'est plus un cul-de-sac** sur SOLO. ⚠️ Le bloc ne répète
  PAS les cartes qui sont trois centimètres plus haut ; il ne porte que quelle
  règle travailler et ce qui vient demain. Il se tait si la règle du jour n'est
  pas au carnet — `ouvreFiche` la refuserait (n°7), et le cas est réel.
- **L'exercice ciblé annonce son objectif** dans la case META du bandeau, qui
  ne servait qu'à l'échauffement. Zéro pixel ajouté. ⚠️ Égalité stricte pour
  « EXERCICE VALIDÉ » : avec `>=` l'annonce reviendrait à chaque manche.
- **Deux titres de match de plus.** TÊTE BRÛLÉE célèbre la seule faute que le
  jeu existe pour produire ; SURVIVANT ne paraît que si le vainqueur est
  débutant. ⚠️ Le compte des morts-sur-sa-règle vit dans le **serveur** :
  deux clients aux fenêtres d'observation différentes décerneraient des titres
  différents sur le même écran. `PROTOCOL_VERSION` ne bouge pas — doctrine de
  `tok`.
- **Trois chiffres sur le brief du jour**, dont ÉCHAUFFEMENT : 76 morts à la
  manche 3 sur 572 runs, et rien ne prévenait avant. Ils REMPLACENT la ligne
  « 40 manches ».

**Trois lots de plus, après import du projet Claude Design** — vérifié
identique au zip : même liste de 33 fichiers, même `_ds` (`eff479c9-…`). Son
`readme.md`, jamais lu jusque-là, **confirme mot pour mot** pourquoi on ne lie
pas `_ds/styles.css` : « soft 8px radii », Inter pour les deux rôles, icônes
Phosphor, photographies, `mix-blend-mode: lighten`. Et son `_ds_manifest.json`
déclare `"components": []` — le design system ne porte AUCUN composant de TOR.
Le contenu réel est `TOR Redesign.dc.html`, et lui seul.

- **Le code de salon en quatre cases.** ⚠️ **Un seul `<input>`, transparent
  PAR-DESSUS les cases** — jamais `display: none` ni `visibility: hidden`, qui
  le rendraient infocusable et fermeraient le clavier mobile. Quatre `<input>`
  demanderaient de gérer à la main le focus, le collage, le retour arrière et
  les claviers mobiles : quatre occasions de casser la seule entrée obligatoire
  du jeu. Les cases sont un REFLET, jamais un état. ⚠️ `width: 100%` **et**
  `align-self: stretch` — le panneau est une colonne flex centrée, et sans les
  deux les cases retombent à 8 px de large (mesuré).
- **Le signe dit ce qu'il vaut** : le catalogue (`GLYPH_COUNT`, jamais un 144
  en dur) et « il survit à un changement d'appareil » — ce que la revendication
  a rendu vrai et que personne ne pouvait deviner.
- **Qui vient d'arriver** dans le salon. ⚠️ Marque transitoire, et le PREMIER
  rendu n'en pose aucune — sinon entrer dans un salon de six annoncerait six
  arrivées. `connusDuSalon` part de `null`, pas d'un ensemble vide.
- ⚠️ **« RECONNEXION… » et pas « HORS LIGNE »** — décision n°4 vue depuis le
  salon. « Hors ligne » se lit « il est parti », donc on relance sans lui.
  **Pas de rebours sur la plaque**, contrairement à la maquette : le client ne
  connaît pas l'instant où le SERVEUR a vu la coupure, donc deux écrans du même
  salon afficheraient deux chiffres différents. Le mot est vrai sans horloge.
  Vérifié au passage : **hors match, un joueur qui part est RETIRÉ** du salon
  plutôt que gardé hors ligne — le sursis est une mécanique de match.

**Ce qui n'a PAS été fait, et pourquoi — ce sont des DIRECTIONS, pas des
oublis :**

- ⚠️ **La règle du jour reste RÉVÉLÉE dans le brief.** La maquette la censure
  et la dévoile au lancement. Ça déplacerait tout le temps de lecture dans le
  battement de 3 s, donc **ça change la difficulté du seul mode dont les
  résultats se comparent**. À trancher par Pierre.
- Le mode CLASSÉ **annoncé vide** sur SOLO : un emplacement mort en permanence,
  qui contredit « le podium se tait plutôt que de montrer un cadre vide ».
- L'écran de **chargement** : le jeu ne charge aucun fichier, il mentirait. La
  seule attente réelle est celle du salon, et elle a son panneau.
- **GÂCHETTE** (réaction médiane) existe déjà sous le nom RÉFLEXE DU MATCH ; les
  renommages de la maquette n'ont pas été appliqués — un nom est choisi pour ce
  que la chose FAIT.
- Le séparateur « OU TU OUVRES » de la maquette : il remplacerait deux
  intitulés par un élément pleine largeur dans la grille du choix, et le dépôt
  a déjà payé deux fois un enfant de grille qui réordonne ses frères. Le gain
  est cosmétique, le risque ne l'est pas.

### Playtest du jour 247 — trois pannes MUETTES, et le trou qui les cachait

Rapportées de vive voix : « L'ÉCLAIR ne faisait littéralement pas apparaître
les consignes », « freeze multiple en multi », « le bouton REJOUER bug en
silence sur la run du jour ». Aucune des trois ne produisait d'erreur, de test
rouge ou de ligne de journal. **C'est la famille de pannes que ce dépôt attrape
le plus mal : elles n'échouent pas, elles annulent.**

- **L'ÉCLAIR** réglait son masquage sur `elapsedMs`, le temps de la MANCHE, qui
  n'est pas le temps où le texte a été LISIBLE. En multi, `elapsedMs` court
  depuis l'instant serveur, donc le temps de vol du message est déjà consommé à
  la première image : à 320 ms de fenêtre et 300 ms de latence, il ne reste
  rien — et ça frappe d'abord les téléphones. En kill-cam, `syncFrame` passe
  `camRound.durationMs`, toujours supérieur au seuil : la consigne du mort n'y
  paraissait JAMAIS. Le HUD porte désormais une **horloge de lecture**, locale
  et repartie à chaque manche, identifiée par la RÉFÉRENCE de l'objet (deux
  manches d'affilée peuvent porter le même texte). `resolveAction` garde
  `elapsedMs` : ce qui est jugé n'a pas bougé, décision n°3 intacte.
- **Le freeze** : `rebuildViewRound` pose délibérément `match.round = null`
  quand la règle ne se résout pas, et `syncFrame` écrivait `match.round!`. Un
  `!` affirme au compilateur ce que le code d'à côté vient d'infirmer — `tsc`
  ne peut pas le voir. TypeError à chaque image, et la panne est SILENCIEUSE
  parce que la boucle replanifie son `rAF` **avant** son corps : elle ne meurt
  pas, elle tourne à vide. Déclencheur : le passage à 16 règles, et un client
  resté sur le bundle de la veille.
- **REJOUER** : les trois essais quotidiens n'avaient été câblés qu'à moitié —
  bouton actif, fonction qui refuse. Un refus muet se lit comme un jeu cassé,
  jamais comme une règle. En le vérifiant, on a trouvé le même désaccord à
  l'envers : `navDaily` ouvrait le brief du jour à zéro essai avec un
  COMMENCER actif. **Le garde-fou appartient au point de passage commun, pas à
  chaque porte** — la prochaine porte oubliera de le poser.

**Le multijoueur n'était pas mesuré du tout**, et c'est ce qui a rendu ces bugs
introuvables : douze joueurs et quinze runs solo au rapport, pas une trace de
la soirée en salon. Cinq événements entrent (`salon_cree`, `salon_rejoint`,
`match_debut`, `match_fin`, `multi_manche_illisible`), plus
`accueil_premier_clic`. ⚠️ `api/collect.ts` porte une liste blanche qui rejette
**en silence** tout nom absent : `tests/collect.test.ts` tient les deux listes
d'accord, et il est tombé au premier essai.

**LE CHIFFRE QUI DOMINE TOUT, et qui n'est toujours pas réparé** : sur 10 jours,
**118 nouveaux visiteurs sur 159 (74 %) repartent sans lancer une seule
partie**, médiane 6 secondes, la moitié en moins de 5. Ce n'est pas la
difficulté — ils ne jouent jamais. L'onboarding ne peut rien y faire : il ne
s'ouvre qu'après un clic sur JOUER, c'est-à-dire après la marche qu'ils ne
franchissent pas. `accueil_premier_clic` existe pour dire enfin D'OÙ ils
partent ; **ne rien redessiner sur l'accueil avant de l'avoir lu.**

### L'escalier d'une règle — fait, jamais vu par un joueur (ÉCRAN RETIRÉ depuis, voir le parcours)

Demandé par Pierre, maquette à l'appui : « tu cliques sur la carte et tu arrives
sur une autre page avec des escaliers qui représentent chaque palier jusqu'à la
maîtrise … au début c'est soft et ça augmente progressivement en introduisant
les pièges … et à la fin du genre 50 en rapide pour valider la règle ».

**Vingt paliers, quatre volées de cinq.** `src/game/escalier.ts`, pur et testé.

⚠️ **IL N'INVENTE QU'UNE SEULE MÉCANIQUE.** Trois leviers existaient déjà et
étaient réglés en dur pour toujours — l'ALLURE (un réglage global choisi une
fois), la CADENCE DE PIÈGES (`FORCED_TRAP_ROUNDS`, les manches 2, 5 et 9), la
LONGUEUR (`DAILY_LENGTH` ou l'infini, sans entre-deux). L'escalier les rend
progressifs, et c'est tout. Ce que ça règle est mesuré : **538 des 572 runs
relevés sont des entraînements**, c'est-à-dire que le mode le plus pratiqué du
jeu est celui qui ne mène nulle part.

⚠️ **LE SEUL LEVIER NEUF EST L'ANNONCE DU PIÈGE, ET IL CROISE LA DÉCISION N°5.**
Aux paliers 6 à 9 le jeu dit « PIÈGE » dans la case META ; au 10 une fois sur
deux ; à partir du 11, plus jamais. La décision n°5 protège l'ÉPREUVE et n'est
levée sur AUCUN mode dont un résultat se compare — run du jour, multi, classé,
entraînement libre. L'escalier est un apprentissage, et l'échafaudage tombe au
palier 11, donc **avant** le 15 qui déclare la maîtrise : rien de comparable
n'est jamais obtenu avec l'aide. Un test refuse tout palier ≥ 15 qui annoncerait
encore.

⚠️ **UN RUN DE PALIER NOURRIT L'ESCALIER, JAMAIS CE QUI JUGE.** Il écrit `best`
et `pieges` — des faits — et rien d'autre : ni `parAllure`, ni `serie`, ni
`sansFaute` (les cases de l'échelle), ni `recent`, ni le moindre record. Sa
longueur est bornée, son allure imposée, sa cadence forcée : quinze manches là
ne prouvent pas ce que quinze manches en entraînement libre prouvent. En code,
c'est UNE ligne — `majCarnet` reçoit `undefined` au lieu de son argument `run`,
et les quatre champs se taisent d'un coup, y compris le cinquième qu'on
ajoutera un jour.

⚠️ **`VERSION_CONTENU` n'a PAS bougé** (`hdblrb`, vérifié). `buildRound` gagne un
paramètre `forcePiege` dont le DÉFAUT est l'ancienne constante, et `Session` un
`longueur` absent partout ailleurs. **Un test compare l'appel nu à l'appel qui
passe explicitement `FORCED_TRAP_ROUNDS`, sur quatre graines et huit niveaux** —
sans lui, une dérive du défaut changerait le run du jour, le multi et le rejeu
serveur en silence, et tous les scores enregistrés cesseraient d'être
comparables. Éprouvé en cassant le défaut : il tombe.

⚠️ **LA FUSION DE L'ESCALIER N'EST PAS UN MAXIMUM CHAMP PAR CHAMP** — la seule
du dépôt qui ne le soit pas. `essais` et `meilleur` décrivent un palier PRÉCIS :
un maximum séparé collerait « MEILLEUR ESSAI · 14 manches » sur un palier qui en
demande 18. La loi est « le palier le plus haut gagne, avec son escorte », et à
égalité seulement le maximum. C'est bien un treillis, donc les doubles onglets
restent inoffensifs. Elle vit dans `shared/compte.ts` avec les autres, pas dans
`game/` : une loi de fusion écrite deux fois diverge.

**Ce que la mesure a corrigé, écran en main :**

- ⚠️ **Un invariant que j'avais écrit trop large, et qui est tombé deux fois sur
  le même palier.** « Rien ne se relâche jamais » : faux, et c'est la maquette
  qui a raison. Le palier 11 passe de 18 à 15 manches et de 1 piège / 4 à 1 / 5,
  parce qu'il encaisse déjà l'entrée en × 1,0 ET le retrait de l'annonce. Lui
  demander tout en plus en ferait un mur — la falaise de la manche 3, déplacée.
  L'invariant juste est plus étroit : **dans une volée, rien ne se relâche ;
  changer de volée coûte toujours l'allure, strictement.** Deux tests, un par
  moitié, sinon le second serait une échappatoire au premier.
- **Le total de la maquette est faux** : elle annonce 371 manches sous une
  colonne qui en fait 396. Il est donc CALCULÉ, comme la durée (≈ 13 min,
  dérivée de `windowMs`). Les documents mentent, et la maquette aussi (§2).
- **La marche courante s'ouvrait à 922 px dans une fenêtre de 812**, donc
  l'écran ouvrait sur le sommet — sur ce qu'on ne peut pas jouer. Et le premier
  correctif ne marchait pas : `scrollIntoView` sur un élément encore `hidden`
  ne fait rien, silencieusement. Il s'appelle depuis `ouvreEscalier`, APRÈS
  `show`.
- **« × 1.5 » puis « × 2 »** — le point décimal est anglais, et une échelle dont
  un cran perd sa décimale ne se lit plus comme une échelle. D'où `allureTxt`,
  posée dans l'i18n : c'est une convention de LANGUE, comme le pluriel à zéro.
- **La volée 1 alignait trois marches disant mot pour mot « 2 manches de plus à
  tenir »** — la phrase est dérivée, donc juste, mais trois lignes identiques se
  lisent comme un bug. Une marche qui n'ajoute QUE de la durée ne se nomme plus
  dans la liste : la colonne de droite dit déjà « 10 MANCHES ». La phrase reste
  sur la fiche, où elle est le seul texte.
- **La coche remplaçait le numéro** : la volée 1 devenait cinq lignes sans
  identité, alors que c'est par son numéro qu'on désigne un palier — et que
  REPRENDRE le nomme. La coche est passée à droite.
- **Un bouton portait une règle du jeu** (« UN PALIER RATÉ SE REJOUE · TU NE
  REDESCENDS JAMAIS ») : un avertissement déguisé en action. La phrase est allée
  sous la montée, le bouton dit « ◂ ESCALIER ».
- **Le texte d'une marche se PLIE, il ne se coupe pas.** Mesuré à 1280 : 569 px
  dans 514, donc « … et le jeu te… ». Une ellipse est bonne pour un nom, mauvaise
  pour une explication — c'est elle qu'on vient lire.

⚠️ **Un défi ou un match classé n'a JAMAIS de palier, quoi qu'il reste d'armé.**
`openBrief` consomme l'armement — donc tout autre lancement repart à zéro, le
garde-fou étant au point de passage commun et non sur chaque porte (leçon du
REJOUER muet). Mais la REVANCHE d'un duel appelle `startRun(false)` sans y
repasser : `lanceRun` ignore donc le palier dès que `challenge` ou `ranked` est
posé. Sans ça, enchaîner un palier puis un duel ferait jouer le duel sur la
longueur et la cadence du palier — une partie qui ne se compare plus à celle de
l'adversaire, le seul défaut tenu pour fatal.

**L'escalier SUIT le compte, et il ne le demande jamais.** Décision n°12 : aucun
verrou, aucun bouton masqué, il vit en `localStorage` comme le reste. Et il fait
le voyage — `tests/carnet-voyage.test.ts` déroule les cinq étapes réelles
(`agregatsDe` → JSON → `litAgregats` qui RECONSTRUIT → `fusionne` → un second
appareil vierge) et compare l'entrée ENTIÈRE à l'arrivée.

⚠️ **Ce fichier ne teste pas une liste de champs, il teste LA liste.** Il retire
chaque clé du carnet à tour de rôle et exige que l'arrivée diffère — donc il
prouve que les huit champs sont réellement câblés, et le dix-septième le sera
aussi sans qu'on y pense. Il manquait : `tests/revendication.test.ts` ne couvrait
que `best`, `cleared` et `pieges`, alors que la panne décrite au §12 (« un champ
oublié se voit seulement quand un joueur change d'appareil ») avait déjà été
payée une fois.

**Ce qui n'a PAS pu être vérifié** : le mode en JEU. Le volet ne compose aucune
frame (`requestAnimationFrame` bloqué, 0 image en 500 ms), donc le battement de
lecture ne tombe jamais et aucun run ne démarre. La plomberie est couverte par
les unitaires — `maxRounds`, le défaut de `forcePiege`, l'allure qui ne touche
que la fenêtre — mais **l'annonce du piège dans la case META, la borne de fin de
palier et le libellé « PALIER 8 FRANCHI » n'ont jamais été vus tourner.** C'est
la première chose à regarder en soirée.

**Deux choses volontairement pas faites**, et ce sont des directions :

- L'escalier n'a **aucune entrée depuis l'accueil** : on y arrive par une carte
  du carnet, puis sa fiche. C'est la boucle voulue (on se fait massacrer, la
  règle entre au carnet, on va la travailler) mais ça fait trois clics.
- **Sur téléphone, lancer demande de toucher la marche courante d'abord**, parce
  que la fiche du palier est une seconde vue. La maquette met un CTA au bas de
  la montée ; ce serait un second bouton du même nom à trois cents pixels du
  premier — « pas une insistance, une hésitation ». À trancher en jouant.

### L'écran de fin : le record battu, et la carte de partage

Les deux derniers morceaux de la maquette. ⚠️ **Trois autres points de la même
liste étaient DÉJÀ FAITS** — les vies dans le bandeau, « RECORD DÉPASSÉ » au
pied, les équerres du terrain — et le quatrième (la série) existe là où il veut
dire quelque chose : `plate__streak` en multi, dès ×3. En solo après
l'échauffement, la série ÉGALE le score, donc l'afficher ne dirait rien. Encore
le §2 : mesurer avant de refaire.

**`render/exploit.ts` est le CINQUIÈME module de priorité pure** du dépôt, après
`plate`, `seat`, `jour` et `but`. Les quatre précédents ont été extraits APRÈS
un bug ; celui-ci l'est avant, ce qui est le seul progrès possible.

⚠️ **Le bandeau REMPLACE le repère « TON RECORD », il ne s'y ajoute pas** —
sinon « TON RECORD · 23 » se lit sous « TU AS BATTU TON RECORD » à un
centimètre d'intervalle.

⚠️ **Trois modes n'ont pas de record personnel à battre**, et aucun pour la même
raison : le run du jour se mesure « SUR 40 », un palier d'escalier est PLAFONNÉ
par construction (féliciter quelqu'un d'avoir atteint la cible qu'on lui a fixée
est une flatterie), un duel se juge contre l'adversaire.

⚠️ **Battre zéro n'est pas un exploit.** Le premier run d'un joueur a une
médiane de QUATRE manches : sans cette garde, l'écran lui annonce un « NOUVEAU
RECORD » à 4 et lui apprend du même coup que le mot ne vaut rien.

⚠️ **RECORD ÉGALÉ se dit, mais pas avec le même mot.** Le joueur sait qu'il
vient de refaire son meilleur score — le pied affichait « TON RECORD · 23 »
pendant qu'il montait à 23 — et un écran muet passe pour ne pas l'avoir vu. Mais
l'écart reste VIDE : « +0 » se lirait comme un progrès nul.

**La carte de partage.** Le partage texte est à **0 % sur trois relevés et 203
joueurs** — jour 2 (14), jour 3 (50), jours 238-245 (139) — et le bouton
existait à chaque fois. L'hypothèse testée : ce qui manquait n'est pas le bouton
mais l'OBJET. Trois lignes collées dans une conversation ne se distinguent
d'aucun autre message ; une image se reconnaît et porte l'adresse du jeu sur
elle. **Le bouton texte RESTE** : `share` et `share_carte` sont deux événements,
et c'est le rapport qui tranchera.

- ⚠️ **On attend `document.fonts.ready`.** Un canvas qui dessine avant Inter et
  JetBrains Mono retombe sur la police système SANS ERREUR — l'image part, hors
  marque. Même famille que les emoji écartés des pictogrammes de l'accueil.
- ⚠️ **On ne retombe PAS sur le partage texte** si l'image échoue : le joueur a
  demandé une carte, lui envoyer trois lignes serait un refus déguisé en succès.
- ⚠️ **La frise a dû monter et grossir.** Premier rendu mesuré à l'écran : 26 px
  de côté ancrés au bas de la carte, donc 250 px de vide au milieu et une bande
  si fine qu'elle se lisait comme une décoration. Or la frise EST le récit du
  run — la seule partie qui dise COMMENT ça s'est passé, pas seulement combien.
- Bornée à 60 marques, et ce sont les DERNIÈRES : un run de 201 manches donnerait
  201 carrés de 5 px, c'est-à-dire du bruit.
- `donneesCarte` est PURE et testée, `dessineCarte` ne fait que peindre. Sans
  cette coupe rien ne serait vérifiable : jsdom n'a pas de canvas.

⚠️ `share_carte` a dû entrer dans les DEUX listes blanches (`src/analytics/` et
`api/collect.ts`), qui rejette en silence tout nom absent.

### L'accueil montre enfin le jeu — et trois bugs trouvés en le posant

**Le chiffre :** 118 nouveaux visiteurs sur 159 (**74 %**) repartent sans lancer
une partie, médiane 6 secondes. L'onboarding ne peut rien y faire — il ne
s'ouvre qu'après un clic sur JOUER, c'est-à-dire après la marche qu'ils ne
franchissent pas. Or l'accueil ne montrait **aucun jeu** : pas une image, pas un
mouvement. Un jeu de réflexes se comprend en deux secondes de vidéo.

`src/render/demo.ts` — une boucle de 8,6 s qui joue DEUX manches : une ordinaire
pour poser la mécanique, une **piégée** pour la retourner. Elle s'arrête là.

⚠️ **Ce qu'elle montre n'est pas « le jeu », c'est LE PIÈGE** — la seule chose
non copiable de TOR, et la plus difficile à deviner puisque seules **5,4 %** des
manches en produisent un.

⚠️ **C'est une AFFICHE, pas un tutoriel, et la distinction est écrite.** Le dépôt
tient que « un tutoriel qui simule le jeu enseigne un jeu qui n'existe pas » —
d'où `game/onboarding.ts` sur le vrai terrain. Ici c'est impossible : une manche
réelle compte quinze pièces sur 1000 × 420, illisible dans une bande de 108 px.
On montre donc **une rangée de la grille 5 × 3** — une tranche exacte, pas une
invention — avec les mêmes formes, les mêmes quatre teintes et le même verdict.

**Elle se paie, et le prix est écrit** : la faille passe de `clamp(300px, 44vh,
440px)` à `clamp(240px, 34vh, 400px)`. Elle mesurait 382 px sur un 375 × 812,
soit 47 % de la page, pour porter deux libellés et deux descriptions —
c'est-à-dire un menu à deux entrées que la barre du bas propose déjà. Mesuré
après : chapo 152→260, accroche 260→370, faille 444→720, barre 749→812, **aucun
défilement**.

#### Trois bugs, tous trouvés en mesurant, aucun en relisant

⚠️ **UNE COLLISION DE CLASSE, la deuxième du dépôt.** Ma bande s'appelait
`.demo` — et `.demo` existait déjà : c'est l'explicatif à deux cas du repli
« COMMENT ÇA MARCHE » du brief. Ma déclaration lui posait une bordure, un fond
et un grain qu'il n'a jamais demandés ; son `display: grid` enfermait en retour
mon canvas dans une piste de **350 px pour 718 disponibles**. La moitié VISIBLE
(un canvas à moitié vide) m'a mis sur la piste ; la moitié invisible — un
composant jamais regardé, repeint — est celle qui aurait duré. Renommée
`.accroche`. C'est exactement `.piege`, à 1400 lignes d'écart, invisible pendant
des semaines.

⚠️ **PAS DE FILET GÉNÉRAL CONTRE ÇA, et c'est mesuré :** 127 classes de la
feuille ont déjà plusieurs blocs racine (`.over__head` 5 fois, `.verdict` 5,
`.card` 4…), et la plupart sont des raffinements voulus. Un allowlist de 127
entrées serait du bruit, pas un filet. Le seul geste qui marche reste manuel :
**avant d'ajouter une classe, `grep` la feuille.**

⚠️ **UNE APPLICATION N'A QU'UNE BOUCLE.** La démo avait d'abord son propre
`requestAnimationFrame`. `tests/smoke.test.ts` est tombé — son harnais ne retient
que la DERNIÈRE callback enregistrée pour dérouler les frames à la main, donc la
démo écrasait celle du jeu, le battement de lecture ne tombait jamais et aucun
run ne démarrait. Symptôme affiché : « le brief ne se ferme pas », qui ne désigne
rien de ce qui était cassé. Mais le vrai défaut n'est pas dans le harnais : c'est
déjà la doctrine du battement de lecture, et pour les mêmes raisons — un filet
qui déroule des frames voit tout, rien ne court sur un onglet qui ne compose pas,
et **un décor ne doit jamais pouvoir affamer le jeu**. La boucle de `main.ts`
peint la démo quand `screen === "home"`.

⚠️ **`height: 100%` NE SE RÉSOUT PAS SUR UN CANVAS.** Cadre à 96 px, canvas
mesuré à **170** : il retombait sur son ratio intrinsèque (300 × 150), soit
169,5 à 339 px de large, et débordait de son propre cadre sans une erreur. La
hauteur est portée par le canvas, une seule fois.

⚠️ Et un quatrième, trouvé par son test : le curseur de la manche piégée
descendait à **−2,78** après le renoncement (une borne manquante sur le temps).
Invisible — le pinceau dessine à une coordonnée négative sans se plaindre.

**Ce qui reste, et qui appartient à Pierre** : le doublon MULTI (faille + barre)
est structurel — la faille et la barre sont deux fois la même navigation, et
choisir laquelle perd veut dire toucher à la vitrine. ⚠️ Et `accueil_premier_clic`
n'a **toujours pas été lu** : ces correctifs sont des incohérences réparées, pas
une refonte informée par la mesure.

### Le bug livré à un joueur : la montée repartait de zéro à chaque run

Rapporté en playtest, mot pour mot : « impossible d'aller au-delà de l'étape 2,
même en la réussissant ». Capture à l'appui, l'écran affichait pourtant
« PALIER 2 FRANCHI ».

⚠️ **`majCarnet` RECONSTRUIT l'entrée du carnet, elle ne la complète pas.** Tout
champ qu'elle ne nomme pas est effacé à chaque run. Le §12 nomme pourtant les
TROIS bouts où un champ neuf doit être branché — `majCarnet`, `fusionne`, le
nettoyage de `api/moi.ts`. En ajoutant `escalier` j'en ai câblé deux et sauté
celui qui est cité en PREMIER, qui est justement le seul à tourner à chaque
partie.

Le mécanisme, dans l'ordre : un run de palier écrivait `majCarnet(...)`, qui
rendait une entrée SANS escalier ; la ligne suivante relisait cette entrée pour y
trouver la montée, tombait sur « pas commencée », et repartait du palier 1. Le
libellé « PALIER 2 FRANCHI » vient du palier JOUÉ et non de l'état enregistré :
**le jeu annonçait une victoire qu'il venait d'effacer.**

⚠️ **Ça mordait bien au-delà de l'escalier** : n'importe quel run d'entraînement
ou du jour passe par `majCarnet`, donc jouer QUOI QUE CE SOIT détruisait la
montée — sans rapport apparent et sans rien à l'écran.

**Le report est posé EN PREMIER dans l'objet rendu**, donc tout ce que la
fonction calcule vraiment l'écrase. Un `...prev` placé après annulerait chaque
mise à jour et le carnet cesserait d'avancer : un bug aussi silencieux, en sens
inverse. Il a son test.

⚠️ **`tests/carnet-voyage.test.ts` ne pouvait pas le voir** — il éprouve le
voyage entre deux appareils, pas le chemin d'un run. D'où
`tests/majcarnet.test.ts`, qui exige qu'aucun champ ne se perde ICI et qui
grimpe les vingt paliers par la séquence réelle de `finishRun`. Éprouvé en
remettant la faute : deux assertions tombent.

⚠️ **Aucune donnée n'est corrompue.** Les sauvegardes touchées portent
`{ palier: 1 }` : les joueurs reprennent au palier 2 et progressent normalement.

### Le lot Ystart — sept chantiers, jamais vus par un joueur

Retours du jury Ystart (entretien de présentation) et directive de Pierre : « raccourci,
et non partout », puis « retravaille l'UI sur téléphone, carte blanche ».
Branche `claude/chasse-bugs-0912`, sept commits, **rien de déployé**.

- **DÉJOUER** (décision n°15) — ⚠️ **RETIRÉ depuis**, voir §12. Survie seulement là où `resolveTimeout` aurait
  déjà rendu une survie : il avance l'instant, il ne change aucune issue.
  Lettre réservée (F par défaut, R refusée : c'est REJOUER) sortie du tirage
  SANS toucher au flux du RNG quand elle est absente — testé manche par manche.
  Bouton au pouce posé à côté du terrain, jamais dessus, jamais allumé par un
  piège (n°5).
- **Terrain debout** (n°16). 325 × 137 → 241 × 574 px à 375 × 812. Critère
  identique à la feuille : `max-width: 680px` et portrait, décidé sur la
  FENÊTRE (n°2). Debout, « le plus à gauche » se dit « le plus en haut » et
  LE GAUCHER interdit « la bande du haut » ; `text` reste le français couché.
- ~~**Flammes**~~ — retirées depuis, sur directive de Pierre ; voir LA MONTÉE.
- **Tutoriel en jouant**. Plus AUCUN écran d'explication : obéir, résister,
  déjouer, sur le vrai terrain, puis la partie démarre. L'écran `#onb` et sa
  route ont disparu. PASSER est dans l'angle bas-droit, et un test exige
  qu'aucune scène du tutoriel n'y pose de pièce.
- **Avis après deux parties** (`game/avis.ts`). Une fois, jamais sur le même
  écran que le bandeau de mesure, jamais si la mesure est coupée. ⚠️
  `api/collect.ts` coupe tout à 40 caractères SAUF `texte` dans `avis_mot`
  (280) — nommé par l'événement ET la clé. En local `VITE_COLLECT_URL` est
  vide, donc l'avis ne paraît pas : c'est voulu.
- **Écrans téléphone**. L'audit mécanique était propre (débordements, tailles,
  cibles) ; les défauts étaient de COMPOSITION. Accueil : la démo plein écran
  passait sous l'accroche et JOUER → vitrine encadrée. Brief et fin : l'action
  principale avait la taille d'un lien → pleine largeur.

⚠️ **Piège de mesure payé trois fois sur ce lot** : une copie locale de
`index.html` avec un `requestAnimationFrame` de secours permet de jouer dans
le volet qui ne compose pas d'images — mais elle PÉRIME à chaque changement
du HTML, et une copie périmée fait croire qu'un élément manque. La régénérer
avant chaque mesure. Et une boîte masquée par le JS local (`VITE_*` vides) ne
prouve rien du déploiement.

### Ce que la passe de stabilité a éprouvé, et ce qu'elle a trouvé

Directive de Pierre : « stabilise la version au maximum, on n'implémente rien
tant que le site n'est pas parfaitement stable ». Ce qui suit dit ce qui a été
VÉRIFIÉ, pour que la prochaine session ne le refasse pas à l'aveugle.

⚠️ **Le seul vrai bug trouvé est décrit au §12 (sauvegarde)** : un champ du
mauvais type tuait JOUER en silence. Le reste a tenu :

- **sauvegardes bricolées** — JSON invalide, version inconnue, tableau, chaîne
  vide, champs du mauvais type : le jeu se lance et se joue dans les cinq cas
  (il n'en tenait que quatre avant `normaliseSave`) ;
- **stockage INTERDIT** (navigation privée stricte : chaque accès lève) :
  accueil, tutoriel, partie, aucune erreur ;
- **singe** — 70 clics au hasard, puis 90 événements mêlés (clics, touches
  `f R Échap Espace flèches`, appuis sur le terrain) avec le stockage bloqué :
  aucune exception, écran cohérent à l'arrivée ;
- **rotation en pleine partie** (375 × 812 → 812 × 375) : pas de casse. Le
  champ y devenait minuscule ; c'est le PAYSAGE SERRÉ, traité depuis (voir sa
  section). Remesuré après : 234 × 558 debout → 674 × 283 couché → 234 × 558 au
  retour, run toujours vivant, zéro erreur console.

Les tests unitaires ont été lancés **trois fois de suite** (968 à chaque fois) :
aucun n'est intermittent aujourd'hui.

### ~~Les flammes~~ — RETIRÉES (25/09/2026, directive de Pierre)

Le calque, `render/flammes.ts`, son test et `public/fx/flamme.png` (OVERBURN
Asset Pack, par Overboy) sont partis. La planche n'est plus embarquée : sa
licence n'engage donc plus rien. Remplacées par LA MONTÉE (voir ci-dessous).

### Le paysage serré — le téléphone couché, et une bande qui bougeait

Directive de Pierre : « vas-y pour le chantier téléphone ». Ce qui suit est ce
qui ne se déduit pas du code.

⚠️ **LE VRAI DÉFAUT N'ÉTAIT PAS CELUI QUE J'AVAIS ANNONCÉ.** J'avais rapporté
« le bandeau mange 230 px des 375 ». C'est vrai, et c'est le moins grave.
Mesuré en partie, téléphone couché :

| fenêtre | bandeau | consigne | pied | scène | CHAMP |
|---|---|---|---|---|---|
| 667 × 375 | 48 | 105 | 54 | 168 | 343 × 144 |
| 667 × 375, consigne sur 2 lignes | 48 | **139** | 54 | 134 | **262 × 110** |
| 812 × 375 | **74** | 106 | 54 | 141 | 278 × 117 |
| 812 × 375, consigne à glyphe | 74 | **151** | 54 | 96 | **116 × 49** |

`#head` n'a pas de hauteur fixe : **le champ change de taille d'une manche à
l'autre**, jusqu'à −58 %. C'est la décision n°10 et la n°2 en même temps, et
c'est devenu la décision n°17. Le même défaut vaut sur un BUREAU : à
1280 × 800 une consigne à glyphe fait passer `#head` de 106 à 174, donc le
champ de 1232 × 517 à 1128 × 474. Personne ne l'avait signalé — ça ne se voit
pas, ça se sent.

⚠️ **Le 812 de large est PIRE que le 667**, et ça ne se devine pas : les règles
`@media (max-width: 680px)` qui replient le bandeau ne l'atteignent pas, donc
un grand téléphone couché reçoit le bandeau de bureau (74 px au lieu de 48).

**La réponse** est celle du terrain debout : `#band`, `#head` et `#foot`
quittent le flux et se peignent dans deux bandes CONSTANTES,
`RESERVE_CONSIGNE_COUCHE` (62) en haut et `RESERVE_PIED_COUCHE` (30) en bas.
`cadrePour` gagne une réserve haute, dont le défaut est la gouttière — c'est ce
qui garantit qu'aucune fenêtre existante ne bouge d'un pixel (vérifié à
1280 × 800, 1024 × 768 et 375 × 812 : champ identique au relevé de référence).

Relevé après, partie lancée : **812 × 375 → 674 × 283** (l'échelle passe de
0,279 à 0,674), **667 × 375 → 617 × 259**. Et le champ ne bouge plus, quelle
que soit la consigne.

⚠️ **SANS `:not(.has-topbar)`, contrairement au repli de la consigne debout.**
Les écrans de menu masquent le HUD en `visibility` précisément pour que le
canvas ne change pas de taille d'un `show()` à l'autre ; le sortir du flux en
jeu SEULEMENT rouvrirait ce trou. Vérifié : canvas à 375 sur l'accueil comme
en partie.

⚠️ **PAS DE `pointer-events: none` SUR LA BANDE**, contrairement au terrain
debout. Le canvas occupe maintenant toute la scène : un doigt qui traverserait
la bande atterrirait dans le VIDE du champ, ce que `resolveAction` juge comme
un clic raté. La bande absorbe donc les touchers, comme `#head` dans le flux le
faisait. Un test le refuse. (Corollaire noté et NON corrigé : debout, la
consigne porte `pointer-events: none`, donc **toucher le texte de la consigne
tue**. C'est cohérent avec le reste du letterbox, mais ça mérite une décision.)

**Trois pièges payés en le posant :**

- ⚠️ `#bandRule { font-size: 21px }` vit plus haut dans la feuille : une règle
  de CLASSE perd contre lui, et le nom de la règle se faisait couper en deux
  par une bande de 16 px. Même famille que `#reglages .lang`.
- ⚠️ `#band` et `#foot` portent un `min-height` ailleurs (48 et
  `var(--foot-h)`) : une `height` posée sans `min-height: 0` ne veut rien dire.
- ⚠️ `--foot-h` ne sert pas qu'au pied — les plaques d'un salon se posent à
  `bottom: var(--foot-h)`. Le raccourcir sans toucher au jeton aurait laissé
  les plaques flotter 24 px trop haut, au milieu du terrain.

**Le salon couché traversait encore le terrain.** Mesuré avec un vrai match à
667 × 375 : `#liveHud` faisait 144 px (plaques 110, émotes 60) pour une bande
plafonnée au tiers du canvas, soit 125 — donc **49 px de terrain sous les
plaques**, exactement le bug de Pierre dans son dernier refuge. Couché, les
émotes quittent leur rangée pour se poser À CÔTÉ des plaques (la largeur est ce
qu'on a en trop) et la plaque perd le nom de règle de l'adversaire, qu'on
retrouve sur la kill-cam. Le calque retombe à 94 px,
`RESERVE_HUD_MULTI_COUCHE` vaut 124 avec le pied. Remesuré en match : terrain
450 × 189 finissant à 251, plaques à partir de 253, **recouvrement 0**.

**Le tutoriel aussi.** Son calque vit dans `#stage`, et `#stage` occupe
maintenant tout le canvas : son `bottom: 0` le posait SUR le pied — « LE CHRONO
EST DÉSACTIVÉ » par-dessus « RECORD 0 », PASSER par-dessus MODE. Il s'arrête
désormais au-dessus du pied.

**Trois écrans de menu ont suivi, parce qu'ils étaient cassés du même mal :**

- la **barre du bas** faisait 92 px sur 375, dont 32 pour « TA RÈGLE T'ATTEND »
  suspendu sous JOUER. Icône et mot passent côte à côte, la ligne d'attente
  part — c'est ce que fait déjà `#app.barre-haute` sur large. Mesuré : **51 px,
  42 rendus à chaque écran**, cibles tactiles à 44 ;
- l'**accueil** : `.attract` couvrait tout l'écran et la consigne de la démo se
  peignait en 60-113, pile sur l'accroche (74-156). Même défaut qu'en portrait,
  corrigé seulement là. La démo redevient une vitrine (100-186), la carte de
  règle passe en ligne (76 → 42), l'accroche prend toute la largeur — sa
  colonne de lecture la pliait en trois lignes et poussait JOUER à 397 pour une
  fenêtre de 375. Après : JOUER 254-314, barre à 320, **aucun défilement** ;
- ⚠️ **le repère du `margin-top` n'est pas le même qu'en portrait.** Le bloc
  central se place après la carte de règle, donc on soustrait 98 (barre haute
  56 + carte 42), là où le portrait soustrait 132. Se tromper de repère pose
  JOUER sous la barre basse — c'est la mesure ci-dessus.

**Ce qui n'a PAS été fait, et ce sont des directions :**

- le **brief** et l'**écran de fin** restent longs couchés : 747 et 1056 px de
  contenu pour 375. Ils DÉFILENT, donc rien n'est inatteignable, mais COMMENCER
  et REJOUER sont sous la ligne de flottaison. Les compacter est une refonte de
  composition, pas un correctif ;
- **DÉJOUER couché fait 42 px de haut** au lieu des 44 de `--tap`, quand il
  tombe dans la bande du pied (mesuré à 667 × 375). Il prend tout ce qui reste
  entre le bas du terrain et le bas du canvas sans mordre sur le champ ; deux
  pixels manquent, et les rendre coûterait du terrain à tout le monde.

### Backlog

1. **Nouvelles consignes** — double appui, MAINTENIR et GLISSER sont faits
   (multi). Reste BALAYER, qui demanderait une direction sur le fil. Toute
   consigne neuve passe par `CONSIGNES_MULTI`, `VERSION_DE_CONSIGNE` et
   `CONSIGNES_VERSION`.
2. ~~**Salons publics**~~ — **faits** sous la forme d'une PARTIE RAPIDE (lot
   « addiction », §12) : pas de liste de salons, qui dirait « personne ne
   joue », mais une porte qui range à une table.
3. **Le curseur du trailer comme VRAI curseur** (idée de Pierre, 07/10, « un
   gadget sympa sans plus ») — le personnage-curseur de
   `The_One_Rule_Trailer_v3` devient le pointeur du site ; ses formes et
   styles s'achètent à la boutique ; en multi, il RÉAGIT quand un joueur
   meurt. Pas commencé. Ce qu'il faudra régler avant :
   - ⚠️ **le point chaud doit tomber EXACTEMENT là où le clic est jugé** :
     `cursor: url(…) x y` décale l'image, pas le clic. Un personnage dont la
     « pointe » visible n'est pas le point chaud fait cliquer à côté, c'est
     « le jeu triche » (n°3). Sur le terrain, garder le point chaud au pixel
     près, ou ne pas l'y montrer ;
   - **au doigt, il n'y a pas de curseur** (`TOUCH_ONLY`) : sur téléphone, la
     moitié des joueurs ne le verraient jamais. Une réaction à la mort devra
     donc vivre aussi sur la plaque ou l'avatar ;
   - les navigateurs plafonnent une image de curseur (≈ 128 px, 32 conseillé)
     et la réduisent sans prévenir sur un écran dense ;
   - en multi CLASSIQUE, les curseurs des autres ne voyagent PAS — seul le
     coop envoie `{ t: "cursor" }`. Voir le curseur d'un autre mourir demande
     de les transporter (trafic, et ce n'est pas un verdict : hors n°3,
     comme le coop) ; réagir à SA propre mort ne demande rien ;
   - les styles achetés vivent en local comme ceux des pièces
     (`game/boutique.ts`), et ne changent QUE le dessin.
   À penser avec les « autres mondes » et les modificateurs de partie, en
   réflexion côté Pierre : un curseur qui réagit est un levier de PRÉSENCE,
   pas de variété — il ne répond pas au retour « on fait vite le tour ».

### Ce qui a été écarté avec des chiffres

**« Les joueurs de ce soir étaient plus forts »** — proposé comme explication
alternative à la chute des morts sur la règle unique. Ne tient pas : à règle
égale (LE SANG), le score médian du jour 240 est de **11,5** contre **13** au
jour 239. Ils n'étaient pas plus forts. La dilution est mécanique.
