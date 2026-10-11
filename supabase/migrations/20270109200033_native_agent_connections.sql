-- Native subscription profiles are mandatory user-scoped ciphertext. No client role can read them.
CREATE TABLE public.native_agent_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engine text NOT NULL CHECK (engine IN ('codex', 'claude_code')),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  profile_ciphertext text,
  runtime_ciphertext text,
  lease_id uuid,
  lease_kind text CHECK (lease_kind IN ('login', 'test', 'stop')),
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, engine),
  CHECK ((lease_id IS NULL AND lease_kind IS NULL AND lease_expires_at IS NULL AND runtime_ciphertext IS NULL)
    OR (lease_id IS NOT NULL AND lease_kind IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK ((status = 'connected') = (profile_ciphertext IS NOT NULL)),
  CHECK (profile_ciphertext IS NULL OR COALESCE((octet_length(profile_ciphertext) <= 131072
    AND profile_ciphertext::jsonb ->> 'format' = '3'
    AND profile_ciphertext::jsonb ->> 'encoding' = 'json'), false)),
  CHECK (runtime_ciphertext IS NULL OR COALESCE((octet_length(runtime_ciphertext) <= 65536
    AND runtime_ciphertext::jsonb ->> 'format' = '3'
    AND runtime_ciphertext::jsonb ->> 'encoding' = 'json'), false))
);
ALTER TABLE public.native_agent_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_agent_connections FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.native_agent_connections TO service_role;

CREATE FUNCTION public.acquire_native_agent_connection(p_user_id uuid, p_engine text, p_kind text)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  IF p_user_id IS NULL OR p_engine NOT IN ('codex','claude_code') OR p_kind NOT IN ('login','test')
    OR p_engine IS NULL OR p_kind IS NULL OR pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'native_connection_invalid_request';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,5911900));
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id)
    OR EXISTS (SELECT 1 FROM public.agent_account_erasure_fences WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION 'native_connection_owner_unavailable';
  END IF;
  INSERT INTO public.native_agent_connections(user_id,engine) VALUES(p_user_id,p_engine)
    ON CONFLICT (user_id,engine) DO NOTHING;
  SELECT * INTO v FROM public.native_agent_connections WHERE user_id=p_user_id AND engine=p_engine FOR UPDATE;
  -- An expired lease does not prove that the native process stopped. Never reclaim it automatically.
  IF v.lease_id IS NOT NULL THEN RAISE EXCEPTION 'native_connection_stop_required'; END IF;
  IF p_kind='test' AND v.status <> 'connected' THEN RAISE EXCEPTION 'native_connection_not_connected'; END IF;
  UPDATE public.native_agent_connections SET lease_id=gen_random_uuid(), lease_kind=p_kind,
    lease_expires_at=clock_timestamp()+interval '20 minutes', revision=revision+1, updated_at=clock_timestamp()
    WHERE id=v.id RETURNING * INTO v;
  v.profile_ciphertext := NULL; v.runtime_ciphertext := NULL;
  RETURN NEXT v;
END; $$;

CREATE FUNCTION public.check_native_agent_lease(p_id uuid,p_user_id uuid,p_engine text,
  p_generation bigint,p_lease_id uuid,p_revision bigint,p_cleanup boolean)
RETURNS public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  IF p_user_id IS NULL OR pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'native_connection_invalid_request';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,5911900));
  SELECT * INTO v FROM public.native_agent_connections WHERE id=p_id AND user_id=p_user_id AND engine=p_engine FOR UPDATE;
  IF NOT FOUND OR v.generation IS DISTINCT FROM p_generation OR v.lease_id IS DISTINCT FROM p_lease_id
    OR p_lease_id IS NULL OR v.revision IS DISTINCT FROM p_revision THEN
    RAISE EXCEPTION 'native_connection_stale_lease';
  END IF;
  IF NOT p_cleanup AND (v.lease_kind='stop' OR v.lease_expires_at <= clock_timestamp()
    OR EXISTS (SELECT 1 FROM public.agent_account_erasure_fences WHERE user_id=p_user_id)) THEN
    RAISE EXCEPTION 'native_connection_stop_required';
  END IF;
  RETURN v;
END; $$;

CREATE FUNCTION public.read_native_agent_connection(p_id uuid,p_user_id uuid,p_engine text,
  p_generation bigint,p_lease_id uuid,p_revision bigint,p_runtime boolean,p_execution boolean DEFAULT false)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  IF p_runtime IS NULL OR p_execution IS NULL THEN RAISE EXCEPTION 'native_connection_invalid_request'; END IF;
  -- Cleanup may recover an expired controller. Ordinary native execution must
  -- still observe expiry, stop authority and the committed account-erasure fence.
  v := public.check_native_agent_lease(p_id,p_user_id,p_engine,p_generation,p_lease_id,p_revision,p_runtime AND NOT p_execution);
  IF p_runtime THEN v.profile_ciphertext := NULL; ELSE v.runtime_ciphertext := NULL; END IF;
  RETURN NEXT v;
