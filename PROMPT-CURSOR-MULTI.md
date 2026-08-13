# Prompt Cursor — THE ONE RULE Multijoueur, assemblage de l'interface

> **Contexte pour toi (pas pour Cursor).** Le cœur multijoueur est LIVRÉ et TESTÉ
> dans le zip : serveur complet, protocole, moteur déterministe, couche réseau,
> 89 tests verts, un match e2e à trois clients qui passe. Ce prompt ne fait pas
> réécrire ce code à Cursor — il lui fait construire la seule pièce manquante :
> l'INTERFACE du mode multijoueur dans `src/main.ts`, branchée sur `NetClient`.
> C'est volontaire : l'UI est la partie où un agent excelle, le netcode est la
> partie où il invente des bugs.
>
> Mode d'emploi : ouvre le projet dans Cursor, colle la SECTION A en premier
> message (Composer, mode Agent), puis les lots de la SECTION B un par un.

---

# SECTION A — Message d'ouverture

```
Tu travailles sur "The One Rule", un jeu de réflexes web. Le dépôt contient un
jeu solo COMPLET et FONCTIONNEL, plus un cœur multijoueur COMPLET, TESTÉ et
FONCTIONNEL (89 tests verts, e2e qui passe). Ta mission est UNIQUEMENT
d'assembler l'interface du mode multijoueur. Tu ne réécris rien d'existant.

# LE JEU MULTIJOUEUR (déjà implémenté côté logique)

Salon par code de 4 lettres (modèle BombParty). Tous les joueurs jouent CHAQUE
manche SIMULTANÉMENT : même scène, même consigne, mais chacun porte une RÈGLE
UNIQUE différente, affichée publiquement. Un piège est donc personnel : la
consigne "CLIQUE LE ROUGE" tue celui qui porte LE SANG s'il obéit, et les
autres le VOIENT venir — c'est le spectacle du jeu. 3 vies, élimination,
rotation des règles entre joueurs toutes les 8 manches, dernier en vie gagne.

# ARBORESCENCE EXISTANTE (ne pas modifier sauf mention explicite)

  shared/protocol.ts        ← protocole complet, typé, LIS-LE EN PREMIER
  server/match.ts           ← logique de match pure (règles, vies, verdicts)
  server/index.ts           ← serveur ws complet (npm run server, port 8787)
  src/engine/multiround.ts  ← draftShared/applyRule/buildMultiRound (déterministe)
  src/net/client.ts         ← NetClient + ServerClock, AUCUN DOM, LIS-LE EN SECOND
  src/main.ts               ← orchestration solo : écrans, boucle, rendu (TU ÉTENDS)
  src/render/scene.ts       ← SceneRenderer (draw({round,rule,now,ratio,reveal}))
  src/render/hud.ts         ← Hud (bandeau règle, consigne, timer)
  src/audio/index.ts        ← sfx.* et musicApi.*
  index.html                ← écrans solo existants (TU AJOUTES, tu ne casses pas)
  src/style.css             ← direction "signalétique" : PAS de dégradés, PAS de
                              coins arrondis hors pièces, capitales, monospace
  e2e.mjs                   ← match complet à 3 clients : npx tsx e2e.mjs

# INVARIANTS ABSOLUS

1. AUCUNE scène ne transite sur le réseau. Le client reconstruit chaque manche
   avec buildMultiRound(seed, idx, rule) — c'est déterministe, c'est déjà testé.
2. Toutes les dates du protocole sont sur l'HORLOGE SERVEUR. Conversion locale :
   net.clock.toLocal(serverTime). Jamais de Date.now() brut pour une échéance.
3. Le SERVEUR est le seul juge. Le client peut afficher un verdict anticipé
   (résolution locale pour le feel), mais l'état affiché des vies/scores vient
   TOUJOURS des messages "verdict" et "room".
4. Les inputs partent via net.sendInput(round, action) — index d'entité, jamais
   des coordonnées.
5. Interdits inchangés du projet : pas de logique de jeu dans render/, pas de
   dépendance npm nouvelle sans me demander, pas de setTimeout pour de la
   logique de jeu (les échéances viennent du serveur).

# CE QUE TU VAS CONSTRUIRE

Trois écrans + la boucle de manche multijoueur dans src/main.ts (ou un module
src/multi.ts importé par main.ts si tu préfères isoler) :
  1. écran REJOINDRE : créer un salon / entrer un code / lien d'invitation
  2. écran SALON : liste des joueurs avec leur RÈGLE affichée, bouton LANCER (hôte)
  3. pendant le match : plaques joueurs permanentes (nom, règle, vies, état de
     manche vert/rouge en direct), la scène du joueur local au centre
  4. écran FIN DE MATCH : podium, bouton REJOUER (relance dans le même salon)

Config : VITE_WS_URL (ex: ws://localhost:8787). Absente → bouton MULTIJOUEUR
masqué, le solo fonctionne exactement comme avant.

# MÉTHODE

Lots numérotés, un par un. Pour chaque lot : annonce en 3 lignes ce que tu vas
faire, code, vérifie `npx tsc --noEmit` ET `npx vitest run` (89 tests doivent
rester verts), ARRÊTE-TOI. Si un test existant casse, tu as modifié quelque
chose d'interdit : reviens en arrière au lieu de "réparer" le test.

Confirme, résume les invariants en 4 lignes, attends le lot 1.
```

---

# SECTION B — Les lots

### Lot 1 — État réseau et écrans statiques

