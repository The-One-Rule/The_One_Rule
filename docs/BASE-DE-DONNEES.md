# La base de données — refonte du 25/11/2026

Migrations `0006` à `0009`, ADR [0011](adr/0011-base-normalisee-transactions-par-fonctions.md).
Ce document dit **ce que la base contient, pourquoi elle a cette forme, et
comment on l'a éprouvée**. Pour l'architecture d'ensemble :
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Ce qui a été visé, et ce qui ne l'a pas été

La refonte vise **ce dépôt** : fonctions edge Vercel (`api/`), dépôt d'accès
(`api/_depot.ts`), Supabase/PostgreSQL atteint par PostgREST.

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

Le runtime edge ne peut pas ouvrir de socket Postgres : une requête PostgREST
est la seule transaction disponible. Chaque écriture à plusieurs lignes est
donc une **fonction SQL** appelée en RPC (`POST /rest/v1/rpc/<nom>`).

| opération | fonction | avant |
|---|---|---|
| créer un compte | `compte_cree` | 2 requêtes ; un échec laissait un compte **orphelin** |
| supprimer un compte | `compte_supprime` | 7 requêtes ; une panne laissait un compte **à moitié** effacé |
| progression + maîtrise | `agregats_ecrit` | CAS seul ; aucune table de progression |
| score, record, statistique | `performance_pose` | POST puis PATCH en cas de doublon |
| demander un ami | `amitie_demande` | 4 lectures, écriture, **relecture**, défaire (audit C4) |
| accepter un ami | `amitie_accepte` | lire, lier, recompter, défaire |
| acheter | `boutique_achete` | n'existait pas |
| importer un appareil | `boutique_importe` | n'existait pas |
| porter un style | `boutique_porte` | n'existait pas |

Verrous : `for update` sur la ligne `utilisateur` (achat, import,
suppression), sur les deux comptes d'une paire **dans un ordre fixe** (amis :
pas d'interblocage), et un verrou consultatif sur le lien (création).

⚠️ **La fusion n'est PAS en SQL.** Elle reste écrite une fois en TypeScript
(`fusionne`) ; `agregats_ecrit` ne fait que poser le résultat sous
compare-and-swap, et ses projections prennent le maximum — la même loi, sur
des valeurs déjà fusionnées.

⚠️ **Accès.** Postgres accorde `EXECUTE` à `PUBLIC` par défaut. Sans le
`revoke` de 0009, la clé publique du navigateur pourrait appeler
`boutique_achete` pour n'importe quel compte. Seul `service_role` les exécute.

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

**Non destructive.** 0006 convertit `u_<32 hex>` → uuid sans perte (c'était
un UUID sans tirets), garde l'ancien numéro de performance dans `ancien_id`,
et s'arrête AVANT tout changement si une seule valeur sort du format. 0008
archive les demandes croisées qu'il retire. Chaque migration est rejouable
sans effet.

**Retour arrière** — `supabase/retours/0009-0006.sql`, hors du dossier des
migrations pour que `supabase db push` ne l'applique jamais. Il restaure le
schéma de 0005 et les identifiants à l'octet ; il **détruit** ce qui est né
après (achats, soldes, records) : sauvegarder d'abord.

**Développement** — une base locale (`supabase start`, puis
`supabase db reset`, qui rejoue 0001 → 0009). Sans base, le dépôt en mémoire
(`DepotMemoire`) reproduit la loi de chaque fonction et fait tourner les tests.

**Production — à faire par Pierre, dans cet ordre, quand personne ne joue :**

1. sauvegarde (`pg_dump`, ou une sauvegarde Supabase) ;
2. `supabase db push` (ou l'éditeur SQL : 0006, 0007, 0008, 0009 dans l'ordre),
   et lire les avertissements de 0007 (contraintes laissées `NOT VALID`) ;
