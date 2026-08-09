-- minddy — ajoute le feature 'issue_autocomplete' au ledger ai_usage.
--
-- Le texte fantôme du formulaire de création de ticket
-- (app/api/projects/[id]/complete-issue) : quelques appels de quelques dizaines
-- de tokens pendant qu'on écrit un ticket. Sa propre feature parce que c'est la
-- SEULE dépense IA déclenchée par la frappe et non par un geste — rangée sous
-- 'numo_chat', une dérive y serait invisible.
--
-- Côté utilisateur elle rejoint quand même le segment « Numo » (USAGE_SEGMENTS) :
-- c'est Numo qui écrit à côté de nous. La séparation vit en base, pas dans la
-- barre.
--
-- `get_user_usage_history` (20260817090000) garde `min(feature)` par run — ce
-- run-ci n'a qu'une ligne, donc rien à arbitrer.
--
-- Étend le CHECK de 20261113091000_ai_usage_routine.sql. Idempotent.

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in (
    'numo_chat', 'numo_comment', 'dictation', 'transcription',
    'smart_assign', 'feedback_classify', 'feedback_analyze', 'embedding',
    'agent_code', 'sandbox_compute', 'web_search', 'pr_review',
    'import_map', 'landing_demo', 'brief_split', 'feedback_voice',
    'routine_code', 'routine_compute', 'issue_autocomplete'));
