-- Verify that run titles and their conversation and Numo copies stay encrypted.
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
  legacy_run uuid := gen_random_uuid(); legacy_conversation uuid := gen_random_uuid();
  encrypted_run uuid := gen_random_uuid(); old_writer uuid := gen_random_uuid();
  budget_run uuid := gen_random_uuid(); budget_result jsonb;
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Fixture project','ATL');
  INSERT INTO public.agent_runs(id,project_id,created_by,title)
    VALUES(legacy_run,project,actor,'Sensitive legacy title');
  legacy_conversation := legacy_run;
  IF NOT EXISTS(SELECT 1 FROM public.agent_conversations
      WHERE id=legacy_conversation AND title='Sensitive legacy title') THEN
    RAISE EXCEPTION 'legacy title copy missing';
  END IF;
  INSERT INTO public.agent_runs(id,project_id,created_by,title_ciphertext,title_encryption_version)
    VALUES(encrypted_run,project,actor,cipher,1);
  IF NOT EXISTS(SELECT 1 FROM public.agent_conversations
      WHERE id=encrypted_run AND title IS NULL AND title_ciphertext=cipher
        AND title_encryption_version=1) THEN
    RAISE EXCEPTION 'encrypted title copy missing';
  END IF;
  IF EXISTS(SELECT 1 FROM public.numo_conversation_history
      WHERE legacy_id=encrypted_run AND title LIKE '%Sensitive%') OR
     EXISTS(SELECT 1 FROM public.numo_work
      WHERE id=encrypted_run AND title LIKE '%Sensitive%') THEN
    RAISE EXCEPTION 'Numo retained a plaintext title';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_runs(id,project_id,created_by,title)
      VALUES(old_writer,project,actor,'Obsolete clear title');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete run writer accepted'; END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_conversations(id,project_id,owner_id,title)
      VALUES(gen_random_uuid(),project,actor,'Obsolete clear conversation');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete conversation writer accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET title='Obsolete edit' WHERE id=legacy_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete run title edit accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_conversations SET title='Obsolete edit' WHERE id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete conversation title edit accepted'; END IF;
  IF NOT public.migrate_agent_title_ciphertext(legacy_run,project,legacy_conversation,
      'Sensitive legacy title',NULL,0,'Sensitive legacy title',NULL,0,cipher,cipher,1)
     OR public.migrate_agent_title_ciphertext(legacy_run,project,legacy_conversation,
      'Sensitive legacy title',NULL,0,'Sensitive legacy title',NULL,0,cipher,cipher,1) THEN
    RAISE EXCEPTION 'agent title migration CAS failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_runs WHERE id=legacy_run AND title IS NOT NULL) OR
     EXISTS(SELECT 1 FROM public.agent_conversations
       WHERE id=legacy_conversation AND title IS NOT NULL) OR
     EXISTS(SELECT 1 FROM public.numo_conversation_history
       WHERE legacy_id=legacy_conversation AND title LIKE '%Sensitive legacy title%') THEN
    RAISE EXCEPTION 'agent title migration retained plaintext';
  END IF;
  UPDATE public.agent_conversations SET title_ciphertext=cipher,
    title_encryption_version=1 WHERE id=encrypted_run;
  UPDATE public.agent_runs SET title_ciphertext=cipher,
    title_encryption_version=1 WHERE id=encrypted_run;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET title='Downgrade', title_ciphertext=NULL,
      title_encryption_version=0 WHERE id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'encrypted run downgrade accepted'; END IF;
  budget_result := public.create_agent_run_with_budget(actor,now()-interval '1 day',100,1,
    jsonb_build_object('id',budget_run,'project_id',project,'created_by',actor,
      'status','queued','triggered_by','button','key_mode','platform',
      'worker_model_source','account','worker_model_provider','openai',
      'model_forced',false,'reasoning_level','off','run_id',gen_random_uuid(),
      'loop_in_vm',true,'agent_engine','opencode','local_exec',false,
      'local_issue_context_confirmed',false,'local_worktree',false,
      'title_ciphertext',cipher,'title_encryption_version',1));
  IF budget_result->'run'->>'id' IS DISTINCT FROM budget_run::text OR
     NOT EXISTS(SELECT 1 FROM public.agent_conversations WHERE id=budget_run
       AND title IS NULL AND title_ciphertext=cipher) THEN
    RAISE EXCEPTION 'managed run lost encrypted title copy';
  END IF;
  IF has_table_privilege('authenticated','public.agent_conversations','UPDATE') OR
     has_function_privilege('authenticated',
       'public.migrate_agent_title_ciphertext(uuid,uuid,uuid,text,text,integer,text,text,integer,text,text,integer)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'client retained agent title mutation privilege';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE schemaname='public'
      AND tablename IN ('agent_runs','agent_conversations')) THEN
    RAISE EXCEPTION 'agent titles are published to Realtime';
  END IF;
END;
$test$;
ROLLBACK;
