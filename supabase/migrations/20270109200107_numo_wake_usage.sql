-- MIN-928: the wake decision of background Numo.
--
-- Its LLM fallback bills the `numo_wake` feature, and members choose its
-- provider like every other call type (`numo_wake_model`). Both lists are
-- CHECK constraints, so both are extended.
--
-- A member who routes Numo's conversation titles to one of their keys gets the
-- same route for the wake decision: both are small text calls of Numo, and
-- without a route the call would move to minddy Cloud, or have no provider
-- at all on an instance without it.
--
-- Additive for the previous release: it never writes the new values.

BEGIN;

ALTER TABLE "public"."ai_usage" DROP CONSTRAINT IF EXISTS "ai_usage_feature_check";

ALTER TABLE "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_feature_check" CHECK (("feature" = ANY (ARRAY['numo_chat'::text, 'numo_comment'::text, 'dictation'::text, 'transcription'::text, 'smart_assign'::text, 'smart_fill'::text, 'feedback_classify'::text, 'feedback_analyze'::text, 'embedding'::text, 'agent_code'::text, 'sandbox_compute'::text, 'web_search'::text, 'pr_review'::text, 'import_map'::text, 'landing_demo'::text, 'brief_split'::text, 'feedback_voice'::text, 'routine_code'::text, 'routine_compute'::text, 'jev_decision'::text, 'smart_triage'::text, 'jev_shadow'::text, 'faq_ask'::text, 'issue_embedding'::text, 'issue_relation'::text, 'issue_search'::text, 'numo_wake'::text])));

ALTER TABLE public.user_ai_usage_routes
  DROP CONSTRAINT user_ai_usage_routes_usage_key_check;

ALTER TABLE public.user_ai_usage_routes
  ADD CONSTRAINT user_ai_usage_routes_usage_key_check CHECK (usage_key IN (
    'assistant_model', 'conversation_title_model', 'web_search_model', 'numo_wake_model',
    'smart_assign_model', 'smart_fill_model', 'smart_fill_title_model',
    'import_map_model', 'brief_model', 'issue_embedding_model',
    'issue_relation_model', 'dictate_model', 'transcription_model',
    'feedback_analysis_model', 'feedback_embedding_model'
  ));

INSERT INTO public.user_ai_usage_routes (user_id, usage_key, ai_key_id, created_at, updated_at)
SELECT user_id, 'numo_wake_model', ai_key_id, now(), now()
FROM public.user_ai_usage_routes
WHERE usage_key = 'conversation_title_model'
ON CONFLICT (user_id, usage_key) DO NOTHING;

COMMIT;
