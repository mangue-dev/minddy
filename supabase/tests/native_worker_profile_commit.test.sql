-- Disposable fixture accounts and every data mutation roll back.
BEGIN;
INSERT INTO auth.users(id) VALUES ('67650000-0000-4000-8000-000000000001'),('67650000-0000-4000-8000-000000000002');
INSERT INTO public.projects(id,owner_id,name,key) VALUES
 ('67650000-0000-4000-8000-000000000010','67650000-0000-4000-8000-000000000001','Atomic native profiles','NATM');
INSERT INTO public.agent_conversations(id,project_id,owner_id,visibility,title) VALUES
 ('67650000-0000-4000-8000-000000000020','67650000-0000-4000-8000-000000000010','67650000-0000-4000-8000-000000000001','private','Native fixture');

DO $$
DECLARE c public.native_agent_connections; w public.native_agent_connections; previous public.native_agent_connections;
  v_run_id uuid:='67650000-0000-4000-8000-000000000030'; allocation_id uuid; actual public.native_agent_connections;
  cipher text:='{"format":3,"encoding":"json","keyVersion":1,"data":"test-only-original"}';
  rotated text:='{"format":3,"encoding":"json","keyVersion":1,"data":"test-only-rotated"}';
  runtime text:='{"format":3,"encoding":"json","keyVersion":1,"data":"test-only-saved-runtime"}';
