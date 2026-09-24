-- Exercise standalone transcript guards, migration, and plaintext projections.
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
  legacy_id uuid := gen_random_uuid(); encrypted_id uuid := gen_random_uuid();
  run_id uuid := gen_random_uuid(); run_system_id uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Fixture project','ASM'),
      (other_project,actor,'Other fixture project','ASO');
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(conversation,project,actor);
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by)
    VALUES(run_id,project,conversation,actor);
  INSERT INTO public.agent_messages(id,conversation_id,role,content,source)
    VALUES(legacy_id,conversation,'system','Private system instruction','system');
  INSERT INTO public.agent_messages(id,conversation_id,run_id,role,content,source)
    VALUES(run_system_id,conversation,run_id,'system','Private run instruction','system');
  INSERT INTO public.agent_messages(id,conversation_id,role,content,source,
    content_encryption_version)
    VALUES(encrypted_id,conversation,'user',cipher,'steering',1);
  rejected := false;
  BEGIN
    INSERT INTO public.agent_messages(conversation_id,role,content,source)
      VALUES(conversation,'system','Obsolete clear writer','system');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete system writer accepted'; END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_messages(conversation_id,run_id,role,content,source)
      VALUES(conversation,run_id,'system','Obsolete run system writer','system');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete run system writer accepted'; END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_messages(conversation_id,role,content,source,
      legacy_queue_message_id)
      VALUES(conversation,'system','Forged queue system writer','system',gen_random_uuid());
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'forged queue system writer accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_messages SET content='Obsolete clear edit'
      WHERE id=legacy_id;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete legacy edit accepted'; END IF;
  IF NOT public.migrate_agent_standalone_message(
      legacy_id,conversation,project,'Private system instruction',0)
     OR NOT public.migrate_agent_standalone_message(
      legacy_id,conversation,project,'Private system instruction',0,cipher,1)
     OR public.migrate_agent_standalone_message(
      legacy_id,conversation,project,'Private system instruction',0,cipher,1) THEN
    RAISE EXCEPTION 'standalone message migration CAS failed';
  END IF;
  IF NOT public.migrate_agent_standalone_message(
      run_system_id,conversation,project,'Private run instruction',0,cipher,1) THEN
    RAISE EXCEPTION 'run system migration failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_messages
      WHERE id IN (legacy_id,encrypted_id,run_system_id)
      AND content LIKE '%Private%') OR
     EXISTS(SELECT 1 FROM public.numo_messages
      WHERE id IN (legacy_id,encrypted_id,run_system_id)
      AND content LIKE '%Private%') THEN
    RAISE EXCEPTION 'converted transcript retained plaintext';
  END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_conversations SET project_id=other_project WHERE id=conversation;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'encrypted transcript moved project'; END IF;
  IF has_function_privilege('authenticated',
       'public.migrate_agent_standalone_message(uuid,uuid,uuid,text,integer,text,integer)',
       'EXECUTE') OR
     EXISTS(SELECT 1 FROM pg_publication_tables WHERE schemaname='public'
       AND tablename='agent_messages') THEN
    RAISE EXCEPTION 'client access or Realtime leaks transcript content';
  END IF;
END;
$test$;
ROLLBACK;
