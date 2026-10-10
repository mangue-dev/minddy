BEGIN;
INSERT INTO auth.users(id,email) VALUES
  ('67600000-0000-4000-8000-000000000001','native-owner@example.test'),
  ('67600000-0000-4000-8000-000000000002','native-other@example.test');

DO $$
DECLARE v public.native_agent_connections; stale public.native_agent_connections; stopped public.native_agent_connections;
  cipher text := '{"format":3,"encoding":"json","keyVersion":1,"data":"test-only-ciphertext"}';
BEGIN
  IF pg_catalog.has_table_privilege('authenticated','public.native_agent_connections','SELECT')
    OR pg_catalog.has_table_privilege('service_role','public.native_agent_connections','UPDATE')
    OR pg_catalog.has_function_privilege('authenticated','public.acquire_native_agent_connection(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'native credential client privileges were exposed';
  END IF;
  SELECT * INTO v FROM public.acquire_native_agent_connection('67600000-0000-4000-8000-000000000001','codex','login');
  stale := v;
  BEGIN
    PERFORM public.acquire_native_agent_connection(v.user_id,'codex','login');
    RAISE EXCEPTION 'concurrent login acquired an active credential';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'native_connection_stop_required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.write_native_agent_connection(v.id,'67600000-0000-4000-8000-000000000002',v.engine,v.generation,v.lease_id,v.revision,false,cipher);
    RAISE EXCEPTION 'another owner wrote native credentials';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'native_connection_stale_lease' THEN RAISE; END IF;
  END;
  SELECT * INTO v FROM public.write_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision,false,cipher);
  BEGIN
    PERFORM public.write_native_agent_connection(stale.id,stale.user_id,stale.engine,stale.generation,stale.lease_id,stale.revision,false,cipher);
    RAISE EXCEPTION 'stale revision overwrote the profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'native_connection_stale_lease' THEN RAISE; END IF;
  END;
  SELECT * INTO v FROM public.write_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision,true,cipher);
  stale := v;
  SELECT * INTO stopped FROM public.disconnect_native_agent_connection(v.user_id,v.engine);
  IF stopped.status <> 'disconnected' OR stopped.profile_ciphertext IS NOT NULL OR stopped.lease_kind <> 'stop'
    OR stopped.generation <= stale.generation OR stopped.lease_id=stale.lease_id OR stopped.runtime_ciphertext IS NULL THEN
    RAISE EXCEPTION 'disconnect lost cleanup authority or preserved the profile';
  END IF;
  SELECT * INTO v FROM public.read_native_agent_connection(stopped.id,stopped.user_id,stopped.engine,
    stopped.generation,stopped.lease_id,stopped.revision,true);
  IF v.runtime_ciphertext IS NULL OR v.profile_ciphertext IS NOT NULL THEN
    RAISE EXCEPTION 'stop authority could not read its encrypted controller descriptor';
  END IF;
  BEGIN
    PERFORM public.disconnect_native_agent_connection(stale.user_id,stale.engine,stale.lease_id,stale.generation);
    RAISE EXCEPTION 'stale cancellation revoked a newer cleanup authority';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'native_connection_stale_lease' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.write_native_agent_connection(stale.id,stale.user_id,stale.engine,stale.generation,stale.lease_id,stale.revision,false,cipher);
    RAISE EXCEPTION 'late worker resurrected a disconnected profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'native_connection_stale_lease' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.acquire_native_agent_connection(v.user_id,'codex','login');
    RAISE EXCEPTION 'disconnect released a process before confirmed stop';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'native_connection_stop_required' THEN RAISE; END IF;
  END;
  SELECT * INTO v FROM public.disconnect_native_agent_connection(stopped.user_id,stopped.engine);
  IF v.lease_id <> stopped.lease_id OR v.generation <> stopped.generation THEN
    RAISE EXCEPTION 'disconnect retry invalidated its own stop authority';
  END IF;
  SELECT * INTO stopped FROM public.release_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision);
  IF stopped.lease_id IS NOT NULL OR stopped.runtime_ciphertext IS NOT NULL THEN RAISE EXCEPTION 'release retained runtime authority'; END IF;
  SELECT * INTO v FROM public.acquire_native_agent_connection(v.user_id,'codex','login');
  UPDATE public.native_agent_connections SET lease_expires_at=clock_timestamp()-interval '1 minute' WHERE id=v.id;
  PERFORM public.read_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision,true);
  BEGIN
    PERFORM public.read_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision,true,true);
    RAISE EXCEPTION 'expired controller was admitted to native execution';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'native_connection_stop_required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.acquire_native_agent_connection(v.user_id,'codex','login');
    RAISE EXCEPTION 'expired lease was silently reclaimed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'native_connection_stop_required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.write_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision,false,cipher);
    RAISE EXCEPTION 'expired worker committed credentials';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'native_connection_stop_required' THEN RAISE; END IF;
  END;
  SELECT * INTO v FROM public.release_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision);
  SELECT * INTO v FROM public.acquire_native_agent_connection(v.user_id,'claude_code','login');
  BEGIN
    PERFORM public.write_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision,false,'{}');
    RAISE EXCEPTION 'plaintext native profile was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.agent_account_erasure_fences(user_id) VALUES(v.user_id);
  PERFORM public.read_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision,true);
  BEGIN
    PERFORM public.read_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision,true,true);
    RAISE EXCEPTION 'native execution crossed account erasure fence';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'native_connection_stop_required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.write_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision,false,cipher);
    RAISE EXCEPTION 'worker crossed account erasure fence';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'native_connection_stop_required' THEN RAISE; END IF;
  END;
  PERFORM public.release_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision);
  DELETE FROM auth.users WHERE id=v.user_id;
  IF EXISTS (SELECT 1 FROM public.native_agent_connections WHERE user_id=v.user_id) THEN
    RAISE EXCEPTION 'account deletion retained native credentials';
  END IF;
END; $$;
SET LOCAL ROLE service_role;
DO $$
DECLARE v public.native_agent_connections;
BEGIN
  SELECT * INTO v FROM public.acquire_native_agent_connection('67600000-0000-4000-8000-000000000002','codex','login');
  SELECT * INTO v FROM public.write_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision,
    false,'{"format":3,"encoding":"json","keyVersion":1,"data":"test-only-ciphertext"}');
  SELECT * INTO v FROM public.release_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision);
  IF v.status <> 'connected' OR v.lease_id IS NOT NULL THEN
    RAISE EXCEPTION 'runtime release hid a successfully connected profile from metadata';
  END IF;
  SELECT * INTO v FROM public.acquire_native_agent_connection(v.user_id,'codex','test');
  SELECT * INTO v FROM public.read_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision,false);
  IF v.profile_ciphertext IS NULL OR v.runtime_ciphertext IS NOT NULL THEN
    RAISE EXCEPTION 'a fresh test lease could not load the saved native profile';
  END IF;
  PERFORM public.release_native_agent_connection(v.id,v.user_id,v.engine,v.generation,v.lease_id,v.revision);
END; $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.acquire_native_agent_connection('67600000-0000-4000-8000-000000000002','codex','login');
    RAISE EXCEPTION 'client role called a service-only native auth operation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END; $$;
RESET ROLE;
ROLLBACK;
