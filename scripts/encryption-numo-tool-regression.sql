-- Run on an isolated database with the Numo tool migration applied.
BEGIN;
DO $$
DECLARE actor uuid:=gen_random_uuid(); conversation uuid:=gen_random_uuid();
  project uuid:=gen_random_uuid();
  turn uuid:=gen_random_uuid(); claim uuid:=gen_random_uuid();
  message uuid:=gen_random_uuid(); tool_message uuid:=gen_random_uuid();
  clear_turn uuid:=gen_random_uuid(); clear_message uuid:=gen_random_uuid();
  new_turn uuid:=gen_random_uuid();
  cipher text:='{"format":3,"keyVersion":2,"payload":"YWJj"}';
  sealed jsonb:='{"format":3,"keyVersion":2,"payload":"YWJj"}'::jsonb;
  sealed_checkpoint jsonb; digest text:=repeat('a',64); response jsonb;
  migrated boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Fixture project','NTO');
  INSERT INTO public.conversations(id,user_id,project_id,status)
    VALUES(conversation,actor,project,'generating');
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,status,claim_token,claimed_at)
    VALUES(turn,conversation,actor,gen_random_uuid(),gen_random_uuid(),
      'running',claim,now());
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,status) VALUES(clear_turn,conversation,actor,
      gen_random_uuid(),gen_random_uuid(),'queued');
  INSERT INTO public.assistant_messages(id,conversation_id,turn_id,role,
    content,tool_calls) VALUES(clear_message,conversation,clear_turn,
      'assistant',cipher,'[{"id":"call-3"}]'::jsonb);
  UPDATE public.numo_assistant_turns SET checkpoint=
    '{"phase":"worker_result","worker_event":{"type":"worker_completed"},"assistantContent":"Private stale copy"}'::jsonb
    WHERE id=clear_turn;
  sealed_checkpoint:=jsonb_build_object('phase','tools','encrypted_payload',cipher,
    'encryption_version',2);
  IF NOT EXISTS(SELECT 1 FROM public.checkpoint_numo_tool_round_protected(
      turn,claim,message,cipher,2,sealed_checkpoint,1)) THEN
    RAISE EXCEPTION 'protected tool checkpoint failed';
  END IF;
  INSERT INTO public.assistant_messages(id,conversation_id,turn_id,role,
    content,tool_call_id,tool_name,tool_payload_version,context,metadata)
    VALUES(tool_message,conversation,turn,'tool',cipher,'call-1','ask_user',
      2,NULL,'{}'::jsonb);
  INSERT INTO public.assistant_messages(conversation_id,turn_id,role,
    content,final_payload_version,context,metadata)
    VALUES(conversation,turn,'assistant',cipher,2,NULL,'{}'::jsonb);
  IF (SELECT count(*) FROM public.assistant_messages WHERE turn_id=turn
      AND role='assistant')<>2 THEN
    RAISE EXCEPTION 'tool round collided with final answer';
  END IF;
  IF EXISTS(SELECT 1 FROM public.assistant_messages WHERE id IN
      (message,tool_message) AND (content LIKE '%Private%' OR
      tool_calls IS NOT NULL OR context IS NOT NULL OR metadata<>'{}'::jsonb)) OR
     EXISTS(SELECT 1 FROM public.numo_assistant_turns WHERE id=turn AND
       checkpoint::text LIKE '%Private%') THEN
    RAISE EXCEPTION 'protected tool copy leaked plaintext';
  END IF;
  response:=public.claim_numo_tool_operation_protected(turn,claim,'call-1',
    'ask_user',sealed,2,digest,'retry');
  IF response->>'action'<>'execute' THEN RAISE EXCEPTION 'claim failed'; END IF;
  IF NOT public.complete_numo_tool_operation_protected(turn,claim,'call-1',
      true,sealed,2,sealed,2,NULL,false) THEN
    RAISE EXCEPTION 'completion failed';
  END IF;
  response:=public.claim_numo_tool_operation_protected(turn,claim,'call-1',
    'ask_user',sealed,2,digest,'retry');
  IF response->>'action'<>'reuse' OR response->'result'<>sealed OR
      response->'model_result'<>sealed THEN
    RAISE EXCEPTION 'idempotent result failed';
  END IF;
  BEGIN
    PERFORM public.claim_numo_tool_operation_protected(turn,claim,'call-1',
      'ask_user',sealed,2,repeat('b',64),'retry');
    RAISE EXCEPTION 'argument conflict accepted';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM='argument conflict accepted' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.assistant_messages(conversation_id,turn_id,role,
      content,tool_calls) VALUES(conversation,turn,'assistant',
      'Private old round','[{"id":"call-2"}]'::jsonb);
    RAISE EXCEPTION 'old round writer accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old round writer accepted' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.assistant_messages(conversation_id,turn_id,role,
      content,tool_call_id,tool_name) VALUES(conversation,turn,'tool',
      'Private old result','call-2','ask_user');
    RAISE EXCEPTION 'old result writer accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old result writer accepted' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.checkpoint_numo_turn(turn,claim,'running',
      '{"phase":"model","messages":["Private"]}'::jsonb,
      NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'old checkpoint writer accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old checkpoint writer accepted' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.claim_numo_tool_operation(turn,claim,'call-2',
      'ask_user','{"Private":"arguments"}'::jsonb,'retry');
    RAISE EXCEPTION 'old operation writer accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old operation writer accepted' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.numo_tool_operations WHERE turn_id=turn AND
      (arguments::text LIKE '%Private%' OR result::text LIKE '%Private%' OR
       model_result::text LIKE '%Private%')) THEN
    RAISE EXCEPTION 'tool ledger leaked plaintext';
  END IF;
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,status) VALUES(new_turn,conversation,actor,
      gen_random_uuid(),gen_random_uuid(),'queued');
  migrated:=public.migrate_numo_tool_checkpoint(clear_turn,
      '{"phase":"worker_result","worker_event":{"type":"worker_completed"},"assistantContent":"Private stale copy"}'::jsonb,
      '{"phase":"worker_result","worker_event":{"type":"worker_completed"}}'::jsonb);
  IF NOT migrated OR EXISTS(SELECT 1 FROM public.numo_assistant_turns WHERE id=clear_turn
       AND checkpoint::text LIKE '%Private%') THEN
    RAISE EXCEPTION 'stale checkpoint cleanup failed';
  END IF;
  BEGIN
    UPDATE public.numo_assistant_turns SET checkpoint=
      '{"phase":"worker_result","assistantContent":"Private stale copy"}'::jsonb
      WHERE id=clear_turn;
    RAISE EXCEPTION 'obsolete worker-result writer accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='obsolete worker-result writer accepted' THEN RAISE; END IF;
  END;
  IF public.migrate_numo_tool_message(clear_message,'stale',
      '[{"id":"call-3"}]'::jsonb,NULL,'{}'::jsonb,0,cipher,2) OR
     NOT public.migrate_numo_tool_message(clear_message,cipher,
      '[{"id":"call-3"}]'::jsonb,NULL,'{}'::jsonb,0,cipher,2) THEN
    RAISE EXCEPTION 'tool message CAS failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.assistant_messages WHERE id=clear_message
    AND tool_calls IS NOT NULL) THEN
    RAISE EXCEPTION 'tool message migration retained calls';
  END IF;
  IF has_function_privilege('authenticated',
    'public.claim_numo_tool_operation_protected(uuid,uuid,text,text,jsonb,integer,text,text)',
    'EXECUTE') OR has_function_privilege('authenticated',
    'public.migrate_numo_tool_message(uuid,text,jsonb,jsonb,jsonb,integer,text,integer,jsonb,jsonb)',
    'EXECUTE') THEN
    RAISE EXCEPTION 'client can write protected tool content';
  END IF;
END $$;
ROLLBACK;
