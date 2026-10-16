-- MIN-694: the decision model is a global admin choice, so the shadow
-- comparison must say WHICH decision model each sample measured. Without it,
-- the agreement, latency and cost of a newly selected model would blend into
-- Jev's history and the confidence-floor calibration would read a mixture.
--
-- - decision_model — the versioned model id the decisions endpoint reported
--   for the shadowed decision (for example `typesafe/jev-1.13-20260917`).
--   NULL on rows written before this migration: they were not recorded, and
--   no value is invented for them. Plain text: a model id is operational
--   configuration, not user content.
-- - The weekly view gains the column as its last output column (allowed by
--   CREATE OR REPLACE VIEW) and groups by it, so each model reads separately.
--   Historical rows keep their own NULL group; every existing column keeps
--   its name, type and meaning.

ALTER TABLE public.ai_decision_evaluations
  ADD COLUMN IF NOT EXISTS decision_model text;

COMMENT ON COLUMN public.ai_decision_evaluations.decision_model IS
  'Versioned decision model that answered the shadowed decision (MIN-694). NULL before MIN-694. The jev_* columns hold that model''s half, whichever model it is.';

CREATE OR REPLACE VIEW public.ai_decision_evaluations_weekly
  WITH (security_invoker=true) AS
SELECT e.use_case,pg_catalog.date_trunc('week',e.created_at) AS week_start,
  count(*) AS samples,
  count(*) FILTER (WHERE e.agree IS NOT NULL) AS comparable,
  count(*) FILTER (WHERE e.agree IS TRUE) AS agree_count,
  count(*) FILTER (WHERE
    COALESCE(e.replay_succeeded,e.llm_answers IS NOT NULL) IS FALSE)
    AS replay_failed,
  pg_catalog.sum(e.jev_latency_ms) AS jev_latency_sum,
  pg_catalog.count(e.jev_latency_ms) AS jev_latency_count,
  pg_catalog.sum(e.llm_latency_ms) AS llm_latency_sum,
  pg_catalog.count(e.llm_latency_ms) AS llm_latency_count,
  pg_catalog.sum(e.llm_cost) AS llm_cost_sum,
  pg_catalog.count(e.llm_cost) AS llm_cost_count,
  e.decision_model
FROM public.ai_decision_evaluations e
GROUP BY e.use_case, pg_catalog.date_trunc('week',e.created_at), e.decision_model;

REVOKE ALL ON public.ai_decision_evaluations_weekly FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_decision_evaluations_weekly TO service_role;
