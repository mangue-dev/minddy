BEGIN;

ALTER TABLE public.github_issue_comment_syncs
  ADD COLUMN html_url_encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN html_url_encryption_checked_at timestamptz,
  ADD CONSTRAINT github_comment_url_encryption_state CHECK (
    (html_url_encryption_version = 0)
    OR (html_url_encryption_version > 0 AND html_url IS NOT NULL
      AND COALESCE((html_url::jsonb ->> 'format')::integer = 3, false)
      AND COALESCE((html_url::jsonb ->> 'keyVersion')::integer = html_url_encryption_version, false))
  ) NOT VALID;
CREATE INDEX github_comment_url_encryption_queue
  ON public.github_issue_comment_syncs (html_url_encryption_checked_at NULLS FIRST,
    issue_id, remote_comment_id);
REVOKE INSERT, UPDATE, DELETE ON public.github_issue_comment_syncs FROM anon, authenticated;

CREATE TABLE public.github_issue_comment_url_encryption_scopes (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.github_issue_comment_url_encryption_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.github_issue_comment_url_encryption_scopes FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_github_comment_url()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project uuid;
BEGIN
  SELECT i.project_id INTO project FROM public.issues i
    WHERE i.id = NEW.issue_id FOR SHARE;
  IF project IS NULL THEN
    RAISE EXCEPTION 'github_comment_url_parent_missing' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(project::text, 59125));
  IF TG_OP = 'UPDATE' AND
      (NEW.issue_id, NEW.remote_comment_id, NEW.comment_id) IS DISTINCT FROM
      (OLD.issue_id, OLD.remote_comment_id, OLD.comment_id) THEN
    RAISE EXCEPTION 'github_comment_url_identity_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.html_url_encryption_version > 0 AND
      NEW.html_url_encryption_version = 0 THEN
    RAISE EXCEPTION 'github_comment_url_encryption_downgrade' USING ERRCODE = '23514';
  END IF;
  IF NEW.html_url_encryption_version > 0 THEN
    INSERT INTO public.github_issue_comment_url_encryption_scopes(project_id)
      VALUES(project) ON CONFLICT DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.github_issue_comment_url_encryption_scopes
      WHERE project_id = project) AND
      (TG_OP = 'INSERT' OR
       pg_catalog.to_jsonb(NEW) - 'html_url_encryption_checked_at' IS DISTINCT FROM
       pg_catalog.to_jsonb(OLD) - 'html_url_encryption_checked_at') THEN
    RAISE EXCEPTION 'github_comment_url_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER github_comment_url_guard
  BEFORE INSERT OR UPDATE ON public.github_issue_comment_syncs
  FOR EACH ROW EXECUTE FUNCTION public.guard_github_comment_url();
REVOKE ALL ON FUNCTION public.guard_github_comment_url() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_github_comment_url_parent_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id AND EXISTS (
    SELECT 1 FROM public.github_issue_comment_syncs m
    WHERE m.issue_id = OLD.id AND
      (m.html_url_encryption_version > 0 OR
       EXISTS (SELECT 1 FROM public.github_issue_comment_url_encryption_scopes s
         WHERE s.project_id IN (OLD.project_id, NEW.project_id)))
  ) THEN
    RAISE EXCEPTION 'github_comment_url_parent_scope_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER github_comment_url_parent_scope_guard
  BEFORE UPDATE OF project_id ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.guard_github_comment_url_parent_scope();
