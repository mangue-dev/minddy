-- Commit tracking (MIN-1037): the commits and branches that name an issue,
-- for work pushed without a pull request.
--
-- A row belongs to an ISSUE and names its repository by the forge's stable id
-- (`external_repo_id`), never by `owner/name`: the name is renamed, released
-- and encrypted at rest, the id is none of these.
BEGIN;

-- The commits a merge produced on the base branch: the merge commit, and the
-- squash commit when the forge makes both. A push that brings one of them is
-- the pull request's own outcome, not separate work.
ALTER TABLE public.pull_requests ADD COLUMN merge_commit_shas text[];
CREATE INDEX pull_requests_merge_commits_idx
  ON public.pull_requests USING gin (merge_commit_shas)
  WHERE merge_commit_shas IS NOT NULL;

-- Where the catch-up sweep stopped reading the default branch.
ALTER TABLE public.pull_request_syncs
  ADD COLUMN commits_synced_sha text,
  ADD COLUMN commits_synced_at timestamptz;

CREATE TABLE public.issue_commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_repo_id text NOT NULL,
  sha text NOT NULL,
  title text,
  author_name text,
  author_login text,
  author_avatar_url text,
  committed_at timestamptz,
  on_default_branch boolean NOT NULL DEFAULT false,
  closes boolean NOT NULL DEFAULT false,
  -- Set when the commit belongs to a pull request, which then shows it.
  pull_request_id uuid REFERENCES public.pull_requests(id) ON DELETE SET NULL,
  content_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issue_commits_unique UNIQUE (issue_id, provider, external_repo_id, sha)
);
CREATE INDEX issue_commits_repo_sha_idx
  ON public.issue_commits (provider, external_repo_id, sha);
CREATE INDEX issue_commits_pull_request_idx
  ON public.issue_commits (pull_request_id) WHERE pull_request_id IS NOT NULL;
CREATE INDEX issue_commits_content_queue
  ON public.issue_commits (content_checked_at NULLS FIRST, id);

CREATE TABLE public.issue_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_repo_id text NOT NULL,
  branch text NOT NULL,
  head_sha text,
  pushed_at timestamptz NOT NULL DEFAULT now(),
  content_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX issue_branches_issue_idx ON public.issue_branches (issue_id);
CREATE INDEX issue_branches_content_queue
  ON public.issue_branches (content_checked_at NULLS FIRST, id);

-- Read access follows the issue, as for `pull_request_issues`. Writes are the
-- server's alone: ingestion runs with the service role.
ALTER TABLE public.issue_commits ENABLE ROW LEVEL SECURITY;
CREATE POLICY issue_commits_select ON public.issue_commits
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.issues i WHERE i.id = issue_id AND i.deleted_at IS NULL)
  );
REVOKE ALL ON public.issue_commits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.issue_commits TO authenticated;
GRANT ALL ON public.issue_commits TO service_role;

ALTER TABLE public.issue_branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY issue_branches_select ON public.issue_branches
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.issues i WHERE i.id = issue_id AND i.deleted_at IS NULL)
  );
REVOKE ALL ON public.issue_branches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.issue_branches TO authenticated;
GRANT ALL ON public.issue_branches TO service_role;

-- Commit titles, author names and branch names are repository content, sealed
-- like a pull request's title and branches and under the same activation.
CREATE FUNCTION public.guard_issue_code_work_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  field text;
  old_value text;
  new_value text;
  active boolean;
BEGIN
  active := EXISTS (SELECT 1 FROM public.pull_request_content_encryption_scope);
  FOR arg_index IN 0 .. TG_NARGS - 1 LOOP
    field := TG_ARGV[arg_index];
    new_value := pg_catalog.to_jsonb(NEW)->>field;
    old_value := CASE WHEN TG_OP = 'UPDATE' THEN pg_catalog.to_jsonb(OLD)->>field ELSE NULL END;
    IF new_value LIKE 'mdyc3:%' THEN
      IF new_value !~ '^mdyc3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'issue_code_work_ciphertext_invalid' USING ERRCODE = '23514';
      END IF;
      IF old_value LIKE 'mdyc3:%' AND
         pg_catalog.split_part(new_value, ':', 2)::integer <
         pg_catalog.split_part(old_value, ':', 2)::integer THEN
        RAISE EXCEPTION 'issue_code_work_key_version_rollback' USING ERRCODE = '23514';
      END IF;
    ELSIF new_value IS NOT NULL AND active AND
        (TG_OP = 'INSERT' OR new_value IS DISTINCT FROM old_value) THEN
      RAISE EXCEPTION 'issue_code_work_requires_encryption' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_issue_code_work_content()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER issue_commits_content_guard
  BEFORE INSERT OR UPDATE ON public.issue_commits
  FOR EACH ROW EXECUTE FUNCTION public.guard_issue_code_work_content('title', 'author_name');
CREATE TRIGGER issue_branches_content_guard
  BEFORE INSERT OR UPDATE ON public.issue_branches
  FOR EACH ROW EXECUTE FUNCTION public.guard_issue_code_work_content('branch');

-- One commit seen twice is one row. A commit first pushed on a branch and
-- later on the default branch keeps its row and only gains what it learned:
-- flags never go back to false, and a pull request once set stays.
CREATE FUNCTION public.upsert_issue_commit(p_values jsonb)
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
       'author_name', 'author_login', 'author_avatar_url', 'committed_at',
       'on_default_branch', 'closes', 'pull_request_id'
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
    author_login, author_avatar_url, committed_at, on_default_branch, closes,
    pull_request_id
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

-- Tell the open issue panels of the project. Identifiers only: the reader
-- fetches the rows again under its own access.
CREATE FUNCTION public.broadcast_issue_code_work() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_issue uuid := COALESCE(NEW.issue_id, OLD.issue_id);
  v_project uuid;
BEGIN
  SELECT project_id INTO v_project FROM public.issues WHERE id = v_issue;
  IF v_project IS NOT NULL THEN
    PERFORM realtime.send(pg_catalog.jsonb_build_object(
      'operation', TG_OP, 'table', TG_TABLE_NAME, 'schema', 'public',
      'record', pg_catalog.jsonb_build_object('issue_id', v_issue), 'old_record', NULL
    ), TG_OP, 'project:' || v_project, true);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_issue_code_work() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER issue_commits_broadcast
  AFTER INSERT OR DELETE OR UPDATE OF on_default_branch, closes, pull_request_id
  ON public.issue_commits
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_issue_code_work();
CREATE TRIGGER issue_branches_broadcast
  AFTER INSERT OR DELETE OR UPDATE OF head_sha
  ON public.issue_branches
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_issue_code_work();

COMMIT;
