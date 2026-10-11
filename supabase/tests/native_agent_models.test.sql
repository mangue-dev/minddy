-- Disposable accounts and all preference/catalog fixtures roll back.
BEGIN;
INSERT INTO auth.users(id) VALUES ('67660000-0000-4000-8000-000000000001'),('67660000-0000-4000-8000-000000000002');
INSERT INTO public.projects(id,owner_id,name,key) VALUES
 ('67660000-0000-4000-8000-000000000010','67660000-0000-4000-8000-000000000001','Native model fixtures','NMOD');
INSERT INTO public.agent_conversations(id,project_id,owner_id,visibility,title) VALUES
 ('67660000-0000-4000-8000-000000000020','67660000-0000-4000-8000-000000000010','67660000-0000-4000-8000-000000000001','private','Native fixture');
DO $$
DECLARE c public.native_agent_connections; previous public.native_agent_connections; actual public.native_agent_connections;
  selected_run public.agent_runs; run_result jsonb;
  prefs public.user_agent_preferences; changed public.user_agent_preferences;
  cipher text:='{"format":3,"encoding":"json","keyVersion":1,"data":"test-only-original"}';
  rotated text:='{"format":3,"encoding":"json","keyVersion":1,"data":"test-only-rotated"}';
  runtime text:='{"format":3,"encoding":"json","keyVersion":1,"data":"test-only-runtime"}';
  fixture_models jsonb:='[{"id":"codex-fixture","displayName":"Fixture","supportedReasoningEfforts":["medium","ultra"],"defaultReasoningEffort":"medium","isDefault":true}]';
