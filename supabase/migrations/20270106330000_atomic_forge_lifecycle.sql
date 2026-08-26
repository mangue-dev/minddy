-- Serialize Forge connection provisioning and rotating OAuth grants across
-- application instances. Provider refresh tokens are single-use, so the
-- claim must be acquired before the external refresh request starts.

ALTER TABLE public.git_connections
  ADD COLUMN oauth_refresh_claim uuid,
  ADD COLUMN oauth_refresh_claimed_at timestamptz;

ALTER TABLE public.git_user_identities
  ADD COLUMN oauth_refresh_claim uuid,
  ADD COLUMN oauth_refresh_claimed_at timestamptz;

ALTER TABLE public.forge_relay_refresh_lineage
  ADD COLUMN refresh_claim_id uuid,
  ADD COLUMN refresh_claimed_at timestamptz,
  ADD CONSTRAINT forge_relay_refresh_lineage_account_key
    UNIQUE (instance_id, provider, provider_account_id);

CREATE TABLE public.issue_remote_status_push_locks (
  issue_id uuid PRIMARY KEY REFERENCES public.issues(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL
);

ALTER TABLE public.issue_remote_status_push_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.issue_remote_status_push_locks
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_forge_oauth_refresh(
  p_kind text,
  p_row_id uuid,
  p_expected_expires_at timestamptz,
  p_expected_refresh_token_encrypted text,
  p_claim_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claimed_rows integer := 0;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_kind NOT IN ('connection', 'identity') OR p_claim_id IS NULL THEN
    RAISE EXCEPTION 'forge_oauth_refresh_claim_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'connection' THEN
    UPDATE public.git_connections
    SET oauth_refresh_claim = p_claim_id,
        oauth_refresh_claimed_at = v_now
    WHERE id = p_row_id
      AND token_expires_at IS NOT DISTINCT FROM p_expected_expires_at
      AND refresh_token_encrypted IS NOT DISTINCT FROM p_expected_refresh_token_encrypted
      AND (
        oauth_refresh_claim IS NULL
        OR oauth_refresh_claimed_at < v_now - interval '2 minutes'
      );
  ELSE
    UPDATE public.git_user_identities
    SET oauth_refresh_claim = p_claim_id,
        oauth_refresh_claimed_at = v_now
    WHERE id = p_row_id
      AND token_expires_at IS NOT DISTINCT FROM p_expected_expires_at
      AND refresh_token_encrypted IS NOT DISTINCT FROM p_expected_refresh_token_encrypted
      AND (
        oauth_refresh_claim IS NULL
        OR oauth_refresh_claimed_at < v_now - interval '2 minutes'
      );
  END IF;

  GET DIAGNOSTICS v_claimed_rows = ROW_COUNT;
  RETURN v_claimed_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_forge_oauth_refresh(
  text, uuid, timestamptz, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_forge_oauth_refresh(
  text, uuid, timestamptz, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_forge_relay_refresh_lineage(
  p_instance_id uuid,
  p_provider text,
  p_refresh_token_hash text,
  p_claim_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  UPDATE public.forge_relay_refresh_lineage
  SET refresh_claim_id = p_claim_id,
      refresh_claimed_at = v_now
  WHERE instance_id = p_instance_id
    AND provider = p_provider
    AND refresh_token_hash = p_refresh_token_hash
    AND (
      refresh_claim_id IS NULL
      OR refresh_claimed_at < v_now - interval '2 minutes'
    )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_forge_relay_refresh_lineage(
  uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_forge_relay_refresh_lineage(
  uuid, text, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_issue_remote_status_push(
  p_issue_id uuid,
  p_claim_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer := 0;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  INSERT INTO public.issue_remote_status_push_locks (issue_id, claim_id, claimed_at)
  SELECT p_issue_id, p_claim_id, v_now
  FROM public.issues
  WHERE id = p_issue_id
    AND deleted_at IS NULL
    AND remote_provider IS NOT NULL
  ON CONFLICT (issue_id) DO UPDATE
  SET claim_id = EXCLUDED.claim_id,
      claimed_at = EXCLUDED.claimed_at
  WHERE public.issue_remote_status_push_locks.claimed_at
        < v_now - interval '2 minutes';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_issue_remote_status_push(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_issue_remote_status_push(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.release_issue_remote_status_push(
  p_issue_id uuid,
  p_claim_id uuid
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.issue_remote_status_push_locks
  WHERE issue_id = p_issue_id AND claim_id = p_claim_id;
$$;

REVOKE ALL ON FUNCTION public.release_issue_remote_status_push(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_issue_remote_status_push(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_github_connection_atomic(
  p_user_id uuid,
  p_installation_id bigint,
  p_account_login text,
  p_account_type text,
  p_repository_selection text,
  p_source text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.git_connections%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('github:' || p_installation_id::text, 456)
  );

  SELECT * INTO v_row
  FROM public.git_connections
  WHERE installation_id = p_installation_id
  FOR UPDATE;

  IF v_row.id IS NOT NULL AND v_row.user_id <> p_user_id THEN
    RETURN pg_catalog.jsonb_build_object('state', 'owned_by_another');
  END IF;

  IF v_row.id IS NULL THEN
    INSERT INTO public.git_connections (
      user_id, provider, installation_id, account_login, account_type,
      repository_selection, source
    ) VALUES (
      p_user_id, 'github', p_installation_id, p_account_login, p_account_type,
      p_repository_selection, p_source
    ) RETURNING * INTO v_row;
  ELSE
    UPDATE public.git_connections
    SET provider = 'github',
        account_login = p_account_login,
        account_type = p_account_type,
        repository_selection = p_repository_selection,
        source = p_source,
        updated_at = pg_catalog.now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN pg_catalog.jsonb_build_object('state', 'stored', 'id', v_row.id);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_github_connection_atomic(
  uuid, bigint, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_github_connection_atomic(
  uuid, bigint, text, text, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_gitlab_connection_atomic(
  p_user_id uuid,
  p_provider_account_id text,
  p_account_login text,
  p_source text,
  p_access_token_encrypted text,
  p_refresh_token_encrypted text,
  p_token_expires_at timestamptz,
  p_oauth_scopes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_user_id::text || ':gitlab:' || p_provider_account_id,
      456
    )
  );

  SELECT id INTO v_id
  FROM public.git_connections
  WHERE user_id = p_user_id
    AND provider = 'gitlab'
    AND provider_account_id = p_provider_account_id
  FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.git_connections (
      user_id, provider, provider_account_id, account_login, source,
      access_token_encrypted, refresh_token_encrypted, token_expires_at,
      oauth_scopes
    ) VALUES (
      p_user_id, 'gitlab', p_provider_account_id, p_account_login, p_source,
      p_access_token_encrypted, p_refresh_token_encrypted, p_token_expires_at,
      p_oauth_scopes
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.git_connections
    SET account_login = p_account_login,
        source = p_source,
        access_token_encrypted = p_access_token_encrypted,
        refresh_token_encrypted = p_refresh_token_encrypted,
        token_expires_at = p_token_expires_at,
        oauth_scopes = p_oauth_scopes,
        oauth_refresh_claim = NULL,
        oauth_refresh_claimed_at = NULL,
        updated_at = pg_catalog.now()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_gitlab_connection_atomic(
  uuid, text, text, text, text, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_gitlab_connection_atomic(
  uuid, text, text, text, text, text, timestamptz, text
) TO service_role;
