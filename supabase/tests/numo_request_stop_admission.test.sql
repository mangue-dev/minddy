-- Exercise stopped request receipts against the actual admission and claim RPCs.
BEGIN;
DO $$
DECLARE
  owner_id uuid := '61000000-0000-4000-8000-000000000001';
  conversation_id uuid := '61000000-0000-4000-8000-000000000002';
  old_request uuid := '61000000-0000-4000-8000-000000000003';
  next_request uuid := '61000000-0000-4000-8000-000000000004';
  receipt public.numo_assistant_turns;
  admitted public.numo_assistant_turns;
  budget_result jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(owner_id);
  INSERT INTO public.conversations(id,user_id,status) VALUES(conversation_id,owner_id,'idle');
  INSERT INTO public.numo_assistant_turns(conversation_id,user_id,request_id,run_id,status,completed_at)
    VALUES(conversation_id,owner_id,old_request,gen_random_uuid(),'stopped',now()) RETURNING * INTO receipt;

  admitted := public.begin_numo_turn(conversation_id,owner_id,old_request,gen_random_uuid(),
    '{}'::jsonb,'z-ai/glm-5.3-flash','low',gen_random_uuid(),0,'Canceled message',NULL,'{}'::jsonb);
  IF admitted.id <> receipt.id OR admitted.status <> 'stopped' THEN
    RAISE EXCEPTION 'A stopped receipt must win admission for the same request';
  END IF;
  IF EXISTS(SELECT 1 FROM public.assistant_messages WHERE turn_id=receipt.id) THEN
    RAISE EXCEPTION 'Canceled admission must not insert a user message';
  END IF;
  IF EXISTS(SELECT 1 FROM public.claim_numo_turn(receipt.id,gen_random_uuid(),false)) THEN
    RAISE EXCEPTION 'A stopped request must never acquire execution authority';
  END IF;

  budget_result := public.begin_numo_turn_with_budget(conversation_id,owner_id,old_request,
    gen_random_uuid(),'{}'::jsonb,'z-ai/glm-5.3-flash','low',gen_random_uuid(),0,
    'Canceled message',NULL,'{}'::jsonb,now(),1,1);
  IF budget_result->'turn'->>'id' <> receipt.id::text
      OR budget_result->'turn'->>'status' <> 'stopped' THEN
    RAISE EXCEPTION 'Managed admission must honor the receipt before reading or reserving budget';
  END IF;

  admitted := public.begin_numo_turn(conversation_id,owner_id,next_request,gen_random_uuid(),
    '{}'::jsonb,'z-ai/glm-5.3-flash','low',gen_random_uuid(),0,'New action',NULL,'{}'::jsonb);
  IF admitted.status <> 'queued' OR admitted.id=receipt.id THEN
    RAISE EXCEPTION 'A new user action must remain independently admissible';
  END IF;
  SELECT * INTO admitted FROM public.claim_numo_turn(admitted.id,gen_random_uuid(),false);
  IF admitted.status <> 'running' THEN RAISE EXCEPTION 'The new request must execute'; END IF;

  UPDATE public.numo_assistant_turns SET status='stopped',claim_token=NULL,claimed_at=NULL
    WHERE user_id=owner_id AND request_id=old_request;
  IF NOT EXISTS(SELECT 1 FROM public.numo_assistant_turns WHERE id=admitted.id
      AND status='running' AND claim_token IS NOT NULL) THEN
    RAISE EXCEPTION 'A late Stop for the old request must not revoke the newer request';
  END IF;
END;
$$;
ROLLBACK;
