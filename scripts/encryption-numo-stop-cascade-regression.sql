-- Run against an isolated schema-only database after all encryption migrations.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  project uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid();
  turn uuid := gen_random_uuid();
  retry_conversation uuid := gen_random_uuid();
  retry_turn uuid := gen_random_uuid();
  cipher text := 'mdye3:1:YWJj';
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.projects(id,owner_id,name,key)
    VALUES(project,actor,'Independent Stop fixture','STOP');
  INSERT INTO public.conversations(id,user_id,project_id,status,error_message)
    VALUES(conversation,actor,project,'generating',cipher),
      (retry_conversation,actor,project,'generating',cipher);
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,
    request_id,run_id,status,claim_token,claimed_at,error_message,checkpoint)
    VALUES(turn,conversation,actor,gen_random_uuid(),gen_random_uuid(),
      'stopping',gen_random_uuid(),now()-interval '7 minutes',cipher,'{}'),
      (retry_turn,retry_conversation,actor,gen_random_uuid(),gen_random_uuid(),
      'running',gen_random_uuid(),now()-interval '7 minutes',cipher,'{}');

  IF public.recover_stale_numo_turns() <> 2 THEN
    RAISE EXCEPTION 'stale turn recovery count is incorrect';
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
        AND (status<>'error' OR error_message IS NOT NULL)) THEN
    RAISE EXCEPTION 'encrypted running-turn recovery behavior regressed';
  END IF;
  IF public.recover_stale_numo_turns() <> 0 THEN
    RAISE EXCEPTION 'stale turn recovery is not idempotent';
  END IF;
END $$;
ROLLBACK;
