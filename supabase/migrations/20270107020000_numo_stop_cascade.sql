-- MIN-599 — stopping Numo must cascade to EVERY code agent it launched, and a
-- code agent must be stoppable individually. Two SQL gaps:
--
-- 1. `request_numo_turn_stop` interrupted only `active_run_id`. A turn that
--    launched several workers (a tool round with multiple `launch_code_agent`
--    calls, or a relaunch racing a previous wait) kept every non-awaited
--    worker running after the conversation was stopped. The interrupt now
--    targets every live worker of the turn, and the queued-steering swallow
--    (20270106870000) covers their unconsumed messages too.
-- 2. The stale-stop branch of `recover_stale_numo_turns` had the same
--    single-worker blind spot; it interrupts the whole worker set as well.
--
-- In-run sub-agents are not a database concern: the supervisor's stop already
-- aborts the opencode turn and force-stops the server when child sessions keep
-- writing, so stopping a worker stops its own sub-agents.
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

-- Same cascade in the stale-stop recovery: a turn stuck in `stopping` whose
-- claim expired interrupts every live worker before it is put to rest, so a
-- lost stop signal cannot leave an orphaned worker coding for hours.
CREATE OR REPLACE FUNCTION public.recover_stale_numo_turns()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count integer := 0;
  v_turn public.numo_assistant_turns%ROWTYPE;
  v_worker record;
  v_disposition text;
BEGIN
  FOR v_worker IN
    SELECT r.id AS run_id, r.status, r.awaiting_input, r.outcome,
      r.error_message, r.branch_name, r.pr_number, r.pr_url,
      COALESCE(
        r.delegation_result,
        jsonb_build_object(
          'version', 1,
          'status', CASE
            WHEN r.status = 'completed' AND r.awaiting_input THEN 'needs_input'
            WHEN r.status = 'completed'
              AND nullif(btrim(r.error_message), '') IS NOT NULL THEN 'partial'
            WHEN r.status = 'completed' THEN 'completed'
            ELSE 'failed'
          END,
          'summary', COALESCE(
            nullif(btrim(r.outcome), ''),
            nullif(btrim(r.error_message), ''),
            'The code worker ended without a summary.'
          ),
          'changedFiles', '[]'::jsonb,
          'verificationPerformed', '[]'::jsonb,
          'artifacts',
            CASE WHEN nullif(btrim(r.branch_name), '') IS NOT NULL
              THEN jsonb_build_array(jsonb_build_object(
                'kind', 'branch', 'ref', btrim(r.branch_name)
              )) ELSE '[]'::jsonb END
            || CASE WHEN r.pr_number IS NOT NULL OR nullif(btrim(r.pr_url), '') IS NOT NULL
              THEN jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                'kind', 'pull_request',
                'ref', COALESCE('#' || r.pr_number::text, btrim(r.pr_url)),
                'url', nullif(btrim(r.pr_url), '')
              ))) ELSE '[]'::jsonb END,
          'unresolvedDecisions', CASE
            WHEN r.awaiting_input AND nullif(btrim(r.outcome), '') IS NOT NULL
              THEN jsonb_build_array(btrim(r.outcome))
            WHEN r.status IN ('failed', 'canceled')
              AND nullif(btrim(r.error_message), '') IS NOT NULL
              THEN jsonb_build_array(btrim(r.error_message))
            ELSE '[]'::jsonb
          END
        )
      ) AS delegation_result
    FROM public.numo_assistant_turns t
    JOIN public.agent_runs r ON r.id = t.active_run_id
    WHERE t.status = 'waiting_work'
      AND r.status IN ('completed', 'failed', 'canceled')
    ORDER BY t.updated_at ASC, t.id ASC
    FOR UPDATE OF t, r SKIP LOCKED
  LOOP
    UPDATE public.agent_runs
    SET delegation_result = v_worker.delegation_result
    WHERE id = v_worker.run_id AND delegation_result IS NULL;

    SELECT public.resume_numo_turn_from_worker(
      v_worker.run_id,
      gen_random_uuid(),
      CASE
        WHEN v_worker.status = 'completed' AND v_worker.awaiting_input
          THEN 'worker_input'
        WHEN v_worker.status = 'completed' THEN 'worker_completed'
        ELSE 'worker_failed'
      END,
      jsonb_build_object(
        'run_id', v_worker.run_id,
        'status', v_worker.status,
        'awaiting_input', v_worker.awaiting_input,
        'outcome', v_worker.outcome,
        'error_message', v_worker.error_message,
        'pr_number', v_worker.pr_number,
        'pr_url', v_worker.pr_url,
        'result', v_worker.delegation_result
      )
    ) INTO v_disposition;
    IF v_disposition = 'queued' THEN v_count := v_count + 1; END IF;
  END LOOP;

  FOR v_turn IN
    SELECT * FROM public.numo_assistant_turns
    WHERE status IN ('running', 'stopping')
      AND claimed_at < now() - interval '6 minutes'
    ORDER BY claimed_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_turn.status = 'stopping' THEN
      UPDATE public.agent_runs
      SET interrupt_requested = true
      WHERE parent_numo_turn_id = v_turn.id AND status IN ('queued', 'running');
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
        error_message = CASE WHEN v_turn.status = 'running'
            AND (v_turn.checkpoint ->> 'phase') IS DISTINCT FROM 'worker_result'
          THEN 'The Numo process stopped before the turn reached its next durable boundary. Retry after reconnecting.'
        END,
        updated_at = now()
    WHERE id = v_turn.id;
    UPDATE public.conversations
    SET status = CASE
          WHEN v_turn.status = 'stopping' THEN 'idle'
          WHEN v_turn.checkpoint ->> 'phase' = 'worker_result' THEN 'generating'
          ELSE 'error'
        END,
        error_message = CASE WHEN v_turn.status = 'running'
            AND (v_turn.checkpoint ->> 'phase') IS DISTINCT FROM 'worker_result'
          THEN 'The Numo process stopped before the turn reached its next durable boundary. Retry after reconnecting.'
        END,
        updated_at = now()
    WHERE id = v_turn.conversation_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stale_numo_turns()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_numo_turns()
  TO service_role;
