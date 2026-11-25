-- ===================================================================
-- 0_ligne_de_base — l'état de la production au 25/11/2026.
--
-- C'est la concaténation EXACTE des neuf migrations écrites à la main
-- (`supabase/migrations/0001` à `0009`, retirées du dépôt avec l'arrivée de
-- Prisma), dans l'ordre, sans une ligne changée : rejouée sur une base vide,
-- elle reconstruit ce qui tourne en production.
--
-- ⚠️ EN PRODUCTION, ELLE N'EST PAS APPLIQUÉE : elle l'est déjà, fichier par
-- fichier. On la MARQUE comme appliquée, une fois :
--
--     npx prisma migrate resolve --applied 0_ligne_de_base
--
-- Ses blocs sont idempotents (`if not exists`, `on conflict do nothing`,
-- gardes dans les `do $$`), mais la rejouer sur la production n'apporte rien
-- et ne doit pas devenir une habitude. Voir docs/BASE-DE-DONNEES.md §8.
--
-- Les fonctions SQL de 0009 et le déclencheur de 0008 y sont encore : la
-- migration suivante (`1_fonctions_en_typescript`) les retire, leur loi
-- vivant désormais dans `api/_depot.ts`.
-- ===================================================================


-- ###################################################################
-- 0001_comptes.sql
-- ###################################################################

-- ===================================================================
-- LOT A — le socle d'identité.
--
-- Ce que cette migration installe est INVISIBLE pour un joueur : aucune
-- fonctionnalité de jeu n'en dépend, et TOR reste intégralement jouable
-- sans qu'une seule ligne n'existe ici.
--
-- Trois couches d'identité, jamais confondues (voir shared/compte.ts) :
--   · l'appareil    — anonId en localStorage, ne disparaît jamais ;
--   · le compte TOR — utilisateur.id, opaque, permanent ;
--   · la plateforme — lien_plateforme, N vers 1, révocable.
--
-- C'est ce découpage, et lui seul, qui rendra Steam ou Epic gratuits plus
-- tard : une ligne de plus dans lien_plateforme, aucune reprise de données,
-- aucune migration de l'identité.
-- ===================================================================

-- -------------------------------------------------------------------
-- utilisateur
-- -------------------------------------------------------------------
create table if not exists utilisateur (
  -- Opaque, généré par nous. JAMAIS dérivé d'un e-mail ni d'un identifiant
  -- de fournisseur : le jour où Steam impose le sien, il devient un lien de
  -- plus, pas une clé primaire à changer.
  id             text primary key,

  -- Le pseudo n'est PAS unique — voir normalisePseudo() dans shared/compte.ts.
  -- L'unicité créerait de la friction à l'inscription au pire moment sans
  -- empêcher l'usurpation (les homoglyphes passent tout filtre raisonnable).
  -- Deux joueurs du même nom se distinguent par leur glyphe.
  pseudo         text not null default '',

  -- Sac OUVERT, en JSONB, et c'est le point d'évolutivité principal de cette
  -- table. Il ne porte aujourd'hui que { "glyphe": n }. L'habillage des
  -- cartes de partie, puis ce qui s'y accrochera, s'ajoutera comme une clé
  -- de plus — sans migration, sans déploiement coordonné, et sans toucher au
  -- protocole des salons. Ce qui manquera alors est une table de possession
  -- et une règle dans apparenceAutorisee() : rien d'autre.
  apparence      jsonb   not null default '{"glyphe": 0}'::jsonb,

  -- Carnet, série, records — voir Agregats dans shared/compte.ts.
  -- En JSONB parce que ce sont des dictionnaires courts et toujours lus
  -- ensemble : les normaliser coûterait trois jointures pour zéro requête
  -- que l'on souhaite écrire.
  agregats       jsonb   not null default '{}'::jsonb,

  -- Concurrence optimiste. La fusion des agrégats est écrite UNE fois, en
  -- TypeScript (fusionne()), et surtout pas redite en plpgsql : deux
  -- implémentations de la même règle finiraient par diverger, et le symptôme
  -- serait un carnet qui rétrécit — invisible, définitif.
  -- L'atomicité vient donc d'un compare-and-swap sur cette colonne, pas
  -- d'une fusion côté base.
  revision       integer not null default 0,

  -- Révocation à une colonne : « se déconnecter partout » = +1.
  -- Le serveur de salons ne peut pas la vérifier (il n'a pas de base, et lui
  -- en donner une mettrait un aller-retour réseau sur le chemin d'entrée du
  -- multijoueur). La durée de vie du jeton — 24 h — EST donc la fenêtre de
  -- révocation en multi. Voir shared/jeton.ts.
  version_jeton  integer not null default 0,

  -- Cumul de suspicion. Rien ne l'écrit au lot A ; il existe pour que le
  -- durcissement du lot D n'ait pas à migrer la table.
  drapeaux       integer not null default 0,

  cree_le        timestamptz not null default now(),
  vu_le          timestamptz not null default now(),
  banni_le       timestamptz,

  -- Effacement LOGIQUE d'abord : le lien de plateforme, lui, part tout de
  -- suite (voir plus bas), sinon se reconnecter ressusciterait un compte
  -- supprimé.
  supprime_le    timestamptz
);

-- Aucune colonne e-mail, et c'est délibéré. L'identifiant du fournisseur
-- suffit à retrouver un compte ; stocker l'adresse ajouterait une donnée
-- personnelle sans usage, c'est-à-dire de la responsabilité pure. Le jour où
-- une récupération hors fournisseur sera nécessaire, ce sera une colonne de
-- plus — pas une reprise.

-- -------------------------------------------------------------------
-- lien_plateforme
-- -------------------------------------------------------------------
create table if not exists lien_plateforme (
  -- 'google' | 'discord' aujourd'hui. 'steam' | 'epic' un jour, sans que
  -- rien d'autre ne bouge.
  fournisseur     text not null,
  id_externe      text not null,
  utilisateur_id  text not null references utilisateur(id) on delete cascade,
  cree_le         timestamptz not null default now(),
  primary key (fournisseur, id_externe)
);

create index if not exists lien_plateforme_utilisateur
  on lien_plateforme (utilisateur_id);

-- -------------------------------------------------------------------
-- Accès
-- -------------------------------------------------------------------
-- RLS activé SANS aucune politique : la clé anonyme ne peut donc rien lire
-- ni écrire. Tous les accès passent par les fonctions edge, qui portent la
-- clé de service. C'est le défaut sûr — une table sans RLS dans Supabase est
-- lisible par quiconque trouve la clé publique, qui est par construction
-- dans le bundle du navigateur.
alter table utilisateur      enable row level security;
alter table lien_plateforme  enable row level security;

-- ###################################################################
-- 0002_performances.sql
-- ###################################################################

-- ===================================================================
-- LOT C — les performances.
--
-- ⚠️ CETTE TABLE NE CONTIENT QUE DU VÉRIFIÉ.
--
-- Une performance y entre uniquement si le serveur a REJOUÉ son journal
-- d'entrées avec le moteur pur (src/engine/verify.ts) et produit le score
-- lui-même. On ne stocke jamais un score affirmé par un client.
--
-- Tout le reste — carnet, série, records d'entraînement et d'escalade —
-- vit dans utilisateur.agregats, qui est explicitement NON vérifiable et
-- ne sert qu'au joueur lui-même. Les deux ne doivent jamais se confondre :
-- c'est ce qui garantit qu'un futur classement ne partira pas de faits
-- invérifiables hérités d'avant les comptes.
--
-- Aucun classement n'est construit ici. Cette table est l'infrastructure
-- qui en rendra un possible, rien de plus — d'où l'index sur la clé de
-- comparabilité, qui est la seule chose qu'un classement aurait à lire.
-- ===================================================================

