-- Commit tracking, second pass (MIN-1037).
--
-- `delivered_at`: when a commit was first seen on the default branch. The
-- commit's own date says when it was written, which a cherry-pick keeps and
-- which can precede the push by days; a delivery is dated by its arrival.
--
-- `announced_at`: set once the push that brought the commit has recorded its
-- activity line and asked for the issue status. A push that failed in between
-- leaves it null, so the next sighting of the commit still speaks for it.
--
-- `push_hook_*`: whether the GitLab hook of the repository was brought up to
-- push events, kept apart from the commit cursor so a failed attempt is tried
-- again and a successful one is not repeated.
BEGIN;

ALTER TABLE public.issue_commits
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN announced_at timestamptz;

-- Rows stored before this migration went through the whole ingestion.
UPDATE public.issue_commits
SET announced_at = created_at,
    delivered_at = CASE WHEN on_default_branch THEN created_at END;

ALTER TABLE public.pull_request_syncs
  ADD COLUMN push_hook_aligned_at timestamptz,
  ADD COLUMN push_hook_tried_at timestamptz;

CREATE OR REPLACE FUNCTION public.upsert_issue_commit(p_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.issue_commits%ROWTYPE;
  v_inserted boolean;
  v_was_on_default_branch boolean;
BEGIN
  IF p_values IS NULL
     OR pg_catalog.jsonb_typeof(p_values) <> 'object'
     OR NULLIF(p_values->>'id', '') IS NULL
     OR NULLIF(p_values->>'issue_id', '') IS NULL
     OR NULLIF(p_values->>'provider', '') IS NULL
     OR NULLIF(p_values->>'external_repo_id', '') IS NULL
     OR NULLIF(p_values->>'sha', '') IS NULL
     OR p_values - ARRAY[
       'id', 'issue_id', 'provider', 'external_repo_id', 'sha', 'title',
       'author_name', 'author_login', 'author_avatar_url', 'co_authors',
       'committed_at', 'on_default_branch', 'closes', 'pull_request_id'
     ] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'issue_commit_values_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT on_default_branch INTO v_was_on_default_branch
  FROM public.issue_commits
  WHERE issue_id = (p_values->>'issue_id')::uuid
    AND provider = p_values->>'provider'
    AND external_repo_id = p_values->>'external_repo_id'
    AND sha = p_values->>'sha'
  FOR UPDATE;

  INSERT INTO public.issue_commits AS c (
    id, issue_id, provider, external_repo_id, sha, title, author_name,
    author_login, author_avatar_url, co_authors, committed_at,
    on_default_branch, closes, pull_request_id, delivered_at
  ) VALUES (
    (p_values->>'id')::uuid,
    (p_values->>'issue_id')::uuid,
    p_values->>'provider',
    p_values->>'external_repo_id',
    p_values->>'sha',
    p_values->>'title',
    p_values->>'author_name',
    p_values->>'author_login',
    p_values->>'author_avatar_url',
    p_values->>'co_authors',
    NULLIF(p_values->>'committed_at', '')::timestamptz,
    COALESCE((p_values->>'on_default_branch')::boolean, false),
    COALESCE((p_values->>'closes')::boolean, false),
    NULLIF(p_values->>'pull_request_id', '')::uuid,
    CASE WHEN COALESCE((p_values->>'on_default_branch')::boolean, false)
      THEN pg_catalog.now() END
  )
  ON CONFLICT ON CONSTRAINT issue_commits_unique DO UPDATE SET
    on_default_branch = c.on_default_branch OR EXCLUDED.on_default_branch,
    closes = c.closes OR EXCLUDED.closes,
    pull_request_id = COALESCE(c.pull_request_id, EXCLUDED.pull_request_id),
    delivered_at = COALESCE(c.delivered_at, EXCLUDED.delivered_at)
  RETURNING c.* INTO v_row;
  v_inserted := v_row.id = (p_values->>'id')::uuid;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_row.id,
    'inserted', v_inserted,
    -- Known from a branch until now, and seen on the default branch.
    'promoted', NOT v_inserted AND v_was_on_default_branch IS FALSE
      AND v_row.on_default_branch,
    'announced', v_row.announced_at IS NOT NULL,
    'pull_request_id', v_row.pull_request_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_issue_commit(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_issue_commit(jsonb) TO service_role;

COMMIT;
