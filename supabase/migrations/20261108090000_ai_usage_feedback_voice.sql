-- minddy — ajoute le feature 'feedback_voice' au ledger ai_usage.
--
-- Dicter un retour, au board public comme dans le dashboard : DEUX appels
-- (l'écoute puis le rangement par Numo) partagent un run_id et cette feature.
-- Une ligne = une dictée de retour, et son coût moyen par run est le prix d'une
-- prise. Les ranger sous 'transcription'/'dictation' les aurait mélangés à la
-- dictée des tickets, dont on ne se demande pas le coût en même temps ; côté
-- utilisateur la feature rejoint le segment « Retours » (lib/billing-plans.ts).
--
-- Étend le CHECK de 20261101090000_ai_usage_brief_split.sql. Idempotent.

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in (
    'numo_chat', 'numo_comment', 'dictation', 'transcription',
    'smart_assign', 'feedback_classify', 'feedback_analyze', 'embedding',
    'agent_code', 'sandbox_compute', 'web_search', 'pr_review',
    'import_map', 'landing_demo', 'brief_split', 'feedback_voice'));
