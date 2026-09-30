-- Verify delegated input never leaves a clear SQL copy after conversion.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE
  actor uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid(); parent_turn uuid := gen_random_uuid();
  legacy_run uuid := gen_random_uuid(); encrypted_run uuid := gen_random_uuid();
  old_writer uuid := gen_random_uuid(); budget_run uuid := gen_random_uuid();
  brief jsonb; cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  budget_result jsonb; rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Fixture project','ADI');
  INSERT INTO public.conversations(id,project_id,user_id)
    VALUES(conversation,project,actor);
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,request_id,run_id,
    status,claim_token,claimed_at)
    VALUES(parent_turn,conversation,actor,gen_random_uuid(),gen_random_uuid(),
      'running',gen_random_uuid(),now());
  brief := jsonb_build_object('version',1,'objective','Sensitive delegated objective',
    'correlation',jsonb_build_object('parentConversationId',conversation,
      'parentTurnId',parent_turn,'toolCallId','tool-1'),
    'targetRepository',jsonb_build_object('projectId',project),
    'sourceReferences','[]'::jsonb,'constraints','[]'::jsonb,
    'authorizedWork','["read_repository"]'::jsonb,
    'expectedOutput','["summary"]'::jsonb);
  INSERT INTO public.agent_runs(id,project_id,created_by,parent_numo_conversation_id,
    parent_numo_turn_id,parent_numo_tool_call_id,delegation_brief,delegation_attachments)
    VALUES(legacy_run,project,actor,conversation,parent_turn,'tool-1',brief,
      '[{"name":"Sensitive attachment"}]'::jsonb);
  INSERT INTO public.agent_runs(id,project_id,created_by,parent_numo_conversation_id,
    parent_numo_turn_id,parent_numo_tool_call_id,encrypted_delegation_input,
    delegation_encryption_version)
    VALUES(encrypted_run,project,actor,conversation,parent_turn,'tool-2',cipher,1);
  rejected := false;
  BEGIN
    INSERT INTO public.agent_runs(id,project_id,created_by,parent_numo_conversation_id,
      parent_numo_turn_id,parent_numo_tool_call_id,delegation_brief)
      VALUES(old_writer,project,actor,conversation,parent_turn,'tool-old',
        jsonb_set(brief,'{correlation,toolCallId}','"tool-old"'));
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete delegation writer accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET delegation_attachments='[{"name":"Old edit"}]'::jsonb
      WHERE id=legacy_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete delegation attachment writer accepted'; END IF;
  IF NOT public.migrate_agent_delegation_input(legacy_run,project,parent_turn,
      brief,'[{"name":"Sensitive attachment"}]'::jsonb,NULL,0,cipher,1)
     OR public.migrate_agent_delegation_input(legacy_run,project,parent_turn,
      brief,'[{"name":"Sensitive attachment"}]'::jsonb,NULL,0,cipher,1) THEN
    RAISE EXCEPTION 'delegation compare-and-swap failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_runs WHERE id IN (legacy_run,encrypted_run)
      AND (delegation_brief IS NOT NULL OR delegation_attachments <> '[]'::jsonb
        OR encrypted_delegation_input IS NULL)) THEN
    RAISE EXCEPTION 'converted delegation retained plaintext';
  END IF;
  budget_result := public.create_agent_run_with_budget(actor,now()-interval '1 day',100,1,
    jsonb_build_object('id',budget_run,'project_id',project,'created_by',actor,
      'status','queued','triggered_by','button','key_mode','platform',
      'worker_model_source','account','worker_model_provider','openai',
      'model_forced',false,'reasoning_level','off','run_id',gen_random_uuid(),
      'loop_in_vm',true,'agent_engine','opencode','local_exec',false,
      'local_issue_context_confirmed',false,'local_worktree',false,
      'parent_numo_conversation_id',conversation,'parent_numo_turn_id',parent_turn,
      'parent_numo_tool_call_id','tool-budget',
      'encrypted_delegation_input',cipher,'delegation_encryption_version',1));
  IF budget_result->'run'->>'id' IS DISTINCT FROM budget_run::text OR
     NOT EXISTS(SELECT 1 FROM public.agent_runs WHERE id=budget_run
       AND delegation_brief IS NULL AND delegation_attachments='[]'::jsonb
       AND encrypted_delegation_input=cipher) THEN
    RAISE EXCEPTION 'managed delegated run lost encrypted input';
  END IF;
  IF has_function_privilege('authenticated',
       'public.migrate_agent_delegation_input(uuid,uuid,uuid,jsonb,jsonb,text,integer,text,integer)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'client retained delegation migration privilege';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE schemaname='public'
      AND tablename='agent_runs') THEN
    RAISE EXCEPTION 'delegation input is published to Realtime';
  END IF;
END;
$test$;
ROLLBACK;
