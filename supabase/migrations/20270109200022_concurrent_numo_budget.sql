-- Keep concurrent conversation capacity without changing issued worker keys.
BEGIN;

CREATE OR REPLACE FUNCTION public.concurrent_managed_budget_grant(
  p_requested numeric, p_available numeric
) RETURNS numeric
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  -- Leave at most $1, or 10% of the currently uncommitted capacity, for
  -- subsequent operations. Small explicit requests retain their full cap.
  -- Truncate to the storage precision so a grant never rounds above capacity.
  SELECT pg_catalog.trunc(LEAST(
    GREATEST(p_requested, 0),
    GREATEST(p_available, 0) - LEAST(1, GREATEST(p_available, 0) * 0.1)
  ), 6);
$$;
REVOKE ALL ON FUNCTION public.concurrent_managed_budget_grant(numeric,numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.concurrent_managed_budget_grant(numeric,numeric)
  TO service_role;

-- Patch only the allocation expression in the current definitions. This
-- preserves the encryption, stopped-request receipts, authorization, and
-- parent/child guards added after the original budget RPCs.
DO $$
DECLARE
  signature text;
  definition text;
  rewritten text;
  expected_count integer;
  allocation text := 'GREATEST(p_budget_cap - v_spent - v_reserved, 0)';
  active_parent_pattern text := E'AND turn.status IN \\(\\s*''queued'', ''running'', ''waiting_work'', ''stopping'', ''retryable'', ''reconciling''\\s*\\)';
BEGIN
  FOR signature, expected_count IN SELECT * FROM (VALUES
    ('public.begin_numo_turn_with_budget(uuid,uuid,uuid,uuid,jsonb,text,text,uuid,integer,text,jsonb,jsonb,timestamptz,numeric,numeric)', 1),
    ('public.create_agent_run_with_budget(uuid,timestamptz,numeric,numeric,jsonb)', 2),
    ('public.resume_agent_run_with_budget(uuid,uuid,timestamptz,numeric,numeric,timestamptz)', 1),
    ('public.resume_latest_agent_run_with_message(uuid,uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz,numeric,numeric)', 1)
  ) AS functions(signature, expected_count)
  LOOP
    definition := pg_catalog.pg_get_functiondef(signature::regprocedure);
    IF (pg_catalog.length(definition) - pg_catalog.length(
      pg_catalog.replace(definition, allocation, '')
    )) / pg_catalog.length(allocation) <> expected_count THEN
      RAISE EXCEPTION 'Unexpected managed budget definition: %', signature;
    END IF;
    rewritten := pg_catalog.replace(definition, allocation,
      'public.concurrent_managed_budget_grant(p_requested_budget, ' || allocation || ')');
    -- Stop revokes the parent's authority immediately. Keep its reservation
    -- until every live child has actually settled, including late usage.
    IF rewritten !~ active_parent_pattern THEN
      RAISE EXCEPTION 'Unexpected managed budget parent states: %', signature;
    END IF;
    rewritten := pg_catalog.regexp_replace(rewritten, active_parent_pattern,
      'AND (turn.status IN (''queued'', ''running'', ''waiting_work'', ''stopping'', ''retryable'', ''reconciling'') OR EXISTS (SELECT 1 FROM public.agent_runs AS child WHERE child.parent_numo_turn_id = turn.id AND child.status IN (''queued'', ''running'')))', 'g');
    EXECUTE rewritten;
  END LOOP;
END;
$$;

-- A resumed allocation is an additional allowance. Stored caps and provider
-- keys subtract lifetime platform spend; include that spend exactly once.
-- Routine caps still compare total operation spend, including BYOK charges.
DO $$
DECLARE
  definition text;
  rewritten text;
  signature text;
BEGIN
  signature := 'public.resume_agent_run_with_budget(uuid,uuid,timestamptz,numeric,numeric,timestamptz)';
  definition := pg_catalog.pg_get_functiondef(signature::regprocedure);
  rewritten := pg_catalog.replace(definition,
    'WHEN v_parent.id IS NOT NULL THEN v_granted + COALESCE(v_operation_spent, 0)' || E'\n    ELSE v_granted',
    'WHEN v_parent.id IS NOT NULL THEN v_granted + public.get_numo_operation_platform_spend(v_parent.id)' || E'\n    ELSE v_granted + (SELECT COALESCE(SUM(cost), 0) FROM public.ai_usage WHERE run_id = v_run.run_id AND key_mode = ''platform'')');
  IF rewritten = definition THEN
    RAISE EXCEPTION 'Unexpected resume budget accounting definition';
  END IF;
  EXECUTE rewritten;

  signature := 'public.resume_latest_agent_run_with_message(uuid,uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz,numeric,numeric)';
  definition := pg_catalog.pg_get_functiondef(signature::regprocedure);
  rewritten := pg_catalog.replace(definition,
    'THEN COALESCE(v_operation_platform_spent, 0) + v_granted' || E'\n      ELSE v_granted',
    'THEN COALESCE(v_operation_platform_spent, 0) + v_granted' || E'\n      ELSE v_granted + (SELECT COALESCE(SUM(cost), 0) FROM public.ai_usage WHERE run_id = v_run.run_id AND key_mode = ''platform'')');
  IF rewritten = definition THEN
    RAISE EXCEPTION 'Unexpected message resume budget accounting definition';
  END IF;
  EXECUTE rewritten;
END;
$$;

COMMIT;
