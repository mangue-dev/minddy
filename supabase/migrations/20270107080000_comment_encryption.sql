-- MIN-591: encrypt comment bodies and page quotes, including AI and forge writers.
BEGIN;
ALTER TABLE public.comments DISABLE TRIGGER comments_broadcast;
ALTER TABLE public.comments DISABLE TRIGGER comments_set_updated_at;
ALTER TABLE public.comments ADD COLUMN project_id uuid;
UPDATE public.comments c SET project_id = COALESCE(
  (SELECT project_id FROM public.issues WHERE id = c.issue_id),
  (SELECT project_id FROM public.objectives WHERE id = c.objective_id),
  (SELECT project_id FROM public.feedback_posts WHERE id = c.feedback_post_id));
ALTER TABLE public.comments ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_issue_project_fk FOREIGN KEY (issue_id, project_id) REFERENCES public.issues(id, project_id) ON DELETE CASCADE,
  ADD CONSTRAINT comments_objective_project_fk FOREIGN KEY (objective_id, project_id) REFERENCES public.objectives(id, project_id) ON DELETE CASCADE,
  ADD CONSTRAINT comments_feedback_project_fk FOREIGN KEY (feedback_post_id, project_id) REFERENCES public.feedback_posts(id, project_id) ON DELETE CASCADE;
ALTER TABLE public.page_comments ADD CONSTRAINT page_comments_page_project_fk
  FOREIGN KEY (page_id, project_id) REFERENCES public.pages(id, project_id) ON DELETE CASCADE;

ALTER TABLE public.comments
  ALTER COLUMN body DROP NOT NULL,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_revision bigint NOT NULL DEFAULT 0 CHECK (encryption_revision >= 0),
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT comments_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND body IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL AND body IS NULL
      AND COALESCE((encrypted_content::jsonb ->> 'keyVersion')::integer = encryption_version, false)));
ALTER TABLE public.page_comments
  ALTER COLUMN body DROP NOT NULL,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_revision bigint NOT NULL DEFAULT 0 CHECK (encryption_revision >= 0),
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT page_comments_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND body IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL AND body IS NULL AND quote IS NULL
      AND COALESCE((encrypted_content::jsonb ->> 'keyVersion')::integer = encryption_version, false)));
CREATE INDEX comments_encryption_queue ON public.comments(encryption_checked_at NULLS FIRST, id);
CREATE INDEX page_comments_encryption_queue ON public.page_comments(encryption_checked_at NULLS FIRST, id);

