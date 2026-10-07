-- Event appends and tool completions share parent-first lock ordering.
-- Keep encryption guards, row bindings, claim checks and existing RPC grants.
BEGIN;

-- Sequence allocation never changes the turn key. FOR UPDATE unnecessarily
-- blocks message FK checks, which already hold encryption marker locks.
CREATE OR REPLACE FUNCTION public.append_numo_turn_event(
  p_turn_id uuid,
  p_event_id uuid,
  p_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS public.numo_turn_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
  v_event public.numo_turn_events%ROWTYPE;
BEGIN
  SELECT * INTO v_event FROM public.numo_turn_events WHERE id = p_event_id;
  IF v_event.id IS NOT NULL THEN
    IF v_event.turn_id <> p_turn_id THEN
      RAISE EXCEPTION 'event_id_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN v_event;
  END IF;
  SELECT * INTO v_turn FROM public.numo_assistant_turns WHERE id = p_turn_id FOR NO KEY UPDATE;
  IF v_turn.id IS NULL THEN RAISE EXCEPTION 'turn_not_found' USING ERRCODE = 'P0002'; END IF;
  -- A competing retry can finish while this call waits for the turn lock.
  SELECT * INTO v_event FROM public.numo_turn_events WHERE id = p_event_id;
  IF v_event.id IS NOT NULL THEN
    IF v_event.turn_id <> p_turn_id THEN
      RAISE EXCEPTION 'event_id_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN v_event;
  END IF;
  INSERT INTO public.numo_turn_events (id, turn_id, seq, type, payload)
  VALUES (p_event_id, p_turn_id, v_turn.last_event_seq + 1, p_type, COALESCE(p_payload, '{}'::jsonb))
  RETURNING * INTO v_event;
  UPDATE public.numo_assistant_turns
  SET last_event_seq = v_event.seq, updated_at = now()
  WHERE id = p_turn_id;
  RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_numo_tool_operation(
  p_turn_id uuid,
  p_claim_token uuid,
  p_tool_call_id text,
  p_success boolean,
  p_result jsonb,
  p_model_result jsonb,
  p_pause boolean DEFAULT false
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_updated integer;
BEGIN
  -- Lock the parent before the tool ledger and its encryption fences.
  -- A non-key update lock remains compatible with message foreign-key checks.
  PERFORM 1 FROM public.numo_assistant_turns
    WHERE id = p_turn_id AND claim_token = p_claim_token
      AND status IN ('running', 'stopping')
    FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.numo_tool_operations
  SET status = 'completed', success = p_success, pause = COALESCE(p_pause, false), result = p_result,
      model_result = p_model_result, completed_at = now()
  WHERE turn_id = p_turn_id AND tool_call_id = p_tool_call_id
    AND status = 'started' AND claim_token = p_claim_token
    AND EXISTS (
      SELECT 1 FROM public.numo_assistant_turns
      WHERE id = p_turn_id AND claim_token = p_claim_token
        AND status IN ('running', 'stopping')
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 1 AND p_success THEN
    -- Register a launched worker with the same durable result that proves its
    -- creation. A concurrent stop can then interrupt it even before the parent
    -- reaches its waiting_work checkpoint.
    UPDATE public.numo_assistant_turns t
    SET active_run_id = r.id, updated_at = now()
    FROM public.numo_tool_operations o, public.agent_runs r
    WHERE t.id = p_turn_id
      AND t.claim_token = p_claim_token
      AND t.status IN ('running', 'stopping')
      AND o.turn_id = p_turn_id
      AND o.tool_call_id = p_tool_call_id
      AND o.tool_name = 'launch_code_agent'
      AND r.id::text = p_result ->> 'run_id';
  END IF;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_numo_tool_operation_protected(
  p_turn_id uuid,p_claim_token uuid,p_tool_call_id text,p_success boolean,
  p_result jsonb,p_result_version integer,p_model_result jsonb,
  p_model_result_version integer,p_result_run_id uuid,p_pause boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE updated integer;
BEGIN
  -- Lock the parent before the tool ledger and its encryption fences.
  -- A non-key update lock remains compatible with message foreign-key checks.
  PERFORM 1 FROM public.numo_assistant_turns
    WHERE id = p_turn_id AND claim_token = p_claim_token
      AND status IN ('running', 'stopping')
    FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.numo_tool_operations SET status='completed',success=p_success,
    pause=COALESCE(p_pause,false),result=p_result,result_version=p_result_version,
    model_result=p_model_result,model_result_version=p_model_result_version,
    result_run_id=p_result_run_id,completed_at=now()
    WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id
      AND status='started' AND claim_token=p_claim_token
      AND EXISTS(SELECT 1 FROM public.numo_assistant_turns WHERE id=p_turn_id
        AND claim_token=p_claim_token AND status IN ('running','stopping'));
  GET DIAGNOSTICS updated=ROW_COUNT;
  IF updated=1 AND p_success THEN
    UPDATE public.numo_assistant_turns t SET active_run_id=r.id,
      updated_at=now()
      FROM public.numo_tool_operations o,public.agent_runs r
      WHERE t.id=p_turn_id AND t.claim_token=p_claim_token
        AND t.status IN ('running','stopping') AND o.turn_id=p_turn_id
        AND o.tool_call_id=p_tool_call_id
        AND o.tool_name='launch_code_agent' AND r.id=o.result_run_id;
  END IF;
  RETURN updated=1;
END;
$$;

COMMIT;
