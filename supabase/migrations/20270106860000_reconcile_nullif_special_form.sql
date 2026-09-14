-- Reapply the effective definitions of the two functions whose bodies shipped
-- with schema-qualified NULLIF calls (`nullif` forced into the `pg_catalog`
-- namespace). NULLIF is a parser special form resolved only for unqualified
-- calls; a qualified call does a real pg_proc lookup where no such entry
-- exists, so the bodies passed CREATE-time validation and then failed at first
-- execution with `function nullif(text, unknown)` unresolvable in pg_catalog
-- (MIN-543). This forward migration makes upgrades converge with fresh
-- installs.

CREATE OR REPLACE FUNCTION public.create_agent_run_with_budget(
  p_user_id uuid,
  p_usage_since timestamptz,
  p_budget_cap numeric,
  p_requested_budget numeric,
  p_values jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_spent numeric;
  v_reserved numeric;
  v_granted numeric;
  v_operation_spent numeric;
  v_operation_total_spent numeric;
  v_parent public.numo_assistant_turns%ROWTYPE;
  v_run public.agent_runs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_usage_since IS NULL
     OR p_budget_cap IS NULL OR p_budget_cap < 0
     OR p_requested_budget IS NULL OR p_requested_budget <= 0
     OR p_values IS NULL OR pg_catalog.jsonb_typeof(p_values) <> 'object'
     OR p_values - ARRAY[
       'conversation_id', 'project_id', 'issue_id', 'pull_request_id', 'pr_head_sha',
       'repo_link_id', 'connection_id', 'repo_provider', 'repo_external_id',
       'status', 'triggered_by', 'created_by', 'prompt', 'prompt_mentions',
       'parent_numo_conversation_id', 'parent_numo_turn_id',
       'parent_numo_tool_call_id', 'continued_from_run_id', 'delegation_brief',
       'delegation_attachments', 'title', 'model', 'model_forced',
       'reasoning_level', 'key_mode', 'worker_model_source',
       'worker_model_provider', 'base_branch', 'branch_name', 'pr_number',
       'pr_url', 'pr_state', 'run_id', 'chain_id', 'budget_usd', 'routine_id',
       'intent', 'deployment_url', 'loop_in_vm', 'agent_engine', 'local_exec',
       'local_issue_context_confirmed', 'local_worktree'
     ] <> '{}'::jsonb
     OR nullif(p_values->>'created_by', '')::uuid IS DISTINCT FROM p_user_id
     OR p_values->>'key_mode' IS DISTINCT FROM 'platform'
     OR p_values->>'worker_model_source' IS DISTINCT FROM 'account'
     OR nullif(p_values->>'worker_model_provider', '') IS NULL
     OR p_values->>'status' IS DISTINCT FROM 'queued' THEN
    RAISE EXCEPTION 'agent_run_budget_values_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 460)
  );

  IF nullif(p_values->>'parent_numo_turn_id', '') IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM public.numo_assistant_turns
    WHERE id = (p_values->>'parent_numo_turn_id')::uuid
      AND user_id = p_user_id
      AND conversation_id = (p_values->>'parent_numo_conversation_id')::uuid
      AND status IN ('running', 'waiting_work', 'reconciling')
    FOR UPDATE;
    IF v_parent.id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'run', NULL, 'granted_budget_usd', 0,
        'spent_usd', 0, 'reserved_usd', 0
      );
    END IF;
    SELECT COALESCE(SUM(cost), 0) INTO v_operation_spent
    FROM public.ai_usage
    WHERE numo_turn_id = v_parent.id AND key_mode = 'platform';
    SELECT COALESCE(SUM(cost), 0) INTO v_operation_total_spent
    FROM public.ai_usage
    WHERE numo_turn_id = v_parent.id;
    IF nullif(p_values->>'budget_usd', '') IS NOT NULL
       AND v_operation_total_spent >= (p_values->>'budget_usd')::numeric THEN
      RETURN pg_catalog.jsonb_build_object(
        'run', NULL, 'granted_budget_usd', 0,
        'spent_usd', v_operation_total_spent,
        'reserved_usd', COALESCE(v_parent.managed_budget_usd, 0)
      );
    END IF;
    IF v_parent.managed_budget_usd IS NULL THEN
      SELECT COALESCE(SUM(cost), 0) INTO v_spent
      FROM public.ai_usage
      WHERE user_id = p_user_id
        AND created_at >= p_usage_since
        AND key_mode = 'platform';
      SELECT
        COALESCE((
          SELECT SUM(GREATEST(
            run.managed_budget_usd - COALESCE(usage.spent, 0), 0
          ))
          FROM public.agent_runs AS run
          LEFT JOIN LATERAL (
            SELECT SUM(cost) AS spent FROM public.ai_usage
            WHERE run_id = run.run_id AND key_mode = 'platform'
          ) AS usage ON true
          WHERE run.created_by = p_user_id AND run.key_mode = 'platform'
            AND run.parent_numo_turn_id IS NULL
            AND run.status IN ('queued', 'running')
            AND run.managed_budget_usd IS NOT NULL
        ), 0)
        + COALESCE((
          SELECT SUM(GREATEST(
            turn.managed_budget_usd - COALESCE(usage.spent, 0), 0
          ))
          FROM public.numo_assistant_turns AS turn
          LEFT JOIN LATERAL (
            SELECT SUM(cost) AS spent FROM public.ai_usage
            WHERE numo_turn_id = turn.id AND key_mode = 'platform'
          ) AS usage ON true
          WHERE turn.user_id = p_user_id
            AND turn.id IS DISTINCT FROM v_parent.id
            AND turn.status IN (
              'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
            )
            AND turn.managed_budget_usd IS NOT NULL
        ), 0)
      INTO v_reserved;
      v_granted := LEAST(
        p_requested_budget,
        GREATEST(p_budget_cap - v_spent - v_reserved, 0)
      );
      IF v_granted <= 0 THEN
        RETURN pg_catalog.jsonb_build_object(
          'run', NULL, 'granted_budget_usd', 0,
          'spent_usd', v_spent, 'reserved_usd', v_reserved
        );
      END IF;
      UPDATE public.numo_assistant_turns
      SET managed_budget_usd = v_granted
      WHERE id = v_parent.id;
      v_parent.managed_budget_usd := v_granted;
    ELSIF v_operation_spent >= v_parent.managed_budget_usd THEN
      RETURN pg_catalog.jsonb_build_object(
        'run', NULL, 'granted_budget_usd', 0,
        'spent_usd', v_operation_spent,
        'reserved_usd', v_parent.managed_budget_usd
      );
    ELSE
      v_granted := v_parent.managed_budget_usd;
    END IF;
  ELSE
    SELECT COALESCE(SUM(cost), 0) INTO v_spent
    FROM public.ai_usage
    WHERE user_id = p_user_id
      AND created_at >= p_usage_since
      AND key_mode = 'platform';
    SELECT
      COALESCE((
        SELECT SUM(GREATEST(
          run.managed_budget_usd - COALESCE(usage.spent, 0), 0
        ))
        FROM public.agent_runs AS run
        LEFT JOIN LATERAL (
          SELECT SUM(cost) AS spent FROM public.ai_usage
          WHERE run_id = run.run_id AND key_mode = 'platform'
        ) AS usage ON true
        WHERE run.created_by = p_user_id AND run.key_mode = 'platform'
          AND run.parent_numo_turn_id IS NULL
          AND run.status IN ('queued', 'running')
          AND run.managed_budget_usd IS NOT NULL
      ), 0)
      + COALESCE((
        SELECT SUM(GREATEST(
          turn.managed_budget_usd - COALESCE(usage.spent, 0), 0
        ))
        FROM public.numo_assistant_turns AS turn
        LEFT JOIN LATERAL (
          SELECT SUM(cost) AS spent FROM public.ai_usage
          WHERE numo_turn_id = turn.id AND key_mode = 'platform'
        ) AS usage ON true
        WHERE turn.user_id = p_user_id
          AND turn.status IN (
            'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
          )
          AND turn.managed_budget_usd IS NOT NULL
      ), 0)
    INTO v_reserved;
    v_granted := LEAST(
      p_requested_budget,
      GREATEST(p_budget_cap - v_spent - v_reserved, 0)
    );
    IF v_granted <= 0 THEN
      RETURN pg_catalog.jsonb_build_object(
        'run', NULL, 'granted_budget_usd', 0,
        'spent_usd', v_spent, 'reserved_usd', v_reserved
      );
    END IF;
  END IF;

  INSERT INTO public.agent_runs (
    conversation_id, project_id, issue_id, pull_request_id, pr_head_sha,
    repo_link_id, connection_id, repo_provider, repo_external_id, status,
    triggered_by, created_by, prompt, prompt_mentions,
    parent_numo_conversation_id, parent_numo_turn_id, parent_numo_tool_call_id,
    continued_from_run_id, delegation_brief, delegation_attachments,
    title, model, model_forced, reasoning_level, key_mode, worker_model_source,
    worker_model_provider, base_branch, branch_name, pr_number, pr_url, pr_state,
    run_id, chain_id, budget_usd, routine_id, intent, deployment_url,
    loop_in_vm, agent_engine, local_exec, local_issue_context_confirmed,
    local_worktree, managed_budget_usd
  ) VALUES (
    nullif(p_values->>'conversation_id', '')::uuid,
    (p_values->>'project_id')::uuid,
    nullif(p_values->>'issue_id', '')::uuid,
    nullif(p_values->>'pull_request_id', '')::uuid,
    p_values->>'pr_head_sha', nullif(p_values->>'repo_link_id', '')::uuid,
    nullif(p_values->>'connection_id', '')::uuid, p_values->>'repo_provider',
    p_values->>'repo_external_id', p_values->>'status', p_values->>'triggered_by',
    (p_values->>'created_by')::uuid, p_values->>'prompt', p_values->'prompt_mentions',
    nullif(p_values->>'parent_numo_conversation_id', '')::uuid,
    nullif(p_values->>'parent_numo_turn_id', '')::uuid,
    p_values->>'parent_numo_tool_call_id',
    nullif(p_values->>'continued_from_run_id', '')::uuid,
    p_values->'delegation_brief', COALESCE(p_values->'delegation_attachments', '[]'::jsonb),
    p_values->>'title', p_values->>'model', (p_values->>'model_forced')::boolean,
    p_values->>'reasoning_level', p_values->>'key_mode',
    p_values->>'worker_model_source', p_values->>'worker_model_provider',
    p_values->>'base_branch', p_values->>'branch_name',
    nullif(p_values->>'pr_number', '')::integer, p_values->>'pr_url',
    p_values->>'pr_state', (p_values->>'run_id')::uuid,
    nullif(p_values->>'chain_id', '')::uuid,
    nullif(p_values->>'budget_usd', '')::numeric,
    nullif(p_values->>'routine_id', '')::uuid, p_values->>'intent',
    p_values->>'deployment_url', (p_values->>'loop_in_vm')::boolean,
    p_values->>'agent_engine', (p_values->>'local_exec')::boolean,
    (p_values->>'local_issue_context_confirmed')::boolean,
    (p_values->>'local_worktree')::boolean, v_granted
  ) RETURNING * INTO v_run;

  RETURN pg_catalog.jsonb_build_object(
    'run', pg_catalog.to_jsonb(v_run), 'granted_budget_usd', v_granted,
    'spent_usd', COALESCE(v_spent, v_operation_spent, 0),
    'reserved_usd', COALESCE(v_reserved, v_parent.managed_budget_usd, 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_agent_run_with_budget(
  uuid, timestamptz, numeric, numeric, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent_run_with_budget(
  uuid, timestamptz, numeric, numeric, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_numo_routine_occurrence(
  p_routine_id uuid,
  p_user_id uuid,
  p_origin text,
  p_scheduled_for timestamptz,
  p_request_id uuid,
  p_title text
) RETURNS public.numo_routine_occurrences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_routine public.agent_routines%ROWTYPE;
  v_occurrence public.numo_routine_occurrences%ROWTYPE;
  v_conversation_id uuid;
BEGIN
  IF p_routine_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL
     OR p_origin NOT IN ('scheduled', 'manual')
     OR (p_origin = 'scheduled' AND p_scheduled_for IS NULL)
     OR (p_origin = 'manual' AND p_scheduled_for IS NOT NULL)
     OR nullif(pg_catalog.btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'routine_occurrence_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT routine.* INTO v_routine
  FROM public.agent_routines AS routine
  JOIN public.projects AS project ON project.id = routine.project_id
  WHERE routine.id = p_routine_id
    AND routine.deleted_at IS NULL
    AND project.deleted_at IS NULL
  FOR UPDATE OF routine;
  IF v_routine.id IS NULL THEN
    RAISE EXCEPTION 'routine_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_routine.owner_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'routine_owner_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_occurrence
  FROM public.numo_routine_occurrences
  WHERE request_id = p_request_id
     OR (
       p_origin = 'scheduled'
       AND routine_id = p_routine_id
       AND origin = 'scheduled'
       AND scheduled_for = p_scheduled_for
     )
  ORDER BY created_at ASC
  LIMIT 1;
  IF v_occurrence.id IS NOT NULL THEN
    IF v_occurrence.routine_id IS DISTINCT FROM p_routine_id
       OR v_occurrence.origin IS DISTINCT FROM p_origin
       OR v_occurrence.scheduled_for IS DISTINCT FROM p_scheduled_for THEN
      RAISE EXCEPTION 'routine_occurrence_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN v_occurrence;
  END IF;

  INSERT INTO public.conversations (
    project_id, user_id, title, model, reasoning_level
  ) VALUES (
    NULL, p_user_id, pg_catalog.left(pg_catalog.btrim(p_title), 200), NULL, NULL
  ) RETURNING id INTO v_conversation_id;

  INSERT INTO public.numo_routine_occurrences (
    routine_id, origin, scheduled_for, conversation_id, request_id
  ) VALUES (
    p_routine_id, p_origin, p_scheduled_for, v_conversation_id, p_request_id
  ) RETURNING * INTO v_occurrence;
  RETURN v_occurrence;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_numo_routine_occurrence(
  uuid, uuid, text, timestamptz, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_numo_routine_occurrence(
  uuid, uuid, text, timestamptz, uuid, text
) TO service_role;
