# 0010 — React par étranglement : le DOM d'abord, l'état écran par écran

- **Statut** : Acceptée (phase 1 faite ; phase 2 à engager)
- **Date** : 15/10/2026
- **Décideur** : demande de migration vers React, avec une attention
  particulière à `index.html`

## Contexte

`index.html` faisait 2 132 lignes : le `<head>` (SEO, JSON-LD, icônes) et, dans
`#app`, TOUT le DOM de l'application — 16 écrans, la scène de jeu et ses neuf
surcouches, le HUD, le tchat. À côté, `src/main.ts` (8 397 lignes) et
`src/multi.ts` (4 285) lisent ces éléments par leur `id` dès leur évaluation et
les pilotent à la main (classe `hidden`, `innerHTML`, `textContent`).
Vingt-deux fichiers de test lisent `index.html` ou importent `main`/`multi` ;
environ 1 360 tests au total.

Réécrire d'un coup `main.ts`, `multi.ts` et le HTML sous forme de composants à
état aurait changé en même temps le balisage, la logique et les tests : au
premier test rouge, impossible de dire lequel des trois a bougé. Et ce projet
tient pour fatal un seul défaut — « le jeu triche » — que la boucle de jeu sur
canvas, très sensible au timing, est la mieux placée pour introduire.

## Décision

Migrer **par étranglement**, en deux phases dont chacune se vérifie seule.

**Phase 1 (faite) — React écrit le DOM, `main.ts` le pilote encore.**

- `index.html` ne garde que le `<head>` et un `<div id="app"></div>`.
- `src/ui/` contient le balisage, découpé en composants : `screens/` (un par
  écran, plus `Screen`), `play/` (terrain de jeu, HUD, pied, tchat),
  `play/stage/` (les surcouches de la scène), `chrome/` (navigation, barre
  haute, toasts). `Shell.tsx` les assemble dans l'ordre exact de l'ancien HTML.
- `src/monte.tsx` rend `Shell` de façon SYNCHRONE (`flushSync`) ; `src/entry.tsx`
  l'importe AVANT `main.ts`. L'ordre d'évaluation des modules ES garantit que le
  DOM existe quand `main.ts` le lit (`$("cv")` renverrait `null` sinon). Des
  imports statiques, pas un `import()` : le jeu reste dans le paquet que la page
  référence — `scripts/check-deploy.mjs` y cherche l'URL du collecteur et celle
  des salons, et ne lit que les `<script>` de la page — et le navigateur évite
  une cascade (entrée, puis jeu). Une première version avec `import()` a été
  écartée pour ces deux raisons.
- Les composants de `src/ui/` sont **statiques** : ni état, ni effet, ni
  gestionnaire. React les rend une fois et n'y touche plus ; ce que `main.ts`
  écrit dans le DOM n'est donc jamais écrasé. `tests/ui.test.ts` tient cette
  promesse (aucun hook, aucun `onClick`, imports limités à React et à
  `src/ui/`, ids uniques, ordre des blocs).
- Les tests qui lisaient `index.html` pour son corps lisent `pageHtml()`
  (`tests/helpers/page.ts`) : le `<head>` de `index.html` et le rendu de `Shell`.
  Ceux qui n'en lisent que le `<head>` (`seo`, `marque`, `installer`) sont
  inchangés.
- Les images passent par `asset()` (`src/ui/assets.ts`) : Vite réécrit les URL
  d'`index.html` d'après `base`, pas les chaînes d'un composant.

**Phase 2 (à faire) — l'état passe dans React, écran par écran.**

Un écran migré QUITTE `src/ui/` pour `src/features/<écran>/` : c'est cette
sortie, et non l'assouplissement de `tests/ui.test.ts`, qui le marque comme
migré. Ordre proposé : d'abord les écrans feuilles qui parlent peu au moteur
(Boutique, Réglages, Classement, Amis, Compte), puis le HUD et le multi, enfin
la scène. La boucle de jeu reste impérative derrière un hook (`useRef` sur le
canvas, `requestAnimationFrame` hors de React) : React n'a rien à gagner à
re-rendre 60 fois par seconde, et le rejeu serveur n'a rien à y perdre.

## Vérification de la phase 1

Faute de réseau, la migration a été validée hors CI, avec Chromium :

- DOM rendu comparé à l'ancien `index.html` : 935 éléments, 0 écart de
  structure, 0 écart de géométrie (bureau et mobile, écrans masqués ou non),
  `innerText` identique.
- Démarrage réel de `main.ts` sur le DOM rendu : 943 éléments identiques à
  l'ancienne version, `lang` et `placeholder` traduits.
- Sept scénarios de clic (entraînement, multi, codex, classement, escalade, run
  du jour), deux fenêtres : mêmes éléments, mêmes écrans visibles.

Les seuls écarts restants sont le préfixe `./` des URL d'image (que Vite
réécrit de toute façon dans l'ancien HTML) et la gigue de deux chronos
(`#timerFill`, `#vitChrono`), que l'ancienne version comparée à elle-même
montre à l'identique.

Cette validation a attrapé deux défauts de la conversion elle-même (quatre
éléments perdus derrière un `<img … />` auto-fermé ; un `&nbsp;` supprimé) :
la comparaison est nécessaire, pas décorative. Elle n'a **pas** remplacé
`npm test`, `npm run build` ni `npm run lint`, qui n'ont pas pu être lancés.

## Conséquences

- **Poids.** React et React DOM ajoutent ≈ 59 Ko gzip et le balisage compilé
  ≈ 14 Ko : **+73,9 Ko gzip** sur le paquet principal (115,7 → 189,6 Ko, mesures
  esbuild, à confirmer au premier `vite build`). En contrepartie l'ancien
  `index.html` (≈ 33 Ko gzip, commentaires compris) n'est plus servi : net ≈
  +40 Ko transférés. `scripts/taille-paquet.mjs` relève le plafond de `index`
  de 120 à 195 Ko, avec cette raison écrite.
- **Premier affichage.** Le HTML n'est plus servi dans la page : le premier
  affichage attend l'exécution du JS. Le jeu ne fonctionnait de toute façon pas
  sans JS, et le `<head>` (titre, descriptions, JSON-LD) est inchangé. Un
  pré-rendu au build (`renderToStaticMarkup` dans un plugin Vite) rendrait le
  balisage dès le premier octet ; il n'a pas été fait faute de pouvoir le
  tester ici.
- **Tests sous graine fixe.** React DOM consomme deux appels à `Math.random()`
  à son chargement côté client. Sans effet en production ; mais un test qui fige
  `Math.random` ET charge le client React verrait sa séquence décalée.
  `pageHtml()` n'utilise que `react-dom/server`.
- **Ordre des écrans.** `Shell` reproduit l'ordre des blocs de l'ancien
  `#app` ; la CSS et plusieurs tests en dépendent. Ne pas le réordonner sans
  relire `tests/ui.test.ts`.

## Alternatives écartées

- **Tout réécrire d'un coup** : trois variables changent ensemble, aucun test
  ne localise la panne.
- **Convertir `index.html` en JSX sans le découper** : déplace le fichier de
  2 100 lignes sans le résoudre.
- **Un état global (store) tout de suite** : prématuré tant que `main.ts` reste
  la source de vérité ; deux sources de vérité sont pires qu'une.
