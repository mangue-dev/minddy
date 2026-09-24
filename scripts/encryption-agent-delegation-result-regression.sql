-- Verify result and Numo worker copies reject plaintext after project activation.
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
  legacy_run uuid := gen_random_uuid(); encrypted_run uuid := gen_random_uuid();
  parent_conversation uuid := gen_random_uuid(); parent_turn uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  sidecar_event uuid := gen_random_uuid();
  legacy_turn uuid := gen_random_uuid(); legacy_event_id uuid := gen_random_uuid();
  orphan_turn uuid := gen_random_uuid();
  clear_result jsonb := jsonb_build_object('version',1,'status','completed',
    'summary','Private worker summary','changedFiles','[]'::jsonb,
    'verificationPerformed','[]'::jsonb,'artifacts','[]'::jsonb,
    'unresolvedDecisions','[]'::jsonb);
  cipher text := '{"format":3,"keyVersion":1}';
  worker_payload jsonb; rejected boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Agent result fixture','ARS');
  INSERT INTO public.agent_runs(id,project_id,created_by,delegation_result)
    VALUES(legacy_run,project,actor,clear_result);
  INSERT INTO public.conversations(id,user_id,project_id)
    VALUES(parent_conversation,actor,project);
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,status,active_run_id)
    VALUES(legacy_turn,parent_conversation,actor,gen_random_uuid(),
      gen_random_uuid(),'waiting_work',legacy_run);
  INSERT INTO public.numo_turn_events(id,turn_id,seq,type,payload)
    VALUES(legacy_event_id,legacy_turn,1,'worker_completed',
      jsonb_build_object('run_id',legacy_run,'result',clear_result));
  UPDATE public.numo_assistant_turns SET checkpoint=jsonb_build_object(
    'phase','worker_result','worker_event',jsonb_build_object(
      'type','worker_completed','payload',jsonb_build_object(
        'run_id',legacy_run,'result',clear_result))) WHERE id=legacy_turn;
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,status,active_run_id,checkpoint)
    VALUES(orphan_turn,parent_conversation,actor,gen_random_uuid(),
      gen_random_uuid(),'waiting_work',legacy_run,jsonb_build_object(
        'phase','worker_result','worker_event',jsonb_build_object(
          'type','worker_completed','payload',jsonb_build_object(
            'run_id',legacy_run,'result',clear_result))));
  INSERT INTO public.agent_runs(id,project_id,created_by,
    delegation_result_ciphertext,delegation_result_encryption_version)
    VALUES(encrypted_run,project,actor,cipher,1);
  IF NOT EXISTS (SELECT 1 FROM public.agent_runs
      WHERE id=encrypted_run AND delegation_result IS NULL AND
        delegation_result_ciphertext=cipher) THEN
    RAISE EXCEPTION 'delegation result plaintext remains';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.agent_runs(id,project_id,created_by,delegation_result)
      VALUES(gen_random_uuid(),project,actor,clear_result);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete delegation result insert accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.agent_runs SET delegation_result=clear_result WHERE id=encrypted_run;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete delegation result edit accepted'; END IF;
  IF NOT public.migrate_agent_delegation_result(
      legacy_run,project,clear_result,NULL,0,cipher,1) OR
     public.migrate_agent_delegation_result(
      legacy_run,project,clear_result,NULL,0,cipher,1) THEN
    RAISE EXCEPTION 'delegation result compare-and-swap failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_runs WHERE id IN (legacy_run,encrypted_run)
      AND delegation_result::text LIKE '%Private worker summary%') THEN
    RAISE EXCEPTION 'delegation result source plaintext remains';
  END IF;

  IF NOT public.migrate_numo_worker_event(legacy_event_id,
      jsonb_build_object('run_id',legacy_run,'result',clear_result),
      jsonb_build_object('encrypted_worker_payload',cipher,
        'encryption_version',1,'project_id',project,'event_id',legacy_event_id,
        'run_id',legacy_run)) OR
     public.migrate_numo_worker_event(legacy_event_id,
      jsonb_build_object('run_id',legacy_run,'result',clear_result),
      jsonb_build_object('encrypted_worker_payload',cipher,
        'encryption_version',1,'project_id',project,'event_id',legacy_event_id,
        'run_id',legacy_run)) THEN
    RAISE EXCEPTION 'Numo worker event compare-and-swap failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.numo_turn_events WHERE id=legacy_event_id
      AND payload::text LIKE '%Private worker summary%') OR
     EXISTS (SELECT 1 FROM public.numo_assistant_turns WHERE id=legacy_turn
      AND checkpoint::text LIKE '%Private worker summary%') THEN
    RAISE EXCEPTION 'historical Numo worker plaintext remains';
  END IF;
  IF NOT public.migrate_numo_worker_checkpoint(orphan_turn,
      jsonb_build_object('phase','worker_result','worker_event',
        jsonb_build_object('type','worker_completed','payload',
          jsonb_build_object('run_id',legacy_run,'result',clear_result))),
      jsonb_build_object('phase','worker_result','worker_event',
        jsonb_build_object('type','worker_completed','payload',
          jsonb_build_object('encrypted_worker_payload',cipher,
            'encryption_version',1,'project_id',project,'event_id',orphan_turn,
            'run_id',legacy_run)))) THEN
    RAISE EXCEPTION 'orphan Numo worker checkpoint compare-and-swap failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.numo_assistant_turns WHERE id=orphan_turn
      AND checkpoint::text LIKE '%Private worker summary%') THEN
    RAISE EXCEPTION 'orphan Numo worker checkpoint plaintext remains';
  END IF;

  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,status,active_run_id)
    VALUES(parent_turn,parent_conversation,actor,gen_random_uuid(),
      gen_random_uuid(),'waiting_work',encrypted_run);
  worker_payload := jsonb_build_object('encrypted_worker_payload',cipher,
    'encryption_version',1,'project_id',project,'event_id',event_id,
    'run_id',encrypted_run);
  INSERT INTO public.numo_turn_events(id,turn_id,seq,type,payload)
    VALUES(event_id,parent_turn,1,'worker_completed',worker_payload);
  UPDATE public.numo_assistant_turns SET checkpoint=jsonb_build_object(
    'phase','worker_result','worker_event',jsonb_build_object(
      'type','worker_completed','payload',worker_payload))
    WHERE id=parent_turn;
  IF EXISTS (SELECT 1 FROM public.numo_turn_events
      WHERE id=event_id AND payload::text LIKE '%Private worker summary%') OR
     EXISTS (SELECT 1 FROM public.numo_assistant_turns
      WHERE id=parent_turn AND checkpoint::text LIKE '%Private worker summary%') THEN
    RAISE EXCEPTION 'Numo worker plaintext remains';
  END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.numo_turn_events(id,turn_id,seq,type,payload)
      VALUES(gen_random_uuid(),parent_turn,2,'worker_completed',
        jsonb_build_object('run_id',encrypted_run,'result',clear_result));
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete Numo event writer accepted'; END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.numo_turn_events(id,turn_id,seq,type,payload)
      VALUES(sidecar_event,parent_turn,2,'worker_completed',
        worker_payload || jsonb_build_object('event_id',sidecar_event,
          'result',clear_result));
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'worker envelope with clear sidecar accepted'; END IF;
  rejected := false;
  BEGIN
    UPDATE public.numo_assistant_turns SET checkpoint=jsonb_build_object(
      'phase','worker_result','worker_event',jsonb_build_object(
        'type','worker_completed','payload',jsonb_build_object(
          'run_id',encrypted_run,'result',clear_result))) WHERE id=parent_turn;
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'obsolete Numo checkpoint writer accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_agent_delegation_result(uuid,uuid,jsonb,text,integer,text,integer)',
      'EXECUTE') OR has_function_privilege('authenticated',
      'public.migrate_numo_worker_event(uuid,jsonb,jsonb)','EXECUTE') OR
      has_function_privilege('authenticated',
      'public.migrate_numo_worker_checkpoint(uuid,jsonb,jsonb)','EXECUTE') OR
      EXISTS (SELECT 1 FROM pg_publication_tables
       WHERE schemaname='public' AND tablename IN
         ('agent_runs','numo_assistant_turns','numo_turn_events')) THEN
    RAISE EXCEPTION 'delegation result client privilege or Realtime exposure';
  END IF;
END;
$test$;
ROLLBACK;
