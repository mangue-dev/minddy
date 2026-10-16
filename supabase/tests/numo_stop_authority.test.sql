-- Stop revokes execution authority from the turn owner only and is idempotent.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  conversation uuid := gen_random_uuid();
  turn uuid := gen_random_uuid();
  claim uuid := gen_random_uuid();
  stopped public.numo_assistant_turns%ROWTYPE;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor);
  INSERT INTO public.conversations(id,user_id,status) VALUES(conversation,actor,'generating');
  INSERT INTO public.numo_assistant_turns(id,conversation_id,user_id,request_id,run_id,
    status,claim_token,claimed_at)
    VALUES(turn,conversation,actor,gen_random_uuid(),gen_random_uuid(),'running',claim,now());
  SELECT * INTO stopped FROM public.request_numo_turn_stop(conversation,actor);
  IF stopped.id IS DISTINCT FROM turn OR stopped.status<>'stopping' THEN
    RAISE EXCEPTION 'Stop did not mark the running turn as stopping';
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
