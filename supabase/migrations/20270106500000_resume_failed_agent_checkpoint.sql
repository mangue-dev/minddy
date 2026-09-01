-- Allow an interrupted agent turn to resume when it retained a checkpoint.
-- Bootstrap failures remain terminal because they have no recoverable session.
CREATE OR REPLACE FUNCTION public.resume_agent_run_with_budget(
  p_run_id uuid,
  p_user_id uuid,
  p_usage_since timestamptz,
  p_budget_cap numeric,
  p_requested_budget numeric,
  p_not_before timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.agent_runs%ROWTYPE;
  v_spent numeric;
  v_reserved numeric;
  v_granted numeric;
BEGIN
  IF p_run_id IS NULL OR p_user_id IS NULL OR p_usage_since IS NULL
     OR p_budget_cap IS NULL OR p_budget_cap < 0
     OR p_requested_budget IS NULL OR p_requested_budget <= 0
     OR p_not_before IS NULL THEN
    RAISE EXCEPTION 'agent_resume_budget_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 460)
  );

  SELECT * INTO v_run
  FROM public.agent_runs
  WHERE id = p_run_id
  FOR UPDATE;
  IF v_run.id IS NULL OR v_run.created_by IS DISTINCT FROM p_user_id
     OR v_run.key_mode IS DISTINCT FROM 'platform'
     OR v_run.status NOT IN ('completed', 'failed', 'canceled')
     OR (v_run.status = 'failed' AND v_run.checkpoint IS NULL)
     OR v_run.sandbox_reap_claim IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('state', 'conflict');
  END IF;

  SELECT COALESCE(SUM(cost), 0)
  INTO v_spent
  FROM public.ai_usage
  WHERE user_id = p_user_id
    AND created_at >= p_usage_since
    AND key_mode = 'platform';

  SELECT COALESCE(SUM(GREATEST(
    run.managed_budget_usd - COALESCE(usage.spent, 0), 0
  )), 0)
  INTO v_reserved
  FROM public.agent_runs AS run
  LEFT JOIN LATERAL (
    SELECT SUM(cost) AS spent
    FROM public.ai_usage
    WHERE run_id = run.run_id AND key_mode = 'platform'
  ) AS usage ON true
  WHERE run.created_by = p_user_id
    AND run.key_mode = 'platform'
    AND run.status IN ('queued', 'running')
    AND run.managed_budget_usd IS NOT NULL;

  v_granted := LEAST(
    p_requested_budget,
    GREATEST(p_budget_cap - v_spent - v_reserved, 0)
  );
  IF v_granted <= 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', 'no_budget',
      'spent_usd', v_spent,
      'reserved_usd', v_reserved
    );
  END IF;

  UPDATE public.agent_runs
  SET status = 'queued',
      not_before = p_not_before,
      managed_budget_usd = v_granted
  WHERE id = p_run_id;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'queued',
    'granted_budget_usd', v_granted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resume_agent_run_with_budget(
  uuid, uuid, timestamptz, numeric, numeric, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_agent_run_with_budget(
  uuid, uuid, timestamptz, numeric, numeric, timestamptz
) TO service_role;
