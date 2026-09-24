\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid := gen_random_uuid(); conversation uuid := gen_random_uuid();
  turn uuid := gen_random_uuid(); first_id uuid := gen_random_uuid();
  next_id uuid := gen_random_uuid();
  cipher jsonb; refused boolean := false;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.conversations(id,user_id) VALUES(conversation,actor);
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id) VALUES(turn,conversation,actor,gen_random_uuid(),
    gen_random_uuid());
  INSERT INTO public.numo_turn_events(id,turn_id,seq,type,payload)
    VALUES(first_id,turn,1,'content_delta',
      '{"delta":"private issue title"}'::jsonb);
  cipher := jsonb_build_object('encrypted_turn_payload',
    '{"format":3,"keyVersion":1}', 'encryption_version',1,
    'user_id',actor,'turn_id',turn,'event_id',first_id);
  IF NOT public.migrate_numo_activity_payload(first_id,
      '{"delta":"private issue title"}'::jsonb,cipher) OR
      public.migrate_numo_activity_payload(first_id,
      '{"delta":"private issue title"}'::jsonb,cipher) THEN
    RAISE EXCEPTION 'Numo activity CAS failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.numo_turn_events WHERE id=first_id
      AND payload::text LIKE '%private issue title%') THEN
    RAISE EXCEPTION 'Numo activity remained clear';
  END IF;
  BEGIN
    PERFORM public.append_numo_turn_event(turn,next_id,'content_delta',
      '{"delta":"obsolete writer"}'::jsonb);
  EXCEPTION WHEN check_violation THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Old Numo event writer accepted'; END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_numo_activity_payload(uuid,jsonb,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Numo event migration has client privilege';
  END IF;
END;
$test$;
ROLLBACK;
