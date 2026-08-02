-- minddy — ajoute le feature 'import_map' au ledger ai_usage.
--
-- La correspondance des colonnes d'un import CSV (lib/server/import-mapping-ai.ts)
-- est UN appel par fichier déposé : le modèle ne voit qu'un résumé des colonnes,
-- jamais les lignes. Sa propre feature pour qu'on puisse répondre à « combien
-- coûte un import ? » sans la noyer dans les appels de l'assistant.
--
-- Étend le CHECK inline de 20260803090000_ai_usage.sql (dernier état :
-- 20260923090000_ai_usage_pr_review.sql). Idempotent.

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in (
    'numo_chat', 'numo_comment', 'dictation', 'transcription',
    'smart_assign', 'feedback_classify', 'feedback_analyze', 'embedding',
    'agent_code', 'sandbox_compute', 'web_search', 'pr_review',
    'import_map'));
