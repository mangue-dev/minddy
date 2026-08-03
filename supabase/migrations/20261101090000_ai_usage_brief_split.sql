-- minddy — ajoute le feature 'brief_split' au ledger ai_usage (MIN-172).
--
-- L'amorce d'un projet neuf : un texte collé devient une proposition
-- d'objectifs et de tickets, en UN appel. Sa propre feature, comme 'import_map'
-- avant elle — une ligne = un brief découpé, et son coût moyen par run est le
-- prix d'une amorce. La ranger sous 'numo_chat' l'aurait noyée dans la
-- conversation, où elle est invisible.
--
-- Étend le CHECK de 20261003091000_ai_usage_landing_demo.sql. Idempotent.

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in (
    'numo_chat', 'numo_comment', 'dictation', 'transcription',
    'smart_assign', 'feedback_classify', 'feedback_analyze', 'embedding',
    'agent_code', 'sandbox_compute', 'web_search', 'pr_review',
    'import_map', 'landing_demo', 'brief_split'));