END; $$;

CREATE FUNCTION public.write_native_agent_connection(p_id uuid,p_user_id uuid,p_engine text,
  p_generation bigint,p_lease_id uuid,p_revision bigint,p_runtime boolean,p_ciphertext text)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  IF p_runtime IS NULL OR (NOT p_runtime AND p_ciphertext IS NULL) THEN
    RAISE EXCEPTION 'native_connection_invalid_request';
  END IF;
  v := public.check_native_agent_lease(p_id,p_user_id,p_engine,p_generation,p_lease_id,p_revision,false);
  IF p_runtime THEN
    UPDATE public.native_agent_connections SET runtime_ciphertext=p_ciphertext,revision=revision+1,
      updated_at=clock_timestamp() WHERE id=v.id RETURNING * INTO v;
  ELSE
    UPDATE public.native_agent_connections SET profile_ciphertext=p_ciphertext,status='connected',revision=revision+1,
      updated_at=clock_timestamp() WHERE id=v.id RETURNING * INTO v;
  END IF;
  v.profile_ciphertext := NULL; v.runtime_ciphertext := NULL;
  RETURN NEXT v;
END; $$;

CREATE FUNCTION public.release_native_agent_connection(p_id uuid,p_user_id uuid,p_engine text,
  p_generation bigint,p_lease_id uuid,p_revision bigint)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  v := public.check_native_agent_lease(p_id,p_user_id,p_engine,p_generation,p_lease_id,p_revision,true);
  UPDATE public.native_agent_connections SET lease_id=NULL,lease_kind=NULL,lease_expires_at=NULL,
    runtime_ciphertext=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE id=v.id RETURNING * INTO v;
  v.profile_ciphertext := NULL;
  RETURN NEXT v;
END; $$;

CREATE FUNCTION public.disconnect_native_agent_connection(p_user_id uuid,p_engine text,
  p_expected_lease_id uuid DEFAULT NULL,p_expected_generation bigint DEFAULT NULL)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  IF p_user_id IS NULL OR p_engine IS NULL OR p_engine NOT IN ('codex','claude_code')
    OR (p_expected_lease_id IS NULL) <> (p_expected_generation IS NULL)
    OR pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'native_connection_invalid_request';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,5911900));
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'native_connection_owner_unavailable'; END IF;
  INSERT INTO public.native_agent_connections(user_id,engine) VALUES(p_user_id,p_engine)
    ON CONFLICT (user_id,engine) DO NOTHING;
  SELECT * INTO v FROM public.native_agent_connections WHERE user_id=p_user_id AND engine=p_engine FOR UPDATE;
  IF p_expected_lease_id IS NOT NULL AND (v.lease_id IS DISTINCT FROM p_expected_lease_id
    OR v.generation IS DISTINCT FROM p_expected_generation) THEN
    RAISE EXCEPTION 'native_connection_stale_lease';
  END IF;
  -- Repeated disconnects keep the same cleanup authority. Existing tombstones are never deleted.
  IF v.status='disconnected' AND (v.lease_id IS NULL OR v.lease_kind='stop') THEN RETURN NEXT v; RETURN; END IF;
  UPDATE public.native_agent_connections SET profile_ciphertext=NULL,status='disconnected',generation=generation+1,
    revision=revision+1,lease_id=CASE WHEN lease_id IS NOT NULL THEN gen_random_uuid() END,
    lease_kind=CASE WHEN lease_id IS NOT NULL THEN 'stop' END,updated_at=clock_timestamp()
    WHERE id=v.id RETURNING * INTO v;
  RETURN NEXT v;
END; $$;

REVOKE ALL ON FUNCTION public.acquire_native_agent_connection(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_native_agent_lease(uuid,uuid,text,bigint,uuid,bigint,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_native_agent_connection(uuid,uuid,text,bigint,uuid,bigint,boolean,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_native_agent_connection(uuid,uuid,text,bigint,uuid,bigint,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_native_agent_connection(uuid,uuid,text,bigint,uuid,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disconnect_native_agent_connection(uuid,text,uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_native_agent_connection(uuid,text,text),
  public.read_native_agent_connection(uuid,uuid,text,bigint,uuid,bigint,boolean,boolean),
  public.write_native_agent_connection(uuid,uuid,text,bigint,uuid,bigint,boolean,text),
  public.release_native_agent_connection(uuid,uuid,text,bigint,uuid,bigint),
  public.disconnect_native_agent_connection(uuid,text,uuid,bigint) TO service_role;
