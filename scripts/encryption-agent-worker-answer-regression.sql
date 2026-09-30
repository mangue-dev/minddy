-- Verify one CAS removes steering and answer text from all SQL copies.
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
  conversation uuid := gen_random_uuid(); parent_conversation uuid := gen_random_uuid();
  parent_turn uuid := gen_random_uuid();
  fixture_run uuid := gen_random_uuid(); message uuid := gen_random_uuid();
  input_id uuid := gen_random_uuid(); activated_message uuid := gen_random_uuid();
  mediated_message uuid := gen_random_uuid();
  resumed_message uuid := gen_random_uuid(); pending_input uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
  expected jsonb; replacement jsonb; rejected boolean;
  mediated_result jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Worker answer fixture','WAF');
  INSERT INTO public.conversations(id,user_id) VALUES(parent_conversation,actor);
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,request_id,
    run_id,status) VALUES(parent_turn,parent_conversation,actor,gen_random_uuid(),
      gen_random_uuid(),'queued');
  INSERT INTO public.agent_conversations(id,project_id,owner_id)
    VALUES(conversation,project,actor);
  INSERT INTO public.agent_runs(id,project_id,conversation_id,created_by,
    parent_numo_conversation_id,parent_numo_turn_id,parent_numo_tool_call_id,
    delegation_brief)
    VALUES(fixture_run,project,conversation,actor,parent_conversation,
      parent_turn,'fixture-call',jsonb_build_object('version',1,
        'correlation',jsonb_build_object('parentConversationId',parent_conversation,
          'parentTurnId',parent_turn,'toolCallId','fixture-call'),
        'targetRepository',jsonb_build_object('projectId',project),
        'objective','Fixture worker answer', 'sourceReferences','[]'::jsonb,
        'constraints','[]'::jsonb,'authorizedWork','["fixture"]'::jsonb,
        'expectedOutput','["fixture"]'::jsonb));
  INSERT INTO public.agent_run_messages(id,run_id,created_by,content,mentions)
    VALUES(message,fixture_run,actor,'Private steering answer',
      '[{"label":"Private mention"}]'::jsonb);
  INSERT INTO public.agent_run_input_requests(id,run_id,question_id,call_id,
    questions,status,answer,answer_message_id,answered_at)
    VALUES(input_id,fixture_run,'question-1','call-1','["Private question"]'::jsonb,
      'answered','Private steering answer',message,now());
  INSERT INTO public.assistant_messages(id,conversation_id,role,content,
    context,metadata) VALUES(message,parent_conversation,'user',
      'Private parent answer','{"page":"Private context"}'::jsonb,
      jsonb_build_object('worker_input',jsonb_build_object('run_id',fixture_run),
        'attachment','Private metadata'));
  expected := jsonb_build_object('content','Private steering answer',
    'mentions','[{"label":"Private mention"}]'::jsonb,'version',0,
    'answer',jsonb_build_object('id',input_id,'content','Private steering answer',
      'version',0),
    'parent',jsonb_build_object('content','Private parent answer',
      'context','{"page":"Private context"}'::jsonb,
      'metadata',jsonb_build_object('worker_input',
        jsonb_build_object('run_id',fixture_run),'attachment','Private metadata'),
      'version',0));
  replacement := jsonb_build_object('content',cipher,'version',1,
    'answer',jsonb_build_object('content',cipher,'version',1),
    'parent',jsonb_build_object('content',cipher,'version',1));
  IF NOT public.migrate_agent_queue_bundle(message,fixture_run,project,expected)
     OR NOT public.migrate_agent_queue_bundle(message,fixture_run,project,
       expected,replacement)
     OR public.migrate_agent_queue_bundle(message,fixture_run,project,
       expected,replacement) THEN
    RAISE EXCEPTION 'worker answer bundle CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_run_messages
      WHERE id=message AND (content LIKE '%Private%' OR mentions::text LIKE '%Private%')) OR
     EXISTS (SELECT 1 FROM public.agent_messages
      WHERE legacy_queue_message_id=message AND content LIKE '%Private%') OR
     EXISTS (SELECT 1 FROM public.agent_run_input_requests
      WHERE id=input_id AND answer LIKE '%Private%') OR
     EXISTS (SELECT 1 FROM public.assistant_messages
      WHERE id=message AND (content LIKE '%Private%' OR
        metadata::text LIKE '%Private%' OR context::text LIKE '%Private%')) OR
     EXISTS (SELECT 1 FROM public.numo_messages
      WHERE id=message AND content LIKE '%Private%') THEN
    RAISE EXCEPTION 'converted worker answer retained plaintext copy';
  END IF;
  INSERT INTO public.agent_run_messages(id,run_id,created_by,content,
    content_encryption_version)
    VALUES(activated_message,fixture_run,actor,cipher,1);
  rejected := false;
  BEGIN
    INSERT INTO public.agent_run_messages(run_id,created_by,content)
      VALUES(fixture_run,actor,'Obsolete clear queue writer');
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'old queue writer accepted'; END IF;
  rejected := false;
  BEGIN
    INSERT INTO public.assistant_messages(conversation_id,role,content,metadata)
      VALUES(parent_conversation,'user','Obsolete clear parent',
        jsonb_build_object('worker_input',jsonb_build_object('run_id',fixture_run)));
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'old parent writer accepted'; END IF;
  UPDATE public.numo_assistant_turns SET status='waiting_work',
    active_run_id=fixture_run WHERE id=parent_turn;
  mediated_result := public.steer_numo_worker(parent_conversation,actor,mediated_message,
      cipher,cipher,NULL,NULL,'{}'::jsonb);
  IF mediated_result ->> 'action' IS DISTINCT FROM 'steered' OR
     NOT EXISTS (SELECT 1 FROM public.agent_messages m
       JOIN public.agent_run_messages q ON q.id=m.legacy_queue_message_id
       JOIN public.assistant_messages a ON a.id=q.id
       WHERE q.id=mediated_message AND q.content=m.content
         AND q.content=a.content AND q.content_encryption_version=1
         AND m.content_encryption_version=1
         AND a.worker_content_encryption_version=1) THEN
    RAISE EXCEPTION 'mediated steering did not copy ciphertext atomically: %',mediated_result;
  END IF;
  rejected := false;
  BEGIN
    PERFORM public.steer_numo_worker(parent_conversation,actor,gen_random_uuid(),
      'Obsolete clear RPC writer','Obsolete clear parent RPC writer',NULL,NULL,'{}'::jsonb);
  EXCEPTION WHEN check_violation THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'old mediated writer accepted'; END IF;
  UPDATE public.agent_runs SET status='completed', awaiting_input=true
    WHERE id=fixture_run;
  UPDATE public.numo_assistant_turns SET status='waiting_input'
    WHERE id=parent_turn;
  INSERT INTO public.agent_run_input_requests(id,run_id,parent_numo_turn_id,
    question_id,call_id,questions) VALUES(pending_input,fixture_run,parent_turn,
      'pending-question','pending-call','["Fixture question"]'::jsonb);
  mediated_result := to_jsonb(public.resume_numo_worker_input(
    parent_conversation,parent_turn,fixture_run,'pending-question',actor,
    resumed_message,jsonb_build_object('kind','encrypted_worker_answer',
      'queue',cipher,'answer',cipher,'parent',cipher)::text,true,now(),
    now()-interval '1 day',100,1));
  IF mediated_result #>> '{}' IS DISTINCT FROM 'queued' OR
     NOT EXISTS (SELECT 1 FROM public.agent_run_input_requests i
       JOIN public.agent_run_messages q ON q.id=i.answer_message_id
       JOIN public.agent_messages m ON m.legacy_queue_message_id=q.id
       JOIN public.assistant_messages a ON a.id=q.id
       WHERE i.id=pending_input AND i.status='answered'
         AND i.answer_encryption_version=1 AND q.content_encryption_version=1
         AND m.content_encryption_version=1
         AND a.worker_content_encryption_version=1
         AND i.answer=q.content AND q.content=m.content AND m.content=a.content) THEN
    RAISE EXCEPTION 'mediated input answer did not copy ciphertext atomically: %',
      mediated_result;
  END IF;
  IF has_function_privilege('service_role',
       'public.migrate_agent_queue_message(uuid,uuid,uuid,text,jsonb,integer,text,integer)',
       'EXECUTE') OR has_function_privilege('authenticated',
       'public.migrate_agent_queue_bundle(uuid,uuid,uuid,jsonb,jsonb)','EXECUTE') OR
     EXISTS (SELECT 1 FROM pg_publication_tables
       WHERE schemaname='public' AND tablename IN (
         'agent_run_input_requests','assistant_messages')) THEN
    RAISE EXCEPTION 'obsolete migration or client access retained';
  END IF;
END;
$test$;
ROLLBACK;