3. **aussitôt après**, fusionner la PR : Vercel déploie le front et les
   fonctions. ⚠️ Entre les deux, les comptes ne marchent pas : l'ancien code
   écrit des identifiants `u_…` dans une colonne uuid, le nouveau appelle des
   fonctions qui n'existent pas encore. Le jeu, lui, tourne (n°12) ;
4. `fly deploy` : le serveur de salons lit désormais les jetons à l'ancienne
   forme comme les neufs (`idCompte`). Sans ce déploiement, un même compte a
   deux identités dans un salon pendant 24 h — sans effet sur le jeu.

Les jetons déjà émis (`sub: "u_…"`) restent valides : `decoupe`
(`shared/jeton.ts`) normalise l'identifiant au seul point de lecture d'un jeton.

---

## 9. Validation — ce qui a été mesuré, et où

| quoi | où | résultat |
|---|---|---|
| migrations exécutées sur **PostgreSQL 17** (PGlite) avec des données « d'avant » (`u_…`, demandes croisées) | hors dépôt¹ | 71 vérifications, 0 échec |
| 0006 sur un identifiant hors format | hors dépôt¹ | refus, schéma intact (`text`, `bigint`) |
| rejouer 0001 → 0009 | hors dépôt¹ | rien de dupliqué ni de perdu |
| retour arrière puis réapplication | hors dépôt¹ | schéma de 0005, identifiants à l'octet, puis 0006→0009 repassent |
| le VRAI `DepotSupabase` contre ces fonctions (faux PostgREST qui traduit `rpc/` en arguments nommés) | hors dépôt¹ | 19 vérifications, 0 échec |
| dents : solde négatif, `EXECUTE` rendu à `PUBLIC`, record qui recule, argument RPC renommé | hors dépôt¹ | chacun fait tomber sa vérification |
| texte des migrations (RLS, `revoke`, `on delete` explicites, `compte_supprime`, catalogue = code) | `tests/migrations-sql.test.ts` | en CI |
| requêtes émises par `DepotSupabase` | `tests/depot-supabase.test.ts` | en CI |
| loi des fonctions reproduite en mémoire, routes | `tests/boutique-compte`, `collection-base`, `boutique-client` | en CI |

¹ `scripts/base/` — `migrations.mjs`, `refus-0006.mjs`, `retour.mjs`,
`depot.ts`. PGlite n'est pas une dépendance du dépôt (l'ajouter a été refusé
dans la session de refonte : c'est une décision à prendre, §10). Pour les
lancer sans toucher `package.json` :

```bash
npm i --no-save @electric-sql/pglite@0.3
node scripts/base/migrations.mjs supabase/migrations
node scripts/base/refus-0006.mjs supabase/migrations
node scripts/base/retour.mjs supabase/migrations supabase/retours/0009-0006.sql
npx vite-node scripts/base/depot.ts .
```

**Ce qui n'a PAS été vérifié** : une vraie instance Supabase (PostgREST réel,
rôles `anon` / `service_role`, version de Postgres de l'hébergeur) ; la
concurrence réelle (PGlite n'a qu'une connexion : les verrous sont écrits et
relus, pas mis en compétition).

---

## 10. Ce qui reste à trancher

1. ~~La boutique du compte n'est branchée à aucun écran.~~ **TRANCHÉ le
   25/11/2026 : elle RESTE côté serveur.** Le jeu lit la boutique de
   l'appareil (n°12) ; la route, le dépôt et le client existent, aucun écran
   ne les appelle, et c'est voulu. La rouvrir demandera de régler d'abord le
   vrai problème : une monnaie qui **décroît** ne fusionne pas par maximum
   comme le carnet — il faudrait un compteur de gains par appareil (monotone,
   lui) pour créditer sans compter deux fois.
2. **PGlite en dépendance de développement**, pour que la validation du §9
   tourne en CI au lieu d'à la main.
3. **`ancien_id`** de `performance` : à retirer après vérification en
   production (une migration de « contraction »).
4. **`meilleur_score` du run du jour** compare des jours différents (graines
   différentes) : c'est un record PERSONNEL, jamais un classement.
