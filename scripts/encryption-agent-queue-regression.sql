-- Exercise queue/copy atomicity, old-writer rejection, and plaintext projections.
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
  other_project uuid := gen_random_uuid(); conversation uuid := gen_random_uuid();
  fixture_run uuid := gen_random_uuid(); legacy_id uuid := gen_random_uuid();
  encrypted_id uuid := gen_random_uuid(); stale_id uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Queue fixture project','AQM'),
      (other_project,actor,'Other queue fixture','AQO');
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(conversation,project,actor);
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by)
    VALUES(fixture_run,project,conversation,actor);
  INSERT INTO public.agent_run_messages(id,run_id,created_by,content,mentions)
    VALUES(legacy_id,fixture_run,actor,'Private legacy steering',
      '[{"label":"Private legacy mention"}]'::jsonb);
  IF NOT EXISTS (SELECT 1 FROM public.agent_messages
      WHERE legacy_queue_message_id=legacy_id AND content='Private legacy steering') THEN
    RAISE EXCEPTION 'legacy queue copy missing';
  END IF;
  INSERT INTO public.agent_run_messages(id,run_id,created_by,content,mentions,
    content_encryption_version)
    VALUES(encrypted_id,fixture_run,actor,cipher,NULL,1);
  IF NOT EXISTS (SELECT 1 FROM public.agent_messages
      WHERE legacy_queue_message_id=encrypted_id AND content=cipher
        AND content_encryption_version=1) THEN
    RAISE EXCEPTION 'encrypted queue copy mismatch';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_run_messages(id,run_id,created_by,content)
      VALUES(stale_id,fixture_run,actor,'Obsolete clear writer');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete queue writer accepted'; END IF;
  IF public.agent_queue_content_version('Obsolete clear RPC writer') <> 0 THEN
    RAISE EXCEPTION 'obsolete RPC writer classified encrypted';
  END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_run_messages SET content='Obsolete clear edit'
      WHERE id=encrypted_id;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'queue content edit accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_messages SET content='Obsolete clear copy'
      WHERE legacy_queue_message_id=encrypted_id;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'queue copy edit accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET project_id=other_project WHERE id=fixture_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'queue parent moved project'; END IF;
  IF NOT public.migrate_agent_queue_message(legacy_id,fixture_run,project,
      'Private legacy steering','[{"label":"Private legacy mention"}]'::jsonb,0)
     OR NOT public.migrate_agent_queue_message(legacy_id,fixture_run,project,
      'Private legacy steering','[{"label":"Private legacy mention"}]'::jsonb,0,cipher,1)
     OR public.migrate_agent_queue_message(legacy_id,fixture_run,project,
      'Private legacy steering','[{"label":"Private legacy mention"}]'::jsonb,0,cipher,1) THEN
    RAISE EXCEPTION 'queue conversion CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_run_messages
      WHERE id IN (legacy_id,encrypted_id) AND
        (content LIKE '%Private%' OR mentions::text LIKE '%Private%')) OR
     EXISTS (SELECT 1 FROM public.agent_messages
      WHERE legacy_queue_message_id IN (legacy_id,encrypted_id)
        AND content LIKE '%Private%') OR
     EXISTS (SELECT 1 FROM public.numo_messages
      WHERE legacy_queue_message_id IN (legacy_id,encrypted_id)
        AND content LIKE '%Private%') THEN
    RAISE EXCEPTION 'converted queue retained plaintext copy';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_agent_queue_message(uuid,uuid,uuid,text,jsonb,integer,text,integer)',
      'EXECUTE') OR EXISTS (SELECT 1 FROM pg_publication_tables
        WHERE schemaname='public' AND tablename='agent_run_messages') THEN
    RAISE EXCEPTION 'client privilege or Realtime leaks queue content';
  END IF;
END;
$test$;
ROLLBACK;
