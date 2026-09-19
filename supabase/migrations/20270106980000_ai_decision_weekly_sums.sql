-- MIN-567 (review fix): the weekly view returns SUMS and COUNTS instead of
-- per-week averages. Weeks carry very different traffic — one sample in one
-- week, hundreds in another — and an average of per-week averages weighs a
-- thin week as much as a busy one, materially misleading the calibration.
-- The dashboard aggregates the sums across weeks and divides by the counts,
-- so every displayed latency and cost is a true per-sample average.
--
-- DROP + CREATE, not CREATE OR REPLACE: the column set is renamed
-- (`jev_latency_ms` → `jev_latency_sum` + count columns) and Postgres
-- refuses to rename view columns in place. The grants are re-issued —
-- dropping the view drops them with it.

DROP VIEW IF EXISTS "public"."ai_decision_evaluations_weekly";

CREATE VIEW "public"."ai_decision_evaluations_weekly"
    WITH (security_invoker = true) AS
SELECT
    "e"."use_case",
    "pg_catalog"."date_trunc"('week', "e"."created_at") AS "week_start",
    count(*) AS "samples",
    count(*) FILTER (WHERE "e"."agree" IS NOT NULL) AS "comparable",
    count(*) FILTER (WHERE "e"."agree" IS TRUE) AS "agree_count",
    count(*) FILTER (WHERE "e"."llm_answers" IS NULL) AS "replay_failed",
    "pg_catalog"."sum"("e"."jev_latency_ms") AS "jev_latency_sum",
    "pg_catalog"."count"("e"."jev_latency_ms") AS "jev_latency_count",
    "pg_catalog"."sum"("e"."llm_latency_ms") AS "llm_latency_sum",
    "pg_catalog"."count"("e"."llm_latency_ms") AS "llm_latency_count",
    "pg_catalog"."sum"("e"."llm_cost") AS "llm_cost_sum",
    "pg_catalog"."count"("e"."llm_cost") AS "llm_cost_count"
FROM "public"."ai_decision_evaluations" "e"
GROUP BY 1, 2;


ALTER TABLE "public"."ai_decision_evaluations_weekly" OWNER TO "postgres";


REVOKE ALL ON "public"."ai_decision_evaluations_weekly" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON "public"."ai_decision_evaluations_weekly" TO "service_role";
