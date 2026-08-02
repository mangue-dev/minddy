-- minddy — ajoute le motif 'platform' à ai_usage.billed_reason (MIN-150).
--
-- La démo de dictée de la landing est jouable SANS COMPTE : personne à qui
-- imputer l'appel, et pourtant ce n'est pas une anomalie — c'est une dépense
-- décidée, offerte au visiteur pour qu'il voie ce que le produit fait avant de
-- s'inscrire. `unattributed` disait déjà « personne ne paye », mais il dit
-- surtout « ça n'aurait pas dû arriver » : côté serveur il journalise une
-- erreur, et confondre les deux revient à s'habituer à cette erreur-là.
--
--   'trigger'        — `user_id` EST le déclencheur de l'action (le cas normal)
--   'project_owner'  — pas de déclencheur nommable : le owner du projet paye
--   'platform'       — la plateforme offre l'appel (visiteur sans compte)
--   'unattributed'   — personne ne paye ; l'appel a journalisé l'anomalie
--
-- Étend le CHECK inline de 20260916090000_ai_usage_billed_reason.sql, dont
-- Postgres a nommé la contrainte `ai_usage_billed_reason_check`. Idempotent.

alter table public.ai_usage drop constraint if exists ai_usage_billed_reason_check;

alter table public.ai_usage add constraint ai_usage_billed_reason_check
  check (billed_reason in ('trigger', 'project_owner', 'platform', 'unattributed'));

comment on column public.ai_usage.billed_reason is
  'Pourquoi cette ligne est imputée à user_id (MIN-131, MIN-150). null = ligne antérieure à la colonne.';
