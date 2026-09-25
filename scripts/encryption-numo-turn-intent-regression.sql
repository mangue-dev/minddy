-- Run on an isolated schema-only database after migration 20270107540000.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid();
  old_conversation uuid := gen_random_uuid();
  turn uuid := gen_random_uuid();
  request uuid := gen_random_uuid();
  second uuid := gen_random_uuid();
  old_intent jsonb := '{"automation":{"issue":{"title":"Private issue title","plan":"Private plan"}}}'::jsonb;
  cipher jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.conversations(id,user_id) VALUES(conversation,actor);
  INSERT INTO public.conversations(id,user_id) VALUES(old_conversation,actor);
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,intent) VALUES(turn,conversation,actor,request,
    gen_random_uuid(),old_intent);
  cipher := jsonb_build_object('encrypted_intent',
    '{"format":3,"keyVersion":1}', 'encryption_version',1,
    'user_id',actor,'conversation_id',conversation,'request_id',request);
  IF public.migrate_numo_turn_intent(turn,'{}'::jsonb,cipher) THEN
    RAISE EXCEPTION 'stale Numo intent CAS was accepted';
  END IF;
  IF NOT public.migrate_numo_turn_intent(turn,old_intent,cipher) THEN
    RAISE EXCEPTION 'Numo intent CAS was refused';
  END IF;
  IF EXISTS (SELECT 1 FROM public.numo_assistant_turns WHERE id=turn
      AND intent::text LIKE '%Private issue title%') THEN
    RAISE EXCEPTION 'Numo turn retained clear issue content';
  END IF;
  BEGIN
    INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
      request_id,run_id,intent) VALUES(second,conversation,actor,
      gen_random_uuid(),gen_random_uuid(),old_intent);
    RAISE EXCEPTION 'old Numo turn writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old Numo turn writer was accepted' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.begin_numo_turn(old_conversation,actor,gen_random_uuid(),
      gen_random_uuid(),old_intent,'test-model','low','Private prompt',
      '{}'::jsonb,'{}'::jsonb);
    RAISE EXCEPTION 'old admission RPC was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old admission RPC was accepted' THEN RAISE; END IF;
  END;
  IF has_function_privilege('authenticated',
      'public.migrate_numo_turn_intent(uuid,jsonb,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'client can migrate Numo intent';
  END IF;
END $$;
ROLLBACK;
