-- Attribute and reserve one included-usage budget for a complete Numo operation.
BEGIN;

ALTER TABLE public.ai_usage
  ADD COLUMN idempotency_key text,
  ADD COLUMN numo_turn_id uuid REFERENCES public.numo_assistant_turns(id) ON DELETE SET NULL,
  ADD COLUMN routine_id uuid REFERENCES public.agent_routines(id) ON DELETE SET NULL;

-- Historical rows keep their exact cardinality and totals. Only new writes use
-- deterministic provider/run identities.
UPDATE public.ai_usage
SET idempotency_key = 'legacy:' || id::text
WHERE idempotency_key IS NULL;
ALTER TABLE public.ai_usage ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX ai_usage_idempotency_key_unique
  ON public.ai_usage (idempotency_key);
CREATE INDEX ai_usage_numo_turn_idx
  ON public.ai_usage (numo_turn_id, created_at)
  WHERE numo_turn_id IS NOT NULL;
CREATE INDEX ai_usage_routine_idx
  ON public.ai_usage (routine_id, created_at)
  WHERE routine_id IS NOT NULL;

ALTER TABLE public.numo_assistant_turns
  ADD COLUMN managed_budget_usd numeric(12, 6),
  ADD CONSTRAINT numo_assistant_turns_managed_budget_non_negative CHECK (
    managed_budget_usd IS NULL OR managed_budget_usd >= 0
  );

COMMENT ON COLUMN public.ai_usage.numo_turn_id IS
  'Durable Numo operation containing this parent, worker, helper, or compute charge.';
COMMENT ON COLUMN public.ai_usage.routine_id IS
  'Routine whose occurrence owns this charge. The Numo turn is the occurrence identity.';
COMMENT ON COLUMN public.numo_assistant_turns.managed_budget_usd IS
  'Managed-AI account budget atomically reserved for this Numo operation.';

-- Preserve every historical feature and charge while attaching rows whose
-- durable parent identity already exists.
UPDATE public.ai_usage AS usage
SET numo_turn_id = turn.id,
    conversation_id = COALESCE(usage.conversation_id, turn.conversation_id)
FROM public.numo_assistant_turns AS turn
WHERE usage.run_id = turn.run_id
  AND usage.numo_turn_id IS NULL;

UPDATE public.ai_usage AS usage
SET numo_turn_id = run.parent_numo_turn_id,
    conversation_id = COALESCE(
      usage.conversation_id,
      run.parent_numo_conversation_id,
      run.conversation_id
    ),
    routine_id = COALESCE(usage.routine_id, run.routine_id)
FROM public.agent_runs AS run
WHERE usage.run_id = run.run_id
  AND run.parent_numo_turn_id IS NOT NULL;

UPDATE public.ai_usage AS usage
SET routine_id = run.routine_id
FROM public.agent_runs AS run
WHERE usage.run_id = run.run_id
  AND usage.routine_id IS NULL
  AND run.routine_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_numo_operation_spend(p_turn_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT COALESCE(SUM(COALESCE(cost, 0)), 0)
  FROM public.ai_usage
  WHERE numo_turn_id = p_turn_id;
$$;
REVOKE ALL ON FUNCTION public.get_numo_operation_spend(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_numo_operation_spend(uuid) TO service_role;

-- Ordinary chat turns reserve the remaining account budget before the first
-- provider call. A routine caller can request only its percentage cap.
CREATE OR REPLACE FUNCTION public.begin_numo_turn_with_budget(
  p_conversation_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_run_id uuid,
  p_intent jsonb,
  p_model text,
  p_reasoning_level text,
  p_content text,
  p_context jsonb,
  p_metadata jsonb,
  p_usage_since timestamptz,
  p_budget_cap numeric,
  p_requested_budget numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
  v_spent numeric;
  v_reserved numeric;
  v_granted numeric;
BEGIN
  IF p_conversation_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL
     OR p_run_id IS NULL OR p_usage_since IS NULL
     OR p_budget_cap IS NULL OR p_budget_cap < 0
     OR p_requested_budget IS NULL OR p_requested_budget <= 0 THEN
    RAISE EXCEPTION 'numo_turn_budget_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || p_conversation_id::text, 516)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE conversation_id = p_conversation_id AND request_id = p_request_id;
  IF v_turn.id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('turn', pg_catalog.to_jsonb(v_turn));
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.numo_assistant_turns
    WHERE conversation_id = p_conversation_id
      AND status IN (
        'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
      )
  ) THEN
    RAISE EXCEPTION 'conversation_busy' USING ERRCODE = '55000';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 460)
  );
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
      WHERE run.created_by = p_user_id
        AND run.key_mode = 'platform'
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
      'turn', NULL,
      'granted_budget_usd', 0,
      'spent_usd', v_spent,
      'reserved_usd', v_reserved
    );
  END IF;

  INSERT INTO public.numo_assistant_turns (
    conversation_id, user_id, request_id, run_id, intent, model,
    reasoning_level, managed_budget_usd
  ) VALUES (
    p_conversation_id, p_user_id, p_request_id, p_run_id,
    COALESCE(p_intent, '{}'::jsonb), p_model, p_reasoning_level, v_granted
  ) RETURNING * INTO v_turn;
  INSERT INTO public.assistant_messages (
    conversation_id, turn_id, role, content, context, metadata
  ) VALUES (
    p_conversation_id, v_turn.id, 'user', p_content, p_context,
    COALESCE(p_metadata, '{}'::jsonb)
  );
  UPDATE public.conversations
  SET status = 'generating', error_message = NULL, updated_at = now()
  WHERE id = p_conversation_id;

  RETURN pg_catalog.jsonb_build_object(
    'turn', pg_catalog.to_jsonb(v_turn),
    'granted_budget_usd', v_granted,
    'spent_usd', v_spent,
    'reserved_usd', v_reserved
  );