REVOKE ALL ON FUNCTION public.guard_github_comment_url_parent_scope() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migrate_github_comment_url(
  p_issue_id uuid, p_remote_comment_id text, p_project_id uuid,
  p_old_url text, p_old_version integer, p_old_synced_at timestamptz,
  p_url text DEFAULT NULL, p_version integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.github_issue_comment_syncs;
BEGIN
  SELECT m.* INTO current_row FROM public.github_issue_comment_syncs m
  JOIN public.issues i ON i.id = m.issue_id
  WHERE m.issue_id = p_issue_id AND m.remote_comment_id = p_remote_comment_id
    AND i.project_id = p_project_id FOR UPDATE OF m;
  IF NOT FOUND OR current_row.html_url IS DISTINCT FROM p_old_url OR
      current_row.html_url_encryption_version IS DISTINCT FROM p_old_version OR
      current_row.synced_at IS DISTINCT FROM p_old_synced_at THEN
    RETURN false;
  END IF;
  IF p_url IS NULL AND p_version IS NULL THEN
    UPDATE public.github_issue_comment_syncs
      SET html_url_encryption_checked_at = clock_timestamp()
      WHERE issue_id = p_issue_id AND remote_comment_id = p_remote_comment_id;
    RETURN true;
  END IF;
  IF p_url IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'github_comment_url_migration_invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.github_issue_comment_syncs SET html_url = p_url,
    html_url_encryption_version = p_version,
    html_url_encryption_checked_at = clock_timestamp()
    WHERE issue_id = p_issue_id AND remote_comment_id = p_remote_comment_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_github_comment_url(
  uuid,text,uuid,text,integer,timestamptz,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_github_comment_url(
  uuid,text,uuid,text,integer,timestamptz,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_github_issue_comment_encrypted_url(
  p_issue_id uuid,
  p_remote_comment_id text,
  p_author_id uuid,
  p_body text,
  p_author_login text,
  p_author_association text,
  p_html_url text,
  p_created_at_remote timestamptz,
  p_updated_at_remote timestamptz,
  p_deleted_at_remote timestamptz,
  p_comment_id uuid DEFAULT NULL,
  p_encryption_version integer DEFAULT 0,
  p_encrypted_content text DEFAULT NULL,
  p_url_encryption_version integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sync public.github_issue_comment_syncs%ROWTYPE;
  v_comment_id uuid;
  v_comment public.comments%ROWTYPE;
BEGIN
  IF p_issue_id IS NULL OR p_remote_comment_id IS NULL OR p_remote_comment_id = ''
     OR p_author_id IS NULL OR p_url_encryption_version < 1
     OR p_html_url IS NULL
     OR NOT ((p_encryption_version = 0 AND p_body IS NOT NULL AND p_encrypted_content IS NULL)
       OR (p_encryption_version > 0 AND p_body IS NULL AND p_encrypted_content IS NOT NULL AND p_comment_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'github_comment_sync_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_issue_id::text || ':' || p_remote_comment_id,
      467
    )
  );
  SELECT * INTO v_sync
  FROM public.github_issue_comment_syncs
  WHERE issue_id = p_issue_id AND remote_comment_id = p_remote_comment_id
  FOR UPDATE;

  IF v_sync.comment_id IS NOT NULL
     AND v_sync.updated_at_remote IS NOT NULL
     AND p_updated_at_remote IS NOT NULL
     AND p_updated_at_remote < v_sync.updated_at_remote THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', 'stale', 'comment_id', v_sync.comment_id
    );
  END IF;

  IF v_sync.comment_id IS NOT NULL THEN
    SELECT * INTO v_comment FROM public.comments WHERE id = v_sync.comment_id AND issue_id = p_issue_id FOR UPDATE;
    IF p_updated_at_remote IS NOT NULL AND v_comment.updated_at > v_sync.synced_at
       AND p_updated_at_remote < v_comment.updated_at THEN
      RETURN jsonb_build_object('state', 'stale', 'comment_id', v_sync.comment_id);
    END IF;
    IF (p_comment_id IS NOT NULL AND p_comment_id <> v_sync.comment_id)
       OR p_encryption_version < v_comment.encryption_version THEN
      RETURN jsonb_build_object('state', 'conflict', 'comment_id', v_sync.comment_id);
    END IF;
  END IF;

  IF v_sync.comment_id IS NULL THEN
    INSERT INTO public.comments (
      id, issue_id, author_id, body, encryption_version, encrypted_content, created_at, updated_at
    ) VALUES (
      COALESCE(p_comment_id, gen_random_uuid()),
      p_issue_id,
      p_author_id,
      p_body,
      p_encryption_version,
      p_encrypted_content,
      COALESCE(p_created_at_remote, pg_catalog.clock_timestamp()),
      pg_catalog.clock_timestamp()
    ) RETURNING id INTO v_comment_id;
  ELSE
    v_comment_id := v_sync.comment_id;
    UPDATE public.comments
    SET body = p_body, encryption_version = p_encryption_version, encrypted_content = p_encrypted_content,
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_comment_id AND issue_id = p_issue_id;
  END IF;

  INSERT INTO public.github_issue_comment_syncs (
    remote_comment_id, issue_id, comment_id, author_login,
    author_association, html_url, html_url_encryption_version, created_at_remote, updated_at_remote,
    deleted_at_remote, synced_at
  ) VALUES (
    p_remote_comment_id, p_issue_id, v_comment_id, p_author_login,
    p_author_association, p_html_url, p_url_encryption_version, p_created_at_remote, p_updated_at_remote,
    p_deleted_at_remote, pg_catalog.clock_timestamp()
  )
  ON CONFLICT (remote_comment_id, issue_id) DO UPDATE
  SET author_login = EXCLUDED.author_login,
      author_association = EXCLUDED.author_association,
      html_url = EXCLUDED.html_url,
      html_url_encryption_version = EXCLUDED.html_url_encryption_version,
      created_at_remote = EXCLUDED.created_at_remote,
      updated_at_remote = EXCLUDED.updated_at_remote,
      deleted_at_remote = EXCLUDED.deleted_at_remote,
      synced_at = EXCLUDED.synced_at;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'synced', 'comment_id', v_comment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_github_issue_comment_encrypted_url(uuid,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,uuid,integer,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_github_issue_comment_encrypted_url(uuid,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,uuid,integer,text,integer) TO service_role;


COMMIT;
