# Inventaire avant refonte (24/11/2026)

Mesuré sur `master` au moment du lot 0. Aucun comportement de jeu n'a été
changé pour produire ce relevé. Les correctifs du lot 1 sont notés à part,
en fin de fichier, une fois faits.

## Messages client (`shared/protocol.ts`)

16 variantes, et le `switch` de `server/index.ts` les couvre toutes :

| `t` | Champs | Garde actuelle |
|---|---|---|
| `hello` | `v`, `name`, `glyph?`, `key?`, `rookie?`, `clavier?`, `tok?`, `consignes?`, `reprise?` | version stricte ; chaînes coupées ; `=== true` ; consignes entier borné |
| `create` | — | — |
| `join` | `code` | 4 signes de l'alphabet dictable |
| `quick` | — | ignoré par un serveur ancien |
| `leave` | — | — |
| `start` | — | hôte seulement |
| `settings` | `settings` partiel | hôte seulement, valeurs bornées ensuite |
| `watch` | `playerId` | — |
| `emote` | `k` | entier, débit |
| `cursor` | `x`, `y` | coop seulement, borné |
| `chat` | `text` | contrôles retirés, `CHAT_MAX_LEN`, débit |
| `kick` | `playerId` | hôte seulement |
| `ping` | `sent` | — |
| `profil` | `carte?`, `photo?` | `shared/profil.ts` ignore un champ invalide |
| `vote` | `playerId` | une voix, observation |
| `input` | `round`, `at`, `action` | `k` parmi `c`/`k`/`r`/`l` ; index entier ou nul |

`decodeClient` ne vérifie aujourd'hui que « objet + `t` chaîne », puis le
`switch` retranche. Un payload invalide peut donc être typé `ClientMsg` avant
le cas. Le lot 2 doit rendre le décodage exhaustif : message inconnu, JSON
invalide, tailles, bornes, enums, et **aucune mutation** après un rejet.

## Écrans feuilles et qui écrit leur DOM

Tous dans `src/main.ts`. Le classement du jour n'est pas le mode classé.

| Écran | Fonction | Ids écrits (extrait) | Données partagées |
|---|---|---|---|
| Réglages | `renderReglages` (~1609) | `rglAllure`, `rglTheme`, `reglagesFineprint` | sauvegarde locale (`progress`) |
| Boutique | `renderBoutique` (~1383) | `boutiquePieces` | `game/boutique.ts`, pièces |
| Classement | `renderClassement` (~2714) | écran `#classement` | `api/perf.ts` via `compte/` — **vivant** |
| Amis | rendu ~2800 | `amisCode`, `amisListe`, `amisErr`, `amisOk`, `amisForm` | `compte/amis.ts`, jeton |
| Compte | `renderCompte` (~2149) | `compteAnon`, `compteConnecte`, `compteErr`, `profilNom` | `compte/`, et `Save.ranked.name` comme nom local |

`Save.ranked` (nom, elo local) n'est **pas** le matchmaking. `api/perf.ts`
importe `src/ranked/antibot.ts`. Supprimer `src/ranked/` casserait le podium.

## Branche `origin/test_migration_react`

Un commit (`0557afa`, 15/10/2026), ~10 000 lignes, 70 fichiers. Utile : `src/ui/`,
ADR 0010, `tests/helpers/page.ts`. Bruit : `migration-react.patch` (6 357 lignes).
Poids annoncé dans l'ADR, hors Vite : +73,9 Ko gzip, plafond proposé 195 Ko.
**Ne pas merger.** Socle à reconstruire au lot 6, après un budget mesuré.

## Poids initial (build Vite, avant React)

Relevé du 24/11/2026, `npm run taille` :

- JS d'entrée : 110,8 Ko gzip (plafond 120)
- CSS : 35,6 Ko gzip (plafond 39)
- QR à la demande : 7,3 Ko gzip

Le plafond de 120 Ko **ne bouge pas** tant qu'une ADR n'a pas justifié une
hausse avec un avant/après. On ne le relève pas pour coller à une mesure.

## DOM

`index.html` : 2 132 lignes, 466 `id`. `main.ts` lit 289 ids, `multi.ts` 92,
tous présents dans le HTML au moment du relevé. Les cinq écrans feuilles sont
des `<section class="screen hidden">`.

## Lot 1 — ce qui a été fait, et ce qui ne l'a pas été

Fait :

- délais de 5 s sur les 8 `fetch` du client (`src/reseau.ts`) ;
- codes de salon et identifiants via `node:crypto` (`server/code.ts`) — les
  graines de manche restent `Math.random`, elles ne sont pas un secret ;
- `api/_ranked.ts` retiré ; `src/ranked/` conservé (voir le tableau) ;
- `noUncheckedIndexedAccess` activé ;
- événement `erreur` (dédoublonné, 8/min, pas de réentrance, URL et jeton retirés).

Le prototype Bureau non suivi (`bureau.html`, `VISION-BUREAU.md`, `maquettes/`,
`src/render/{bureau,gpu,mur,signe}.ts`, images non versionnées de
`public/cartes/`) est retiré. Les 16 cartes déjà dans git sont restées.

Pas fait ici : la migration React.

## Lot 2 — contrat des messages

`valideClient` dans `shared/protocol.ts`, appelé par `decodeClient`.
Un message illisible vaut `null` : le salon ne bouge pas. Les clés inconnues
sont ignorées (un champ facultatif n'incrémente pas `PROTOCOL_VERSION`).
Une valeur du mauvais type est refusée.

Vérifié : 1 383 tests unitaires, puis l'e2e des salons — 166 assertions,
0 échec, dont le corpus de 324 messages malformés (erreurs rattrapées 0 → 0)
et le `hello` de mauvaise version qui ferme encore la socket.