create table if not exists performance (
  id              bigserial primary key,
  utilisateur_id  text not null references utilisateur(id) on delete cascade,

  -- 'daily' aujourd'hui, et lui seul : c'est le seul mode dont deux
  -- résultats se comparent directement (même graine, même règle pour tout
  -- le monde). L'escalade demanderait d'étendre verify.ts aux PILES de
  -- règles, et le multijoueur n'est pas classable tant que les salons sont
  -- privés à code — deux amis y produiraient cent victoires en une soirée.
  mode            text not null,

  -- La clé de comparabilité : mode + régime + version de contenu + jour.
  -- Deux performances ne se comparent QUE si elle est identique. C'est la
  -- loi de shared/compte.ts, matérialisée ici pour qu'un classement n'ait
  -- qu'un index à lire.
  cle             text not null,

  -- Dénormalisées depuis la clé pour pouvoir filtrer sans la décomposer.
  version_contenu text not null,
  jour            integer,

  graine          bigint not null,
  regle           text not null,

  -- valeur : ce qui se compare. valeur2 : ce qui départage — la durée pour
  -- le run du jour, où beaucoup de joueurs finissent les 40 manches.
  valeur          integer not null,
  valeur2         integer not null default 0,

  -- Toujours vrai dans cette table. La colonne existe pour qu'une requête
  -- de classement porte le filtre explicitement plutôt que de s'appuyer sur
  -- une convention qu'on aura oubliée.
  verifiee        boolean not null default true,

  -- Le verdict du contrôle d'automatisation (src/ranked/antibot.ts).
  -- « douteux » est conservé mais ne devra jamais alimenter un classement.
  verdict_bot     text not null default 'humain',

  cree_le         timestamptz not null default now()
);

-- UNE performance par compte et par clé.
--
-- Pour le run du jour, la clé contient le jour : c'est donc une soumission
-- par compte et par jour, ce qui borne gratuitement la triche par
-- répétition. C'est aussi la raison pour laquelle la forme quotidienne est
-- la seule forme de classement raisonnable à ce stade.
create unique index if not exists performance_unique
  on performance (utilisateur_id, cle);

-- L'index qu'un classement lirait : meilleure valeur d'abord, départage
-- croissant sur valeur2 (la durée). Il ne sert à rien aujourd'hui, et il
-- coûte trois lignes — c'est exactement ce qu'on entend par « préparer
-- l'infrastructure sans construire la fonctionnalité ».
create index if not exists performance_classement
  on performance (cle, valeur desc, valeur2 asc)
  where verifiee;

alter table performance enable row level security;

-- ###################################################################
-- 0003_amis.sql
-- ###################################################################

-- ===================================================================
-- LOT D — les amis.
--
-- Comme les deux précédentes, cette migration est INVISIBLE pour qui ne
-- l'utilise pas : aucune fonctionnalité de jeu n'en dépend (décision n°12).
-- Les amis sont une couche au-dessus du compte, qui est lui-même une couche
-- au-dessus de l'appareil.
--
-- Ce qu'un ami voit de l'autre se limite à ce que le classement du jour
-- publie déjà — pseudo, signe, carte — plus ses scores du jour VÉRIFIÉS.
-- Jamais les agrégats (affirmations du client, décision n°14), jamais
-- l'identifiant de compte.
-- ===================================================================

-- Le code qu'on se donne à l'oral. Six lettres, attribué au premier besoin
-- (voir api/amis.ts), unique. Nul tant qu'on n'a pas ouvert l'écran des amis.
alter table utilisateur add column if not exists code_ami text;
create unique index if not exists utilisateur_code_ami
  on utilisateur (code_ami) where code_ami is not null;

-- Une amitié est MUTUELLE et stockée dans les deux sens : lire ses amis est
-- alors une seule requête sur un index, sans « or » ni union. Donner son
-- code vaut consentement ; retirer un ami efface les deux lignes.
create table if not exists amitie (
  utilisateur_id  text not null references utilisateur(id) on delete cascade,
  ami_id          text not null references utilisateur(id) on delete cascade,
  cree_le         timestamptz not null default now(),
  primary key (utilisateur_id, ami_id),
  check (utilisateur_id <> ami_id)
);

-- La comparaison de la semaine lit les performances de plusieurs comptes sur
-- une fenêtre de jours : c'est cet index qui la sert.
create index if not exists performance_par_jour
  on performance (utilisateur_id, jour);

alter table amitie enable row level security;

-- ###################################################################
-- 0004_demandes_ami.sql
-- ###################################################################

-- ===================================================================
-- LOT E — les DEMANDES d'ami.
--
-- Rapporté par Pierre : « si on veut ajouter quelqu'un en ami on ne lui
-- demande même pas l'autorisation ». Jusqu'ici, taper un code liait les
-- deux comptes d'office (« donner son code vaut accord »). C'était défendable
-- tant qu'un code ne circulait qu'à l'oral ; mais un code se recopie, se
-- montre, se devine sur un écran — et être ajouté par quelqu'un qu'on ne
-- connaît pas, c'est lui ouvrir ses scores de la semaine.
--
-- Une demande est ORIENTÉE (de → à) et stockée UNE fois. L'amitié ne naît
-- que de l'acceptation, et elle reste stockée dans les deux sens (0003).
-- Les amitiés déjà nouées ne bougent pas : elles ont été faites sous
-- l'ancienne règle, et les défaire en silence ferait disparaître des amis.
--
-- Comme les précédentes, invisible pour qui ne s'en sert pas (n°12).
-- ===================================================================

create table if not exists demande_ami (
  de_id    text not null references utilisateur(id) on delete cascade,
  a_id     text not null references utilisateur(id) on delete cascade,
  cree_le  timestamptz not null default now(),
  primary key (de_id, a_id),
  check (de_id <> a_id)
);

-- Les demandes REÇUES se lisent par destinataire.
create index if not exists demande_ami_par_destinataire on demande_ami (a_id);

alter table demande_ami enable row level security;

-- ###################################################################
-- 0005_purge_performances_supprimees.sql
-- ###################################################################

-- ===================================================================
-- 0005 — les performances des comptes déjà supprimés.
--
-- La suppression d'un compte est LOGIQUE (`supprime_le`), donc le
-- `on delete cascade` de `performance.utilisateur_id` (0002) ne joue
-- jamais. Jusqu'ici `DepotSupabase.supprime` ne retirait pas les
-- performances : les scores d'un compte supprimé restaient publiés sur le
-- podium du jour, sous un pseudo vide.
--
-- Le code les retire désormais à la suppression. Cette migration nettoie
-- ce qui a été supprimé AVANT ce correctif. Elle est idempotente : la
-- rejouer ne retire rien de plus.
-- ===================================================================

delete from performance
where utilisateur_id in (select id from utilisateur where supprime_le is not null);

-- ###################################################################
-- 0006_identifiants_uuid.sql
-- ###################################################################

-- ===================================================================
-- 0006 — les identifiants passent en UUID.
--
-- Refonte de la base, étape 1 sur 4 (voir docs/BASE-DE-DONNEES.md).
--
-- `utilisateur.id` était un TEXTE de la forme `u_<32 hexadécimaux>` :
-- `nouvelId()` prenait un `crypto.randomUUID()` et en retirait les tirets.
-- C'était donc DÉJÀ un UUID, simplement mal typé. La conversion est sans
-- perte et réversible : `u_0123…` ↔ `0123…` (Postgres lit un UUID sans
-- tirets). Le retour arrière est écrit dans `supabase/retours/0006.sql`.
--
-- `performance.id` était un `bigserial` : il devient un UUID, et l'ancien
-- numéro est GARDÉ dans `ancien_id` (rien ne le lit ; le supprimer est une
-- décision à part, après vérification en production).
--
-- ⚠️ IDEMPOTENTE ET PRUDENTE. Tout se fait dans UN bloc : si une seule
-- valeur n'a pas la forme attendue, le bloc lève et RIEN n'a changé —
-- Postgres annule tout le DDL d'une transaction. Rejouée sur une base déjà
-- convertie, elle ne fait rien.
--
-- ⚠️ Les noms de clés étrangères sont recréés À L'IDENTIQUE :
-- `api/_depot.ts` les nomme dans ses jointures PostgREST
-- (`amitie_ami_id_fkey`, `demande_ami_de_id_fkey`, `demande_ami_a_id_fkey`).
-- Un nom différent casserait la liste d'amis sans une erreur au déploiement.
-- ===================================================================

