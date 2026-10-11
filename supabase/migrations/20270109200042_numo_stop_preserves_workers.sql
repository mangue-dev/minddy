-- Numo Stop and stale-stop recovery leave delegated workers independently controllable.
BEGIN;

CREATE OR REPLACE FUNCTION public.request_numo_turn_stop(
  p_conversation_id uuid,
  p_user_id uuid
) RETURNS SETOF public.numo_assistant_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || p_conversation_id::text, 516)
  );
  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id
    AND status IN ('queued', 'running', 'waiting_work', 'waiting_input', 'retryable', 'reconciling', 'stopping')
  ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  IF v_turn.id IS NULL THEN RETURN; END IF;
  -- Stop only Numo. Admitted workers retain their own execution authority.
  UPDATE public.numo_assistant_turns
  SET status = CASE WHEN v_turn.status IN ('running', 'stopping') THEN 'stopping' ELSE 'stopped' END,
      claim_token = CASE WHEN v_turn.status IN ('running', 'stopping') THEN claim_token END,
      claimed_at = CASE WHEN v_turn.status IN ('running', 'stopping') THEN claimed_at END,
      completed_at = CASE WHEN v_turn.status IN ('running', 'stopping') THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = v_turn.id RETURNING * INTO v_turn;
  UPDATE public.conversations SET
    status = CASE WHEN v_turn.status = 'stopping' THEN 'generating' ELSE 'idle' END,
    error_message = NULL, updated_at = now()
  WHERE id = p_conversation_id;
  RETURN NEXT v_turn;
END;
$$;

REVOKE ALL ON FUNCTION public.request_numo_turn_stop(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_numo_turn_stop(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recover_stale_numo_turns()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count integer := 0;
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  -- Terminal worker results are decoded and re-encrypted by the application.
  -- SQL only recovers expired claims and must not copy protected worker fields.
  FOR v_turn IN
    SELECT * FROM public.numo_assistant_turns
    WHERE status IN ('running', 'stopping')
      AND claimed_at < now() - interval '6 minutes'
    ORDER BY claimed_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.numo_assistant_turns
    SET status = CASE
          WHEN v_turn.status = 'stopping' THEN 'stopped'
          WHEN v_turn.checkpoint ->> 'phase' = 'worker_result' THEN 'queued'
          ELSE 'retryable'
        END,
        claim_token = NULL,
        claimed_at = NULL,
        completed_at = CASE WHEN v_turn.status = 'stopping' THEN now() END,
        error_message = NULL,
        updated_at = now()
    WHERE id = v_turn.id;
    UPDATE public.conversations
    SET status = CASE
          WHEN v_turn.status = 'stopping' THEN 'idle'
          WHEN v_turn.checkpoint ->> 'phase' = 'worker_result' THEN 'generating'
          ELSE 'error'
        END,
        error_message = NULL,
        updated_at = now()
    WHERE id = v_turn.conversation_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stale_numo_turns()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_numo_turns() TO service_role;

COMMIT;