BEGIN
  IF has_function_privilege('anon','public.commit_native_login_profile(uuid,uuid,text,bigint,uuid,bigint,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.commit_native_login_profile(uuid,uuid,text,bigint,uuid,bigint,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.commit_native_login_profile(uuid,uuid,text,bigint,uuid,bigint,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.commit_native_worker_profile(uuid,uuid,text,bigint,uuid,bigint,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.commit_native_worker_profile(uuid,uuid,text,bigint,uuid,bigint,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.commit_native_worker_profile(uuid,uuid,text,bigint,uuid,bigint,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'atomic profile RPC privileges changed'; END IF;
  SELECT * INTO c FROM public.acquire_native_agent_connection('67650000-0000-4000-8000-000000000001','codex','login');
  BEGIN
    PERFORM public.commit_native_worker_profile(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision,rotated,runtime);
    RAISE EXCEPTION 'login lease committed worker cleanup evidence';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_worker_allocation_invalid' THEN RAISE; END IF; END;
  previous:=c;
  BEGIN
    PERFORM public.commit_native_login_profile(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision,cipher,'{}');
    RAISE EXCEPTION 'invalid login runtime committed credentials';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.commit_native_login_profile(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision,'{}',runtime);
    RAISE EXCEPTION 'invalid login credentials committed cleanup evidence';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.commit_native_login_profile(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision,cipher,NULL);
    RAISE EXCEPTION 'login without cleanup evidence committed credentials';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_invalid_request' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_native_login_profile(c.id,'67650000-0000-4000-8000-000000000002',c.engine,c.generation,c.lease_id,c.revision,cipher,runtime);
    RAISE EXCEPTION 'different owner committed login credentials';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stale_lease' THEN RAISE; END IF; END;
  SELECT * INTO actual FROM public.native_agent_connections WHERE id=c.id;
  IF actual.profile_ciphertext IS NOT NULL OR actual.runtime_ciphertext IS NOT NULL OR actual.revision<>c.revision
    OR actual.status<>'disconnected' THEN RAISE EXCEPTION 'rejected login commit left a partial save'; END IF;
  SELECT * INTO c FROM public.commit_native_login_profile(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision,cipher,runtime);
  IF c.profile_ciphertext IS NOT NULL OR c.runtime_ciphertext IS NOT NULL OR c.revision<>previous.revision+1
    OR c.status<>'connected' THEN RAISE EXCEPTION 'atomic login commit omitted metadata protection'; END IF;
  SELECT * INTO actual FROM public.native_agent_connections WHERE id=c.id;
  IF actual.profile_ciphertext IS DISTINCT FROM cipher OR actual.runtime_ciphertext IS DISTINCT FROM runtime THEN
    RAISE EXCEPTION 'atomic login commit omitted credentials or saved evidence'; END IF;
  BEGIN
    PERFORM public.commit_native_login_profile(previous.id,previous.user_id,previous.engine,previous.generation,
      previous.lease_id,previous.revision,rotated,runtime);
    RAISE EXCEPTION 'login replay overwrote committed credentials';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stale_lease' THEN RAISE; END IF; END;
  SELECT * INTO c FROM public.release_native_agent_connection(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision);
  SELECT * INTO actual FROM public.native_agent_connections WHERE id=c.id;
  IF actual.profile_ciphertext IS DISTINCT FROM cipher OR actual.runtime_ciphertext IS NOT NULL THEN
    RAISE EXCEPTION 'login cleanup discarded committed credentials'; END IF;
  PERFORM public.create_agent_run_with_budget(c.user_id,'2026-10-01',1,1,jsonb_build_object(
    'id',v_run_id,'run_id',v_run_id,'conversation_id','67650000-0000-4000-8000-000000000020',
    'project_id','67650000-0000-4000-8000-000000000010','created_by',c.user_id,'status','queued',
    'triggered_by','button','key_mode','subscription','worker_model_source','account','worker_model_provider','openai',
    'model','codex/default','native_connection_id',c.id,'native_connection_generation',c.generation,
    'model_forced',false,'reasoning_level','medium','agent_engine','codex','loop_in_vm',true,'local_exec',false,
    'local_worktree',false,'local_issue_context_confirmed',false));
  PERFORM public.claim_agent_run(v_run_id);
  SELECT * INTO w FROM public.acquire_native_worker_connection(v_run_id);
  BEGIN
    PERFORM public.commit_native_login_profile(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,rotated,runtime);
    RAISE EXCEPTION 'worker used login profile commit';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_invalid_request' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_native_worker_profile(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,rotated,runtime);
    RAISE EXCEPTION 'unbound worker committed profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_worker_allocation_invalid' THEN RAISE; END IF; END;
  allocation_id:=public.reserve_agent_sandbox_allocation(v_run_id,'agent-v2-67650000-0000-4000-8000-000000000030-676500000001');
  SELECT * INTO w FROM public.bind_native_worker_allocation(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,allocation_id);
  PERFORM public.settle_agent_sandbox_allocation(allocation_id);
  PERFORM public.attach_agent_sandbox_allocation(allocation_id);
  previous:=w;
  BEGIN
    PERFORM public.commit_native_worker_profile(w.id,'67650000-0000-4000-8000-000000000002',w.engine,w.generation,w.lease_id,w.revision,rotated,runtime);
    RAISE EXCEPTION 'different owner committed profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stale_lease' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_native_worker_profile(w.id,w.user_id,w.engine,w.generation+1,w.lease_id,w.revision,rotated,runtime);
    RAISE EXCEPTION 'stale generation committed profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stale_lease' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_native_worker_profile(w.id,w.user_id,'claude_code',w.generation,w.lease_id,w.revision,rotated,runtime);
    RAISE EXCEPTION 'different engine committed profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stale_lease' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_native_worker_profile(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,rotated,NULL);
    RAISE EXCEPTION 'missing cleanup evidence committed profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_invalid_request' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_native_worker_profile(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,NULL,runtime);
    RAISE EXCEPTION 'missing profile committed cleanup evidence';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_invalid_request' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.commit_native_worker_profile(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,rotated,'{}');
    RAISE EXCEPTION 'invalid runtime committed profile';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.commit_native_worker_profile(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,'{}',runtime);
    RAISE EXCEPTION 'invalid profile committed cleanup evidence';
  EXCEPTION WHEN check_violation THEN NULL; END;
  SELECT * INTO actual FROM public.native_agent_connections WHERE id=w.id;
  IF actual.profile_ciphertext IS DISTINCT FROM cipher OR actual.runtime_ciphertext IS NOT NULL OR actual.revision<>w.revision THEN
    RAISE EXCEPTION 'rejected commit changed part of the profile'; END IF;
  UPDATE public.native_agent_connections SET lease_expires_at=clock_timestamp()-interval '1 minute' WHERE id=w.id;
  BEGIN
    PERFORM public.commit_native_worker_profile(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,rotated,runtime);
    RAISE EXCEPTION 'expired worker committed profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stop_required' THEN RAISE; END IF; END;
  UPDATE public.native_agent_connections SET lease_expires_at=clock_timestamp()+interval '20 minutes' WHERE id=w.id;
  INSERT INTO public.agent_account_erasure_fences(user_id) VALUES(w.user_id);
  BEGIN
    PERFORM public.commit_native_worker_profile(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,rotated,runtime);
    RAISE EXCEPTION 'erasing account committed profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stop_required' THEN RAISE; END IF; END;
  DELETE FROM public.agent_account_erasure_fences WHERE user_id=w.user_id;
  UPDATE public.agent_runs SET sandbox_reap_claim=gen_random_uuid() WHERE id=v_run_id;
  BEGIN
    PERFORM public.commit_native_worker_profile(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,rotated,runtime);
    RAISE EXCEPTION 'revoked worker committed profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_worker_authority_revoked' THEN RAISE; END IF; END;
  UPDATE public.agent_runs SET sandbox_reap_claim=NULL WHERE id=v_run_id;
  UPDATE public.agent_sandbox_allocations SET state='revoked' WHERE id=allocation_id;
  BEGIN
    PERFORM public.commit_native_worker_profile(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,rotated,runtime);
    RAISE EXCEPTION 'revoked allocation committed profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_worker_authority_revoked' THEN RAISE; END IF; END;
  UPDATE public.agent_sandbox_allocations SET state='attached' WHERE id=allocation_id;
  SELECT * INTO w FROM public.commit_native_worker_profile(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,rotated,runtime);
  IF w.profile_ciphertext IS NOT NULL OR w.runtime_ciphertext IS NOT NULL OR w.revision<>previous.revision+1
    OR w.generation<>previous.generation OR w.lease_id<>previous.lease_id THEN
    RAISE EXCEPTION 'atomic commit leaked ciphertext or changed its authority'; END IF;
  SELECT * INTO actual FROM public.native_agent_connections WHERE id=w.id;
  IF actual.profile_ciphertext IS DISTINCT FROM rotated OR actual.runtime_ciphertext IS DISTINCT FROM runtime
    OR actual.status<>'connected' THEN RAISE EXCEPTION 'atomic commit omitted profile or cleanup evidence'; END IF;
  BEGIN
    PERFORM public.commit_native_worker_profile(previous.id,previous.user_id,previous.engine,previous.generation,
      previous.lease_id,previous.revision,cipher,runtime);
    RAISE EXCEPTION 'commit replay overwrote rotated profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stale_lease' THEN RAISE; END IF; END;
  -- Recovery observes the same saved evidence even if the successful RPC response was lost.
  SELECT * INTO w FROM public.get_native_worker_connection(v_run_id,NULL,false);
  SELECT * INTO w FROM public.stop_native_worker_connection(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision);
  SELECT * INTO actual FROM public.native_agent_connections WHERE id=w.id;
  IF actual.profile_ciphertext IS DISTINCT FROM rotated OR actual.runtime_ciphertext IS DISTINCT FROM runtime THEN
    RAISE EXCEPTION 'recovery discarded the atomically saved profile'; END IF;
  BEGIN
    PERFORM public.commit_native_worker_profile(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,cipher,runtime);
    RAISE EXCEPTION 'stopped worker committed profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stop_required' THEN RAISE; END IF; END;
  PERFORM public.revoke_agent_sandbox_allocation(allocation_id);
  PERFORM public.complete_agent_allocation_cleanup(allocation_id);
  SELECT * INTO w FROM public.release_native_agent_connection(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision);
  IF w.status<>'connected' OR w.lease_id IS NOT NULL THEN RAISE EXCEPTION 'confirmed recovery lost connected status'; END IF;
  SELECT * INTO actual FROM public.native_agent_connections WHERE id=w.id;
  IF actual.profile_ciphertext IS DISTINCT FROM rotated OR actual.runtime_ciphertext IS NOT NULL THEN
    RAISE EXCEPTION 'confirmed teardown did not preserve the renewed profile'; END IF;
END; $$;
ROLLBACK;
