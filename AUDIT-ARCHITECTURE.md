# Audit d'architecture — The One Rule

07/10/2026, sur `master` (`d5ac63d`, PR #17 fusionnée) plus une entrée de backlog.

Ce rapport ne suppose rien : chaque point cite le code (`fichier:ligne`) et,
quand une lecture ne suffisait pas, le résultat d'une exécution.

## Suivi des priorités (§14), même jour

| # | Point | État |
|---|---|---|
| 1 | D1 — performances des comptes supprimés | corrigé + migration 0005 (à appliquer) |
| 2 | S2 — journal de `verifyRun` | corrigé (`entreeValide`) |
| 3 | S5, P5 — collecte | corrigé (champs réservés, `cleanEnv`) |
| 4 | D2, D3 — départage, 429 | corrigés |
| 5 | S1 — mode classé | hors routage (`api/_ranked.ts`), adversaire relu du vivier, plus d'`id` publié. `body.id` reste non authentifié |
| 6 | C1 — reprise de siège | corrigé (`remplace`, capacité `reprise`) |
| 7 | C2 — deux onglets | corrigé (événement `storage`) |
| 8 | C3 — vote imposteur | corrigé (départ d'un votant, borne de 90 s) |
| 9 | T1 — tests de `DepotSupabase` | contrat des requêtes testé ; pas de vraie base |
| 10 | R1, R2 — découpage | premier pas (`lancementRefuse`) ; `initMulti` et `finishRun` restent |

Restent ouverts, hors des dix priorités : S3 (catalogue choisi par le
client, essais non appliqués serveur), S4 (pas de limite sur `join` — traité en phase 4, point 23), S6 à
S9, C4 à C6, et les points de §9, §10 et §12 qui n'y figuraient pas.

## Suivi de la phase 3 (tests), 08/10/2026

| # | Point | État |
|---|---|---|
| 16 | T1 — `DepotSupabase` | 44 tests sur les 24 méthodes ; `leveDrapeau` vérifie sa réponse |
| 17 | T5 — entrées malformées | corpus sur chaque fonction edge et sur le serveur de salons ; `litObjet` |
| 18 | C4 — concurrence | demandes croisées et `MAX_AMIS` corrigés, prouvés avec un dépôt lent |
| 19 | T6 — coupure réseau | `e2e-navigateur.mjs` ; reprise anonyme et calendrier de reprise corrigés |
| 20 | C1, C2 — deux onglets | même fichier : sauvegarde partagée, siège repris sans ping-pong |
| 21 | T4 — couverture | `npm run coverage`, cliquet sur les couches pures ; serveur 92 % sous l'e2e |

## Suivi de la phase 4 (performance), 08/10/2026

| # | Point | État |
|---|---|---|
| 22 | front | terrain caché plus repeint (60 → 0 image/s sur les menus) ; `matchMedia` hors de la boucle |
| 23 | backend (et S4) | seau par socket, échecs de `join` par adresse, `profil` regroupé ; un client hostile ne sature plus le serveur |
| 24 | réseau | `permessage-deflate` sans contexte : ÷4 sur le fil, mémoire indépendante du nombre de joueurs |
| 25 | Redis, base | Redis à un aller-retour, index suffisants ; routes d'amis 11/13/4 → 7/9/3 allers-retours en série |
| 26 | paquet | aucune dépendance tierce dans le paquet ; cliquet gzip et QR à la demande gardés en CI |
| 27 | CSS | 238 règles mortes retirées (−49 Ko, −4,7 Ko gzip), styles calculés identiques sur 8 878 éléments |
| 28 | boucle de jeu | le HUD n'écrit plus à l'identique : téléphone ×4 de 30 à ~40-60 images/s, mises en page 369 → 11-23 |

## Suivi de la phase 5 (CI/CD), 09/10/2026

| # | Point | État |
|---|---|---|
| 29 | lint | ESLint (justesse, pas de style) en CI ; 15 signalements, dont 9 BOM voulus |
| 30 | typecheck | `vite.config.ts` typé (le cliquet de couverture pouvait se taire) ; scripts JS hors typage, 41 artefacts et 0 bug |
| 31 | unitaires | la CI lance la couverture et ses seuils, plus seulement les tests |
| 32 | intégration | l'image Fly construite, lancée et sondée (santé, salon, origine, arrêt propre) |
| 33 | E2E | l'e2e navigateur (vrai client, Chromium) rejoint l'e2e des salons en CI |
| 34 | build | le build de PRODUCTION (variables posées, commande de `vercel.json`) passé au vérificateur de déploiement |
| 35 | sécurité | 14 avis des outils corrigés, verrou qui plantait npm réparé ; audit de production bloquant en CI, Dependabot |
| 36 | préversion | chaque préversion Vercel passée au vérificateur de déploiement ; multi volontairement fermé aux préversions |
| 37 | déploiement | déploiement des salons À LA MAIN seulement, procédure du §10 entière (personne ne joue, une machine, une instance) |
| 38 | retour arrière | redéploiement d'une image précédente, vérifié par l'image que /health annonce ; front ramené à part |

## 0. Méthode et état de départ

**Ce qui a été lancé :**

- `npx tsc --noEmit` : propre ;
- `npx vitest run` : **105 fichiers, 1204 tests, tous verts** ;
- `npx vite build` : `index.js` fait 333 Ko (113 Ko gzip), `style.css` 232 Ko
  (43 Ko gzip), plus `qr.js` 21 Ko chargé à la demande.

**Trois outils écrits pour l'audit**, gardés hors du dépôt :

- un parcours de l'arbre syntaxique TypeScript, pour la taille de chaque
  fonction ;
- un graphe d'imports avec recherche de cycles (Tarjan) ;
- un relevé des exports que rien n'importe.

**Deux sondes exécutées** (scripts temporaires, supprimés ensuite) : l'une sur
`verifyRun`, l'autre sur `api/collect.ts`. Leurs sorties sont recopiées
telles quelles là où elles servent de preuve.

**Pas vérifiable d'ici, et donc non affirmé :**

- la configuration réelle de Vercel et de Fly (nombre de machines, variables,
  déclenchement des déploiements) ;
- le comportement de Supabase en production ;
- l'e2e, qui n'a pas été relancé pour cet audit.

Taille : 65 249 lignes hors tests et `public/`, dont `style.css` (14 941),
`main.ts` (8 367), `theme.css` (5 728), `multi.ts` (4 266), `i18n.ts` (3 155)
et `index.html` (2 131).

---

## 1. L'architecture, telle que le code la montre

```
index.html ── src/main.ts (85 imports) ──┬── src/multi.ts (initMulti, 3 301 lignes)
                                         ├── src/render/*  (canvas, HUD, modules purs)
                                         ├── src/game/*    (progression, localStorage)
                                         ├── src/compte/*  (jeton, file persistée)
                                         └── src/engine/*  (PUR)
server/index.ts ── server/match.ts, coop.ts ── src/engine/* , shared/*
api/*.ts (edge) ── src/engine/verify, src/game/{daily,perfs,escalier}, shared/*
```

**Ce qui tient, et qui a été vérifié :**

- **`src/engine/` est pur.** Une recherche de `Math.random`, `Date.now`,
  `performance.now`, `document.` et `window.` dans `src/engine` ne trouve
  rien. `server/match.ts` et `server/coop.ts` n'ont ni `Math.random` ni
  `Date.now`.
- **Les couches sont respectées** : aucun import de `game/`, `render/`,
  `net/`, `compte/` ou des écrans depuis `src/engine`.
- **Le jeton est vérifié correctement.**
  - côté serveur : `timingSafeEqual` (`server/jeton.ts:48`) ;
  - côté edge : `crypto.subtle.verify` (`api/_jeton.ts`).
- **Le serveur de salons se protège** :
  - chaque message et chaque minuterie passe par `guarded` / `plusTard`
    (`server/index.ts:209-233`) ;
  - `maxPayload` est borné (`:889`) ;
  - chaque socket a un écouteur `error` (`:927`).
- **Les noms de joueurs passent par `textContent`.** Les 90 `innerHTML` de
  `main.ts` et `multi.ts` ont été passés en revue : aucun n'insère un texte
  venu d'un joueur. La carte est filtrée par `carteValide`
  (`/^[a-z]{2,20}$/`), la photo par `photoValide` (en-tête `data:` et base64
  strict).

**Une seule dépendance circulaire**, et elle est inoffensive :
`src/i18n.ts:27` importe `src/i18n-parcours.ts`, qui n'importe en retour
qu'un TYPE (`src/i18n-parcours.ts:9`, `import type { Lang }`). Elle
disparaît à la compilation.

**Une frontière franchie** : les fonctions edge importent la couche `game/`
du client.

- `api/perf.ts:43-44` importe `src/game/daily` et `src/game/perfs` ;
- `api/moi.ts:30` importe `src/game/escalier` ;
- `api/amis.ts:33` importe `src/game/perfs`.

Ces trois modules n'importent aujourd'hui que `engine/` et `shared/`. Mais
`src/game/progress.ts`, leur voisin direct, touche `localStorage` : rien
n'empêche qu'un import de trop fasse un jour entrer du code de navigateur
dans une fonction edge. Le serveur de salons a un garde-fou équivalent
(`tests/image.test.ts`) ; `api/` n'en a pas.

---

## 2. Sécurité

### S1 — HAUTE · `api/ranked.ts` : le classement Elo se fixe depuis le client, et la liste publique publie les identifiants

```ts
// api/ranked.ts:217
// Le score adverse est relu du stockage, jamais accepté du client.
const oppScore = Number(body.opponentScore);   // :218 — lu dans la requête
const oppRating = Number(body.opponentRating);
```

Le commentaire dit l'inverse du code. Envoyer `opponentRating` très élevé avec
`opponentScore: 0` fait monter son Elo à volonté (`applyMatch`, juste en
dessous).

Deux autres défauts dans le même fichier :

- **`id` n'est jamais authentifié** : `const id = clean(body.id, 24)` (`:152`).
  Quiconque connaît un identifiant soumet à sa place et le RENOMME
  (`profileOf`).
- **La route publique rend les identifiants** :
  ```ts
  // :137
  .map(({ flags, ...p }) => ({ ...p, flags: undefined }))
  ```
  Seul `flags` est retiré ; `id` reste dans chaque ligne. Or cet `id` est
  l'`anonId` du joueur (`src/main.ts:4896`), c'est-à-dire aussi :
  - sa clé de reprise de siège en salon (`src/multi.ts:3364`, voir C1) ;
  - son identifiant de mesure (`src/main.ts:7912`).

**Portée réelle** :

- le mode est masqué côté client (`VITE_RANKED_URL` vide) et le stockage est
  une `Map` qui repart de zéro à chaque démarrage à froid ;
- mais le fichier est routé par Vercel : seuls les fichiers préfixés `_`
  sont exclus du routage. La route répond donc.

CLAUDE.md §9 signale `body.id` ; le score adverse lu du client et la fuite de
`id` dans `a=top` ne sont signalés nulle part.

### S2 — HAUTE · `verifyRun` ne valide pas le type des entrées du journal

`api/perf.ts` passe `corps.inputs` sans contrôle (« `as LoggedInput[]` »).
`verifyRun` ne vérifie que la longueur et la monotonie
(`src/engine/verify.ts:154`). Sonde exécutée, jour 280, catalogue 3 :

```
entrée null   => EXCEPTION Cannot read properties of null (reading 't')
t texte       => {"ok":true,"score":3,"duree":"abc382036403460"}
i = __proto__ => {"ok":true,"score":3,"duree":11420}
```

Trois défauts distincts :

- **`[null]` lève une exception.** `api/perf.ts` n'a aucun `try` autour de
  `verifyRun` (`:250`) : la fonction edge répond 500.
- **Un horodatage en texte est ACCEPTÉ** (`ok: true`).
  - La comparaison `next.t >= deadline` devient une comparaison de chaînes :
    les échéances cessent de s'appliquer.
  - `durationMs` devient une chaîne. Arrivée en `valeur2`
    (`Math.round(...)` → `NaN` → `null` en JSON), elle finit en échec
    d'écriture : un second chemin vers une erreur 500.
- **`i = "__proto__"` est accepté** : `ents[input.i]` (`verify.ts:118`) rend
  `Array.prototype`. Le serveur de salons se garde exactement de ce cas
  (`server/index.ts:1181-1185`) ; le rejeu non.

### S3 — MOYENNE · `api/perf.ts` : le client choisit le catalogue et les capacités, et les trois essais ne sont pas appliqués par le serveur

```ts
// api/perf.ts:247
catalogue: corps.catalogue === 3 ? 3 : corps.catalogue === 2 ? 2 : undefined,
```

- **Le client choisit le catalogue et les capacités.** Les quatre
  `capacites` sont lues de la même façon : seul `false` compte. Le serveur
  rejoue donc le run sur le catalogue et sous la règle allégée que le client
  annonce.
  - Pourtant, la clé du classement est seulement `cleDuJour(jour)`.
  - Résultat : des runs rejoués sur des épreuves différentes se comparent dans
    un même podium.
  - CLAUDE.md signale le cas téléphone et clavier, pas le choix libre du
    catalogue.
- **`DAILY_ESSAIS` n'existe que dans le client.** `api/perf.ts` ne compte
  aucun essai, et `posePerf` garde le maximum (`api/_depot.ts:699`). Le
  serveur accepte autant de tentatives que le quota (40 par heure,
  `api/_debit.ts`) en laisse passer.
  - Côté client, la limite se contourne aussi en ouvrant un second onglet
    (voir C2).

### S4 — MOYENNE · Salons : aucune limite sur `join`, `profil` ou `settings`

`server/index.ts:1063-1071` : `join` n'a ni compteur ni délai.

- Un code fait 4 caractères sur 31, soit 923 521 codes.
- Une seule socket peut énumérer tous les codes et entrer dans n'importe quel
  salon privé. L'arrivée en spectateur est permise par conception
  (`:1432`).

`profil` (`:995-1024`) : seule la PHOTO a un délai minimal. La carte change
librement, et chaque changement diffuse un `roomState` complet à tout le salon
(`:1018`). C'est un facteur d'amplification ×10 depuis un seul client.
`settings` (`:1102`) a la même forme, réservée à l'hôte.

### S5 — MOYENNE · `api/collect.ts` : un événement réécrit l'identifiant, le jour et l'heure serveur

```ts
// api/collect.ts:193-198
const out = { id, day, ev: e.ev, at: received };
for (const [k, v] of Object.entries(e)) {
  if (k === "ev" || k === "ts") continue;   // id, day, at ne sont PAS exclus
```

Sonde exécutée : `{ id: "moi", batch: [{ ev: "run_start", id: "quelqu-un", day: 1, at: 0 }] }`
→ ligne écrite :

```
{"id":"quelqu-un","day":1,"ev":"run_start","at":0}
```

Tout le rapport produit (entonnoir, D1, joueurs uniques ; CLAUDE.md §8 et
§12) repose sur ces champs.

Par ailleurs, la route n'a aucune limite de débit. Chaque appel écrit dans
Upstash, qui facture à la requête.

### S6 — BASSE · OAuth : l'état n'est lié ni au navigateur ni à un usage unique

- **Pas de lien au navigateur.** `faisEtat` (`api/auth.ts:158`) signe
  `fournisseur.horodatage.aléa` sans cookie ni PKCE. Un lien de retour
  intercepté ou préparé reste valable 10 minutes, pour n'importe quel
  navigateur : c'est la forme classique de l'attaque « login CSRF », qui
  connecte la victime au compte de l'attaquant.
- **Comparaison à durée variable.** La signature de l'état se compare par
  `!==` (`:177`), pas en temps constant, contrairement au jeton.

### S7 — BASSE · Pas de politique de sécurité de contenu (CSP), alors que le jeton vit dans `localStorage`

- Aucun en-tête dans `vercel.json`, aucun `<meta http-equiv>` dans
  `index.html`.
- Le jeton de compte est en `localStorage` (`src/compte/index.ts:68`).

Aucune injection n'a été trouvée (voir §1). Mais la seule défense est
aujourd'hui la discipline `textContent`, sans second rideau.

### S8 — BASSE · Noms : trois règles de nettoyage pour une même donnée, et un commentaire qui promet ce que le code ne fait pas

Trois nettoyages différents :

- `hello` : `String(msg.name).slice(0, 14).toUpperCase()`
  (`server/index.ts:942`). Les caractères de contrôle et les inversions
  bidirectionnelles (`U+202E`) passent.
- `normalisePseudo` (`shared/compte.ts:74`) : liste blanche Unicode.
- `clean` dans `api/ranked.ts` : une troisième liste blanche.

Le commentaire de `server/index.ts:969-971` affirme : « c'est ce qui règle
l'usurpation de nom à l'intérieur d'un salon : un nom vérifié ne se recopie
pas ».

- Or un `hello` anonyme peut prendre n'importe quel nom.
- Le pseudo n'est pas unique (`supabase/migrations/0001_comptes.sql:27`).
- Et rien dans le salon ne distingue un compte, par décision écrite
  (`server/index.ts:136-140`).

Le commentaire contredit le code qui l'entoure.

### S9 — BASSE · `/health` publie des informations d'exploitation sans authentification

`server/index.ts:850-866` rend, à n'importe qui :

- l'identifiant d'instance ;
- la mémoire ;
- le nombre de connexions ;
- l'image déployée ;
- le compteur d'exceptions rattrapées.

---

## 3. Concurrence et conditions de course

### C1 — HAUTE · Une coupure réseau « à moitié ouverte » fait perdre son siège, contrairement à la décision n°4

Le chemin, dans l'ordre :

1. **La reprise exige une ancienne socket déjà fermée côté serveur** :
   ```ts
   // server/index.ts:1405-1408
   (c) => c.key === client.key && c.ws.readyState !== WebSocket.OPEN
   ```
2. **Le serveur détecte une connexion morte en 15 à 30 s** : battement de 15 s
   (`:1536-1549`), en deux tours.
3. **Le client, lui, tente de revenir immédiatement** : 3 essais espacés
   de 800 ms (`src/multi.ts:409`, `attemptRejoin` à `:3256`).

Un téléphone qui change de réseau en pleine partie (Wi-Fi vers 4G) revient
donc PENDANT que son ancienne socket est encore ouverte côté serveur. Ce qui
suit :

- `fantome` est introuvable : le joueur entre comme une nouvelle personne,
  spectateur, sous un nouvel identifiant ;
- 15 à 30 s plus tard, l'ancienne socket tombe ; son sursis de 25 s
  (`:1354`) expire sans que personne ne le réclame, puisque la reprise ne se
  tente que dans `rejoindre` ;
- `leaveRoom` déclare alors forfait.

Dans l'intervalle, le même joueur apparaît deux fois dans la liste. Aucun
test ne couvre ce cas : l'e2e ferme ses sockets proprement.

### C2 — HAUTE · Deux onglets s'écrasent la sauvegarde, et les essais du jour se rechargent

```ts
// src/game/progress.ts:316, :464-479, :482-488
let cache: Save | null = null;               // lu UNE fois
export function load(): Save { if (cache) return cache; ... }
export function save(s: Save) { cache = s; localStorage.setItem(KEY, JSON.stringify(s)); }
```

Aucun écouteur `storage`, aucun `BroadcastChannel` dans `src/`. Chaque
`P.mutate` réécrit la sauvegarde ENTIÈRE à partir de la copie en mémoire de
l'onglet. Conséquences :

- l'onglet qui écrit en dernier efface les progrès de l'autre : pièces,
  étoiles, carnet ;
- un onglet ouvert avant trois essais du jour garde « 0 essai consommé », et
  en rend trois de plus ;
- les échecs d'écriture (quota dépassé, une photo peut peser 14 Ko) sont
  avalés : `catch { /* ignore */ }`, `:486`.

### C3 — MOYENNE · Le vote de l'imposteur peut bloquer un salon indéfiniment

Le vote ne se clôt QUE dans `poserVote` (`server/match.ts:769-790`) : majorité,
ou tout le monde a voté, ou tous les présents ont voté.

- Aucune minuterie n'encadre l'observation : `server/index.ts:782-784`
  diffuse `observe` puis rend la main.
- `leaveRoom` (`:1503`) ne réévalue pas la clôture quand un votant part.

Un votant qui ne vote jamais, ou un départ après un vote partagé, laisse donc
`room.match` posé pour toujours. `start` et `settings` répondent alors
`in_match` (`:1081`, `:1110`).

Le mode n'est plus proposé par l'interface (`index.html:1903`), mais
`lireMode` l'accepte toujours (`shared/protocol.ts:254`). Un message
`settings` forgé le rouvre donc.

### C4 — MOYENNE · Amis : vérifier puis écrire, sans transaction

```ts
// api/amis.ts:169-175
if ((await depot.amisDe(u.id)).length >= MAX_AMIS) ...  // lecture
await depot.lie(u.id, x.id);                              // écriture
```

- **Deux acceptations simultanées** dépassent `MAX_AMIS`.
- **Deux `ajoute` croisés simultanés** voient chacun « aucune demande reçue »
  (`:190`) et posent chacun une demande. CLAUDE.md promet que « deux demandes
  croisées valent accord » ; ici, elles restent deux demandes en attente.

### C5 — MOYENNE · Écritures Supabase en plusieurs temps, sans transaction

- **`cree`** (`api/_depot.ts:569-594`) : insertion de `utilisateur`, PUIS de
  `lien_plateforme`. Si la seconde échoue — par exemple deux retours OAuth
  simultanés sur un premier compte —, le compte orphelin reste en base.
- **`supprime`** (`:631-659`) enchaîne cinq requêtes ; la quatrième n'est même
  pas vérifiée :
  ```ts
  // :657
  await this.req(`utilisateur?id=eq.${e}`, { method: "PATCH", body: JSON.stringify({ code_ami: null }) });
  ```
  Une panne au milieu laisse un compte à moitié supprimé.
- **`revoque` et `leveDrapeau`** (`:619`, `:802`) lisent, ajoutent un, puis
  écrivent : deux appels concurrents perdent un incrément.

### C6 — BASSE · `NetClient.connect` réarme le ping sans éteindre le précédent

`src/net/client.ts:164` écrase `this.pingTimer` sans `clearInterval`.
Aujourd'hui `ensureConnected` crée une instance neuve à chaque reconnexion
(`src/multi.ts:3352-3356`) : le défaut est latent, pas actif.

---

## 4. Intégrité des données : le dépôt de test et celui de production divergent

Les tests n'exercent que `DepotMemoire` (18 usages). `DepotSupabase`, le seul
qui tourne en production, n'apparaît dans **aucun** fichier de test. Deux
divergences ont été trouvées en les comparant.

### D1 — HAUTE · La suppression de compte ne retire pas les performances en production

- **En mémoire**, `api/_depot.ts:285-287` :
  ```ts
  // Les performances sont des données personnelles rattachées au compte :
  // une demande de suppression les emporte.
  this.perfs = this.perfs.filter((p) => p.utilisateurId !== id);
  ```
- **Sur Supabase**, `supprime` (`:631-659`) ne touche pas à la table
  `performance`. La clé étrangère est bien `on delete cascade`
  (`0002_performances.sql:23`), mais la suppression est LOGIQUE : la ligne
  `utilisateur` reste, donc la cascade ne joue jamais.
- **Effet** : `classement` (`:742`) ne filtre pas `supprime_le`. Les scores
  d'un compte supprimé restent sur le podium, avec un pseudo vide.

### D2 — MOYENNE · L'égalité de score ne se départage pas pareil

- **En mémoire** (`:313-314`) : à score égal, la durée plus courte remplace.
- **Sur Supabase** (`:699`) : `&valeur=lt.${p.valeur}`. Seul un score
  strictement supérieur remplace ; une égalité plus rapide est ignorée.

C'est contraire au départage annoncé (« durée croissante », index
`performance_classement`). Les tests passent sur l'implémentation qui ne tourne
pas.

### D3 — MOYENNE · Un run rejeté pour excès de requêtes est jeté pour toujours

```ts
// src/compte/file.ts:220
if (res.status >= 500 || res.status === 401) restants.push(e);
else { /* jeté, avec raison */ }
```

`api/perf.ts` répond 429 quand le quota est atteint. Le code est un 4xx, donc
le run est retiré de la file comme s'il était invalide. Le score est perdu,
alors que le réessayer plus tard aurait suffi.

---

## 5. Erreurs silencieuses

Le dépôt compte 66 `catch`. La plupart sont voulus et commentés (vibreur,
`history`, navigation privée). Restent ceux qui perdent quelque chose sans le
dire :

| Où | Ce qui se perd |
|---|---|
| `src/game/progress.ts:485-488` | toute la sauvegarde, si l'écriture échoue (quota) |
| `src/compte/file.ts:74` | la file des runs à envoyer, si l'écriture échoue |
| `src/analytics/index.ts:168-169` | le lot de mesures : le booléen de `sendBeacon` est ignoré, et un `false` (file pleine) ne retombe pas sur `fetch` |
| `src/main.ts:3072-3083` | la copie du code ami. `navigator.clipboard?.writeText` ne fait RIEN si `clipboard` est absent, et l'échec est avalé ; le bouton ne réagit pas |
| `api/_debit.ts:92, :109, :114` | la limite de débit elle-même : toute panne d'Upstash l'ouvre (`ok: true`) |
| `server/index.ts:241-248` | `uncaughtException` est rattrapée et le processus CONTINUE. C'est un choix écrit, mais l'état d'un salon peut rester corrompu sans que rien ne le répare |
| `src/net/client.ts:208-209` | une coupure réseau est présentée aux écouteurs comme `room_unknown`. Deux causes différentes partagent un code |

---

## 6. Validations manquantes

Les failles déjà détaillées plus haut :

- **S2** : le journal de `verifyRun` (type de `t`, `k`, `i`, `key`) ;
- **S3** : `catalogue` et `capacites` dans `api/perf.ts` ;
- **S5** : les clés d'événement dans `api/collect.ts` ;
- **S8** : le nom du `hello`.

Et trois autres :

- **`decodeClient` ne valide que `t`** (`shared/protocol.ts:716-722`) : tout le
  reste est un `as ClientMsg`. Chaque `case` du serveur revalide à la main.
  C'est fait proprement aujourd'hui, mais le type ment au compilateur, qui ne
  signale donc aucun champ oublié.
- **La carte n'est validée qu'en forme côté serveur** (`carteValide`), jamais
  contre les cartes GAGNÉES. Un client modifié affiche n'importe quelle carte,
  y compris une règle jamais rencontrée (décision n°7). Un nom inventé provoque
  une requête `/cartes/<nom>.png` en 404 chez chaque membre du salon.
- **Le mode imposteur, retiré de l'interface, reste accepté par le serveur**
  (`shared/protocol.ts:254`, voir C3).

---

## 7. Couplages et responsabilités mélangées

### R1 — `src/main.ts` : 8 367 lignes, 85 imports, 75 variables globales

Mesuré dans le fichier :

- 75 `let` au niveau du module ;
- 113 `addEventListener` et **aucun** `removeEventListener` ;
- 109 appels `sfx.`, 33 `track(`, 26 `P.mutate`, 42 `show(`.

Le même fichier fait le routage d'écrans, la boucle de jeu, la persistance, la
mesure, le son, le compte et le rendu de tous les écrans de menu.

### R2 — `src/multi.ts` : tout le multijoueur dans UNE fonction

`initMulti` va de `src/multi.ts:965` à `:4266`, soit **3 301 lignes**. Dans
cette fermeture vivent ensemble :

- le protocole (`onMsg`, 198 lignes) ;
- la reconstruction des manches (`syncFrame`, 197 lignes) ;
- le DOM : 124 accès par identifiant ;
- l'historique du navigateur ;
- 36 variables d'état.

Rien n'en est testable de l'extérieur, d'où R3.

### R3 — Le couplage se voit dans les tests : 33 fichiers testent le TEXTE du code

33 fichiers de test font `readFileSync` sur des sources. Exemple,
`tests/playtest-247.test.ts:170` :

```ts
expect(source, "la garde `if (!match.round)` a disparu").toMatch(/if\s*\(!match\.round\)/);
```

Ce test casse sur un renommage correct, et passe sur un bug qui garde la même
orthographe. C'est la conséquence directe de R1 et R2 : le comportement est
enfermé dans des fermetures qu'aucun test ne peut appeler.

### R4 — État partagé par le DOM entre `main.ts` et `multi.ts`

- `#cardMultiState` est écrit par `renderHome` (`main.ts`) et par
  `setCarteMultiOccupee` (`src/multi.ts:3308-3321`).
- Le second MÉMORISE la valeur du premier pour la restaurer.

Un ordre d'appel différent restaure une valeur périmée. Le commentaire de
`multi.ts` décrit précisément ce piège, déjà payé une fois.

### R5 — Le serveur lit l'état privé de `MatchLogic` par un transtypage

```ts
// server/index.ts:1366-1368
return (match as unknown as { states: Map<...> }).states.get(id) ?? null;
```

Renommer le champ `states` dans `server/match.ts` passe `tsc` et casse la
clôture anticipée des manches : `allDone` à `:1236`.

### R6 — Le serveur de salons est un seul fichier de 1 594 lignes

Le gestionnaire `message` fait 397 lignes et 16 `case`. Le cycle de vie des
salons, le déroulement des matchs classique et coop, la reprise de siège et
l'exploitation (`/health`, arrêt) partagent le même état global (`rooms`,
`clients`).

