# La base de données — refonte du 25/11/2026

Migrations `0006` à `0009`, ADR [0011](adr/0011-base-normalisee-transactions-par-fonctions.md) ;
puis **Prisma** le même jour : le schéma devient `prisma/schema.prisma`, les
écritures quittent le SQL pour `api/_depot-prisma.ts`, ADR
[0012](adr/0012-prisma-schema-source-et-runtime-node.md) — §6, §8 et §9.
Ce document dit **ce que la base contient, pourquoi elle a cette forme, et
comment on l'a éprouvée**. Pour l'architecture d'ensemble :
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Ce qui a été visé, et ce qui ne l'a pas été

La refonte vise **ce dépôt** : fonctions Vercel (`api/`), dépôt d'accès
(`api/_depot.ts`), Supabase/PostgreSQL — atteint par PostgREST au moment de la
refonte, par Prisma depuis (ADR 0012).

Le projet « NestJS + React CRUD » fourni à côté **n'a pas été repris**. C'est un
échafaudage généré par un outil (« MCD Creator ») à partir du même modèle, et
il ne peut pas servir de base :

- il **ne compile pas** (`friendships` déclaré deux fois dans `USER`, `CARD`
  deux fois dans `UserCards`, des relations inversées héritées du modèle) ;
- TypeORM y tourne en **`synchronize: true`** hors production : branché sur
  la base, il réécrirait le schéma à chaque démarrage ;
- sa connexion est factice (le formulaire mène à `/card` sans rien vérifier),
  son CORS ouvert à tous ;
- il ne connaît rien du jeu : ni rejeu (`verifyRun`), ni fusion monotone, ni
  suppression logique, ni jetons.

Le modèle MySQL fourni a servi de **référence d'intention**. Ses défauts, et
ce qu'on en a fait :

