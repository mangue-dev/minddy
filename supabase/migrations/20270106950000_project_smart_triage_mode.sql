-- MIN-566: Smart Triage (opt-in) — on-demand reordering of a board column.
--
-- `smart_triage_mode` is a PER-PROJECT choice, never a platform switch
-- (MIN-557): `off` (default) keeps today's behavior — manual drag only; `rules`
-- reorders a column through the static rules (relations first, quick wins,
-- objective grouping); `jev` replaces the rules ranking with one decision-layer
-- scoring pass per column. Nothing runs on its own: the reorder happens when
-- someone clicks "Smart triage", and the manual drag order stays editable
-- afterwards.
--
-- The mode is owner-set and validated in lib/server/update-project.ts; arming
-- `jev` additionally requires the owner's AI budget (the Jev pass bills the
-- ACTOR in the "Automations" segment, like the other MIN-557 decisions).

ALTER TABLE "public"."projects"
    ADD COLUMN "smart_triage_mode" "text" DEFAULT 'off'::"text" NOT NULL;

ALTER TABLE "public"."projects"
    ADD CONSTRAINT "projects_smart_triage_mode_check"
    CHECK ("smart_triage_mode" = ANY (ARRAY['off'::"text", 'rules'::"text", 'jev'::"text"]));

-- The LLM fallback of the triage scoring (Jev down or under the confidence
-- floor) bills under its own feature — same ledger, same segment, a line the
-- usage history can name ("Smart Triage") instead of a borrowed one.
ALTER TABLE "public"."ai_usage" DROP CONSTRAINT IF EXISTS "ai_usage_feature_check";

ALTER TABLE "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_feature_check" CHECK (("feature" = ANY (ARRAY['numo_chat'::text, 'numo_comment'::text, 'dictation'::text, 'transcription'::text, 'smart_assign'::text, 'smart_fill'::text, 'feedback_classify'::text, 'feedback_analyze'::text, 'embedding'::text, 'agent_code'::text, 'sandbox_compute'::text, 'web_search'::text, 'pr_review'::text, 'import_map'::text, 'landing_demo'::text, 'brief_split'::text, 'feedback_voice'::text, 'routine_code'::text, 'routine_compute'::text, 'jev_decision'::text, 'smart_triage'::text])));