---

## 8. Fonctions trop grosses

Mesuré sur l'arbre syntaxique, fonctions de 120 lignes et plus :

| lignes | fonction |
|---|---|
| 3 301 | `src/multi.ts:965` `initMulti` |
| 642 | `src/main.ts:4942` `finishRun` |
| 471 | `server/index.ts:892` gestionnaire `connection` |
| 466 | `src/main.ts:7418` `loop` |
| 397 | `server/index.ts:931` gestionnaire `message` |
| 257 | `src/main.ts:2127` `renderCompte` |
| 244 | `src/main.ts:1834` `renderCodex` |
| 216 | `src/render/scene.ts:1124` `draw` |
| 211 | `api/perf.ts:96` `traite` |
| 204 | `src/main.ts:3361` `openBrief` |
| 198 | `src/multi.ts:2911` `onMsg` |
| 197 | `src/multi.ts:3620` `syncFrame` |
| 195 | `src/engine/verify.ts:145` `verifyRun` |
| 188 | `src/main.ts:1020` `renderParcours` |
| 181 | `src/multi.ts:2345` `applyVerdict` |
| 170 | `src/render/skins.ts:157` `dessinePiece` |
| 162 | `src/main.ts:3745` `lanceRun` |
| 159 | `src/multi.ts:2733` `endMatch` |
| 148 | `src/multi.ts:731` `renderSettings` |
| 145 | `src/multi.ts:514` `renderLobby` |
| 144 | `api/moi.ts:254` `traite` |
| 136 | `api/ranked.ts:132` `handler` |