do $$
begin
  if (select data_type from information_schema.columns
       where table_schema = current_schema() and table_name = 'utilisateur' and column_name = 'id') = 'uuid' then
    raise notice '0006 : utilisateur.id est déjà un uuid, rien à faire';
    return;
  end if;

  if exists (select 1 from utilisateur where id !~ '^u_[0-9a-f]{32}$') then
    raise exception '0006 : un identifiant de compte n''a pas la forme u_<32 hex> — migration annulée, rien n''a changé';
  end if;

  alter table lien_plateforme drop constraint if exists lien_plateforme_utilisateur_id_fkey;
  alter table performance     drop constraint if exists performance_utilisateur_id_fkey;
  alter table amitie          drop constraint if exists amitie_utilisateur_id_fkey;
  alter table amitie          drop constraint if exists amitie_ami_id_fkey;
  alter table demande_ami     drop constraint if exists demande_ami_de_id_fkey;
  alter table demande_ami     drop constraint if exists demande_ami_a_id_fkey;

  alter table utilisateur     alter column id             type uuid using substr(id, 3)::uuid;
  alter table lien_plateforme alter column utilisateur_id type uuid using substr(utilisateur_id, 3)::uuid;
  alter table performance     alter column utilisateur_id type uuid using substr(utilisateur_id, 3)::uuid;
  -- Les deux colonnes d'une paire dans UNE instruction : le CHECK
  -- `utilisateur_id <> ami_id` ne sait pas comparer un uuid à un texte, et
  -- convertir l'une après l'autre échoue (mesuré : 42883, uuid <> text).
  alter table amitie
    alter column utilisateur_id type uuid using substr(utilisateur_id, 3)::uuid,
    alter column ami_id         type uuid using substr(ami_id, 3)::uuid;
  alter table demande_ami
    alter column de_id type uuid using substr(de_id, 3)::uuid,
    alter column a_id  type uuid using substr(a_id, 3)::uuid;

  -- Un compte créé par la base elle-même (fonction compte_cree) reçoit son
  -- identifiant ici ; le code continue de le fournir, et c'est le même type.
  alter table utilisateur alter column id set default gen_random_uuid();

  alter table lien_plateforme add constraint lien_plateforme_utilisateur_id_fkey
    foreign key (utilisateur_id) references utilisateur(id) on delete cascade;
  alter table performance add constraint performance_utilisateur_id_fkey
    foreign key (utilisateur_id) references utilisateur(id) on delete cascade;
  alter table amitie add constraint amitie_utilisateur_id_fkey
    foreign key (utilisateur_id) references utilisateur(id) on delete cascade;
  alter table amitie add constraint amitie_ami_id_fkey
    foreign key (ami_id) references utilisateur(id) on delete cascade;
  alter table demande_ami add constraint demande_ami_de_id_fkey
    foreign key (de_id) references utilisateur(id) on delete cascade;
  alter table demande_ami add constraint demande_ami_a_id_fkey
    foreign key (a_id) references utilisateur(id) on delete cascade;
end $$;

-- performance.id : bigserial → uuid, l'ancien numéro conservé.
do $$
begin
  if (select data_type from information_schema.columns
       where table_schema = current_schema() and table_name = 'performance' and column_name = 'id') = 'uuid' then
    raise notice '0006 : performance.id est déjà un uuid, rien à faire';
    return;
  end if;

  alter table performance rename column id to ancien_id;
  -- Un défaut VOLATIL est évalué ligne par ligne à l'ajout de la colonne :
  -- chaque performance existante reçoit son propre UUID.
  alter table performance add column id uuid not null default gen_random_uuid();
  -- La clé primaire déménage AVANT de relâcher `ancien_id` : une colonne de
  -- clé primaire ne peut pas perdre son NOT NULL (mesuré).
  alter table performance drop constraint performance_pkey;
  alter table performance add constraint performance_pkey primary key (id);
  alter table performance alter column ancien_id drop default;
  alter table performance alter column ancien_id drop not null;
end $$;

-- ###################################################################
-- 0007_catalogue.sql
-- ###################################################################

-- ===================================================================
-- 0007 — le catalogue en base : règles, cartes, styles, modes, chapitres.
--
-- Refonte de la base, étape 2 sur 4 (voir docs/BASE-DE-DONNEES.md).
--
-- ⚠️ LE CODE RESTE LA SOURCE DE VÉRITÉ. Règles, chapitres et styles sont des
-- DONNÉES DE CODE (`src/engine/rules/`, `src/game/parcours.ts`,
-- `src/game/boutique.ts`) : le moteur pur en a besoin sans réseau, et
-- `verifyRun` rejoue un run sans base. Ces tables en sont le MIROIR, avec un
-- `code` stable (l'identifiant du code : « sang », « neon »…) et un UUID pour
-- que la progression des joueurs ait de vraies clés étrangères.
--
-- `tests/catalogue-base.test.ts` relit le remplissage ci-dessous et le compare
-- au code : ajouter une règle sans migration fait tomber la suite.
--
-- ⚠️ ON NE SUPPRIME JAMAIS une ligne de catalogue. Une règle ou un style
-- retiré du jeu reçoit `retire_le` : la progression et l'historique d'achats
-- qui le désignent restent lisibles. D'où `on delete restrict` partout où un
-- joueur pointe vers le catalogue.
--
-- Ce qui n'est PAS stocké, et pourquoi : les NOMS et descriptions. Ils sont
-- traduits (FR/EN, `src/i18n.ts`) ; les recopier ici ferait deux sources qui
-- divergeraient à la première retouche de texte.
-- ===================================================================

create table if not exists regle (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-zA-Z]{2,32}$'),
  -- La règle peut-elle PIÉGER ? (`OneRule.traps`) — la famille d'une carte.
  piege       boolean not null,
  -- Exige-t-elle une touche tenue (`watchRelease`) ? Injouable au doigt.
  maintien    boolean not null default false,
  retire_le   timestamptz,
  cree_le     timestamptz not null default now()
);

-- Une carte PAR règle, et une seule : l'unicité de `regle_id` porte le 1:1.
create table if not exists carte (
  id          uuid primary key default gen_random_uuid(),
  regle_id    uuid not null unique references regle(id) on delete restrict,
  -- Chemin servi par `public/` ; l'image d'une carte verrouillée n'est
  -- jamais chargée (décision n°7), ce chemin ne fuit donc rien.
  image       text not null check (image ~ '^/cartes/[a-zA-Z]{2,32}\.png$'),
  cree_le     timestamptz not null default now()
);

create table if not exists skin (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z]{2,32}$'),
  prix        integer not null check (prix >= 0),
  -- L'ordre d'affichage de la boutique ; deux styles ne partagent pas une place.
  ordre       smallint not null unique check (ordre >= 0),
  retire_le   timestamptz,
  cree_le     timestamptz not null default now()
);

create table if not exists mode_jeu (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z]{2,32}$'),
  -- Ses résultats sont-ils OPPOSABLES (rejoués par `verifyRun`) ? Seul le
  -- run du jour l'est aujourd'hui (décision n°14).
  classable   boolean not null default false,
  cree_le     timestamptz not null default now()
);

