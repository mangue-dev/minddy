-- MIN-728: live collaboration on issue and objective descriptions.
--
-- Descriptions are edited with the page editor engine, and the editor's
-- document lives in `rich_documents` (20270109200062). This migration makes
-- that row a step stream like a page body (MIN-688), with a simpler authority:
--
-- - `content` is the document at the stream head, `revision` counts the
--   accepted steps. Every batch is applied by the server and COMMITTED with
--   the new head in one statement (`commit_rich_document`), under the
--   revision CAS: a session based on an older revision is told `behind`,
--   catches up and rebases, as prosemirror-collab expects. Descriptions are
--   short, so re-sealing the document per batch is cheap, and no journal-only
--   append or deferred document write is needed.
-- - The parent's Markdown (`issues.description`, `objectives.description`) is
--   what every other reader uses. It is MATERIALIZED from the head a couple of
--   seconds after typing stops, through the ordinary issue and objective
--   writers, and `materialized_revision` says which revision it reflects.
--   `materialized_hash` fingerprints that Markdown, so a writer that changed
--   it without the authority (the forge sync) is noticed and folded in.
-- - `rich_document_batches` journals the accepted steps for catch-up and for
--   rebasing server-side edits. Steps can carry text, so a protected
--   document's batches are sealed with its project key.
-- - Each head move broadcasts a content-free `rich_document_heads` event on
--   the project topic; carets travel as client Broadcast on the private
--   `issue-collaboration:<id>` and `objective-collaboration:<id>` topics,
--   bound to the parent's project membership generation like page carets.

BEGIN;

ALTER TABLE public.rich_documents
  ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ADD COLUMN materialized_revision bigint NOT NULL DEFAULT 0 CHECK (materialized_revision >= 0),
  ADD COLUMN materialized_hash text CHECK (materialized_hash IS NULL OR materialized_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN pending_since timestamp with time zone;

CREATE INDEX idx_rich_documents_pending ON public.rich_documents (pending_since)
  WHERE pending_since IS NOT NULL;

CREATE TABLE public.rich_document_batches (
  document_id uuid NOT NULL REFERENCES public.rich_documents(id) ON DELETE CASCADE,
  base_revision bigint NOT NULL CHECK (base_revision >= 0),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  step_count integer NOT NULL CHECK (step_count BETWEEN 1 AND 20000),
  batch_id uuid NOT NULL,
  client_id text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 80),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  steps jsonb,
  encrypted_content jsonb,
  encryption_version integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, base_revision),
  UNIQUE (document_id, batch_id),
  CONSTRAINT rich_document_batches_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND jsonb_typeof(steps) = 'array')
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL AND steps IS NULL))
);

ALTER TABLE public.rich_document_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rich_document_batches FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rich_document_batches TO service_role;