`finishRun` (642 lignes) écrit la sauvegarde, le carnet, la mesure, le compte
et l'écran de fin. C'est là que le bug « la montée repartait de zéro »
(CLAUDE.md §12) a pu passer.

---

## 9. Duplications

| Quoi | Où |
|---|---|
| calcul du jour UTC | `src/game/daily.ts:9` `dayIndex`, recopié en `api/perf.ts:88-89` et `api/amis.ts:62-63`. `api/perf.ts` importe pourtant déjà `daily.ts` |
| réponse JSON (`const json = …`) | 5 fichiers : `amis`, `auth`, `moi`, `perf`, `ranked` |
| `jetonPour` | `api/auth.ts:205` et `api/moi.ts:237`, corps identique |
| HMAC | `api/auth.ts` (`hmac`, sans cache de clé) en plus de `api/_jeton.ts` (`cle`, avec cache) |
| contrôle du jeton (jeton → `parId` → supprimé → banni → `versionJeton`) | 5 fois : `amis:141`, `auth:344`, `auth:355`, `moi:275`, `perf:194` |
| lecture de la config Upstash | `api/collect.ts:130` **sans** `cleanEnv`, contre `api/_debit.ts` **avec**. C'est exactement le piège du BOM (CLAUDE.md §3), resté ouvert sur la route de mesure |
| nettoyage d'un nom | 3 règles différentes (S8) |
| `$` = `getElementById` | `src/main.ts:154` et `src/multi.ts:68` |

