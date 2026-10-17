-- Live page collaboration (MIN-688).
--
-- 1. Two step streams per page. `body_revision` and `title_revision` count the
--    ProseMirror steps accepted for the body and the title. They are distinct
--    from `version` (body writes, the legacy snapshot CAS) and from
--    `content_revision` (every row update, the shared envelope CAS).
-- 2. `page_collaboration_batches` journals accepted steps so a client can catch
--    up from its revision and rebase its pending steps. Steps can contain text,
--    including deleted text, so a protected page's batches are sealed like its
--    content; only legacy plaintext pages keep plaintext steps.
-- 3. `commit_page_collaboration` advances heads, writes the page projection and
--    journals the batch in ONE transaction, under the page row lock.
-- 4. A safety-net trigger turns any other body or title write into a journal
--    gap: clients behind it receive a fresh snapshot instead of an invalid
--    rebase.
-- 5. A `page-collaboration:<pageId>` presence topic carries editing carets,
--    bound to the page's project membership generation.

ALTER TABLE public.pages
  ADD COLUMN body_revision bigint NOT NULL DEFAULT 0 CHECK (body_revision >= 0),
  ADD COLUMN title_revision bigint NOT NULL DEFAULT 0 CHECK (title_revision >= 0);

CREATE TABLE public.page_collaboration_batches (
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('body', 'title')),
  base_revision bigint NOT NULL CHECK (base_revision >= 0),
  step_count integer NOT NULL CHECK (step_count BETWEEN 1 AND 1000),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  client_id text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 64),
  author_id uuid,
  author_kind text NOT NULL CHECK (author_kind IN ('human', 'agent')),
  author_api_key_id uuid,
  steps jsonb,
  encrypted_content text,
  encryption_version integer NOT NULL DEFAULT 0 CHECK (encryption_version >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, field, base_revision),
  UNIQUE (page_id, batch_id),
  CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL
      AND jsonb_typeof(steps) = 'array')
    OR (encryption_version > 0 AND steps IS NULL AND encrypted_content IS NOT NULL)
  )
);

CREATE INDEX page_collaboration_batches_created_at_idx
  ON public.page_collaboration_batches (created_at);

ALTER TABLE public.page_collaboration_batches ENABLE ROW LEVEL SECURITY;
-- No policy: the journal is read and written by the server authority only,
-- after it has checked live project access.
REVOKE ALL ON TABLE public.page_collaboration_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.page_collaboration_batches TO service_role;

-- The journal holds page text (deleted text included), so it follows the
-- page's protection: once page content protection is active, or for a page
-- that is already sealed, a plaintext batch is refused. The fence shares the
-- page content marker lock, like every protected page write.
CREATE FUNCTION public.guard_page_collaboration_batch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.encryption_version = 0 AND (
       EXISTS (SELECT 1 FROM public.page_content_encryption_scope)
       OR EXISTS (
         SELECT 1 FROM public.pages AS page
         WHERE page.id = NEW.page_id AND page.encryption_version > 0
       )
     ) THEN
    RAISE EXCEPTION 'page_collaboration_requires_encryption' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pages AS page
    WHERE page.id = NEW.page_id AND page.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'page_collaboration_scope_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_page_collaboration_batch() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER a_min591_fence_c92d5d4040f97b81
  BEFORE INSERT OR UPDATE ON public.page_collaboration_batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_encryption_snapshot_write(
    'page_content_encryption_scope', 'global');

CREATE TRIGGER page_collaboration_batches_guard
  BEFORE INSERT OR UPDATE ON public.page_collaboration_batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_page_collaboration_batch();