-- One batch, committed with the new head under the revision CAS. The receipt
-- lookup comes first, so a retry of a batch whose answer was lost is
-- acknowledged again. A non-null `p_materialized_hash` means the caller also
-- wrote the parent's Markdown for the new head in the same request.
CREATE FUNCTION public.commit_rich_document(
  p_id uuid,
  p_base bigint,
  p_content jsonb,
  p_encrypted_content jsonb,
  p_encryption_version integer,
  p_batch jsonb,
  p_materialized_hash text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  document record;
  receipt record;
  batch_steps integer := COALESCE((p_batch ->> 'step_count')::integer, 0);
  batch_version integer := COALESCE((p_batch ->> 'encryption_version')::integer, 0);
  next_revision bigint;
BEGIN
  SELECT id, kind, project_id, revision, encryption_version INTO document
  FROM public.rich_documents WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF document.kind = 'notebook' THEN
    RAISE EXCEPTION 'rich_document_not_collaborative' USING ERRCODE = '23514';
  END IF;
  SELECT base_revision, step_count AS steps INTO receipt
  FROM public.rich_document_batches
  WHERE document_id = p_id AND batch_id = (p_batch ->> 'batch_id')::uuid;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'duplicate',
      'revision', receipt.base_revision + receipt.steps);
  END IF;
  IF document.revision <> p_base THEN
    RETURN jsonb_build_object('status', 'behind', 'head', document.revision);
  END IF;
  IF batch_steps < 1 THEN
    RAISE EXCEPTION 'rich_document_batch_empty' USING ERRCODE = '22023';
  END IF;
  -- A sealed document never journals clear steps.
  IF (p_encryption_version > 0 OR document.encryption_version > 0) AND batch_version = 0 THEN
    RAISE EXCEPTION 'rich_document_batch_requires_encryption' USING ERRCODE = '23514';
  END IF;
  next_revision := p_base + batch_steps;

  UPDATE public.rich_documents SET
    content = p_content,
    encrypted_content = p_encrypted_content,
    encryption_version = p_encryption_version,
    revision = next_revision,
    materialized_revision = CASE WHEN p_materialized_hash IS NULL
      THEN materialized_revision ELSE next_revision END,
    materialized_hash = COALESCE(p_materialized_hash, materialized_hash),
    pending_since = CASE WHEN p_materialized_hash IS NULL
      THEN COALESCE(pending_since, now()) ELSE NULL END
  WHERE id = p_id;

  INSERT INTO public.rich_document_batches (
    document_id, base_revision, project_id, step_count, batch_id, client_id,
    author_id, steps, encrypted_content, encryption_version)
  VALUES (
    p_id, p_base, document.project_id, batch_steps, (p_batch ->> 'batch_id')::uuid,
    p_batch ->> 'client_id', NULLIF(p_batch ->> 'author_id', '')::uuid,
    CASE WHEN batch_version = 0 THEN p_batch -> 'steps' END,
    CASE WHEN batch_version > 0 THEN p_batch -> 'encrypted_content' END,
    batch_version);

  -- A bounded suffix: catch-up past it answers with a fresh snapshot.
  DELETE FROM public.rich_document_batches
  WHERE document_id = p_id
    AND (base_revision + step_count <= next_revision - 2000
      OR created_at < now() - interval '7 days' AND base_revision + step_count < next_revision);

  RETURN jsonb_build_object('status', 'accepted', 'revision', next_revision);