---

## 10. Code mort

**Exports que rien n'importe**, ni le code ni les tests (13) :

- `src/audio/index.ts` : `isEnabled`, `isMusicEnabled` ;
- `src/compte/index.ts` : `glypheDuCompte` ;
- `src/engine/instructions/index.ts` : `SHAPE_LABEL_EN`, `TOUTES_LES_CONSIGNES` ;
- `src/engine/motifs.ts` : `MOTIFS_FR` ;
- `src/engine/rng.ts` : `rSome` ;
- `src/game/daily.ts` : `dailyRng` ;
- `src/game/progress.ts` : `isEncountered` ;
- `src/i18n.ts` : `estDebout`, `BRIEFS_COURTS_REGLES` ;
- `src/ranked/client.ts` : `localProfile` ;
- `src/render/but.ts` : `MEDIANE_CONNUE`.

**Exports utilisés SEULEMENT par les tests** : 21 au total, dont les plus
parlants :

- `src/game/escalier.ts` : `majEscalier`, `auSommet`, `ESCALIER_VIERGE`.
  L'écran ESCALIER a été retiré.
- `src/render/carte.ts` : `emblemeSvg`, `EMBLEMES_REGLES`, `emblemeDe`. Les
  emblèmes ont été remplacés par les PNG.
- `src/engine/imposteur.ts:204` : `refuseZoneAuRendu`. Son commentaire le
  présente comme le « filet du renderer d'observation », mais **aucun rendu
  ne l'appelle**. Le test vérifie une garde que la production n'exécute
  jamais.

