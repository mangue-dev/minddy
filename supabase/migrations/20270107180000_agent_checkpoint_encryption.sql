-- Protect agent checkpoint state and the runtime-session copy in one transaction.
BEGIN;

ALTER TABLE public.agent_runs
  ADD COLUMN checkpoint_ciphertext text,
  ADD COLUMN checkpoint_encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN checkpoint_encryption_checked_at timestamptz,
  ADD CONSTRAINT agent_runs_checkpoint_encryption_state CHECK (
    (checkpoint_encryption_version = 0 AND checkpoint_ciphertext IS NULL)
    OR (checkpoint_encryption_version > 0 AND checkpoint IS NULL
      AND checkpoint_ciphertext IS NOT NULL
      AND COALESCE((checkpoint_ciphertext::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((checkpoint_ciphertext::jsonb ->> 'keyVersion')::integer = checkpoint_encryption_version, false))
  ) NOT VALID;
CREATE INDEX agent_runs_checkpoint_encryption_queue
  ON public.agent_runs (checkpoint_encryption_checked_at NULLS FIRST, id);

ALTER TABLE public.agent_runtime_sessions
  ADD COLUMN checkpoint_ciphertext text,
  ADD COLUMN checkpoint_encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN checkpoint_encryption_checked_at timestamptz,
  ADD CONSTRAINT agent_runtime_checkpoint_encryption_state CHECK (
    (checkpoint_encryption_version = 0 AND checkpoint_ciphertext IS NULL)
    OR (checkpoint_encryption_version > 0 AND checkpoint IS NULL
      AND checkpoint_ciphertext IS NOT NULL
      AND COALESCE((checkpoint_ciphertext::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((checkpoint_ciphertext::jsonb ->> 'keyVersion')::integer = checkpoint_encryption_version, false))
  ) NOT VALID;
CREATE INDEX agent_runtime_checkpoint_encryption_queue
  ON public.agent_runtime_sessions (checkpoint_encryption_checked_at NULLS FIRST, conversation_id)
  WHERE current_run_id IS NULL;
REVOKE INSERT, UPDATE, DELETE ON public.agent_runtime_sessions FROM anon, authenticated;

CREATE TABLE public.agent_checkpoint_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.agent_checkpoint_encryption_scopes FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_agent_checkpoint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid; parent public.agent_runs;
BEGIN
  IF TG_TABLE_NAME = 'agent_runs' THEN
    project := NEW.project_id;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(project::text, 59118));
    IF TG_OP = 'UPDATE' AND OLD.checkpoint_encryption_version > 0 AND
      (NEW.project_id IS DISTINCT FROM OLD.project_id OR
       NEW.conversation_id IS DISTINCT FROM OLD.conversation_id) THEN
      RAISE EXCEPTION 'agent_checkpoint_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.checkpoint IS NOT NULL AND
       (NEW.project_id IS DISTINCT FROM OLD.project_id OR
        NEW.conversation_id IS DISTINCT FROM OLD.conversation_id) AND
       EXISTS (SELECT 1 FROM public.agent_checkpoint_encryption_scopes
         WHERE project_id = OLD.project_id) THEN
      RAISE EXCEPTION 'agent_checkpoint_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.checkpoint IS NOT NULL AND
       NEW.project_id IS DISTINCT FROM OLD.project_id AND
       EXISTS (SELECT 1 FROM public.agent_checkpoint_encryption_scopes
         WHERE project_id = NEW.project_id) THEN
      RAISE EXCEPTION 'agent_checkpoint_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT c.project_id INTO project FROM public.agent_conversations c
      WHERE c.id = NEW.conversation_id;
    IF project IS NULL THEN RAISE EXCEPTION 'agent_runtime_conversation_missing' USING ERRCODE = '23503'; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(project::text, 59118));
    IF NEW.current_run_id IS NOT NULL THEN
      SELECT * INTO parent FROM public.agent_runs r
        WHERE r.id = NEW.current_run_id AND r.project_id = project
          AND r.conversation_id = NEW.conversation_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'agent_runtime_run_scope_mismatch' USING ERRCODE = '23514'; END IF;
      IF NEW.checkpoint IS DISTINCT FROM parent.checkpoint OR
         NEW.checkpoint_ciphertext IS DISTINCT FROM parent.checkpoint_ciphertext OR
         NEW.checkpoint_encryption_version IS DISTINCT FROM parent.checkpoint_encryption_version THEN
        RAISE EXCEPTION 'agent_runtime_checkpoint_copy_mismatch' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.checkpoint_encryption_version > 0 AND
      NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
      RAISE EXCEPTION 'agent_checkpoint_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.checkpoint IS NOT NULL AND
       NEW.conversation_id IS DISTINCT FROM OLD.conversation_id AND
       EXISTS (SELECT 1 FROM public.agent_checkpoint_encryption_scopes s
         JOIN public.agent_conversations c ON c.project_id = s.project_id
         WHERE c.id = OLD.conversation_id) THEN
      RAISE EXCEPTION 'agent_checkpoint_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.checkpoint IS NOT NULL AND
       NEW.conversation_id IS DISTINCT FROM OLD.conversation_id AND
       EXISTS (SELECT 1 FROM public.agent_checkpoint_encryption_scopes
         WHERE project_id = project) THEN
      RAISE EXCEPTION 'agent_checkpoint_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.checkpoint_encryption_version > 0 THEN
    INSERT INTO public.agent_checkpoint_encryption_scopes(project_id)
      VALUES(project) ON CONFLICT DO NOTHING;
  ELSIF NEW.checkpoint IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.agent_checkpoint_encryption_scopes WHERE project_id = project
  ) THEN
    IF TG_OP = 'INSERT' THEN
      IF TG_TABLE_NAME = 'agent_runs' THEN
        RAISE EXCEPTION 'agent_checkpoint_requires_encryption' USING ERRCODE = '23514';
      ELSIF NOT EXISTS (
        SELECT 1 FROM public.agent_runtime_sessions s
        WHERE s.conversation_id = NEW.conversation_id
          AND s.current_run_id IS NOT DISTINCT FROM NEW.current_run_id
          AND s.checkpoint IS NOT DISTINCT FROM NEW.checkpoint
          AND s.checkpoint_ciphertext IS NOT DISTINCT FROM NEW.checkpoint_ciphertext
          AND s.checkpoint_encryption_version = NEW.checkpoint_encryption_version
      ) THEN
        RAISE EXCEPTION 'agent_checkpoint_requires_encryption' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.checkpoint IS DISTINCT FROM OLD.checkpoint OR
      NEW.checkpoint_ciphertext IS DISTINCT FROM OLD.checkpoint_ciphertext OR
      NEW.checkpoint_encryption_version IS DISTINCT FROM OLD.checkpoint_encryption_version THEN
      RAISE EXCEPTION 'agent_checkpoint_requires_encryption' USING ERRCODE = '23514';
    ELSIF TG_TABLE_NAME = 'agent_runtime_sessions' THEN
      IF NEW.current_run_id IS DISTINCT FROM OLD.current_run_id THEN
        RAISE EXCEPTION 'agent_checkpoint_requires_encryption' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_agent_run_checkpoint_guard BEFORE INSERT OR UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_checkpoint();
CREATE TRIGGER agent_runtime_checkpoint_guard
  BEFORE INSERT OR UPDATE ON public.agent_runtime_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_checkpoint();
REVOKE ALL ON FUNCTION public.guard_agent_checkpoint() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_agent_checkpoint_ciphertext(
  p_id uuid, p_project_id uuid, p_conversation_id uuid,
  p_old_checkpoint jsonb, p_old_cipher text, p_old_version integer,
  p_cipher text DEFAULT NULL, p_version integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.agent_runs; runtime public.agent_runtime_sessions;
  prior text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  SELECT * INTO r FROM public.agent_runs WHERE id = p_id
    AND project_id = p_project_id AND conversation_id = p_conversation_id FOR UPDATE;
  IF NOT FOUND OR r.checkpoint IS DISTINCT FROM p_old_checkpoint OR
    r.checkpoint_ciphertext IS DISTINCT FROM p_old_cipher OR
    r.checkpoint_encryption_version IS DISTINCT FROM p_old_version THEN RETURN false; END IF;
  SELECT * INTO runtime FROM public.agent_runtime_sessions
    WHERE conversation_id = p_conversation_id FOR UPDATE;
  IF p_cipher IS NULL AND p_version IS NULL THEN
    UPDATE public.agent_runs SET checkpoint_encryption_checked_at = clock_timestamp()
      WHERE id = p_id;
    RETURN true;
  END IF;
  IF p_cipher IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'agent_checkpoint_migration_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  UPDATE public.agent_runs SET checkpoint = NULL, checkpoint_ciphertext = p_cipher,
    checkpoint_encryption_version = p_version,
    checkpoint_encryption_checked_at = clock_timestamp() WHERE id = p_id;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
  IF runtime.current_run_id = p_id AND NOT EXISTS (
    SELECT 1 FROM public.agent_runtime_sessions s WHERE s.conversation_id = p_conversation_id
      AND s.checkpoint IS NULL AND s.checkpoint_ciphertext = p_cipher
      AND s.checkpoint_encryption_version = p_version
  ) THEN RAISE EXCEPTION 'agent_runtime_checkpoint_migration_copy_failed' USING ERRCODE = '23514'; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_checkpoint_ciphertext(
  uuid,uuid,uuid,jsonb,text,integer,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_checkpoint_ciphertext(
  uuid,uuid,uuid,jsonb,text,integer,text,integer) TO service_role;

CREATE FUNCTION public.migrate_orphan_agent_runtime_checkpoint(
  p_conversation_id uuid, p_project_id uuid, p_old_checkpoint jsonb,
  p_old_cipher text, p_old_version integer, p_cipher text, p_version integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE runtime public.agent_runtime_sessions;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_conversations c
      WHERE c.id = p_conversation_id AND c.project_id = p_project_id) THEN RETURN false; END IF;
  SELECT * INTO runtime FROM public.agent_runtime_sessions
    WHERE conversation_id = p_conversation_id AND current_run_id IS NULL FOR UPDATE;
  IF NOT FOUND OR runtime.checkpoint IS DISTINCT FROM p_old_checkpoint OR
    runtime.checkpoint_ciphertext IS DISTINCT FROM p_old_cipher OR
    runtime.checkpoint_encryption_version IS DISTINCT FROM p_old_version THEN RETURN false; END IF;
  IF p_cipher IS NULL AND p_version IS NULL THEN
    UPDATE public.agent_runtime_sessions
      SET checkpoint_encryption_checked_at = clock_timestamp()
      WHERE conversation_id = p_conversation_id;
    RETURN true;
  END IF;
  IF p_cipher IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'agent_checkpoint_migration_invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.agent_runtime_sessions SET checkpoint = NULL,
    checkpoint_ciphertext = p_cipher, checkpoint_encryption_version = p_version,
    checkpoint_encryption_checked_at = clock_timestamp()
    WHERE conversation_id = p_conversation_id AND current_run_id IS NULL;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_orphan_agent_runtime_checkpoint(
  uuid,uuid,jsonb,text,integer,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_orphan_agent_runtime_checkpoint(
  uuid,uuid,jsonb,text,integer,text,integer) TO service_role;

-- Sync encrypted checkpoint bytes without rewinding a newer runtime during maintenance.
CREATE OR REPLACE FUNCTION "public"."sync_agent_runtime_from_run"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  IF current_setting('minddy.encryption_maintenance', true) = 'on' AND EXISTS (
    SELECT 1 FROM public.agent_runtime_sessions s
    WHERE s.conversation_id = new.conversation_id
      AND s.current_run_id IS DISTINCT FROM new.id
  ) THEN RETURN NULL; END IF;
  insert into public.agent_runtime_sessions (
    conversation_id, current_run_id, repo_link_id, connection_id, base_branch,
    work_branch, sandbox_id, checkpoint, checkpoint_ciphertext,
    checkpoint_encryption_version, engine, execution, local_worktree,
    provider_key_id, last_activity_at, sandbox_stopped_at, created_at, updated_at
  ) values (
    new.conversation_id, new.id, new.repo_link_id, new.connection_id,
    new.base_branch, new.branch_name, new.sandbox_id, new.checkpoint,
    new.checkpoint_ciphertext, new.checkpoint_encryption_version, new.agent_engine, case when new.local_exec then 'local' else 'cloud' end,
    new.local_worktree, new.provider_key_id, new.last_activity_at,
    new.sandbox_stopped_at, new.created_at, new.updated_at
  ) on conflict (conversation_id) do update set
    current_run_id = excluded.current_run_id,
    repo_link_id = excluded.repo_link_id,
    connection_id = excluded.connection_id,
    base_branch = excluded.base_branch,
    work_branch = excluded.work_branch,
    sandbox_id = excluded.sandbox_id,
    checkpoint = excluded.checkpoint,
    checkpoint_ciphertext = excluded.checkpoint_ciphertext,
    checkpoint_encryption_version = excluded.checkpoint_encryption_version,
    engine = excluded.engine,
    execution = excluded.execution,
    local_worktree = excluded.local_worktree,
    provider_key_id = excluded.provider_key_id,
    last_activity_at = excluded.last_activity_at,
    sandbox_stopped_at = excluded.sandbox_stopped_at,
    updated_at = excluded.updated_at;

  if new.branch_name is not null then
    insert into public.agent_artifacts (
      conversation_id, run_id, kind, ref, created_at, updated_at
    ) values (
      new.conversation_id, new.id, 'branch', new.branch_name, new.created_at, new.updated_at
    ) on conflict (conversation_id, kind, ref) do update
      set run_id = excluded.run_id, updated_at = excluded.updated_at;
  end if;
  if new.pr_number is not null then
    insert into public.agent_artifacts (
      conversation_id, run_id, kind, ref, url, state, created_at, updated_at
    ) values (
      new.conversation_id, new.id, 'pull_request', new.pr_number::text,
      new.pr_url, new.pr_state, new.created_at, new.updated_at
    ) on conflict (conversation_id, kind, ref) do update
      set run_id = excluded.run_id, url = excluded.url,
          state = excluded.state, updated_at = excluded.updated_at;
  end if;
  return null;
end;
$$;
DROP TRIGGER trg_agent_run_runtime_sync ON public.agent_runs;
CREATE TRIGGER trg_agent_run_runtime_sync AFTER INSERT OR UPDATE OF
  repo_link_id, connection_id, base_branch, branch_name, sandbox_id, checkpoint,
  checkpoint_ciphertext, checkpoint_encryption_version, agent_engine, local_exec,
  local_worktree, provider_key_id, last_activity_at, sandbox_stopped_at,
  pr_number, pr_url, pr_state, updated_at ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.sync_agent_runtime_from_run();

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
     OR (v_run.status = 'failed' AND (v_run.checkpoint IS NULL AND v_run.checkpoint_ciphertext IS NULL))
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
     OR (v_run.status = 'failed' AND (v_run.checkpoint IS NULL AND v_run.checkpoint_ciphertext IS NULL))
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

COMMIT;