END;
$$;
REVOKE ALL ON FUNCTION public.begin_numo_turn_with_budget(
  uuid, uuid, uuid, uuid, jsonb, text, text, text, jsonb, jsonb,
  timestamptz, numeric, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_numo_turn_with_budget(
  uuid, uuid, uuid, uuid, jsonb, text, text, text, jsonb, jsonb,
  timestamptz, numeric, numeric
) TO service_role;

-- Delegated workers draw from the parent reservation instead of reserving the
-- account a second time. Standalone workers now also see active Numo reserves.
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
     OR pg_catalog.nullif(p_values->>'created_by', '')::uuid IS DISTINCT FROM p_user_id
     OR p_values->>'key_mode' IS DISTINCT FROM 'platform'
     OR p_values->>'worker_model_source' IS DISTINCT FROM 'account'
     OR pg_catalog.nullif(p_values->>'worker_model_provider', '') IS NULL
     OR p_values->>'status' IS DISTINCT FROM 'queued' THEN
    RAISE EXCEPTION 'agent_run_budget_values_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 460)
  );

  IF pg_catalog.nullif(p_values->>'parent_numo_turn_id', '') IS NOT NULL THEN
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
    IF pg_catalog.nullif(p_values->>'budget_usd', '') IS NOT NULL
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
    pg_catalog.nullif(p_values->>'conversation_id', '')::uuid,
    (p_values->>'project_id')::uuid,
    pg_catalog.nullif(p_values->>'issue_id', '')::uuid,
    pg_catalog.nullif(p_values->>'pull_request_id', '')::uuid,
    p_values->>'pr_head_sha', pg_catalog.nullif(p_values->>'repo_link_id', '')::uuid,
    pg_catalog.nullif(p_values->>'connection_id', '')::uuid, p_values->>'repo_provider',
    p_values->>'repo_external_id', p_values->>'status', p_values->>'triggered_by',
    (p_values->>'created_by')::uuid, p_values->>'prompt', p_values->'prompt_mentions',
    pg_catalog.nullif(p_values->>'parent_numo_conversation_id', '')::uuid,
    pg_catalog.nullif(p_values->>'parent_numo_turn_id', '')::uuid,
    p_values->>'parent_numo_tool_call_id',
    pg_catalog.nullif(p_values->>'continued_from_run_id', '')::uuid,
    p_values->'delegation_brief', COALESCE(p_values->'delegation_attachments', '[]'::jsonb),
    p_values->>'title', p_values->>'model', (p_values->>'model_forced')::boolean,
    p_values->>'reasoning_level', p_values->>'key_mode',
    p_values->>'worker_model_source', p_values->>'worker_model_provider',
    p_values->>'base_branch', p_values->>'branch_name',
    pg_catalog.nullif(p_values->>'pr_number', '')::integer, p_values->>'pr_url',
    p_values->>'pr_state', (p_values->>'run_id')::uuid,
    pg_catalog.nullif(p_values->>'chain_id', '')::uuid,
    pg_catalog.nullif(p_values->>'budget_usd', '')::numeric,
    pg_catalog.nullif(p_values->>'routine_id', '')::uuid, p_values->>'intent',
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

