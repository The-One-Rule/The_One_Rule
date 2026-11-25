-- ===================================================================
-- RETOUR ARRIÈRE de 0009 → 0006, à la main, en dernier recours.
--
-- ⚠️ HISTORIQUE (25/11/2026) : écrit avant Prisma, quand les migrations
-- vivaient dans `supabase/migrations/`. Il défait 0009 → 0006, qui sont
-- aujourd'hui DANS `prisma/migrations/0_ligne_de_base`. S'il fallait un jour
-- s'en servir, défaire D'ABORD la migration 1 (`prisma/retours/1-0.sql`).
--
-- ⚠️ CE FICHIER N'EST PAS UNE MIGRATION. Il vivait hors de
-- `supabase/migrations/` précisément pour que `supabase db push` ne
-- l'applique jamais. Il se lance à la main (`psql -f`), sur décision de
-- Pierre, APRÈS avoir redéployé le code d'avant (ADR 0011 : le code d'avant
-- lit des identifiants `u_…`).
--
-- ⚠️ IL DÉTRUIT des données NÉES après 0008 : achats, grand livre, soldes de
-- pièces, possessions, records et statistiques. Les projections du carnet
-- (cartes, chapitres) se reconstruiraient, le reste NON. Sauvegarder d'abord :
--   pg_dump --data-only -t achat -t mouvement_pieces -t skin_utilisateur …
--
-- Ce qu'il RESTAURE sans perte : les identifiants (`<uuid>` → `u_<hex>`),
-- `performance.id` (depuis `ancien_id`), les demandes d'ami archivées.
-- Les performances créées APRÈS 0006 n'ont pas d'`ancien_id` : elles en
-- reçoivent un neuf, tiré de la séquence d'origine.
-- ===================================================================

begin;

-- 0009 : les fonctions
drop function if exists compte_cree(uuid, text, jsonb, jsonb, text, text);
drop function if exists compte_supprime(uuid, jsonb);
drop function if exists agregats_ecrit(uuid, integer, jsonb, jsonb, jsonb);
drop function if exists performance_pose(jsonb);
drop function if exists amitie_demande(uuid, uuid, integer, integer);
drop function if exists amitie_accepte(uuid, uuid, integer);
drop function if exists amitie_lie(uuid, uuid, integer);
drop function if exists amitie_verrouille(uuid, uuid);
drop function if exists boutique_achete(uuid, text, uuid);
drop function if exists boutique_porte(uuid, text);
drop function if exists boutique_importe(uuid, text, integer, text[]);
drop function if exists boutique_etat(uuid);
drop function if exists compte_collection(uuid);

-- 0008 : les tables neuves, les colonnes neuves, l'index de paire
drop index if exists demande_ami_paire;
insert into demande_ami (de_id, a_id, cree_le)
select de_id, a_id, cree_le from archive_demande_ami_0008
on conflict do nothing;
drop table if exists archive_demande_ami_0008;
drop trigger if exists utilisateur_banniere on utilisateur;
drop function if exists utilisateur_derive_banniere();
alter table utilisateur drop constraint if exists utilisateur_skin_porte_fkey;
drop table if exists meilleur_score, statistique, progression_chapitre, carte_utilisateur,
                     mouvement_pieces, achat, skin_utilisateur;
alter table utilisateur drop column if exists skin_porte_id;
alter table utilisateur drop column if exists carte_banniere_id;
alter table utilisateur drop column if exists pieces;

-- 0007 : le catalogue
alter table performance drop constraint if exists performance_mode_fkey;
alter table performance drop constraint if exists performance_regle_fkey;
drop table if exists chapitre, mode_jeu_regle, mode_jeu, skin, carte, regle;

-- 0006 : performance.id redevient le numéro, utilisateur.id redevient du texte
update performance set ancien_id = nextval('performance_id_seq') where ancien_id is null;
alter table performance drop constraint performance_pkey;
alter table performance drop column id;
alter table performance rename column ancien_id to id;
alter table performance alter column id set not null;
alter table performance alter column id set default nextval('performance_id_seq');
alter table performance add constraint performance_pkey primary key (id);

alter table lien_plateforme drop constraint lien_plateforme_utilisateur_id_fkey;
alter table performance     drop constraint performance_utilisateur_id_fkey;
alter table amitie          drop constraint amitie_utilisateur_id_fkey;
alter table amitie          drop constraint amitie_ami_id_fkey;
alter table demande_ami     drop constraint demande_ami_de_id_fkey;
alter table demande_ami     drop constraint demande_ami_a_id_fkey;
alter table utilisateur alter column id drop default;
alter table utilisateur     alter column id type text using 'u_' || replace(id::text, '-', '');
alter table lien_plateforme alter column utilisateur_id type text using 'u_' || replace(utilisateur_id::text, '-', '');
alter table performance     alter column utilisateur_id type text using 'u_' || replace(utilisateur_id::text, '-', '');
alter table amitie
  alter column utilisateur_id type text using 'u_' || replace(utilisateur_id::text, '-', ''),
  alter column ami_id         type text using 'u_' || replace(ami_id::text, '-', '');
alter table demande_ami
  alter column de_id type text using 'u_' || replace(de_id::text, '-', ''),
  alter column a_id  type text using 'u_' || replace(a_id::text, '-', '');
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

commit;