CREATE FUNCTION public.guard_comment_encryption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'comments' AND NEW.project_id IS NULL THEN
    NEW.project_id := COALESCE(
      (SELECT project_id FROM public.issues WHERE id = NEW.issue_id),
      (SELECT project_id FROM public.objectives WHERE id = NEW.objective_id),
      (SELECT project_id FROM public.feedback_posts WHERE id = NEW.feedback_post_id));
  END IF;
  IF NEW.encryption_version = 0 AND (TG_OP = 'INSERT' OR NEW.body IS DISTINCT FROM OLD.body) AND EXISTS (
    SELECT 1 FROM public.envelope_data_keys WHERE scope_kind = 'project'
      AND scope_id = NEW.project_id AND purpose = 'content'
  ) THEN RAISE EXCEPTION 'comment_requires_encryption' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id
      OR (TG_TABLE_NAME = 'page_comments' AND to_jsonb(NEW)->'page_id' IS DISTINCT FROM to_jsonb(OLD)->'page_id') THEN
      RAISE EXCEPTION 'comment_identity_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.encryption_version < OLD.encryption_version THEN
      RAISE EXCEPTION 'comment_encryption_downgrade' USING ERRCODE = '23514';
    END IF;
    -- Every edit advances CAS, including legacy clients unaware of encryption.
    IF (to_jsonb(NEW) - ARRAY['encryption_checked_at','encryption_revision','updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['encryption_checked_at','encryption_revision','updated_at']) THEN
      NEW.encryption_revision := OLD.encryption_revision + 1;
    ELSE NEW.encryption_revision := OLD.encryption_revision;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER comments_encryption_guard BEFORE INSERT OR UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.guard_comment_encryption();
CREATE TRIGGER page_comments_encryption_guard BEFORE INSERT OR UPDATE ON public.page_comments
  FOR EACH ROW EXECUTE FUNCTION public.guard_comment_encryption();
REVOKE ALL ON FUNCTION public.guard_comment_encryption() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_comment_client_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE editable text[] := ARRAY['body','updated_at','encrypted_content','encryption_version','encryption_revision'];
BEGIN
  IF auth.role() = 'authenticated' AND OLD.via_assistant THEN
    RAISE insufficient_privilege USING MESSAGE = 'Assistant comments are immutable to clients';
  END IF;
  -- The repository folds an existing quote into the same authenticated envelope.
  IF TG_TABLE_NAME = 'page_comments' AND NEW.encryption_version > 0 AND to_jsonb(NEW)->'quote' = 'null'::jsonb THEN
    editable := editable || 'quote'::text;
  END IF;
  IF auth.role() = 'authenticated' AND (to_jsonb(NEW) - editable) IS DISTINCT FROM (to_jsonb(OLD) - editable) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Comment scope and identity fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.set_comment_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_setting('minddy.encryption_maintenance', true) = 'on'
    OR (to_jsonb(NEW) - ARRAY['encryption_checked_at','updated_at']) = (to_jsonb(OLD) - ARRAY['encryption_checked_at','updated_at']) THEN
    NEW.updated_at := OLD.updated_at;
  ELSE NEW.updated_at := clock_timestamp(); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER comments_set_updated_at ON public.comments;
DROP TRIGGER page_comments_set_updated_at ON public.page_comments;
CREATE TRIGGER comments_set_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.set_comment_updated_at();
CREATE TRIGGER page_comments_set_updated_at BEFORE UPDATE ON public.page_comments FOR EACH ROW EXECUTE FUNCTION public.set_comment_updated_at();
REVOKE ALL ON FUNCTION public.set_comment_updated_at() FROM PUBLIC, anon, authenticated;

-- Maintenance must also cover comments on soft-deleted pages. Normal mutations
-- still lock and check the live parent, including during concurrent deletion.
CREATE OR REPLACE FUNCTION public.guard_live_page_comment_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_page_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.page_id ELSE NEW.page_id END;
  v_live boolean;
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND current_setting('minddy.encryption_maintenance', true) = 'on' THEN RETURN NEW; END IF;
  SELECT deleted_at IS NULL INTO v_live FROM public.pages WHERE id = v_page_id FOR UPDATE;
  IF v_live IS DISTINCT FROM true THEN RAISE EXCEPTION 'page_not_live' USING ERRCODE = 'P0001'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- A null replacement records a queue attempt. The service-only CAS preserves
-- user timestamps, which also drive GitHub conflict detection.
CREATE FUNCTION public.migrate_comment_ciphertext(
  p_table text, p_id uuid, p_project_id uuid, p_revision bigint, p_previous_version integer,
  p_encryption_version integer DEFAULT NULL, p_encrypted_content text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer; previous_setting text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  IF p_table NOT IN ('comments','page_comments') OR p_table IS NULL THEN
    RAISE EXCEPTION 'invalid_comment_table' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  IF p_encrypted_content IS NULL AND p_encryption_version IS NULL THEN
    EXECUTE format('UPDATE public.%I SET encryption_checked_at = clock_timestamp() WHERE id = $1 AND project_id = $2 AND encryption_revision = $3 AND encryption_version = $4', p_table)
      USING p_id, p_project_id, p_revision, p_previous_version;
  ELSE
    EXECUTE format('UPDATE public.%I SET body = NULL, %s encrypted_content = $5, encryption_version = $6 WHERE id = $1 AND project_id = $2 AND encryption_revision = $3 AND encryption_version = $4',
      p_table, CASE WHEN p_table = 'page_comments' THEN 'quote = NULL,' ELSE '' END)
      USING p_id, p_project_id, p_revision, p_previous_version, p_encrypted_content, p_encryption_version;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(previous_setting, ''), true);
  RETURN affected = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_comment_ciphertext(text,uuid,uuid,bigint,integer,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_comment_ciphertext(text,uuid,uuid,bigint,integer,integer,text) TO service_role;

CREATE FUNCTION public.broadcast_comment_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row record; previous_row record; pid uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (current_setting('minddy.encryption_maintenance', true) = 'on'
    OR (to_jsonb(NEW) - 'encryption_checked_at') = (to_jsonb(OLD) - 'encryption_checked_at')) THEN RETURN NULL; END IF;
  pid := CASE WHEN TG_OP = 'DELETE' THEN OLD.project_id ELSE NEW.project_id END;
  -- Use records with only routing metadata; private feedback and page quotes
  -- must not be copied into realtime.messages, even before the backfill.
  SELECT NEW.id, NEW.project_id, to_jsonb(NEW)->>'issue_id' AS issue_id,
    to_jsonb(NEW)->>'objective_id' AS objective_id, to_jsonb(NEW)->>'feedback_post_id' AS feedback_post_id,
    to_jsonb(NEW)->>'page_id' AS page_id, NEW.parent_id INTO current_row;
  SELECT OLD.id, OLD.project_id, to_jsonb(OLD)->>'issue_id' AS issue_id,
    to_jsonb(OLD)->>'objective_id' AS objective_id, to_jsonb(OLD)->>'feedback_post_id' AS feedback_post_id,
    to_jsonb(OLD)->>'page_id' AS page_id, OLD.parent_id INTO previous_row;
  PERFORM realtime.broadcast_changes('project:' || pid, TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, current_row, previous_row);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_comment_metadata() FROM PUBLIC, anon, authenticated;
DROP TRIGGER comments_broadcast ON public.comments;
DROP TRIGGER page_comments_broadcast ON public.page_comments;
CREATE TRIGGER comments_broadcast AFTER INSERT OR UPDATE OR DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.broadcast_comment_metadata();
CREATE TRIGGER page_comments_broadcast AFTER INSERT OR UPDATE OR DELETE ON public.page_comments FOR EACH ROW EXECUTE FUNCTION public.broadcast_comment_metadata();

-- Retired comment streams must not retain plaintext through an older server.
-- Other topic families keep their existing generation-aware transport.
CREATE OR REPLACE FUNCTION public.broadcast_private_realtime(p_topic text, p_event text, p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE resolved text;
BEGIN
  IF p_topic LIKE 'numo-comment:%' OR p_topic LIKE 'numo-page-comment:%' THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Comment streams require encrypted snapshots';
  END IF;
  resolved := public.current_realtime_topic(p_topic);
  IF resolved IS NULL OR NULLIF(p_event, '') IS NULL THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Invalid Realtime broadcast';
  END IF;
  PERFORM realtime.send(COALESCE(p_payload, '{}'::jsonb), p_event, resolved, true);
END;
$$;
-- Preserve atomic forge synchronization while binding ciphertext to a stable ID.
DROP FUNCTION public.sync_github_issue_comment_atomic(uuid,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz);
CREATE OR REPLACE FUNCTION public.sync_github_issue_comment_atomic(
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
  p_encrypted_content text DEFAULT NULL
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
     OR p_author_id IS NULL
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
    author_association, html_url, created_at_remote, updated_at_remote,
    deleted_at_remote, synced_at
  ) VALUES (
    p_remote_comment_id, p_issue_id, v_comment_id, p_author_login,
    p_author_association, p_html_url, p_created_at_remote, p_updated_at_remote,
    p_deleted_at_remote, pg_catalog.clock_timestamp()
  )
  ON CONFLICT (remote_comment_id, issue_id) DO UPDATE
  SET author_login = EXCLUDED.author_login,
      author_association = EXCLUDED.author_association,
      html_url = EXCLUDED.html_url,
      created_at_remote = EXCLUDED.created_at_remote,
      updated_at_remote = EXCLUDED.updated_at_remote,
      deleted_at_remote = EXCLUDED.deleted_at_remote,
      synced_at = EXCLUDED.synced_at;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'synced', 'comment_id', v_comment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_github_issue_comment_atomic(uuid,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,uuid,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_github_issue_comment_atomic(uuid,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,uuid,integer,text) TO service_role;
COMMIT;
