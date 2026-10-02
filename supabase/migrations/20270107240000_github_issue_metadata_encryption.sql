BEGIN;

ALTER TABLE public.github_issue_sync_metadata
  ADD COLUMN content_ciphertext text,
  ADD COLUMN content_encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN content_encryption_checked_at timestamptz,
  ADD CONSTRAINT github_issue_metadata_encryption_state CHECK (
    (content_encryption_version = 0 AND content_ciphertext IS NULL)
    OR (content_encryption_version > 0 AND metadata = '{}'::jsonb
      AND milestone IS NULL AND content_ciphertext IS NOT NULL
      AND COALESCE((content_ciphertext::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((content_ciphertext::jsonb ->> 'keyVersion')::integer = content_encryption_version, false))
  ) NOT VALID;
CREATE INDEX github_issue_metadata_encryption_queue
  ON public.github_issue_sync_metadata (content_encryption_checked_at NULLS FIRST, issue_id);
REVOKE INSERT, UPDATE, DELETE ON public.github_issue_sync_metadata FROM anon, authenticated;

CREATE TABLE public.github_issue_metadata_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.github_issue_metadata_encryption_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.github_issue_metadata_encryption_scopes FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_github_issue_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid;
BEGIN
  SELECT i.project_id INTO project FROM public.issues i
    WHERE i.id = NEW.issue_id FOR SHARE;
  IF project IS NULL THEN
    RAISE EXCEPTION 'github_issue_metadata_parent_missing' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(project::text, 59124));
  IF TG_OP = 'UPDATE' AND NEW.issue_id IS DISTINCT FROM OLD.issue_id THEN
    RAISE EXCEPTION 'github_issue_metadata_identity_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.content_encryption_version > 0 AND
      NEW.content_encryption_version = 0 THEN
    RAISE EXCEPTION 'github_issue_metadata_encryption_downgrade' USING ERRCODE = '23514';
  END IF;
  IF NEW.content_encryption_version > 0 THEN
    INSERT INTO public.github_issue_metadata_encryption_scopes(project_id)
      VALUES(project) ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.github_issue_metadata_encryption_scopes
      WHERE project_id = project) AND
      (TG_OP = 'INSERT' OR
       pg_catalog.to_jsonb(NEW) - 'content_encryption_checked_at' IS DISTINCT FROM
       pg_catalog.to_jsonb(OLD) - 'content_encryption_checked_at') THEN
    RAISE EXCEPTION 'github_issue_metadata_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER github_issue_metadata_guard
  BEFORE INSERT OR UPDATE ON public.github_issue_sync_metadata
  FOR EACH ROW EXECUTE FUNCTION public.guard_github_issue_metadata();
REVOKE ALL ON FUNCTION public.guard_github_issue_metadata() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_github_issue_metadata_parent_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND EXISTS (
    SELECT 1 FROM public.github_issue_sync_metadata m
    WHERE m.issue_id = OLD.id AND
      (m.content_encryption_version > 0 OR
       EXISTS (SELECT 1 FROM public.github_issue_metadata_encryption_scopes s
         WHERE s.project_id IN (OLD.project_id, NEW.project_id)))
  ) THEN
    RAISE EXCEPTION 'github_issue_metadata_parent_scope_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER github_issue_metadata_parent_scope_guard
  BEFORE UPDATE OF project_id ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.guard_github_issue_metadata_parent_scope();