| défaut du modèle | traitement |
|---|---|
| FK inversées (`user_cards.user_id → CARD`, `CARD.id → user_cards`, `SKIN.id → user_skins.user_id`, `USER.id → friendship`…) | chaque FK part de l'enfant vers le vrai parent ; les tables de liaison n'ont aucune relation inverse |
| noms de contrainte dupliqués (`fk_card_user_cards`, `fk_user_friendship`) | noms par défaut de Postgres, uniques, sauf ceux que PostgREST cite (recréés à l'identique) |
| `DEFAULT (UUID())` sur des clés étrangères | jamais : une FK reçoit la clé du parent, pas une valeur inventée |
| `PURCHASE` en cascade sur le skin | `SET NULL` + copie du code et du prix payé : l'historique survit |
| `username UNIQUE` | **non** : le pseudo n'est pas unique, le glyphe distingue (voir `normalisePseudo`) |
| `theme`, `sound_volume`, `music_enabled` sur le compte | **non** : les réglages restent sur l'appareil (« synchroniser créerait des conflits multi-appareils pour zéro valeur », `shared/compte.ts`) |
| `STATISTIC.wins / losses` | **non** : le serveur de salons n'a pas de base, aucun résultat de match n'arrive ici — des colonnes que rien n'écrit seraient des zéros qui mentent |
| `RULE.title / description / total_*` | **non** : textes traduits (FR/EN) dans `src/i18n.ts` ; compteurs dérivables de `performance` |
| `CARD.name`, `SKIN.name`, `CHAPTER.title` | **non**, même raison : un nom affiché est traduit, la base garde le `code` |

---

## 2. Correspondance avec les entités demandées

Le dépôt écrit tout en français : les tables gardent cette convention.

| entité cible | table | nature |
|---|---|---|
| USER | `utilisateur` (existante) | + `pieces`, `skin_porte_id`, `carte_banniere_id` ; `id` en **uuid** |
| RULE | `regle` | catalogue, miroir du code |
| CARD | `carte` | catalogue, 1:1 avec `regle` |
| USER_CARDS (maîtrise) | `carte_utilisateur` | projection du carnet |
| SKIN | `skin` | catalogue, miroir du code |
| USER_SKINS | `skin_utilisateur` | possession |
| GAME_MODE | `mode_jeu` | catalogue |
| GAME_MODE_RULES | `mode_jeu_regle` | liaison N:N |
| CHAPTER | `chapitre` | catalogue, miroir de `CHAPITRES` |
| USER_CHAPTER_PROGRESS | `progression_chapitre` | projection du carnet |
| FRIENDSHIP | `amitie` + `demande_ami` (existantes) | durcies (voir §4) |
| STATISTIC | `statistique` | 1:1, opposable |
| HIGH_SCORE | `meilleur_score` | unique (compte, mode), opposable |
| PURCHASE | `achat` | historique, survit au style |
| — (ajout) | `mouvement_pieces` | grand livre du solde |
| — (ajout) | `archive_demande_ami_0008` | demandes croisées retirées par 0008 |

`performance` et `lien_plateforme` restent ; `performance.id` passe en uuid.

---

## 3. Schéma

```
                    ┌──────────── mode_jeu ─────────────┐
                    │ code UNIQUE, classable            │
                    └──┬──────────────┬─────────────┬───┘
            mode_jeu_regle (N:N)   chapitre       meilleur_score
                    │              (mode, numero)   (compte, mode) UNIQUE
                  regle ──1:1── carte                │
                    │             │                  │
                    │     carte_utilisateur     performance ── statistique (1:1)
                    │             │                  │
       progression_chapitre ──────┼──────────── utilisateur ── lien_plateforme
                                  │              │   │   │
                         skin ── skin_utilisateur┘   │   └── amitie / demande_ami
                          │                          │
                          └── achat ── mouvement_pieces
```

Cardinalités :

- `utilisateur` 1 — N `lien_plateforme`, `performance`, `carte_utilisateur`,
  `progression_chapitre`, `skin_utilisateur`, `achat`, `mouvement_pieces`,
  `meilleur_score` ; 1 — 0..1 `statistique` ;
- `regle` 1 — 1 `carte` ; `regle` N — N `mode_jeu` (par `mode_jeu_regle`) ;
  `regle` 1 — 0..1 `chapitre` par mode ;
- `utilisateur` N — N `carte` (par `carte_utilisateur`), N — N `skin` (par
  `skin_utilisateur`), N — N `chapitre` (par `progression_chapitre`) ;
- `utilisateur` 0..1 — `carte` (bannière), 0..1 — `skin_utilisateur` (porté) ;
- `amitie` : paire stockée dans les deux sens ; `demande_ami` : orientée, une
  par paire NON orientée.

---

## 4. Contraintes et index — chacun a sa raison

**Clés** — UUID partout (`gen_random_uuid()`), sauf les tables de liaison, dont
la clé est la paire de leurs FK.

**CHECK**

| contrainte | protège de |
|---|---|
| `utilisateur.pieces >= 0` | un découvert, même sous deux achats simultanés |
| `regle.code`, `skin.code`, `mode_jeu.code` : format | un code qui sortirait d'une URL ou d'un `url()` CSS |
| `carte.image ~ '^/cartes/…\.png$'` | un chemin arbitraire publié |
| `skin.prix >= 0`, `achat.prix_paye >= 0` | des prix négatifs |
| `progression_chapitre.etoiles` : 5 cases, 0 à 3 | une progression impossible |
| `termine_le` seulement si le boss a une étoile | une date de fin sans fin |
| `mouvement_pieces` : `delta <> 0`, débit ⇔ achat | un mouvement vide, un débit sans achat |
| `statistique.jours_classes <= runs_verifies` | une statistique incohérente |
| `amitie`, `demande_ami` : pas soi-même (existants) | l'auto-ajout |

**UNIQUE**

| contrainte | protège de |
|---|---|
| `carte.regle_id` | deux cartes pour une règle |
| `chapitre (mode, numero)`, `(mode, regle)` | deux chapitres au même rang, une règle deux fois |
| `skin.ordre` | deux styles à la même place |
| `meilleur_score (utilisateur, mode)` | deux records d'un même mode |
| `achat (utilisateur, cle_idempotence)` | un second débit sur une requête rejouée |
| `mouvement_pieces (utilisateur, cle)` | un import d'appareil crédité deux fois |
| `demande_ami (least, greatest)` | A→B et B→A en même temps |

**Index ajoutés** — uniquement là où une FK est parcourue depuis le parent
(cascade, `restrict`, `set null`) et qu'aucun index existant ne commence par
elle : `mode_jeu_regle(regle_id)`, `chapitre(regle_id)`,
`skin_utilisateur(skin_id)`, `achat(skin_id)`, `mouvement_pieces(achat_id)`,
`carte_utilisateur(carte_id)`, `progression_chapitre(chapitre_id)`,
`meilleur_score(performance_id)`. Les clés primaires et uniques qui commencent
par `utilisateur_id` servent déjà les lectures « d'un compte » : aucun index en
double.

**Clés étrangères vers un CODE** — `performance.mode → mode_jeu(code)` et
`performance.regle → regle(code)` : la colonne existait en texte, et la clé
étrangère sur le code évite une seconde colonne UUID qui dirait la même chose.
Posées `not valid` puis validées à part : une ligne ancienne inattendue est
signalée au lieu de bloquer le déploiement (les deux sont validées sur les
données de test).

---

## 5. Stratégie de suppression

La suppression d'un compte par le jeu est **logique** (`supprime_le`) — la
ligne reste, les cascades ne jouent donc pas : `compte_supprime` fait tout à la
main, dans une transaction.

| depuis | vers | règle | pourquoi |
|---|---|---|---|
| progression (`carte_utilisateur`, `progression_chapitre`, `statistique`, `meilleur_score`, `skin_utilisateur`) | `utilisateur` | CASCADE | données personnelles, sans valeur sans le compte |
| `achat`, `mouvement_pieces` | `utilisateur` | **RESTRICT** | un historique ne disparaît pas par effet de bord : effacer un compte « pour de vrai » doit être un geste écrit |
| tout ce qui désigne le catalogue | `regle`, `carte`, `chapitre`, `skin`, `mode_jeu` | **RESTRICT** | le catalogue ne se supprime pas, il se retire (`retire_le`) |
| `achat.skin_id` | `skin` | **SET NULL** | l'achat garde `skin_code` et `prix_paye`, copiés au moment de l'achat |
| `meilleur_score.performance_id` | `performance` | SET NULL | le record survit à la ligne qui l'a établi |
| `utilisateur.skin_porte_id` | `skin_utilisateur` | SET NULL (de cette colonne seule) | on ne porte que ce qu'on possède |
| `utilisateur.carte_banniere_id` | `carte` | SET NULL | dérivée de `apparence.carte` |
| `mode_jeu_regle` | `mode_jeu`, `regle` | CASCADE | liaison pure |

`compte_supprime` retire : liens, performances, records, statistique, cartes,
chapitres, amitiés, demandes, possessions ; vide pseudo et agrégats, retire le
code ami, monte `version_jeton`. Il **garde** les achats et le grand livre,
rattachés à une ligne sans pseudo.

---

## 6. Transactions

⚠️ **Depuis Prisma (ADR 0012), elles sont en TypeScript**, dans
`api/_depot-prisma.ts`, sous `$transaction`. Les fonctions `api/` tournent en
runtime Node et ouvrent une vraie connexion Postgres ; la raison d'être des
fonctions SQL de 0009 (« une requête PostgREST = la seule transaction
disponible en edge ») a disparu avec l'edge, et la migration
`1_fonctions_en_typescript` les a retirées. Leur texte reste lisible dans
`prisma/migrations/0_ligne_de_base`.

| opération | méthode de `DepotPrisma` | ex-fonction SQL | avant 0009 |
|---|---|---|---|
| créer un compte | `cree` | `compte_cree` | 2 requêtes ; un échec laissait un compte **orphelin** |
| supprimer un compte | `supprime` | `compte_supprime` | 7 requêtes ; une panne laissait un compte **à moitié** effacé |
| progression + maîtrise | `majAgregats` | `agregats_ecrit` | CAS seul ; aucune table de progression |
| score, record, statistique | `posePerf` | `performance_pose` | POST puis PATCH en cas de doublon |
| demander un ami | `demandeAmi` | `amitie_demande` | 4 lectures, écriture, **relecture**, défaire (audit C4) |
| accepter un ami | `accepteAmi` | `amitie_accepte` | lire, lier, recompter, défaire |
| acheter | `acheteSkin` | `boutique_achete` | n'existait pas |
| importer un appareil | `importeBoutique` | `boutique_importe` | n'existait pas |

Verrous, inchangés : `for update` sur la ligne `utilisateur` (achat, import,
suppression, performance), sur les deux comptes d'une paire **dans un ordre
fixe** — celui de la base, `order by id` (amis : pas d'interblocage) — et un
verrou consultatif sur le lien (création). Prisma n'a pas de `for update` :
ces verrous sont les seuls `$queryRaw` du dépôt. Chacun a un test de
concurrence qui tombe quand on le retire (§9).

⚠️ **La fusion n'est toujours PAS dans la base.** Elle reste écrite une fois
(`fusionne`) ; `majAgregats` pose le résultat sous compare-and-swap, et ses
projections prennent le maximum — la même loi, sur des valeurs déjà fusionnées.

**Ce qui a changé de forme avec Prisma** (migration 1), parce que Prisma ne
sait pas le décrire et finirait par le défaire :
- `carte_banniere_id` reste DÉRIVÉE de `apparence.carte`, mais par le dépôt,
  dans la même écriture — plus par un déclencheur ;
- `progression_chapitre.termine` n'est plus une colonne générée : « terminé »
  se lit `etoiles[5] > 0` ;
- la clé du style porté est `NO ACTION` et non `SET NULL (skin_porte_id)` :
  la suppression du compte remet le style porté à NULL avant de retirer les
  possessions, comme le faisait déjà `compte_supprime`.

**Accès.** La connexion de Prisma porte les droits du PROPRIÉTAIRE des tables ;
le RLS sans politique de chaque table ne bloque que la clé publique du
navigateur (PostgREST), qui n'a plus aucun usage dans le jeu. `DATABASE_URL`
ne quitte jamais le serveur.

---

## 7. Projection et opposabilité

Deux familles, qui ne se mélangent jamais (décision n°14) :

- **opposable** — `meilleur_score`, `statistique` : nourris par la seule
  `performance`, donc par des runs rejoués. Un run jugé douteux reste dans
  `performance`, il ne devient jamais un record ;
- **affirmé** — `carte_utilisateur`, `progression_chapitre`, `pieces` :
  ce que le client a déclaré. La projection (`api/_projection.ts`) range le
  carnet déjà fusionné ; la maîtrise est jugée par `estMaitrisee`, la même
  fonction que l'écran.

---

## 8. Migration

### Le schéma est `prisma/schema.prisma` (ADR 0012)

On ne rédige plus de migration à la main. On modifie le schéma, puis :

```bash
# une base locale jetable suffit ; SHADOW_DATABASE_URL en est une seconde
DIRECT_URL=postgresql://…/tor_dev SHADOW_DATABASE_URL=postgresql://…/tor_fantome \
  npx prisma migrate dev --create-only --name <sujet>
```

et on **relit** le `migration.sql` produit avant de le committer. Trois choses
que Prisma n'écrit jamais, et qu'il faut ajouter à la main dans la migration :

- `alter table <t> enable row level security;` pour toute table neuve
  (`tests/migrations.test.ts` le refuse sinon) ;
- les `check` (Prisma ne les décrit pas, il ne les défait pas non plus) ;
- le remplissage du catalogue (une règle neuve = une ligne dans `regle` et
  `carte` ; `tests/depot-contrat` compare la base au code).

⚠️ **Ce que Prisma voit mal, et qu'une migration générée peut vouloir défaire**
— le lire avant d'accepter : l'index d'expression `demande_ami_paire`
(`least`, `greatest`), les clés `NOT VALID` de 0007, la table
`archive_demande_ami_0008` (`@@ignore`). La CI (`npm run base:derive`) dit si
le schéma et les migrations divergent.

### L'histoire, gardée

`prisma/migrations/0_ligne_de_base` est la **concaténation exacte** des neuf
migrations écrites à la main (0001 → 0009, retirées de `supabase/`). 0006
convertit `u_<32 hex>` → uuid sans perte et s'arrête avant tout changement si
une valeur sort du format ; 0008 archive les demandes croisées qu'il retire.
Chaque bloc est rejouable sans effet.

**Retours arrière** — dans `prisma/retours/`, hors du dossier des migrations
pour que `migrate deploy` ne les applique jamais :
- `1-0.sql` défait la migration 1 (recrée fonctions, déclencheur, colonne
  générée, clé `SET NULL`), sans perte ;
- `0009-0006.sql` (historique) défait 0009 → 0006 et **détruit** ce qui est né
  après 0008 (achats, soldes, records) : sauvegarder d'abord.

**Développement** — une base PostgreSQL locale (Postgres.app, Docker, ou
`supabase start`), puis `DIRECT_URL=… npm run base:migre`. Sans base, le dépôt
en mémoire (`DepotMemoire`) fait tourner les tests ; `TOR_BASE_TEST_URL` fait
passer la même suite sur une vraie base (⚠️ elle est EFFACÉE).

### Production — à faire par Pierre, une fois, dans cet ordre

La production est à 0009 (appliquée fichier par fichier, avant Prisma).
**L'ordre sans trou est : le CODE d'abord, la migration ensuite.** Le nouveau
code n'appelle aucune fonction SQL et ne lit pas `termine` : il tourne sur la
base d'aujourd'hui — mesuré, les 39 tests du contrat passent sur une base qui
n'a reçu que `0_ligne_de_base` (`TOR_BASE_JUSQUA=0_ligne_de_base`). L'ancien
code, lui, casse dès que la migration 1 a retiré les fonctions qu'il appelle.

1. sauvegarde (`pg_dump`, ou une sauvegarde Supabase) ;
2. poser `DATABASE_URL` sur Vercel (pooler Supabase, **mode transaction**,
   port 6543) — voir docs/DEPLOIEMENT.md. Sans elle, les comptes se taisent
   (« indisponibles ») mais le jeu tourne (n°12) ;
3. dire à Prisma que la ligne de base est déjà là — elle ne s'exécute PAS :
   ```bash
   DIRECT_URL="<connexion directe>" npx prisma migrate resolve --applied 0_ligne_de_base
   ```
4. fusionner la PR : Vercel déploie les fonctions en runtime Node ;
5. **ensuite**, appliquer la migration 1 :
   ```bash
   DIRECT_URL="<connexion directe>" npm run base:migre
   ```
6. vérifier : `DIRECT_URL=… npm run base:etat` dit que la base est à jour, et
   `DIRECT_URL=… npx prisma migrate diff --from-config-datasource --to-schema
   prisma/schema.prisma --exit-code` rend 0.

Pour la suite, la règle reste celle-ci : une migration qui RETIRE quelque chose
part APRÈS le code qui ne s'en sert plus ; une migration qui AJOUTE ce dont le
code a besoin part AVANT lui.

Les jetons déjà émis (`sub: "u_…"`) restent valides : `decoupe`
(`shared/jeton.ts`) normalise l'identifiant au seul point de lecture d'un jeton.

---

## 9. Validation — ce qui a été mesuré, et où

| quoi | où | résultat |
|---|---|---|
| la ligne de base sur une base vide = la prod (0001→0009 fichier par fichier) | PostgreSQL 16, à la main (25/11) | `pg_dump --schema-only` identique |
| la migration 1 sur la prod et sur la ligne de base | idem | schémas identiques ; 0 fonction SQL restante |
| retour `1-0.sql` après la migration 1 | idem | schéma de la ligne de base (seule `termine` change de position) |
| le **contrat** du dépôt : 15 scénarios communs aux deux dépôts, plus 9 propres à PostgreSQL | `tests/depot-contrat.test.ts` | en CI (service `postgres:16`) |
| le nouveau code sur la base d'AVANT la migration 1 (fonctions SQL encore là) | idem, `TOR_BASE_JUSQUA=0_ligne_de_base` | 39 tests sur 39 (25/11) |
| concurrence : demandes croisées, double acceptation, double achat, double création, même révision, deux runs — chaque course rejouée 25 fois | idem | dents : chaque verrou retiré fait tomber son test 3 fois sur 3 |
| le catalogue en base = le code, après toutes les migrations | idem | en CI |
| schéma Prisma ↔ migrations (`migrate diff`, base fantôme, puis base neuve déployée) | job `base` de `verification.yml` | ⚠️ jamais vu tourner au 25/11 : le moteur de schéma ne se télécharge pas dans les sessions cloud (§3 de CLAUDE.md) |
| texte : RLS de toute table, plus aucune fonction SQL, `onDelete` et `map:` explicites, catalogue | `tests/migrations.test.ts` | en CI |
| les fonctions CONSTRUITES par `vercel build` (runtime Node) se chargent et lisent/écrivent par Prisma | à la main (25/11) | 6 fonctions chargées ; `moi`, `boutique`, `amis` répondent 200 sur PostgreSQL |
| imports relatifs `.js` sur le graphe de chaque fonction Node | `tests/imports-node.test.ts` | en CI |

**Ce qui n'a PAS été vérifié** : une vraie instance Supabase (pooler
Supavisor en mode transaction avec `pg`, version de Postgres de l'hébergeur),
et le premier passage du job `base` en CI.

---

## 10. Ce qui reste à trancher

1. ~~La boutique du compte n'est branchée à aucun écran.~~ **TRANCHÉ le
   25/11/2026 : elle RESTE côté serveur.** Le jeu lit la boutique de
   l'appareil (n°12) ; la route, le dépôt et le client existent, aucun écran
   ne les appelle, et c'est voulu. La rouvrir demandera de régler d'abord le
   vrai problème : une monnaie qui **décroît** ne fusionne pas par maximum
   comme le carnet — il faudrait un compteur de gains par appareil (monotone,
   lui) pour créditer sans compter deux fois.
2. ~~PGlite en dépendance de développement.~~ **Sans objet depuis Prisma** :
   la CI fournit un vrai PostgreSQL au contrat du dépôt.
3. **`ancien_id`** de `performance` : à retirer après vérification en
   production (une migration de « contraction »).
4. **`meilleur_score` du run du jour** compare des jours différents (graines
   différentes) : c'est un record PERSONNEL, jamais un classement.
