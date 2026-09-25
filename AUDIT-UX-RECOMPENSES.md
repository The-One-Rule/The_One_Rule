# Audit — bugs, onboarding, récompenses (25/09/2026)

Branche `audit/ux-onboarding-recompenses`, partie de `origin/master` (`bf8f385`).
⚠️ Le `master` local avait **22 commits de retard** sur GitHub : l'audit porte
sur le code à jour, pas sur la copie locale.

État de la vérification :

| | résultat |
|---|---|
| `tsc --noEmit` | ✅ 0 erreur |
| `vitest` sous Node 26 | ❌ **22 échecs** (`file.test.ts`, `revendication.test.ts`) |
| `vitest` avec `NODE_OPTIONS=--no-experimental-webstorage` | ✅ **988 / 988** |
| `e2e.mjs` | ✅ 110 assertions, 0 échec, aucune marge serrée |
| `vite build` | ✅ (après `npm ci` : les polices Chakra Petch / DM Mono n'étaient pas installées en local) |

Le navigateur intégré a refusé d'ouvrir le serveur local : **rien de ce qui
suit n'a été vu à l'écran**. Tout est lu dans le code, avec la ligne.

---

## 1. Bugs — actuels

### B1. Le tutoriel enseigne LE SANG, puis la partie sert une AUTRE règle
`src/main.ts` `finitOnboarding` → `openBrief("training")` → `trainingRule()`.

Le commentaire dit : « le joueur vient de jouer trois manches sous LE SANG, il
sait ce qu'il fait ». C'est faux. `apresPiege()` écrit `sang` au carnet, et
`trainingRule` sert **en priorité une règle piégeuse jamais vue**
(`neuvesPiegeuses`, `src/game/daily.ts:97`). LE SANG vient d'être « vue », donc
elle est **exclue** : le joueur qui sort du tuto tombe sur LE GAUCHER, LA POINTE,
LE COLOSSE… — précisément les règles les plus dures (médianes 5 à 7), avec 3 s
de lecture et une fenêtre de 1500 ms. Il vient d'apprendre « pas de rouge », et
on lui change la règle sans le lui dire.

**C'est probablement une bonne part du « pas intuitif ».** Correctif : la
première partie après le tuto est **forcée sur LE SANG** (poser
`trainingRegle = "sang"` ou `pendingRule` directement), au moins pour un run.

### B2. Trois portes d'entrée contournent le tutoriel
`estNouveau()` n'est testé que sur `btnPlay` et `navJouer`. Un nouveau venu qui
clique **RUN DU JOUR** (`navDaily`, `profJour` → SOLO → `btnDaily`),
**ESCALADE** (`profEscalade`) ou **MULTI** arrive en partie réelle sans aucun
tutoriel. Sur le run du jour, il **brûle un de ses trois essais** à l'aveugle.
Leçon déjà écrite dans ce dépôt : « le garde-fou appartient au point de passage
commun, pas à chaque porte ». Correctif : le test dans `openBrief` (et à
l'entrée du lobby multi), pas sur les boutons.

### B3. 22 tests rouges sous Node ≥ 25
Node 25+ expose un `localStorage` natif qui masque celui de jsdom : `localStorage`
vaut `undefined` dans les tests `@vitest-environment jsdom`. Le projet déclare
`"engines": { "node": "22.x" }`, donc ce n'est pas un bug de jeu — mais
n'importe qui (toi, un contributeur, un CI mis à jour) verra 22 échecs sans
rapport avec son travail. Correctif : `NODE_OPTIONS=--no-experimental-webstorage`
dans le script `test`, ou un `.nvmrc` à 22.

### B4. `openRanked` détruit la carte RANKED
`src/main.ts` ~4225 : `const btn = $("btnRanked"); btn.textContent = …`.
`#btnRanked` est une carte à trois `<span>` — exactement le piège que
`tests/cartes.test.ts` existe pour refuser. Le test ne le voit pas parce qu'il
cherche l'écriture sur `$("btnRanked")` directement, pas via un alias. Masqué
en production (carte `hidden`), mais il mordra le jour où le classé revient.
Même fonction : `ONE_RULES.find(...)!` plante si le serveur nomme une règle
absente du bundle (la panne du playtest 247), et `if (!rule) return;` quitte en
silence après une attente de file.

### B5. Commentaires périmés dans `onboarding.ts`
`mancheDecouverte` est annoncée « TEMPS 3 », `manchePiege` « TEMPS 5 », et le
bloc d'en-tête parle d'« étape 5 / étape 6 » : c'est l'ancien tutoriel à six
temps. Il en a trois. Sans effet sur le jeu, mais c'est exactement le genre de
document qui ment (§2 du CLAUDE.md).

### B6. « DEMAIN » reste en français sur l'écran de fin anglais
`src/main.ts` ~4789 : `teaser.innerHTML = \`DEMAIN<b></b>\`` après un run du
jour. Écrit en dur, sans accent — donc invisible au filet i18n, qui ne cherche
que les accents. Même famille que `#multiLobbyCodeHint`.

## 2. Bugs — potentiels

- **P1. Trois définitions de « maîtrisée »** : `estMaitrisee` (15 manches + 1
  piège, `maitrise.ts`), l'échelle à 6 cases (`echelle.ts`), et l'escalier dont
  le palier 15 « déclare la maîtrise ». Une carte peut être « maîtrisée » dans le
  carnet, à 3 cases sur 6 sur la fiche, et au palier 4 dans l'escalier. Pour un
  joueur, c'est trois jauges qui se contredisent — et le mot le plus fort du jeu
  perd sa valeur.
- **P2. `ESCALADE` et `ESCALIER` sont deux modes différents avec presque le même
  nom.** La porte de l'accueil `profEscalade` mène à l'ESCALADE (règles
  empilées), pas à l'escalier. Un joueur qui cherche « les escaliers » clique
  dessus et atterrit ailleurs. Voir R3.
- **P3. `onboarded` n'est écrit qu'en fin de tuto.** Fermer l'onglet pendant le
  temps 3 laisse `sang` au carnet (écrit au temps 2) → `estNouveau()` devient
  faux → le joueur ne reverra jamais la leçon DÉJOUER. Mineur, mais c'est la
  leçon qui fait TOR.
- **P4. `majCarnet` reconstruit l'entrée** : le bug de l'escalier effacé a déjà
  été payé une fois. Chaque nouveau champ de carnet (et R-suivants en ajouteront)
  doit être branché aux trois bouts. `tests/majcarnet.test.ts` couvre, mais
  seulement les champs qui existent.

---

## 3. Onboarding — pourquoi « pas intuitif »

Le diagnostic, en une phrase : **le tutoriel est bon, mais tout ce qui l'entoure
défait ce qu'il vient d'apprendre.**

1. **B1 et B2** ci-dessus. Ce sont les deux premiers à corriger ; ils ne
   demandent aucune décision de direction.
2. **Trois manches ne suffisent pas à passer à 1500 ms.** Le tuto n'a pas de
   chrono (temps 1) puis 3000 ms (pièges) ; la partie suivante est à ~1500 ms
   avec un échauffement de 3 manches, puis la falaise de la manche 3 (76 morts).
   Proposition : un **premier run guidé** sous LE SANG, allure DÉBUT, dont
   l'échauffement est annoncé (« ENCORE 2 MANCHES SANS RISQUE ») et qui se
   termine d'office à 10 manches par un écran de victoire. Le premier run
   d'un joueur doit se finir sur une réussite, pas sur la médiane de 4.
3. **L'accueil vend l'entraînement, pas la progression.** PLAY → entraînement,
   « TRAINING · NO RISK ». Rien ne dit au joueur qu'il existe une collection à
   compléter et des escaliers à monter. Mettre sous PLAY une ligne de
   progression permanente : « 1 / 16 CARTES · PROCHAINE : PALIER 3 DU SANG ».
4. **Nommer les modes par ce qu'ils donnent**, pas par leur mécanique.
   ESCALADE, ESCALIER, ENTRAÎNEMENT, RUN DU JOUR, CLASSÉ : cinq noms pour un
   nouveau venu qui ne sait pas encore ce qu'est une règle. Suggestion :
   renommer l'ESCALADE (« CUMUL », « LA PILE ») pour libérer le mot escalier.
5. **Un seul appel à l'action par écran de fin.** Aujourd'hui : REJOUER,
   PARTAGER, CARTE, DÉFIER, invitation au compte, bandeau de mesure, avis… La
   fin d'un run est le seul moment où le joueur est disponible ; lui donner
   *une* suite évidente (voir R2).

## 4. Récompenses — pourquoi « pas de sensation »

Constat par le code :

- **Les pièces ne servent à rien.** `st.coins` monte (quêtes), s'affiche en
  chip sur SOLO, et ne s'échange contre rien. Une monnaie sans dépense apprend au
  joueur que les chiffres du jeu sont décoratifs — y compris les autres.
- **Franchir un palier = une ligne de texte.** « PALIER 8 FRANCHI » remplace le
  libellé sous le score. Pas de son dédié (`sfx.win` n'est joué que sur une
  promotion en classé, un duel gagné et le multi), pas d'animation, pas d'étape visible qui s'allume.
- **Débloquer une carte n'a pas de moment.** La carte entre au carnet ; l'écran
  de fin l'annonce dans un bloc parmi d'autres. C'est pourtant la seule vraie
  récompense du jeu (16 illustrations, faites pour ça).
- **Le piège déjoué a perdu sa voix** (retiré, à raison, du terrain) et rien ne
  le récapitule en fin de run.
- **Aucune récompense ne se VOIT ailleurs.** Ni signe, ni habillage, ni titre :
  ce qu'on gagne ne change rien à ce que les autres voient en salon.

### Propositions, par ordre de coût

| # | Proposition | Coût | Pourquoi |
|---|---|---|---|
| R1 | **Moment de palier** : écran/overlay dédié « PALIER 8 ▸ 9 », la marche qui s'allume, `sfx.win`, vibration. Même traitement, plus fort, pour une **carte débloquée** (la carte se retourne) et pour chaque **case d'échelle** franchie | faible | C'est ce que tes joueurs disent ne pas sentir. Tout existe déjà : il manque la mise en scène |
| R2 | **Écran de fin à suite unique** : si un palier est jouable pour la règle du run → « CONTINUER : PALIER N » en action principale ; sinon REJOUER. Le reste passe en secondaire | faible | Rend l'escalier trouvable sans ajouter de porte, et crée la boucle « un de plus » |
| R3 | **L'escalier sur l'accueil** : remplacer la porte ESCALADE par « TA MONTÉE » (la règle la plus avancée, son palier, un clic pour reprendre). L'escalade descend sur l'écran SOLO | faible | « escaliers pas faciles à trouver » : aujourd'hui c'est carte → fiche → escalier, trois clics depuis un écran que rien ne signale |
| R4 | **Une seule maîtrise** : l'escalier EST la maîtrise (palier 15 = maîtrisée, 20 = or). L'échelle à 6 cases devient ce qu'on montre sur la fiche, alignée dessus, et `estMaitrisee` lit l'escalier | moyen | Supprime P1. Un seul chiffre qui monte, visible partout |
| R5 | **Les pièces achètent de l'apparence** : dos de carte, signes (glyphes) supplémentaires, couleur du cadre en salon. `utilisateur.apparence` et `apparenceAutorisee()` existent déjà pour ça | moyen | Donne un sens à tous les chiffres, et rend visible en multi ce qu'on a gagné en solo — sans toucher au gameplay (n°12 intact) |
| R6 | **Objectif de session** visible en jeu : « PROCHAINE CARTE DANS 2 PIÈGES » dans la case META, qui sert déjà à l'exercice ciblé | faible | Une raison de refaire une partie, lisible sans quitter le jeu |
| R7 | **Récap de fin en séquence** : score → pièges déjoués (un par un, avec le son `trapAvoided`) → progression de carte → palier. 2 s, sautable | moyen | Transforme un tableau en moment ; c'est là que la plupart des jeux mobiles placent la dopamine |

**Ordre recommandé** : B1 + B2 (une heure, corrige le « pas intuitif » à la
source), puis R1 + R2 + R3 (la récompense se sent et l'escalier se trouve), puis
R4, puis R5. Ne pas faire R5 avant R4 : acheter de l'apparence avec une
progression incohérente ne réparera pas la sensation.

**Mesure à poser avant** : `onb_done → run_start` suivant (combien enchaînent
après le tuto), `palier_franchi`, et le taux de retour à l'escalier depuis
l'écran de fin. Sans eux on ne saura pas si R1-R3 ont bougé quelque chose.
