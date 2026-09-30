-- Run on an isolated schema-only database after the Numo user-message migration.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  legacy_conversation uuid := gen_random_uuid();
  protected_conversation uuid := gen_random_uuid();
  ordinary_conversation uuid := gen_random_uuid();
  legacy_message uuid := gen_random_uuid();
  protected_message uuid := gen_random_uuid();
  protected_request uuid := gen_random_uuid();
  ordinary_message uuid := gen_random_uuid();
  ordinary_request uuid := gen_random_uuid();
  cipher text := '{"format":3,"keyVersion":2}';
  old_turn public.numo_assistant_turns;
  new_turn public.numo_assistant_turns;
  budget jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.conversations(id,user_id) VALUES
    (legacy_conversation,actor),(protected_conversation,actor),
    (ordinary_conversation,actor);
  SELECT * INTO old_turn FROM public.begin_numo_turn(
    legacy_conversation,actor,gen_random_uuid(),gen_random_uuid(),'{}'::jsonb,
    'test-model','medium',legacy_message,0,'Private legacy prompt',
    '{"selected":"Private issue"}'::jsonb,
    '{"attachments":["Private file"]}'::jsonb);
  UPDATE public.assistant_messages SET
    tool_calls='["Private call"]'::jsonb,
    tool_call_id='Private call id',tool_name='Private tool'
    WHERE id=legacy_message;
  SELECT public.begin_numo_turn_with_budget(
    protected_conversation,actor,protected_request,gen_random_uuid(),'{}'::jsonb,
    'test-model','medium',protected_message,2,cipher,NULL,'{}'::jsonb,
    now() - interval '1 day',100,1) INTO budget;
  SELECT * INTO new_turn FROM public.numo_assistant_turns
    WHERE conversation_id=protected_conversation AND request_id=protected_request;
  IF new_turn.id IS NULL OR budget->'turn'->>'id' IS DISTINCT FROM new_turn.id::text THEN
    RAISE EXCEPTION 'Budget admission did not persist the turn';
  END IF;
  SELECT * INTO new_turn FROM public.begin_numo_turn(
    ordinary_conversation,actor,ordinary_request,gen_random_uuid(),'{}'::jsonb,
    'test-model','medium',ordinary_message,2,cipher,NULL,'{}'::jsonb);
  IF (SELECT count(*) FROM public.assistant_messages WHERE turn_id=new_turn.id)<>1 OR
     (SELECT id FROM public.begin_numo_turn(ordinary_conversation,actor,
       ordinary_request,gen_random_uuid(),'{}'::jsonb,'test-model','medium',
       gen_random_uuid(),2,cipher,NULL,'{}'::jsonb)) IS DISTINCT FROM new_turn.id OR
     (SELECT count(*) FROM public.assistant_messages WHERE turn_id=new_turn.id)<>1 THEN
    RAISE EXCEPTION 'Ordinary admission lost its idempotent message';
  END IF;
  IF EXISTS (SELECT 1 FROM public.assistant_messages
      WHERE id=protected_message AND (content LIKE '%Private%' OR
        context IS NOT NULL OR metadata <> '{}'::jsonb OR
        tool_calls IS NOT NULL OR tool_call_id IS NOT NULL OR
        tool_name IS NOT NULL OR user_payload_version<>2)) OR
     EXISTS (SELECT 1 FROM public.numo_messages
      WHERE id=protected_message AND (content LIKE '%Private%' OR
        context IS NOT NULL OR metadata <> '{}'::jsonb)) THEN
    RAISE EXCEPTION 'Numo user message source or projection retained plaintext';
  END IF;
  BEGIN
    INSERT INTO public.assistant_messages(conversation_id,turn_id,role,content)
      VALUES(protected_conversation,new_turn.id,'user','Private obsolete prompt');
    RAISE EXCEPTION 'old direct user writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='old direct user writer was accepted' THEN RAISE; END IF;
  END;
  IF public.migrate_numo_user_message(legacy_message,'wrong',NULL,'{}'::jsonb,
      NULL,NULL,NULL,0,cipher,2) OR NOT public.migrate_numo_user_message(legacy_message,
      'Private legacy prompt','{"selected":"Private issue"}'::jsonb,
      '{"attachments":["Private file"]}'::jsonb,'["Private call"]'::jsonb,
      'Private call id','Private tool',0,cipher,2) THEN
    RAISE EXCEPTION 'Numo user message compare-and-swap failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.assistant_messages WHERE id=legacy_message
      AND (content LIKE '%Private%' OR context IS NOT NULL OR metadata<>'{}'::jsonb
        OR tool_calls IS NOT NULL OR tool_call_id IS NOT NULL OR tool_name IS NOT NULL
        OR user_payload_checked_at IS NULL)) THEN
    RAISE EXCEPTION 'Historical Numo user message retained plaintext';
  END IF;
  IF to_regprocedure('public.begin_numo_turn(uuid,uuid,uuid,uuid,jsonb,text,text,text,jsonb,jsonb)')
      IS NOT NULL OR has_function_privilege('authenticated',
        'public.migrate_numo_user_message(uuid,text,jsonb,jsonb,jsonb,text,text,integer,text,integer)',
        'EXECUTE') THEN
    RAISE EXCEPTION 'obsolete or public Numo user message writer remains';
  END IF;
END $$;
ROLLBACK;
