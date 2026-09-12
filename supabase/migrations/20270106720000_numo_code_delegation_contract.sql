-- Structured ownership and handoff for code workers launched by durable Numo turns.
BEGIN;

ALTER TABLE public.numo_assistant_turns
  ADD CONSTRAINT numo_assistant_turns_id_conversation_unique
  UNIQUE (id, conversation_id);

ALTER TABLE public.agent_runs
  ADD COLUMN parent_numo_conversation_id uuid,
  ADD COLUMN parent_numo_turn_id uuid,
  ADD COLUMN parent_numo_tool_call_id text,
  ADD COLUMN continued_from_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  ADD COLUMN delegation_brief jsonb,
  ADD COLUMN delegation_result jsonb,
  ADD COLUMN delegation_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT agent_runs_parent_numo_turn_fk
    FOREIGN KEY (parent_numo_turn_id, parent_numo_conversation_id)
    REFERENCES public.numo_assistant_turns(id, conversation_id) ON DELETE CASCADE,
  ADD CONSTRAINT agent_runs_delegation_parent_check CHECK (
    (parent_numo_conversation_id IS NULL AND parent_numo_turn_id IS NULL
      AND parent_numo_tool_call_id IS NULL AND delegation_brief IS NULL)
    OR
    (parent_numo_conversation_id IS NOT NULL AND parent_numo_turn_id IS NOT NULL
      AND parent_numo_tool_call_id IS NOT NULL AND delegation_brief IS NOT NULL)
  ),
  ADD CONSTRAINT agent_runs_delegation_brief_check CHECK (
    delegation_brief IS NULL OR (
      jsonb_typeof(delegation_brief) = 'object'
      AND delegation_brief ->> 'version' = '1'
      AND delegation_brief #>> '{correlation,parentConversationId}' = parent_numo_conversation_id::text
      AND delegation_brief #>> '{correlation,parentTurnId}' = parent_numo_turn_id::text
      AND delegation_brief #>> '{correlation,toolCallId}' = parent_numo_tool_call_id
      AND delegation_brief #>> '{targetRepository,projectId}' = project_id::text
      AND nullif(btrim(delegation_brief ->> 'objective'), '') IS NOT NULL
      AND jsonb_typeof(delegation_brief -> 'sourceReferences') = 'array'
      AND jsonb_typeof(delegation_brief -> 'constraints') = 'array'
      AND jsonb_typeof(delegation_brief -> 'authorizedWork') = 'array'
      AND jsonb_typeof(delegation_brief -> 'expectedOutput') = 'array'
      AND jsonb_array_length(delegation_brief -> 'authorizedWork') > 0
      AND jsonb_array_length(delegation_brief -> 'expectedOutput') > 0
    )
  ),
  ADD CONSTRAINT agent_runs_delegation_result_check CHECK (
    delegation_result IS NULL OR (
      jsonb_typeof(delegation_result) = 'object'
      AND delegation_result ->> 'version' = '1'
      AND delegation_result ->> 'status' IN ('completed', 'partial', 'failed', 'needs_input')
      AND jsonb_typeof(delegation_result -> 'changedFiles') = 'array'
      AND jsonb_typeof(delegation_result -> 'verificationPerformed') = 'array'
      AND jsonb_typeof(delegation_result -> 'artifacts') = 'array'
      AND jsonb_typeof(delegation_result -> 'unresolvedDecisions') = 'array'
    )
  ),
  ADD CONSTRAINT agent_runs_delegation_attachments_check CHECK (
    jsonb_typeof(delegation_attachments) = 'array'
  );

CREATE UNIQUE INDEX agent_runs_numo_tool_call_unique
  ON public.agent_runs (parent_numo_turn_id, parent_numo_tool_call_id)
  WHERE parent_numo_turn_id IS NOT NULL;
CREATE INDEX agent_runs_continued_from_idx
  ON public.agent_runs (continued_from_run_id)
  WHERE continued_from_run_id IS NOT NULL;

