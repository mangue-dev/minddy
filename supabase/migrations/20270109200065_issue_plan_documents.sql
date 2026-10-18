-- MIN-728: an issue's plan is a live document, like its description.
--
-- The plan is edited in the shared editor directly, with live collaboration:
-- a second `rich_documents` stream of the issue, of kind `plan`, whose
-- Markdown projection is `issues.plan`. Its row id is derived from the issue's
-- id by the repository (lib/server/rich-documents.ts), since the description
-- stream already uses the issue's id. Everything else is the description
-- stream's: commits, journal, materialization claim, head wake-ups.
--
-- Carets travel on the private `plan-collaboration:<issue id>` topic, bound to
-- the issue's project membership generation like `issue-collaboration`. The
-- four topic functions below are the latest definitions, from
-- 20270109200063_description_collaboration.sql, with that topic added.

BEGIN;

-- One document of each kind per issue: its description and its plan.
ALTER TABLE public.rich_documents DROP CONSTRAINT rich_documents_issue_id_key;
ALTER TABLE public.rich_documents
  ADD CONSTRAINT rich_documents_issue_kind_key UNIQUE (issue_id, kind);

ALTER TABLE public.rich_documents DROP CONSTRAINT rich_documents_kind_check;
ALTER TABLE public.rich_documents ADD CONSTRAINT rich_documents_kind_check
  CHECK (kind IN ('issue', 'objective', 'plan', 'notebook'));

ALTER TABLE public.rich_documents DROP CONSTRAINT rich_documents_owner;
ALTER TABLE public.rich_documents ADD CONSTRAINT rich_documents_owner CHECK (
  num_nonnulls(issue_id, objective_id, user_id) = 1
  AND (kind NOT IN ('issue', 'plan') OR issue_id IS NOT NULL)
  AND (kind <> 'objective' OR objective_id IS NOT NULL)
  AND (kind <> 'notebook' OR user_id IS NOT NULL)
  AND ((kind = 'notebook') = (project_id IS NULL)));

CREATE OR REPLACE FUNCTION public.guard_rich_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE parent_project uuid; parent_version integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.issue_id IS DISTINCT FROM OLD.issue_id
      OR NEW.objective_id IS DISTINCT FROM OLD.objective_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'rich_document_owner_is_immutable' USING ERRCODE = '23514';
  END IF;
  CASE NEW.kind
    WHEN 'issue', 'plan' THEN
      SELECT project_id, encryption_version INTO parent_project, parent_version
        FROM public.issues WHERE id = NEW.issue_id;
    WHEN 'objective' THEN
      SELECT project_id, encryption_version INTO parent_project, parent_version
        FROM public.objectives WHERE id = NEW.objective_id;
    ELSE
      SELECT NULL::uuid, encryption_version INTO parent_project, parent_version
        FROM public.user_scratchpad WHERE user_id = NEW.user_id;
  END CASE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rich_document_parent_missing' USING ERRCODE = '23503';
  END IF;
  IF NEW.kind <> 'notebook' AND parent_project IS NULL THEN
    RAISE EXCEPTION 'rich_document_parent_without_project' USING ERRCODE = '23514';
  END IF;
  NEW.project_id := parent_project;
  IF NEW.encryption_version = 0 AND COALESCE(parent_version, 0) > 0 THEN
    RAISE EXCEPTION 'rich_document_requires_encryption' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.encryption_version > 0 AND NEW.encryption_version = 0 THEN
    RAISE EXCEPTION 'rich_document_encryption_downgrade' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_rich_document() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.purge_clear_rich_documents(p_limit integer DEFAULT 200)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE removed integer;
BEGIN
  WITH doomed AS (
    SELECT d.id FROM public.rich_documents d
    LEFT JOIN public.issues i ON d.kind IN ('issue', 'plan') AND i.id = d.issue_id
    LEFT JOIN public.objectives o ON d.kind = 'objective' AND o.id = d.objective_id
    LEFT JOIN public.user_scratchpad s ON d.kind = 'notebook' AND s.user_id = d.user_id
    WHERE d.encryption_version = 0
      AND COALESCE(i.encryption_version, o.encryption_version, s.encryption_version, 0) > 0
    ORDER BY d.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000)
  )
  DELETE FROM public.rich_documents WHERE id IN (SELECT id FROM doomed);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_clear_rich_documents(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_clear_rich_documents(integer) TO service_role;

-- The caret topic.

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
    WHEN 'plan-collaboration' THEN
      -- A live plan's caret channel: the issue's, like its description.
      SELECT issue.project_id INTO resolved_project_id
      FROM public.issues AS issue
      WHERE issue.id = resource_id
        AND issue.deleted_at IS NULL;
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
    WHEN 'issue-collaboration', 'plan-collaboration' THEN
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
       'plan-collaboration',
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
    WHEN 'issue-collaboration', 'plan-collaboration' THEN
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

DROP POLICY members_receive_description_carets ON realtime.messages;
CREATE POLICY members_receive_description_carets ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension = 'broadcast'
  AND (
    ((realtime.topic() LIKE 'issue-collaboration:%' OR realtime.topic() LIKE 'plan-collaboration:%')
      AND EXISTS (
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

DROP POLICY members_send_description_carets ON realtime.messages;
CREATE POLICY members_send_description_carets ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  extension = 'broadcast'
  AND (
    ((realtime.topic() LIKE 'issue-collaboration:%' OR realtime.topic() LIKE 'plan-collaboration:%')
      AND EXISTS (
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