BEGIN
  IF has_table_privilege('authenticated','public.native_agent_model_catalogs','SELECT')
    OR has_table_privilege('authenticated','public.native_agent_model_catalogs','INSERT')
    OR has_function_privilege('authenticated','public.commit_native_catalog_profile(uuid,uuid,text,bigint,uuid,bigint,text,text,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.commit_native_catalog_profile(uuid,uuid,text,bigint,uuid,bigint,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'catalog ownership or service-only publication changed'; END IF;
  SELECT * INTO prefs FROM public.upsert_agent_preferences_protected('67660000-0000-4000-8000-000000000001',
    '{"default_model":"api/original","native_model_preferences":{"codex":{"model":"codex-fixture","reasoningEffort":"ultra"}}}', 'mdye3:'||cipher,false);
  SELECT * INTO changed FROM public.upsert_agent_preferences_protected(prefs.user_id,
    '{"native_model_preferences":{"claude_code":{"model":"sonnet","reasoningEffort":"max"}}}', 'mdye3:'||cipher,false);
  IF changed.default_model IS DISTINCT FROM 'api/original' OR changed.native_model_preferences->'codex' IS DISTINCT FROM prefs.native_model_preferences->'codex'
    OR changed.native_model_preferences#>>'{claude_code,model}' IS DISTINCT FROM 'sonnet' THEN
    RAISE EXCEPTION 'partial native preference writes erased another engine or API defaults'; END IF;
  BEGIN
    PERFORM public.upsert_agent_preferences_protected(prefs.user_id,'{"native_model_preferences":{"claude_code":{"model":"sonnet","reasoningEffort":"ultra"}}}', 'mdye3:'||cipher,false);
    RAISE EXCEPTION 'invalid native effort accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  SELECT * INTO c FROM public.acquire_native_agent_connection(prefs.user_id,'codex','login');
  SELECT * INTO c FROM public.write_native_agent_connection(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision,false,cipher);
  SELECT * INTO c FROM public.release_native_agent_connection(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision);
  run_result:=public.create_agent_run_with_budget(c.user_id,'2026-10-01',1,1,jsonb_build_object(
    'id','67660000-0000-4000-8000-000000000030','run_id','67660000-0000-4000-8000-000000000030',
    'conversation_id','67660000-0000-4000-8000-000000000020','project_id','67660000-0000-4000-8000-000000000010',
    'created_by',c.user_id,'status','queued','triggered_by','button','key_mode','subscription',
    'worker_model_source','account','worker_model_provider','openai','model','codex/codex-fixture',
    'native_reasoning_effort','ultra','native_connection_id',c.id,'native_connection_generation',c.generation,
    'model_forced',false,'reasoning_level','medium','agent_engine','codex','loop_in_vm',true,
    'local_exec',false,'local_worktree',false,'local_issue_context_confirmed',false));
  SELECT * INTO selected_run FROM public.agent_runs WHERE id='67660000-0000-4000-8000-000000000030';
  IF selected_run.model IS DISTINCT FROM 'codex/codex-fixture' OR selected_run.native_reasoning_effort IS DISTINCT FROM 'ultra' THEN
    RAISE EXCEPTION 'budget RPC did not freeze the selected native model and effort'; END IF;
  BEGIN
    UPDATE public.agent_runs SET native_reasoning_effort='medium' WHERE id=selected_run.id;
    RAISE EXCEPTION 'native worker effort changed after launch';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_worker_contract_immutable' THEN RAISE; END IF; END;
  BEGIN
    UPDATE public.agent_runs SET model='codex/default' WHERE id=selected_run.id;
    RAISE EXCEPTION 'native worker model changed after launch';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_worker_contract_immutable' THEN RAISE; END IF; END;
  SELECT * INTO c FROM public.acquire_native_agent_connection(prefs.user_id,'codex','test');
  previous:=c;
  BEGIN
    PERFORM public.commit_native_catalog_profile(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision,rotated,'{}',fixture_models);
    RAISE EXCEPTION 'invalid runtime left discovery metadata committed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.native_agent_model_catalogs WHERE user_id=c.user_id) THEN RAISE EXCEPTION 'catalog publication survived a failed credential save'; END IF;
  SELECT * INTO actual FROM public.native_agent_connections WHERE id=c.id;
  IF actual.profile_ciphertext IS DISTINCT FROM cipher OR actual.revision<>c.revision THEN RAISE EXCEPTION 'failed catalog save partially rotated profile'; END IF;
  BEGIN
    PERFORM public.commit_native_catalog_profile(c.id,'67660000-0000-4000-8000-000000000002',c.engine,c.generation,c.lease_id,c.revision,rotated,runtime,fixture_models);
    RAISE EXCEPTION 'other owner published catalog';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stale_lease' THEN RAISE; END IF; END;
  SELECT * INTO c FROM public.commit_native_catalog_profile(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision,rotated,runtime,fixture_models);
  SELECT * INTO actual FROM public.native_agent_connections WHERE id=c.id;
  IF actual.profile_ciphertext IS DISTINCT FROM rotated OR actual.runtime_ciphertext IS DISTINCT FROM runtime
    OR c.revision<>previous.revision+1 OR NOT EXISTS(SELECT 1 FROM public.native_agent_model_catalogs WHERE user_id=c.user_id AND connection_generation=c.generation AND models=fixture_models) THEN
    RAISE EXCEPTION 'catalog publication was not atomic with renewal and cleanup evidence'; END IF;
  BEGIN
    PERFORM public.commit_native_catalog_profile(previous.id,previous.user_id,previous.engine,previous.generation,previous.lease_id,previous.revision,cipher,runtime,fixture_models);
    RAISE EXCEPTION 'stale catalog writer overwrote renewal';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'native_connection_stale_lease' THEN RAISE; END IF; END;
  SELECT * INTO c FROM public.release_native_agent_connection(c.id,c.user_id,c.engine,c.generation,c.lease_id,c.revision);
  SELECT * INTO actual FROM public.native_agent_connections WHERE id=c.id;
  IF actual.profile_ciphertext IS DISTINCT FROM rotated OR actual.runtime_ciphertext IS NOT NULL THEN RAISE EXCEPTION 'catalog cleanup discarded renewed session'; END IF;
END; $$;
ROLLBACK;
