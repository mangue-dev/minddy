-- Co-authors of a tracked commit (MIN-1037): the people its `Co-authored-by`
-- trailers name, kept so the issue shows everyone who wrote the commit, as a
-- pull request does. A sealed JSON list of names, with the forge login when
-- the trailer carries one.
BEGIN;

ALTER TABLE public.issue_commits ADD COLUMN co_authors text;

DROP TRIGGER issue_commits_content_guard ON public.issue_commits;
CREATE TRIGGER issue_commits_content_guard
  BEFORE INSERT OR UPDATE ON public.issue_commits
  FOR EACH ROW EXECUTE FUNCTION public.guard_issue_code_work_content(
    'title', 'author_name', 'co_authors');

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
    on_default_branch, closes, pull_request_id
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
    NULLIF(p_values->>'pull_request_id', '')::uuid
  )
  ON CONFLICT ON CONSTRAINT issue_commits_unique DO UPDATE SET
    on_default_branch = c.on_default_branch OR EXCLUDED.on_default_branch,
    closes = c.closes OR EXCLUDED.closes,
    pull_request_id = COALESCE(c.pull_request_id, EXCLUDED.pull_request_id)
  RETURNING c.* INTO v_row;
  v_inserted := v_row.id = (p_values->>'id')::uuid;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_row.id,
    'inserted', v_inserted,
    -- Known from a branch until now, and seen on the default branch.
    'promoted', NOT v_inserted AND v_was_on_default_branch IS FALSE
      AND v_row.on_default_branch,
    'pull_request_id', v_row.pull_request_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_issue_commit(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_issue_commit(jsonb) TO service_role;

COMMIT;
