-- MIN-721: drop the retired code-agent schema.
--
-- Numo no longer delegates code work: code-worker runs, sandboxes, native
-- Codex/Claude Code connections, automation chains and the legacy agent
-- conversation history are gone from the application. This migration removes
-- their tables, functions, triggers and the Numo history views' agent branches,
-- and rewrites the live Numo, notification and realtime functions without them.
--
-- Kept: routines (`agent_routines` and its content-encryption scope), the usage
-- budget watermark (`agent_quota_resets`), assistant conversations, pull
-- requests and the AI usage ledger (its `run_id` stays as historical data).
--
-- Destructive: retained agent rows are deleted with their tables. Apply it only
-- after the application release that stops reading them is deployed.

-- 1. Retire data that only the code worker could explain.

-- A turn parked on delegated work can never resume: stop it.
UPDATE public.conversations AS conversation
SET status = 'idle', error_message = NULL, updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM public.numo_assistant_turns AS turn
  WHERE turn.conversation_id = conversation.id AND turn.status = 'waiting_work'
);
UPDATE public.numo_assistant_turns
SET status = 'stopped', checkpoint = '{}'::jsonb, claim_token = NULL,
    claimed_at = NULL, completed_at = COALESCE(completed_at, now()),
    updated_at = now()
WHERE status = 'waiting_work';

-- Worker guards on kept tables.
DROP TRIGGER IF EXISTS worker_parent_message_guard ON public.assistant_messages;
DROP TRIGGER IF EXISTS numo_worker_checkpoint_guard ON public.numo_assistant_turns;
DROP TRIGGER IF EXISTS numo_worker_event_payload_guard ON public.numo_turn_events;
DROP TRIGGER IF EXISTS numo_worker_legacy_event_binding_cleanup ON public.numo_turn_events;
DROP TRIGGER IF EXISTS projects_agent_allocation_delete_guard ON public.projects;
DROP TRIGGER IF EXISTS projects_agent_allocation_restore ON public.projects;
DROP TRIGGER IF EXISTS users_agent_allocation_delete_guard ON auth.users;

-- Worker checkpoints left on finished turns, worker relay events and messages.
UPDATE public.numo_assistant_turns
SET checkpoint = '{}'::jsonb, updated_at = now()
WHERE checkpoint ? 'worker_event'
   OR checkpoint ->> 'phase' IN ('worker_result', 'worker_input_wait', 'worker_wait');
DELETE FROM public.numo_turn_events
WHERE type IN ('worker_completed', 'worker_failed', 'worker_input');
DELETE FROM public.assistant_messages
WHERE worker_content_encryption_version > 0
   OR metadata ?| ARRAY['worker_input', 'worker_steering'];

-- Notifications about agent conversations or delegated work.
DELETE FROM public.notifications
WHERE agent_conversation_id IS NOT NULL
   OR numo_work_id IS NOT NULL
   OR numo_conversation_id IS NOT NULL;

-- Legacy agent identities in the common Numo conversation registry.
DELETE FROM public.numo_conversation_ids WHERE agent_id IS NOT NULL;

-- 2. Policies and views that read agent tables.
DROP POLICY IF EXISTS members_receive_broadcasts ON realtime.messages;
DROP POLICY IF EXISTS numo_identity_select ON public.numo_conversation_ids;
DROP POLICY IF EXISTS assistant_active_conversation_insert ON public.assistant_active_conversation;
DROP POLICY IF EXISTS assistant_active_conversation_update ON public.assistant_active_conversation;

DROP VIEW public.numo_user_conversation_history;
DROP VIEW public.numo_actions;
DROP VIEW public.numo_conversation_history;
DROP VIEW public.numo_messages;
DROP VIEW public.numo_turns;
DROP VIEW public.numo_contexts;
DROP VIEW public.numo_artifacts;
DROP VIEW public.numo_work;
DROP VIEW public.numo_work_origins;

-- 3. Live functions, rewritten without the code worker.

