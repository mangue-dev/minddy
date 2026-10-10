-- Disposable fixture accounts and every schema/data mutation roll back.
BEGIN;
INSERT INTO auth.users(id) VALUES ('67610000-0000-4000-8000-000000000001');
INSERT INTO public.projects(id,owner_id,name,key) VALUES
 ('67610000-0000-4000-8000-000000000010','67610000-0000-4000-8000-000000000001','Native workers','NWKR');
INSERT INTO public.agent_conversations(id,project_id,owner_id,visibility,title) VALUES
 ('67610000-0000-4000-8000-000000000020','67610000-0000-4000-8000-000000000010','67610000-0000-4000-8000-000000000001','private','Native fixture');

DO $$
DECLARE c public.native_agent_connections; w public.native_agent_connections; stale public.native_agent_connections;
  frozen_id uuid; v_run_id uuid := '67610000-0000-4000-8000-000000000030'; allocation_id uuid;
  result jsonb; values_json jsonb; revision_before bigint; count_before integer;
  cipher text := '{"format":3,"encoding":"json","keyVersion":1,"data":"test-only-ciphertext"}';
BEGIN
  IF has_function_privilege('authenticated','public.acquire_native_worker_connection(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.get_native_worker_connection(uuid,text,boolean)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.get_native_worker_allocation(uuid,uuid,text,bigint,uuid,bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'native worker RPC privileges changed'; END IF;
  SELECT * INTO c FROM public.acquire_native_agent_connection('67610000-0000-4000-8000-000000000001','codex','login');
  SELECT * INTO c FROM public.write_native_agent_connection(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision,false,cipher);
  SELECT * INTO c FROM public.release_native_agent_connection(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision);
  frozen_id := c.id;
  values_json := jsonb_build_object('id',v_run_id,'run_id',v_run_id,
    'conversation_id','67610000-0000-4000-8000-000000000020','project_id','67610000-0000-4000-8000-000000000010',
    'created_by',c.user_id,'status','queued','triggered_by','button','key_mode','subscription',
    'worker_model_source','account','worker_model_provider','openai','model','codex/default',
    'native_connection_id',c.id,'native_connection_generation',c.generation,
    'model_forced',false,'reasoning_level','medium','agent_engine','codex','loop_in_vm',true,
    'local_exec',false,'local_worktree',false,'local_issue_context_confirmed',false);
  result := public.create_agent_run_with_budget(c.user_id,'2026-10-01',1,1,values_json);
  IF result#>>'{run,id}' IS DISTINCT FROM v_run_id::text OR (result->>'granted_budget_usd')::numeric<>1 THEN
    RAISE EXCEPTION 'native worker compute budget was not reserved'; END IF;
  result := public.create_agent_run_with_budget(c.user_id,'2026-10-01',1,1,
    values_json || jsonb_build_object('id',gen_random_uuid(),'run_id',gen_random_uuid()));
  IF result#>>'{run,id}' IS NOT NULL THEN RAISE EXCEPTION 'subscription compute escaped concurrent reservations'; END IF;
  BEGIN
    UPDATE public.agent_runs SET native_connection_generation=2 WHERE id=v_run_id;
    RAISE EXCEPTION 'frozen native connection generation changed';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_worker_contract_immutable' THEN RAISE; END IF; END;
  BEGIN
    INSERT INTO public.agent_runs(id,conversation_id,project_id,created_by,agent_engine,key_mode,model,
      worker_model_source,worker_model_provider,loop_in_vm,native_connection_id)
    VALUES(gen_random_uuid(),'67610000-0000-4000-8000-000000000020','67610000-0000-4000-8000-000000000010',
      c.user_id,'codex','subscription','codex/default','account','openai',true,c.id);
    RAISE EXCEPTION 'native worker accepted null generation';
  EXCEPTION WHEN check_violation THEN NULL;
    WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_worker_connection_unavailable' THEN RAISE; END IF;
  END;
  PERFORM public.claim_agent_run(v_run_id);
  SELECT * INTO w FROM public.acquire_native_worker_connection(v_run_id);
  IF w.lease_kind<>'worker' OR w.worker_run_id<>v_run_id OR w.profile_ciphertext IS NOT NULL THEN
    RAISE EXCEPTION 'worker lease admission leaked credentials or lost binding'; END IF;
  SELECT count(*) INTO count_before FROM public.acquire_native_worker_connection(v_run_id);
  IF count_before<>0 THEN RAISE EXCEPTION 'busy subscription was reclaimed'; END IF;
  allocation_id := public.reserve_agent_sandbox_allocation(v_run_id,'agent-v2-67610000-0000-4000-8000-000000000030-676100000001');
  SELECT * INTO w FROM public.bind_native_worker_allocation(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,allocation_id);
  BEGIN
    PERFORM public.get_native_worker_connection(v_run_id,'agent-v2-67610000-0000-4000-8000-000000000030-676100000001',true);
    RAISE EXCEPTION 'unsettled allocation received worker execution authority';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_worker_allocation_invalid' THEN RAISE; END IF; END;
  PERFORM public.settle_agent_sandbox_allocation(allocation_id);
  PERFORM public.attach_agent_sandbox_allocation(allocation_id);
  SELECT * INTO w FROM public.get_native_worker_connection(v_run_id,'agent-v2-67610000-0000-4000-8000-000000000030-676100000001',true);
  IF w.profile_ciphertext IS NOT NULL OR w.runtime_ciphertext IS NOT NULL THEN RAISE EXCEPTION 'worker metadata exposed ciphertext'; END IF;
  BEGIN
    PERFORM public.get_native_worker_connection(v_run_id,'other-sandbox',true);
    RAISE EXCEPTION 'unrelated sandbox received worker authority';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_worker_allocation_invalid' THEN RAISE; END IF; END;
  revision_before:=w.revision;
  SELECT * INTO w FROM public.renew_native_worker_connection(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision);
  IF w.revision<>revision_before THEN RAISE EXCEPTION 'heartbeat invalidated profile write-back revision'; END IF;
  UPDATE public.native_agent_connections SET lease_expires_at=clock_timestamp()-interval '1 minute' WHERE id=w.id;
  BEGIN
    PERFORM public.get_native_worker_connection(v_run_id,'agent-v2-67610000-0000-4000-8000-000000000030-676100000001',true);
    RAISE EXCEPTION 'expired native worker retained execution authority';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stop_required' THEN RAISE; END IF; END;
  PERFORM public.get_native_worker_connection(v_run_id,NULL,false);
  UPDATE public.native_agent_connections SET lease_expires_at=clock_timestamp()+interval '20 minutes' WHERE id=w.id;
  INSERT INTO public.agent_account_erasure_fences(user_id) VALUES(w.user_id);
  BEGIN
    PERFORM public.read_native_agent_connection(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision,false);
    RAISE EXCEPTION 'erasing account restored worker credentials';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stop_required' THEN RAISE; END IF; END;
  PERFORM public.get_native_worker_connection(v_run_id,NULL,false);
  DELETE FROM public.agent_account_erasure_fences WHERE user_id=w.user_id;
  BEGIN
    PERFORM public.release_native_agent_connection(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision);
    RAISE EXCEPTION 'worker credentials were released before allocation teardown';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_worker_cleanup_unconfirmed' THEN RAISE; END IF; END;
  stale:=w;
  SELECT * INTO w FROM public.disconnect_native_agent_connection(w.user_id,w.engine,w.lease_id,w.generation);
  IF w.worker_run_id<>v_run_id OR w.worker_allocation_id<>allocation_id OR w.lease_kind<>'stop' THEN
    RAISE EXCEPTION 'disconnect discarded worker cleanup evidence'; END IF;
  BEGIN
    PERFORM public.write_native_agent_connection(stale.id,stale.user_id,stale.engine,stale.generation,stale.lease_id,stale.revision,false,cipher);
    RAISE EXCEPTION 'late worker resurrected disconnected native profile';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stale_lease' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.get_native_worker_connection(v_run_id,'agent-v2-67610000-0000-4000-8000-000000000030-676100000001',true);
    RAISE EXCEPTION 'disconnected worker retained tool authority';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stop_required' THEN RAISE; END IF; END;
  SELECT * INTO w FROM public.get_native_worker_connection(v_run_id,NULL,false);
  PERFORM public.get_native_worker_allocation(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision);
  PERFORM public.revoke_agent_sandbox_allocation(allocation_id);
  PERFORM public.complete_agent_allocation_cleanup(allocation_id);
  SELECT * INTO w FROM public.release_native_agent_connection(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision);
  IF w.worker_run_id IS NOT NULL OR w.worker_allocation_id IS NOT NULL OR w.lease_id IS NOT NULL THEN
    RAISE EXCEPTION 'confirmed teardown retained stale worker authority'; END IF;
  BEGIN
    PERFORM public.acquire_native_worker_connection(v_run_id);
    RAISE EXCEPTION 'old frozen run used a reconnected credential generation';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_not_connected' THEN RAISE; END IF; END;
  SELECT * INTO c FROM public.acquire_native_agent_connection(w.user_id,'codex','login');
  SELECT * INTO c FROM public.write_native_agent_connection(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision,false,cipher);
  SELECT * INTO c FROM public.release_native_agent_connection(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision);
  -- A pre-injection bootstrap failure preserves the profile and its generation.
  UPDATE public.agent_runs SET status='completed' WHERE id=v_run_id;
  v_run_id:=gen_random_uuid();
  values_json:=values_json || jsonb_build_object('id',v_run_id,'run_id',v_run_id,'native_connection_generation',c.generation);
  result:=public.create_agent_run_with_budget(c.user_id,'2026-10-01',10,1,values_json);
  PERFORM public.claim_agent_run(v_run_id);
  SELECT * INTO w FROM public.acquire_native_worker_connection(v_run_id);
  SELECT * INTO w FROM public.stop_native_worker_connection(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision);
  IF w.status<>'connected' OR w.generation<>c.generation OR w.lease_kind<>'stop' THEN
    RAISE EXCEPTION 'pre-injection failure discarded the account profile'; END IF;
  SELECT * INTO w FROM public.release_native_agent_connection(w.id,w.user_id,w.engine,w.generation,w.lease_id,w.revision);
  IF w.status<>'connected' THEN RAISE EXCEPTION 'pre-injection cleanup disconnected the account'; END IF;
  PERFORM public.upsert_agent_preferences_protected(c.user_id,'{"default_engine":"codex"}',
    'mdye3:{"format":3,"keyVersion":1}',true);
  PERFORM public.upsert_agent_preferences_protected(c.user_id,'{"default_model":"fixture"}',
    'mdye3:{"format":3,"keyVersion":1}',false);
  IF NOT EXISTS(SELECT 1 FROM public.user_agent_preferences WHERE user_id=c.user_id AND default_engine='codex' AND default_model='fixture') THEN
    RAISE EXCEPTION 'partial model preference update cleared the selected native engine'; END IF;
END; $$;
ROLLBACK;
