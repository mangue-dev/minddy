-- Save native credentials and their stopped-process cleanup evidence in one revision.
BEGIN;
CREATE FUNCTION public.commit_native_worker_profile(p_id uuid,p_user_id uuid,p_engine text,
  p_generation bigint,p_lease_id uuid,p_revision bigint,p_profile_ciphertext text,p_runtime_ciphertext text)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  IF p_profile_ciphertext IS NULL OR p_runtime_ciphertext IS NULL THEN
    RAISE EXCEPTION 'native_connection_invalid_request';
  END IF;
  v:=public.check_native_agent_lease(p_id,p_user_id,p_engine,p_generation,p_lease_id,p_revision,false);
  IF v.lease_kind<>'worker' OR v.worker_run_id IS NULL OR v.worker_allocation_id IS NULL THEN
    RAISE EXCEPTION 'native_worker_allocation_invalid';
  END IF;
  -- The table checks require both values to be bounded format-3 JSON ciphertext.
  -- A failed value, stale fence or lost transaction cannot leave a partial save.
  UPDATE public.native_agent_connections SET profile_ciphertext=p_profile_ciphertext,
    runtime_ciphertext=p_runtime_ciphertext,status='connected',revision=revision+1,
    updated_at=clock_timestamp() WHERE id=v.id RETURNING * INTO v;
  v.profile_ciphertext:=NULL; v.runtime_ciphertext:=NULL;
  RETURN NEXT v;
END; $$;
REVOKE ALL ON FUNCTION public.commit_native_worker_profile(uuid,uuid,text,bigint,uuid,bigint,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_native_worker_profile(uuid,uuid,text,bigint,uuid,bigint,text,text)
  TO service_role;

CREATE FUNCTION public.commit_native_login_profile(p_id uuid,p_user_id uuid,p_engine text,
  p_generation bigint,p_lease_id uuid,p_revision bigint,p_profile_ciphertext text,p_runtime_ciphertext text)
RETURNS SETOF public.native_agent_connections LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.native_agent_connections;
BEGIN
  IF p_profile_ciphertext IS NULL OR p_runtime_ciphertext IS NULL THEN
    RAISE EXCEPTION 'native_connection_invalid_request';
  END IF;
  v:=public.check_native_agent_lease(p_id,p_user_id,p_engine,p_generation,p_lease_id,p_revision,false);
  IF v.lease_kind IS DISTINCT FROM 'login' OR v.worker_run_id IS NOT NULL OR v.worker_allocation_id IS NOT NULL THEN
    RAISE EXCEPTION 'native_connection_invalid_request';
  END IF;
  UPDATE public.native_agent_connections SET profile_ciphertext=p_profile_ciphertext,
    runtime_ciphertext=p_runtime_ciphertext,status='connected',revision=revision+1,
    updated_at=clock_timestamp() WHERE id=v.id RETURNING * INTO v;
  v.profile_ciphertext:=NULL; v.runtime_ciphertext:=NULL;
  RETURN NEXT v;
END; $$;
REVOKE ALL ON FUNCTION public.commit_native_login_profile(uuid,uuid,text,bigint,uuid,bigint,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_native_login_profile(uuid,uuid,text,bigint,uuid,bigint,text,text)
  TO service_role;
COMMIT;
