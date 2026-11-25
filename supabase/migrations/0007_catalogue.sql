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
