-- ===================================================================
-- 1_fonctions_en_typescript — la loi d'écriture quitte le SQL.
--
-- Arrivée de Prisma (ADR 0012). Les fonctions `api/` passent du runtime edge
-- au runtime Node : elles ouvrent enfin une connexion Postgres, donc une
-- TRANSACTION à plusieurs instructions, et la raison d'être des fonctions
-- SQL de 0009 disparaît (« une requête REST = une transaction », ADR 0011).
--
-- Chacune est réécrite en TypeScript dans `api/_depot.ts` (`DepotPrisma`),
-- sous `$transaction`, avec les MÊMES verrous (`for update` dans un ordre
-- fixe, verrou consultatif pour la création de compte). La dette « une
-- fonction SQL modifiée sans son double en mémoire » (CLAUDE.md §9) n'a plus
-- de prise : il n'y a plus de SQL à doubler, et `tests/depot-contrat` fait
-- passer la MÊME suite sur `DepotMemoire` et sur un vrai PostgreSQL.
--
-- Trois retouches de schéma, toutes parce que Prisma ne sait pas les décrire
-- — et qu'une forme qu'il ne sait pas décrire, il finit par la défaire :
--
--   · le DÉCLENCHEUR de la bannière part. `carte_banniere_id` reste dérivée
--     de `apparence.carte`, mais par le dépôt, dans la même écriture ;
--   · la colonne GÉNÉRÉE `progression_chapitre.termine` part. « Terminé »
--     se lit `etoiles[5] > 0`, et le dépôt le calcule à la lecture ;
--   · la clé composée du style porté passe de `ON DELETE SET NULL
--     (skin_porte_id)` à `NO ACTION`. La garantie qui compte reste en base —
--     on ne porte que ce qu'on possède ; la suppression d'une possession
--     portée, qui n'arrive qu'à la suppression du compte, remet d'abord
--     `skin_porte_id` à NULL (comme le faisait déjà `compte_supprime`).
--
-- Retour arrière : `prisma/retours/1-0.sql`.
-- ===================================================================

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

drop trigger if exists utilisateur_banniere on utilisateur;
drop function if exists utilisateur_derive_banniere();

alter table progression_chapitre drop column if exists termine;

alter table utilisateur drop constraint if exists utilisateur_skin_porte_fkey;
alter table utilisateur add constraint utilisateur_skin_porte_fkey
  foreign key (id, skin_porte_id) references skin_utilisateur(utilisateur_id, skin_id)
  on delete no action on update no action;