REVOKE ALL ON FUNCTION public.guard_github_issue_metadata_parent_scope() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_github_issue_metadata(
  p_issue_id uuid, p_project_id uuid, p_old_metadata jsonb,
  p_old_milestone jsonb, p_old_cipher text, p_old_version integer,
  p_old_synced_at timestamptz,
  p_cipher text DEFAULT NULL, p_version integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.github_issue_sync_metadata;
BEGIN
  SELECT m.* INTO current_row FROM public.github_issue_sync_metadata m
  JOIN public.issues i ON i.id = m.issue_id
  WHERE m.issue_id = p_issue_id AND i.project_id = p_project_id FOR UPDATE OF m;
  IF NOT FOUND OR current_row.metadata IS DISTINCT FROM p_old_metadata OR
      current_row.milestone IS DISTINCT FROM p_old_milestone OR
      current_row.content_ciphertext IS DISTINCT FROM p_old_cipher OR
      current_row.content_encryption_version IS DISTINCT FROM p_old_version OR
      current_row.synced_at IS DISTINCT FROM p_old_synced_at THEN
    RETURN false;
  END IF;
  IF p_cipher IS NULL AND p_version IS NULL THEN
    UPDATE public.github_issue_sync_metadata
      SET content_encryption_checked_at = clock_timestamp() WHERE issue_id = p_issue_id;
    RETURN true;
  END IF;
  IF p_cipher IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'github_issue_metadata_migration_invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.github_issue_sync_metadata SET metadata = '{}'::jsonb,
    milestone = NULL, content_ciphertext = p_cipher,
    content_encryption_version = p_version,
    content_encryption_checked_at = clock_timestamp() WHERE issue_id = p_issue_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_github_issue_metadata(
  uuid,uuid,jsonb,jsonb,text,integer,timestamptz,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_github_issue_metadata(
  uuid,uuid,jsonb,jsonb,text,integer,timestamptz,text,integer) TO service_role;

-- The source and its remote timestamp advance under one row lock.
CREATE FUNCTION public.sync_github_issue_metadata_encrypted(
  p_issue_id uuid, p_project_id uuid, p_values jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing public.github_issue_sync_metadata;
  remote_time timestamptz := (p_values->>'updated_at_remote')::timestamptz;
BEGIN
  IF p_issue_id IS NULL OR p_project_id IS NULL OR p_values IS NULL OR
      (p_values->>'content_encryption_version')::integer < 1 OR
      p_values->>'content_ciphertext' IS NULL OR
      p_values->'metadata' IS DISTINCT FROM '{}'::jsonb OR
      p_values->'milestone' IS NOT NULL AND p_values->'milestone' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'github_issue_metadata_sync_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.issues i WHERE i.id = p_issue_id
    AND i.project_id = p_project_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO existing FROM public.github_issue_sync_metadata
    WHERE issue_id = p_issue_id FOR UPDATE;
  IF FOUND AND remote_time IS NOT NULL AND
      existing.updated_at_remote IS NOT NULL AND
      (existing.updated_at_remote > remote_time OR
       existing.updated_at_remote = remote_time AND
         existing.content_encryption_version > 0) THEN
    RETURN false;
  END IF;
  INSERT INTO public.github_issue_sync_metadata (
    issue_id, github_node_id, author_login, author_association, state_reason,
    locked, active_lock_reason, milestone, created_at_remote, updated_at_remote,
    closed_at_remote, closed_by_login, metadata, synced_at,
    content_ciphertext, content_encryption_version
  ) VALUES (
    p_issue_id, p_values->>'github_node_id', p_values->>'author_login',
    p_values->>'author_association', p_values->>'state_reason',
    (p_values->>'locked')::boolean, p_values->>'active_lock_reason',
    NULL, (p_values->>'created_at_remote')::timestamptz, remote_time,
    (p_values->>'closed_at_remote')::timestamptz,
    p_values->>'closed_by_login', '{}'::jsonb,
    (p_values->>'synced_at')::timestamptz,
    p_values->>'content_ciphertext',
    (p_values->>'content_encryption_version')::integer
  ) ON CONFLICT (issue_id) DO UPDATE SET
    github_node_id = EXCLUDED.github_node_id,
    author_login = EXCLUDED.author_login,
    author_association = EXCLUDED.author_association,
    state_reason = EXCLUDED.state_reason,
    locked = EXCLUDED.locked,
    active_lock_reason = EXCLUDED.active_lock_reason,
    milestone = NULL,
    created_at_remote = EXCLUDED.created_at_remote,
    updated_at_remote = EXCLUDED.updated_at_remote,
    closed_at_remote = EXCLUDED.closed_at_remote,
    closed_by_login = EXCLUDED.closed_by_login,
    metadata = '{}'::jsonb,
    synced_at = EXCLUDED.synced_at,
    content_ciphertext = EXCLUDED.content_ciphertext,
    content_encryption_version = EXCLUDED.content_encryption_version;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_github_issue_metadata_encrypted(uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_github_issue_metadata_encrypted(uuid,uuid,jsonb)
  TO service_role;

COMMIT;
