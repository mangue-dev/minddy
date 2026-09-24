BEGIN;

ALTER TABLE public.agent_runs ADD COLUMN work_branch_encryption_checked_at timestamptz;
CREATE INDEX agent_run_work_branch_encryption_queue
  ON public.agent_runs (work_branch_encryption_checked_at NULLS FIRST, id)
  WHERE branch_name IS NOT NULL;
ALTER TABLE public.agent_runtime_sessions
  ADD COLUMN work_branch_encryption_checked_at timestamptz,
  ADD COLUMN work_branch_bound_run_id uuid;
CREATE INDEX agent_runtime_work_branch_encryption_queue
  ON public.agent_runtime_sessions (work_branch_encryption_checked_at NULLS FIRST, conversation_id)
  WHERE current_run_id IS NULL AND work_branch IS NOT NULL;
ALTER TABLE public.agent_artifacts
  ADD COLUMN ref_ciphertext text,
  ADD COLUMN ref_bound_run_id uuid,
  ADD COLUMN ref_encryption_checked_at timestamptz;
CREATE INDEX agent_artifact_ref_encryption_queue
  ON public.agent_artifacts (ref_encryption_checked_at NULLS FIRST, id)
  WHERE kind = 'branch';

CREATE TABLE public.agent_work_branch_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_work_branch_encryption_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_work_branch_encryption_scopes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_work_branch_encryption_scopes TO service_role;

CREATE FUNCTION public.guard_agent_run_work_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE encrypted boolean := COALESCE(NEW.branch_name LIKE 'mdyw3:%', false);
  previous boolean := false;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.project_id::text, 59129));
  IF encrypted AND NEW.branch_name !~ '^mdyw3:[a-f0-9]{64}:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'agent_work_branch_ciphertext_invalid' USING ERRCODE = '23514';
  END IF;
  IF encrypted AND current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on'
      AND EXISTS (SELECT 1 FROM public.agent_artifacts a
        WHERE a.conversation_id = NEW.conversation_id AND a.kind = 'branch'
          AND a.ref NOT LIKE 'mdyw3:%') THEN
    RAISE EXCEPTION 'agent_work_branch_artifacts_require_migration' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    previous := COALESCE(OLD.branch_name LIKE 'mdyw3:%', false);
    IF (NEW.project_id, NEW.id) IS DISTINCT FROM (OLD.project_id, OLD.id) AND
        (previous OR encrypted OR EXISTS (
          SELECT 1 FROM public.agent_work_branch_encryption_scopes s
          WHERE s.project_id IN (OLD.project_id, NEW.project_id))) THEN
      RAISE EXCEPTION 'agent_work_branch_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF previous AND (NOT encrypted OR
        pg_catalog.split_part(NEW.branch_name, ':', 3)::integer <
        pg_catalog.split_part(OLD.branch_name, ':', 3)::integer) THEN
      RAISE EXCEPTION 'agent_work_branch_encryption_downgrade' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF encrypted THEN
    INSERT INTO public.agent_work_branch_encryption_scopes(project_id)
      VALUES(NEW.project_id) ON CONFLICT DO NOTHING;
  ELSIF NEW.branch_name IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.agent_work_branch_encryption_scopes s
      WHERE s.project_id = NEW.project_id) AND
      (TG_OP = 'INSERT' OR NEW.branch_name IS DISTINCT FROM OLD.branch_name) THEN
    RAISE EXCEPTION 'agent_work_branch_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_run_work_branch_guard
  BEFORE INSERT OR UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_run_work_branch();
REVOKE ALL ON FUNCTION public.guard_agent_run_work_branch() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_agent_runtime_work_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid; source_branch text;
  encrypted boolean := COALESCE(NEW.work_branch LIKE 'mdyw3:%', false);
  previous boolean := false;
