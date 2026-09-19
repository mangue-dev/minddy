-- MIN-567: the shadow comparison ledger of the Jev decision layer.
--
-- Shadow sampling: after a CONFIDENT Jev decision on real traffic, the LLM
-- pass is replayed on a small sample (`jev_shadow_sample_rate`, ~5%) and the
-- agreement is recorded here. The LLM is the reference (the implementation
-- proven before MIN-557); the row NEVER influences the decision it shadows.
--
-- One row per sampled decision:
-- - use_case — the decision layer use case (`smart_fill`, `smart_assign`,
--   `smart_triage`, later `feedback_review` if its bespoke flow is wired).
--   Deliberately open text: a new use case must not need a migration.
-- - subject_id — the evaluated entity when one exists (the Smart Assign
--   issue, later the feedback post). `null` for the decisions that happen
--   before the entity exists (Smart Fill at creation) or cover a set (Smart
--   Triage scores a whole column; the evaluated tickets are the keys of the
--   stored answers).
-- - jev_answers / jev_confidence — what Jev answered (all questions, its
--   parsing is strict) and the global confidence the runner trusted.
-- - llm_answers / llm_confidence — the replayed LLM pass. NULL when the
--   replay failed: the agreement is then unknown, and the row says so
--   (`agree` IS NULL by the same rule).
-- - agree — NULL when the replay failed or the two engines share no
--   comparable answer; otherwise whether every comparable answer matches.
-- - jev_latency_ms / llm_latency_ms — end-to-end duration of each leg
--   measured by the runner (key resolution and parsing included).
-- - llm_cost — the replay's ledger cost (the DELTA the sampling adds over
--   Jev-only), read back from `ai_usage` under the `jev_shadow` feature.

CREATE TABLE IF NOT EXISTS "public"."ai_decision_evaluations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "use_case" "text" NOT NULL,
    "subject_id" "text",
    "jev_answers" "jsonb" NOT NULL,
    "jev_confidence" "numeric",
    "llm_answers" "jsonb",
    "llm_confidence" "numeric",
    "agree" boolean,
    "jev_latency_ms" integer,
    "llm_latency_ms" integer,
    "llm_cost" "numeric"(12,6),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_decision_evaluations_agree_needs_answers_check"
        CHECK (("llm_answers" IS NOT NULL OR "agree" IS NULL))
);


ALTER TABLE "public"."ai_decision_evaluations" OWNER TO "postgres";


CREATE INDEX IF NOT EXISTS "ai_decision_evaluations_use_case_created_at_idx"
    ON "public"."ai_decision_evaluations" USING "btree" ("use_case", "created_at" DESC);


ALTER TABLE "public"."ai_decision_evaluations" ENABLE ROW LEVEL SECURITY;


-- Internal quality ledger: written and read by the service role only
-- (admin routes use the service client). RLS with no policy denies
-- anon/authenticated, mirroring `ai_usage`.
GRANT ALL ON TABLE "public"."ai_decision_evaluations" TO "anon";
GRANT ALL ON TABLE "public"."ai_decision_evaluations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_decision_evaluations" TO "service_role";


COMMENT ON TABLE "public"."ai_decision_evaluations" IS 'Shadow comparison Jev vs LLM of the AI decision layer (MIN-567): one row per sampled confident Jev decision, the LLM pass replayed as the reference. agree IS NULL = replay failed or nothing comparable.';


-- Weekly aggregation the admin dashboard reads (`/api/admin/decisions-quality`):
-- agreement per use case and week, plus the average latency of each engine
-- and the average shadow cost. Computed IN the database like the other admin
-- aggregates — a plain read of rows would be capped by PostgREST and would
-- silently stop at 1,000 lines.
CREATE OR REPLACE VIEW "public"."ai_decision_evaluations_weekly"
    WITH (security_invoker = true) AS
SELECT
    "e"."use_case",
    "pg_catalog"."date_trunc"('week', "e"."created_at") AS "week_start",
    count(*) AS "samples",
    count(*) FILTER (WHERE "e"."agree" IS NOT NULL) AS "comparable",
    count(*) FILTER (WHERE "e"."agree" IS TRUE) AS "agree_count",
    count(*) FILTER (WHERE "e"."llm_answers" IS NULL) AS "replay_failed",
    "pg_catalog"."round"("pg_catalog"."avg"("e"."jev_latency_ms")::numeric, 1) AS "jev_latency_ms",
    "pg_catalog"."round"("pg_catalog"."avg"("e"."llm_latency_ms")::numeric, 1) AS "llm_latency_ms",
    "pg_catalog"."avg"("e"."llm_cost") AS "llm_cost"
FROM "public"."ai_decision_evaluations" "e"
GROUP BY 1, 2;


ALTER TABLE "public"."ai_decision_evaluations_weekly" OWNER TO "postgres";


REVOKE ALL ON "public"."ai_decision_evaluations_weekly" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON "public"."ai_decision_evaluations_weekly" TO "service_role";


-- The LLM replay of a sampled decision bills under its own feature — NOT
-- under the use case's pass feature, or the finance view would read
-- phantom LLM decisions into the real ones. `jev_shadow` keeps the sampling
-- delta readable (and removable) as one line.
ALTER TABLE "public"."ai_usage" DROP CONSTRAINT IF EXISTS "ai_usage_feature_check";

ALTER TABLE "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_feature_check" CHECK (("feature" = ANY (ARRAY['numo_chat'::text, 'numo_comment'::text, 'dictation'::text, 'transcription'::text, 'smart_assign'::text, 'smart_fill'::text, 'feedback_classify'::text, 'feedback_analyze'::text, 'embedding'::text, 'agent_code'::text, 'sandbox_compute'::text, 'web_search'::text, 'pr_review'::text, 'import_map'::text, 'landing_demo'::text, 'brief_split'::text, 'feedback_voice'::text, 'routine_code'::text, 'routine_compute'::text, 'jev_decision'::text, 'smart_triage'::text, 'jev_shadow'::text])));


-- The LLM-first switch (MIN-567): use cases listed here skip Jev and decide
-- with the LLM directly. Empty = none; the calibrated list is a plain
-- `app_config` edit, no deploy. Seeded empty so the lever is discoverable
-- next to the other Jev keys (see 20270106940000_jev_decision_settings.sql).
insert into public.app_config (key, value) values
  ('jev_llm_first', '')
on conflict (key) do nothing;
