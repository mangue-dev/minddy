-- Protect the launch prompt and mentions together with the SQL-created first message.
BEGIN;

ALTER TABLE public.agent_runs
  ADD COLUMN encrypted_launch_content text,
  ADD COLUMN launch_encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN launch_encryption_checked_at timestamptz,
  ADD COLUMN has_launch_prompt boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT agent_runs_launch_encryption_state CHECK (
    (launch_encryption_version = 0 AND encrypted_launch_content IS NULL)
    OR (launch_encryption_version > 0 AND prompt IS NULL AND prompt_mentions IS NULL
      AND encrypted_launch_content IS NOT NULL
      AND COALESCE((encrypted_launch_content::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((encrypted_launch_content::jsonb ->> 'keyVersion')::integer = launch_encryption_version, false))
  ) NOT VALID;
CREATE INDEX agent_runs_launch_encryption_queue
  ON public.agent_runs (launch_encryption_checked_at NULLS FIRST, id);

ALTER TABLE public.agent_messages DROP CONSTRAINT agent_messages_event_ciphertext;
ALTER TABLE public.agent_messages ADD CONSTRAINT agent_messages_event_ciphertext CHECK (
  content_encryption_version = 0 OR
  (source = 'assistant_summary' AND legacy_event_id IS NOT NULL
    AND COALESCE((content::jsonb ->> 'format')::integer = 3, false)
    AND COALESCE((content::jsonb ->> 'keyVersion')::integer = content_encryption_version, false)) OR
  (source IN ('initial_prompt','steering','system','assistant_summary')
    AND COALESCE((content::jsonb ->> 'format')::integer = 3, false)
    AND COALESCE((content::jsonb ->> 'keyVersion')::integer = content_encryption_version, false))
) NOT VALID;

CREATE TABLE public.agent_launch_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.agent_launch_encryption_scopes FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.agent_runs FROM anon, authenticated;

CREATE FUNCTION public.guard_agent_launch_encryption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.project_id::text, 59116));
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.project_id IS DISTINCT FROM OLD.project_id OR
      NEW.conversation_id IS DISTINCT FROM OLD.conversation_id)
      AND OLD.launch_encryption_version > 0 THEN
      RAISE EXCEPTION 'agent_launch_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF (NEW.prompt IS DISTINCT FROM OLD.prompt
      OR NEW.prompt_mentions IS DISTINCT FROM OLD.prompt_mentions
      OR NEW.encrypted_launch_content IS DISTINCT FROM OLD.encrypted_launch_content
      OR NEW.launch_encryption_version IS DISTINCT FROM OLD.launch_encryption_version
      OR NEW.has_launch_prompt IS DISTINCT FROM OLD.has_launch_prompt)
      AND current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'agent_launch_is_immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.launch_encryption_version > 0 THEN
    INSERT INTO public.agent_launch_encryption_scopes(project_id)
      VALUES (NEW.project_id) ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1 FROM public.agent_launch_encryption_scopes
      WHERE project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'agent_launch_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_run_launch_guard BEFORE INSERT OR UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_launch_encryption();
REVOKE ALL ON FUNCTION public.guard_agent_launch_encryption() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_agent_turn_for_run()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE turn_id uuid := gen_random_uuid(); initial_content text;
BEGIN
  INSERT INTO public.agent_turns (
    id, conversation_id, run_id, status, model, reasoning_level, initiated_by,
    cost_usd, outcome, error_message, started_at, completed_at, created_at, updated_at
  ) VALUES (
    turn_id, NEW.conversation_id, NEW.id, NEW.status, NEW.model,
    NEW.reasoning_level, NEW.created_by, NEW.cost_usd, NEW.outcome,
    NEW.error_message, NEW.started_at, NEW.completed_at, NEW.created_at, NEW.updated_at
  );
  IF NEW.launch_encryption_version > 0 THEN
    IF NOT NEW.has_launch_prompt THEN RETURN NULL; END IF;
    initial_content := NEW.encrypted_launch_content;
  ELSE
    initial_content := nullif(btrim(NEW.prompt), '');
  END IF;
  IF initial_content IS NOT NULL THEN
    INSERT INTO public.agent_messages (
      conversation_id, turn_id, run_id, role, content, created_by, source,
      created_at, content_encryption_version
    ) VALUES (
      NEW.conversation_id, turn_id, NEW.id, 'user', initial_content,
      NEW.created_by, 'initial_prompt', NEW.created_at, NEW.launch_encryption_version
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.guard_agent_initial_prompt_copy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid; launch_content text; version integer;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.source = 'initial_prompt'
    AND NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'agent_initial_copy_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.source <> 'initial_prompt' THEN RETURN NEW; END IF;
  SELECT c.project_id INTO project FROM public.agent_conversations c
    WHERE c.id = NEW.conversation_id;
  IF project IS NULL THEN RAISE EXCEPTION 'agent_message_conversation_missing' USING ERRCODE = '23503'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(project::text, 59116));
  IF NEW.run_id IS NOT NULL THEN
    SELECT r.encrypted_launch_content, r.launch_encryption_version
      INTO launch_content, version FROM public.agent_runs r
      WHERE r.id = NEW.run_id AND r.project_id = project;
    IF NOT FOUND THEN RAISE EXCEPTION 'agent_message_run_scope_mismatch' USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND
    (NEW.content IS DISTINCT FROM OLD.content OR
     NEW.content_encryption_version IS DISTINCT FROM OLD.content_encryption_version OR
     NEW.run_id IS DISTINCT FROM OLD.run_id OR
     NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
     NEW.source IS DISTINCT FROM OLD.source) AND
    current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'agent_initial_copy_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF version > 0 AND
    (NEW.content IS DISTINCT FROM launch_content OR
     NEW.content_encryption_version IS DISTINCT FROM version) THEN
    RAISE EXCEPTION 'agent_initial_copy_mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.content_encryption_version > 0 THEN
    INSERT INTO public.agent_launch_encryption_scopes(project_id)
      VALUES(project) ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.content_encryption_version = 0 AND EXISTS (
    SELECT 1 FROM public.agent_launch_encryption_scopes WHERE project_id = project
  ) AND current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'agent_initial_copy_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_initial_prompt_copy_guard
  BEFORE INSERT OR UPDATE ON public.agent_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_initial_prompt_copy();
