-- Recovery claims never survive these disposable local fixture transactions.
BEGIN;
INSERT INTO auth.users(id) VALUES('67640000-0000-4000-8000-000000000001');
INSERT INTO public.projects(id,owner_id,name,key) VALUES('67640000-0000-4000-8000-000000000010',
 '67640000-0000-4000-8000-000000000001','Recovery fixture','NWRC');
INSERT INTO public.agent_conversations(id,project_id,owner_id,visibility) VALUES('67640000-0000-4000-8000-000000000020',
 '67640000-0000-4000-8000-000000000010','67640000-0000-4000-8000-000000000001','private');
DO $$ DECLARE c public.native_agent_connections; r public.agent_runs; aid uuid;
 v_run_id uuid:='67640000-0000-4000-8000-000000000030'; claim_id uuid:='67640000-0000-4000-8000-000000000040';
 old_rest timestamptz; affected integer; name text:='agent-v2-67640000-0000-4000-8000-000000000030-676400000001'; result uuid; n integer;
BEGIN
 IF has_function_privilege('authenticated','public.claim_native_worker_recovery(uuid,timestamptz,timestamptz,text,text,uuid)','EXECUTE')
  OR has_function_privilege('anon','public.claim_native_worker_recovery(uuid,timestamptz,timestamptz,text,text,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Recovery RPC is not service-only'; END IF;
 SELECT * INTO c FROM public.acquire_native_agent_connection('67640000-0000-4000-8000-000000000001','codex','login');
 SELECT * INTO c FROM public.write_native_agent_connection(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision,false,
  '{"format":3,"encoding":"json","keyVersion":1,"data":"fixture-only"}');
 SELECT * INTO c FROM public.release_native_agent_connection(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision);
 INSERT INTO public.agent_runs(id,run_id,project_id,conversation_id,created_by,agent_engine,key_mode,model,
 worker_model_source,worker_model_provider,native_connection_id,native_connection_generation,loop_in_vm)
 VALUES(v_run_id,v_run_id,'67640000-0000-4000-8000-000000000010','67640000-0000-4000-8000-000000000020',
 c.user_id,'codex','subscription','codex/default','account','openai',c.id,c.generation,true);
 PERFORM public.claim_agent_run(v_run_id);
 SELECT * INTO c FROM public.acquire_native_worker_connection(v_run_id);
 aid:=public.reserve_agent_sandbox_allocation(v_run_id,name);
 SELECT * INTO c FROM public.bind_native_worker_allocation(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision,aid);
 PERFORM public.settle_agent_sandbox_allocation(aid); PERFORM public.attach_agent_sandbox_allocation(aid);
 UPDATE public.agent_runs SET sandbox_id=name,loop_command_id='fixture-command' WHERE id=v_run_id RETURNING * INTO r;
 -- Heartbeat and physical replacement snapshots must lose without fencing the current worker.
 result:=public.claim_native_worker_recovery(v_run_id,r.started_at,r.last_activity_at-interval '1 second',r.loop_command_id,name,claim_id);
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Stale heartbeat snapshot acquired recovery'; END IF;
 result:=public.claim_native_worker_recovery(v_run_id,r.started_at,r.last_activity_at,r.loop_command_id,'replacement',claim_id);
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Stale allocation snapshot acquired recovery'; END IF;
 PERFORM public.get_native_worker_connection(v_run_id,name,true);
 PERFORM public.claim_agent_run_rest(v_run_id);
 result:=public.claim_native_worker_recovery(v_run_id,r.started_at,r.last_activity_at,r.loop_command_id,name,claim_id);
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Recovery stole a completed report claim'; END IF;
 old_rest:=clock_timestamp()-interval '21 minutes';
 UPDATE public.agent_runs SET rest_claimed_at=old_rest WHERE id=v_run_id;
 result:=public.claim_native_worker_recovery(v_run_id,r.started_at,r.last_activity_at,r.loop_command_id,name,claim_id);
 IF result IS DISTINCT FROM claim_id THEN RAISE EXCEPTION 'Exact snapshot did not claim abandoned completion recovery'; END IF;
 IF EXISTS(SELECT 1 FROM public.agent_runs WHERE id=v_run_id AND rest_claimed_at=old_rest) THEN
  RAISE EXCEPTION 'Abandoned completion takeover retained the old report timestamp'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_runs WHERE id=v_run_id AND sandbox_reap_claim=claim_id AND rest_claimed_at IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM public.native_agent_connections WHERE id=c.id AND lease_kind='stop' AND profile_ciphertext IS NOT NULL) THEN
  RAISE EXCEPTION 'Recovery did not atomically reserve reporting and stop execution'; END IF;
 SELECT count(*) INTO n FROM public.claim_agent_run_rest(v_run_id);
 IF n<>0 THEN RAISE EXCEPTION 'Late report won after recovery'; END IF;
 BEGIN
  PERFORM public.get_native_worker_connection(v_run_id,name,true);
  RAISE EXCEPTION 'Recovery retained native execution authority';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stop_required' THEN RAISE; END IF; END;
 result:=public.claim_native_worker_recovery(v_run_id,r.started_at,r.last_activity_at,r.loop_command_id,name,gen_random_uuid());
 IF result IS DISTINCT FROM claim_id THEN RAISE EXCEPTION 'Retry replaced an unfinished recovery claim'; END IF;
 SELECT * INTO c FROM public.get_native_worker_connection(v_run_id,NULL,false);
 PERFORM public.revoke_agent_sandbox_allocation(aid); PERFORM public.complete_agent_allocation_cleanup(aid);
 SELECT * INTO c FROM public.release_native_agent_connection(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision);
 result:=public.claim_native_worker_recovery(v_run_id,r.started_at,r.last_activity_at,r.loop_command_id,name,gen_random_uuid());
 IF result IS DISTINCT FROM claim_id THEN RAISE EXCEPTION 'Retry after lease release lost recovery'; END IF;
 -- Even after a cleanup clears its claim, a suspended old completion cannot land.
 UPDATE public.agent_runs SET sandbox_reap_claim=NULL WHERE id=v_run_id;
 UPDATE public.agent_runs SET status='completed' WHERE id=v_run_id AND status='running'
  AND rest_claimed_at=old_rest AND sandbox_reap_claim IS NULL AND started_at=r.started_at AND sandbox_id=name;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'Late completion landed after abandoned takeover'; END IF;
 UPDATE public.agent_runs SET sandbox_reap_claim=claim_id WHERE id=v_run_id;
 BEGIN
  PERFORM public.acquire_native_worker_connection(v_run_id);
  RAISE EXCEPTION 'Pending recovery admitted a replacement native worker';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_worker_invalid_run' THEN RAISE; END IF; END;
 UPDATE public.agent_runs SET sandbox_id='replacement' WHERE id=v_run_id;
 result:=public.claim_native_worker_recovery(v_run_id,r.started_at,r.last_activity_at,r.loop_command_id,name,gen_random_uuid());
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Retry recovered an unrelated current sandbox'; END IF;
END; $$;
ROLLBACK;
