-- Preserve personal Numo worker events while rejecting a different actor's run.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); other_actor uuid:=gen_random_uuid();
  project uuid:=gen_random_uuid(); conversation uuid:=gen_random_uuid();
  turn_id uuid:=gen_random_uuid(); fixture_run uuid:=gen_random_uuid(); wrong_run uuid:=gen_random_uuid();
  event_id uuid:=gen_random_uuid(); old_payload jsonb; wrapped jsonb; brief jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor),(other_actor);
  INSERT INTO public.projects(id,owner_id,name,key) VALUES(project,actor,'Personal worker fixture','PWF');
  INSERT INTO public.conversations(id,user_id,project_id) VALUES(conversation,actor,NULL);
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,request_id,run_id,status)
    VALUES(turn_id,conversation,actor,gen_random_uuid(),gen_random_uuid(),'queued');
  brief:=jsonb_build_object('version',1,'correlation',jsonb_build_object(
    'parentConversationId',conversation,'parentTurnId',turn_id,'toolCallId','call'),
    'targetRepository',jsonb_build_object('projectId',project),'objective','Fixture objective',
    'sourceReferences','[]'::jsonb,'constraints','[]'::jsonb,
    'authorizedWork','["test"]'::jsonb,'expectedOutput','["test"]'::jsonb);
  INSERT INTO public.agent_runs(id,project_id,created_by,parent_numo_turn_id,
    parent_numo_conversation_id,parent_numo_tool_call_id,delegation_brief)
    VALUES(fixture_run,project,actor,turn_id,conversation,'call',brief),
      (wrong_run,project,other_actor,turn_id,conversation,'wrong-call',
        jsonb_set(brief,'{correlation,toolCallId}','"wrong-call"'));
  UPDATE public.numo_assistant_turns SET active_run_id=fixture_run,status='waiting_work' WHERE id=turn_id;
  old_payload:=jsonb_build_object('run_id',fixture_run,'result','Private worker result');
  INSERT INTO public.numo_turn_events(id,turn_id,seq,type,payload)
    VALUES(event_id,turn_id,1,'worker_completed',old_payload);
  UPDATE public.numo_assistant_turns SET checkpoint=jsonb_build_object('worker_event',
    jsonb_build_object('type','worker_completed','payload',old_payload)) WHERE id=turn_id;
  BEGIN
    INSERT INTO public.numo_turn_events(turn_id,seq,type,payload)
      VALUES(turn_id,2,'worker_completed',jsonb_build_object('run_id',wrong_run,'result','Other actor result'));
    RAISE EXCEPTION 'Different actor worker event accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  wrapped:=jsonb_build_object('encrypted_worker_payload','{"format":3,"keyVersion":1}',
    'encryption_version',1,'project_id',project,'event_id',event_id,'run_id',fixture_run);
  IF NOT public.migrate_numo_worker_event(event_id,old_payload,wrapped) OR
      public.migrate_numo_worker_event(event_id,old_payload,wrapped) THEN
    RAISE EXCEPTION 'Personal worker CAS failed';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.numo_assistant_turns WHERE id=turn_id
    AND checkpoint #> '{worker_event,payload}'=wrapped) THEN
    RAISE EXCEPTION 'Personal worker checkpoint was not converted';
  END IF;
  IF public.numo_worker_payload_verified(jsonb_set(wrapped,'{run_id}',to_jsonb(wrong_run::text)),
    'event',event_id) THEN RAISE EXCEPTION 'Different actor payload verified'; END IF;
  IF has_function_privilege('authenticated','public.numo_worker_conversation_project(uuid,uuid)','EXECUTE') OR
     has_function_privilege('service_role','public.numo_worker_conversation_project(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Internal worker scope resolver exposed';
  END IF;
END;
$test$;
ROLLBACK;
