-- Preserve the all-worker stop cascade after encrypted worker mediation replaces recovery.
BEGIN;

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
    IF v_turn.status = 'stopping' THEN
      UPDATE public.agent_runs SET interrupt_requested = true
      WHERE parent_numo_turn_id = v_turn.id AND status IN ('queued', 'running');
      UPDATE public.agent_run_messages SET consumed_at = now()
      WHERE run_id IN (
        SELECT id FROM public.agent_runs WHERE parent_numo_turn_id = v_turn.id
      ) AND consumed_at IS NULL;
      UPDATE public.agent_run_input_requests SET status = 'canceled'
      WHERE parent_numo_turn_id = v_turn.id AND status = 'pending';
    END IF;
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
