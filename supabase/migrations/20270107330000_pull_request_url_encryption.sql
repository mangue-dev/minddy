BEGIN;

ALTER TABLE public.pull_requests ADD COLUMN url_encryption_checked_at timestamptz;
CREATE INDEX pull_request_url_encryption_queue ON public.pull_requests
  (url_encryption_checked_at NULLS FIRST,id) WHERE url IS NOT NULL;

CREATE TABLE public.pull_request_url_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pull_request_url_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pull_request_url_encryption_scope FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pull_request_url_encryption_scope TO service_role;

CREATE FUNCTION public.guard_pull_request_url()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_version integer; new_version integer;
BEGIN
  IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'pull_request_id_immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.url LIKE 'mdyq3:%' THEN
    IF NEW.url !~ '^mdyq3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
      RAISE EXCEPTION 'pull_request_url_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    new_version := split_part(NEW.url,':',2)::integer;
    IF TG_OP='UPDATE' AND OLD.url LIKE 'mdyq3:%' THEN
      old_version := split_part(OLD.url,':',2)::integer;
      IF new_version < old_version THEN
        RAISE EXCEPTION 'pull_request_url_key_version_rollback' USING ERRCODE='23514';
      END IF;
    END IF;
    INSERT INTO public.pull_request_url_encryption_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
  ELSIF NEW.url IS NOT NULL AND
      (EXISTS (SELECT 1 FROM public.pull_request_url_encryption_scope)
       OR (TG_OP='UPDATE' AND OLD.url LIKE 'mdyq3:%')) AND
      (TG_OP='INSERT' OR NEW.url IS DISTINCT FROM OLD.url) THEN
    RAISE EXCEPTION 'pull_request_url_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pull_request_url_guard
  BEFORE INSERT OR UPDATE ON public.pull_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_pull_request_url();
REVOKE ALL ON FUNCTION public.guard_pull_request_url()
  FROM PUBLIC,anon,authenticated;

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
       'id', 'provider', 'repo_full_name', 'number', 'state', 'url', 'title',
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
      id, provider, repo_full_name, number, state, url, title, author_login,
      author_avatar_url, head_branch, base_branch, head_sha, issue_id,
      opened_at, merged_at, updated_at, synced_at
    ) VALUES (
      COALESCE((p_values->>'id')::uuid,pg_catalog.gen_random_uuid()),
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
  ELSIF p_values ? 'id' AND (p_values->>'id')::uuid IS DISTINCT FROM v_current.id THEN
    RAISE EXCEPTION 'pull_request_id_changed' USING ERRCODE='23514';
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

CREATE FUNCTION public.migrate_pull_request_url(
  p_id uuid,p_old_url text,p_new_url text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.pull_requests;
BEGIN
  SELECT * INTO row FROM public.pull_requests WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row.url IS DISTINCT FROM p_old_url THEN RETURN false; END IF;
  IF p_new_url IS NULL THEN
    UPDATE public.pull_requests SET url_encryption_checked_at=clock_timestamp()
      WHERE id=p_id;
  ELSE
    UPDATE public.pull_requests SET url=p_new_url,
      url_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_pull_request_url(uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_pull_request_url(uuid,text,text)
  TO service_role;

-- The forge URL ciphertext is bound to the shared PR id. It cannot be copied
-- into a project/run-bound agent_runs column by SQL.
CREATE OR REPLACE FUNCTION public.sync_agent_runs_from_pull_request(
  p_provider text,p_repo_full_name text,p_number integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pr public.pull_requests%ROWTYPE; v_updated integer;
BEGIN
  SELECT * INTO v_pr FROM public.pull_requests
    WHERE provider=p_provider AND repo_full_name=p_repo_full_name
      AND number=p_number FOR SHARE;
  IF v_pr.id IS NULL THEN RETURN 0; END IF;
  UPDATE public.agent_runs AS run SET pr_state=v_pr.state
    WHERE run.pr_number=p_number AND EXISTS (
      SELECT 1 FROM public.project_git_links AS link
      WHERE link.id=run.repo_link_id AND link.provider=p_provider
        AND link.repo_full_name=p_repo_full_name);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_agent_runs_from_pull_request(text,text,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_agent_runs_from_pull_request(text,text,integer)
  TO service_role;

CREATE FUNCTION public.sync_agent_run_pr_url(
  p_pr_id uuid,p_pr_updated_at timestamptz,p_pr_url text,
  p_run_id uuid,p_old_run_url text,p_new_run_url text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pr public.pull_requests; run public.agent_runs;
  prior text := current_setting('minddy.encryption_maintenance',true);
BEGIN
  SELECT * INTO pr FROM public.pull_requests WHERE id=p_pr_id FOR SHARE;
  IF NOT FOUND OR pr.updated_at IS DISTINCT FROM p_pr_updated_at OR
      pr.url IS DISTINCT FROM p_pr_url THEN RETURN false; END IF;
  SELECT * INTO run FROM public.agent_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR run.pr_url IS DISTINCT FROM p_old_run_url OR
      run.pr_number IS DISTINCT FROM pr.number OR NOT EXISTS (
        SELECT 1 FROM public.project_git_links l WHERE l.id=run.repo_link_id
          AND l.provider=pr.provider AND l.repo_full_name=pr.repo_full_name)
      THEN RETURN false; END IF;
  PERFORM set_config('minddy.encryption_maintenance','on',true);
  UPDATE public.agent_runs SET pr_url=p_new_run_url WHERE id=p_run_id;
  PERFORM set_config('minddy.encryption_maintenance',COALESCE(prior,''),true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_agent_run_pr_url(
  uuid,timestamptz,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_agent_run_pr_url(
  uuid,timestamptz,text,uuid,text,text) TO service_role;

COMMIT;
