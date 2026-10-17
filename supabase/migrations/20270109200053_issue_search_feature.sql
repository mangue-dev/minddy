-- MIN-718: accept the `issue_search` feature in the `ai_usage` ledger.
--
-- Issue pickers complement their lexical results with a search by meaning
-- over the MIN-717 issue index. Each distinct query costs one embeddings call,
-- billed to the searching user: its own feature so the cost of searching
-- reads apart from indexing (`issue_embedding`) and relation decisions.

ALTER TABLE "public"."ai_usage" DROP CONSTRAINT IF EXISTS "ai_usage_feature_check";

ALTER TABLE "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_feature_check" CHECK (("feature" = ANY (ARRAY['numo_chat'::text, 'numo_comment'::text, 'dictation'::text, 'transcription'::text, 'smart_assign'::text, 'smart_fill'::text, 'feedback_classify'::text, 'feedback_analyze'::text, 'embedding'::text, 'agent_code'::text, 'sandbox_compute'::text, 'web_search'::text, 'pr_review'::text, 'import_map'::text, 'landing_demo'::text, 'brief_split'::text, 'feedback_voice'::text, 'routine_code'::text, 'routine_compute'::text, 'jev_decision'::text, 'smart_triage'::text, 'jev_shadow'::text, 'faq_ask'::text, 'issue_embedding'::text, 'issue_relation'::text, 'issue_search'::text])));
