-- MIN-561: accept the `jev_decision` feature in the `ai_usage` ledger.
--
-- Jev (`typesafe/jev-1.13`, reached through OpenRouter's decisions endpoint)
-- backs the AI decision layer (MIN-557). Every call writes one line under
-- this feature, priced on input tokens only ($0.042/MTok; output tokens are
-- free). The usage bar files these lines under the "Automations" segment
-- (see `USAGE_SEGMENTS` in lib/billing-plans.ts).

ALTER TABLE "public"."ai_usage" DROP CONSTRAINT IF EXISTS "ai_usage_feature_check";

ALTER TABLE "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_feature_check" CHECK (("feature" = ANY (ARRAY['numo_chat'::text, 'numo_comment'::text, 'dictation'::text, 'transcription'::text, 'smart_assign'::text, 'smart_fill'::text, 'feedback_classify'::text, 'feedback_analyze'::text, 'embedding'::text, 'agent_code'::text, 'sandbox_compute'::text, 'web_search'::text, 'pr_review'::text, 'import_map'::text, 'landing_demo'::text, 'brief_split'::text, 'feedback_voice'::text, 'routine_code'::text, 'routine_compute'::text, 'jev_decision'::text])));
