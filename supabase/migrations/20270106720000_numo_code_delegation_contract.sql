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

COMMENT ON COLUMN public.agent_runs.delegation_brief IS
  'Versioned immutable brief for a code worker owned by a durable Numo turn.';
COMMENT ON COLUMN public.agent_runs.delegation_result IS
  'Validated structured worker result delivered back to the owning Numo turn.';
COMMENT ON COLUMN public.agent_runs.parent_numo_tool_call_id IS
  'Idempotency key within the owning Numo turn; one tool call creates at most one worker.';

COMMIT;
