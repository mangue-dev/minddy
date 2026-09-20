-- Repairs `request_numo_turn_stop` (20270106870000): the condition
-- `consumed_at IS NULL::timestamptz` parses as `(consumed_at IS NULL)::timestamptz`,
-- which Postgres rejects with 42846 "cannot cast type boolean to timestamp with
-- time zone" on every execution. plpgsql defers type resolution to the first run,
-- so the original migration applied cleanly but every Numo stop request failed
-- with a 500 from the moment it deployed. The cast is redundant — the column is
-- already timestamptz — so the condition becomes a plain `IS NULL`.
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
    AND status IN ('queued', 'running', 'waiting_work', 'waiting_input', 'retryable', 'reconciling')
  ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  IF v_turn.id IS NULL THEN RETURN; END IF;
  UPDATE public.agent_runs SET interrupt_requested = true
  WHERE id = v_turn.active_run_id AND status IN ('queued', 'running');
  UPDATE public.agent_run_messages
  SET consumed_at = now()
  WHERE run_id = v_turn.active_run_id
    AND consumed_at IS NULL;
  UPDATE public.agent_run_input_requests
  SET status = 'canceled'
  WHERE parent_numo_turn_id = v_turn.id AND status = 'pending';
  UPDATE public.numo_assistant_turns
  SET status = CASE WHEN v_turn.status = 'running' THEN 'stopping' ELSE 'stopped' END,
      claim_token = CASE WHEN v_turn.status = 'running' THEN claim_token END,
      claimed_at = CASE WHEN v_turn.status = 'running' THEN claimed_at END,
      completed_at = CASE WHEN v_turn.status = 'running' THEN NULL ELSE now() END,
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
