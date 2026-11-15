-- MIN-1001: the merge commit message written by AI when a member merges a
-- pull request from minddy is recorded in `ai_usage`, under its own feature.
-- The call ran on the platform key and was billed to no one, so it counted
-- neither in the member's usage nor in the finance dashboard.
--
-- Additive only: the previous release never writes the new feature.

BEGIN;

ALTER TABLE "public"."ai_usage" DROP CONSTRAINT IF EXISTS "ai_usage_feature_check";

ALTER TABLE "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_feature_check" CHECK (("feature" = ANY (ARRAY['numo_chat'::text, 'numo_comment'::text, 'dictation'::text, 'transcription'::text, 'smart_assign'::text, 'smart_fill'::text, 'feedback_classify'::text, 'feedback_analyze'::text, 'embedding'::text, 'agent_code'::text, 'sandbox_compute'::text, 'web_search'::text, 'pr_review'::text, 'import_map'::text, 'landing_demo'::text, 'brief_split'::text, 'feedback_voice'::text, 'routine_code'::text, 'routine_compute'::text, 'jev_decision'::text, 'smart_triage'::text, 'jev_shadow'::text, 'faq_ask'::text, 'issue_embedding'::text, 'issue_relation'::text, 'issue_search'::text, 'numo_wake'::text, 'numo_home_brief'::text, 'merge_message'::text])));

COMMIT;
