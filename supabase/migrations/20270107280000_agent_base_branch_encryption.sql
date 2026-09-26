BEGIN;

ALTER TABLE public.agent_runs ADD COLUMN base_branch_encryption_checked_at timestamptz;
CREATE INDEX agent_run_base_branch_encryption_queue
  ON public.agent_runs (base_branch_encryption_checked_at NULLS FIRST, id)
  WHERE base_branch IS NOT NULL;
ALTER TABLE public.agent_runtime_sessions
  ADD COLUMN base_branch_encryption_checked_at timestamptz,
  ADD COLUMN base_branch_bound_run_id uuid;
CREATE INDEX agent_runtime_base_branch_encryption_queue
  ON public.agent_runtime_sessions (base_branch_encryption_checked_at NULLS FIRST, conversation_id)
  WHERE current_run_id IS NULL AND base_branch IS NOT NULL;

CREATE TABLE public.agent_base_branch_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_base_branch_encryption_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_base_branch_encryption_scopes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_base_branch_encryption_scopes TO service_role;

CREATE FUNCTION public.guard_agent_run_base_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE encrypted boolean := COALESCE(NEW.base_branch LIKE 'mdyb3:%', false);
  previous boolean := false;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.project_id::text, 59128));
  IF encrypted AND NEW.base_branch !~ '^mdyb3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'agent_base_branch_ciphertext_invalid' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    previous := COALESCE(OLD.base_branch LIKE 'mdyb3:%', false);
    IF (NEW.project_id, NEW.id) IS DISTINCT FROM (OLD.project_id, OLD.id) AND
        (previous OR encrypted OR EXISTS (
          SELECT 1 FROM public.agent_base_branch_encryption_scopes s
          WHERE s.project_id IN (OLD.project_id, NEW.project_id))) THEN
      RAISE EXCEPTION 'agent_base_branch_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF previous AND (NOT encrypted OR
        pg_catalog.split_part(NEW.base_branch, ':', 2)::integer <
        pg_catalog.split_part(OLD.base_branch, ':', 2)::integer) THEN
      RAISE EXCEPTION 'agent_base_branch_encryption_downgrade' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF encrypted THEN
    INSERT INTO public.agent_base_branch_encryption_scopes(project_id)
      VALUES(NEW.project_id) ON CONFLICT DO NOTHING;
  ELSIF NEW.base_branch IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.agent_base_branch_encryption_scopes s
      WHERE s.project_id = NEW.project_id) AND
      (TG_OP = 'INSERT' OR NEW.base_branch IS DISTINCT FROM OLD.base_branch) THEN
    RAISE EXCEPTION 'agent_base_branch_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_run_base_branch_guard
  BEFORE INSERT OR UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_run_base_branch();
REVOKE ALL ON FUNCTION public.guard_agent_run_base_branch() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_agent_runtime_base_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid; source_branch text;
  encrypted boolean := COALESCE(NEW.base_branch LIKE 'mdyb3:%', false);
  previous boolean := false;
