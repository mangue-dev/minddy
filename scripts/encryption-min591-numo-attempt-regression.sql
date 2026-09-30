-- Run only on an isolated database after migration 20270108100000.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'minddy_min591_%' THEN
    RAISE EXCEPTION 'Use an isolated minddy_min591_* database';
  END IF;
END $$;
DO $test$
DECLARE actor uuid:=gen_random_uuid(); conversation uuid:=gen_random_uuid();
  first_turn uuid:=gen_random_uuid(); second_turn uuid:=gen_random_uuid();
  old_intent jsonb:='{"title":"Private intent"}'::jsonb;
  cipher jsonb; marked boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.conversations(id,user_id) VALUES(conversation,actor);
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,intent) VALUES
    (first_turn,conversation,actor,gen_random_uuid(),gen_random_uuid(),old_intent),
    (second_turn,conversation,actor,gen_random_uuid(),gen_random_uuid(),old_intent);
  IF NOT public.mark_numo_turn_intent_attempt(first_turn,old_intent) THEN
    RAISE EXCEPTION 'The first failed intent was not deferred';
  END IF;
  IF EXISTS (SELECT 1 FROM public.numo_assistant_turns WHERE id=first_turn
      AND intent_encryption_checked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'A failed intent was marked verified';
  END IF;
  IF (SELECT id FROM public.numo_assistant_turns
      ORDER BY intent_encryption_attempted_at NULLS FIRST,id LIMIT 1)
      IS DISTINCT FROM second_turn THEN
    RAISE EXCEPTION 'A failed intent still blocks the next candidate';
  END IF;
  IF public.mark_numo_turn_intent_attempt(first_turn,'{}'::jsonb) THEN
    RAISE EXCEPTION 'A stale intent attempt marker passed CAS';
  END IF;
  cipher:=jsonb_build_object('encrypted_intent',
    '{"format":3,"keyVersion":1}'::jsonb,'encryption_version',1,
    'user_id',actor,'conversation_id',conversation,
    'request_id',(SELECT request_id FROM public.numo_assistant_turns
      WHERE id=second_turn));
  IF NOT public.migrate_numo_turn_intent(second_turn,old_intent,cipher) THEN
    RAISE EXCEPTION 'The healthy intent failed migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.numo_assistant_turns WHERE id=second_turn
      AND (intent_encryption_checked_at IS NULL OR
        intent_encryption_attempted_at IS NULL OR
        intent ? 'title')) THEN
    RAISE EXCEPTION 'The migrated intent was not verified and sealed';
  END IF;
  IF (SELECT count(*) FROM public.numo_assistant_turns
      WHERE id IN (first_turn,second_turn) AND intent_encryption_checked_at IS NULL)
      <> 1 THEN
    RAISE EXCEPTION 'The irrecoverable intent stopped blocking activation';
  END IF;
  IF public.mark_numo_content_attempt('title',conversation,
      '{"title":"Stale title"}'::jsonb,NULL) THEN
    RAISE EXCEPTION 'A stale generic attempt marker passed CAS';
  END IF;
  IF has_function_privilege('authenticated',
      'public.mark_numo_content_attempt(text,uuid,jsonb,text)','EXECUTE') OR
     has_function_privilege('authenticated',
      'public.mark_numo_turn_intent_attempt(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'A client can mark Numo maintenance attempts';
  END IF;
  BEGIN
    PERFORM public.mark_numo_tool_content_attempt('checkpoint',first_turn,NULL);
    RAISE EXCEPTION 'The obsolete tool marker was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM='The obsolete tool marker was accepted' THEN RAISE; END IF;
  END;
END;
$test$;
ROLLBACK;