-- Keep managed-budget admission atomic while allowing the new immutable
-- delegation columns through the existing strict value whitelist.
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
  v_run public.agent_runs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_usage_since IS NULL
     OR p_budget_cap IS NULL OR p_budget_cap < 0
     OR p_requested_budget IS NULL OR p_requested_budget <= 0
     OR p_values IS NULL OR jsonb_typeof(p_values) <> 'object'
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

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 460));
  SELECT coalesce(sum(cost), 0) INTO v_spent
  FROM public.ai_usage
  WHERE user_id = p_user_id AND created_at >= p_usage_since AND key_mode = 'platform';
  SELECT coalesce(sum(greatest(run.managed_budget_usd - coalesce(usage.spent, 0), 0)), 0)
  INTO v_reserved
  FROM public.agent_runs AS run
  LEFT JOIN LATERAL (
    SELECT sum(cost) AS spent FROM public.ai_usage
    WHERE run_id = run.run_id AND key_mode = 'platform'
  ) AS usage ON true
  WHERE run.created_by = p_user_id AND run.key_mode = 'platform'
    AND run.status IN ('queued', 'running') AND run.managed_budget_usd IS NOT NULL;
  v_granted := least(p_requested_budget, greatest(p_budget_cap - v_spent - v_reserved, 0));
  IF v_granted <= 0 THEN
    RETURN jsonb_build_object(
      'run', null, 'granted_budget_usd', 0,
      'spent_usd', v_spent, 'reserved_usd', v_reserved
    );
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
    p_values->'delegation_brief', coalesce(p_values->'delegation_attachments', '[]'::jsonb),
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

  RETURN jsonb_build_object(
    'run', to_jsonb(v_run), 'granted_budget_usd', v_granted,
    'spent_usd', v_spent, 'reserved_usd', v_reserved
  );
END;
$$;

-- Preserve a structured worker handoff when the normal post-commit callback is
-- interrupted. The regular TypeScript delivery builds the detailed result from
-- run events; this recovery fallback keeps the terminal facts instead of
-- converting a successful worker into a synthetic failure.
CREATE OR REPLACE FUNCTION public.recover_stale_numo_turns()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count integer := 0;
  v_turn public.numo_assistant_turns%ROWTYPE;
  v_worker record;
  v_disposition text;
