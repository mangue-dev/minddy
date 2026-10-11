BEGIN;

-- The terminal read in the application is advisory. Lock parent then worker so
-- resumption cannot race a deferred notification into waking the parent.
DROP FUNCTION public.resume_numo_turn_from_worker(uuid, uuid, text, jsonb);
CREATE FUNCTION public.resume_numo_turn_from_worker(
  p_run_id uuid,
  p_event_id uuid,
  p_type text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_expected_run jsonb DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
  v_run public.agent_runs%ROWTYPE;
BEGIN
  IF p_type NOT IN ('worker_completed', 'worker_failed', 'worker_input') THEN
    RAISE EXCEPTION 'invalid_worker_event' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_turn FROM public.numo_assistant_turns
    WHERE active_run_id = p_run_id AND status = 'waiting_work'
    ORDER BY created_at DESC, id DESC LIMIT 1 FOR NO KEY UPDATE;
  IF v_turn.id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.numo_turn_events WHERE id = p_event_id) THEN
      RETURN 'duplicate';
    END IF;
    RETURN 'ignored';
  END IF;
  SELECT * INTO v_run FROM public.agent_runs WHERE id = p_run_id FOR NO KEY UPDATE;
  IF v_run.id IS NULL OR v_run.parent_numo_turn_id IS DISTINCT FROM v_turn.id
    OR v_run.status NOT IN ('completed', 'failed', 'canceled')
    OR (p_type = 'worker_input' AND (v_run.status <> 'completed' OR NOT v_run.awaiting_input))
    OR (p_type = 'worker_completed' AND (v_run.status <> 'completed' OR v_run.awaiting_input))
    OR (p_type = 'worker_failed' AND v_run.status NOT IN ('failed', 'canceled')) THEN
    RETURN 'ignored';
  END IF;
  IF p_expected_run IS NOT NULL AND (
    v_run.status IS DISTINCT FROM p_expected_run ->> 'status'
    OR v_run.started_at IS DISTINCT FROM (p_expected_run ->> 'started_at')::timestamptz
    OR v_run.rest_claimed_at IS DISTINCT FROM (p_expected_run ->> 'rest_claimed_at')::timestamptz
  ) THEN
    RETURN 'ignored';
  END IF;
  PERFORM public.append_numo_turn_event(v_turn.id, p_event_id, p_type, p_payload);
  UPDATE public.numo_assistant_turns SET status = 'queued', claim_token = NULL,
    claimed_at = NULL, not_before = now(),
    checkpoint = jsonb_build_object('phase', 'worker_result', 'worker_event',
      jsonb_build_object('type', p_type, 'payload', COALESCE(p_payload, '{}'::jsonb))),
    updated_at = now() WHERE id = v_turn.id AND status = 'waiting_work';
  RETURN 'queued';
END;
$$;
REVOKE ALL ON FUNCTION public.resume_numo_turn_from_worker(uuid, uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_numo_turn_from_worker(uuid, uuid, text, jsonb, jsonb)
  TO service_role;

COMMIT;
