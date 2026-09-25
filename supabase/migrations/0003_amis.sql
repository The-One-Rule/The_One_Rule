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
