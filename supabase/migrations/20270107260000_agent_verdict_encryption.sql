BEGIN;

ALTER TABLE public.agent_runs
  ADD COLUMN verdict_ciphertext text,
  ADD COLUMN verdict_encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN verdict_encryption_checked_at timestamptz,
  ADD CONSTRAINT agent_run_verdict_encryption_state CHECK (
    (verdict_encryption_version = 0 AND verdict_ciphertext IS NULL)
    OR (verdict_encryption_version > 0 AND verdict IS NULL
      AND verdict_ciphertext IS NOT NULL
      AND COALESCE((verdict_ciphertext::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((verdict_ciphertext::jsonb ->> 'keyVersion')::integer = verdict_encryption_version, false))
  ) NOT VALID;
CREATE INDEX agent_run_verdict_encryption_queue
  ON public.agent_runs (verdict_encryption_checked_at NULLS FIRST, id)
  WHERE verdict IS NOT NULL OR verdict_ciphertext IS NOT NULL;

CREATE TABLE public.agent_verdict_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_verdict_encryption_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_verdict_encryption_scopes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_verdict_encryption_scopes TO service_role;

CREATE FUNCTION public.guard_agent_run_verdict()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.project_id::text, 59126));
  IF TG_OP = 'UPDATE' AND (NEW.project_id, NEW.id) IS DISTINCT FROM
      (OLD.project_id, OLD.id) AND
      (OLD.verdict_encryption_version > 0 OR NEW.verdict_encryption_version > 0 OR
       EXISTS (SELECT 1 FROM public.agent_verdict_encryption_scopes s
         WHERE s.project_id IN (OLD.project_id, NEW.project_id))) THEN
    RAISE EXCEPTION 'agent_verdict_scope_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.verdict_encryption_version >
      NEW.verdict_encryption_version THEN
    RAISE EXCEPTION 'agent_verdict_encryption_downgrade' USING ERRCODE = '23514';
  END IF;
  IF NEW.verdict_encryption_version > 0 THEN
    INSERT INTO public.agent_verdict_encryption_scopes(project_id)
      VALUES(NEW.project_id) ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.agent_verdict_encryption_scopes s
      WHERE s.project_id = NEW.project_id) AND
      (TG_OP = 'INSERT' AND NEW.verdict IS NOT NULL OR
       TG_OP = 'UPDATE' AND NEW.verdict IS NOT NULL AND
         NEW.verdict IS DISTINCT FROM OLD.verdict) THEN
    RAISE EXCEPTION 'agent_verdict_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_run_verdict_guard
  BEFORE INSERT OR UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_run_verdict();
REVOKE ALL ON FUNCTION public.guard_agent_run_verdict() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_agent_run_verdict(
  p_id uuid, p_project_id uuid, p_old_verdict jsonb,
  p_old_cipher text, p_old_version integer,
  p_cipher text DEFAULT NULL, p_version integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE run_row public.agent_runs;
BEGIN
  SELECT * INTO run_row FROM public.agent_runs
  WHERE id = p_id AND project_id = p_project_id FOR UPDATE;
  IF NOT FOUND OR run_row.verdict IS DISTINCT FROM p_old_verdict OR
      run_row.verdict_ciphertext IS DISTINCT FROM p_old_cipher OR
      run_row.verdict_encryption_version IS DISTINCT FROM p_old_version THEN
    RETURN false;
  END IF;
  IF p_cipher IS NULL AND p_version IS NULL THEN
    UPDATE public.agent_runs SET verdict_encryption_checked_at = clock_timestamp()
      WHERE id = p_id;
    RETURN true;
  END IF;
  IF p_cipher IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'agent_verdict_migration_invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.agent_runs SET verdict = NULL, verdict_ciphertext = p_cipher,
    verdict_encryption_version = p_version,
    verdict_encryption_checked_at = clock_timestamp() WHERE id = p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_run_verdict(
  uuid,uuid,jsonb,text,integer,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_run_verdict(
  uuid,uuid,jsonb,text,integer,text,integer) TO service_role;

COMMIT;
