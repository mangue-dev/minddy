-- Verify launch prompts, mentions, and their first-message copy on isolated PostgreSQL.
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
  conversation uuid := gen_random_uuid(); other_conversation uuid := gen_random_uuid();
  legacy_run uuid := gen_random_uuid();
  encrypted_run uuid := gen_random_uuid(); obsolete_run uuid := gen_random_uuid();
  budget_run uuid := gen_random_uuid(); budget_values jsonb; budget_result jsonb;
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Fixture project','ALA');
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(conversation,project,actor);
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(other_conversation,project,actor);
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,prompt,prompt_mentions)
    VALUES(legacy_run,project,conversation,actor,'Private initial prompt',
      '[{"label":"Private mention"}]');
  IF NOT EXISTS(SELECT 1 FROM public.agent_messages
      WHERE run_id=legacy_run AND source='initial_prompt' AND content='Private initial prompt') THEN
    RAISE EXCEPTION 'legacy initial copy missing';
  END IF;
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,
    encrypted_launch_content,launch_encryption_version,has_launch_prompt)
    VALUES(encrypted_run,project,conversation,actor,cipher,1,true);
  IF NOT EXISTS(SELECT 1 FROM public.agent_messages
      WHERE run_id=encrypted_run AND source='initial_prompt'
        AND content=cipher AND content_encryption_version=1) THEN
    RAISE EXCEPTION 'encrypted initial copy missing';
  END IF;
  INSERT INTO public.agent_messages(conversation_id,role,content,source,
    content_encryption_version)
    VALUES(conversation,'user',cipher,'initial_prompt',1);
  budget_values := jsonb_build_object(
    'id', budget_run, 'project_id', project, 'conversation_id', conversation,
    'created_by', actor, 'status', 'queued', 'triggered_by', 'button',
    'key_mode', 'platform', 'worker_model_source', 'account',
    'worker_model_provider', 'openai', 'model_forced', false,
    'reasoning_level', 'off', 'run_id', gen_random_uuid(),
    'loop_in_vm', true, 'agent_engine', 'opencode', 'local_exec', false,
    'local_issue_context_confirmed', false, 'local_worktree', false,
    'encrypted_launch_content', cipher, 'launch_encryption_version', 1,
    'has_launch_prompt', true);
  SELECT public.create_agent_run_with_budget(actor,now()-interval '1 day',100,1,budget_values)
    INTO budget_result;
  IF budget_result->'run'->>'id' IS DISTINCT FROM budget_run::text OR
     NOT EXISTS(SELECT 1 FROM public.agent_messages
       WHERE run_id=budget_run AND content=cipher AND content_encryption_version=1) THEN
    RAISE EXCEPTION 'managed encrypted run creation lost its first-message copy';
  END IF;
  rejected := false;
  BEGIN
    PERFORM public.create_agent_run_with_budget(actor,now()-interval '1 day',100,1,
      budget_values - ARRAY['id','encrypted_launch_content','launch_encryption_version','has_launch_prompt']
      || jsonb_build_object('prompt','Obsolete managed writer'));
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete managed run writer accepted'; END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,prompt)
      VALUES(obsolete_run,project,conversation,actor,'Obsolete clear writer');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete run writer accepted'; END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_messages(conversation_id,run_id,role,content,source)
      VALUES(conversation,encrypted_run,'user','Obsolete clear copy','initial_prompt');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete initial copy accepted'; END IF;
  IF NOT public.migrate_agent_launch_ciphertext(legacy_run,project,conversation,0)
     OR NOT public.migrate_agent_launch_ciphertext(legacy_run,project,conversation,0,cipher,1,true)
     OR public.migrate_agent_launch_ciphertext(legacy_run,project,conversation,0,cipher,1,true) THEN
    RAISE EXCEPTION 'launch migration CAS failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_runs WHERE id=legacy_run
      AND (prompt IS NOT NULL OR prompt_mentions IS NOT NULL OR
        encrypted_launch_content IS DISTINCT FROM cipher)) OR
     NOT EXISTS(SELECT 1 FROM public.agent_messages
       WHERE run_id=legacy_run AND source='initial_prompt' AND content=cipher
         AND content_encryption_version=1) THEN
    RAISE EXCEPTION 'launch migration retained a plaintext copy';
  END IF;
  IF EXISTS(SELECT 1 FROM public.numo_messages
      WHERE run_id IN (legacy_run,encrypted_run,budget_run)
        AND (content LIKE '%Private initial prompt%' OR
          content LIKE '%Private mention%')) THEN
    RAISE EXCEPTION 'Numo view retained a plaintext launch copy';
  END IF;
  rejected := false;
  BEGIN
    PERFORM public.migrate_agent_launch_ciphertext(
      legacy_run,project,conversation,1,cipher,1,false);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'launch prompt-state mismatch accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET prompt='Obsolete edit' WHERE id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'unguarded launch edit accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET conversation_id=other_conversation WHERE id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'encrypted launch conversation moved'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_messages SET content='Obsolete edit'
      WHERE run_id=encrypted_run AND source='initial_prompt';
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'unguarded initial copy edit accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_messages SET source='system', content='Obsolete edit',
      content_encryption_version=0
      WHERE run_id=encrypted_run AND source='initial_prompt';
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'initial copy source bypass accepted'; END IF;
  IF has_table_privilege('authenticated','public.agent_runs','INSERT') OR
     has_table_privilege('authenticated','public.agent_messages','UPDATE') OR
     has_function_privilege('authenticated',
       'public.migrate_agent_launch_ciphertext(uuid,uuid,uuid,integer,text,integer,boolean)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'client retained launch mutation privilege';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE schemaname='public'
    AND tablename IN ('agent_runs','agent_messages')) THEN
    RAISE EXCEPTION 'launch content is published to Realtime';
  END IF;
END;
$test$;
ROLLBACK;
