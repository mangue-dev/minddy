-- minddy — ajoute le feature 'web_search' au ledger ai_usage.
--
-- La recherche web de Numo (tool `web_search`, plugin web d'OpenRouter en moteur
-- Exa) est un sous-appel LLM à part : forfait de recherche (~$0.005) + quelques
-- tokens, INCLUS dans le `usage.cost` renvoyé par OpenRouter. Sa propre feature
-- pour qu'on puisse répondre à « combien nous coûte la recherche web ? » sans
-- démêler les lignes de numo_chat / numo_comment / agent_code.
--
-- Étend le CHECK inline de 20260803090000_ai_usage.sql (dernier état :
-- 20260816090000_billing.sql). Idempotent.

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in (
    'numo_chat', 'numo_comment', 'dictation', 'transcription',
    'smart_assign', 'feedback_classify', 'feedback_analyze', 'embedding',
    'agent_code', 'sandbox_compute', 'web_search'));