-- The authority guard. Revisions advance only inside
-- `commit_page_collaboration`; any other writer that changes the body (it
-- bumps `version`, or rewrites a plaintext body) or a plaintext title opens a
-- gap instead, which forces a snapshot reset on clients behind it. A page that
-- becomes sealed loses its plaintext journal rows in the same transaction.
CREATE FUNCTION public.guard_page_collaboration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.encryption_version > 0 AND OLD.encryption_version = 0 THEN
    DELETE FROM public.page_collaboration_batches AS batch
    WHERE batch.page_id = OLD.id
      AND batch.encryption_version = 0;
  END IF;

  IF COALESCE(current_setting('minddy.page_collaboration_commit', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.body_revision IS DISTINCT FROM OLD.body_revision
     OR NEW.title_revision IS DISTINCT FROM OLD.title_revision THEN
    RAISE EXCEPTION 'page_collaboration_revision_immutable' USING ERRCODE = '23514';
  END IF;

  IF NEW.version IS DISTINCT FROM OLD.version
     OR (OLD.encryption_version = 0 AND NEW.encryption_version = 0
         AND NEW.content IS DISTINCT FROM OLD.content) THEN
    NEW.body_revision := OLD.body_revision + 1;
  END IF;
  IF OLD.encryption_version = 0 AND NEW.encryption_version = 0
     AND NEW.title IS DISTINCT FROM OLD.title THEN
    NEW.title_revision := OLD.title_revision + 1;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_page_collaboration() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER pages_b_collaboration_guard
  BEFORE UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.guard_page_collaboration();

-- Accept one or two step batches (body, title) and the page projection they
-- produce, atomically.
--
-- `p_values` carries the new page columns computed by the server authority
-- from the decoded page: plaintext `title`/`content` (and `icon`) on a legacy
-- page, or the re-sealed envelope on a protected one, plus `version` and the
-- author columns when the batch is an authored write. A page update that also
-- moves or pins the page passes `parent_id`, `position` or `favorite` here, so
-- the whole request still commits or fails as one.
--
-- Outcomes: `accepted`; `duplicate` (this batch ID was already accepted);
-- `batch_reused` (same ID, different batch); `behind` (a stream moved: the
-- client catches up and rebases); `retry` (only the shared envelope moved:
-- the server reapplies against the unchanged stream); `missing`.
CREATE FUNCTION public.commit_page_collaboration(
  p_page_id uuid,
  p_expected_content_revision bigint,
  p_values jsonb,
  p_batches jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  page_row public.pages%ROWTYPE;
  batch jsonb;
  batch_field text;
  batch_base bigint;
  batch_count integer;
  head bigint;
  existing record;
  new_body bigint;
  new_title bigint;
BEGIN
  IF jsonb_typeof(p_batches) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_batches) NOT BETWEEN 1 AND 2
     OR jsonb_typeof(p_values) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'page_collaboration_invalid_request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO page_row
  FROM public.pages
  WHERE id = p_page_id
  FOR UPDATE;
  IF NOT FOUND OR page_row.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;

  -- A retried request finds its receipt before any revision comparison: an
  -- accepted batch stays accepted after later writes.
  FOR batch IN SELECT value FROM jsonb_array_elements(p_batches) LOOP
    SELECT b.field, b.base_revision, b.step_count INTO existing
    FROM public.page_collaboration_batches AS b
    WHERE b.page_id = p_page_id
      AND b.batch_id = (batch->>'batch_id')::uuid;
    IF FOUND THEN
      IF existing.field IS DISTINCT FROM batch->>'field'
         OR existing.base_revision IS DISTINCT FROM (batch->>'base_revision')::bigint
         OR existing.step_count IS DISTINCT FROM (batch->>'step_count')::integer THEN
        RETURN jsonb_build_object('status', 'batch_reused');
      END IF;
      RETURN jsonb_build_object('status', 'duplicate',
        'body_revision', page_row.body_revision,
        'title_revision', page_row.title_revision);
    END IF;
  END LOOP;

  new_body := page_row.body_revision;
  new_title := page_row.title_revision;
  FOR batch IN SELECT value FROM jsonb_array_elements(p_batches) LOOP
    batch_field := batch->>'field';
    batch_base := (batch->>'base_revision')::bigint;
    batch_count := (batch->>'step_count')::integer;
    head := CASE batch_field
      WHEN 'body' THEN page_row.body_revision
      WHEN 'title' THEN page_row.title_revision
    END;
    IF head IS NULL OR batch_count IS NULL OR batch_count < 1 THEN
      RAISE EXCEPTION 'page_collaboration_invalid_request' USING ERRCODE = '22023';
    END IF;
    IF head <> batch_base THEN
      RETURN jsonb_build_object('status', 'behind', 'field', batch_field, 'head', head);
    END IF;
    IF batch_field = 'body' THEN
      new_body := batch_base + batch_count;
    ELSE
      new_title := batch_base + batch_count;
    END IF;
  END LOOP;

  IF page_row.content_revision IS DISTINCT FROM p_expected_content_revision THEN
    RETURN jsonb_build_object('status', 'retry');
  END IF;

  PERFORM pg_catalog.set_config('minddy.page_collaboration_commit', 'on', true);
  UPDATE public.pages SET
    title = CASE WHEN p_values ? 'title' THEN p_values->>'title' ELSE title END,
    icon = CASE WHEN p_values ? 'icon' THEN p_values->>'icon' ELSE icon END,
    content = CASE WHEN p_values ? 'content'
      THEN NULLIF(p_values->'content', 'null'::jsonb) ELSE content END,
    database_schema = CASE WHEN p_values ? 'database_schema'
      THEN NULLIF(p_values->'database_schema', 'null'::jsonb) ELSE database_schema END,
    database_title_name = CASE WHEN p_values ? 'database_title_name'
      THEN p_values->>'database_title_name' ELSE database_title_name END,
    property_values = CASE WHEN p_values ? 'property_values'
      THEN NULLIF(p_values->'property_values', 'null'::jsonb) ELSE property_values END,
    search_text = CASE WHEN p_values ? 'search_text'
      THEN p_values->>'search_text' ELSE search_text END,
    encrypted_content = CASE WHEN p_values ? 'encrypted_content'
      THEN p_values->>'encrypted_content' ELSE encrypted_content END,
    encryption_version = CASE WHEN p_values ? 'encryption_version'
      THEN (p_values->>'encryption_version')::integer ELSE encryption_version END,
    page_is_blank = CASE WHEN p_values ? 'page_is_blank'
      THEN (p_values->>'page_is_blank')::boolean ELSE page_is_blank END,
    page_is_database = CASE WHEN p_values ? 'page_is_database'
      THEN (p_values->>'page_is_database')::boolean ELSE page_is_database END,
    page_has_values = CASE WHEN p_values ? 'page_has_values'
      THEN (p_values->>'page_has_values')::boolean ELSE page_has_values END,
    version = CASE WHEN p_values ? 'version'
      THEN (p_values->>'version')::integer ELSE version END,
    updated_by = CASE WHEN p_values ? 'updated_by'
      THEN (p_values->>'updated_by')::uuid ELSE updated_by END,
    updated_kind = CASE WHEN p_values ? 'updated_kind'
      THEN p_values->>'updated_kind' ELSE updated_kind END,
    updated_api_key_id = CASE WHEN p_values ? 'updated_kind'
      THEN NULLIF(p_values->>'updated_api_key_id', '')::uuid ELSE updated_api_key_id END,
    favorite = CASE WHEN p_values ? 'favorite'
      THEN (p_values->>'favorite')::boolean ELSE favorite END,
    parent_id = CASE WHEN p_values ? 'parent_id'
      THEN NULLIF(p_values->>'parent_id', '')::uuid ELSE parent_id END,
    position = CASE WHEN p_values ? 'position'
      THEN p_values->>'position' ELSE position END,
    body_revision = new_body,
    title_revision = new_title
  WHERE id = p_page_id;
  PERFORM pg_catalog.set_config('minddy.page_collaboration_commit', 'off', true);

  -- Journaled AFTER the page update: that update takes the page content
  -- activation lock first, so the protection state checked below is final.
  FOR batch IN SELECT value FROM jsonb_array_elements(p_batches) LOOP
    -- A sealed page (or one sealed by this write) never journals plaintext.
    IF COALESCE((p_values->>'encryption_version')::integer, page_row.encryption_version) > 0
       AND COALESCE((batch->>'encryption_version')::integer, 0) = 0 THEN
      RAISE EXCEPTION 'page_collaboration_plaintext_refused' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.page_collaboration_batches (
      page_id, field, base_revision, step_count, project_id, batch_id,
      client_id, author_id, author_kind, author_api_key_id, steps,
      encrypted_content, encryption_version
    ) VALUES (
      p_page_id,
      batch->>'field',
      (batch->>'base_revision')::bigint,
      (batch->>'step_count')::integer,
      page_row.project_id,
      (batch->>'batch_id')::uuid,
      batch->>'client_id',
      NULLIF(batch->>'author_id', '')::uuid,
      batch->>'author_kind',
      NULLIF(batch->>'author_api_key_id', '')::uuid,
      NULLIF(batch->'steps', 'null'::jsonb),
      batch->>'encrypted_content',
      COALESCE((batch->>'encryption_version')::integer, 0)
    );
  END LOOP;


  -- Bounded retention: keep the last 2,000 revisions of each stream for at
  -- most seven days. The page itself is the snapshot; a client older than the
  -- retained suffix receives a reset instead of a rebase.
  DELETE FROM public.page_collaboration_batches AS b
  WHERE b.page_id = p_page_id
    AND (
      (b.field = 'body' AND b.base_revision + b.step_count <= new_body - 2000)
      OR (b.field = 'title' AND b.base_revision + b.step_count <= new_title - 2000)
      OR b.created_at < pg_catalog.now() - interval '7 days'
    );

  RETURN jsonb_build_object('status', 'accepted',
    'body_revision', new_body,
    'title_revision', new_title);
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_page_collaboration(uuid, bigint, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_page_collaboration(uuid, bigint, jsonb, jsonb)
  TO service_role;

-- Opens a gap on both streams after a content-replacing writer that cannot
-- express its change as steps (a database import into an existing root):
-- connected editors reset to the new snapshot instead of rebasing onto it.
CREATE FUNCTION public.reset_page_collaboration(p_page_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM pg_catalog.set_config('minddy.page_collaboration_commit', 'on', true);
  UPDATE public.pages
  SET body_revision = body_revision + 1,
      title_revision = title_revision + 1
  WHERE id = p_page_id;
  PERFORM pg_catalog.set_config('minddy.page_collaboration_commit', 'off', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_page_collaboration(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_page_collaboration(uuid) TO service_role;

-- Opportunistic cleanup for idle pages, whose journal no commit prunes.
CREATE FUNCTION public.prune_page_collaboration_batches(p_limit integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  removed integer;
BEGIN
  WITH expired AS (
    SELECT b.page_id, b.field, b.base_revision
    FROM public.page_collaboration_batches AS b
    WHERE b.created_at < pg_catalog.now() - interval '7 days'
    ORDER BY b.created_at
    LIMIT GREATEST(1, LEAST(p_limit, 50000))
  )
  DELETE FROM public.page_collaboration_batches AS b
  USING expired
  WHERE b.page_id = expired.page_id
    AND b.field = expired.field
    AND b.base_revision = expired.base_revision;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$function$;

REVOKE ALL ON FUNCTION public.prune_page_collaboration_batches(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_page_collaboration_batches(integer) TO service_role;

-- The caret topic: the four topic functions below are the latest definitions
-- from 20270109200049_drop_code_agent_schema.sql with `page-collaboration`
-- added.

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

-- Carets travel as Presence, which clients publish themselves; only members
-- of the page's project may receive or track it.
DROP POLICY IF EXISTS members_receive_page_collaboration ON realtime.messages;
CREATE POLICY members_receive_page_collaboration ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension = 'presence'
  AND realtime.topic() LIKE 'page-collaboration:%'
  AND EXISTS (
    SELECT 1 FROM public.pages AS page
    WHERE page.id = public.topic_uuid(realtime.topic())
      AND page.deleted_at IS NULL
      AND public.can_access_project(page.project_id)
  )
  AND public.realtime_topic_is_current(realtime.topic())
);

DROP POLICY IF EXISTS members_track_page_collaboration ON realtime.messages;
CREATE POLICY members_track_page_collaboration ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  extension = 'presence'
  AND realtime.topic() LIKE 'page-collaboration:%'
  AND EXISTS (
    SELECT 1 FROM public.pages AS page
    WHERE page.id = public.topic_uuid(realtime.topic())
      AND page.deleted_at IS NULL
      AND public.can_access_project(page.project_id)
  )
  AND public.realtime_topic_is_current(realtime.topic())
);

-- Stream heads wake connected editors through the same content-free page
-- broadcast. A reset that only moves revisions must announce itself too, or a
-- peer that already caught up with the replacing write would never learn it
-- has to reload.
DROP TRIGGER IF EXISTS pages_broadcast_update ON public.pages;
CREATE TRIGGER pages_broadcast_update AFTER UPDATE ON public.pages
  FOR EACH ROW WHEN (OLD.encrypted_content IS DISTINCT FROM NEW.encrypted_content OR
    OLD.title IS DISTINCT FROM NEW.title OR
    OLD.icon IS DISTINCT FROM NEW.icon OR
    OLD.parent_id IS DISTINCT FROM NEW.parent_id OR
    OLD.position IS DISTINCT FROM NEW.position OR
    OLD.favorite IS DISTINCT FROM NEW.favorite OR
    OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR
    OLD.deleted_root_id IS DISTINCT FROM NEW.deleted_root_id OR
    OLD.parent_block_removed IS DISTINCT FROM NEW.parent_block_removed OR
    OLD.content IS DISTINCT FROM NEW.content OR
    OLD.database_schema IS DISTINCT FROM NEW.database_schema OR
    OLD.database_title_name IS DISTINCT FROM NEW.database_title_name OR
    OLD.property_values IS DISTINCT FROM NEW.property_values OR
    OLD.body_revision IS DISTINCT FROM NEW.body_revision OR
    OLD.title_revision IS DISTINCT FROM NEW.title_revision)
  EXECUTE FUNCTION public.broadcast_page_row();