BEGIN
  FOR v_worker IN
    SELECT r.id AS run_id, r.status, r.awaiting_input, r.outcome,
      r.error_message, r.branch_name, r.pr_number, r.pr_url,
      COALESCE(
        r.delegation_result,
        jsonb_build_object(
          'version', 1,
          'status', CASE
            WHEN r.status = 'completed' AND r.awaiting_input THEN 'needs_input'
            WHEN r.status = 'completed'
              AND nullif(btrim(r.error_message), '') IS NOT NULL THEN 'partial'
            WHEN r.status = 'completed' THEN 'completed'
            ELSE 'failed'
          END,
          'summary', COALESCE(
            nullif(btrim(r.outcome), ''),
            nullif(btrim(r.error_message), ''),
            'The code worker ended without a summary.'
          ),
          'changedFiles', '[]'::jsonb,
          'verificationPerformed', '[]'::jsonb,
          'artifacts',
            CASE WHEN nullif(btrim(r.branch_name), '') IS NOT NULL
              THEN jsonb_build_array(jsonb_build_object(
                'kind', 'branch', 'ref', btrim(r.branch_name)
              )) ELSE '[]'::jsonb END
            || CASE WHEN r.pr_number IS NOT NULL OR nullif(btrim(r.pr_url), '') IS NOT NULL
              THEN jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                'kind', 'pull_request',
                'ref', COALESCE('#' || r.pr_number::text, btrim(r.pr_url)),
                'url', nullif(btrim(r.pr_url), '')
              ))) ELSE '[]'::jsonb END,
          'unresolvedDecisions', CASE
            WHEN r.awaiting_input AND nullif(btrim(r.outcome), '') IS NOT NULL
              THEN jsonb_build_array(btrim(r.outcome))
            WHEN r.status IN ('failed', 'canceled')
              AND nullif(btrim(r.error_message), '') IS NOT NULL
              THEN jsonb_build_array(btrim(r.error_message))
            ELSE '[]'::jsonb
          END
        )
      ) AS delegation_result
    FROM public.numo_assistant_turns t
    JOIN public.agent_runs r ON r.id = t.active_run_id
    WHERE t.status = 'waiting_work'
      AND r.status IN ('completed', 'failed', 'canceled')
    ORDER BY t.updated_at ASC, t.id ASC
    FOR UPDATE OF t, r SKIP LOCKED
  LOOP
    UPDATE public.agent_runs
    SET delegation_result = v_worker.delegation_result
    WHERE id = v_worker.run_id AND delegation_result IS NULL;

    SELECT public.resume_numo_turn_from_worker(
      v_worker.run_id,
      gen_random_uuid(),
      CASE
        WHEN v_worker.status = 'completed' AND v_worker.awaiting_input
          THEN 'worker_input'
        WHEN v_worker.status = 'completed' THEN 'worker_completed'
        ELSE 'worker_failed'
      END,
      jsonb_build_object(
        'run_id', v_worker.run_id,
        'status', v_worker.status,
        'awaiting_input', v_worker.awaiting_input,
        'outcome', v_worker.outcome,
        'error_message', v_worker.error_message,
        'pr_number', v_worker.pr_number,
        'pr_url', v_worker.pr_url,
        'result', v_worker.delegation_result
      )
    ) INTO v_disposition;
    IF v_disposition = 'queued' THEN v_count := v_count + 1; END IF;
  END LOOP;

  FOR v_turn IN
    SELECT * FROM public.numo_assistant_turns
    WHERE status IN ('running', 'stopping')
      AND claimed_at < now() - interval '6 minutes'
    ORDER BY claimed_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_turn.status = 'stopping' AND v_turn.active_run_id IS NOT NULL THEN
      UPDATE public.agent_runs
      SET interrupt_requested = true
      WHERE id = v_turn.active_run_id AND status IN ('queued', 'running');
    END IF;
    UPDATE public.numo_assistant_turns
    SET status = CASE
          WHEN v_turn.status = 'stopping' THEN 'stopped'
          WHEN v_turn.checkpoint ->> 'phase' = 'worker_result' THEN 'queued'
          ELSE 'retryable'
        END,
        claim_token = NULL,
        claimed_at = NULL,
        completed_at = CASE WHEN v_turn.status = 'stopping' THEN now() END,
        error_message = CASE WHEN v_turn.status = 'running'
            AND (v_turn.checkpoint ->> 'phase') IS DISTINCT FROM 'worker_result'
          THEN 'The Numo process stopped before the turn reached its next durable boundary. Retry after reconnecting.'
        END,
        updated_at = now()
    WHERE id = v_turn.id;
    UPDATE public.conversations
    SET status = CASE
          WHEN v_turn.status = 'stopping' THEN 'idle'
          WHEN v_turn.checkpoint ->> 'phase' = 'worker_result' THEN 'generating'
          ELSE 'error'
        END,
        error_message = CASE WHEN v_turn.status = 'running'
            AND (v_turn.checkpoint ->> 'phase') IS DISTINCT FROM 'worker_result'
          THEN 'The Numo process stopped before the turn reached its next durable boundary. Retry after reconnecting.'
        END,
        updated_at = now()
    WHERE id = v_turn.conversation_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stale_numo_turns()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_numo_turns()
  TO service_role;

COMMENT ON COLUMN public.agent_runs.delegation_brief IS
  'Versioned immutable brief for a code worker owned by a durable Numo turn.';
COMMENT ON COLUMN public.agent_runs.delegation_result IS
  'Validated structured worker result delivered back to the owning Numo turn.';
COMMENT ON COLUMN public.agent_runs.parent_numo_tool_call_id IS
  'Idempotency key within the owning Numo turn; one tool call creates at most one worker.';

COMMIT;
