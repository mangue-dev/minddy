BEGIN;

-- Match the quota ledger: account attribution, platform keys, and exact reset bounds.
CREATE OR REPLACE FUNCTION public.get_user_usage_daily(
  p_user_id uuid,
  p_since timestamptz,
  p_until timestamptz
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.day, d.feature), '[]'::jsonb)
  FROM (
    SELECT
      to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
      u.feature,
      sum(COALESCE(u.cost, 0)) AS cost
    FROM public.ai_usage AS u
    WHERE u.user_id = p_user_id
      AND u.key_mode = 'platform'
      AND u.created_at >= p_since
      AND u.created_at < p_until
    GROUP BY 1, u.feature
  ) AS d;
$$;

REVOKE ALL ON FUNCTION public.get_user_usage_daily(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_usage_daily(uuid, timestamptz, timestamptz)
  TO service_role;

-- The ledger describes consumption of the included budget, so BYOK costs are excluded.
CREATE OR REPLACE FUNCTION public.get_user_usage_history(
  p_user_id uuid,
  p_since timestamptz,
  p_features text[] DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  WITH runs AS (
    SELECT
      COALESCE(u.numo_turn_id, u.run_id) AS run_id,
      CASE
        WHEN bool_or(u.routine_id IS NOT NULL) THEN 'routine_code'
        WHEN p_features IS NULL AND bool_or(u.numo_turn_id IS NOT NULL) THEN 'numo_chat'
        ELSE min(u.feature)
      END AS feature,
      sum(COALESCE(u.cost, 0)) AS cost,
      count(*) AS calls,
      min(u.created_at) AS first_at,
      max(u.project_id::text)::uuid AS project_id
    FROM public.ai_usage AS u
    WHERE u.user_id = p_user_id
      AND u.key_mode = 'platform'
      AND u.created_at >= p_since
      AND u.created_at < now()
      AND (p_features IS NULL OR u.feature = ANY(p_features))
    GROUP BY COALESCE(u.numo_turn_id, u.run_id)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM runs),
    'entries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'run_id', r.run_id,
        'feature', r.feature,
        'cost', r.cost,
        'calls', r.calls,
        'first_at', r.first_at,
        'project_id', r.project_id,
        'project_name', NULL::text
      ) ORDER BY r.first_at DESC)
      FROM (
        SELECT * FROM runs ORDER BY first_at DESC LIMIT p_limit OFFSET p_offset
      ) AS r
    ), '[]'::jsonb)
  );
$$;

COMMIT;