**Code dormant** : le mode imposteur. La porte est fermée
(`index.html:1903-1925`), mais 99 mentions restent dans `multi.ts`,
`server/index.ts` et `server/match.ts`, et le serveur l'accepte toujours (C3).

**Fichiers hérités** :

- `the-one-rule-v1.html` : 150 Ko, versionné, dernière modification le
  04/09/2026, soit quatre semaines de jeu en retard.
- `inline.mjs:17` ne prend qu'UN fichier JS : `files.find(f => f.endsWith(".js"))`.
  Depuis le chargement à la demande du QR, le build en produit deux
  (`index-*.js`, `qr-*.js`). La version hors ligne régénérée n'aurait donc
  pas de QR.

---

## 11. Performance

Peu de problèmes mesurables, et ce rapport n'en invente pas.

- **Amplification réseau** du `profil` (S4) : un message produit dix
  `roomState` complets.
- **Requêtes en chaîne dans `api/amis.ts`.**
  - Chaque appel, même un GET, fait d'abord `codeAmi`, une à deux requêtes
    qui peuvent ÉCRIRE (`:144`).
  - `etat` ajoute quatre lectures, dont deux en série (`cercle`).
  - Un `ajoute` qui aboutit enchaîne jusqu'à cinq lectures avant d'écrire.
