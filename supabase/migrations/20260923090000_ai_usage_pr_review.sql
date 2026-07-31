-- minddy — MIN-141 : ajoute le feature 'pr_review' au ledger ai_usage.
--
-- La review d'une pull request par Numo (bouton « Faire vérifier par Numo » du
-- menu Review) est UN appel LLM déclenché à la main, sur un modèle qui n'est pas
-- celui de l'agent de code — la relire avec le modèle qui l'a écrite ne vaut pas
-- grand-chose. Sa propre feature pour qu'on puisse répondre à « combien nous
-- coûte une review ? » sans la confondre avec les tours d'agent (`agent_code`).
--
-- Étend le CHECK inline de 20260803090000_ai_usage.sql (dernier état :
-- 20260905090000_ai_usage_web_search.sql). Idempotent.

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in (
    'numo_chat', 'numo_comment', 'dictation', 'transcription',
    'smart_assign', 'feedback_classify', 'feedback_analyze', 'embedding',
    'agent_code', 'sandbox_compute', 'web_search', 'pr_review'));