-- A worker waiting for mediated input reacquires one reservation for the whole
-- parent operation. Standalone resumptions continue to reserve only themselves.
CREATE OR REPLACE FUNCTION public.resume_agent_run_with_budget(
  p_run_id uuid,
  p_user_id uuid,
  p_usage_since timestamptz,
  p_budget_cap numeric,
  p_requested_budget numeric,
  p_not_before timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_run public.agent_runs%ROWTYPE;
  v_parent public.numo_assistant_turns%ROWTYPE;
  v_spent numeric;
  v_reserved numeric;
  v_operation_spent numeric;
  v_granted numeric;
  v_stored_budget numeric;
  v_updated integer;
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
  SELECT * INTO v_run FROM public.agent_runs WHERE id = p_run_id FOR UPDATE;
  IF v_run.id IS NULL OR v_run.created_by IS DISTINCT FROM p_user_id
     OR v_run.key_mode IS DISTINCT FROM 'platform'
     OR v_run.status NOT IN ('completed', 'failed', 'canceled')
     OR (v_run.status = 'failed' AND v_run.checkpoint IS NULL)
     OR v_run.sandbox_reap_claim IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('state', 'conflict');
  END IF;

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
        AND turn.id IS DISTINCT FROM v_run.parent_numo_turn_id
        AND turn.status IN (
          'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
        )
        AND turn.managed_budget_usd IS NOT NULL
    ), 0)
  INTO v_reserved;

  IF v_run.parent_numo_turn_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.numo_assistant_turns
    WHERE id = v_run.parent_numo_turn_id AND user_id = p_user_id
      AND status IN ('running', 'waiting_input', 'waiting_work')
    FOR UPDATE;
    IF v_parent.id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('state', 'conflict');
    END IF;
    SELECT COALESCE(SUM(cost), 0) INTO v_operation_spent
    FROM public.ai_usage WHERE numo_turn_id = v_parent.id;
    IF v_run.budget_usd IS NOT NULL
       AND v_operation_spent >= v_run.budget_usd THEN
      RETURN pg_catalog.jsonb_build_object('state', 'no_budget');
    END IF;
  END IF;

  v_granted := LEAST(
    p_requested_budget,
    GREATEST(p_budget_cap - v_spent - v_reserved, 0),
    CASE
      WHEN v_parent.id IS NOT NULL AND v_run.budget_usd IS NOT NULL
        THEN GREATEST(v_run.budget_usd - v_operation_spent, 0)
      ELSE p_requested_budget
    END
  );
  IF v_granted <= 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', 'no_budget', 'spent_usd', v_spent, 'reserved_usd', v_reserved
    );
  END IF;

  v_stored_budget := CASE
    WHEN v_parent.id IS NOT NULL THEN v_granted + COALESCE(v_operation_spent, 0)
    ELSE v_granted
  END;

  UPDATE public.agent_runs
  SET status = 'queued', not_before = p_not_before,
      managed_budget_usd = v_stored_budget
  WHERE id = p_run_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN pg_catalog.jsonb_build_object('state', 'conflict');
  END IF;
  IF v_parent.id IS NOT NULL THEN
    UPDATE public.numo_assistant_turns
    SET managed_budget_usd = v_stored_budget
    WHERE id = v_parent.id;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'state', 'queued', 'granted_budget_usd', v_stored_budget
  );
END;
$$;