- **Charge** : 20 669 lignes de CSS. `theme.css` (5 728) redéfinit
  `style.css` (14 941) plutôt que de le remplacer ; l'ancienne identité
  « Nocturne » est livrée puis recouverte. Après gzip, cela fait 43 Ko : le
  coût est de maintenance plus que de transfert.
- **Rien d'anormal dans la boucle de jeu** : 3 accès DOM par identifiant,
  aucune lecture de mise en page systématique dans `loop`.

---

## 12. Déploiement

- **P1 — Une seule instance Fly, imposée par la documentation et non par le
  code.** `fly.toml:21-29` le dit en commentaire. Une seconde machine coupe les
  salons en deux en silence ; seul `scripts/check-salons.mjs` le détecte,
  après coup.
- **P2 — Front et salons sont déployés séparément** (dette connue, CLAUDE.md
  §9). Le code la négocie bien (`consignes`, `clavier`, `PROTOCOL_VERSION`).
  Le risque restant est humain : rien n'oblige à déployer Fly en même temps
  que Vercel.
- **P3 — La règle du jour dépend de la LONGUEUR de `ONE_RULES`.**
  `ruleOfDay` (`src/game/daily.ts`) mélange `ONE_RULES` par cycles de
  `ONE_RULES.length`. Ajouter une règle change la règle du jour EN COURS
  pour tout déploiement. Un onglet resté sur l'ancien bundle joue l'ancienne
  règle, et `api/perf.ts` rejoue sous la nouvelle : le run est rejeté
  (« run invalide »).