```
Lot 1. Dans index.html, ajoute les écrans "multi-join", "multi-lobby",
"multi-end" (mêmes classes .screen/.btn/.chip que l'existant, style
signalétique strict) et un bouton MULTIJOUEUR sur l'accueil.

Dans src/main.ts (ou src/multi.ts importé) :
- instancie NetClient avec import.meta.env.VITE_WS_URL ; si absente, masque le
  bouton et n'instancie rien
- connexion au clic sur MULTIJOUEUR (pseudo repris de save.ranked.name, sinon
  demandé une fois), puis écran REJOINDRE
- créer/rejoindre → écran SALON qui écoute les messages "room" : liste des
  joueurs, badge HÔTE, la règle de chacun EN TOUTES LETTRES (via
  ruleById(p.ruleId)?.name), bouton LANCER visible seulement pour l'hôte
- lien d'invitation : location.origin+pathname + "#j=CODE" copié au clic ;
  au chargement, un hash #j=CODE ouvre directement REJOINDRE avec le code
  pré-rempli (réutilise le pattern de readChallenge dans src/game/replay.ts)
- gestion des erreurs protocole (room_unknown, room_full) en une ligne sous le
  champ, jamais en alert()

Vérifie tsc + vitest. Ne touche à rien du solo.
```

### Lot 2 — La boucle de manche multijoueur

```
Lot 2. Le match lui-même. À la réception de :

- "match_start" {seed, rules, firstRoundAt} : stocke seed et l'attribution,
  affiche un compte à rebours calé sur clock.toLocal(firstRoundAt), arme le
  bandeau HUD avec MA règle (hud.setRule), lance musicApi.start()
- "round" {idx, startAt, deadline, rules?} : si rules est présent (rotation),
  mets à jour l'attribution ET affiche 1,5 s un bandeau "LES RÈGLES TOURNENT"
  avec ma nouvelle règle en gros. Construis MA manche :
  buildMultiRound(seed, idx, ruleById(myRuleId)). La barre de temps utilise
  ratio = (clock.now() - startAt) / (deadline - startAt), borné [0,1] — le
  cadre périphérique du SceneRenderer prend ce même ratio.
- inputs : réutilise les handlers pointerdown/keydown existants du solo en les
  routant : en mode multi, chaque action part en net.sendInput(idx, …) ET est
  résolue localement (resolveAction + ma règle) pour le retour immédiat
  (particules, sons, verdict anticipé affiché en demi-teinte). L'affichage
  d'autorité arrive avec "verdict".
- "verdict" {outcomes, players, nextRoundAt} : fige la manche, joue le bon son
  pour MON outcome (sfx.trapAvoided si survive+trap, sfx.fail si death,
  sfx.success sinon), montre le tampon si je meurs, et pour CHAQUE mort d'un
  AUTRE joueur dont le piège vient de sa règle, flash court de sa plaque.
- si je suis éliminé (lives=0 dans players) : je reste dans le salon en
  spectateur — la boucle continue de dessiner les manches (je vois la scène),
  mes inputs ne partent plus.

Le solo doit rester intact : tsc + vitest verts, et une partie solo manuelle
doit se dérouler comme avant.
```

### Lot 3 — Les plaques joueurs (le spectacle)

```
Lot 3. La raison d'être du mode : VOIR les autres.

Bande de plaques permanente pendant le match (au-dessus du pied de page) :
une plaque par joueur — pseudo, sa RÈGLE en petites capitales, ses vies en
points pleins/creux, son score. États :
- pendant la manche : plaque neutre, liseré discret "en jeu"
- à la réception du verdict : vert bref (survive), VIOLET signal (survive+trap
  — il a déjoué son piège, c'est l'exploit à montrer), rouge + secousse CSS
  de la plaque (death), gris (idle/spectateur)
- éliminé : plaque barrée, conservée jusqu'à la fin du match

La plaque du joueur LOCAL est marquée (bordure papier). Les règles changent de
plaque à la rotation avec une transition de 300 ms max.

CSS : strictement le système existant (var(--signal), var(--paper), pas
d'arrondi, pas de dégradé). Les animations respectent
prefers-reduced-motion.
```

### Lot 4 — Fin de match et boucle sociale

```
Lot 4. À "match_end" {winnerId, players} :
- écran FIN : le vainqueur en très grand, classement dessous (vies puis score),
  sfx.win() si c'est moi, musicApi.stop()
- bouton REJOUER → renvoie sur l'écran SALON du même salon (le serveur remet
  inMatch=false tout seul) ; bouton QUITTER → net.leave() + retour accueil solo
- la ligne de partage du salon reste visible sur l'écran de fin : un match qui
  se termine est le moment où on invite quelqu'un d'autre

Test manuel obligatoire avant de conclure : `npm run server` dans un terminal,
`npm run dev` dans un autre, DEUX onglets navigateur, un match complet à deux.
Vérifie : compte à rebours synchrone, verdicts simultanés, rotation à la
manche 8, élimination, écran de fin, REJOUER. Puis `npx tsx e2e.mjs` doit
toujours afficher E2E OK, et vitest 89 verts.
```

---

## Rappels pour toi

- **Lance `npx tsx e2e.mjs` avant de commencer** : si E2E OK s'affiche, le
  serveur et le protocole marchent, et tout échec ultérieur vient de l'UI.
- Le serveur écoute sur 8787 (`npm run server`). En dev : `VITE_WS_URL=ws://localhost:8787`
  dans `.env.local`. En prod, le serveur ws se déploie sur Fly.io/Railway/VPS —
  PAS sur Vercel (les fonctions edge ne tiennent pas de WebSocket).
- Si Cursor casse un test existant, `git reset` et reformule le lot. Les 89
  tests sont le contrat : ils protègent le solo ET le netcode livré.