-- Les règles qu'un mode peut tirer. Table de LIAISON pure : sa ligne ne
-- porte aucune histoire, elle suit donc ses deux parents (cascade).
create table if not exists mode_jeu_regle (
  mode_jeu_id uuid not null references mode_jeu(id) on delete cascade,
  regle_id    uuid not null references regle(id) on delete cascade,
  primary key (mode_jeu_id, regle_id)
);
-- La clé primaire sert « les règles d'un mode » ; cet index sert l'autre
-- sens (« les modes d'une règle ») et la cascade depuis `regle`.
create index if not exists mode_jeu_regle_par_regle on mode_jeu_regle (regle_id);

-- Un chapitre du PARCOURS = une règle, à un rang donné.
create table if not exists chapitre (
  id          uuid primary key default gen_random_uuid(),
  mode_jeu_id uuid not null references mode_jeu(id) on delete restrict,
  regle_id    uuid not null references regle(id) on delete restrict,
  numero      smallint not null check (numero >= 1),
  cree_le     timestamptz not null default now(),
  unique (mode_jeu_id, numero),
  unique (mode_jeu_id, regle_id)
);
-- `unique (mode_jeu_id, regle_id)` ne sert pas une recherche par règle seule.
create index if not exists chapitre_par_regle on chapitre (regle_id);

alter table regle          enable row level security;
alter table carte          enable row level security;
alter table skin           enable row level security;
alter table mode_jeu       enable row level security;
alter table mode_jeu_regle enable row level security;
alter table chapitre       enable row level security;

-- -------------------------------------------------------------------
-- Remplissage — reflet EXACT du code au moment de la migration.
-- `on conflict do nothing` : rejouable sans effet.
-- -------------------------------------------------------------------

-- [catalogue:regles] code, piege, maintien — ordre de ONE_RULES
insert into regle (code, piege, maintien) values
  ('sang', true, false),
  ('azur', true, false),
  ('pointe', true, false),
  ('roue', true, false),
  ('solitaire', true, false),
  ('angles', true, false),
  ('voyelle', true, false),
  ('colosse', true, false),
  ('gaucher', true, false),
  ('seconde', false, false),
  ('eclair', false, false),
  ('menteur', false, false),
  ('daltonien', false, false),
  ('jumeau', false, false),
  ('acceleration', false, false),
  ('mainGauche', false, true)
on conflict (code) do nothing;

insert into carte (regle_id, image)
select id, '/cartes/' || code || '.png' from regle
on conflict (regle_id) do nothing;

-- [catalogue:skins] code, prix, ordre — SKINS de game/boutique.ts
insert into skin (code, prix, ordre) values
  ('sticker', 0, 0),
  ('neon', 150, 1),
  ('bonbon', 300, 2),
  ('pixel', 450, 3),
  ('craie', 600, 4)
on conflict (code) do nothing;

-- [catalogue:modes] code, classable
insert into mode_jeu (code, classable) values
  ('daily', true),
  ('entrainement', false),
  ('parcours', false),
  ('pile', false),
  ('multi', false)
on conflict (code) do nothing;

-- Le run du jour, l'entraînement et la pile tirent dans TOUT le catalogue
-- (filtré à l'exécution par l'appareil, jamais ici).
insert into mode_jeu_regle (mode_jeu_id, regle_id)
select m.id, r.id from mode_jeu m cross join regle r
where m.code in ('daily', 'entrainement', 'pile')
on conflict do nothing;

-- [catalogue:multi] — multiRulesFor(true) de server/match.ts : le pool le
-- plus large d'un salon. LA MAIN GAUCHE n'y est jamais ; LA VOYELLE n'y
-- entre qu'entre claviers, décision prise par le salon au lancement.
insert into mode_jeu_regle (mode_jeu_id, regle_id)
select m.id, r.id from mode_jeu m join regle r on r.code in (
  'sang', 'azur', 'pointe', 'roue', 'solitaire', 'angles', 'voyelle', 'colosse',
  'gaucher', 'seconde', 'eclair', 'menteur', 'daltonien', 'jumeau', 'acceleration'
)
where m.code = 'multi'
on conflict do nothing;

-- [catalogue:chapitres] — CHAPITRES de game/parcours.ts, dans l'ordre.
insert into chapitre (mode_jeu_id, regle_id, numero)
select m.id, r.id, c.numero
from mode_jeu m
join (values
  ('sang', 1), ('azur', 2), ('roue', 3), ('jumeau', 4), ('pointe', 5),
  ('colosse', 6), ('seconde', 7), ('angles', 8), ('eclair', 9), ('gaucher', 10),
  ('menteur', 11), ('solitaire', 12), ('acceleration', 13), ('voyelle', 14),
  ('daltonien', 15), ('mainGauche', 16)
) as c(code, numero) on true
join regle r on r.code = c.code
where m.code = 'parcours'
on conflict do nothing;

insert into mode_jeu_regle (mode_jeu_id, regle_id)
select c.mode_jeu_id, c.regle_id from chapitre c
on conflict do nothing;

-- -------------------------------------------------------------------
-- Les colonnes TEXTE de `performance` gagnent leurs clés étrangères.
--
-- `performance.mode` et `performance.regle` portent des CODES (« daily »,
-- « sang ») : la clé étrangère vise donc `code`, unique, plutôt qu'une
-- colonne UUID de plus qui dirait la même chose — deux sources pour un fait.
-- `not valid` puis validation à part : une ligne ancienne inattendue ne doit
-- pas faire échouer le déploiement ; elle est signalée, et les lignes NEUVES
-- sont contrôlées dans tous les cas.
-- -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'performance_mode_fkey') then
    alter table performance add constraint performance_mode_fkey
      foreign key (mode) references mode_jeu(code) on update cascade on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'performance_regle_fkey') then
    alter table performance add constraint performance_regle_fkey
      foreign key (regle) references regle(code) on update cascade on delete restrict not valid;
  end if;
  begin
    alter table performance validate constraint performance_mode_fkey;
  exception when foreign_key_violation then
    raise warning '0007 : des performances anciennes désignent un mode inconnu — performance_mode_fkey laissée NOT VALID, à examiner';
  end;
  begin
    alter table performance validate constraint performance_regle_fkey;
  exception when foreign_key_violation then
    raise warning '0007 : des performances anciennes désignent une règle inconnue — performance_regle_fkey laissée NOT VALID, à examiner';
  end;
end $$;

-- ###################################################################
-- 0008_progression.sql
-- ###################################################################

-- ===================================================================
-- 0008 — la progression, la possession, les scores, les achats.
--
-- Refonte de la base, étape 3 sur 4 (voir docs/BASE-DE-DONNEES.md).
--
-- DEUX FAMILLES DE DONNÉES, et elles ne se mélangent jamais (décision n°14) :
--
--   · ce qui est OPPOSABLE — `meilleur_score`, `statistique` — ne se nourrit
--     QUE de `performance`, donc de runs rejoués par `verifyRun` ;
--   · ce qui est AFFIRMÉ par le client — `carte_utilisateur`,
--     `progression_chapitre` — est une PROJECTION de `utilisateur.agregats`,
--     écrite dans la même transaction que les agrégats (fonction
--     `agregats_ecrit`, 0009). La fusion reste écrite UNE fois, en
--     TypeScript (`shared/compte.ts`) : la base ne refusionne rien, elle
--     range ce que la fusion a produit.
--
-- STRATÉGIE DE SUPPRESSION, différenciée et écrite colonne par colonne :
--
--   · un joueur supprimé (suppression PHYSIQUE, jamais faite par le code —
--     la suppression du jeu est LOGIQUE, voir `compte_supprime`) emporte sa
--     progression : CASCADE sur carte_utilisateur, progression_chapitre,
--     statistique, meilleur_score, skin_utilisateur ;
--   · mais il ne peut PAS emporter son historique d'achats ni ses mouvements
--     de pièces : RESTRICT. Effacer un compte « pour de vrai » doit être une
--     décision écrite, pas l'effet de bord d'une cascade ;
--   · le CATALOGUE n'est jamais supprimé (`retire_le`), d'où RESTRICT depuis
--     tout ce qui le désigne ;
--   · un achat GARDE sa trace si le style disparaît : `skin_id` passe à NULL
--     (SET NULL) et `skin_code` + `prix_paye` restent, copiés au moment de
--     l'achat — le prix d'un style peut changer, ce qui a été payé non.
-- ===================================================================

-- -------------------------------------------------------------------
-- utilisateur — trois colonnes neuves
-- -------------------------------------------------------------------

-- Le solde de pièces du COMPTE. Il ne bouge que par les fonctions de 0009,
-- chacune journalisée dans `mouvement_pieces`. Le CHECK est la dernière
-- ligne de défense contre un découvert, même sous deux requêtes simultanées.
alter table utilisateur add column if not exists pieces integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'utilisateur_pieces_positif') then
    alter table utilisateur add constraint utilisateur_pieces_positif check (pieces >= 0);
  end if;
end $$;