CREATE OR REPLACE FUNCTION public.register_numo_conversation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.numo_conversation_ids (id, assistant_id) VALUES (NEW.id, NEW.id)
    ON CONFLICT (assistant_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notification_targets_match_project(p_notification notifications)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    (
      (p_notification).issue_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.issues AS issue
        WHERE issue.id = (p_notification).issue_id
          AND issue.project_id IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
    AND (
      (p_notification).objective_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.objectives AS objective
        WHERE objective.id = (p_notification).objective_id
          AND objective.project_id
              IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
    AND (
      (p_notification).feedback_post_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.feedback_posts AS post
        WHERE post.id = (p_notification).feedback_post_id
          AND post.project_id IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
    AND (
      (p_notification).routine_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.agent_routines AS routine
        WHERE routine.id = (p_notification).routine_id
          AND routine.project_id IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
    AND (
      (p_notification).page_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.pages AS page
        WHERE page.id = (p_notification).page_id
          AND page.project_id IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
    AND (
      (p_notification).comment_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.comments AS comment_row
        LEFT JOIN public.issues AS comment_issue
          ON comment_issue.id = comment_row.issue_id
        LEFT JOIN public.objectives AS comment_objective
          ON comment_objective.id = comment_row.objective_id
        LEFT JOIN public.feedback_posts AS comment_feedback
          ON comment_feedback.id = comment_row.feedback_post_id
        WHERE comment_row.id = (p_notification).comment_id
          AND CASE
            WHEN comment_row.issue_id IS NOT NULL
              THEN comment_issue.project_id
            WHEN comment_row.objective_id IS NOT NULL
              THEN comment_objective.project_id
            ELSE comment_feedback.project_id
          END IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
    AND (
      (p_notification).pull_request_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.pull_requests AS pull_request
        JOIN public.project_git_links AS project_link
          ON project_link.provider = pull_request.provider
         AND project_link.repo_full_name
             IS NOT DISTINCT FROM pull_request.repo_full_name
        WHERE pull_request.id = (p_notification).pull_request_id
          AND project_link.project_id
              IS NOT DISTINCT FROM (p_notification).project_id
      )
    )
$function$;

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

CREATE OR REPLACE FUNCTION public.recover_stale_numo_turns()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count integer := 0;
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  FOR v_turn IN
    SELECT * FROM public.numo_assistant_turns
    WHERE status IN ('running', 'stopping')
      AND claimed_at < now() - interval '6 minutes'
    ORDER BY claimed_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.numo_assistant_turns
    SET status = CASE
          WHEN v_turn.status = 'stopping' THEN 'stopped'
          ELSE 'retryable'
        END,
        claim_token = NULL,
        claimed_at = NULL,
        completed_at = CASE WHEN v_turn.status = 'stopping' THEN now() END,
        error_message = NULL,
        updated_at = now()
    WHERE id = v_turn.id;
    UPDATE public.conversations
    SET status = CASE
          WHEN v_turn.status = 'stopping' THEN 'idle'
          ELSE 'error'
        END,
        error_message = NULL,
        updated_at = now()
    WHERE id = v_turn.conversation_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.broadcast_private_realtime(p_topic text, p_event text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE resolved text;
BEGIN
  IF p_topic LIKE 'numo-comment:%' OR p_topic LIKE 'numo-page-comment:%' THEN
    RAISE invalid_parameter_value USING
      MESSAGE = 'Comment streams require encrypted snapshots';
  END IF;
  resolved := public.current_realtime_topic(p_topic);
  IF resolved IS NULL OR NULLIF(p_event, '') IS NULL THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Invalid Realtime broadcast';
  END IF;
  PERFORM realtime.send(COALESCE(p_payload, '{}'::jsonb), p_event, resolved, true);
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

CREATE OR REPLACE FUNCTION public.update_numo_conversation(p_id uuid, p_actor uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  identity public.numo_conversation_ids;
  actor uuid := p_actor;
  chat public.conversations;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('title', 'archived', 'pinned', 'read', 'model', 'reasoningLevel', 'title_ciphertext', 'title_encryption_version'))
    OR (p_patch ? 'title' AND jsonb_typeof(p_patch->'title') NOT IN ('string', 'null'))
    OR (length(p_patch->>'title') > 200
      AND p_patch->>'title' NOT LIKE 'mdyn3:%')
    OR ((p_patch ? 'title_ciphertext') <> (p_patch ? 'title_encryption_version'))
    OR (p_patch ? 'title_ciphertext' AND (NOT p_patch ? 'title'
      OR p_patch->>'title' IS NOT NULL
      OR jsonb_typeof(p_patch->'title_ciphertext') <> 'string'
      OR jsonb_typeof(p_patch->'title_encryption_version') <> 'number'))
    OR (p_patch ? 'model' AND jsonb_typeof(p_patch->'model') NOT IN ('string', 'null'))
    OR length(p_patch->>'model') > 300
    OR (p_patch ? 'reasoningLevel' AND jsonb_typeof(p_patch->'reasoningLevel') NOT IN ('string', 'null'))
    OR (p_patch ? 'reasoningLevel' AND p_patch->>'reasoningLevel' IS NOT NULL
      AND p_patch->>'reasoningLevel' NOT IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'))
    OR EXISTS (SELECT 1 FROM jsonb_each(p_patch) e WHERE e.key IN ('archived', 'pinned', 'read') AND jsonb_typeof(e.value) <> 'boolean')
  THEN RAISE EXCEPTION 'Invalid patch' USING ERRCODE = '22023'; END IF;
  SELECT * INTO identity FROM public.numo_conversation_ids WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO chat FROM public.conversations WHERE id = identity.assistant_id FOR UPDATE;
  IF NOT FOUND OR chat.user_id <> actor THEN RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002'; END IF;
  IF p_patch ? 'title_ciphertext' OR p_patch ? 'title_encryption_version' THEN
    RAISE EXCEPTION 'Invalid assistant title patch' USING ERRCODE='22023';
  END IF;
  UPDATE public.conversations SET
    title = CASE WHEN p_patch ? 'title' THEN nullif(btrim(p_patch->>'title'), '') ELSE title END,
    archived_at = CASE WHEN p_patch ? 'archived' THEN CASE WHEN (p_patch->>'archived')::boolean THEN COALESCE(archived_at, now()) END ELSE archived_at END,
    model = CASE WHEN p_patch ? 'model' THEN NULLIF(btrim(p_patch->>'model'), '') ELSE model END,
    reasoning_level = CASE WHEN p_patch ? 'reasoningLevel' THEN NULLIF(p_patch->>'reasoningLevel', '') ELSE reasoning_level END
  WHERE id = chat.id AND (p_patch ? 'title' OR p_patch ? 'archived' OR p_patch ? 'model' OR p_patch ? 'reasoningLevel');
  INSERT INTO public.numo_conversation_state (user_id, conversation_id, pinned_at, last_read_at)
    VALUES (actor, p_id, CASE WHEN p_patch->>'pinned' = 'true' THEN now() END, CASE WHEN p_patch->>'read' = 'true' THEN now() END)
  ON CONFLICT (user_id, conversation_id) DO UPDATE SET
    pinned_at = CASE WHEN p_patch ? 'pinned' THEN CASE WHEN p_patch->>'pinned' = 'true' THEN COALESCE(numo_conversation_state.pinned_at, now()) END ELSE numo_conversation_state.pinned_at END,
    last_read_at = greatest(numo_conversation_state.last_read_at, EXCLUDED.last_read_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_numo_tool_operation(p_turn_id uuid, p_claim_token uuid, p_tool_call_id text, p_success boolean, p_result jsonb, p_model_result jsonb, p_pause boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_updated integer;
BEGIN
  -- Lock the parent before the tool ledger and its encryption fences.
  -- A non-key update lock remains compatible with message foreign-key checks.
  PERFORM 1 FROM public.numo_assistant_turns
    WHERE id = p_turn_id AND claim_token = p_claim_token
      AND status IN ('running', 'stopping')
    FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.numo_tool_operations
  SET status = 'completed', success = p_success, pause = COALESCE(p_pause, false), result = p_result,
      model_result = p_model_result, completed_at = now()
  WHERE turn_id = p_turn_id AND tool_call_id = p_tool_call_id
    AND status = 'started' AND claim_token = p_claim_token
    AND EXISTS (
      SELECT 1 FROM public.numo_assistant_turns
      WHERE id = p_turn_id AND claim_token = p_claim_token
        AND status IN ('running', 'stopping')
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.begin_numo_turn_with_budget(p_conversation_id uuid, p_user_id uuid, p_request_id uuid, p_run_id uuid, p_intent jsonb, p_model text, p_reasoning_level text, p_message_id uuid, p_user_payload_version integer, p_content text, p_context jsonb, p_metadata jsonb, p_usage_since timestamp with time zone, p_budget_cap numeric, p_requested_budget numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
  v_spent numeric;
  v_reserved numeric;
  v_granted numeric;
BEGIN
  IF p_conversation_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL
     OR p_run_id IS NULL OR p_usage_since IS NULL
     OR p_budget_cap IS NULL OR p_budget_cap < 0
     OR p_requested_budget IS NULL OR p_requested_budget <= 0 THEN
    RAISE EXCEPTION 'numo_turn_budget_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || p_conversation_id::text, 516)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE conversation_id = p_conversation_id AND request_id = p_request_id;
  IF v_turn.id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('turn', pg_catalog.to_jsonb(v_turn));
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.numo_assistant_turns
    WHERE conversation_id = p_conversation_id
      AND status IN (
        'queued', 'running', 'stopping', 'retryable', 'reconciling'
      )
  ) THEN
    RAISE EXCEPTION 'conversation_busy' USING ERRCODE = '55000';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 460)
  );
  SELECT COALESCE(SUM(cost), 0) INTO v_spent
  FROM public.ai_usage
  WHERE user_id = p_user_id
    AND created_at >= p_usage_since
    AND key_mode = 'platform';

  SELECT
    COALESCE((
      SELECT SUM(GREATEST(
        turn.managed_budget_usd - COALESCE(usage.spent, 0), 0
      ))
      FROM public.numo_assistant_turns AS turn
      LEFT JOIN LATERAL (
        SELECT SUM(cost) AS spent FROM public.ai_usage
        WHERE numo_turn_id = turn.id AND key_mode = 'platform'
      ) AS usage ON true
      WHERE turn.user_id = p_user_id
        AND turn.status IN (
          'queued', 'running', 'stopping', 'retryable', 'reconciling'
        )
        AND turn.managed_budget_usd IS NOT NULL
    ), 0)
  INTO v_reserved;

  v_granted := LEAST(
    p_requested_budget,
    GREATEST(p_budget_cap - v_spent - v_reserved, 0)
  );
  IF v_granted <= 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'turn', NULL,
      'granted_budget_usd', 0,
      'spent_usd', v_spent,
      'reserved_usd', v_reserved
    );
  END IF;

  INSERT INTO public.numo_assistant_turns (
    conversation_id, user_id, request_id, run_id, intent, model,
    reasoning_level, managed_budget_usd
  ) VALUES (
    p_conversation_id, p_user_id, p_request_id, p_run_id,
    COALESCE(p_intent, '{}'::jsonb), p_model, p_reasoning_level, v_granted
  ) RETURNING * INTO v_turn;
  INSERT INTO public.assistant_messages (
    id, conversation_id, turn_id, role, content, context, metadata, user_payload_version
  ) VALUES (
    p_message_id, p_conversation_id, v_turn.id, 'user', p_content, p_context,
    COALESCE(p_metadata, '{}'::jsonb), p_user_payload_version
  );
  UPDATE public.conversations
  SET status = 'generating', error_message = NULL, updated_at = now()
  WHERE id = p_conversation_id;

  RETURN pg_catalog.jsonb_build_object(
    'turn', pg_catalog.to_jsonb(v_turn),
    'granted_budget_usd', v_granted,
    'spent_usd', v_spent,
    'reserved_usd', v_reserved
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.begin_numo_turn(p_conversation_id uuid, p_user_id uuid, p_request_id uuid, p_run_id uuid, p_intent jsonb, p_model text, p_reasoning_level text, p_message_id uuid, p_user_payload_version integer, p_content text, p_context jsonb, p_metadata jsonb)
 RETURNS numo_assistant_turns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || p_conversation_id::text, 516)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND user_id = p_user_id
  ) THEN RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE conversation_id = p_conversation_id AND request_id = p_request_id;
  IF v_turn.id IS NOT NULL THEN RETURN v_turn; END IF;
  IF EXISTS (
    SELECT 1 FROM public.numo_assistant_turns
    WHERE conversation_id = p_conversation_id
      AND status IN (
        'queued', 'running', 'stopping', 'retryable', 'reconciling'
      )
  ) THEN RAISE EXCEPTION 'conversation_busy' USING ERRCODE = '55000'; END IF;

  INSERT INTO public.numo_assistant_turns (
    conversation_id, user_id, request_id, run_id, intent, model, reasoning_level
  ) VALUES (
    p_conversation_id, p_user_id, p_request_id, p_run_id,
    COALESCE(p_intent, '{}'::jsonb), p_model, p_reasoning_level
  ) RETURNING * INTO v_turn;
  INSERT INTO public.assistant_messages (
    id, conversation_id, turn_id, role, content, context, metadata, user_payload_version
  ) VALUES (
    p_message_id, p_conversation_id, v_turn.id, 'user', p_content, p_context,
    COALESCE(p_metadata, '{}'::jsonb), p_user_payload_version
  );
  UPDATE public.conversations
  SET status = 'generating', error_message = NULL, updated_at = now()
  WHERE id = p_conversation_id;
  RETURN v_turn;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_numo_turn_stop(p_conversation_id uuid, p_user_id uuid)
 RETURNS SETOF numo_assistant_turns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || p_conversation_id::text, 516)
  );
  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id
    AND status IN ('queued', 'running', 'waiting_input', 'retryable', 'reconciling', 'stopping')
  ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  IF v_turn.id IS NULL THEN RETURN; END IF;
  UPDATE public.numo_assistant_turns
  SET status = CASE WHEN v_turn.status IN ('running', 'stopping') THEN 'stopping' ELSE 'stopped' END,
      claim_token = CASE WHEN v_turn.status IN ('running', 'stopping') THEN claim_token END,
      claimed_at = CASE WHEN v_turn.status IN ('running', 'stopping') THEN claimed_at END,
      completed_at = CASE WHEN v_turn.status IN ('running', 'stopping') THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = v_turn.id RETURNING * INTO v_turn;
  UPDATE public.conversations SET
    status = CASE WHEN v_turn.status = 'stopping' THEN 'generating' ELSE 'idle' END,
    error_message = NULL, updated_at = now()
  WHERE id = p_conversation_id;
  RETURN NEXT v_turn;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_ai_capability_assignment(p_user_id uuid, p_capability text, p_key_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_provider text;
  provider_capabilities text[];
begin
  if p_capability is null or p_capability not in ('text', 'transcription', 'embedding') then
    raise exception 'Unsupported model capability' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if p_key_id is null then
    delete from public.user_ai_capability_assignments
    where user_id = p_user_id and capability = p_capability;
  else
    select provider into target_provider
    from public.user_ai_keys
    where id = p_key_id and user_id = p_user_id
    for update;

    if not found then
      raise exception 'BYOK credential not found' using errcode = 'P0002';
    end if;

    provider_capabilities := case target_provider
      when 'openrouter' then array['text', 'transcription', 'embedding']::text[]
      when 'openai' then array['text', 'transcription', 'embedding']::text[]
      when 'google' then array['text', 'embedding']::text[]
      else array['text']::text[]
    end;
    if not (p_capability = any(provider_capabilities)) then
      raise exception 'Provider does not support model capability' using errcode = '23514';
    end if;

    insert into public.user_ai_capability_assignments (user_id, capability, ai_key_id)
    values (p_user_id, p_capability, p_key_id)
    on conflict (user_id, capability) do update
    set ai_key_id = excluded.ai_key_id, updated_at = now();
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_numo_content_attempt(p_kind text, p_id uuid, p_old jsonb, p_call_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE table_name text; attempt_column text; affected integer;
BEGIN
  SELECT mapping.table_name,mapping.attempt_column INTO table_name,attempt_column
  FROM (VALUES
    ('activity','numo_turn_events','payload_user_encryption_attempted_at'),
    ('title','conversations','title_encryption_attempted_at'),
    ('error_conversation','conversations','error_encryption_attempted_at'),
    ('error_turn','numo_assistant_turns','error_encryption_attempted_at'),
    ('error_occurrence','numo_routine_occurrences','error_encryption_attempted_at'),
    ('outcome','numo_assistant_turns','outcome_encryption_attempted_at'),
    ('final_message','assistant_messages','final_payload_attempted_at'),
    ('surface','numo_surface_events','destination_encryption_attempted_at'),
    ('user_message','assistant_messages','user_payload_attempted_at'),
    ('tool_message','assistant_messages','tool_payload_attempted_at'),
    ('tool_checkpoint','numo_assistant_turns','tool_checkpoint_attempted_at'),
    ('tool_operation','numo_tool_operations','encryption_attempted_at')
  ) AS mapping(kind,table_name,attempt_column) WHERE mapping.kind=p_kind;
  IF table_name IS NULL OR p_old IS NULL OR jsonb_typeof(p_old)<>'object' OR
      p_old='{}'::jsonb THEN
    RAISE invalid_parameter_value USING MESSAGE='Invalid Numo attempt marker';
  END IF;
  IF p_kind='tool_operation' THEN
    IF p_call_id IS NULL THEN RAISE invalid_parameter_value; END IF;
    EXECUTE format('UPDATE public.%I AS t SET %I=clock_timestamp() WHERE turn_id=$1 AND tool_call_id=$2 AND to_jsonb(t) @> $3',table_name,attempt_column)
      USING p_id,p_call_id,p_old;
  ELSE
    IF p_call_id IS NOT NULL THEN RAISE invalid_parameter_value; END IF;
    EXECUTE format('UPDATE public.%I AS t SET %I=clock_timestamp() WHERE id=$1 AND to_jsonb(t) @> $2',table_name,attempt_column)
      USING p_id,p_old;
  END IF;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected=1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_agent_backfill_attempt(p_table text, p_id_column text, p_id uuid, p_checked_column text, p_expected jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt_column text := replace(p_checked_column, '_checked_at', '_attempted_at');
  v_prior_maintenance text := current_setting('minddy.encryption_maintenance', true);
  v_row jsonb;
  v_key text;
  v_value jsonb;
  v_required_key text;
  v_conflicted boolean := false;
  v_affected integer;
BEGIN
  IF p_expected IS NULL OR jsonb_typeof(p_expected) <> 'object' OR
      p_expected = '{}'::jsonb OR
      p_expected ->> p_id_column IS DISTINCT FROM p_id::text THEN
    RAISE EXCEPTION 'agent_backfill_attempt_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT required_key INTO v_required_key FROM (VALUES
    ('agent_routines', 'id', 'encryption_checked_at', 'encrypted_content')
  ) AS allowed(table_name, id_column, checked_column, required_key)
  WHERE allowed.table_name = p_table AND allowed.id_column = p_id_column
    AND allowed.checked_column = p_checked_column;
  IF v_required_key IS NULL OR NOT p_expected ? v_required_key THEN
    RAISE EXCEPTION 'agent_backfill_attempt_invalid' USING ERRCODE = '22023';
  END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I AS t WHERE %I = $1 FOR UPDATE',
    p_table, p_id_column) INTO v_row USING p_id;
  IF v_row IS NULL THEN RETURN false; END IF;
  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_expected) LOOP
    IF NOT v_row ? v_key OR v_row -> v_key IS DISTINCT FROM v_value THEN
      v_conflicted := true;
      EXIT;
    END IF;
  END LOOP;
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  EXECUTE format('UPDATE public.%I AS t SET %I = clock_timestamp() '
    || 'WHERE t.%I = $1 AND to_jsonb(t) = $2',
    p_table, v_attempt_column, p_id_column) USING p_id, v_row;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(v_prior_maintenance, ''), true);
  RETURN v_affected = 1 AND NOT v_conflicted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_numo_user_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE payload jsonb; active boolean;
BEGIN
  IF TG_OP='UPDATE' AND (to_jsonb(NEW) - 'user_payload_attempted_at') =
      (to_jsonb(OLD) - 'user_payload_attempted_at') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
      NEW.role IS DISTINCT FROM OLD.role OR NEW.turn_id IS DISTINCT FROM OLD.turn_id) THEN
    RAISE EXCEPTION 'numo_user_message_binding_immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.role <> 'user' THEN
    IF NEW.user_payload_version <> 0 THEN
      RAISE EXCEPTION 'numo_user_message_state_invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-user-message-activation',591));
  active := EXISTS(SELECT 1 FROM public.numo_user_message_scope);
  IF NEW.user_payload_version > 0 THEN
    BEGIN payload := NEW.content::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'numo_user_message_ciphertext_invalid' USING ERRCODE='23514';
    END;
    IF NEW.context IS NOT NULL OR NEW.metadata <> '{}'::jsonb OR
       NEW.tool_calls IS NOT NULL OR NEW.tool_call_id IS NOT NULL OR
       NEW.tool_name IS NOT NULL OR
       COALESCE((payload->>'format')::integer=3,false) IS FALSE OR
       COALESCE((payload->>'keyVersion')::integer=NEW.user_payload_version,false) IS FALSE OR
       (TG_OP='UPDATE' AND NEW.user_payload_version < OLD.user_payload_version) THEN
      RAISE EXCEPTION 'numo_user_message_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.numo_user_message_scope(id) VALUES(true) ON CONFLICT DO NOTHING;
  ELSIF active OR (TG_OP='UPDATE' AND OLD.user_payload_version > 0) THEN
    RAISE EXCEPTION 'numo_user_message_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.migrate_numo_user_message(p_id uuid, p_old_content text, p_old_context jsonb, p_old_metadata jsonb, p_old_tool_calls jsonb, p_old_tool_call_id text, p_old_tool_name text, p_old_version integer, p_new_content text, p_new_version integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE observed public.assistant_messages;
BEGIN
  SELECT * INTO observed FROM public.assistant_messages WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR observed.role <> 'user' OR
      observed.content IS DISTINCT FROM p_old_content OR
      observed.context IS DISTINCT FROM p_old_context OR
      observed.metadata IS DISTINCT FROM p_old_metadata OR
      observed.tool_calls IS DISTINCT FROM p_old_tool_calls OR
      observed.tool_call_id IS DISTINCT FROM p_old_tool_call_id OR
      observed.tool_name IS DISTINCT FROM p_old_tool_name OR
      observed.user_payload_version IS DISTINCT FROM p_old_version THEN RETURN false; END IF;
  UPDATE public.assistant_messages SET content=p_new_content,context=NULL,
    metadata='{}'::jsonb,tool_calls=NULL,tool_call_id=NULL,tool_name=NULL,
    user_payload_version=p_new_version,
    user_payload_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_numo_tool_checkpoint()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE active boolean; payload jsonb; version integer; old_version integer;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.user_id IS DISTINCT FROM OLD.user_id OR
      NEW.conversation_id IS DISTINCT FROM OLD.conversation_id) THEN
    RAISE EXCEPTION 'numo_tool_checkpoint_binding_immutable' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-tool-content-activation',591));
  active := EXISTS(SELECT 1 FROM public.numo_tool_content_scope);
  IF COALESCE(NEW.checkpoint->>'phase','') NOT IN ('model','tools') THEN
    IF NEW.checkpoint ? 'encrypted_payload' OR
       (active AND NOT (
         NEW.checkpoint='{}'::jsonb OR
         NEW.checkpoint->>'phase' IN ('user_wait','done') AND
           NEW.checkpoint - 'phase'='{}'::jsonb)) THEN
      RAISE EXCEPTION 'numo_tool_checkpoint_state_invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.checkpoint ? 'encrypted_payload' THEN
    BEGIN
      payload:=(NEW.checkpoint->>'encrypted_payload')::jsonb;
      version:=(NEW.checkpoint->>'encryption_version')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'numo_tool_checkpoint_ciphertext_invalid' USING ERRCODE='23514';
    END;
    IF jsonb_typeof(NEW.checkpoint)<>'object' OR
       (NEW.checkpoint - ARRAY['phase','encrypted_payload','encryption_version']::text[])<>'{}'::jsonb OR
       COALESCE(version>0,false) IS FALSE OR
       COALESCE((payload->>'format')::integer=3,false) IS FALSE OR
       COALESCE((payload->>'keyVersion')::integer=version,false) IS FALSE THEN
      RAISE EXCEPTION 'numo_tool_checkpoint_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND OLD.checkpoint ? 'encrypted_payload' THEN
      old_version:=(OLD.checkpoint->>'encryption_version')::integer;
      IF version<old_version THEN
        RAISE EXCEPTION 'numo_tool_checkpoint_key_rollback' USING ERRCODE='23514';
      END IF;
    END IF;
    INSERT INTO public.numo_tool_content_scope(id) VALUES(true)
      ON CONFLICT DO NOTHING;
  ELSIF active OR (TG_OP='UPDATE' AND OLD.checkpoint ? 'encrypted_payload') THEN
    RAISE EXCEPTION 'numo_tool_checkpoint_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

