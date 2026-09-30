-- Run against an isolated schema-only database with the Numo error migration.
BEGIN;
DO $$
DECLARE actor uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  routine uuid:=gen_random_uuid(); conversation uuid:=gen_random_uuid();
  turn uuid:=gen_random_uuid(); occurrence uuid:=gen_random_uuid();
  protected_conversation uuid:=gen_random_uuid(); protected_turn uuid:=gen_random_uuid();
  claim uuid:=gen_random_uuid(); cipher text:='mdye3:2:YWJj';
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Error fixture','ERR');
  INSERT INTO public.agent_routines(id,project_id,owner_id,title,prompt,frequency)
    VALUES(routine,project,actor,'Fixture','Fixture','daily');
  INSERT INTO public.conversations(id,user_id,status,error_message)
    VALUES(conversation,actor,'error','Private conversation error');
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,status,error_message)
    VALUES(turn,conversation,actor,gen_random_uuid(),gen_random_uuid(),
      'failed','Private turn error');
  INSERT INTO public.numo_routine_occurrences(id,routine_id,origin,
    conversation_id,request_id,error_code,error_message)
    VALUES(occurrence,routine,'manual',conversation,gen_random_uuid(),
      'Private code','Private occurrence error');
  INSERT INTO public.conversations(id,user_id,status,error_message)
    VALUES(protected_conversation,actor,'error',cipher);
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,status,claim_token,claimed_at,error_message)
    VALUES(protected_turn,protected_conversation,actor,gen_random_uuid(),
      gen_random_uuid(),'running',claim,now(),cipher);
  IF EXISTS(SELECT 1 FROM public.numo_turns WHERE id=protected_turn
      AND error_message LIKE '%Private%') OR
     EXISTS(SELECT 1 FROM public.numo_conversation_history
       WHERE legacy_id=protected_conversation AND error_message LIKE '%Private%') THEN
    RAISE EXCEPTION 'Numo error projection retained plaintext';
  END IF;
  BEGIN
    UPDATE public.conversations SET error_message='Obsolete private error'
      WHERE id=protected_conversation;
    RAISE EXCEPTION 'obsolete conversation writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='obsolete conversation writer was accepted' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.numo_assistant_turns SET error_message='Obsolete private error'
      WHERE id=protected_turn;
    RAISE EXCEPTION 'obsolete turn writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='obsolete turn writer was accepted' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.numo_routine_occurrences
      SET error_message='Obsolete private error' WHERE id=occurrence;
    RAISE EXCEPTION 'obsolete occurrence writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='obsolete occurrence writer was accepted' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.checkpoint_numo_turn(protected_turn,claim,'failed',
      '{}'::jsonb,NULL,'Obsolete private error',NULL,NULL,
      'Obsolete private error');
    RAISE EXCEPTION 'obsolete checkpoint writer was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM='obsolete checkpoint writer was accepted' THEN RAISE; END IF;
  END;
  IF public.migrate_numo_error_bundle(conversation,turn,occurrence,
      'stale',cipher,'Private turn error',cipher,
      'Private occurrence error',cipher,'Private code') OR
     NOT public.migrate_numo_error_bundle(conversation,turn,occurrence,
      'Private conversation error',cipher,'Private turn error',cipher,
      'Private occurrence error',cipher,'Private code') THEN
    RAISE EXCEPTION 'Numo error bundle CAS failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.conversations WHERE id=conversation
      AND (error_message LIKE '%Private%' OR error_encryption_checked_at IS NULL)) OR
     EXISTS(SELECT 1 FROM public.numo_assistant_turns WHERE id=turn
      AND (error_message LIKE '%Private%' OR error_encryption_checked_at IS NULL)) OR
     EXISTS(SELECT 1 FROM public.numo_routine_occurrences WHERE id=occurrence
      AND (error_message LIKE '%Private%' OR error_code LIKE '%Private%' OR
        error_code<>'numo_unavailable' OR error_encryption_checked_at IS NULL)) OR
     EXISTS(SELECT 1 FROM public.numo_turns WHERE id=turn
      AND error_message LIKE '%Private%') OR
     EXISTS(SELECT 1 FROM public.numo_conversation_history
      WHERE legacy_id=conversation AND error_message LIKE '%Private%') THEN
    RAISE EXCEPTION 'historical Numo error copy retained plaintext';
  END IF;
  IF has_function_privilege('authenticated',
      'public.migrate_numo_error_bundle(uuid,uuid,uuid,text,text,text,text,text,text,text)',
      'EXECUTE') OR has_function_privilege('authenticated',
      'public.fail_numo_routine_occurrence(uuid,uuid,text,text,text)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'client can write protected Numo errors';
  END IF;
  IF pg_catalog.pg_get_functiondef(
        'public.claim_numo_tool_operation(uuid,uuid,text,text,jsonb,text)'::regprocedure)
        LIKE '%A tool may have completed before its result was recorded%' OR
     pg_catalog.pg_get_functiondef(
        'public.recover_stale_numo_turns()'::regprocedure)
        LIKE '%The Numo process stopped before the turn%' THEN
    RAISE EXCEPTION 'SQL recovery writer retained clear error text';
  END IF;
END $$;
ROLLBACK;