- **P4 — Aucun en-tête de sécurité** dans `vercel.json` (S7).
- **P5 — La route de mesure ne nettoie pas ses variables d'environnement** :
  `api/collect.ts:130` lit `process.env` directement. Un BOM dans la variable
  fait tout tomber dans le journal de la fonction edge, sans erreur visible
  (CLAUDE.md §3).
- **P6 — Le front est embarqué dans l'image du serveur.** L'image installe
  toutes les dépendances de production, y compris `@fontsource/*` et
  `qrcode-generator` (`Dockerfile`, `npm ci --omit=dev`), dont le serveur n'a
  aucun usage.
- **P7 — `the-one-rule-v1.html` et `inline.mjs` sont périmés** (§10).

---

## 13. Tests

- **T1 — La persistance de production n'a aucun test.** Voir §4 :
  `DepotSupabase` (environ 500 lignes de requêtes PostgREST écrites à la
  main) n'est exercé par aucun test, et deux divergences avec le dépôt en
  mémoire ont été trouvées.
- **T2 — Des tests sur l'orthographe du code** : 33 fichiers (R3).
- **T3 — Un test sur une garde que la production n'appelle pas** :
  `refuseZoneAuRendu` (§10).
- **T4 — Aucune mesure de couverture.** `package.json` n'a ni
  `@vitest/coverage-v8` ni script `coverage`. Rien ne dit quelle part de
  `main.ts` ou `multi.ts` les 1 204 tests touchent.
