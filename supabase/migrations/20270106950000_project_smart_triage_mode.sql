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

-- The reorder itself is ONE transaction: every position of the batch commits
-- together or nothing does — a half-reordered board would disagree with the
-- client until the next reconciliation. The server has already decided the
-- order; the function only writes it back, scoped to the project, skipping
-- trashed rows. Returns the number of rows actually updated so a silent miss
-- (a ticket trashed mid-flight) is detectable.
CREATE OR REPLACE FUNCTION "public"."apply_smart_triage_moves"(
    "p_project_id" "uuid",
    "p_moves" "jsonb"
) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" = ''
    AS $$
DECLARE
    applied integer := 0;
    move "jsonb";
BEGIN
    IF "p_moves" IS NULL OR "jsonb_typeof"("p_moves") <> 'array' THEN
        RAISE EXCEPTION 'p_moves must be a jsonb array of {id, position}';
    END IF;
    FOR move IN SELECT * FROM "jsonb_array_elements"("p_moves") LOOP
        UPDATE "public"."issues"
            SET "position" = ("move"->>'position')::double precision
            WHERE "id" = ("move"->>'id')::"uuid"
              AND "project_id" = "p_project_id"
              AND "deleted_at" IS NULL;
        IF FOUND THEN applied := applied + 1; END IF;
    END LOOP;
    RETURN applied;
END;
$$;

-- `ON FUNCTION` with the full signature: a bare `ON <name>` resolves to a
-- TABLE, and the function would never be found (the migration failed with
-- "relation does not exist" on its first application).
REVOKE ALL ON FUNCTION "public"."apply_smart_triage_moves"("uuid", "jsonb") FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."apply_smart_triage_moves"("uuid", "jsonb") TO "service_role";
