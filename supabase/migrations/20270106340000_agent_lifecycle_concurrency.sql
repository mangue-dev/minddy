-- Keep pull request ingestion and manual linking monotonic under concurrent
-- webhook deliveries, scans, and user actions.

CREATE OR REPLACE FUNCTION public.upsert_pull_request_monotonic(
  p_values jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current public.pull_requests%ROWTYPE;
  v_incoming_updated_at timestamptz;
  v_requested_issue_id uuid;
  v_lock_issue_id uuid;
  v_applied boolean := false;
BEGIN
  IF p_values IS NULL
     OR jsonb_typeof(p_values) <> 'object'
     OR NULLIF(p_values->>'provider', '') IS NULL
     OR NULLIF(p_values->>'repo_full_name', '') IS NULL
     OR NULLIF(p_values->>'number', '') IS NULL
     OR NULLIF(p_values->>'state', '') IS NULL
     OR p_values - ARRAY[
       'provider', 'repo_full_name', 'number', 'state', 'url', 'title',
       'author_login', 'author_avatar_url', 'head_branch', 'base_branch',
       'head_sha', 'opened_at', 'merged_at', 'updated_at', 'synced_at',
       'issue_id'
     ] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'pull_request_values_invalid' USING ERRCODE = '22023';
  END IF;

  v_incoming_updated_at := COALESCE(
    NULLIF(p_values->>'updated_at', '')::timestamptz,
    pg_catalog.clock_timestamp()
  );
  v_requested_issue_id := NULLIF(p_values->>'issue_id', '')::uuid;
  v_lock_issue_id := v_requested_issue_id;
  IF v_lock_issue_id IS NULL THEN
    SELECT issue_id INTO v_lock_issue_id
    FROM public.pull_requests
    WHERE provider = p_values->>'provider'
      AND repo_full_name = p_values->>'repo_full_name'
      AND number = (p_values->>'number')::integer;
  END IF;

  -- Use the same lock order as manual linking. If another live PR already owns
  -- the issue, keep this observation unlinked instead of creating two winners.
  IF v_lock_issue_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('issue:' || v_lock_issue_id::text, 459)
    );
  END IF;
  IF v_requested_issue_id IS NOT NULL THEN
    IF (p_values->>'state') IN ('draft', 'open')
       AND EXISTS (
         SELECT 1
         FROM public.pull_requests
         WHERE issue_id = v_requested_issue_id
           AND state IN ('draft', 'open')
           AND NOT (
             provider = p_values->>'provider'
             AND repo_full_name = p_values->>'repo_full_name'
             AND number = (p_values->>'number')::integer
           )
       ) THEN
      v_requested_issue_id := NULL;
    END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_values->>'provider' || ':' || p_values->>'repo_full_name' || ':' || p_values->>'number',
      459
    )
  );

  SELECT * INTO v_current
  FROM public.pull_requests
  WHERE provider = p_values->>'provider'
    AND repo_full_name = p_values->>'repo_full_name'
    AND number = (p_values->>'number')::integer
  FOR UPDATE;

  IF v_current.id IS NULL THEN
    INSERT INTO public.pull_requests (
      provider, repo_full_name, number, state, url, title, author_login,
      author_avatar_url, head_branch, base_branch, head_sha, issue_id,
      opened_at, merged_at, updated_at, synced_at
    ) VALUES (
      p_values->>'provider',
      p_values->>'repo_full_name',
      (p_values->>'number')::integer,
      p_values->>'state',
      p_values->>'url',
      p_values->>'title',
      p_values->>'author_login',
      p_values->>'author_avatar_url',
      p_values->>'head_branch',
      p_values->>'base_branch',
      p_values->>'head_sha',
      v_requested_issue_id,
      NULLIF(p_values->>'opened_at', '')::timestamptz,
      NULLIF(p_values->>'merged_at', '')::timestamptz,
      v_incoming_updated_at,
      pg_catalog.clock_timestamp()
    ) RETURNING * INTO v_current;
    v_applied := true;
  ELSIF v_incoming_updated_at = v_current.updated_at
        AND v_current.issue_id IS NULL
        AND v_requested_issue_id IS NOT NULL THEN
    -- Equal forge observations are idempotent, but a later resolver may have
    -- learned the issue association that the first delivery could not infer.
    UPDATE public.pull_requests
    SET issue_id = v_requested_issue_id,
        synced_at = pg_catalog.clock_timestamp()
    WHERE id = v_current.id
      AND issue_id IS NULL
    RETURNING * INTO v_current;
  ELSIF v_incoming_updated_at > v_current.updated_at THEN
    UPDATE public.pull_requests
    SET state = p_values->>'state',
        url = CASE WHEN p_values ? 'url' THEN p_values->>'url' ELSE v_current.url END,
        title = CASE WHEN p_values ? 'title' THEN p_values->>'title' ELSE v_current.title END,
        author_login = CASE WHEN p_values ? 'author_login' THEN p_values->>'author_login' ELSE v_current.author_login END,
        author_avatar_url = CASE WHEN p_values ? 'author_avatar_url' THEN p_values->>'author_avatar_url' ELSE v_current.author_avatar_url END,
        head_branch = CASE WHEN p_values ? 'head_branch' THEN p_values->>'head_branch' ELSE v_current.head_branch END,
        base_branch = CASE WHEN p_values ? 'base_branch' THEN p_values->>'base_branch' ELSE v_current.base_branch END,
        head_sha = CASE WHEN p_values ? 'head_sha' THEN p_values->>'head_sha' ELSE v_current.head_sha END,
        issue_id = CASE WHEN p_values ? 'issue_id' THEN v_requested_issue_id ELSE v_current.issue_id END,
        opened_at = CASE WHEN p_values ? 'opened_at' THEN NULLIF(p_values->>'opened_at', '')::timestamptz ELSE v_current.opened_at END,
        merged_at = CASE WHEN p_values ? 'merged_at' THEN NULLIF(p_values->>'merged_at', '')::timestamptz ELSE v_current.merged_at END,
        updated_at = v_incoming_updated_at,
        synced_at = pg_catalog.clock_timestamp()
    WHERE id = v_current.id
    RETURNING * INTO v_current;
    v_applied := true;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'row', pg_catalog.to_jsonb(v_current),
    'applied', v_applied
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_pull_request_monotonic(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pull_request_monotonic(jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.link_pull_request_to_issue_atomic(
  p_pr_id uuid,
  p_issue_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pr public.pull_requests%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('issue:' || p_issue_id::text, 459)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pr:' || p_pr_id::text, 459)
  );

  SELECT * INTO v_pr
  FROM public.pull_requests
  WHERE id = p_pr_id
  FOR UPDATE;

  IF v_pr.id IS NULL THEN
    RETURN 'pr_not_found';
  END IF;
  IF v_pr.issue_id = p_issue_id THEN
    RETURN 'already';
  END IF;
  IF v_pr.issue_id IS NOT NULL THEN
    RETURN 'pr_already_linked';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.pull_requests
    WHERE issue_id = p_issue_id
      AND state IN ('draft', 'open')
      AND id <> p_pr_id
  ) THEN
    RETURN 'issue_already_linked';
  END IF;

  UPDATE public.pull_requests
  SET issue_id = p_issue_id
  WHERE id = p_pr_id;
  RETURN 'linked';
END;
$$;

REVOKE ALL ON FUNCTION public.link_pull_request_to_issue_atomic(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_pull_request_to_issue_atomic(uuid, uuid)
  TO service_role;

ALTER TABLE public.agent_runs
  ADD COLUMN pr_inline_comments_used integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT agent_runs_pr_inline_comments_used_check
    CHECK (pr_inline_comments_used >= 0);

UPDATE public.agent_runs
SET pr_inline_comments_used = (checkpoint->>'prInlineComments')::integer
WHERE checkpoint->>'prInlineComments' ~ '^[0-9]+$';

CREATE OR REPLACE FUNCTION public.reserve_agent_pr_inline_comment(
  p_run_id uuid,
  p_limit integer
) RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.agent_runs
  SET pr_inline_comments_used = pr_inline_comments_used + 1
  WHERE id = p_run_id
    AND status = 'running'
    AND p_limit > 0
    AND pr_inline_comments_used < p_limit
  RETURNING pr_inline_comments_used;
$$;

CREATE OR REPLACE FUNCTION public.release_agent_pr_inline_comment(
  p_run_id uuid
) RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.agent_runs
  SET pr_inline_comments_used = GREATEST(pr_inline_comments_used - 1, 0)
  WHERE id = p_run_id
  RETURNING pr_inline_comments_used;
$$;

REVOKE ALL ON FUNCTION public.reserve_agent_pr_inline_comment(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_agent_pr_inline_comment(uuid, integer)
  TO service_role;
REVOKE ALL ON FUNCTION public.release_agent_pr_inline_comment(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_agent_pr_inline_comment(uuid)
  TO service_role;

-- Run creation and steering share this advisory-lock namespace. A message can
-- therefore prove that its run is still the newest one at the same instant it
-- enters the durable queue.
CREATE OR REPLACE FUNCTION public.lock_agent_run_anchor_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_anchor text;
BEGIN
  v_anchor := CASE
    WHEN NEW.issue_id IS NOT NULL THEN 'issue:' || NEW.issue_id::text
    WHEN NEW.pull_request_id IS NOT NULL THEN 'pr:' || NEW.pull_request_id::text
    WHEN NEW.routine_id IS NOT NULL THEN 'routine:' || NEW.routine_id::text
    ELSE 'conversation:' || NEW.conversation_id::text
  END;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent-run:' || v_anchor, 459)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_runs_lock_anchor_on_insert ON public.agent_runs;
CREATE TRIGGER agent_runs_lock_anchor_on_insert
BEFORE INSERT ON public.agent_runs
FOR EACH ROW EXECUTE FUNCTION public.lock_agent_run_anchor_on_insert();

CREATE OR REPLACE FUNCTION public.insert_latest_agent_run_message(
  p_run_id uuid,
  p_message_id uuid,
  p_user_id uuid,
  p_content text,
  p_mentions jsonb DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.agent_runs%ROWTYPE;
  v_latest_id uuid;
  v_anchor text;
  v_inserted integer;
BEGIN
  SELECT * INTO v_run
  FROM public.agent_runs
  WHERE id = p_run_id;
  IF v_run.id IS NULL THEN
    RETURN 'run_not_found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.agent_run_messages
    WHERE id = p_message_id AND run_id = p_run_id
  ) THEN
    RETURN 'already';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.agent_run_messages
    WHERE id = p_message_id AND run_id <> p_run_id
  ) THEN
    RETURN 'message_id_conflict';
  END IF;

  v_anchor := CASE
    WHEN v_run.issue_id IS NOT NULL THEN 'issue:' || v_run.issue_id::text
    WHEN v_run.pull_request_id IS NOT NULL THEN 'pr:' || v_run.pull_request_id::text
    WHEN v_run.routine_id IS NOT NULL THEN 'routine:' || v_run.routine_id::text
    ELSE 'conversation:' || v_run.conversation_id::text
  END;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('agent-run:' || v_anchor, 459)
  );

  SELECT id INTO v_latest_id
  FROM public.agent_runs
  WHERE CASE
    WHEN v_run.issue_id IS NOT NULL THEN issue_id = v_run.issue_id
    WHEN v_run.pull_request_id IS NOT NULL THEN pull_request_id = v_run.pull_request_id
    WHEN v_run.routine_id IS NOT NULL THEN routine_id = v_run.routine_id
    ELSE conversation_id = v_run.conversation_id
  END
  ORDER BY created_at DESC, id DESC
  LIMIT 1;
  IF v_latest_id IS DISTINCT FROM p_run_id THEN
    RETURN 'superseded';
  END IF;

  INSERT INTO public.agent_run_messages (
    id, run_id, created_by, content, mentions
  ) VALUES (
    p_message_id, p_run_id, p_user_id, p_content, p_mentions
  ) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 1 THEN
    RETURN 'inserted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.agent_run_messages
    WHERE id = p_message_id AND run_id = p_run_id
  ) THEN
    RETURN 'already';
  END IF;
  RETURN 'message_id_conflict';
END;
$$;

REVOKE ALL ON FUNCTION public.insert_latest_agent_run_message(
  uuid, uuid, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_latest_agent_run_message(
  uuid, uuid, uuid, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_agent_runs_from_pull_request(
  p_provider text,
  p_repo_full_name text,
  p_number integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pr public.pull_requests%ROWTYPE;
  v_updated integer;
BEGIN
  SELECT * INTO v_pr
  FROM public.pull_requests
  WHERE provider = p_provider
    AND repo_full_name = p_repo_full_name
    AND number = p_number
  FOR SHARE;
  IF v_pr.id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.agent_runs AS run
  SET pr_state = v_pr.state,
      pr_url = COALESCE(v_pr.url, run.pr_url)
  WHERE run.pr_number = p_number
    AND EXISTS (
      SELECT 1
      FROM public.project_git_links AS link
      WHERE link.id = run.repo_link_id
        AND link.provider = p_provider
        AND link.repo_full_name = p_repo_full_name
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_agent_runs_from_pull_request(
  text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_agent_runs_from_pull_request(
  text, text, integer
) TO service_role;
