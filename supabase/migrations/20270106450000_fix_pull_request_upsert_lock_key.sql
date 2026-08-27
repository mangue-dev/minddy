-- Parenthesize JSON extraction before concatenation. PostgreSQL otherwise
-- associates the custom operators from left to right and attempts text ->> text.

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
      (p_values->>'provider') || ':' ||
      (p_values->>'repo_full_name') || ':' ||
      (p_values->>'number'),
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
