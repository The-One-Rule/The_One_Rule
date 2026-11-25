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