BEGIN
  SELECT c.project_id INTO project FROM public.agent_conversations c
    WHERE c.id = NEW.conversation_id FOR SHARE;
  IF project IS NULL THEN
    RAISE EXCEPTION 'agent_runtime_conversation_missing' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(project::text, 59129));
  IF encrypted AND NEW.work_branch !~ '^mdyw3:[a-f0-9]{64}:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'agent_runtime_work_branch_ciphertext_invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.current_run_id IS NOT NULL THEN
    NEW.work_branch_bound_run_id := NEW.current_run_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.current_run_id IS NOT NULL AND
      NEW.work_branch IS NOT DISTINCT FROM OLD.work_branch AND
      COALESCE(OLD.work_branch LIKE 'mdyw3:%', false) THEN
    NEW.work_branch_bound_run_id := OLD.current_run_id;
  END IF;
  IF NEW.current_run_id IS NOT NULL THEN
    SELECT r.branch_name INTO source_branch FROM public.agent_runs r
      WHERE r.id = NEW.current_run_id AND r.conversation_id = NEW.conversation_id
        AND r.project_id = project;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'agent_runtime_run_scope_mismatch' USING ERRCODE = '23514';
    END IF;
    IF (encrypted OR COALESCE(source_branch LIKE 'mdyw3:%', false)) AND
        NEW.work_branch IS DISTINCT FROM source_branch THEN
      RAISE EXCEPTION 'agent_runtime_work_branch_copy_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    previous := COALESCE(OLD.work_branch LIKE 'mdyw3:%', false);
    IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
      RAISE EXCEPTION 'agent_runtime_work_branch_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF encrypted AND NEW.current_run_id IS NOT DISTINCT FROM OLD.current_run_id AND
        NEW.work_branch_bound_run_id IS DISTINCT FROM OLD.work_branch_bound_run_id AND
        current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'agent_runtime_work_branch_binding_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF previous AND NEW.current_run_id IS NOT DISTINCT FROM OLD.current_run_id AND
        (NOT encrypted OR pg_catalog.split_part(NEW.work_branch, ':', 3)::integer <
          pg_catalog.split_part(OLD.work_branch, ':', 3)::integer) THEN
      RAISE EXCEPTION 'agent_runtime_work_branch_encryption_downgrade' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF encrypted THEN
    INSERT INTO public.agent_work_branch_encryption_scopes(project_id)
      VALUES(project) ON CONFLICT DO NOTHING;
  ELSIF NEW.work_branch IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.agent_work_branch_encryption_scopes s
      WHERE s.project_id = project) AND
      (TG_OP = 'INSERT' OR NEW.work_branch IS DISTINCT FROM OLD.work_branch) THEN
    RAISE EXCEPTION 'agent_runtime_work_branch_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_runtime_work_branch_guard
  BEFORE INSERT OR UPDATE ON public.agent_runtime_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_runtime_work_branch();
REVOKE ALL ON FUNCTION public.guard_agent_runtime_work_branch() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_agent_artifact_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid; source_branch text;
  encrypted boolean := COALESCE(NEW.ref LIKE 'mdyw3:%', false);
BEGIN
  IF NEW.kind <> 'branch' THEN RETURN NEW; END IF;
  SELECT c.project_id INTO project FROM public.agent_conversations c
    WHERE c.id = NEW.conversation_id FOR SHARE;
  IF project IS NULL THEN
    RAISE EXCEPTION 'agent_artifact_conversation_missing' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(project::text, 59129));
  IF encrypted AND (NEW.ref !~ '^mdyw3:[a-f0-9]{64}$' OR
      NEW.ref_ciphertext !~ '^mdyw3:[a-f0-9]{64}:[1-9][0-9]*:[A-Za-z0-9_-]+$' OR
      NEW.ref IS DISTINCT FROM
        pg_catalog.split_part(NEW.ref_ciphertext, ':', 1) || ':' ||
        pg_catalog.split_part(NEW.ref_ciphertext, ':', 2)) THEN
    RAISE EXCEPTION 'agent_artifact_branch_ciphertext_invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.run_id IS NOT NULL AND encrypted AND NEW.ref_bound_run_id IS NOT NULL AND
      NEW.ref_bound_run_id IS DISTINCT FROM NEW.run_id THEN
    RAISE EXCEPTION 'agent_artifact_branch_binding_invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.run_id IS NOT NULL AND NEW.ref_bound_run_id IS NOT NULL AND encrypted THEN
    SELECT r.branch_name INTO source_branch FROM public.agent_runs r
      WHERE r.id = NEW.run_id AND r.conversation_id = NEW.conversation_id
        AND r.project_id = project;
    IF (NOT FOUND OR source_branch IS DISTINCT FROM NEW.ref_ciphertext) AND
        current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'agent_artifact_branch_copy_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
      RAISE EXCEPTION 'agent_artifact_branch_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.ref LIKE 'mdyw3:%' AND (NOT encrypted OR
        pg_catalog.split_part(NEW.ref_ciphertext, ':', 3)::integer <
        pg_catalog.split_part(OLD.ref_ciphertext, ':', 3)::integer) THEN
      RAISE EXCEPTION 'agent_artifact_branch_encryption_downgrade' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF encrypted THEN
    INSERT INTO public.agent_work_branch_encryption_scopes(project_id)
      VALUES(project) ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.agent_work_branch_encryption_scopes s
      WHERE s.project_id = project) AND
      (TG_OP = 'INSERT' OR NEW.ref IS DISTINCT FROM OLD.ref) THEN
    RAISE EXCEPTION 'agent_artifact_branch_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_artifact_branch_guard
  BEFORE INSERT OR UPDATE ON public.agent_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_artifact_branch();