END;
$$;
REVOKE ALL ON FUNCTION public.commit_rich_document(uuid, bigint, jsonb, jsonb, integer, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_rich_document(uuid, bigint, jsonb, jsonb, integer, jsonb, text)
  TO service_role;

-- The parent's Markdown now reflects `p_revision`.
CREATE FUNCTION public.mark_rich_document_materialized(p_id uuid, p_revision bigint, p_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.rich_documents SET
    materialized_revision = GREATEST(materialized_revision, p_revision),
    materialized_hash = CASE WHEN p_revision >= materialized_revision
      THEN p_hash ELSE materialized_hash END,
    pending_since = CASE WHEN revision <= p_revision THEN NULL ELSE pending_since END
  WHERE id = p_id AND revision >= p_revision;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_rich_document_materialized(uuid, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_rich_document_materialized(uuid, bigint, text)
  TO service_role;

-- A head move wakes connected editors: a content-free event on the project topic.
CREATE FUNCTION public.broadcast_rich_document_head()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM realtime.send(pg_catalog.jsonb_build_object(
    'operation', TG_OP,
    'table', 'rich_document_heads',
    'schema', TG_TABLE_SCHEMA,
    'record', pg_catalog.jsonb_build_object(
      'kind', NEW.kind, 'document_id', NEW.id, 'revision', NEW.revision),
    'old_record', pg_catalog.jsonb_build_object(
      'kind', OLD.kind, 'document_id', OLD.id, 'revision', OLD.revision)),
    TG_OP, 'project:' || NEW.project_id, true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.broadcast_rich_document_head() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER rich_documents_head_broadcast
  AFTER UPDATE ON public.rich_documents
  FOR EACH ROW WHEN (OLD.revision IS DISTINCT FROM NEW.revision AND NEW.project_id IS NOT NULL)
  EXECUTE FUNCTION public.broadcast_rich_document_head();

-- The caret topics: the four topic functions below are the latest definitions
-- from 20270109200054_page_collaboration.sql with `issue-collaboration` and
-- `objective-collaboration` added.

CREATE OR REPLACE FUNCTION public.current_realtime_topic(p_topic text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  raw_topic text := split_part(p_topic, ':v:', 1);
  topic_kind text := split_part(raw_topic, ':', 1);
  resource_id uuid;
  resolved_project_id uuid;
  version_value text;
  comment_row record;
BEGIN
  IF p_topic IS NULL OR raw_topic = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    resource_id := split_part(raw_topic, ':', 2)::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  -- Accept one canonical logical resource only. This prevents authorized users
  -- from minting unlimited aliases such as `project:<uuid>:arbitrary`.
  IF raw_topic <> topic_kind || ':' || resource_id::text THEN
    RETURN NULL;
  END IF;

  IF topic_kind = 'user' THEN
    SELECT pg_catalog.md5(
      resource_id::text || ':' || generation.generation::text
    )
    INTO version_value
    FROM public.user_realtime_generations AS generation
    JOIN auth.users AS account ON account.id = generation.user_id
    WHERE generation.user_id = resource_id;
    IF version_value IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN raw_topic || ':v:' || version_value;
  END IF;

  CASE topic_kind
    WHEN 'project' THEN
      resolved_project_id := resource_id;
    WHEN 'page-presence' THEN
      resolved_project_id := resource_id;
    WHEN 'page-collaboration' THEN
      -- A live page's editing caret channel: bound to the page's project, and
      -- gone once the page is trashed or destroyed.
      SELECT page.project_id INTO resolved_project_id
      FROM public.pages AS page
      WHERE page.id = resource_id
        AND page.deleted_at IS NULL;
    WHEN 'issue-collaboration' THEN
      -- A live description's caret channel (MIN-728): bound to the issue's
      -- project, and gone once the issue is trashed or destroyed.
      SELECT issue.project_id INTO resolved_project_id
      FROM public.issues AS issue
      WHERE issue.id = resource_id
        AND issue.deleted_at IS NULL;
    WHEN 'objective-collaboration' THEN
      SELECT objective.project_id INTO resolved_project_id
      FROM public.objectives AS objective
      WHERE objective.id = resource_id
        AND objective.deleted_at IS NULL;
    WHEN 'numo-comment' THEN
      SELECT issue_id, objective_id, feedback_post_id
      INTO comment_row
      FROM public.comments
      WHERE id = resource_id;

      IF FOUND THEN
        IF comment_row.issue_id IS NOT NULL THEN
          SELECT issue.project_id INTO resolved_project_id
          FROM public.issues AS issue
          WHERE issue.id = comment_row.issue_id;
        ELSIF comment_row.objective_id IS NOT NULL THEN
          SELECT objective.project_id INTO resolved_project_id
          FROM public.objectives AS objective
          WHERE objective.id = comment_row.objective_id;
        ELSIF comment_row.feedback_post_id IS NOT NULL THEN
          SELECT post.project_id INTO resolved_project_id
          FROM public.feedback_posts AS post
          WHERE post.id = comment_row.feedback_post_id;
        END IF;
      END IF;
    WHEN 'numo-page-comment' THEN
      SELECT page_comment.project_id INTO resolved_project_id
      FROM public.page_comments AS page_comment
      WHERE page_comment.id = resource_id;
    WHEN 'pull-request' THEN
      SELECT CASE
        WHEN pg_catalog.count(*) > 0
         AND pg_catalog.count(generation.project_id) = pg_catalog.count(*)
        THEN pg_catalog.md5(
          pg_catalog.string_agg(
            linked.project_id::text || ':' || generation.generation::text,
            ',' ORDER BY linked.project_id
          )
        )
        ELSE NULL
      END
      INTO version_value
      FROM (
        SELECT DISTINCT link.project_id
        FROM public.pull_requests AS pull_request
        JOIN public.project_git_links AS link
          ON link.provider = pull_request.provider
         AND link.repo_full_name = pull_request.repo_full_name
        WHERE pull_request.id = resource_id
      ) AS linked
      LEFT JOIN public.project_realtime_generations AS generation
        ON generation.project_id = linked.project_id;
    ELSE
      RETURN NULL;
  END CASE;

  IF topic_kind <> 'pull-request' THEN
    -- Bind the topic to both the authorization scope and its generation. A
    -- service-side resource move between two projects at the same numeric
    -- generation must still change the channel name.
    SELECT pg_catalog.md5(
      resolved_project_id::text || ':' || generation.generation::text
    )
    INTO version_value
    FROM public.project_realtime_generations AS generation
    JOIN public.projects AS project ON project.id = generation.project_id
    WHERE generation.project_id = resolved_project_id;
  END IF;

  IF version_value IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw_topic || ':v:' || version_value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.realtime_topic_project_ids(p_topic text)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  raw_topic text := split_part(p_topic, ':v:', 1);
  topic_kind text := split_part(raw_topic, ':', 1);
  resource_id uuid;
  comment_row record;
BEGIN
  BEGIN
    resource_id := split_part(raw_topic, ':', 2)::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
  IF raw_topic <> topic_kind || ':' || resource_id::text THEN
    RETURN;
  END IF;

  CASE topic_kind
    WHEN 'project', 'page-presence' THEN
      RETURN NEXT resource_id;
    WHEN 'numo-comment' THEN
      SELECT issue_id, objective_id, feedback_post_id
      INTO comment_row
      FROM public.comments
      WHERE id = resource_id;
      IF FOUND THEN
        IF comment_row.issue_id IS NOT NULL THEN
          RETURN QUERY SELECT issue.project_id
            FROM public.issues AS issue
            WHERE issue.id = comment_row.issue_id;
        ELSIF comment_row.objective_id IS NOT NULL THEN
          RETURN QUERY SELECT objective.project_id
            FROM public.objectives AS objective
            WHERE objective.id = comment_row.objective_id;
        ELSIF comment_row.feedback_post_id IS NOT NULL THEN
          RETURN QUERY SELECT post.project_id
            FROM public.feedback_posts AS post
            WHERE post.id = comment_row.feedback_post_id;
        END IF;
      END IF;
    WHEN 'page-collaboration' THEN
      RETURN QUERY SELECT page.project_id
        FROM public.pages AS page
        WHERE page.id = resource_id;
    WHEN 'issue-collaboration' THEN
      RETURN QUERY SELECT issue.project_id
        FROM public.issues AS issue
        WHERE issue.id = resource_id;
    WHEN 'objective-collaboration' THEN
      RETURN QUERY SELECT objective.project_id
        FROM public.objectives AS objective
        WHERE objective.id = resource_id;
    WHEN 'numo-page-comment' THEN
      RETURN QUERY SELECT page_comment.project_id
        FROM public.page_comments AS page_comment
        WHERE page_comment.id = resource_id;
    WHEN 'pull-request' THEN
      RETURN QUERY
        SELECT DISTINCT link.project_id
        FROM public.pull_requests AS pull_request
        JOIN public.project_git_links AS link
          ON link.provider = pull_request.provider
         AND link.repo_full_name = pull_request.repo_full_name
        WHERE pull_request.id = resource_id
        ORDER BY link.project_id;
    ELSE
      RETURN;
  END CASE;
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.version_realtime_message_topic()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  topic_kind text := split_part(split_part(NEW.topic, ':v:', 1), ':', 1);
  raw_topic text := split_part(NEW.topic, ':v:', 1);
  topic_before_lock text;
  resolved text;
  resource_id uuid;
  lock_attempt integer;
BEGIN
  IF NEW.private IS DISTINCT FROM true
     OR topic_kind NOT IN (
       'project',
       'page-presence',
       'page-collaboration',
       'issue-collaboration',
       'objective-collaboration',
       'numo-comment',
       'numo-page-comment',
       'pull-request',
       'user'
     ) THEN
    RETURN NEW;
  END IF;

  IF topic_kind = 'user' THEN
    IF NEW.event = 'rekey' THEN
      -- Rekey payloads contain only scope identifiers and are freshness hints.
      -- Do not take another user's generation lock while holding a project
      -- generation lock: concurrent user rotations with partially overlapping
      -- project sets could otherwise deadlock. A racing hint may land on either
      -- personal generation; resume-time resolution is the durable fallback.
      resolved := public.current_realtime_topic(raw_topic);
    ELSE
      BEGIN
        resource_id := split_part(raw_topic, ':', 2)::uuid;
      EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
      END;
      IF raw_topic <> 'user:' || resource_id::text THEN
        RETURN NULL;
      END IF;
      SELECT generation.user_id
      INTO resource_id
      FROM public.user_realtime_generations AS generation
      WHERE generation.user_id = resource_id
      FOR SHARE;
      resolved := public.current_realtime_topic(raw_topic);
    END IF;
  ELSE
    -- A publisher shares the same generation-row lock that revocation updates.
    -- A message already targeting the old generation commits before rotation;
    -- a message arriving during rotation waits and resolves the new generation.
    FOR lock_attempt IN 1..4 LOOP
      topic_before_lock := public.current_realtime_topic(raw_topic);
      IF topic_before_lock IS NULL THEN
        RETURN NULL;
      END IF;
      PERFORM generation.project_id
      FROM public.project_realtime_generations AS generation
      JOIN public.realtime_topic_project_ids(raw_topic) AS project(project_id)
        ON project.project_id = generation.project_id
      ORDER BY generation.project_id
      FOR SHARE OF generation;
      resolved := public.current_realtime_topic(raw_topic);
      EXIT WHEN resolved = topic_before_lock;
    END LOOP;
    IF resolved IS DISTINCT FROM topic_before_lock THEN
      RETURN NULL;
    END IF;
  END IF;

  IF resolved IS NULL THEN
    -- A private project-bound message with no live resource must not fall back
    -- to an unversioned channel.
    RETURN NULL;
  END IF;
  NEW.topic := resolved;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_realtime_topic(p_topic text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  raw_topic text := split_part(p_topic, ':v:', 1);
  topic_kind text := split_part(raw_topic, ':', 1);
  allowed boolean := false;
  resolved text;
BEGIN
  IF NOT public.mfa_aal_ok()
     OR NOT public.auth_session_is_current() THEN
    RAISE insufficient_privilege USING MESSAGE = 'Realtime topic access denied';
  END IF;
  IF p_topic IS DISTINCT FROM raw_topic THEN
    RAISE insufficient_privilege USING MESSAGE = 'Realtime topic access denied';
  END IF;

  CASE topic_kind
    WHEN 'project' THEN
      allowed := public.can_access_project(public.topic_uuid(raw_topic));
    WHEN 'page-presence' THEN
      allowed := public.can_access_project(public.topic_uuid(raw_topic));
    WHEN 'page-collaboration' THEN
      allowed := EXISTS (
        SELECT 1
        FROM public.pages AS page
        WHERE page.id = public.topic_uuid(raw_topic)
          AND page.deleted_at IS NULL
          AND public.can_access_project(page.project_id)
      );
    WHEN 'issue-collaboration' THEN
      allowed := EXISTS (
        SELECT 1
        FROM public.issues AS issue
        WHERE issue.id = public.topic_uuid(raw_topic)
          AND issue.deleted_at IS NULL
          AND public.can_access_project(issue.project_id)
      );
    WHEN 'objective-collaboration' THEN
      allowed := EXISTS (
        SELECT 1
        FROM public.objectives AS objective
        WHERE objective.id = public.topic_uuid(raw_topic)
          AND objective.deleted_at IS NULL
          AND public.can_access_project(objective.project_id)
      );
    WHEN 'numo-comment' THEN
      allowed := public.can_watch_numo_comment(raw_topic);
    WHEN 'numo-page-comment' THEN
      allowed := public.can_watch_numo_page_comment(raw_topic);
    WHEN 'pull-request' THEN
      allowed := public.can_watch_pull_request(raw_topic);
    WHEN 'user' THEN
      allowed := split_part(raw_topic, ':', 2) = (SELECT auth.uid()::text);
    ELSE
      allowed := false;
  END CASE;

  IF NOT COALESCE(allowed, false) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Realtime topic access denied';
  END IF;

  resolved := public.current_realtime_topic(raw_topic);
  IF resolved IS NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'Realtime topic access denied';
  END IF;
  RETURN resolved;
END;
$function$;

CREATE POLICY members_receive_description_carets ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension = 'broadcast'
  AND (
    (realtime.topic() LIKE 'issue-collaboration:%' AND EXISTS (
      SELECT 1 FROM public.issues AS issue
      WHERE issue.id = public.topic_uuid(realtime.topic())
        AND issue.deleted_at IS NULL
        AND public.can_access_project(issue.project_id)))
    OR (realtime.topic() LIKE 'objective-collaboration:%' AND EXISTS (
      SELECT 1 FROM public.objectives AS objective
      WHERE objective.id = public.topic_uuid(realtime.topic())
        AND objective.deleted_at IS NULL
        AND public.can_access_project(objective.project_id)))
  )
  AND public.realtime_topic_is_current(realtime.topic())
);

CREATE POLICY members_send_description_carets ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  extension = 'broadcast'
  AND (
    (realtime.topic() LIKE 'issue-collaboration:%' AND EXISTS (
      SELECT 1 FROM public.issues AS issue
      WHERE issue.id = public.topic_uuid(realtime.topic())
        AND issue.deleted_at IS NULL
        AND public.can_access_project(issue.project_id)))
    OR (realtime.topic() LIKE 'objective-collaboration:%' AND EXISTS (
      SELECT 1 FROM public.objectives AS objective
      WHERE objective.id = public.topic_uuid(realtime.topic())
        AND objective.deleted_at IS NULL
        AND public.can_access_project(objective.project_id)))
  )
  AND public.realtime_topic_is_current(realtime.topic())
);

COMMIT;