-- Signatures that lose their worker argument.
DROP FUNCTION public.complete_numo_tool_operation_protected(uuid, uuid, text, boolean, jsonb, integer, jsonb, integer, uuid, boolean);
DROP FUNCTION public.checkpoint_numo_turn(uuid, uuid, text, jsonb, uuid, text, text, numeric, text);
DROP FUNCTION public.migrate_numo_tool_operation(uuid, text, jsonb, jsonb, jsonb, integer, integer, integer, text, jsonb, jsonb, jsonb, integer, integer, integer, text, uuid);

CREATE FUNCTION public.complete_numo_tool_operation_protected(p_turn_id uuid, p_claim_token uuid, p_tool_call_id text, p_success boolean, p_result jsonb, p_result_version integer, p_model_result jsonb, p_model_result_version integer, p_pause boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE updated integer;
BEGIN
  -- Lock the parent before the tool ledger and its encryption fences.
  -- A non-key update lock remains compatible with message foreign-key checks.
  PERFORM 1 FROM public.numo_assistant_turns
    WHERE id = p_turn_id AND claim_token = p_claim_token
      AND status IN ('running', 'stopping')
    FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.numo_tool_operations SET status='completed',success=p_success,
    pause=COALESCE(p_pause,false),result=p_result,result_version=p_result_version,
    model_result=p_model_result,model_result_version=p_model_result_version,
    completed_at=now()
    WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id
      AND status='started' AND claim_token=p_claim_token
      AND EXISTS(SELECT 1 FROM public.numo_assistant_turns WHERE id=p_turn_id
        AND claim_token=p_claim_token AND status IN ('running','stopping'));
  GET DIAGNOSTICS updated=ROW_COUNT;
  RETURN updated=1;
END;
$function$;
REVOKE ALL ON FUNCTION public.complete_numo_tool_operation_protected(uuid, uuid, text, boolean, jsonb, integer, jsonb, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_numo_tool_operation_protected(uuid, uuid, text, boolean, jsonb, integer, jsonb, integer, boolean) TO service_role;

CREATE FUNCTION public.checkpoint_numo_turn(p_turn_id uuid, p_claim_token uuid, p_status text, p_checkpoint jsonb DEFAULT '{}'::jsonb, p_error_message text DEFAULT NULL::text, p_outcome text DEFAULT NULL::text, p_cost_usd numeric DEFAULT NULL::numeric, p_conversation_error_message text DEFAULT NULL::text)
 RETURNS SETOF numo_assistant_turns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  IF p_status NOT IN ('running','waiting_input','stopped',
      'retryable','reconciling','completed','failed') THEN
    RAISE EXCEPTION 'invalid_turn_status' USING ERRCODE='22023';
  END IF;
  IF p_status IN ('failed','retryable','reconciling') AND
      (p_error_message IS NULL) IS DISTINCT FROM
        (p_conversation_error_message IS NULL) THEN
    RAISE EXCEPTION 'numo_error_copy_mismatch' USING ERRCODE='22023';
  END IF;
  UPDATE public.numo_assistant_turns SET status=p_status,
    checkpoint=COALESCE(p_checkpoint,'{}'::jsonb),
    error_message=p_error_message,outcome=COALESCE(p_outcome,outcome),
    cost_usd=COALESCE(p_cost_usd,cost_usd),
    claim_token=CASE WHEN p_status='running' THEN claim_token END,
    claimed_at=CASE WHEN p_status='running' THEN now() END,
    completed_at=CASE WHEN p_status IN ('completed','failed','stopped') THEN now() ELSE NULL END,
    updated_at=now()
    WHERE id=p_turn_id AND claim_token=p_claim_token AND
      (status='running' OR (status='stopping' AND p_status='stopped'))
    RETURNING * INTO v_turn;
  IF v_turn.id IS NULL THEN RETURN; END IF;
  UPDATE public.conversations SET status=CASE
      WHEN p_status IN ('failed','retryable','reconciling') THEN 'error'
      WHEN p_status IN ('completed','waiting_input','stopped') THEN 'idle'
      ELSE 'generating' END,
    error_message=CASE WHEN p_status IN ('failed','retryable','reconciling')
      THEN p_conversation_error_message ELSE NULL END,updated_at=now()
    WHERE id=v_turn.conversation_id;
  RETURN NEXT v_turn;
END;
$function$;
REVOKE ALL ON FUNCTION public.checkpoint_numo_turn(uuid, uuid, text, jsonb, text, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_numo_turn(uuid, uuid, text, jsonb, text, text, numeric, text) TO service_role;

CREATE FUNCTION public.migrate_numo_tool_operation(p_turn_id uuid, p_tool_call_id text, p_old_arguments jsonb, p_old_result jsonb, p_old_model_result jsonb, p_old_arguments_version integer, p_old_result_version integer, p_old_model_result_version integer, p_old_digest text, p_new_arguments jsonb, p_new_result jsonb, p_new_model_result jsonb, p_new_arguments_version integer, p_new_result_version integer, p_new_model_result_version integer, p_new_digest text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE observed public.numo_tool_operations%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.numo_assistant_turns WHERE id=p_turn_id FOR UPDATE;
  SELECT * INTO observed FROM public.numo_tool_operations
    WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id FOR UPDATE;
  IF NOT FOUND OR observed.arguments IS DISTINCT FROM p_old_arguments OR
      observed.result IS DISTINCT FROM p_old_result OR
      observed.model_result IS DISTINCT FROM p_old_model_result OR
      observed.arguments_version IS DISTINCT FROM p_old_arguments_version OR
      observed.result_version IS DISTINCT FROM p_old_result_version OR
      observed.model_result_version IS DISTINCT FROM p_old_model_result_version OR
      observed.arguments_digest IS DISTINCT FROM p_old_digest THEN RETURN false; END IF;
  UPDATE public.numo_tool_operations SET arguments=p_new_arguments,
    result=p_new_result,model_result=p_new_model_result,
    arguments_version=p_new_arguments_version,result_version=p_new_result_version,
    model_result_version=p_new_model_result_version,
    arguments_digest=p_new_digest,
    encryption_checked_at=clock_timestamp()
    WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.migrate_numo_tool_operation(uuid, text, jsonb, jsonb, jsonb, integer, integer, integer, text, jsonb, jsonb, jsonb, integer, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_numo_tool_operation(uuid, text, jsonb, jsonb, jsonb, integer, integer, integer, text, jsonb, jsonb, jsonb, integer, integer, integer, text) TO service_role;

-- 4. Columns of kept tables that pointed at the code worker.
DROP TRIGGER notifications_validate_target_scope ON public.notifications;
ALTER TABLE public.notifications
  DROP COLUMN agent_conversation_id,
  DROP COLUMN numo_work_id,
  DROP COLUMN numo_conversation_id;

CREATE TRIGGER notifications_validate_target_scope
  BEFORE INSERT OR UPDATE OF user_id, project_id, issue_id, objective_id,
    feedback_post_id, routine_id, page_id, comment_id, pull_request_id
  ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.validate_notification_target_scope();

ALTER TABLE public.numo_conversation_ids DROP COLUMN agent_id;
ALTER TABLE public.numo_conversation_ids ALTER COLUMN assistant_id SET NOT NULL;

ALTER TABLE public.numo_assistant_turns
  DROP CONSTRAINT numo_assistant_turns_work_check,
  DROP CONSTRAINT numo_assistant_turns_status_check,
  DROP COLUMN active_run_id,
  DROP COLUMN worker_checkpoint_revision,
  DROP COLUMN worker_checkpoint_encryption_checked_at,
  DROP COLUMN worker_checkpoint_encryption_attempted_at;
ALTER TABLE public.numo_assistant_turns
  ADD CONSTRAINT numo_assistant_turns_status_check CHECK (status = ANY (ARRAY[
    'queued'::text, 'running'::text, 'waiting_input'::text, 'stopping'::text,
    'stopped'::text, 'retryable'::text, 'reconciling'::text, 'completed'::text,
    'failed'::text]));

ALTER TABLE public.numo_tool_operations DROP COLUMN result_run_id;

ALTER TABLE public.assistant_messages
  DROP CONSTRAINT assistant_worker_content_encryption_state,
  DROP COLUMN worker_content_encryption_version,
  DROP COLUMN worker_content_encryption_checked_at;
-- The user-payload queue lost its worker-content predicate with the column.
CREATE INDEX IF NOT EXISTS assistant_user_payload_queue
  ON public.assistant_messages USING btree (user_payload_checked_at NULLS FIRST, id)
  WHERE (role = 'user'::text);

-- 5. Code-agent functions, tables, then the trigger functions those tables used.

DROP FUNCTION public.acquire_native_agent_connection(uuid,text,text);
DROP FUNCTION public.acquire_native_worker_connection(uuid);
DROP FUNCTION public.activate_agent_branch_prefix();
DROP FUNCTION public.agent_allocation_erasure_complete(text,uuid);
DROP FUNCTION public.agent_allocation_run_authority_current(uuid);
DROP FUNCTION public.agent_journal_legacy_batch_exists(uuid,text,jsonb);
DROP FUNCTION public.attach_agent_sandbox_allocation(uuid);
DROP FUNCTION public.backfill_numo_conversations();
DROP FUNCTION public.begin_agent_account_erasure(uuid);
DROP FUNCTION public.begin_agent_allocation_key_request(uuid);
DROP FUNCTION public.begin_agent_project_erasure(uuid);
DROP FUNCTION public.bind_native_worker_allocation(uuid,uuid,text,bigint,uuid,bigint,uuid);
DROP FUNCTION public.can_watch_agent_run(text);
DROP FUNCTION public.check_native_agent_lease(uuid,uuid,text,bigint,uuid,bigint,boolean);
DROP FUNCTION public.claim_agent_run(uuid);
DROP FUNCTION public.claim_agent_run_rest(uuid);
DROP FUNCTION public.claim_local_agent_run(uuid,uuid,text);
DROP FUNCTION public.claim_native_worker_recovery(uuid,timestamp with time zone,timestamp with time zone,text,text,uuid);
DROP FUNCTION public.commit_native_catalog_profile(uuid,uuid,text,bigint,uuid,bigint,text,text,jsonb);
DROP FUNCTION public.commit_native_login_profile(uuid,uuid,text,bigint,uuid,bigint,text,text);
DROP FUNCTION public.commit_native_worker_profile(uuid,uuid,text,bigint,uuid,bigint,text,text);
DROP FUNCTION public.complete_agent_allocation_cleanup(uuid);
DROP FUNCTION public.confirm_agent_allocation_key_revoked(uuid,text);
DROP FUNCTION public.create_agent_run_with_budget(uuid,timestamp with time zone,numeric,numeric,jsonb);
DROP FUNCTION public.disconnect_native_agent_connection(uuid,text,uuid,bigint);
DROP FUNCTION public.ensure_numo_automation_operation(uuid,integer,text,text,uuid,text,uuid,text,text,jsonb);
DROP FUNCTION public.get_native_worker_allocation(uuid,uuid,text,bigint,uuid,bigint);
DROP FUNCTION public.get_native_worker_connection(uuid,text,boolean);
DROP FUNCTION public.insert_latest_agent_run_message(uuid,uuid,uuid,text,jsonb);
DROP FUNCTION public.lookup_numo_worker_legacy_binding(text,uuid);
DROP FUNCTION public.migrate_agent_artifact_branch(uuid,uuid,text,text,uuid,text,text);
DROP FUNCTION public.migrate_agent_artifact_url(uuid,uuid,text,uuid,text);
DROP FUNCTION public.migrate_agent_chain_codes(uuid,jsonb,text);
DROP FUNCTION public.migrate_agent_checkpoint_ciphertext(uuid,uuid,uuid,jsonb,text,integer,text,integer,boolean);
DROP FUNCTION public.migrate_agent_context_snapshot(uuid,uuid,uuid,jsonb,text,integer,text,integer);
DROP FUNCTION public.migrate_agent_conversation_title_ciphertext(uuid,uuid,text,text,integer,text,integer);
DROP FUNCTION public.migrate_agent_delegation_input(uuid,uuid,uuid,jsonb,jsonb,text,integer,text,integer);
DROP FUNCTION public.migrate_agent_delegation_result(uuid,uuid,jsonb,text,integer,text,integer);
DROP FUNCTION public.migrate_agent_event_ciphertext(uuid,uuid,integer,text,integer);
DROP FUNCTION public.migrate_agent_journal_ciphertext(bigint,uuid,integer,text,text,integer,integer,integer,integer,boolean,jsonb,text,text,text,integer,integer,integer);
DROP FUNCTION public.migrate_agent_launch_ciphertext(uuid,uuid,uuid,integer,text,integer,boolean);
DROP FUNCTION public.migrate_agent_queue_bundle(uuid,uuid,uuid,jsonb,jsonb);
DROP FUNCTION public.migrate_agent_queue_message(uuid,uuid,uuid,text,jsonb,integer,text,integer);
DROP FUNCTION public.migrate_agent_run_base_branch(uuid,uuid,text,text);
DROP FUNCTION public.migrate_agent_run_deployment_url(uuid,uuid,text,text);
DROP FUNCTION public.migrate_agent_run_pr_url(uuid,uuid,text,text);
DROP FUNCTION public.migrate_agent_run_summary(uuid,uuid,text,text,text,text,boolean);
DROP FUNCTION public.migrate_agent_run_verdict(uuid,uuid,jsonb,text,integer,text,integer);
DROP FUNCTION public.migrate_agent_run_work_branch(uuid,uuid,text,text);
DROP FUNCTION public.migrate_agent_standalone_message(uuid,uuid,uuid,text,integer,text,integer);
DROP FUNCTION public.migrate_agent_title_ciphertext(uuid,uuid,uuid,text,text,integer,text,text,integer,text,text,integer);
DROP FUNCTION public.migrate_agent_turn_summary(uuid,uuid,text,text,text,text,boolean);
DROP FUNCTION public.migrate_numo_automation_content(uuid,text,jsonb,text,jsonb,text,jsonb,text,jsonb);
DROP FUNCTION public.migrate_numo_worker_checkpoint(uuid,jsonb,jsonb);
DROP FUNCTION public.migrate_numo_worker_event(uuid,jsonb,jsonb);
DROP FUNCTION public.migrate_orphan_agent_runtime_base_branch(uuid,uuid,text,uuid,text);
DROP FUNCTION public.migrate_orphan_agent_runtime_checkpoint(uuid,uuid,jsonb,text,integer,text,integer,boolean);
DROP FUNCTION public.migrate_orphan_agent_runtime_work_branch(uuid,uuid,text,uuid,text);
DROP FUNCTION public.next_agent_allocation_cleanup_batch(integer);
DROP FUNCTION public.numo_worker_conversation_project(uuid,uuid);
DROP FUNCTION public.numo_worker_payload_verified(jsonb,text,uuid);
DROP FUNCTION public.read_native_agent_connection(uuid,uuid,text,bigint,uuid,bigint,boolean,boolean);
DROP FUNCTION public.record_agent_allocation_key(uuid,text);
DROP FUNCTION public.register_numo_worker_legacy_binding(text,uuid,uuid,text);
DROP FUNCTION public.release_agent_pr_inline_comment(uuid);
DROP FUNCTION public.release_native_agent_connection(uuid,uuid,text,bigint,uuid,bigint);
DROP FUNCTION public.renew_native_worker_connection(uuid,uuid,text,bigint,uuid,bigint);
DROP FUNCTION public.request_numo_worker_stop(uuid);
DROP FUNCTION public.reserve_agent_pr_inline_comment(uuid,integer);
DROP FUNCTION public.reserve_agent_sandbox_allocation(uuid,text);
DROP FUNCTION public.resume_agent_run_with_budget(uuid,uuid,timestamp with time zone,numeric,numeric,timestamp with time zone);
DROP FUNCTION public.resume_latest_agent_run_with_message(uuid,uuid,uuid,uuid,text,jsonb,timestamp with time zone,timestamp with time zone,numeric,numeric);
DROP FUNCTION public.resume_numo_turn_from_worker(uuid,uuid,text,jsonb,jsonb);
DROP FUNCTION public.resume_numo_worker_input(uuid,uuid,uuid,text,uuid,uuid,text,boolean,timestamp with time zone,timestamp with time zone,numeric,numeric);
DROP FUNCTION public.retire_previous_agent_allocations(uuid);
DROP FUNCTION public.retryable_numo_automation_operations(integer);
DROP FUNCTION public.revoke_agent_sandbox_allocation(uuid);
DROP FUNCTION public.revoke_agent_sandbox_allocations(text,uuid);
DROP FUNCTION public.set_agent_run_live_snapshot(uuid,text,text,integer,bigint);
DROP FUNCTION public.settle_agent_sandbox_allocation(uuid);
DROP FUNCTION public.steer_numo_worker(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb);
DROP FUNCTION public.stop_native_worker_connection(uuid,uuid,text,bigint,uuid,bigint);
DROP FUNCTION public.sync_agent_run_pr_url(uuid,timestamp with time zone,text,uuid,text,text);
DROP FUNCTION public.sync_agent_runs_from_pull_request(text,text,integer);
DROP FUNCTION public.upsert_agent_preferences_partial(uuid,jsonb);
DROP FUNCTION public.upsert_agent_preferences_protected(uuid,jsonb,text,boolean);
DROP FUNCTION public.write_native_agent_connection(uuid,uuid,text,bigint,uuid,bigint,boolean,text);

DROP TABLE
  public.agent_account_erasure_fences,
  public.agent_project_erasure_fences,
  public.agent_sandbox_allocations,
  public.agent_session_reads,
  public.native_agent_connections,
  public.native_agent_model_catalogs,
  public.agent_run_live_snapshots,
  public.numo_worker_legacy_bindings,
  public.agent_chains,
  public.agent_runs,
  public.agent_run_events,
  public.agent_run_messages,
  public.agent_run_journal,
  public.agent_run_input_requests,
  public.agent_runtime_sessions,
  public.agent_artifacts,
  public.agent_turns,
  public.agent_messages,
  public.agent_conversations,
  public.agent_conversation_contexts,
  public.agent_conversation_pins,
  public.agent_conversation_reads,
  public.user_agent_preferences,
  public.numo_automation_operations,
  public.numo_automation_content_scope,
  public.agent_base_branch_encryption_scopes,
  public.agent_branch_prefix_scope,
  public.agent_checkpoint_encryption_scopes,
  public.agent_context_encryption_scopes,
  public.agent_delegation_encryption_scopes,
  public.agent_deployment_encryption_scopes,
  public.agent_event_encryption_scopes,
  public.agent_journal_encryption_scopes,
  public.agent_launch_encryption_scopes,
  public.agent_pr_url_encryption_scopes,
  public.agent_result_encryption_scopes,
  public.agent_summary_encryption_scopes,
  public.agent_title_encryption_scopes,
  public.agent_verdict_encryption_scopes,
  public.agent_work_branch_encryption_scopes;

DROP FUNCTION public.broadcast_agent_run_row();
DROP FUNCTION public.cancel_agent_run_input_request();
DROP FUNCTION public.capture_agent_allocation_binding();
DROP FUNCTION public.capture_agent_assistant_message();
DROP FUNCTION public.capture_agent_queue_message();
DROP FUNCTION public.capture_agent_run_input_request();
DROP FUNCTION public.cleanup_agent_run_conversation();
DROP FUNCTION public.cleanup_numo_worker_legacy_event_binding();
DROP FUNCTION public.clear_agent_project_fence_on_restore();
DROP FUNCTION public.clear_agent_run_live_snapshot();
DROP FUNCTION public.create_agent_turn_for_run();
DROP FUNCTION public.ensure_agent_run_conversation();
DROP FUNCTION public.guard_agent_account_erasure();
DROP FUNCTION public.guard_agent_allocation_binding();
DROP FUNCTION public.guard_agent_allocation_parent_deletion();
DROP FUNCTION public.guard_agent_artifact_branch();
DROP FUNCTION public.guard_agent_artifact_url();
DROP FUNCTION public.guard_agent_base_branch_parent_scope();
DROP FUNCTION public.guard_agent_branch_prefix();
DROP FUNCTION public.guard_agent_checkpoint();
DROP FUNCTION public.guard_agent_context_parent_scope();
DROP FUNCTION public.guard_agent_context_snapshot();
DROP FUNCTION public.guard_agent_delegation_input();
DROP FUNCTION public.guard_agent_delegation_result();
DROP FUNCTION public.guard_agent_event_copies();
DROP FUNCTION public.guard_agent_event_encryption();
DROP FUNCTION public.guard_agent_event_parent_scope();
DROP FUNCTION public.guard_agent_initial_prompt_copy();
DROP FUNCTION public.guard_agent_input_answer();
DROP FUNCTION public.guard_agent_journal_encryption();
DROP FUNCTION public.guard_agent_journal_parent_scope();
DROP FUNCTION public.guard_agent_launch_encryption();
DROP FUNCTION public.guard_agent_message_conversation_scope();
DROP FUNCTION public.guard_agent_pr_url_parent_scope();
DROP FUNCTION public.guard_agent_project_allocation_fence();
DROP FUNCTION public.guard_agent_queue_copy();
DROP FUNCTION public.guard_agent_queue_message();
DROP FUNCTION public.guard_agent_queue_parent_scope();
DROP FUNCTION public.guard_agent_run_base_branch();
DROP FUNCTION public.guard_agent_run_deployment_url();
DROP FUNCTION public.guard_agent_run_live_snapshot_scope();
DROP FUNCTION public.guard_agent_run_pr_url();
DROP FUNCTION public.guard_agent_run_summary();
DROP FUNCTION public.guard_agent_run_verdict();
DROP FUNCTION public.guard_agent_run_work_branch();
DROP FUNCTION public.guard_agent_runtime_base_branch();
DROP FUNCTION public.guard_agent_runtime_work_branch();
DROP FUNCTION public.guard_agent_standalone_message();
DROP FUNCTION public.guard_agent_title();
DROP FUNCTION public.guard_agent_turn_summary();
DROP FUNCTION public.guard_agent_work_branch_parent_scope();
DROP FUNCTION public.guard_native_worker_run_contract();
DROP FUNCTION public.guard_numo_automation_content();
DROP FUNCTION public.guard_numo_worker_bound_run_identity();
DROP FUNCTION public.guard_numo_worker_checkpoint();
DROP FUNCTION public.guard_numo_worker_event_payload();
DROP FUNCTION public.guard_worker_parent_message();
DROP FUNCTION public.rekey_agent_run_scope();
DROP FUNCTION public.sync_agent_run_conversation();
DROP FUNCTION public.sync_agent_runtime_from_run();
DROP FUNCTION public.sync_agent_turn_from_run();

-- Agent helpers left without callers.
DROP FUNCTION public.agent_runs_stamp_completed_at();
DROP FUNCTION public.broadcast_agent_chain_row();
DROP FUNCTION public.lock_agent_run_anchor_on_insert();
DROP FUNCTION public.rekey_agent_conversation_scope();
DROP FUNCTION public.reject_new_local_agent_execution();
DROP FUNCTION public.guard_agent_pr_artifact_ref();
DROP FUNCTION public.guard_agent_chain_codes();
DROP FUNCTION public.guard_numo_worker_legacy_binding();
DROP FUNCTION public.agent_chain_pending_event_is_code(jsonb);
DROP FUNCTION public.agent_chain_stop_reason_is_code(text);
DROP FUNCTION public.agent_worker_answer_part(text, text);
DROP FUNCTION public.agent_queue_content_version(text);
DROP FUNCTION public.agent_branch_prefix_version(text);
DROP FUNCTION public.get_agent_quota_usage(timestamp with time zone);
DROP FUNCTION public.lock_live_agent_run_project_access(uuid, uuid, uuid);
DROP FUNCTION public.agent_run_repository_binding_is_current(uuid, uuid, uuid, text, text);
DROP FUNCTION public.mark_numo_worker_payload_attempt(text, uuid, jsonb, boolean);
DROP FUNCTION public.valid_native_model_preferences(jsonb);

-- 6. Numo history views, now backed by assistant conversations only.
CREATE VIEW public.numo_conversation_history WITH (security_invoker = true) AS
SELECT i.id,
  'assistant'::text AS source,
  c.id AS legacy_id,
  c.user_id,
  c.project_id,
  c.title,
  c.status,
  c.error_message,
  c.archived_at,
  s.pinned_at,
  s.last_read_at,
  c.created_at,
  c.updated_at,
  CASE
    WHEN p.id IS NOT NULL AND p.deleted_at IS NULL THEN jsonb_build_object('name', p.name)
    ELSE NULL::jsonb
  END AS project
FROM public.conversations c
  JOIN public.numo_conversation_ids i ON i.assistant_id = c.id
  LEFT JOIN public.projects p ON p.id = c.project_id
  LEFT JOIN public.numo_conversation_state s
    ON s.conversation_id = i.id AND s.user_id = auth.uid();

CREATE VIEW public.numo_user_conversation_history WITH (security_invoker = true) AS
SELECT history.*
FROM public.numo_conversation_history history
WHERE NOT public.is_numo_routine_conversation(history.legacy_id);

CREATE VIEW public.numo_messages WITH (security_invoker = true) AS
SELECT m.id,
  i.id AS conversation_id,
  'assistant'::text AS source,
  CASE WHEN m.role = 'tool'::text THEN 'action'::text ELSE 'message'::text END AS kind,
  m.role,
  m.content,
  m.tool_calls,
  m.tool_call_id,
  m.tool_name,
  m.metadata,
  m.context,
  m.turn_id,
  m.created_at
FROM public.assistant_messages m
  JOIN public.numo_conversation_ids i ON i.assistant_id = m.conversation_id;

CREATE VIEW public.numo_actions WITH (security_invoker = true) AS
SELECT numo_messages.*
FROM public.numo_messages
WHERE numo_messages.kind = 'action'::text;

CREATE VIEW public.numo_turns WITH (security_invoker = true) AS
SELECT t.id,
  t.conversation_id,
  t.run_id,
  t.status,
  t.model,
  t.reasoning_level,
  t.user_id AS initiated_by,
  t.cost_usd,
  t.outcome,
  t.error_message,
  t.started_at,
  t.completed_at,
  t.created_at,
  t.updated_at
FROM public.numo_assistant_turns t;

REVOKE ALL ON public.numo_conversation_history, public.numo_user_conversation_history,
  public.numo_messages, public.numo_actions, public.numo_turns FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.numo_conversation_history, public.numo_user_conversation_history,
  public.numo_messages, public.numo_actions, public.numo_turns TO authenticated;
GRANT ALL ON public.numo_conversation_history, public.numo_user_conversation_history,
  public.numo_messages, public.numo_actions, public.numo_turns TO service_role;

-- 7. Policies, without the agent-run topic and legacy agent identities.
CREATE POLICY numo_identity_select ON public.numo_conversation_ids
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = numo_conversation_ids.assistant_id
  ));

CREATE POLICY members_receive_broadcasts ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'::text AND (
      (realtime.topic() ~~ 'project:%'::text
        AND public.can_access_project(public.topic_uuid(realtime.topic()))
        AND public.realtime_topic_is_current(realtime.topic()))
      OR (realtime.topic() ~~ 'user:%'::text
        AND split_part(realtime.topic(), ':'::text, 2) = (SELECT (auth.uid())::text AS uid)
        AND public.realtime_topic_is_current(realtime.topic()))
      OR (realtime.topic() ~~ 'numo-comment:%'::text
        AND public.can_watch_numo_comment(realtime.topic())
        AND public.realtime_topic_is_current(realtime.topic()))
      OR (realtime.topic() ~~ 'numo-page-comment:%'::text
        AND public.can_watch_numo_page_comment(realtime.topic())
        AND public.realtime_topic_is_current(realtime.topic()))
      OR (realtime.topic() ~~ 'pull-request:%'::text
        AND public.can_watch_pull_request(realtime.topic())
        AND public.realtime_topic_is_current(realtime.topic()))
    )
  );

CREATE POLICY assistant_active_conversation_insert ON public.assistant_active_conversation
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.numo_conversation_history c
    WHERE c.id = assistant_active_conversation.conversation_id
  ));

CREATE POLICY assistant_active_conversation_update ON public.assistant_active_conversation
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.numo_conversation_history c
    WHERE c.id = assistant_active_conversation.conversation_id
  ));
