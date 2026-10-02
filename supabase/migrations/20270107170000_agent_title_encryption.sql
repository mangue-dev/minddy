-- Keep run and conversation titles in one project-bound encrypted boundary.
BEGIN;

ALTER TABLE public.agent_runs
  ADD COLUMN title_ciphertext text,
  ADD COLUMN title_encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN title_encryption_checked_at timestamptz,
  ADD CONSTRAINT agent_runs_title_encryption_state CHECK (
    (title_encryption_version = 0 AND title_ciphertext IS NULL)
    OR (title_encryption_version > 0 AND title IS NULL AND title_ciphertext IS NOT NULL
      AND COALESCE((title_ciphertext::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((title_ciphertext::jsonb ->> 'keyVersion')::integer = title_encryption_version, false))
  ) NOT VALID;
CREATE INDEX agent_runs_title_encryption_queue
  ON public.agent_runs (title_encryption_checked_at NULLS FIRST, id);

ALTER TABLE public.agent_conversations
  ADD COLUMN title_ciphertext text,
  ADD COLUMN title_encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN title_encryption_checked_at timestamptz,
  ADD CONSTRAINT agent_conversations_title_encryption_state CHECK (
    (title_encryption_version = 0 AND title_ciphertext IS NULL)
    OR (title_encryption_version > 0 AND title IS NULL AND title_ciphertext IS NOT NULL
      AND COALESCE((title_ciphertext::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((title_ciphertext::jsonb ->> 'keyVersion')::integer = title_encryption_version, false))
  ) NOT VALID;
CREATE INDEX agent_conversations_title_encryption_queue
  ON public.agent_conversations (title_encryption_checked_at NULLS FIRST, id);

CREATE TABLE public.agent_title_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.agent_title_encryption_scopes FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.agent_conversations FROM anon, authenticated;

CREATE FUNCTION public.guard_agent_title()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.project_id::text, 59117));
  IF TG_OP = 'UPDATE' THEN
    IF OLD.title_encryption_version > 0 AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'agent_title_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'agent_runs' AND OLD.title_encryption_version > 0 THEN
      IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
        RAISE EXCEPTION 'agent_title_scope_is_immutable' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF OLD.title_encryption_version > 0 AND NEW.title_encryption_version = 0 THEN
      RAISE EXCEPTION 'agent_title_downgrade_refused' USING ERRCODE = '23514';
    END IF;
    IF OLD.title_encryption_version = 0 AND NEW.project_id IS DISTINCT FROM OLD.project_id AND
       EXISTS (SELECT 1 FROM public.agent_title_encryption_scopes
         WHERE project_id = OLD.project_id) THEN
      RAISE EXCEPTION 'agent_title_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.title_encryption_version > 0 THEN
    INSERT INTO public.agent_title_encryption_scopes(project_id)
      VALUES (NEW.project_id) ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.agent_title_encryption_scopes
      WHERE project_id = NEW.project_id) THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'agent_title_requires_encryption' USING ERRCODE = '23514';
    ELSIF NEW.project_id IS DISTINCT FROM OLD.project_id OR
      NEW.title IS DISTINCT FROM OLD.title OR
      NEW.title_ciphertext IS DISTINCT FROM OLD.title_ciphertext OR
      NEW.title_encryption_version IS DISTINCT FROM OLD.title_encryption_version THEN
      RAISE EXCEPTION 'agent_title_requires_encryption' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_agent_run_title_guard BEFORE INSERT OR UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_title();
CREATE TRIGGER agent_conversation_title_guard BEFORE INSERT OR UPDATE ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_title();
REVOKE ALL ON FUNCTION public.guard_agent_title() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_agent_run_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.conversation_id IS NULL THEN
    INSERT INTO public.agent_conversations (
      id, project_id, owner_id, title, title_ciphertext, title_encryption_version,
      visibility, created_at, updated_at
    ) VALUES (
      NEW.id, NEW.project_id, NEW.created_by, NEW.title,
      NEW.title_ciphertext, NEW.title_encryption_version,
      CASE WHEN NEW.routine_id IS NOT NULL OR NEW.chain_id IS NOT NULL
        OR NEW.pull_request_id IS NOT NULL THEN 'project' ELSE 'private' END,
      NEW.created_at, NEW.updated_at
    );
    NEW.conversation_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_agent_run_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.agent_conversations c
  SET title = CASE
        WHEN (TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title OR
          NEW.title_ciphertext IS DISTINCT FROM OLD.title_ciphertext) AND
          (TG_OP = 'INSERT' OR
           (c.title IS NOT DISTINCT FROM OLD.title AND
            c.title_ciphertext IS NOT DISTINCT FROM OLD.title_ciphertext))
          THEN NEW.title ELSE c.title END,
      title_ciphertext = CASE
        WHEN (TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title OR
          NEW.title_ciphertext IS DISTINCT FROM OLD.title_ciphertext) AND
          (TG_OP = 'INSERT' OR
           (c.title IS NOT DISTINCT FROM OLD.title AND
            c.title_ciphertext IS NOT DISTINCT FROM OLD.title_ciphertext))
          THEN NEW.title_ciphertext ELSE c.title_ciphertext END,
      title_encryption_version = CASE
        WHEN (TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title OR
          NEW.title_ciphertext IS DISTINCT FROM OLD.title_ciphertext) AND
          (TG_OP = 'INSERT' OR
           (c.title IS NOT DISTINCT FROM OLD.title AND
            c.title_ciphertext IS NOT DISTINCT FROM OLD.title_ciphertext))
          THEN NEW.title_encryption_version ELSE c.title_encryption_version END,
      updated_at = greatest(c.updated_at, NEW.updated_at)
  WHERE c.id = NEW.conversation_id;

  IF NEW.issue_id IS NOT NULL THEN
    INSERT INTO public.agent_conversation_contexts (conversation_id, kind, resource_id, role)
    VALUES (NEW.conversation_id, 'issue', NEW.issue_id, 'primary')
    ON CONFLICT (conversation_id, kind, resource_id) DO NOTHING;
  END IF;
  IF NEW.pull_request_id IS NOT NULL THEN
    INSERT INTO public.agent_conversation_contexts (conversation_id, kind, resource_id, role)
    VALUES (NEW.conversation_id, 'pull_request', NEW.pull_request_id, 'primary')
    ON CONFLICT (conversation_id, kind, resource_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER trg_agent_run_sync_conversation ON public.agent_runs;
CREATE TRIGGER trg_agent_run_sync_conversation
  AFTER INSERT OR UPDATE OF title, title_ciphertext, title_encryption_version,
    issue_id, pull_request_id, status, completed_at ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.sync_agent_run_conversation();

CREATE FUNCTION public.migrate_agent_title_ciphertext(
  p_run_id uuid, p_project_id uuid, p_conversation_id uuid,
  p_old_run_title text, p_old_run_cipher text, p_old_run_version integer,
  p_old_conversation_title text, p_old_conversation_cipher text,
  p_old_conversation_version integer, p_run_cipher text, p_conversation_cipher text,
  p_version integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.agent_runs; c public.agent_conversations;
BEGIN
  SELECT * INTO r FROM public.agent_runs WHERE id = p_run_id
    AND project_id = p_project_id AND conversation_id = p_conversation_id FOR UPDATE;
  IF NOT FOUND OR r.title IS DISTINCT FROM p_old_run_title OR
    r.title_ciphertext IS DISTINCT FROM p_old_run_cipher OR
    r.title_encryption_version IS DISTINCT FROM p_old_run_version THEN RETURN false; END IF;
  SELECT * INTO c FROM public.agent_conversations WHERE id = p_conversation_id
    AND project_id = p_project_id FOR UPDATE;
  IF NOT FOUND OR c.title IS DISTINCT FROM p_old_conversation_title OR
    c.title_ciphertext IS DISTINCT FROM p_old_conversation_cipher OR
    c.title_encryption_version IS DISTINCT FROM p_old_conversation_version THEN RETURN false; END IF;
  IF p_version < 1 OR p_run_cipher IS NULL OR p_conversation_cipher IS NULL THEN
    RAISE EXCEPTION 'agent_title_migration_invalid' USING ERRCODE = '22023';
  END IF;
  -- The run trigger may copy its title; the explicit conversation update then
  -- restores an independently renamed title within the same transaction.
  UPDATE public.agent_runs SET title = NULL, title_ciphertext = p_run_cipher,
    title_encryption_version = p_version,
    title_encryption_checked_at = clock_timestamp() WHERE id = p_run_id;
  UPDATE public.agent_conversations SET title = NULL,
    title_ciphertext = p_conversation_cipher,
    title_encryption_version = p_version,
    title_encryption_checked_at = clock_timestamp() WHERE id = p_conversation_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_title_ciphertext(
  uuid,uuid,uuid,text,text,integer,text,text,integer,text,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_title_ciphertext(
  uuid,uuid,uuid,text,text,integer,text,text,integer,text,text,integer)
  TO service_role;

CREATE FUNCTION public.migrate_agent_conversation_title_ciphertext(
  p_id uuid, p_project_id uuid, p_old_title text, p_old_cipher text,
  p_old_version integer, p_cipher text, p_version integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.agent_conversations;
BEGIN
  SELECT * INTO c FROM public.agent_conversations WHERE id = p_id
    AND project_id = p_project_id FOR UPDATE;
  IF NOT FOUND OR c.title IS DISTINCT FROM p_old_title OR
    c.title_ciphertext IS DISTINCT FROM p_old_cipher OR
    c.title_encryption_version IS DISTINCT FROM p_old_version THEN RETURN false; END IF;
  IF p_cipher IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'agent_title_migration_invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.agent_conversations SET title = NULL, title_ciphertext = p_cipher,
    title_encryption_version = p_version,
    title_encryption_checked_at = clock_timestamp() WHERE id = p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_conversation_title_ciphertext(
  uuid,uuid,text,text,integer,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_conversation_title_ciphertext(
  uuid,uuid,text,text,integer,text,integer) TO service_role;

-- Preserve managed-budget reservation and creation in one database transaction.
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
       'delegation_attachments', 'title', 'title_ciphertext',
       'title_encryption_version', 'model', 'model_forced',
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
    title, title_ciphertext, title_encryption_version,
    model, model_forced, reasoning_level, key_mode, worker_model_source,
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
    p_values->>'title', p_values->>'title_ciphertext',
    COALESCE((p_values->>'title_encryption_version')::integer, 0), p_values->>'model', (p_values->>'model_forced')::boolean,
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