REVOKE ALL ON FUNCTION public.guard_agent_artifact_branch() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_agent_work_branch_parent_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND
      (EXISTS (SELECT 1 FROM public.agent_work_branch_encryption_scopes s
        WHERE s.project_id IN (OLD.project_id, NEW.project_id)) OR
       EXISTS (SELECT 1 FROM public.agent_runtime_sessions rs
        WHERE rs.conversation_id = OLD.id AND rs.work_branch LIKE 'mdyw3:%') OR
       EXISTS (SELECT 1 FROM public.agent_artifacts a
        WHERE a.conversation_id = OLD.id AND a.ref LIKE 'mdyw3:%')) THEN
    RAISE EXCEPTION 'agent_work_branch_parent_scope_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_work_branch_parent_scope_guard
  BEFORE UPDATE OF project_id ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_work_branch_parent_scope();
REVOKE ALL ON FUNCTION public.guard_agent_work_branch_parent_scope() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_agent_run_work_branch(
  p_id uuid, p_project_id uuid, p_old_branch text, p_new_branch text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE run_row public.agent_runs; prior text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  SELECT * INTO run_row FROM public.agent_runs
    WHERE id = p_id AND project_id = p_project_id FOR UPDATE;
  IF NOT FOUND OR run_row.branch_name IS DISTINCT FROM p_old_branch THEN RETURN false; END IF;
  IF p_new_branch IS NULL THEN
    UPDATE public.agent_runs SET work_branch_encryption_checked_at = clock_timestamp()
      WHERE id = p_id;
    RETURN true;
  END IF;
  IF p_new_branch !~ '^mdyw3:[a-f0-9]{64}:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'agent_work_branch_migration_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  IF p_old_branch NOT LIKE 'mdyw3:%' THEN
    DELETE FROM public.agent_artifacts a
      WHERE a.conversation_id = run_row.conversation_id AND a.kind = 'branch'
        AND a.ref = p_old_branch AND EXISTS (
          SELECT 1 FROM public.agent_artifacts existing
          WHERE existing.conversation_id = a.conversation_id AND existing.kind = 'branch'
            AND existing.ref = pg_catalog.split_part(p_new_branch, ':', 1) || ':' ||
              pg_catalog.split_part(p_new_branch, ':', 2));
    UPDATE public.agent_artifacts SET
      ref = pg_catalog.split_part(p_new_branch, ':', 1) || ':' ||
        pg_catalog.split_part(p_new_branch, ':', 2),
      ref_ciphertext = p_new_branch, ref_bound_run_id = p_id,
      ref_encryption_checked_at = clock_timestamp()
      WHERE conversation_id = run_row.conversation_id AND kind = 'branch'
        AND ref = p_old_branch;
  END IF;
  UPDATE public.agent_runs SET branch_name = p_new_branch,
    work_branch_encryption_checked_at = clock_timestamp() WHERE id = p_id;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_run_work_branch(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_run_work_branch(uuid,uuid,text,text)
  TO service_role;

CREATE FUNCTION public.migrate_orphan_agent_runtime_work_branch(
  p_conversation_id uuid, p_project_id uuid, p_old_branch text,
  p_old_bound_run_id uuid, p_new_branch text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE session_row public.agent_runtime_sessions;
  prior text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  SELECT rs.* INTO session_row FROM public.agent_runtime_sessions rs
  JOIN public.agent_conversations c ON c.id = rs.conversation_id
  WHERE rs.conversation_id = p_conversation_id AND c.project_id = p_project_id
    AND rs.current_run_id IS NULL FOR UPDATE OF rs;
  IF NOT FOUND OR session_row.work_branch IS DISTINCT FROM p_old_branch OR
      session_row.work_branch_bound_run_id IS DISTINCT FROM p_old_bound_run_id THEN
    RETURN false;
  END IF;
  IF p_new_branch IS NULL THEN
    UPDATE public.agent_runtime_sessions
      SET work_branch_encryption_checked_at = clock_timestamp()
      WHERE conversation_id = p_conversation_id;
    RETURN true;
  END IF;
  IF p_new_branch NOT LIKE 'mdyw3:%' THEN
    RAISE EXCEPTION 'agent_runtime_work_branch_migration_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  UPDATE public.agent_runtime_sessions SET work_branch = p_new_branch,
    work_branch_bound_run_id = NULL,
    work_branch_encryption_checked_at = clock_timestamp()
    WHERE conversation_id = p_conversation_id;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_orphan_agent_runtime_work_branch(uuid,uuid,text,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_orphan_agent_runtime_work_branch(uuid,uuid,text,uuid,text)
  TO service_role;

CREATE FUNCTION public.migrate_agent_artifact_branch(
  p_id uuid, p_project_id uuid, p_old_ref text, p_old_cipher text,
  p_old_bound_run_id uuid, p_new_ref text DEFAULT NULL,
  p_new_cipher text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE artifact public.agent_artifacts;
  prior text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  SELECT a.* INTO artifact FROM public.agent_artifacts a
  JOIN public.agent_conversations c ON c.id = a.conversation_id
  WHERE a.id = p_id AND a.kind = 'branch' AND c.project_id = p_project_id
    FOR UPDATE OF a;
  IF NOT FOUND OR artifact.ref IS DISTINCT FROM p_old_ref OR
      artifact.ref_ciphertext IS DISTINCT FROM p_old_cipher OR
      artifact.ref_bound_run_id IS DISTINCT FROM p_old_bound_run_id THEN
    RETURN false;
  END IF;
  IF p_new_ref IS NULL AND p_new_cipher IS NULL THEN
    UPDATE public.agent_artifacts SET ref_encryption_checked_at = clock_timestamp()
      WHERE id = p_id;
    RETURN true;
  END IF;
  IF p_new_ref IS NULL OR p_new_cipher IS NULL OR
      p_new_ref IS DISTINCT FROM pg_catalog.split_part(p_new_cipher, ':', 1) || ':' ||
        pg_catalog.split_part(p_new_cipher, ':', 2) THEN
    RAISE EXCEPTION 'agent_artifact_migration_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  UPDATE public.agent_artifacts SET ref = p_new_ref,
    ref_ciphertext = p_new_cipher, ref_bound_run_id = NULL,
    ref_encryption_checked_at = clock_timestamp() WHERE id = p_id;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_artifact_branch(uuid,uuid,text,text,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_artifact_branch(uuid,uuid,text,text,uuid,text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sync_agent_runtime_from_run() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF current_setting('minddy.encryption_maintenance', true) = 'on' AND EXISTS (
    SELECT 1 FROM public.agent_runtime_sessions s
    WHERE s.conversation_id = NEW.conversation_id
      AND s.current_run_id IS DISTINCT FROM NEW.id
  ) THEN RETURN NULL; END IF;
  INSERT INTO public.agent_runtime_sessions (
    conversation_id, current_run_id, repo_link_id, connection_id, base_branch,
    work_branch, sandbox_id, checkpoint, checkpoint_ciphertext,
    checkpoint_encryption_version, engine, execution, local_worktree,
    provider_key_id, last_activity_at, sandbox_stopped_at, created_at, updated_at
  ) VALUES (
    NEW.conversation_id, NEW.id, NEW.repo_link_id, NEW.connection_id,
    NEW.base_branch, NEW.branch_name, NEW.sandbox_id, NEW.checkpoint,
    NEW.checkpoint_ciphertext, NEW.checkpoint_encryption_version, NEW.agent_engine,
    CASE WHEN NEW.local_exec THEN 'local' ELSE 'cloud' END,
    NEW.local_worktree, NEW.provider_key_id, NEW.last_activity_at,
    NEW.sandbox_stopped_at, NEW.created_at, NEW.updated_at
  ) ON CONFLICT (conversation_id) DO UPDATE SET
    current_run_id = EXCLUDED.current_run_id,
    repo_link_id = EXCLUDED.repo_link_id,
    connection_id = EXCLUDED.connection_id,
    base_branch = EXCLUDED.base_branch,
    work_branch = EXCLUDED.work_branch,
    sandbox_id = EXCLUDED.sandbox_id,
    checkpoint = EXCLUDED.checkpoint,
    checkpoint_ciphertext = EXCLUDED.checkpoint_ciphertext,
    checkpoint_encryption_version = EXCLUDED.checkpoint_encryption_version,
    engine = EXCLUDED.engine,
    execution = EXCLUDED.execution,
    local_worktree = EXCLUDED.local_worktree,
    provider_key_id = EXCLUDED.provider_key_id,
    last_activity_at = EXCLUDED.last_activity_at,
    sandbox_stopped_at = EXCLUDED.sandbox_stopped_at,
    updated_at = EXCLUDED.updated_at;

  IF NEW.branch_name IS NOT NULL THEN
    IF NEW.branch_name LIKE 'mdyw3:%' THEN
      INSERT INTO public.agent_artifacts (
        conversation_id, run_id, kind, ref, ref_ciphertext,
        ref_bound_run_id, created_at, updated_at
      ) VALUES (
        NEW.conversation_id, NEW.id, 'branch',
        pg_catalog.split_part(NEW.branch_name, ':', 1) || ':' ||
          pg_catalog.split_part(NEW.branch_name, ':', 2),
        NEW.branch_name, NEW.id, NEW.created_at, NEW.updated_at
      ) ON CONFLICT (conversation_id, kind, ref) DO UPDATE
        SET run_id = EXCLUDED.run_id, ref_ciphertext = EXCLUDED.ref_ciphertext,
          ref_bound_run_id = EXCLUDED.ref_bound_run_id,
          updated_at = EXCLUDED.updated_at;
    ELSE
      INSERT INTO public.agent_artifacts (
        conversation_id, run_id, kind, ref, created_at, updated_at
      ) VALUES (
        NEW.conversation_id, NEW.id, 'branch', NEW.branch_name,
        NEW.created_at, NEW.updated_at
      ) ON CONFLICT (conversation_id, kind, ref) DO UPDATE
        SET run_id = EXCLUDED.run_id, updated_at = EXCLUDED.updated_at;
    END IF;
  END IF;
  IF NEW.pr_number IS NOT NULL THEN
    INSERT INTO public.agent_artifacts (
      conversation_id, run_id, kind, ref, url, state, created_at, updated_at
    ) VALUES (
      NEW.conversation_id, NEW.id, 'pull_request', NEW.pr_number::text,
      NEW.pr_url, NEW.pr_state, NEW.created_at, NEW.updated_at
    ) ON CONFLICT (conversation_id, kind, ref) DO UPDATE
      SET run_id = EXCLUDED.run_id, url = EXCLUDED.url,
        state = EXCLUDED.state, updated_at = EXCLUDED.updated_at;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER trg_agent_run_runtime_sync ON public.agent_runs;
CREATE TRIGGER trg_agent_run_runtime_sync AFTER INSERT OR UPDATE OF
  repo_link_id, connection_id, base_branch, branch_name, sandbox_id, checkpoint,
  checkpoint_ciphertext, checkpoint_encryption_version, agent_engine, local_exec,
  local_worktree, provider_key_id, last_activity_at, sandbox_stopped_at,
  pr_number, pr_url, pr_state, updated_at ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.sync_agent_runtime_from_run();

-- Worker handoff now runs in the authorized application repository. SQL cannot
-- inspect encrypted branch/result fields or safely construct their Numo copy.
CREATE OR REPLACE FUNCTION public.recover_stale_numo_turns()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count integer := 0;
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  FOR v_turn IN
    SELECT * FROM public.numo_assistant_turns
    WHERE status IN ('running', 'stopping')
      AND claimed_at < now() - interval '6 minutes'
    ORDER BY claimed_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_turn.status = 'stopping' AND v_turn.active_run_id IS NOT NULL THEN
      UPDATE public.agent_runs SET interrupt_requested = true
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

COMMIT;
