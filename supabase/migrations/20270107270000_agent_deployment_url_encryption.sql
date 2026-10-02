BEGIN;

ALTER TABLE public.agent_runs
  ADD COLUMN deployment_encryption_checked_at timestamptz;
CREATE INDEX agent_run_deployment_encryption_queue
  ON public.agent_runs (deployment_encryption_checked_at NULLS FIRST, id)
  WHERE deployment_url IS NOT NULL;
CREATE INDEX agent_run_deployment_lookup
  ON public.agent_runs (deployment_url text_pattern_ops, not_before)
  WHERE status = 'queued' AND deployment_url IS NOT NULL;

CREATE TABLE public.agent_deployment_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_deployment_encryption_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_deployment_encryption_scopes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_deployment_encryption_scopes TO service_role;

CREATE FUNCTION public.guard_agent_run_deployment_url()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE new_encrypted boolean; old_encrypted boolean := false;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.project_id::text, 59127));
  new_encrypted := COALESCE(NEW.deployment_url LIKE 'mdye3:%', false);
  IF new_encrypted AND NEW.deployment_url !~
      '^mdye3:[a-f0-9]{64}:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'agent_deployment_ciphertext_invalid' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    old_encrypted := COALESCE(OLD.deployment_url LIKE 'mdye3:%', false);
    IF (NEW.project_id, NEW.id) IS DISTINCT FROM (OLD.project_id, OLD.id) AND
        (old_encrypted OR new_encrypted OR EXISTS (
          SELECT 1 FROM public.agent_deployment_encryption_scopes s
          WHERE s.project_id IN (OLD.project_id, NEW.project_id))) THEN
      RAISE EXCEPTION 'agent_deployment_scope_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF old_encrypted AND (NOT new_encrypted OR
        pg_catalog.split_part(NEW.deployment_url, ':', 3)::integer <
        pg_catalog.split_part(OLD.deployment_url, ':', 3)::integer) THEN
      RAISE EXCEPTION 'agent_deployment_encryption_downgrade' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF new_encrypted THEN
    INSERT INTO public.agent_deployment_encryption_scopes(project_id)
      VALUES(NEW.project_id) ON CONFLICT DO NOTHING;
  ELSIF NEW.deployment_url IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.agent_deployment_encryption_scopes s
      WHERE s.project_id = NEW.project_id) AND
      (TG_OP = 'INSERT' OR NEW.deployment_url IS DISTINCT FROM OLD.deployment_url) THEN
    RAISE EXCEPTION 'agent_deployment_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_run_deployment_url_guard
  BEFORE INSERT OR UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_run_deployment_url();
REVOKE ALL ON FUNCTION public.guard_agent_run_deployment_url() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_agent_run_deployment_url(
  p_id uuid, p_project_id uuid, p_old_url text, p_new_url text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE run_row public.agent_runs;
BEGIN
  SELECT * INTO run_row FROM public.agent_runs
    WHERE id = p_id AND project_id = p_project_id FOR UPDATE;
  IF NOT FOUND OR run_row.deployment_url IS DISTINCT FROM p_old_url THEN
    RETURN false;
  END IF;
  IF p_new_url IS NULL THEN
    UPDATE public.agent_runs SET deployment_encryption_checked_at = clock_timestamp()
      WHERE id = p_id;
    RETURN true;
  END IF;
  IF p_new_url NOT LIKE 'mdye3:%' THEN
    RAISE EXCEPTION 'agent_deployment_migration_invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.agent_runs SET deployment_url = p_new_url,
    deployment_encryption_checked_at = clock_timestamp() WHERE id = p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_run_deployment_url(
  uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_run_deployment_url(
  uuid,uuid,text,text) TO service_role;

COMMIT;
