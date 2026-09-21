-- MIN-590: accept the `faq_ask` feature in the `ai_usage` ledger.
--
-- The question box of the FAQ sections (`/`, `/pricing`, `/mcp`) answers a
-- visitor's own question with one small completion per ask, funded by the
-- platform (`lib/server/faq-answer.ts`). Its own feature, like
-- `landing_demo`: a decided expenditure for anonymous traffic, readable on
-- its own line in the finance view.

ALTER TABLE "public"."ai_usage" DROP CONSTRAINT IF EXISTS "ai_usage_feature_check";

ALTER TABLE "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_feature_check" CHECK (("feature" = ANY (ARRAY['numo_chat'::text, 'numo_comment'::text, 'dictation'::text, 'transcription'::text, 'smart_assign'::text, 'smart_fill'::text, 'feedback_classify'::text, 'feedback_analyze'::text, 'embedding'::text, 'agent_code'::text, 'sandbox_compute'::text, 'web_search'::text, 'pr_review'::text, 'import_map'::text, 'landing_demo'::text, 'brief_split'::text, 'feedback_voice'::text, 'routine_code'::text, 'routine_compute'::text, 'jev_decision'::text, 'smart_triage'::text, 'jev_shadow'::text, 'faq_ask'::text])));
