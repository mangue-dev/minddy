-- MIN-829: the admin Costs tab reads AI spending per day, feature, model and
-- key mode, so it can chart spend by model, compare with the previous period
-- and filter without another round trip. Aggregates only: no user, project,
-- conversation or prompt leaves the ledger.
CREATE OR REPLACE FUNCTION public.get_ai_cost_breakdown(
  p_since timestamptz,
  p_until timestamptz DEFAULT now(),
  p_tz text DEFAULT 'UTC'
)
RETURNS TABLE(
  day date,
  feature text,
  model text,
  key_mode text,
  cost_usd numeric,
  calls bigint,
  prompt_tokens bigint,
  completion_tokens bigint,
  cached_tokens bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    (a.created_at AT TIME ZONE p_tz)::date,
    a.feature,
    coalesce(a.model, ''),
    a.key_mode,
    coalesce(sum(a.cost), 0),
    count(*),
    coalesce(sum(a.prompt_tokens), 0),
    coalesce(sum(a.completion_tokens), 0),
    coalesce(sum(a.cached_tokens), 0)
  FROM public.ai_usage a
  WHERE a.created_at >= p_since
    AND a.created_at < p_until
    -- Bounded: the screen never asks for more than two 365-day windows.
    AND p_since >= now() - interval '731 days'
  GROUP BY 1, 2, 3, 4
  ORDER BY 1;
$$;
REVOKE ALL ON FUNCTION public.get_ai_cost_breakdown(timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_cost_breakdown(timestamptz, timestamptz, text) TO service_role;
