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