- **T5 — Les fonctions edge ne sont pas testées sur leurs entrées
  malformées.** Les sondes de S2 et S5 ont trouvé, en quatre essais, une
  exception non rattrapée et deux champs réécrits.
- **T6 — L'e2e ne couvre pas la reprise de siège sur coupure à moitié
  ouverte** (C1). Il ne couvre pas non plus le vote imposteur abandonné (C3)
  ni deux onglets simultanés (C2).
- **T7 — L'e2e dépend de la charge de la machine** (CLAUDE.md §9 et §12),
  alors que la CI le fait tourner sur un exécuteur partagé
  (`.github/workflows/verification.yml`).

---

## 14. Par où commencer

Classé par rapport entre le risque réel aujourd'hui et le coût du correctif.

| # | Quoi | Coût |
|---|---|---|
| 1 | **D1** : supprimer les `performance` dans `DepotSupabase.supprime` et filtrer `supprime_le` dans `classement`. C'est une donnée personnelle qui reste publiée | petit |
| 2 | **S2** : valider chaque entrée du journal dans `verifyRun` (`t` fini, `k` connu, `i` entier ou nul), et encadrer `api/perf.ts` d'un `try` | petit |
| 3 | **S5** : exclure `id`, `day` et `at` dans `api/collect.ts`, et y passer `cleanEnv` (P5). Les décisions produit reposent sur ces chiffres | très petit |
| 4 | **D2 et D3** : aligner le `PATCH` de `posePerf` sur l'ordre (valeur, puis durée), et garder les runs refusés en 429 | petit |
| 5 | **S1** : retirer `api/ranked.ts` du routage (le préfixer `_`) tant que le mode est masqué | très petit |
| 6 | **C1** : à la reprise, accepter un fantôme dont la socket est encore OUVERTE si la clé correspond, en terminant l'ancienne. Il faut d'abord décider ce que valent deux onglets | moyen, décision |
| 7 | **C2** : relire la sauvegarde sur l'événement `storage`, ou fusionner avant d'écrire | moyen |
| 8 | **C3** : borner l'observation par une minuterie serveur, ou retirer `imposteur` de `lireMode` | petit |
| 9 | **T1** : tester `DepotSupabase` contre le même jeu de tests que `DepotMemoire`, avec un PostgREST local ou un `fetch` simulé | moyen |
| 10 | **R1 et R2** : extraire de `initMulti` et `finishRun` les décisions pures, comme `plate`, `seat`, `jour`, `but` et `exploit` l'ont déjà été. C'est le seul chemin qui remplace les tests sur l'orthographe | gros, progressif |

Les points 6 et 10 sont des **directions**, au sens de CLAUDE.md §11 : ils
demandent une décision avant d'être faits.
