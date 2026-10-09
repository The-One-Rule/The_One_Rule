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
