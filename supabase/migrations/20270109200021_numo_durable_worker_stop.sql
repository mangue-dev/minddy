-- MIN-628: durable, idempotent stops and a scoped worker stop that prevents
-- its Numo turn from interpreting cancellation as permission to retry.
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
  -- CASCADE: every live worker of the turn, not only the awaited one. The turn
  -- is the ownership boundary (`parent_numo_turn_id`), so this covers the
  -- awaited run, a queued relaunch, and any extra worker a tool round left
  -- running when the turn suspended on another one.
  UPDATE public.agent_runs SET interrupt_requested = true
  WHERE parent_numo_turn_id = v_turn.id AND status IN ('queued', 'running');
  -- Swallow the steering still queued for ANY worker of the turn (same
  -- reasoning as 20270106870000, widened to the whole worker set).
  UPDATE public.agent_run_messages
  SET consumed_at = now()
  WHERE run_id IN (
    SELECT id FROM public.agent_runs WHERE parent_numo_turn_id = v_turn.id
  )
    AND consumed_at IS NULL;
  UPDATE public.agent_run_input_requests
  SET status = 'canceled'
  WHERE parent_numo_turn_id = v_turn.id AND status = 'pending';
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

CREATE OR REPLACE FUNCTION public.request_numo_worker_stop(p_run_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_run public.agent_runs%ROWTYPE;
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM public.agent_runs WHERE id = p_run_id;
  IF v_run.id IS NULL OR v_run.parent_numo_turn_id IS NULL THEN
    RAISE EXCEPTION 'Numo worker not found';
  END IF;
  -- Match conversation-wide stop and worker handoff lock ordering.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || v_run.parent_numo_conversation_id::text, 516)
  );
  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE id = v_run.parent_numo_turn_id FOR UPDATE;
  UPDATE public.agent_runs SET interrupt_requested = true
  WHERE id = p_run_id AND status IN ('queued', 'running');
  UPDATE public.agent_run_messages SET consumed_at = now()
  WHERE run_id = p_run_id AND consumed_at IS NULL;
  UPDATE public.agent_run_input_requests SET status = 'canceled'
  WHERE run_id = p_run_id AND status = 'pending';
  -- Only this worker is interrupted. Its parent cannot launch a continuation
  -- from its result; other workers remain individually controllable.
  UPDATE public.numo_assistant_turns
  SET status = 'stopped', claim_token = NULL, claimed_at = NULL,
      completed_at = now(),
      error_message = NULL, updated_at = now()
  WHERE id = v_turn.id
    AND status IN ('queued', 'running', 'stopping', 'waiting_work', 'waiting_input', 'retryable', 'reconciling');
  IF FOUND THEN
    UPDATE public.conversations SET status = 'idle', error_message = NULL, updated_at = now()
    WHERE id = v_turn.conversation_id;
  END IF;
  RETURN v_turn.id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_numo_worker_stop(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_numo_worker_stop(uuid) TO service_role;

COMMIT;
