-- Run against an isolated schema-only database after all encryption migrations.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  project uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid();
  turn uuid := gen_random_uuid();
  awaited uuid := gen_random_uuid();
  extra uuid := gen_random_uuid();
  terminal uuid := gen_random_uuid();
  unrelated uuid := gen_random_uuid();
  retry_conversation uuid := gen_random_uuid();
  retry_turn uuid := gen_random_uuid();
  handoff_conversation uuid := gen_random_uuid();
  handoff_turn uuid := gen_random_uuid();
  cipher text := 'mdye3:1:YWJj';
  delegation_cipher text := '{"format":3,"keyVersion":1,"data":"test-only-placeholder"}';
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Stop cascade fixture','STOP');
  INSERT INTO public.conversations(id,user_id,project_id,status,error_message)
    VALUES(conversation,actor,project,'generating',cipher),
      (retry_conversation,actor,project,'generating',cipher),
      (handoff_conversation,actor,project,'generating',cipher);
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,status,claim_token,claimed_at,error_message,checkpoint)
    VALUES(turn,conversation,actor,gen_random_uuid(),gen_random_uuid(),
      'stopping',gen_random_uuid(),now()-interval '7 minutes',cipher,'{}'),
      (retry_turn,retry_conversation,actor,gen_random_uuid(),gen_random_uuid(),
      'running',gen_random_uuid(),now()-interval '7 minutes',cipher,'{}'),
      (handoff_turn,handoff_conversation,actor,gen_random_uuid(),gen_random_uuid(),
      'running',gen_random_uuid(),now()-interval '7 minutes',cipher,
      '{"phase":"worker_result"}');
  INSERT INTO public.agent_runs(id,project_id,created_by,status,
    parent_numo_turn_id,parent_numo_conversation_id,parent_numo_tool_call_id,
    encrypted_delegation_input,delegation_encryption_version)
    VALUES(awaited,project,actor,'running',turn,conversation,'awaited',delegation_cipher,1),
      (extra,project,actor,'queued',turn,conversation,'extra',delegation_cipher,1),
      (terminal,project,actor,'completed',turn,conversation,'terminal',delegation_cipher,1),
      (unrelated,project,actor,'running',NULL,NULL,NULL,NULL,0);
  UPDATE public.numo_assistant_turns SET active_run_id=awaited WHERE id=turn;
  INSERT INTO public.agent_run_messages(run_id,created_by,content)
    VALUES(awaited,actor,'Awaited steering'),(extra,actor,'Extra steering'),
      (terminal,actor,'Terminal steering'),(unrelated,actor,'Unrelated steering');
  INSERT INTO public.agent_run_input_requests(run_id,parent_numo_turn_id,
    question_id,call_id,questions)
    VALUES(extra,turn,'fixture-question','fixture-call','[{}]');

  IF public.recover_stale_numo_turns() <> 3 THEN
    RAISE EXCEPTION 'stale turn recovery count is incorrect';
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_runs WHERE id IN (awaited,extra)
      AND NOT interrupt_requested) OR
      EXISTS(SELECT 1 FROM public.agent_runs WHERE id IN (terminal,unrelated)
        AND interrupt_requested) THEN
    RAISE EXCEPTION 'stale stop failed to interrupt precisely its live workers';
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_run_messages
      WHERE run_id IN (awaited,extra,terminal) AND consumed_at IS NULL) OR
      EXISTS(SELECT 1 FROM public.agent_run_messages
        WHERE run_id=unrelated AND consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'stale stop failed to discard precisely its queued steering';
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_run_input_requests
      WHERE parent_numo_turn_id=turn AND status<>'canceled') THEN
    RAISE EXCEPTION 'stale stop left a pending worker question';
  END IF;
  IF EXISTS(SELECT 1 FROM public.numo_assistant_turns WHERE id=turn
      AND (status<>'stopped' OR claim_token IS NOT NULL OR claimed_at IS NOT NULL
        OR completed_at IS NULL OR error_message IS NOT NULL)) OR
      EXISTS(SELECT 1 FROM public.conversations WHERE id=conversation
        AND (status<>'idle' OR error_message IS NOT NULL)) THEN
    RAISE EXCEPTION 'stale stop did not complete its encrypted parent state';
  END IF;
  IF EXISTS(SELECT 1 FROM public.numo_assistant_turns WHERE id=retry_turn
      AND (status<>'retryable' OR error_message IS NOT NULL)) OR
      EXISTS(SELECT 1 FROM public.conversations WHERE id=retry_conversation
        AND (status<>'error' OR error_message IS NOT NULL)) OR
      EXISTS(SELECT 1 FROM public.numo_assistant_turns WHERE id=handoff_turn
        AND (status<>'queued' OR error_message IS NOT NULL)) OR
      EXISTS(SELECT 1 FROM public.conversations WHERE id=handoff_conversation
        AND (status<>'generating' OR error_message IS NOT NULL)) THEN
    RAISE EXCEPTION 'encrypted running-turn recovery behavior regressed';
  END IF;
  IF public.recover_stale_numo_turns() <> 0 THEN
    RAISE EXCEPTION 'stale turn recovery is not idempotent';
  END IF;
END $$;
ROLLBACK;
