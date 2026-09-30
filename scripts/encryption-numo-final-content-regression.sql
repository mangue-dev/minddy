-- Run on an isolated schema-only database after the Numo final-content migration.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  legacy_conversation uuid := gen_random_uuid();
  protected_conversation uuid := gen_random_uuid();
  legacy_turn uuid := gen_random_uuid();
  protected_turn uuid := gen_random_uuid();
  legacy_message uuid := gen_random_uuid();
  protected_message uuid := gen_random_uuid();
  claim uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":2}';
  outcome_cipher text := 'mdyf3:2:YWJj';
  old_message jsonb;
  new_message jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.conversations(id,user_id) VALUES
    (legacy_conversation,actor),(protected_conversation,actor);
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,status,outcome) VALUES(legacy_turn,legacy_conversation,
    actor,gen_random_uuid(),gen_random_uuid(),'completed','Private answer');
  INSERT INTO public.assistant_messages(id,conversation_id,turn_id,role,
    content,context,metadata,tool_name) VALUES(legacy_message,
    legacy_conversation,legacy_turn,'assistant','Private answer',
    '{"page":"Private context"}'::jsonb,
    '{"reasoning":"Private reasoning"}'::jsonb,'Private tool name');
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,status,claim_token,claimed_at,outcome)
    VALUES(protected_turn,protected_conversation,actor,gen_random_uuid(),
      gen_random_uuid(),'running',claim,now(),outcome_cipher);
  INSERT INTO public.assistant_messages(id,conversation_id,turn_id,role,
    content,final_payload_version) VALUES(protected_message,
    protected_conversation,protected_turn,'assistant',cipher,2);
  IF EXISTS (SELECT 1 FROM public.assistant_messages WHERE id=protected_message
      AND (content LIKE '%Private%' OR context IS NOT NULL OR
        metadata<>'{}'::jsonb OR tool_name IS NOT NULL)) OR
     EXISTS (SELECT 1 FROM public.numo_messages WHERE id=protected_message
      AND (content LIKE '%Private%' OR context IS NOT NULL OR
        metadata<>'{}'::jsonb)) OR
     EXISTS (SELECT 1 FROM public.numo_turns WHERE id=protected_turn
      AND outcome LIKE '%Private%') THEN
    RAISE EXCEPTION 'Numo final source or projection retained plaintext';
  END IF;
  BEGIN
    INSERT INTO public.assistant_messages(conversation_id,turn_id,role,content)
      VALUES(protected_conversation,protected_turn,'assistant',
        'Private obsolete answer');
    RAISE EXCEPTION 'old final-message writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old final-message writer was accepted' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.checkpoint_numo_turn(protected_turn,claim,'completed',
      '{}'::jsonb,NULL,NULL,'Private obsolete outcome',NULL);
    RAISE EXCEPTION 'old checkpoint writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old checkpoint writer was accepted' THEN RAISE; END IF;
  END;
  old_message := jsonb_build_object('content','Private answer',
    'context','{"page":"Private context"}'::jsonb,
    'metadata','{"reasoning":"Private reasoning"}'::jsonb,
    'tool_call_id',NULL,'tool_name','Private tool name','version',0);
  new_message := jsonb_build_object('content',cipher,'version',2);
  IF public.migrate_numo_final_content(legacy_turn,legacy_message,
      '{}'::jsonb,new_message,'Private answer',outcome_cipher) OR
     NOT public.migrate_numo_final_content(legacy_turn,legacy_message,
      old_message,new_message,'Private answer',outcome_cipher) THEN
    RAISE EXCEPTION 'Numo final bundle CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.assistant_messages WHERE id=legacy_message
      AND (content LIKE '%Private%' OR context IS NOT NULL OR
        metadata<>'{}'::jsonb OR tool_name IS NOT NULL OR
        final_payload_checked_at IS NULL)) OR
     EXISTS (SELECT 1 FROM public.numo_assistant_turns WHERE id=legacy_turn
      AND (outcome LIKE '%Private%' OR outcome_encryption_checked_at IS NULL)) OR
     EXISTS (SELECT 1 FROM public.numo_messages WHERE id=legacy_message
       AND (content LIKE '%Private%' OR context IS NOT NULL)) OR
     EXISTS (SELECT 1 FROM public.numo_turns WHERE id=legacy_turn
       AND outcome LIKE '%Private%') THEN
    RAISE EXCEPTION 'Historical Numo final copy retained plaintext';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_numo_final_content(uuid,uuid,jsonb,jsonb,text,text)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'client can migrate Numo final content';
  END IF;
END $$;
ROLLBACK;
