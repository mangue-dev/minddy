-- Run with test/numo-stop-fixture.mjs and the MIN-628 migration in a disposable DB.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  project uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid();
  turn uuid := gen_random_uuid();
  worker uuid := gen_random_uuid();
  sibling uuid := gen_random_uuid();
  claim uuid := gen_random_uuid();
  stopped public.numo_assistant_turns%ROWTYPE;
BEGIN
  INSERT INTO auth.users VALUES(actor);
  INSERT INTO public.conversations(id,user_id,status) VALUES(conversation,actor,'generating');
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,request_id,run_id,status)
    VALUES(turn,conversation,actor,gen_random_uuid(),gen_random_uuid(),'queued');
  INSERT INTO public.agent_runs(id,project_id,conversation_id,status,parent_numo_turn_id,parent_numo_conversation_id)
    VALUES(worker,project,gen_random_uuid(),'running',turn,conversation),(sibling,project,gen_random_uuid(),'running',turn,conversation);
  INSERT INTO public.agent_run_messages VALUES(worker,NULL),(sibling,NULL);
  INSERT INTO public.agent_run_input_requests VALUES(worker,turn,'pending'),(sibling,turn,'pending');
  UPDATE public.numo_assistant_turns SET status='waiting_work',active_run_id=worker WHERE id=turn;
  PERFORM public.request_numo_worker_stop(worker);
  IF NOT (SELECT interrupt_requested FROM public.agent_runs WHERE id=worker)
      OR (SELECT interrupt_requested FROM public.agent_runs WHERE id=sibling) THEN
    RAISE EXCEPTION 'Individual stop did not preserve worker scope';
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_run_messages WHERE run_id=worker AND consumed_at IS NULL)
      OR NOT EXISTS(SELECT 1 FROM public.agent_run_messages WHERE run_id=sibling AND consumed_at IS NULL) THEN
    RAISE EXCEPTION 'Individual stop consumed the wrong steering';
  END IF;
  IF (SELECT status FROM public.numo_assistant_turns WHERE id=turn)<>'stopped'
      OR EXISTS(SELECT 1 FROM public.claim_numo_turn(turn,claim,false))
      OR public.resume_numo_turn_from_worker(worker,gen_random_uuid(),'worker_completed','{}')<>'ignored' THEN
    RAISE EXCEPTION 'Stopped work can wake or relaunch Numo';
  END IF;
  PERFORM public.request_numo_worker_stop(worker);
  -- A running parent loses execution authority immediately on individual Stop.
  UPDATE public.numo_assistant_turns SET status='running',claim_token=claim,claimed_at=now() WHERE id=turn;
  PERFORM public.request_numo_worker_stop(worker);
  IF EXISTS(SELECT 1 FROM public.numo_assistant_turns WHERE id=turn AND claim_token IS NOT NULL) THEN
    RAISE EXCEPTION 'Individual stop left an old executor authorized';
  END IF;
  -- Global Stop still covers all workers and is idempotent while stopping.
  UPDATE public.agent_runs SET interrupt_requested=false;
  UPDATE public.numo_assistant_turns SET status='running',claim_token=claim,claimed_at=now() WHERE id=turn;
  SELECT * INTO stopped FROM public.request_numo_turn_stop(conversation,actor);
  IF stopped.status<>'stopping' OR EXISTS(SELECT 1 FROM public.agent_runs WHERE NOT interrupt_requested) THEN
    RAISE EXCEPTION 'Global stop failed to cascade';
  END IF;
  SELECT * INTO stopped FROM public.request_numo_turn_stop(conversation,actor);
  IF stopped.status<>'stopping' OR stopped.claim_token<>claim THEN
    RAISE EXCEPTION 'Repeated stop lost its execution claim';
  END IF;
  IF EXISTS(SELECT 1 FROM public.request_numo_turn_stop(conversation,gen_random_uuid())) THEN
    RAISE EXCEPTION 'A different owner can stop the conversation';
  END IF;
END $$;
ROLLBACK;