-- La bannière (`apparence.carte`) en clé étrangère.
--
-- ⚠️ DÉRIVÉE, jamais écrite par le code : `apparence` reste la seule source
-- (c'est elle qui voyage sur le fil des salons). Un déclencheur la recalcule
-- à chaque écriture d'apparence. Deux colonnes écrites par deux chemins
-- finiraient par se contredire ; une colonne dérivée ne le peut pas.
alter table utilisateur add column if not exists carte_banniere_id uuid
  references carte(id) on delete set null;

create or replace function utilisateur_derive_banniere() returns trigger
language plpgsql as $$
begin
  new.carte_banniere_id := (
    select c.id from carte c join regle r on r.id = c.regle_id
    where r.code = new.apparence ->> 'carte'
  );
  return new;
end $$;

drop trigger if exists utilisateur_banniere on utilisateur;
create trigger utilisateur_banniere
  before insert or update of apparence on utilisateur
  for each row execute function utilisateur_derive_banniere();

-- Remplit la colonne pour les comptes existants (le déclencheur ne joue
-- qu'aux écritures futures).
update utilisateur u set carte_banniere_id = c.id
from carte c join regle r on r.id = c.regle_id
where r.code = u.apparence ->> 'carte' and u.carte_banniere_id is distinct from c.id;

-- -------------------------------------------------------------------
-- skin_utilisateur — ce qu'un compte POSSÈDE
-- -------------------------------------------------------------------
create table if not exists skin_utilisateur (
  utilisateur_id uuid not null references utilisateur(id) on delete cascade,
  skin_id        uuid not null references skin(id) on delete restrict,
  -- 'offert' (le style par défaut), 'achat' (débité ici), 'import' (payé
  -- sur un appareil avant d'avoir un compte : rien n'est débité deux fois).
  origine        text not null check (origine in ('offert', 'achat', 'import')),
  acquis_le      timestamptz not null default now(),
  primary key (utilisateur_id, skin_id)
);
create index if not exists skin_utilisateur_par_skin on skin_utilisateur (skin_id);

-- Le style PORTÉ : une clé étrangère COMPOSÉE vers la possession. On ne
-- peut porter que ce qu'on possède, et la base le garantit seule. Si la
-- possession disparaît, seul `skin_porte_id` repasse à NULL (Postgres 15+ :
-- `set null (colonne)`), jamais `id`.
alter table utilisateur add column if not exists skin_porte_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'utilisateur_skin_porte_fkey') then
    alter table utilisateur add constraint utilisateur_skin_porte_fkey
      foreign key (id, skin_porte_id) references skin_utilisateur(utilisateur_id, skin_id)
      on delete set null (skin_porte_id);
  end if;
end $$;

-- -------------------------------------------------------------------
-- achat — l'historique, qui survit au style
-- -------------------------------------------------------------------
create table if not exists achat (
  id               uuid primary key default gen_random_uuid(),
  utilisateur_id   uuid not null references utilisateur(id) on delete restrict,
  skin_id          uuid references skin(id) on delete set null,
  -- Copiés au moment de l'achat : l'historique ne dépend plus du catalogue.
  skin_code        text not null,
  prix_paye        integer not null check (prix_paye >= 0),
  -- Fournie par le client : rejouer la même requête (reprise réseau,
  -- double clic, file persistée) rend le MÊME achat, jamais un second débit.
  cle_idempotence  uuid not null,
  achete_le        timestamptz not null default now(),
  unique (utilisateur_id, cle_idempotence)
);
-- L'unique ci-dessus commence par `utilisateur_id` : il sert déjà
-- « l'historique d'un compte ». Seul le SET NULL depuis `skin` a besoin du sien.
create index if not exists achat_par_skin on achat (skin_id);

-- -------------------------------------------------------------------
-- mouvement_pieces — le grand livre du solde
-- -------------------------------------------------------------------
-- Chaque variation de `utilisateur.pieces` y est écrite, dans la même
-- transaction. Le solde se recalcule donc toujours : somme(delta) = pieces.
create table if not exists mouvement_pieces (
  id              uuid primary key default gen_random_uuid(),
  utilisateur_id  uuid not null references utilisateur(id) on delete restrict,
  delta           integer not null check (delta <> 0),
  motif           text not null check (motif in ('import', 'achat')),
  -- Clé d'idempotence, unique par compte : « import:<appareil> » rend un
  -- import d'appareil impossible à compter deux fois.
  cle             text not null check (length(cle) between 1 and 96),
  achat_id        uuid references achat(id) on delete restrict,
  cree_le         timestamptz not null default now(),
  unique (utilisateur_id, cle),
  -- Un débit est toujours un achat, et un achat toujours un débit.
  check ((motif = 'achat') = (achat_id is not null)),
  check ((motif = 'achat') = (delta < 0))
);
create index if not exists mouvement_pieces_par_achat on mouvement_pieces (achat_id);

-- -------------------------------------------------------------------
-- carte_utilisateur — la maîtrise (PROJECTION du carnet)
-- -------------------------------------------------------------------
create table if not exists carte_utilisateur (
  utilisateur_id uuid not null references utilisateur(id) on delete cascade,
  carte_id       uuid not null references carte(id) on delete restrict,
  meilleur       integer not null default 0 check (meilleur >= 0),
  pieges         integer not null default 0 check (pieges >= 0),
  runs           integer not null default 0 check (runs >= 0),
  -- `estMaitrisee` (src/game/maitrise.ts), calculée au moment de l'écriture.
  maitrisee      boolean not null default false,
  obtenue_le     timestamptz not null default now(),
  maj_le         timestamptz not null default now(),
  primary key (utilisateur_id, carte_id)
);
create index if not exists carte_utilisateur_par_carte on carte_utilisateur (carte_id);

-- -------------------------------------------------------------------
-- progression_chapitre — le parcours (PROJECTION du carnet)
-- -------------------------------------------------------------------
create table if not exists progression_chapitre (
  utilisateur_id uuid not null references utilisateur(id) on delete cascade,
  chapitre_id    uuid not null references chapitre(id) on delete restrict,
  -- Étoiles des cinq niveaux, 0 à 3 chacun (`RuleRecord.etoiles`).
  etoiles        smallint[] not null default '{0,0,0,0,0}'
                 check (cardinality(etoiles) = 5 and 0 <= all(etoiles) and 3 >= all(etoiles)),
  -- Le chapitre est TERMINÉ quand son boss (5e niveau) a une étoile.
  termine        boolean generated always as (etoiles[5] > 0) stored,
  termine_le     timestamptz,
  debloque_le    timestamptz not null default now(),
  maj_le         timestamptz not null default now(),
  primary key (utilisateur_id, chapitre_id),
  check (termine_le is null or etoiles[5] > 0)
);
create index if not exists progression_chapitre_par_chapitre on progression_chapitre (chapitre_id);

-- -------------------------------------------------------------------
-- statistique — 1:1 avec le compte, OPPOSABLE
-- -------------------------------------------------------------------
-- ⚠️ Pas de victoires ni de défaites : le serveur de salons n'a pas de base,
-- aucun résultat de match n'arrive jamais ici. Des colonnes que rien
-- n'écrit seraient des zéros qui mentent.
create table if not exists statistique (
  utilisateur_id  uuid primary key references utilisateur(id) on delete cascade,
  -- Runs du jour soumis ET validés par le rejeu, améliorants ou non.
  runs_verifies   integer not null default 0 check (runs_verifies >= 0),
  -- Jours distincts où le compte a une performance vérifiée.
  jours_classes   integer not null default 0 check (jours_classes >= 0),
  maj_le          timestamptz not null default now(),
  check (jours_classes <= runs_verifies)
);

-- -------------------------------------------------------------------
-- meilleur_score — unique par compte et par mode, OPPOSABLE
-- -------------------------------------------------------------------
create table if not exists meilleur_score (
  id              uuid primary key default gen_random_uuid(),
  utilisateur_id  uuid not null references utilisateur(id) on delete cascade,
  mode_jeu_id     uuid not null references mode_jeu(id) on delete restrict,
  valeur          integer not null check (valeur >= 0),
  -- Départage (la durée, croissante), comme `performance`.
  valeur2         integer not null default 0 check (valeur2 >= 0),
  -- La performance qui l'a établi ; si elle part (suppression), le record
  -- reste mais ne pointe plus vers rien.
  performance_id  uuid references performance(id) on delete set null,
  obtenu_le       timestamptz not null default now(),
  unique (utilisateur_id, mode_jeu_id)
);
create index if not exists meilleur_score_par_performance on meilleur_score (performance_id);

-- -------------------------------------------------------------------
-- demande_ami — plus de demandes CROISÉES en double
-- -------------------------------------------------------------------
-- La clé primaire (de_id, a_id) laissait coexister A→B et B→A. L'application
-- les traite comme un accord (« deux demandes croisées valent accord »), mais
-- l'audit C4 a montré qu'elles pouvaient rester toutes deux en attente.
-- L'index sur la PAIRE NON ORIENTÉE rend ce doublon impossible ; le cas est
-- tranché par `amitie_demande` (0009), dans une transaction.
--
-- Non destructif : avant l'index, la demande la plus RÉCENTE de chaque paire
-- croisée est copiée dans une archive, puis retirée. L'autre reste : rien
-- n'est accepté à la place de personne.
create table if not exists archive_demande_ami_0008 (
  de_id      uuid not null,
  a_id       uuid not null,
  cree_le    timestamptz not null,
  archive_le timestamptz not null default now()
);
alter table archive_demande_ami_0008 enable row level security;

with croisees as (
  select d.de_id, d.a_id, d.cree_le
  from demande_ami d
  join demande_ami r on r.de_id = d.a_id and r.a_id = d.de_id
  where (d.cree_le, d.de_id::text) > (r.cree_le, r.de_id::text)
), archivees as (
  insert into archive_demande_ami_0008 (de_id, a_id, cree_le)
  select de_id, a_id, cree_le from croisees
  returning de_id, a_id
)
delete from demande_ami d using archivees a
where d.de_id = a.de_id and d.a_id = a.a_id;

create unique index if not exists demande_ami_paire
  on demande_ami (least(de_id, a_id), greatest(de_id, a_id));

-- -------------------------------------------------------------------
-- Accès : RLS sans politique, comme toutes les tables (0001).
-- -------------------------------------------------------------------
alter table skin_utilisateur     enable row level security;
alter table achat                enable row level security;
alter table mouvement_pieces     enable row level security;
alter table carte_utilisateur    enable row level security;
alter table progression_chapitre enable row level security;
alter table statistique          enable row level security;
alter table meilleur_score       enable row level security;

-- -------------------------------------------------------------------
-- Rattrapage des données OPPOSABLES depuis les performances existantes.
-- (Les projections du carnet, elles, se remplissent à la prochaine
-- synchronisation de chaque compte : la base ne refusionne pas.)
-- -------------------------------------------------------------------
insert into statistique (utilisateur_id, runs_verifies, jours_classes)
select utilisateur_id, count(*), count(distinct jour)
from performance where verifiee
group by utilisateur_id
on conflict (utilisateur_id) do nothing;

-- Le style par défaut est OFFERT à chaque compte vivant (`BOUTIQUE_VIERGE`).
insert into skin_utilisateur (utilisateur_id, skin_id, origine)
select u.id, s.id, 'offert'
from utilisateur u join skin s on s.prix = 0 and s.ordre = 0
where u.supprime_le is null
on conflict do nothing;

insert into meilleur_score (utilisateur_id, mode_jeu_id, valeur, valeur2, performance_id, obtenu_le)
select distinct on (p.utilisateur_id, m.id)
  p.utilisateur_id, m.id, p.valeur, p.valeur2, p.id, p.cree_le
from performance p join mode_jeu m on m.code = p.mode
where p.verifiee and p.verdict_bot = 'humain'
order by p.utilisateur_id, m.id, p.valeur desc, p.valeur2 asc
on conflict (utilisateur_id, mode_jeu_id) do nothing;

-- ###################################################################
-- 0009_transactions.sql
-- ###################################################################

-- ===================================================================
-- 0009 — les écritures à plusieurs lignes deviennent des TRANSACTIONS.
--
-- Refonte de la base, étape 4 sur 4 (voir docs/BASE-DE-DONNEES.md).
--
-- Les fonctions edge parlent à Supabase par PostgREST (pas de socket TCP en
-- runtime edge). Une requête REST = une transaction ; une suite de requêtes
-- n'en est PAS une. Mesuré dans `api/_depot.ts` avant cette migration :
--
--   · créer un compte = 2 requêtes (compte, puis lien) : un échec entre les
--     deux laissait un compte ORPHELIN, qu'aucune connexion ne retrouvait ;
--   · supprimer un compte = 7 requêtes : une panne au milieu laissait un
--     compte à moitié effacé (liens partis, scores encore publiés…) ;
--   · accepter un ami = lire, lier, RECOMPTER, défaire si dépassement
--     (audit C4) — un contournement de l'absence de verrou.
--
-- Chaque fonction ci-dessous est appelée par `POST /rest/v1/rpc/<nom>` :
-- PostgREST l'exécute dans UNE transaction. Tout réussit, ou rien n'a lieu.
-- Les verrous de ligne (`for update`) sérialisent ce qui touche le même
-- compte — deux onglets, deux acceptations croisées, deux achats.
--
-- ⚠️ CE QUI N'EST PAS ICI, DÉLIBÉRÉMENT : la FUSION des agrégats. Elle reste
-- écrite une fois, en TypeScript (`fusionne`), et `agregats_ecrit` ne fait
-- que poser le résultat sous compare-and-swap. Une seconde implémentation en
-- plpgsql divergerait, et le symptôme serait un carnet qui rétrécit.
--
-- ⚠️ ACCÈS : Postgres accorde EXECUTE à PUBLIC par défaut. Sans le `revoke`
-- final, la clé publique du navigateur pourrait appeler `boutique_achete`
-- pour n'importe quel compte. Seule la clé de service (fonctions edge) les
-- exécute.
-- ===================================================================

-- -------------------------------------------------------------------
-- Comptes
-- -------------------------------------------------------------------

-- Le compte ET son lien, les deux ou aucun. Si le lien existe déjà (deux
-- onglets qui se connectent ensemble), on rend le compte existant : la
-- seconde connexion n'est pas une erreur.
create or replace function compte_cree(
  p_id uuid, p_pseudo text, p_apparence jsonb, p_agregats jsonb,
  p_fournisseur text, p_id_externe text
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_existant uuid;
  v_u utilisateur;
begin
  -- Le verrou consultatif sérialise deux créations pour le même lien.
  perform pg_advisory_xact_lock(hashtextextended(p_fournisseur || ':' || p_id_externe, 0));
  select utilisateur_id into v_existant from lien_plateforme
   where fournisseur = p_fournisseur and id_externe = p_id_externe;
  if v_existant is not null then
    select * into v_u from utilisateur where id = v_existant;
    return to_jsonb(v_u);
  end if;

  insert into utilisateur (id, pseudo, apparence, agregats)
  values (p_id, p_pseudo, p_apparence, p_agregats)
  returning * into v_u;
  insert into lien_plateforme (fournisseur, id_externe, utilisateur_id)
  values (p_fournisseur, p_id_externe, v_u.id);
  -- Le style par défaut est possédé d'emblée, comme sur l'appareil.
  insert into skin_utilisateur (utilisateur_id, skin_id, origine)
  select v_u.id, id, 'offert' from skin where prix = 0 and ordre = 0;
  return to_jsonb(v_u);
end $$;

-- La suppression LOGIQUE, en une transaction. Ce qui est personnel part ;
-- l'historique d'achats et le grand livre restent, rattachés à une pierre
-- tombale sans pseudo (voir la stratégie de suppression, 0008).
create or replace function compte_supprime(p_id uuid, p_agregats_vides jsonb) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  perform 1 from utilisateur where id = p_id for update;
  if not found then return false; end if;

  -- Les liens partent POUR DE BON : sinon une reconnexion ressusciterait le compte.
  delete from lien_plateforme where utilisateur_id = p_id;
  -- La cascade ne joue pas (la ligne utilisateur reste) : tout à la main.
  delete from meilleur_score       where utilisateur_id = p_id;
  delete from statistique          where utilisateur_id = p_id;
  delete from performance          where utilisateur_id = p_id;
  delete from carte_utilisateur    where utilisateur_id = p_id;
  delete from progression_chapitre where utilisateur_id = p_id;
  delete from amitie      where utilisateur_id = p_id or ami_id = p_id;
  delete from demande_ami where de_id = p_id or a_id = p_id;
  update utilisateur set skin_porte_id = null where id = p_id;
  delete from skin_utilisateur where utilisateur_id = p_id;

  update utilisateur set
    supprime_le   = now(),
    pseudo        = '',
    agregats      = p_agregats_vides,
    code_ami      = null,
    version_jeton = version_jeton + 1
  where id = p_id;
  return true;
end $$;

-- -------------------------------------------------------------------
-- Agrégats et projections (carnet → cartes, étoiles → chapitres)
-- -------------------------------------------------------------------

-- Compare-and-swap sur `revision`, PUIS les projections, dans la même
-- transaction. Si une projection viole une contrainte, les agrégats ne sont
-- pas écrits non plus : la base ne peut pas tenir un carnet et une
-- collection qui se contredisent.
--
-- `p_cartes`    : [{ "regle", "meilleur", "pieges", "runs", "maitrisee" }]
-- `p_chapitres` : [{ "regle", "etoiles": [5 entiers] }]
-- Un code inconnu du catalogue est ignoré (une règle d'une version plus
-- récente du client, par exemple) : il vit toujours dans les agrégats.
create or replace function agregats_ecrit(
  p_id uuid, p_revision integer, p_agregats jsonb, p_cartes jsonb, p_chapitres jsonb
) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update utilisateur set agregats = p_agregats, revision = revision + 1
   where id = p_id and revision = p_revision and supprime_le is null;
  if not found then return false; end if;

  -- MAXIMUM, jamais affectation : la même loi que `fusionne`, appliquée à
  -- une projection déjà fusionnée. Elle ne peut que rendre l'écriture
  -- inoffensive si deux projections se croisent.
  insert into carte_utilisateur as cu (utilisateur_id, carte_id, meilleur, pieges, runs, maitrisee)
  select p_id, c.id,
         coalesce((x ->> 'meilleur')::integer, 0),
         coalesce((x ->> 'pieges')::integer, 0),
         coalesce((x ->> 'runs')::integer, 0),
         coalesce((x ->> 'maitrisee')::boolean, false)
  from jsonb_array_elements(coalesce(p_cartes, '[]'::jsonb)) x
  join regle r on r.code = x ->> 'regle'
  join carte c on c.regle_id = r.id
  on conflict (utilisateur_id, carte_id) do update set
    meilleur  = greatest(cu.meilleur, excluded.meilleur),
    pieges    = greatest(cu.pieges, excluded.pieges),
    runs      = greatest(cu.runs, excluded.runs),
    maitrisee = cu.maitrisee or excluded.maitrisee,
    maj_le    = now()
  where (cu.meilleur, cu.pieges, cu.runs, cu.maitrisee)
        is distinct from (greatest(cu.meilleur, excluded.meilleur), greatest(cu.pieges, excluded.pieges),
                          greatest(cu.runs, excluded.runs), cu.maitrisee or excluded.maitrisee);

  insert into progression_chapitre as pc (utilisateur_id, chapitre_id, etoiles, termine_le)
  select p_id, ch.id, e.etoiles, case when e.etoiles[5] > 0 then now() end
  from jsonb_array_elements(coalesce(p_chapitres, '[]'::jsonb)) x
  cross join lateral (
    select array(select (v)::smallint from jsonb_array_elements_text(x -> 'etoiles') v) as etoiles
  ) e
  join regle r on r.code = x ->> 'regle'
  join chapitre ch on ch.regle_id = r.id
  join mode_jeu m on m.id = ch.mode_jeu_id and m.code = 'parcours'
  on conflict (utilisateur_id, chapitre_id) do update set
    etoiles    = array(select greatest(a, b) from unnest(pc.etoiles, excluded.etoiles) as t(a, b)),
    termine_le = coalesce(pc.termine_le, excluded.termine_le),
    maj_le     = now()
  where pc.etoiles is distinct from
        array(select greatest(a, b) from unnest(pc.etoiles, excluded.etoiles) as t(a, b));

  return true;
end $$;

-- -------------------------------------------------------------------
-- Performances, records, statistiques — l'OPPOSABLE
-- -------------------------------------------------------------------

-- Pose une performance VÉRIFIÉE, ou améliore celle de la même clé ; dans la
-- même transaction, tient `statistique` et `meilleur_score`. Rend `true` si
-- la performance a été écrite (même loi qu'avant : améliorer, jamais
-- remplacer par moins bien).
create or replace function performance_pose(p jsonb) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_id     uuid;
  v_insere boolean;
  v_u      uuid := (p ->> 'utilisateur_id')::uuid;
  v_mode   uuid;
begin
  insert into performance as pf (utilisateur_id, mode, cle, version_contenu, jour, graine, regle,
                                 valeur, valeur2, verifiee, verdict_bot)
  values (v_u, p ->> 'mode', p ->> 'cle', p ->> 'version_contenu', (p ->> 'jour')::integer,
          (p ->> 'graine')::bigint, p ->> 'regle', (p ->> 'valeur')::integer,
          coalesce((p ->> 'valeur2')::integer, 0), true, coalesce(p ->> 'verdict_bot', 'humain'))
  on conflict (utilisateur_id, cle) do update set
    version_contenu = excluded.version_contenu, jour = excluded.jour, graine = excluded.graine,
    regle = excluded.regle, valeur = excluded.valeur, valeur2 = excluded.valeur2,
    verifiee = true, verdict_bot = excluded.verdict_bot
  -- Le même ordre que l'index de classement : valeur décroissante, puis durée croissante.
  where excluded.valeur > pf.valeur
     or (excluded.valeur = pf.valeur and excluded.valeur2 < pf.valeur2)
  returning pf.id, (pf.xmax = 0) into v_id, v_insere;

  -- Un run rejoué compte TOUJOURS, qu'il améliore ou non ; un jour neuf
  -- ne compte qu'à l'insertion.
  insert into statistique as s (utilisateur_id, runs_verifies, jours_classes)
  values (v_u, 1, case when v_insere then 1 else 0 end)
  on conflict (utilisateur_id) do update set
    runs_verifies = s.runs_verifies + 1,
    jours_classes = s.jours_classes + case when v_insere then 1 else 0 end,
    maj_le = now();

  if v_id is null then return false; end if;

  -- Le record du mode ne se nourrit que de l'HUMAIN : un run jugé douteux
  -- est gardé dans `performance`, jamais promu record.
  if coalesce(p ->> 'verdict_bot', 'humain') = 'humain' then
    select id into v_mode from mode_jeu where code = p ->> 'mode';
    insert into meilleur_score as ms (utilisateur_id, mode_jeu_id, valeur, valeur2, performance_id)
    values (v_u, v_mode, (p ->> 'valeur')::integer, coalesce((p ->> 'valeur2')::integer, 0), v_id)
    on conflict (utilisateur_id, mode_jeu_id) do update set
      valeur = excluded.valeur, valeur2 = excluded.valeur2,
      performance_id = excluded.performance_id, obtenu_le = now()
    where excluded.valeur > ms.valeur
       or (excluded.valeur = ms.valeur and excluded.valeur2 < ms.valeur2);
  end if;
  return true;
end $$;

-- -------------------------------------------------------------------
-- Amis
-- -------------------------------------------------------------------

-- Verrouille deux comptes dans un ordre FIXE : deux transactions qui
-- touchent la même paire ne peuvent pas s'interbloquer.
create or replace function amitie_verrouille(a uuid, b uuid) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare r record;
begin
  -- Une boucle, et non un PERFORM : chaque ligne est lue, donc verrouillée.
  for r in select id from utilisateur where id in (a, b) order by id for update loop
    null;
  end loop;
end $$;

create or replace function amitie_lie(a uuid, b uuid, p_max_amis integer) returns text
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if (select count(*) from amitie where utilisateur_id = a) >= p_max_amis
     or (select count(*) from amitie where utilisateur_id = b) >= p_max_amis then
    return 'plein';
  end if;
  -- Stockée dans les DEUX sens (0003) : lire ses amis reste une requête.
  insert into amitie (utilisateur_id, ami_id) values (a, b), (b, a) on conflict do nothing;
  delete from demande_ami where (de_id = a and a_id = b) or (de_id = b and a_id = a);
  return 'lie';
end $$;

-- Demander `p_de → p_a`. Issues : 'soi', 'deja', 'lie' (demande croisée =
-- accord), 'demande', 'plein'. La vérification des plafonds et l'écriture
-- se font sous le même verrou : plus de fenêtre entre les deux.
create or replace function amitie_demande(
  p_de uuid, p_a uuid, p_max_amis integer, p_max_demandes integer
) returns text
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_de = p_a then return 'soi'; end if;
  perform amitie_verrouille(p_de, p_a);
  if exists (select 1 from amitie where utilisateur_id = p_de and ami_id = p_a) then
    return 'deja';
  end if;
  if exists (select 1 from demande_ami where de_id = p_a and a_id = p_de) then
    return amitie_lie(p_de, p_a, p_max_amis);
  end if;
  if exists (select 1 from demande_ami where de_id = p_de and a_id = p_a) then
    return 'demande';
  end if;
  if (select count(*) from demande_ami where de_id = p_de) >= p_max_demandes
     or (select count(*) from demande_ami where a_id = p_a) >= p_max_demandes then
    return 'plein';
  end if;
  insert into demande_ami (de_id, a_id) values (p_de, p_a);
  return 'demande';
end $$;

-- Accepter ce qu'on a REÇU, et seulement ça. Issues : 'inconnu', 'plein', 'lie'.
create or replace function amitie_accepte(p_moi uuid, p_autre uuid, p_max_amis integer) returns text
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  perform amitie_verrouille(p_moi, p_autre);
  if not exists (select 1 from demande_ami where de_id = p_autre and a_id = p_moi) then
    return 'inconnu';
  end if;
  return amitie_lie(p_moi, p_autre, p_max_amis);
end $$;

-- -------------------------------------------------------------------
-- Boutique et pièces
-- -------------------------------------------------------------------

create or replace function boutique_etat(p_id uuid) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'pieces', u.pieces,
    'porte', (select s.code from skin s where s.id = u.skin_porte_id),
    'possedes', coalesce((
      select jsonb_agg(s.code order by s.ordre)
      from skin_utilisateur su join skin s on s.id = su.skin_id
      where su.utilisateur_id = u.id), '[]'::jsonb)
  )
  from utilisateur u where u.id = p_id and u.supprime_le is null;
$$;

-- Acheter un style. Issues : 'ok', 'inconnu', 'deja', 'pauvre'.
-- Débit, possession, historique, grand livre et style porté : une seule
-- transaction, sous le verrou du compte. Rejouer la même `p_cle` rend le
-- même résultat sans second débit.
create or replace function boutique_achete(p_id uuid, p_skin text, p_cle uuid) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_pieces integer;
  v_skin   skin;
  v_achat  uuid;
begin
  select pieces into v_pieces from utilisateur
   where id = p_id and supprime_le is null for update;
  if not found then return jsonb_build_object('issue', 'inconnu'); end if;

  if exists (select 1 from achat where utilisateur_id = p_id and cle_idempotence = p_cle) then
    return boutique_etat(p_id) || jsonb_build_object('issue', 'ok', 'rejoue', true);
  end if;

  select * into v_skin from skin where code = p_skin and retire_le is null;
  if not found then return jsonb_build_object('issue', 'inconnu'); end if;

  if exists (select 1 from skin_utilisateur where utilisateur_id = p_id and skin_id = v_skin.id) then
    return boutique_etat(p_id) || jsonb_build_object('issue', 'deja');
  end if;
  if v_pieces < v_skin.prix then
    return boutique_etat(p_id) || jsonb_build_object('issue', 'pauvre', 'manque', v_skin.prix - v_pieces);
  end if;

  insert into achat (utilisateur_id, skin_id, skin_code, prix_paye, cle_idempotence)
  values (p_id, v_skin.id, v_skin.code, v_skin.prix, p_cle)
  returning id into v_achat;
  if v_skin.prix > 0 then
    insert into mouvement_pieces (utilisateur_id, delta, motif, cle, achat_id)
    values (p_id, -v_skin.prix, 'achat', 'achat:' || p_cle::text, v_achat);
    update utilisateur set pieces = pieces - v_skin.prix where id = p_id;
  end if;
  insert into skin_utilisateur (utilisateur_id, skin_id, origine) values (p_id, v_skin.id, 'achat');
  -- Porté aussitôt, comme `achete` côté appareil : on n'achète pas un habit
  -- pour le ranger.
  update utilisateur set skin_porte_id = v_skin.id where id = p_id;
  return boutique_etat(p_id) || jsonb_build_object('issue', 'ok');
end $$;

-- Porter un style POSSÉDÉ. La clé étrangère composée le garantirait seule ;
-- on vérifie d'abord pour rendre `false` plutôt qu'une erreur.
create or replace function boutique_porte(p_id uuid, p_skin text) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_skin uuid;
begin
  select su.skin_id into v_skin from skin_utilisateur su join skin s on s.id = su.skin_id
   where su.utilisateur_id = p_id and s.code = p_skin;
  if not found then return false; end if;
  update utilisateur set skin_porte_id = v_skin where id = p_id and supprime_le is null;
  return found;
end $$;

-- L'IMPORT d'un appareil : ses pièces et ses styles rejoignent le compte,
-- UNE fois par appareil (clé « import:<appareil> »). Les styles importés ne
-- sont pas débités : ils ont été payés sur l'appareil.
create or replace function boutique_importe(
  p_id uuid, p_appareil text, p_pieces integer, p_skins text[]
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_cle text := 'import:' || p_appareil;
begin
  perform 1 from utilisateur where id = p_id and supprime_le is null for update;
  if not found then return jsonb_build_object('issue', 'inconnu'); end if;
  if exists (select 1 from mouvement_pieces where utilisateur_id = p_id and cle = v_cle) then
    return boutique_etat(p_id) || jsonb_build_object('issue', 'deja');
  end if;
  if p_pieces > 0 then
    insert into mouvement_pieces (utilisateur_id, delta, motif, cle) values (p_id, p_pieces, 'import', v_cle);
    update utilisateur set pieces = pieces + p_pieces where id = p_id;
  end if;
  insert into skin_utilisateur (utilisateur_id, skin_id, origine)
  select p_id, s.id, 'import' from skin s where s.code = any(p_skins)
  on conflict do nothing;
  return boutique_etat(p_id) || jsonb_build_object('issue', 'ok');
end $$;

-- -------------------------------------------------------------------
-- Lecture : la collection du compte, en un aller-retour
-- -------------------------------------------------------------------
create or replace function compte_collection(p_id uuid) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'cartes', coalesce((
      select jsonb_agg(jsonb_build_object('regle', r.code, 'meilleur', cu.meilleur, 'pieges', cu.pieges,
                                          'runs', cu.runs, 'maitrisee', cu.maitrisee) order by r.code)
      from carte_utilisateur cu join carte c on c.id = cu.carte_id join regle r on r.id = c.regle_id
      where cu.utilisateur_id = p_id), '[]'::jsonb),
    'chapitres', coalesce((
      select jsonb_agg(jsonb_build_object('regle', r.code, 'numero', ch.numero,
                                          'etoiles', to_jsonb(pc.etoiles), 'termine', pc.termine) order by ch.numero)
      from progression_chapitre pc join chapitre ch on ch.id = pc.chapitre_id join regle r on r.id = ch.regle_id
      where pc.utilisateur_id = p_id), '[]'::jsonb),
    'meilleurs', coalesce((
      select jsonb_agg(jsonb_build_object('mode', m.code, 'valeur', ms.valeur, 'valeur2', ms.valeur2) order by m.code)
      from meilleur_score ms join mode_jeu m on m.id = ms.mode_jeu_id
      where ms.utilisateur_id = p_id), '[]'::jsonb),
    'statistique', (
      select jsonb_build_object('runsVerifies', s.runs_verifies, 'joursClasses', s.jours_classes)
      from statistique s where s.utilisateur_id = p_id)
  );
$$;

-- -------------------------------------------------------------------
-- Accès : la clé de service seule.
-- -------------------------------------------------------------------
do $$
declare
  f text;
  fonctions text[] := array[
    'compte_cree(uuid, text, jsonb, jsonb, text, text)',
    'compte_supprime(uuid, jsonb)',
    'agregats_ecrit(uuid, integer, jsonb, jsonb, jsonb)',
    'performance_pose(jsonb)',
    'amitie_verrouille(uuid, uuid)',
    'amitie_lie(uuid, uuid, integer)',
    'amitie_demande(uuid, uuid, integer, integer)',
    'amitie_accepte(uuid, uuid, integer)',
    'boutique_etat(uuid)',
    'boutique_achete(uuid, text, uuid)',
    'boutique_porte(uuid, text)',
    'boutique_importe(uuid, text, integer, text[])',
    'compte_collection(uuid)',
    'utilisateur_derive_banniere()'
  ];
begin
  foreach f in array fonctions loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
