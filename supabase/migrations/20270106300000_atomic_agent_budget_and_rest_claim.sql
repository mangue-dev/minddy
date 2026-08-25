-- Reserve managed-AI spend in the same transaction that creates a run, and
-- claim VM completion before any callback side effects can execute.
ALTER TABLE public.agent_runs
  ADD COLUMN managed_budget_usd numeric(12, 6),
  ADD COLUMN rest_claimed_at timestamptz;

ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_managed_budget_non_negative_ck CHECK (
    managed_budget_usd IS NULL OR managed_budget_usd >= 0
  );

COMMENT ON COLUMN public.agent_runs.managed_budget_usd IS
  'Managed-AI account budget atomically reserved for this run. Null for BYOK and legacy runs; unused budget is released when the run leaves queued/running.';
COMMENT ON COLUMN public.agent_runs.rest_claimed_at IS
  'Set atomically by the first VM rest callback for the current running turn. Reset by the next queued-to-running claim.';

CREATE OR REPLACE FUNCTION public.create_agent_run_with_budget(
  p_user_id uuid,
  p_usage_since timestamptz,
  p_budget_cap numeric,
  p_requested_budget numeric,
  p_values jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_spent numeric;
  v_reserved numeric;
  v_granted numeric;
  v_run public.agent_runs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_usage_since IS NULL
     OR p_budget_cap IS NULL
     OR p_budget_cap < 0
     OR p_requested_budget IS NULL
     OR p_requested_budget <= 0
     OR p_values IS NULL
     OR jsonb_typeof(p_values) <> 'object'
     OR p_values - ARRAY[
       'project_id', 'issue_id', 'pull_request_id', 'pr_head_sha',
       'repo_link_id', 'connection_id', 'repo_provider', 'repo_external_id',
       'status', 'triggered_by', 'created_by', 'prompt', 'prompt_mentions',
       'title', 'model', 'model_forced', 'reasoning_level', 'key_mode',
       'base_branch', 'branch_name', 'pr_number', 'pr_url', 'pr_state',
       'run_id', 'chain_id', 'budget_usd', 'routine_id', 'intent',
       'deployment_url', 'loop_in_vm', 'agent_engine', 'local_exec',
       'local_issue_context_confirmed', 'local_worktree'
     ] <> '{}'::jsonb
     OR NULLIF(p_values->>'created_by', '')::uuid IS DISTINCT FROM p_user_id
     OR p_values->>'key_mode' IS DISTINCT FROM 'platform'
     OR p_values->>'status' IS DISTINCT FROM 'queued' THEN
    RAISE EXCEPTION 'agent_run_budget_values_invalid' USING ERRCODE = '22023';
  END IF;

  -- All managed-AI reservations for an account pass through this transaction
  -- lock. The ledger and the remaining reservations are then read together.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 460));

  SELECT COALESCE(SUM(cost), 0)
  INTO v_spent
  FROM public.ai_usage
  WHERE user_id = p_user_id
    AND created_at >= p_usage_since
    AND key_mode = 'platform';

  SELECT COALESCE(SUM(GREATEST(run.managed_budget_usd - COALESCE(usage.spent, 0), 0)), 0)
  INTO v_reserved
  FROM public.agent_runs AS run
  LEFT JOIN LATERAL (
    SELECT SUM(cost) AS spent
    FROM public.ai_usage
    WHERE run_id = run.run_id
      AND key_mode = 'platform'
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
    RETURN jsonb_build_object(
      'run', null,
      'granted_budget_usd', 0,
      'spent_usd', v_spent,
      'reserved_usd', v_reserved
    );
  END IF;

  INSERT INTO public.agent_runs (
    project_id, issue_id, pull_request_id, pr_head_sha, repo_link_id,
    connection_id, repo_provider, repo_external_id, status, triggered_by,
    created_by, prompt, prompt_mentions, title, model, model_forced,
    reasoning_level, key_mode, base_branch, branch_name, pr_number, pr_url,
    pr_state, run_id, chain_id, budget_usd, routine_id, intent,
    deployment_url, loop_in_vm, agent_engine, local_exec,
    local_issue_context_confirmed, local_worktree, managed_budget_usd
  ) VALUES (
    (p_values->>'project_id')::uuid,
    NULLIF(p_values->>'issue_id', '')::uuid,
    NULLIF(p_values->>'pull_request_id', '')::uuid,
    p_values->>'pr_head_sha',
    NULLIF(p_values->>'repo_link_id', '')::uuid,
    NULLIF(p_values->>'connection_id', '')::uuid,
    p_values->>'repo_provider',
    p_values->>'repo_external_id',
    p_values->>'status',
    p_values->>'triggered_by',
    (p_values->>'created_by')::uuid,
    p_values->>'prompt',
    p_values->'prompt_mentions',
    p_values->>'title',
    p_values->>'model',
    (p_values->>'model_forced')::boolean,
    p_values->>'reasoning_level',
    p_values->>'key_mode',
    p_values->>'base_branch',
    p_values->>'branch_name',
    NULLIF(p_values->>'pr_number', '')::integer,
    p_values->>'pr_url',
    p_values->>'pr_state',
    (p_values->>'run_id')::uuid,
    NULLIF(p_values->>'chain_id', '')::uuid,
    NULLIF(p_values->>'budget_usd', '')::numeric,
    NULLIF(p_values->>'routine_id', '')::uuid,
    p_values->>'intent',
    p_values->>'deployment_url',
    (p_values->>'loop_in_vm')::boolean,
    p_values->>'agent_engine',
    (p_values->>'local_exec')::boolean,
    (p_values->>'local_issue_context_confirmed')::boolean,
    (p_values->>'local_worktree')::boolean,
    v_granted
  )
  RETURNING * INTO v_run;

  RETURN jsonb_build_object(
    'run', to_jsonb(v_run),
    'granted_budget_usd', v_granted,
    'spent_usd', v_spent,
    'reserved_usd', v_reserved
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_agent_run_with_budget(
  uuid, timestamptz, numeric, numeric, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent_run_with_budget(
  uuid, timestamptz, numeric, numeric, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_agent_run_rest(
  p_run_id uuid
) RETURNS SETOF public.agent_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE public.agent_runs
     SET rest_claimed_at = now()
   WHERE id = p_run_id
     AND status = 'running'
     AND rest_claimed_at IS NULL
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_agent_run_rest(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_run_rest(uuid) TO service_role;

-- Every new turn must be independently claimable after a previous callback
-- re-queued the conversation.
CREATE OR REPLACE FUNCTION public.claim_agent_run(
  p_run_id uuid
) RETURNS SETOF public.agent_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.agent_runs
     SET status = 'running',
         started_at = now(),
         window_started_at = coalesce(window_started_at, now()),
         attempts = attempts + 1,
         rest_claimed_at = null
   WHERE id = p_run_id
     AND status = 'queued'
     AND created_by IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.projects AS project
       WHERE project.id = agent_runs.project_id
         AND project.deleted_at IS NULL
         AND (
           project.owner_id = agent_runs.created_by
           OR EXISTS (
             SELECT 1
             FROM public.project_members AS member
             WHERE member.project_id = project.id
               AND member.user_id = agent_runs.created_by
           )
         )
     )
     AND (
       (
         agent_runs.repo_link_id IS NULL
         AND agent_runs.connection_id IS NULL
         AND agent_runs.repo_provider IS NULL
         AND agent_runs.repo_external_id IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.project_git_links AS current_link
           WHERE current_link.project_id = agent_runs.project_id
         )
       )
       OR EXISTS (
         SELECT 1
         FROM public.project_git_links AS current_link
         WHERE current_link.project_id = agent_runs.project_id
           AND current_link.id = agent_runs.repo_link_id
           AND current_link.connection_id IS NOT DISTINCT FROM agent_runs.connection_id
           AND current_link.provider = agent_runs.repo_provider
           AND current_link.external_repo_id = agent_runs.repo_external_id
       )
     )
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION public.claim_local_agent_run(
  p_run_id uuid,
  p_user_id uuid,
  p_device_id text
) RETURNS SETOF public.agent_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.agent_runs
     SET status = 'running',
         started_at = now(),
         window_started_at = coalesce(window_started_at, now()),
         attempts = attempts + 1,
         local_exec_device_id = p_device_id,
         rest_claimed_at = null
   WHERE id = p_run_id
     AND status = 'queued'
     AND local_exec = true
     AND created_by = p_user_id
     AND local_exec_device_id IS NULL
     AND p_device_id ~ '^[0-9a-f]{32}$'
     AND EXISTS (
       SELECT 1
       FROM public.projects AS project
       WHERE project.id = agent_runs.project_id
         AND project.deleted_at IS NULL
         AND (
           project.owner_id = p_user_id
           OR EXISTS (
             SELECT 1
             FROM public.project_members AS member
             WHERE member.project_id = project.id
               AND member.user_id = p_user_id
           )
         )
     )
     AND (
       (
         agent_runs.repo_link_id IS NULL
         AND agent_runs.connection_id IS NULL
         AND agent_runs.repo_provider IS NULL
         AND agent_runs.repo_external_id IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.project_git_links AS current_link
           WHERE current_link.project_id = agent_runs.project_id
         )
       )
       OR EXISTS (
         SELECT 1
         FROM public.project_git_links AS current_link
         WHERE current_link.project_id = agent_runs.project_id
           AND current_link.id = agent_runs.repo_link_id
           AND current_link.connection_id IS NOT DISTINCT FROM agent_runs.connection_id
           AND current_link.provider = agent_runs.repo_provider
           AND current_link.external_repo_id = agent_runs.repo_external_id
       )
     )
  RETURNING *;
$$;