REVOKE ALL ON FUNCTION public.guard_agent_initial_prompt_copy() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_agent_launch_ciphertext(
  p_id uuid, p_project_id uuid, p_conversation_id uuid, p_previous_version integer,
  p_content text DEFAULT NULL, p_version integer DEFAULT NULL,
  p_has_prompt boolean DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE original public.agent_runs; prior text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  SELECT * INTO original FROM public.agent_runs
    WHERE id = p_id AND project_id = p_project_id AND conversation_id = p_conversation_id
      AND launch_encryption_version = p_previous_version FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
    RETURN false;
  END IF;
  IF p_content IS NULL AND p_version IS NULL THEN
    UPDATE public.agent_runs SET launch_encryption_checked_at = clock_timestamp() WHERE id = p_id;
  ELSE
    IF p_content IS NULL OR p_version IS NULL OR p_version < 1 OR p_has_prompt IS NULL THEN
      RAISE EXCEPTION 'agent_launch_migration_invalid' USING ERRCODE = '22023';
    END IF;
    IF p_has_prompt IS DISTINCT FROM (CASE
      WHEN original.launch_encryption_version > 0 THEN original.has_launch_prompt
      ELSE nullif(btrim(original.prompt), '') IS NOT NULL END) THEN
      RAISE EXCEPTION 'agent_launch_prompt_state_mismatch' USING ERRCODE = '23514';
    END IF;
    UPDATE public.agent_runs SET prompt = NULL, prompt_mentions = NULL,
      encrypted_launch_content = p_content, launch_encryption_version = p_version,
      has_launch_prompt = p_has_prompt,
      launch_encryption_checked_at = clock_timestamp() WHERE id = p_id;
    UPDATE public.agent_messages SET content = p_content,
      content_encryption_version = p_version
      WHERE run_id = p_id AND source = 'initial_prompt';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_launch_ciphertext(
  uuid,uuid,uuid,integer,text,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_launch_ciphertext(
  uuid,uuid,uuid,integer,text,integer,boolean) TO service_role;


-- Keep managed-budget reservation and run creation atomic while accepting a
-- caller-assigned primary key and encrypted launch payload.
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
       'id', 'conversation_id', 'project_id', 'issue_id', 'pull_request_id', 'pr_head_sha',
       'repo_link_id', 'connection_id', 'repo_provider', 'repo_external_id',
       'status', 'triggered_by', 'created_by', 'prompt', 'prompt_mentions',
       'encrypted_launch_content', 'launch_encryption_version', 'has_launch_prompt',
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
    id, conversation_id, project_id, issue_id, pull_request_id, pr_head_sha,
    repo_link_id, connection_id, repo_provider, repo_external_id, status,
    triggered_by, created_by, prompt, prompt_mentions,
    encrypted_launch_content, launch_encryption_version, has_launch_prompt,
    parent_numo_conversation_id, parent_numo_turn_id, parent_numo_tool_call_id,
    continued_from_run_id, delegation_brief, delegation_attachments,
    title, model, model_forced, reasoning_level, key_mode, worker_model_source,
    worker_model_provider, base_branch, branch_name, pr_number, pr_url, pr_state,
    run_id, chain_id, budget_usd, routine_id, intent, deployment_url,
    loop_in_vm, agent_engine, local_exec, local_issue_context_confirmed,
    local_worktree, managed_budget_usd
  ) VALUES (
    COALESCE(nullif(p_values->>'id', '')::uuid, gen_random_uuid()),
    nullif(p_values->>'conversation_id', '')::uuid,
    (p_values->>'project_id')::uuid,
    nullif(p_values->>'issue_id', '')::uuid,
    nullif(p_values->>'pull_request_id', '')::uuid,
    p_values->>'pr_head_sha', nullif(p_values->>'repo_link_id', '')::uuid,
    nullif(p_values->>'connection_id', '')::uuid, p_values->>'repo_provider',
    p_values->>'repo_external_id', p_values->>'status', p_values->>'triggered_by',
    (p_values->>'created_by')::uuid, p_values->>'prompt', p_values->'prompt_mentions',
    p_values->>'encrypted_launch_content',
    COALESCE((p_values->>'launch_encryption_version')::integer, 0),
    COALESCE((p_values->>'has_launch_prompt')::boolean, false),
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

COMMIT;
