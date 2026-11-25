-- ===================================================================
-- RETOUR ARRIÈRE de 1_fonctions_en_typescript → 0_ligne_de_base.
--
-- ⚠️ CE FICHIER N'EST PAS UNE MIGRATION : il vit hors de `prisma/migrations/`
-- pour que `prisma migrate deploy` ne l'applique jamais. Il se lance à la
-- main (`psql "$DIRECT_URL" -f prisma/retours/1-0.sql`), sur décision de
-- Pierre, APRÈS avoir redéployé le code d'avant Prisma (les fonctions `api/`
-- en edge, qui appellent ces fonctions par PostgREST).
--
-- Il ne détruit AUCUNE donnée : il recrée les treize fonctions et le
-- déclencheur de la ligne de base (texte recopié à l'identique), la colonne
-- générée `termine` (recalculée par Postgres) et la clé du style porté en
-- `SET NULL (skin_porte_id)`, puis efface la trace de la migration 1 dans
-- `_prisma_migrations` pour que Prisma la sache non appliquée.
--
-- Éprouvé le 25/11/2026 sur PostgreSQL 16 : après 1 puis ce retour, le schéma
-- (pg_dump --schema-only) est celui de la ligne de base seule, à UNE
-- différence près, sans effet : `termine` revient en DERNIÈRE colonne de
-- `progression_chapitre` (un `add column` ne sait pas l'insérer ailleurs).
-- ===================================================================

begin;

alter table utilisateur drop constraint if exists utilisateur_skin_porte_fkey;
alter table utilisateur add constraint utilisateur_skin_porte_fkey
  foreign key (id, skin_porte_id) references skin_utilisateur(utilisateur_id, skin_id)
  on delete set null (skin_porte_id);

alter table progression_chapitre
  add column if not exists termine boolean generated always as (etoiles[5] > 0) stored;

-- Le déclencheur de la bannière (0008), puis un rattrapage : des apparences
-- ont pu changer pendant que le dépôt dérivait la colonne lui-même.
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


update utilisateur u set carte_banniere_id = c.id
from carte c join regle r on r.id = c.regle_id
where r.code = u.apparence ->> 'carte' and u.carte_banniere_id is distinct from c.id;

-- Les fonctions transactionnelles (0009), texte d'origine.
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

delete from _prisma_migrations where migration_name = '1_fonctions_en_typescript';

commit;
