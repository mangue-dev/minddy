-- MIN-591: protect the issue source before feedback promotion copies its text.
BEGIN;

ALTER TABLE public.issues
  ALTER COLUMN title DROP NOT NULL,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_revision bigint NOT NULL DEFAULT 0 CHECK (encryption_revision >= 0),
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT issues_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND title IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL
      AND title IS NULL AND description IS NULL AND plan IS NULL
      AND remote_url IS NULL AND automation_override IS NULL
      AND COALESCE((encrypted_content::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((encrypted_content::jsonb ->> 'keyVersion')::integer = encryption_version, false)));
CREATE INDEX issues_encryption_queue
  ON public.issues(encryption_checked_at NULLS FIRST, id);
REVOKE INSERT, UPDATE, DELETE ON public.issues FROM anon, authenticated;

-- A project may already have a content key for other converted tables. Start the
-- issue-specific stale-writer fence only when its first ciphertext is committed.
CREATE TABLE public.issue_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.issue_encryption_scopes FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_issue_encryption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.project_id::text, 591));
  IF NEW.encryption_version > 0 THEN
    INSERT INTO public.issue_encryption_scopes(project_id) VALUES (NEW.project_id)
      ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.encryption_version = 0 AND EXISTS (
    SELECT 1 FROM public.issue_encryption_scopes WHERE project_id = NEW.project_id) THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'issue_requires_encryption' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.title, NEW.description, NEW.plan, NEW.remote_url, NEW.automation_override)
       IS DISTINCT FROM ROW(OLD.title, OLD.description, OLD.plan, OLD.remote_url, OLD.automation_override) THEN
      RAISE EXCEPTION 'issue_requires_encryption' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'issue_identity_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.encryption_version < OLD.encryption_version OR
      (OLD.encryption_version > 0 AND NEW.encryption_version = 0) THEN
      RAISE EXCEPTION 'issue_encryption_downgrade' USING ERRCODE = '23514';
    END IF;
    IF NEW.encryption_revision IS DISTINCT FROM OLD.encryption_revision THEN
      RAISE EXCEPTION 'issue_revision_is_managed' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['encryption_checked_at','encryption_revision','updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['encryption_checked_at','encryption_revision','updated_at']) THEN
      NEW.encryption_revision := OLD.encryption_revision + 1;
    ELSE NEW.encryption_revision := OLD.encryption_revision;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issues_encryption_guard BEFORE INSERT OR UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.guard_issue_encryption();
REVOKE ALL ON FUNCTION public.guard_issue_encryption() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.set_issue_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_setting('minddy.encryption_maintenance', true) = 'on' OR
    (to_jsonb(NEW) - ARRAY['encryption_checked_at','updated_at']) =
    (to_jsonb(OLD) - ARRAY['encryption_checked_at','updated_at']) THEN
    NEW.updated_at := OLD.updated_at;
  ELSE NEW.updated_at := clock_timestamp(); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER issues_set_updated_at ON public.issues;
CREATE TRIGGER issues_set_updated_at BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.set_issue_updated_at();
REVOKE ALL ON FUNCTION public.set_issue_updated_at() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_issue_ciphertext(
  p_id uuid, p_project_id uuid, p_revision bigint, p_previous_version integer,
  p_encryption_version integer DEFAULT NULL, p_encrypted_content text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer; previous_setting text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  IF p_encryption_version IS NULL AND p_encrypted_content IS NULL THEN
    UPDATE public.issues SET encryption_checked_at = clock_timestamp()
      WHERE id = p_id AND project_id = p_project_id AND encryption_revision = p_revision
        AND encryption_version = p_previous_version;
  ELSE
    UPDATE public.issues SET title = NULL, description = NULL, plan = NULL,
      remote_url = NULL, automation_override = NULL,
      encrypted_content = p_encrypted_content, encryption_version = p_encryption_version
      WHERE id = p_id AND project_id = p_project_id AND encryption_revision = p_revision
        AND encryption_version = p_previous_version;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(previous_setting, ''), true);
  RETURN affected = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_issue_ciphertext(uuid,uuid,bigint,integer,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_issue_ciphertext(uuid,uuid,bigint,integer,integer,text)
  TO service_role;

CREATE FUNCTION public.broadcast_issue_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pid uuid := COALESCE(NEW.project_id, OLD.project_id);
BEGIN
  PERFORM realtime.send(jsonb_build_object(
    'operation', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE
      jsonb_build_object('id', NEW.id, 'project_id', NEW.project_id) END,
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE
      jsonb_build_object('id', OLD.id, 'project_id', OLD.project_id) END
  ), TG_OP, 'project:' || pid, true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
DROP TRIGGER issues_broadcast ON public.issues;
CREATE TRIGGER issues_broadcast AFTER INSERT OR UPDATE OR DELETE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_issue_content();
REVOKE ALL ON FUNCTION public.broadcast_issue_content() FROM PUBLIC, anon, authenticated;

-- The history view must stop copying issue titles from plaintext SQL. The
-- authorized conversation reader hydrates an issue fallback in application code.
CREATE OR REPLACE VIEW public.numo_conversation_history WITH (security_invoker = true) AS
SELECT i.id, 'assistant'::text AS source, c.id AS legacy_id,
  c.user_id, c.project_id, NULL::uuid AS access_project_id,
  'private'::text AS visibility, c.title, c.status, c.error_message,
  c.archived_at, s.pinned_at, s.last_read_at, c.created_at,
  greatest(c.updated_at, w.updated_at) AS updated_at,
  CASE WHEN p.id IS NOT NULL AND p.deleted_at IS NULL THEN jsonb_build_object('name', p.name) END AS project,
  w.id AS latest_work_id
FROM public.conversations c
JOIN public.numo_conversation_ids i ON i.assistant_id = c.id
LEFT JOIN public.projects p ON p.id = c.project_id
LEFT JOIN public.numo_conversation_state s ON s.conversation_id = i.id AND s.user_id = auth.uid()
LEFT JOIN (
  SELECT DISTINCT ON (conversation_id) conversation_id, id, updated_at
  FROM public.numo_work
  ORDER BY conversation_id, updated_at DESC, id
) w ON w.conversation_id = i.id
UNION ALL
SELECT i.id, 'agent', c.id, c.owner_id, c.project_id, c.project_id,
  c.visibility, COALESCE(c.title, r.title, CASE WHEN issue.id IS NOT NULL THEN NULL ELSE pr.title END),
  CASE WHEN r.status IN ('queued', 'running') THEN 'generating'
    WHEN r.status = 'failed' THEN 'error' ELSE 'idle' END,
  r.error_message, c.archived_at, pin.created_at, rd.last_read_at, c.created_at,
  greatest(c.updated_at, r.updated_at), jsonb_build_object('name', p.name), r.id
FROM public.agent_conversations c
JOIN public.numo_conversation_ids i ON i.agent_id = c.id
JOIN public.projects p ON p.id = c.project_id AND p.deleted_at IS NULL
LEFT JOIN public.agent_conversation_pins pin ON pin.conversation_id = c.id AND pin.user_id = auth.uid()
LEFT JOIN public.agent_conversation_reads rd ON rd.conversation_id = c.id AND rd.user_id = auth.uid()
LEFT JOIN LATERAL (
  SELECT * FROM public.agent_runs WHERE conversation_id = c.id
  ORDER BY created_at DESC, id DESC LIMIT 1
) r ON true
LEFT JOIN public.issues issue ON issue.id = r.issue_id
LEFT JOIN public.pull_requests pr ON pr.id = r.pull_request_id
WHERE NOT EXISTS (SELECT 1 FROM public.numo_work_origins o WHERE o.agent_id = c.id)
  AND (r.id IS NULL OR r.routine_id IS NULL)
  AND (r.issue_id IS NULL OR issue.id IS NOT NULL)
  AND (r.pull_request_id IS NULL OR pr.id IS NOT NULL);

COMMIT;
