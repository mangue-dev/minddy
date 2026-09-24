-- Verify event payload and SQL sidecar conversion in isolated PostgreSQL.
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
  other_project uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid(); other_conversation uuid := gen_random_uuid();
  run uuid := gen_random_uuid(); other_run uuid := gen_random_uuid();
  summary_id uuid; question_event uuid; fresh_id uuid;
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Private project','AET');
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(other_project,actor,'Other project','AEO');
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(conversation,project,actor);
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(other_conversation,other_project,actor);
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by)
    VALUES(run,project,conversation,actor);
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by)
    VALUES(other_run,other_project,other_conversation,actor);

  INSERT INTO public.agent_run_events(run_id,seq,type,payload)
    VALUES(run,0,'summary','{"text":"private summary"}') RETURNING id INTO summary_id;
  INSERT INTO public.agent_run_events(run_id,seq,type,payload)
    VALUES(run,1,'needs_input',
      '{"question_id":"q1","call_id":"c1","questions":[{"question":"private question"}]}')
    RETURNING id INTO question_event;
  IF NOT EXISTS(SELECT 1 FROM public.agent_messages
      WHERE legacy_event_id=summary_id AND content='private summary') OR
     NOT EXISTS(SELECT 1 FROM public.agent_run_input_requests
      WHERE source_event_id=question_event AND questions->0->>'question'='private question') THEN
    RAISE EXCEPTION 'legacy sidecar capture failed';
  END IF;
  UPDATE public.agent_runs SET project_id=other_project,
    conversation_id=other_conversation WHERE id=run;
  UPDATE public.agent_runs SET project_id=project,
    conversation_id=conversation WHERE id=run;

  IF NOT public.migrate_agent_event_ciphertext(summary_id,run,0) OR
     NOT public.migrate_agent_event_ciphertext(summary_id,run,0,cipher,1) OR
     public.migrate_agent_event_ciphertext(summary_id,run,0,cipher,1) THEN
    RAISE EXCEPTION 'summary migration CAS failed';
  END IF;
  IF NOT public.migrate_agent_event_ciphertext(question_event,run,0,cipher,1) THEN
    RAISE EXCEPTION 'question migration failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_run_events WHERE id IN (summary_id,question_event)
      AND (payload IS NOT NULL OR encryption_version<>1)) OR
     NOT EXISTS(SELECT 1 FROM public.agent_messages WHERE legacy_event_id=summary_id
      AND content=cipher AND content_encryption_version=1) OR
     NOT EXISTS(SELECT 1 FROM public.agent_run_input_requests WHERE source_event_id=question_event
      AND questions IS NULL AND encrypted_questions=cipher AND questions_encryption_version=1) THEN
    RAISE EXCEPTION 'event migration retained a plaintext sidecar';
  END IF;
  BEGIN
    INSERT INTO public.agent_run_events(run_id,seq,type,payload)
      VALUES(run,2,'summary','{"text":"obsolete"}');
    RAISE EXCEPTION 'obsolete event writer accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.agent_run_events SET payload='{"text":"overwrite"}' WHERE id=summary_id;
    RAISE EXCEPTION 'unguarded event edit accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.agent_runs SET project_id=other_project,
      conversation_id=other_conversation WHERE id=run;
    RAISE EXCEPTION 'encrypted parent scope moved';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO public.agent_run_events(id,run_id,seq,type,payload,
    encrypted_content,encryption_version,has_summary_text)
    VALUES(gen_random_uuid(),run,2,'summary',NULL,cipher,1,true)
    RETURNING id INTO fresh_id;
  IF NOT EXISTS(SELECT 1 FROM public.agent_messages WHERE legacy_event_id=fresh_id
      AND content=cipher AND content_encryption_version=1) THEN
    RAISE EXCEPTION 'encrypted summary capture failed';
  END IF;
  BEGIN
    INSERT INTO public.agent_messages(conversation_id,run_id,role,content,source)
      VALUES(conversation,run,'assistant','plaintext','assistant_summary');
    RAISE EXCEPTION 'plaintext summary copy accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.agent_run_input_requests(run_id,question_id,call_id,questions)
      VALUES(run,'q2','c2','[{"question":"plaintext"}]');
    RAISE EXCEPTION 'plaintext input copy accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.agent_messages SET content='plaintext' WHERE legacy_event_id=fresh_id;
    RAISE EXCEPTION 'encrypted summary copy changed directly';
  EXCEPTION WHEN check_violation OR invalid_text_representation THEN NULL; END;
  BEGIN
    UPDATE public.agent_messages SET source='system',content_encryption_version=0,
      content='plaintext' WHERE legacy_event_id=fresh_id;
    RAISE EXCEPTION 'encrypted summary copy changed source';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.agent_run_input_requests SET run_id=other_run
      WHERE source_event_id=question_event;
    RAISE EXCEPTION 'encrypted question copy changed scope';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF has_table_privilege('authenticated','public.agent_run_events','INSERT') OR
     has_table_privilege('authenticated','public.agent_messages','UPDATE') OR
     has_table_privilege('authenticated','public.agent_event_encryption_scopes','SELECT') OR
     has_function_privilege('authenticated',
       'public.migrate_agent_event_ciphertext(uuid,uuid,integer,text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'client retained event write or migration privilege';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE schemaname='public'
    AND tablename IN ('agent_run_events','agent_messages','agent_run_input_requests')) THEN
    RAISE EXCEPTION 'agent event or copy is published to Realtime';
  END IF;
END;
$test$;
ROLLBACK;
