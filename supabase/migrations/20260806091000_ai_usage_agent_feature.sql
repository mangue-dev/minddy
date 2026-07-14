-- minddy — MIN-46 : ajoute le feature 'agent_code' au ledger ai_usage.
--
-- Chaque appel LLM de l'agent de code cloud est enregistré dans ai_usage avec
-- feature='agent_code' (regroupé par run via run_id) → coût réel, base du
-- plafond mensuel sur la clé plateforme. Étend le CHECK inline de
-- 20260803090000_ai_usage.sql (nommé ai_usage_feature_check). Idempotent.

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in (
    'numo_chat', 'numo_comment', 'dictation', 'transcription',
    'smart_assign', 'feedback_classify', 'feedback_analyze', 'embedding',
    'agent_code'));
