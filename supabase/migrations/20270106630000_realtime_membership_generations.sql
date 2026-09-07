-- Rotate project-bound and personal private Realtime topics when access changes.
-- Realtime caches channel authorization for the lifetime of the access token, so
-- changing RLS membership alone cannot revoke an already joined socket.

CREATE TABLE public.project_realtime_generations (
  -- This registry is also a tombstone. Keeping it after project deletion makes
  -- every later reuse of the same UUID advance instead of recreating a topic
  -- generation that an old socket may still have joined.
  project_id uuid PRIMARY KEY,
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0)
);

ALTER TABLE public.project_realtime_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_realtime_generations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_realtime_generations
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.user_realtime_generations (
  -- Auth administrators can recreate a user with an explicit UUID. Preserve a
  -- tombstone so that operation cannot revive a cached personal topic either.
  user_id uuid PRIMARY KEY,
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0)
);

ALTER TABLE public.user_realtime_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_realtime_generations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_realtime_generations
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.project_realtime_generations (project_id)
SELECT id FROM public.projects
ON CONFLICT (project_id) DO NOTHING;

INSERT INTO public.user_realtime_generations (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.initialize_project_realtime_generation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.project_realtime_generations (project_id)
  VALUES (NEW.id)
  ON CONFLICT (project_id) DO UPDATE
  SET generation = public.project_realtime_generations.generation + 1;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_project_realtime_generation()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS projects_initialize_realtime_generation
  ON public.projects;
CREATE TRIGGER projects_initialize_realtime_generation
AFTER INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.initialize_project_realtime_generation();

CREATE OR REPLACE FUNCTION public.initialize_user_realtime_generation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_realtime_generations (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO UPDATE
  SET generation = public.user_realtime_generations.generation + 1;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_user_realtime_generation()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS users_initialize_realtime_generation ON auth.users;
CREATE TRIGGER users_initialize_realtime_generation
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.initialize_user_realtime_generation();

-- A live Numo comment is authorized through exactly one immutable parent
-- scope. Client updates are already body-only, but privileged workers must not
-- move an existing stream between projects while a publisher holds its old
-- topic. New comments must be created in the replacement scope instead.
CREATE OR REPLACE FUNCTION public.freeze_numo_comment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.issue_id IS DISTINCT FROM OLD.issue_id
     OR NEW.objective_id IS DISTINCT FROM OLD.objective_id
     OR NEW.feedback_post_id IS DISTINCT FROM OLD.feedback_post_id THEN
    RAISE insufficient_privilege
      USING MESSAGE = 'Numo comment scope is immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.freeze_numo_comment_scope()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS comments_freeze_numo_realtime_scope
  ON public.comments;
CREATE TRIGGER comments_freeze_numo_realtime_scope
BEFORE UPDATE OF issue_id, objective_id, feedback_post_id ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.freeze_numo_comment_scope();

-- Issues, objectives, pages, and page comments already use freeze_project_id.
-- Feedback posts are the remaining possible parent move for a Numo comment.
DROP TRIGGER IF EXISTS feedback_posts_freeze_project_id
  ON public.feedback_posts;
CREATE TRIGGER feedback_posts_freeze_project_id
BEFORE UPDATE OF project_id ON public.feedback_posts
FOR EACH ROW EXECUTE FUNCTION public.freeze_project_id();

-- Comments and page comments have independent primary-key spaces. Keep their
-- authorization helpers and topic namespaces separate so an equal UUID in the
-- two tables can never select the other table's project scope.
CREATE OR REPLACE FUNCTION public.can_watch_numo_comment(topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  raw_topic text := split_part(topic, ':v:', 1);
  comment_id uuid;
  resolved_project_id uuid;
  comment_row record;
BEGIN
  BEGIN
    comment_id := split_part(raw_topic, ':', 2)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  IF raw_topic <> 'numo-comment:' || comment_id::text THEN
    RETURN false;
  END IF;

  SELECT issue_id, objective_id, feedback_post_id
  INTO comment_row
  FROM public.comments
  WHERE id = comment_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

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

  RETURN COALESCE(public.can_access_project(resolved_project_id), false);
END;
$$;

REVOKE ALL ON FUNCTION public.can_watch_numo_comment(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_watch_numo_comment(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_watch_numo_page_comment(topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  raw_topic text := split_part(topic, ':v:', 1);
  comment_id uuid;
  resolved_project_id uuid;
BEGIN
  BEGIN
    comment_id := split_part(raw_topic, ':', 2)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  IF raw_topic <> 'numo-page-comment:' || comment_id::text THEN
    RETURN false;
  END IF;

  SELECT comment.project_id INTO resolved_project_id
  FROM public.page_comments AS comment
  WHERE comment.id = comment_id;

  RETURN COALESCE(public.can_access_project(resolved_project_id), false);
END;
$$;

REVOKE ALL ON FUNCTION public.can_watch_numo_page_comment(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_watch_numo_page_comment(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_realtime_topic(p_topic text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
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
    WHEN 'agent-run' THEN
      SELECT conversation.project_id
      INTO resolved_project_id
      FROM public.agent_runs AS run
      JOIN public.agent_conversations AS conversation
        ON conversation.id = run.conversation_id
      WHERE run.id = resource_id;
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
      SELECT pg_catalog.md5(
        pg_catalog.string_agg(
          linked.project_id::text || ':' || generation.generation::text,
          ',' ORDER BY linked.project_id
        )
      )
      INTO version_value
      FROM (
        SELECT DISTINCT link.project_id
        FROM public.pull_requests AS pull_request
        JOIN public.project_git_links AS link
          ON link.provider = pull_request.provider
         AND link.repo_full_name = pull_request.repo_full_name
        WHERE pull_request.id = resource_id
      ) AS linked
      JOIN public.project_realtime_generations AS generation
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
$$;

REVOKE ALL ON FUNCTION public.current_realtime_topic(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_realtime_topic(text) TO service_role;

CREATE OR REPLACE FUNCTION public.realtime_topic_is_current(p_topic text)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
RETURN COALESCE(
  p_topic = public.current_realtime_topic(p_topic),
  false
);

REVOKE ALL ON FUNCTION public.realtime_topic_is_current(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.realtime_topic_is_current(text)
  TO authenticated, service_role;

-- Realtime caches the policy result when a private channel joins. Checking the
-- current topic at join time prevents a member from prejoining a predictable
-- future generation and retaining that channel after revocation.
DROP POLICY IF EXISTS members_receive_broadcasts ON realtime.messages;
CREATE POLICY members_receive_broadcasts ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension = 'broadcast' AND (
    (realtime.topic() LIKE 'project:%'
      AND public.can_access_project(public.topic_uuid(realtime.topic()))
      AND public.realtime_topic_is_current(realtime.topic()))
    OR (realtime.topic() LIKE 'user:%'
      AND split_part(realtime.topic(), ':', 2) = (SELECT auth.uid()::text)
      AND public.realtime_topic_is_current(realtime.topic()))
    OR (realtime.topic() LIKE 'agent-run:%'
      AND public.can_watch_agent_run(realtime.topic())
      AND public.realtime_topic_is_current(realtime.topic()))
    OR (realtime.topic() LIKE 'numo-comment:%'
      AND public.can_watch_numo_comment(realtime.topic())
      AND public.realtime_topic_is_current(realtime.topic()))
    OR (realtime.topic() LIKE 'numo-page-comment:%'
      AND public.can_watch_numo_page_comment(realtime.topic())
      AND public.realtime_topic_is_current(realtime.topic()))
    OR (realtime.topic() LIKE 'pull-request:%'
      AND public.can_watch_pull_request(realtime.topic())
      AND public.realtime_topic_is_current(realtime.topic()))
  )
);

DROP POLICY IF EXISTS members_receive_page_presence ON realtime.messages;
CREATE POLICY members_receive_page_presence ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension = 'presence'
  AND realtime.topic() LIKE 'page-presence:%'
  AND public.can_access_project(public.topic_uuid(realtime.topic()))
  AND public.realtime_topic_is_current(realtime.topic())
);

DROP POLICY IF EXISTS members_track_page_presence ON realtime.messages;
CREATE POLICY members_track_page_presence ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  extension = 'presence'
  AND realtime.topic() LIKE 'page-presence:%'
  AND public.can_access_project(public.topic_uuid(realtime.topic()))
  AND public.realtime_topic_is_current(realtime.topic())
);

CREATE OR REPLACE FUNCTION public.resolve_realtime_topic(p_topic text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
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
    WHEN 'agent-run' THEN
      allowed := public.can_watch_agent_run(raw_topic);
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
$$;

REVOKE ALL ON FUNCTION public.resolve_realtime_topic(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_realtime_topic(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.broadcast_private_realtime(
  p_topic text,
  p_event text,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resolved text;
BEGIN
  resolved := public.current_realtime_topic(p_topic);
  IF resolved IS NULL OR NULLIF(p_event, '') IS NULL THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Invalid Realtime broadcast';
  END IF;
  PERFORM realtime.send(
    COALESCE(p_payload, '{}'::jsonb),
    p_event,
    resolved,
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_private_realtime(text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.broadcast_private_realtime(text, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.realtime_topic_project_ids(p_topic text)
RETURNS SETOF uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
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
    WHEN 'agent-run' THEN
      RETURN QUERY
        SELECT conversation.project_id
        FROM public.agent_runs AS run
        JOIN public.agent_conversations AS conversation
          ON conversation.id = run.conversation_id
        WHERE run.id = resource_id;
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
$$;

REVOKE ALL ON FUNCTION public.realtime_topic_project_ids(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.version_realtime_message_topic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
       'agent-run',
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
$$;

REVOKE ALL ON FUNCTION public.version_realtime_message_topic()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS version_project_realtime_message
  ON realtime.messages;
CREATE TRIGGER version_project_realtime_message
BEFORE INSERT ON realtime.messages
FOR EACH ROW EXECUTE FUNCTION public.version_realtime_message_topic();

CREATE OR REPLACE FUNCTION public.rotate_project_realtime_generation(
  p_project_id uuid,
  p_extra_user_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_generation bigint;
  old_topic text;
  affected_user uuid;
  rekey_payload jsonb;
BEGIN
  SELECT generation.generation
  INTO current_generation
  FROM public.project_realtime_generations AS generation
  WHERE generation.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Fail closed if legacy or partially migrated data has no registry row.
    -- Initializers and durable tombstones make this unreachable in steady state.
    RETURN;
  END IF;

  old_topic := 'project:' || p_project_id || ':v:' || pg_catalog.md5(
    p_project_id::text || ':' || current_generation::text
  );
  rekey_payload := jsonb_build_object('projectId', p_project_id);

  -- The project channel reaches currently open project scopes. Personal topics
  -- wake dedicated run/comment/PR channels even when the project is outside the
  -- provider's bounded warm set. Users of another project linked to the same
  -- repository also need the signal because they share pull-request topics.
  BEGIN
    PERFORM realtime.send(rekey_payload, 'rekey', old_topic, true);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  FOR affected_user IN
    WITH related_projects AS (
        SELECT p_project_id AS project_id
        UNION
        SELECT related_link.project_id
        FROM public.project_git_links AS source_link
        JOIN public.project_git_links AS related_link
          ON related_link.provider = source_link.provider
         AND related_link.repo_full_name = source_link.repo_full_name
        WHERE source_link.project_id = p_project_id
          AND source_link.repo_full_name IS NOT NULL
    ), notified_users AS (
        SELECT project.owner_id AS user_id
        FROM public.projects AS project
        JOIN related_projects AS related
          ON related.project_id = project.id
        UNION
        SELECT member.user_id
        FROM public.project_members AS member
        JOIN related_projects AS related
          ON related.project_id = member.project_id
        UNION
        SELECT unnest(COALESCE(p_extra_user_ids, '{}'::uuid[]))
    )
    SELECT user_id
    FROM notified_users
    WHERE user_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM realtime.send(
        rekey_payload,
        'rekey',
        'user:' || affected_user,
        true
      );
    EXCEPTION WHEN OTHERS THEN
      -- Rotation remains mandatory even if one freshness signal cannot be sent.
      NULL;
    END;
  END LOOP;

  UPDATE public.project_realtime_generations
  SET generation = generation + 1
  WHERE project_id = p_project_id;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_project_realtime_generation(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rekey_deleted_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Rotate while the project and its memberships still exist, then retain the
  -- generation row as a tombstone after cascading project data is removed.
  PERFORM public.rotate_project_realtime_generation(
    OLD.id,
    ARRAY[OLD.owner_id]
  );
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_deleted_project()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS projects_rekey_realtime_delete ON public.projects;
CREATE TRIGGER projects_rekey_realtime_delete
BEFORE DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.rekey_deleted_project();

CREATE OR REPLACE FUNCTION public.rekey_project_realtime_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_project_id uuid;
  new_project_id uuid;
  old_user_id uuid;
  new_user_id uuid;
  affected_project_id uuid;
  extra_user_ids uuid[];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_project_id := OLD.project_id;
    old_user_id := OLD.user_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_project_id := NEW.project_id;
    new_user_id := NEW.user_id;
  END IF;

  extra_user_ids := ARRAY[old_user_id, new_user_id];
  FOR affected_project_id IN
    SELECT DISTINCT project_id
    FROM unnest(ARRAY[old_project_id, new_project_id])
      AS affected(project_id)
    WHERE project_id IS NOT NULL
    ORDER BY project_id
  LOOP
    PERFORM public.rotate_project_realtime_generation(
      affected_project_id,
      extra_user_ids
    );
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_project_realtime_membership()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS project_members_rekey_realtime
  ON public.project_members;
CREATE TRIGGER project_members_rekey_realtime
BEFORE INSERT OR UPDATE OR DELETE ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.rekey_project_realtime_membership();

CREATE OR REPLACE FUNCTION public.rekey_project_realtime_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    PERFORM public.rotate_project_realtime_generation(
      NEW.id,
      ARRAY[OLD.owner_id, NEW.owner_id]
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_project_realtime_owner()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS projects_rekey_realtime_owner ON public.projects;
CREATE TRIGGER projects_rekey_realtime_owner
BEFORE UPDATE OF owner_id ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.rekey_project_realtime_owner();

-- Agent-run authorization also depends on conversation visibility and owner.
-- Rotate the containing project before either value changes so a project
-- member's cached channel cannot survive a transition to a private run.
CREATE OR REPLACE FUNCTION public.rekey_agent_conversation_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_project_id uuid;
BEGIN
  IF NEW.project_id IS NOT DISTINCT FROM OLD.project_id
     AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id
     AND NEW.visibility IS NOT DISTINCT FROM OLD.visibility THEN
    RETURN NEW;
  END IF;

  FOR affected_project_id IN
    SELECT DISTINCT project_id
    FROM unnest(ARRAY[OLD.project_id, NEW.project_id])
      AS affected(project_id)
    WHERE project_id IS NOT NULL
    ORDER BY project_id
  LOOP
    PERFORM public.rotate_project_realtime_generation(
      affected_project_id,
      ARRAY[OLD.owner_id, NEW.owner_id]
    );
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_agent_conversation_scope()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS agent_conversations_rekey_realtime_scope
  ON public.agent_conversations;
CREATE TRIGGER agent_conversations_rekey_realtime_scope
BEFORE UPDATE OF project_id, owner_id, visibility
ON public.agent_conversations
FOR EACH ROW EXECUTE FUNCTION public.rekey_agent_conversation_scope();

-- A privileged worker can move a run between conversations. Even when both
-- conversations belong to the same project, their visibility or owner can
-- differ, so rotate before changing the authorization anchor.
CREATE OR REPLACE FUNCTION public.rekey_agent_run_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_project_id uuid;
  old_owner_id uuid;
  new_owner_id uuid;
BEGIN
  IF NEW.project_id IS NOT DISTINCT FROM OLD.project_id
     AND NEW.conversation_id IS NOT DISTINCT FROM OLD.conversation_id THEN
    RETURN NEW;
  END IF;

  SELECT conversation.owner_id
  INTO old_owner_id
  FROM public.agent_conversations AS conversation
  WHERE conversation.id = OLD.conversation_id;
  SELECT conversation.owner_id
  INTO new_owner_id
  FROM public.agent_conversations AS conversation
  WHERE conversation.id = NEW.conversation_id;

  FOR affected_project_id IN
    SELECT DISTINCT project_id
    FROM unnest(ARRAY[OLD.project_id, NEW.project_id])
      AS affected(project_id)
    WHERE project_id IS NOT NULL
    ORDER BY project_id
  LOOP
    PERFORM public.rotate_project_realtime_generation(
      affected_project_id,
      ARRAY[old_owner_id, new_owner_id]
    );
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_agent_run_scope()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS agent_runs_rekey_realtime_scope ON public.agent_runs;
CREATE TRIGGER agent_runs_rekey_realtime_scope
BEFORE UPDATE OF project_id, conversation_id ON public.agent_runs
FOR EACH ROW EXECUTE FUNCTION public.rekey_agent_run_scope();

-- Repository rename reconciliation legitimately changes the authorization
-- anchor of a pull request. Lock every old and new project generation before
-- the row changes, using the same order as publishers. A concurrent publisher
-- then either commits on the old topic first or waits and resolves the new one.
CREATE OR REPLACE FUNCTION public.rekey_pull_request_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_topic text;
BEGIN
  IF NEW.provider IS NOT DISTINCT FROM OLD.provider
     AND NEW.repo_full_name IS NOT DISTINCT FROM OLD.repo_full_name THEN
    RETURN NEW;
  END IF;

  PERFORM generation.project_id
  FROM public.project_realtime_generations AS generation
  JOIN (
    SELECT DISTINCT link.project_id
    FROM public.project_git_links AS link
    WHERE (link.provider = OLD.provider
           AND link.repo_full_name = OLD.repo_full_name)
       OR (link.provider = NEW.provider
           AND link.repo_full_name = NEW.repo_full_name)
  ) AS affected ON affected.project_id = generation.project_id
  ORDER BY generation.project_id
  FOR UPDATE OF generation;

  old_topic := public.current_realtime_topic(
    'pull-request:' || OLD.id
  );
  IF old_topic IS NOT NULL THEN
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('pullRequestId', OLD.id),
        'rekey',
        old_topic,
        true
      );
    EXCEPTION WHEN OTHERS THEN
      -- The topic change remains mandatory when its freshness hint fails.
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_pull_request_scope()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS pull_requests_rekey_realtime_scope
  ON public.pull_requests;
CREATE TRIGGER pull_requests_rekey_realtime_scope
BEFORE UPDATE OF provider, repo_full_name ON public.pull_requests
FOR EACH ROW EXECUTE FUNCTION public.rekey_pull_request_scope();

CREATE OR REPLACE FUNCTION public.rotate_user_realtime_generation(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rotation_setting text := 'minddy.rt_user_' || pg_catalog.md5(p_user_id::text);
  current_generation bigint;
  old_topic text;
  affected_project_id uuid;
BEGIN
  IF p_user_id IS NULL
     OR pg_catalog.current_setting(rotation_setting, true) = '1' THEN
    RETURN;
  END IF;
  PERFORM pg_catalog.set_config(rotation_setting, '1', true);

  -- Rotate project topics first so every still-authorized collaborator receives
  -- a project rekey while this user's old personal topic remains subscribed.
  FOR affected_project_id IN
    SELECT project_id
    FROM (
      SELECT project.id AS project_id
      FROM public.projects AS project
      WHERE project.owner_id = p_user_id
      UNION
      SELECT member.project_id
      FROM public.project_members AS member
      WHERE member.user_id = p_user_id
    ) AS accessible_projects
    ORDER BY project_id
  LOOP
    PERFORM public.rotate_project_realtime_generation(
      affected_project_id,
      ARRAY[p_user_id]
    );
  END LOOP;

  -- Keep one global lock order: project generations first, then the user
  -- generation. Taking the user lock first would invert that order against a
  -- concurrent rotation for a user who shares one of these projects.
  SELECT generation.generation
  INTO current_generation
  FROM public.user_realtime_generations AS generation
  WHERE generation.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  old_topic := 'user:' || p_user_id || ':v:' || pg_catalog.md5(
    p_user_id::text || ':' || current_generation::text
  );

  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('userId', p_user_id),
      'rekey',
      old_topic,
      true
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  UPDATE public.user_realtime_generations
  SET generation = generation + 1
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_user_realtime_generation(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rekey_deleted_auth_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_user_id uuid;
BEGIN
  FOR affected_user_id IN
    SELECT DISTINCT deleted.user_id
    FROM deleted_sessions AS deleted
    JOIN auth.users AS account ON account.id = deleted.user_id
    ORDER BY deleted.user_id
  LOOP
    PERFORM public.rotate_user_realtime_generation(affected_user_id);
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_deleted_auth_sessions()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS auth_sessions_rekey_realtime_delete ON auth.sessions;
CREATE TRIGGER auth_sessions_rekey_realtime_delete
AFTER DELETE ON auth.sessions
REFERENCING OLD TABLE AS deleted_sessions
FOR EACH STATEMENT EXECUTE FUNCTION public.rekey_deleted_auth_sessions();

CREATE OR REPLACE FUNCTION public.rekey_auth_session_authorization_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_user_id uuid;
  authorization_changed boolean :=
    NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.aal IS DISTINCT FROM OLD.aal
    OR NEW.factor_id IS DISTINCT FROM OLD.factor_id
    OR (
      NEW.not_after IS NOT NULL
      AND NEW.not_after <= now()
      AND (OLD.not_after IS NULL OR OLD.not_after > now())
    );
BEGIN
  IF NOT authorization_changed THEN
    RETURN NEW;
  END IF;
  FOR affected_user_id IN
    SELECT DISTINCT user_id
    FROM unnest(ARRAY[OLD.user_id, NEW.user_id]) AS affected(user_id)
    WHERE user_id IS NOT NULL
    ORDER BY user_id
  LOOP
    PERFORM public.rotate_user_realtime_generation(affected_user_id);
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_auth_session_authorization_change()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS auth_sessions_rekey_realtime_expiry ON auth.sessions;
CREATE TRIGGER auth_sessions_rekey_realtime_expiry
AFTER UPDATE OF user_id, aal, factor_id, not_after ON auth.sessions
FOR EACH ROW
EXECUTE FUNCTION public.rekey_auth_session_authorization_change();

CREATE OR REPLACE FUNCTION public.rekey_exhausted_refresh_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_user_id uuid;
  old_session_id uuid;
  new_session_id uuid;
  affected_session_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_session_id := OLD.session_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_session_id := NEW.session_id;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NOT (
      OLD.revoked IS DISTINCT FROM NEW.revoked
      OR OLD.session_id IS DISTINCT FROM NEW.session_id
      OR OLD.user_id IS DISTINCT FROM NEW.user_id
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  FOR affected_session_id IN
    SELECT DISTINCT session_id
    FROM unnest(ARRAY[old_session_id, new_session_id]) AS affected(session_id)
    WHERE session_id IS NOT NULL
    ORDER BY session_id
  LOOP
    SELECT session.user_id
    INTO affected_user_id
    FROM auth.sessions AS session
    WHERE session.id = affected_session_id
      AND NOT EXISTS (
        SELECT 1
        FROM auth.refresh_tokens AS refresh
        WHERE refresh.session_id = session.id
          AND refresh.user_id = session.user_id::text
          AND refresh.revoked IS FALSE
      )
      AND NOT (
        session.refresh_token_hmac_key IS NOT NULL
        AND session.refresh_token_counter IS NOT NULL
      );
    IF FOUND THEN
      PERFORM public.rotate_user_realtime_generation(affected_user_id);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_exhausted_refresh_session()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS auth_refresh_tokens_rekey_realtime
  ON auth.refresh_tokens;
CREATE CONSTRAINT TRIGGER auth_refresh_tokens_rekey_realtime
AFTER UPDATE OR DELETE ON auth.refresh_tokens
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.rekey_exhausted_refresh_session();

CREATE OR REPLACE FUNCTION public.rekey_mfa_factor_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_verified_user_id uuid;
  new_verified_user_id uuid;
  affected_user_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.status::text = 'verified' THEN
    old_verified_user_id := OLD.user_id;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.status::text = 'verified' THEN
    new_verified_user_id := NEW.user_id;
  END IF;
  FOR affected_user_id IN
    SELECT DISTINCT user_id
    FROM unnest(ARRAY[old_verified_user_id, new_verified_user_id])
      AS affected(user_id)
    WHERE user_id IS NOT NULL
    ORDER BY user_id
  LOOP
    PERFORM public.rotate_user_realtime_generation(affected_user_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_mfa_factor_change()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS auth_mfa_factors_rekey_realtime_insert
  ON auth.mfa_factors;
CREATE CONSTRAINT TRIGGER auth_mfa_factors_rekey_realtime_insert
AFTER INSERT ON auth.mfa_factors
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.rekey_mfa_factor_change();

DROP TRIGGER IF EXISTS auth_mfa_factors_rekey_realtime_update
  ON auth.mfa_factors;
CREATE CONSTRAINT TRIGGER auth_mfa_factors_rekey_realtime_update
AFTER UPDATE OF status, user_id ON auth.mfa_factors
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.rekey_mfa_factor_change();

DROP TRIGGER IF EXISTS auth_mfa_factors_rekey_realtime_delete
  ON auth.mfa_factors;
CREATE CONSTRAINT TRIGGER auth_mfa_factors_rekey_realtime_delete
AFTER DELETE ON auth.mfa_factors
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.rekey_mfa_factor_change();

-- A fresh MFA challenge replaces the signed AMR epoch even when the factor and
-- session AAL do not change. Rotate cached sockets so the superseded AAL2 JWT
-- cannot keep receiving after its epoch stops authorizing new requests.
CREATE OR REPLACE FUNCTION public.rekey_mfa_amr_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_session_id uuid;
  new_session_id uuid;
  affected_user_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_session_id := OLD.session_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_session_id := NEW.session_id;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.session_id IS NOT DISTINCT FROM NEW.session_id
     AND OLD.authentication_method IS NOT DISTINCT FROM NEW.authentication_method
     AND OLD.updated_at IS NOT DISTINCT FROM NEW.updated_at THEN
    RETURN NEW;
  END IF;

  FOR affected_user_id IN
    SELECT DISTINCT session.user_id
    FROM auth.sessions AS session
    JOIN unnest(ARRAY[old_session_id, new_session_id])
      AS affected(session_id)
      ON affected.session_id = session.id
    ORDER BY session.user_id
  LOOP
    PERFORM public.rotate_user_realtime_generation(affected_user_id);
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_mfa_amr_change()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS auth_mfa_amr_rekey_realtime
  ON auth.mfa_amr_claims;
CREATE TRIGGER auth_mfa_amr_rekey_realtime
AFTER INSERT OR DELETE OR UPDATE OF session_id, authentication_method, updated_at
ON auth.mfa_amr_claims
FOR EACH ROW EXECUTE FUNCTION public.rekey_mfa_amr_change();

CREATE OR REPLACE FUNCTION public.rekey_auth_user_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  enabled_flag_activated boolean :=
    NOT COALESCE(OLD.raw_app_meta_data @> '{"mfa_enabled":true}'::jsonb, false)
    AND COALESCE(NEW.raw_app_meta_data @> '{"mfa_enabled":true}'::jsonb, false);
  newly_blocked boolean :=
    (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
    OR (
      (OLD.banned_until IS NULL OR OLD.banned_until <= now())
      AND NEW.banned_until > now()
    );
BEGIN
  IF newly_blocked OR (
    enabled_flag_activated
    AND NOT EXISTS (
      SELECT 1
      FROM auth.mfa_factors AS factor
      WHERE factor.user_id = NEW.id
        AND factor.status::text = 'verified'
    )
  ) THEN
    PERFORM public.rotate_user_realtime_generation(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_auth_user_access_change()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS auth_users_rekey_realtime_access ON auth.users;
CREATE TRIGGER auth_users_rekey_realtime_access
AFTER UPDATE OF raw_app_meta_data, banned_until, deleted_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.rekey_auth_user_access_change();

CREATE OR REPLACE FUNCTION public.rekey_deleted_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.rotate_user_realtime_generation(OLD.id);
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_deleted_auth_user()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS auth_users_rekey_realtime_delete ON auth.users;
CREATE TRIGGER auth_users_rekey_realtime_delete
BEFORE DELETE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.rekey_deleted_auth_user();

CREATE OR REPLACE FUNCTION public.rekey_project_git_link_before()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_project_id uuid;
  link_changed boolean := TG_OP = 'DELETE';
BEGIN
  IF TG_OP <> 'DELETE' THEN
    new_project_id := NEW.project_id;
    link_changed := OLD.project_id IS DISTINCT FROM NEW.project_id
      OR OLD.provider IS DISTINCT FROM NEW.provider
      OR OLD.repo_full_name IS DISTINCT FROM NEW.repo_full_name;
  END IF;
  IF link_changed THEN
    -- UPDATE can touch two projects. Prelock both rows in UUID order so two
    -- concurrent link moves cannot acquire their project locks in reverse.
    PERFORM generation.project_id
    FROM public.project_realtime_generations AS generation
    WHERE generation.project_id = OLD.project_id
       OR generation.project_id = new_project_id
    ORDER BY generation.project_id
    FOR UPDATE;
    PERFORM public.rotate_project_realtime_generation(OLD.project_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_project_git_link_before()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS project_git_links_rekey_realtime_before
  ON public.project_git_links;
CREATE TRIGGER project_git_links_rekey_realtime_before
BEFORE UPDATE OR DELETE ON public.project_git_links
FOR EACH ROW EXECUTE FUNCTION public.rekey_project_git_link_before();

CREATE OR REPLACE FUNCTION public.rekey_project_git_link_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  link_changed boolean := TG_OP = 'INSERT';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    link_changed := OLD.project_id IS DISTINCT FROM NEW.project_id
      OR OLD.provider IS DISTINCT FROM NEW.provider
      OR OLD.repo_full_name IS DISTINCT FROM NEW.repo_full_name;
  END IF;
  IF link_changed THEN
    PERFORM public.rotate_project_realtime_generation(NEW.project_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.rekey_project_git_link_after()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS project_git_links_rekey_realtime_after
  ON public.project_git_links;
CREATE TRIGGER project_git_links_rekey_realtime_after
AFTER INSERT OR UPDATE ON public.project_git_links
FOR EACH ROW EXECUTE FUNCTION public.rekey_project_git_link_after();
