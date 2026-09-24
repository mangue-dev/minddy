-- Protect durable code-agent replay batches without changing their append order.
BEGIN;

ALTER TABLE public.agent_run_journal
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encryption_checked_at timestamptz;

ALTER TABLE public.agent_run_journal
  DROP CONSTRAINT agent_run_journal_payload_shape_check;
ALTER TABLE public.agent_run_journal
  ADD CONSTRAINT agent_run_journal_encryption_state CHECK (
    (encryption_version = 0 AND (
      (events IS NOT NULL AND payload IS NULL AND payload_encoding IS NULL
        AND payload_sha256 IS NULL)
      OR (events IS NULL AND payload IS NOT NULL
        AND payload_encoding = 'gzip-json-v1'
        AND payload_sha256 ~ '^[0-9a-f]{64}$'
        AND event_count >= 0 AND payload_bytes > 0 AND stored_bytes > 0)))
    OR (encryption_version > 0 AND events IS NULL AND payload IS NOT NULL
      AND payload_encoding = 'encrypted-gzip-json-v1'
      AND payload_sha256 ~ '^[0-9a-f]{64}$'
      AND event_count >= 0 AND payload_bytes > 0 AND stored_bytes > 0
      AND COALESCE((payload::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((payload::jsonb ->> 'keyVersion')::integer = encryption_version, false))
  ) NOT VALID;

CREATE INDEX agent_run_journal_encryption_queue
  ON public.agent_run_journal (encryption_checked_at NULLS FIRST, id);

CREATE TABLE public.agent_journal_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.agent_journal_encryption_scopes FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.agent_run_journal FROM anon, authenticated;

CREATE FUNCTION public.guard_agent_journal_encryption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid;
BEGIN
  SELECT run.project_id INTO project FROM public.agent_runs run WHERE run.id = NEW.run_id;
  IF project IS NULL THEN
    RAISE EXCEPTION 'agent_journal_run_missing' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(project::text, 59114));
  IF TG_OP = 'UPDATE' THEN
    IF current_setting('minddy.encryption_maintenance', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'agent_journal_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.run_id IS DISTINCT FROM OLD.run_id
      OR NEW.session_id IS DISTINCT FROM OLD.session_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.encryption_version < OLD.encryption_version THEN
      RAISE EXCEPTION 'agent_journal_identity_or_version_changed' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.encryption_version > 0 THEN
    INSERT INTO public.agent_journal_encryption_scopes(project_id)
      VALUES (project) ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1 FROM public.agent_journal_encryption_scopes WHERE project_id = project
  ) THEN
    RAISE EXCEPTION 'agent_journal_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_journal_encryption_guard
  BEFORE INSERT OR UPDATE ON public.agent_run_journal
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_journal_encryption();
REVOKE ALL ON FUNCTION public.guard_agent_journal_encryption() FROM PUBLIC, anon, authenticated;

-- A journal ciphertext is authenticated to the run's project. Moving the run
-- without an application re-encryption would make historical replay unreadable.
CREATE FUNCTION public.guard_agent_journal_parent_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND EXISTS (
    SELECT 1 FROM public.agent_run_journal
    WHERE run_id = OLD.id AND encryption_version > 0
  ) THEN
    RAISE EXCEPTION 'agent_journal_parent_scope_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_runs_journal_scope_guard
  BEFORE UPDATE OF project_id ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_journal_parent_scope();
REVOKE ALL ON FUNCTION public.guard_agent_journal_parent_scope() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.agent_journal_legacy_batch_exists(
  p_run_id uuid, p_session_id text, p_events jsonb
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agent_run_journal
    WHERE run_id = p_run_id AND session_id = p_session_id
      AND encryption_version = 0 AND events = p_events
  );
$$;
REVOKE ALL ON FUNCTION public.agent_journal_legacy_batch_exists(uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_journal_legacy_batch_exists(uuid,text,jsonb)
  TO service_role;

CREATE FUNCTION public.migrate_agent_journal_ciphertext(
  p_id bigint, p_run_id uuid, p_previous_version integer,
  p_payload text DEFAULT NULL, p_digest text DEFAULT NULL,
  p_version integer DEFAULT NULL, p_event_count integer DEFAULT NULL,
  p_payload_bytes integer DEFAULT NULL, p_stored_bytes integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer;
  prior text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  IF p_payload IS NULL AND p_digest IS NULL AND p_version IS NULL THEN
    UPDATE public.agent_run_journal SET encryption_checked_at = clock_timestamp()
      WHERE id = p_id AND run_id = p_run_id AND encryption_version = p_previous_version;
  ELSE
    UPDATE public.agent_run_journal SET events = NULL, payload = p_payload,
      payload_sha256 = p_digest, payload_encoding = 'encrypted-gzip-json-v1',
      encryption_version = p_version, event_count = p_event_count,
      payload_bytes = p_payload_bytes, stored_bytes = p_stored_bytes,
      encryption_checked_at = clock_timestamp()
      WHERE id = p_id AND run_id = p_run_id AND encryption_version = p_previous_version;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(prior, ''), true);
  RETURN affected = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_agent_journal_ciphertext(bigint,uuid,integer,text,text,integer,integer,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_agent_journal_ciphertext(bigint,uuid,integer,text,text,integer,integer,integer,integer)
  TO service_role;

COMMIT;