BEGIN
  SELECT c.project_id INTO project FROM public.agent_conversations c
    WHERE c.id = NEW.conversation_id FOR SHARE;
  IF project IS NULL THEN
    RAISE EXCEPTION 'agent_runtime_conversation_missing' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(project::text, 59128));
  IF encrypted AND NEW.base_branch !~ '^mdyb3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'agent_runtime_base_branch_ciphertext_invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.current_run_id IS NOT NULL THEN
    NEW.base_branch_bound_run_id := NEW.current_run_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.current_run_id IS NOT NULL AND
      NEW.base_branch IS NOT DISTINCT FROM OLD.base_branch AND
      COALESCE(OLD.base_branch LIKE 'mdyb3:%', false) THEN
    -- ON DELETE SET NULL must retain the ciphertext's original run binding.
    NEW.base_branch_bound_run_id := OLD.current_run_id;
  END IF;
  IF NEW.current_run_id IS NOT NULL THEN
    SELECT r.base_branch INTO source_branch FROM public.agent_runs r
      WHERE r.id = NEW.current_run_id AND r.conversation_id = NEW.conversation_id
        AND r.project_id = project;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'agent_runtime_run_scope_mismatch' USING ERRCODE = '23514';
    END IF;
    IF (encrypted OR COALESCE(source_branch LIKE 'mdyb3:%', false)) AND
        NEW.base_branch IS DISTINCT FROM source_branch THEN
      RAISE EXCEPTION 'agent_runtime_base_branch_copy_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    previous := COALESCE(OLD.base_branch LIKE 'mdyb3:%', false);
    IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
      RAISE EXCEPTION 'agent_runtime_base_branch_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF encrypted AND NEW.current_run_id IS NOT DISTINCT FROM OLD.current_run_id AND
        NEW.base_branch_bound_run_id IS DISTINCT FROM OLD.base_branch_bound_run_id AND
        current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'agent_runtime_base_branch_binding_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF previous AND NEW.current_run_id IS NOT DISTINCT FROM OLD.current_run_id AND
        (NOT encrypted OR pg_catalog.split_part(NEW.base_branch, ':', 2)::integer <
          pg_catalog.split_part(OLD.base_branch, ':', 2)::integer) THEN
      RAISE EXCEPTION 'agent_runtime_base_branch_encryption_downgrade' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF encrypted THEN
    INSERT INTO public.agent_base_branch_encryption_scopes(project_id)
      VALUES(project) ON CONFLICT DO NOTHING;
  ELSIF NEW.base_branch IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.agent_base_branch_encryption_scopes s
      WHERE s.project_id = project) AND
      (TG_OP = 'INSERT' OR NEW.base_branch IS DISTINCT FROM OLD.base_branch) THEN
    RAISE EXCEPTION 'agent_runtime_base_branch_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_runtime_base_branch_guard
  BEFORE INSERT OR UPDATE ON public.agent_runtime_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_runtime_base_branch();
REVOKE ALL ON FUNCTION public.guard_agent_runtime_base_branch() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_agent_base_branch_parent_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND
      (EXISTS (SELECT 1 FROM public.agent_base_branch_encryption_scopes s
        WHERE s.project_id IN (OLD.project_id, NEW.project_id)) OR
       EXISTS (SELECT 1 FROM public.agent_runtime_sessions rs
        WHERE rs.conversation_id = OLD.id AND rs.base_branch LIKE 'mdyb3:%')) THEN
    RAISE EXCEPTION 'agent_base_branch_parent_scope_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_base_branch_parent_scope_guard
  BEFORE UPDATE OF project_id ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_base_branch_parent_scope();
REVOKE ALL ON FUNCTION public.guard_agent_base_branch_parent_scope() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_agent_run_base_branch(
  p_id uuid, p_project_id uuid, p_old_branch text, p_new_branch text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE run_row public.agent_runs; prior text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  SELECT * INTO run_row FROM public.agent_runs
    WHERE id = p_id AND project_id = p_project_id FOR UPDATE;
  IF NOT FOUND OR run_row.base_branch IS DISTINCT FROM p_old_branch THEN RETURN false; END IF;
  IF p_new_branch IS NULL THEN
    UPDATE public.agent_runs SET base_branch_encryption_checked_at = clock_timestamp()
      WHERE id = p_id;
    RETURN true;
  END IF;
  IF p_new_branch NOT LIKE 'mdyb3:%' THEN
    RAISE EXCEPTION 'agent_base_branch_migration_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  UPDATE public.agent_runs SET base_branch = p_new_branch,
    base_branch_encryption_checked_at = clock_timestamp() WHERE id = p_id;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_run_base_branch(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_run_base_branch(uuid,uuid,text,text)
  TO service_role;

CREATE FUNCTION public.migrate_orphan_agent_runtime_base_branch(
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
  IF NOT FOUND OR session_row.base_branch IS DISTINCT FROM p_old_branch OR
      session_row.base_branch_bound_run_id IS DISTINCT FROM p_old_bound_run_id THEN
    RETURN false;
  END IF;
  IF p_new_branch IS NULL THEN
    UPDATE public.agent_runtime_sessions
      SET base_branch_encryption_checked_at = clock_timestamp()
      WHERE conversation_id = p_conversation_id;
    RETURN true;
  END IF;
  IF p_new_branch NOT LIKE 'mdyb3:%' THEN
    RAISE EXCEPTION 'agent_runtime_base_branch_migration_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  UPDATE public.agent_runtime_sessions SET base_branch = p_new_branch,
    base_branch_bound_run_id = NULL,
    base_branch_encryption_checked_at = clock_timestamp()
    WHERE conversation_id = p_conversation_id;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_orphan_agent_runtime_base_branch(uuid,uuid,text,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_orphan_agent_runtime_base_branch(uuid,uuid,text,uuid,text)
  TO service_role;

COMMIT;