-- The mediated worker-answer path resumes through this atomic message RPC.
-- Keep its authority checks and reserve the parent operation rather than one
-- fresh budget for the child run.
CREATE OR REPLACE FUNCTION public.resume_latest_agent_run_with_message(
  p_run_id uuid,
  p_owner_id uuid,
  p_actor_id uuid,
  p_message_id uuid,
  p_content text,
  p_mentions jsonb,
  p_not_before timestamptz,
  p_usage_since timestamptz DEFAULT NULL,
  p_budget_cap numeric DEFAULT NULL,
  p_requested_budget numeric DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_run public.agent_runs%ROWTYPE;
  v_parent public.numo_assistant_turns%ROWTYPE;
  v_conversation public.agent_conversations%ROWTYPE;
  v_latest_id uuid;
  v_anchor text;
  v_key_mode text;
  v_project_id uuid;
  v_conversation_id uuid;
  v_access text;
  v_spent numeric;
  v_reserved numeric;
  v_operation_platform_spent numeric;
  v_operation_total_spent numeric;
  v_granted numeric;
  v_stored_budget numeric;
  v_inserted integer;
BEGIN
  IF p_run_id IS NULL OR p_owner_id IS NULL OR p_actor_id IS NULL
     OR p_message_id IS NULL OR p_content IS NULL OR p_not_before IS NULL THEN
    RAISE EXCEPTION 'agent_resume_message_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_run FROM public.agent_runs WHERE id = p_run_id;
  IF v_run.id IS NULL OR v_run.created_by IS DISTINCT FROM p_owner_id THEN
    RETURN 'conflict';
  END IF;
  v_key_mode := v_run.key_mode;
  v_project_id := v_run.project_id;
  v_conversation_id := v_run.conversation_id;

  IF v_key_mode = 'platform' THEN
    IF p_usage_since IS NULL OR p_budget_cap IS NULL OR p_budget_cap < 0
       OR p_requested_budget IS NULL OR p_requested_budget <= 0 THEN
      RAISE EXCEPTION 'agent_resume_budget_invalid' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_owner_id::text, 460)
    );
  END IF;

  v_anchor := CASE
    WHEN v_run.issue_id IS NOT NULL THEN 'issue:' || v_run.issue_id::text
    WHEN v_run.pull_request_id IS NOT NULL THEN 'pr:' || v_run.pull_request_id::text
    WHEN v_run.routine_id IS NOT NULL THEN 'routine:' || v_run.routine_id::text
    ELSE 'conversation:' || v_run.conversation_id::text
  END;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent-run:' || v_anchor, 459)
  );

  v_access := public.lock_live_agent_run_project_access(
    v_project_id, p_owner_id, p_actor_id
  );
  IF v_access IS DISTINCT FROM 'ok' THEN RETURN v_access; END IF;

  SELECT * INTO v_run FROM public.agent_runs WHERE id = p_run_id FOR UPDATE;
  IF v_run.id IS NULL
     OR v_run.created_by IS DISTINCT FROM p_owner_id
     OR v_run.status NOT IN ('completed', 'failed', 'canceled')
     OR (v_run.status = 'failed' AND v_run.checkpoint IS NULL)
     OR v_run.sandbox_reap_claim IS NOT NULL
     OR v_run.key_mode IS DISTINCT FROM v_key_mode
     OR v_run.project_id IS DISTINCT FROM v_project_id
     OR v_run.conversation_id IS DISTINCT FROM v_conversation_id THEN
    RETURN 'conflict';
  END IF;

  SELECT * INTO v_conversation FROM public.agent_conversations
  WHERE id = v_conversation_id AND project_id = v_project_id
  FOR UPDATE;
  IF v_conversation.id IS NULL OR (
    v_conversation.visibility IS DISTINCT FROM 'project'
    AND v_conversation.owner_id IS DISTINCT FROM p_actor_id
  ) THEN
    RETURN 'forbidden';
  END IF;
  IF v_anchor IS DISTINCT FROM (CASE
    WHEN v_run.issue_id IS NOT NULL THEN 'issue:' || v_run.issue_id::text
    WHEN v_run.pull_request_id IS NOT NULL THEN 'pr:' || v_run.pull_request_id::text
    WHEN v_run.routine_id IS NOT NULL THEN 'routine:' || v_run.routine_id::text
    ELSE 'conversation:' || v_run.conversation_id::text
  END) THEN
    RETURN 'conflict';
  END IF;

  SELECT id INTO v_latest_id FROM public.agent_runs
  WHERE CASE
    WHEN v_run.issue_id IS NOT NULL THEN issue_id = v_run.issue_id
    WHEN v_run.pull_request_id IS NOT NULL THEN pull_request_id = v_run.pull_request_id
    WHEN v_run.routine_id IS NOT NULL THEN routine_id = v_run.routine_id
    ELSE conversation_id = v_run.conversation_id
  END
  ORDER BY created_at DESC, id DESC LIMIT 1;
  IF v_latest_id IS DISTINCT FROM p_run_id THEN RETURN 'superseded'; END IF;
  IF NOT public.agent_run_repository_binding_is_current(
    v_run.project_id, v_run.repo_link_id, v_run.connection_id,
    v_run.repo_provider, v_run.repo_external_id
  ) THEN
    RETURN 'conflict';
  END IF;

  IF v_run.parent_numo_turn_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.numo_assistant_turns
    WHERE id = v_run.parent_numo_turn_id
      AND conversation_id = v_run.parent_numo_conversation_id
      AND user_id = p_owner_id
      AND status IN ('running', 'waiting_input', 'waiting_work')
    FOR UPDATE;
    IF v_parent.id IS NULL THEN RETURN 'conflict'; END IF;
  END IF;

  IF v_key_mode = 'platform' THEN
    SELECT COALESCE(SUM(cost), 0) INTO v_spent
    FROM public.ai_usage
    WHERE user_id = p_owner_id
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
        WHERE run.created_by = p_owner_id AND run.key_mode = 'platform'
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
        WHERE turn.user_id = p_owner_id
          AND turn.id IS DISTINCT FROM v_run.parent_numo_turn_id
          AND turn.status IN (
            'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
          )
          AND turn.managed_budget_usd IS NOT NULL
      ), 0)
    INTO v_reserved;

    IF v_parent.id IS NOT NULL THEN
      SELECT COALESCE(SUM(cost), 0) INTO v_operation_platform_spent
      FROM public.ai_usage
      WHERE numo_turn_id = v_parent.id AND key_mode = 'platform';
      SELECT COALESCE(SUM(cost), 0) INTO v_operation_total_spent
      FROM public.ai_usage WHERE numo_turn_id = v_parent.id;
    END IF;
    v_granted := LEAST(
      p_requested_budget,
      GREATEST(p_budget_cap - v_spent - v_reserved, 0),
      CASE
        WHEN v_parent.id IS NOT NULL AND v_run.budget_usd IS NOT NULL
          THEN GREATEST(v_run.budget_usd - v_operation_total_spent, 0)
        ELSE p_requested_budget
      END
    );
    IF v_granted <= 0 THEN RETURN 'no_budget'; END IF;
    v_stored_budget := CASE
      WHEN v_parent.id IS NOT NULL
        THEN COALESCE(v_operation_platform_spent, 0) + v_granted
      ELSE v_granted
    END;
  END IF;

  INSERT INTO public.agent_run_messages (
    id, run_id, created_by, content, mentions
  ) VALUES (
    p_message_id, p_run_id, p_actor_id, p_content, p_mentions
  ) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 AND NOT EXISTS (
    SELECT 1 FROM public.agent_run_messages
    WHERE id = p_message_id AND run_id = p_run_id
  ) THEN
    RETURN 'message_id_conflict';
  END IF;

  UPDATE public.agent_runs
  SET status = 'queued', not_before = p_not_before,
      managed_budget_usd = CASE
        WHEN v_key_mode = 'platform' THEN v_stored_budget
        ELSE managed_budget_usd
      END
  WHERE id = p_run_id;
  IF v_key_mode = 'platform' AND v_parent.id IS NOT NULL THEN
    UPDATE public.numo_assistant_turns
    SET managed_budget_usd = v_stored_budget
    WHERE id = v_parent.id;
  END IF;
  RETURN CASE WHEN v_inserted = 1 THEN 'queued' ELSE 'already' END;
END;
$$;
REVOKE ALL ON FUNCTION public.resume_latest_agent_run_with_message(
  uuid, uuid, uuid, uuid, text, jsonb, timestamptz,
  timestamptz, numeric, numeric
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resume_latest_agent_run_with_message(
  uuid, uuid, uuid, uuid, text, jsonb, timestamptz,
  timestamptz, numeric, numeric
) TO service_role;

-- One history row per Numo operation while feature totals remain untouched.
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
      AND u.created_at >= p_since
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
        'project_name', p.name
      ) ORDER BY r.first_at DESC)
      FROM (
        SELECT * FROM runs ORDER BY first_at DESC LIMIT p_limit OFFSET p_offset
      ) AS r
      LEFT JOIN public.projects AS p ON p.id = r.project_id
    ), '[]'::jsonb)
  );
$$;

COMMIT;
