-- Complete relay claims under the same installation lock used by Cloud
-- connection provisioning, preventing dual ownership across the two tables.
CREATE OR REPLACE FUNCTION public.complete_forge_relay_claim(
  p_instance_id uuid,
  p_claim_id uuid,
  p_installation_id bigint,
  p_account_login text,
  p_repository_id bigint,
  p_repository_full_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_relay public.forge_relay_installations%ROWTYPE;
  v_claim public.forge_relay_claims%ROWTYPE;
BEGIN
  IF p_instance_id IS NULL OR p_claim_id IS NULL
     OR p_installation_id <= 0 OR p_repository_id <= 0
     OR p_account_login IS NULL OR p_account_login = ''
     OR p_repository_full_name IS NULL OR p_repository_full_name = '' THEN
    RAISE EXCEPTION 'forge_relay_claim_completion_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('github:' || p_installation_id::text, 456)
  );

  IF EXISTS (
    SELECT 1 FROM public.git_connections
    WHERE installation_id = p_installation_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object('state', 'cloud_owned');
  END IF;

  SELECT * INTO v_relay
  FROM public.forge_relay_installations
  WHERE installation_id = p_installation_id
  FOR UPDATE;
  IF v_relay.id IS NOT NULL AND v_relay.instance_id <> p_instance_id THEN
    RETURN pg_catalog.jsonb_build_object('state', 'relay_owned');
  END IF;

  SELECT * INTO v_claim
  FROM public.forge_relay_claims
  WHERE id = p_claim_id
    AND instance_id = p_instance_id
    AND installation_id = p_installation_id
    AND status = 'verifying'
  FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('state', 'claim_stale');
  END IF;

  IF v_relay.id IS NULL THEN
    INSERT INTO public.forge_relay_installations (
      instance_id, installation_id, account_login
    ) VALUES (p_instance_id, p_installation_id, p_account_login);
  ELSE
    UPDATE public.forge_relay_installations
    SET account_login = p_account_login
    WHERE id = v_relay.id;
  END IF;

  UPDATE public.forge_relay_claims
  SET status = 'claimed',
      account_login = p_account_login,
      repository_id = p_repository_id,
      repository_full_name = p_repository_full_name,
      claimed_at = pg_catalog.clock_timestamp(),
      consumed_at = NULL
  WHERE id = p_claim_id;

  RETURN pg_catalog.jsonb_build_object('state', 'claimed');
END;
$$;

REVOKE ALL ON FUNCTION public.complete_forge_relay_claim(
  uuid, uuid, bigint, text, bigint, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_forge_relay_claim(
  uuid, uuid, bigint, text, bigint, text
) TO service_role;

-- Enforce the inverse ownership check at the table boundary as well. Both
-- Cloud and relay writes take the same installation lock before checking the
-- other table, so neither side can commit after observing a stale empty state.
CREATE OR REPLACE FUNCTION public.enforce_github_installation_single_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'git_connections' AND NEW.provider = 'github'
     AND NEW.installation_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('github:' || NEW.installation_id::text, 456)
    );
    IF EXISTS (
      SELECT 1 FROM public.forge_relay_installations
      WHERE installation_id = NEW.installation_id
    ) THEN
      RAISE EXCEPTION 'github_installation_relay_owned' USING ERRCODE = '23505';
    END IF;
  ELSIF TG_TABLE_NAME = 'forge_relay_installations' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('github:' || NEW.installation_id::text, 456)
    );
    IF EXISTS (
      SELECT 1 FROM public.git_connections
      WHERE provider = 'github' AND installation_id = NEW.installation_id
    ) THEN
      RAISE EXCEPTION 'github_installation_cloud_owned' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_github_installation_single_owner()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS git_connections_single_installation_owner
  ON public.git_connections;
CREATE TRIGGER git_connections_single_installation_owner
BEFORE INSERT OR UPDATE OF provider, installation_id
ON public.git_connections
FOR EACH ROW EXECUTE FUNCTION public.enforce_github_installation_single_owner();

DROP TRIGGER IF EXISTS forge_relay_single_installation_owner
  ON public.forge_relay_installations;
CREATE TRIGGER forge_relay_single_installation_owner
BEFORE INSERT OR UPDATE OF installation_id
ON public.forge_relay_installations
FOR EACH ROW EXECUTE FUNCTION public.enforce_github_installation_single_owner();
