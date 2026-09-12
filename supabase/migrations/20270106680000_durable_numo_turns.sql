-- Durable Numo orchestration. HTTP and SSE are projections of this state;
-- neither owns a turn or decides whether a tool mutation may be replayed.
BEGIN;

CREATE TABLE public.numo_assistant_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  run_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  intent jsonb NOT NULL DEFAULT '{}'::jsonb,
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  reasoning_level text,
  active_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  claim_token uuid,
  claimed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  not_before timestamptz NOT NULL DEFAULT now(),
  last_event_seq bigint NOT NULL DEFAULT -1,
  cost_usd numeric NOT NULL DEFAULT 0,
  outcome text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT numo_assistant_turns_request_unique UNIQUE (conversation_id, request_id),
  CONSTRAINT numo_assistant_turns_status_check CHECK (status IN (
    'queued', 'running', 'waiting_work', 'waiting_input', 'stopping',
    'stopped', 'retryable', 'reconciling', 'completed', 'failed'
  )),
  CONSTRAINT numo_assistant_turns_attempts_check CHECK (attempts >= 0),
  CONSTRAINT numo_assistant_turns_cost_check CHECK (cost_usd >= 0),
  CONSTRAINT numo_assistant_turns_claim_check CHECK (
    (status IN ('running', 'stopping') AND claim_token IS NOT NULL AND claimed_at IS NOT NULL)
    OR (status NOT IN ('running', 'stopping') AND claim_token IS NULL AND claimed_at IS NULL)
  ),
  CONSTRAINT numo_assistant_turns_work_check CHECK (
    status <> 'waiting_work' OR active_run_id IS NOT NULL
  )
);
CREATE INDEX numo_assistant_turns_queue_idx
  ON public.numo_assistant_turns (not_before, created_at, id)
  WHERE status IN ('queued', 'retryable');
CREATE INDEX numo_assistant_turns_stale_claim_idx
  ON public.numo_assistant_turns (claimed_at)
  WHERE status IN ('running', 'stopping');
CREATE INDEX numo_assistant_turns_worker_idx
  ON public.numo_assistant_turns (active_run_id)
  WHERE status = 'waiting_work';

ALTER TABLE public.numo_assistant_turns ENABLE ROW LEVEL SECURITY;
CREATE POLICY numo_assistant_turns_select ON public.numo_assistant_turns
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );
REVOKE ALL ON public.numo_assistant_turns FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.numo_assistant_turns TO authenticated;
GRANT ALL ON public.numo_assistant_turns TO service_role;

ALTER TABLE public.assistant_messages
  ADD COLUMN turn_id uuid REFERENCES public.numo_assistant_turns(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX assistant_messages_turn_user_unique
  ON public.assistant_messages (turn_id) WHERE role = 'user' AND turn_id IS NOT NULL;
CREATE UNIQUE INDEX assistant_messages_turn_tool_unique
  ON public.assistant_messages (turn_id, tool_call_id)
  WHERE role = 'tool' AND turn_id IS NOT NULL AND tool_call_id IS NOT NULL;
CREATE UNIQUE INDEX assistant_messages_turn_final_unique
  ON public.assistant_messages (turn_id)
  WHERE role = 'assistant' AND turn_id IS NOT NULL AND tool_calls IS NULL;
CREATE INDEX assistant_messages_turn_idx
  ON public.assistant_messages (turn_id, created_at, id) WHERE turn_id IS NOT NULL;

CREATE TABLE public.numo_turn_events (
  id uuid PRIMARY KEY,
  turn_id uuid NOT NULL REFERENCES public.numo_assistant_turns(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT numo_turn_events_seq_unique UNIQUE (turn_id, seq),
  CONSTRAINT numo_turn_events_type_check CHECK (type IN (
    'conversation_id', 'content_delta', 'reasoning_start', 'reasoning_end',
    'tool_call_start', 'tool_call_args_delta', 'tool_call_complete',
    'message_complete', 'worker_completed', 'worker_failed', 'worker_input',
    'state', 'done', 'error'
  ))
);
CREATE INDEX numo_turn_events_replay_idx ON public.numo_turn_events (turn_id, seq);
ALTER TABLE public.numo_turn_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY numo_turn_events_select ON public.numo_turn_events
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.numo_assistant_turns t
    WHERE t.id = turn_id AND t.user_id = auth.uid()
  ));
REVOKE ALL ON public.numo_turn_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.numo_turn_events TO authenticated;
GRANT ALL ON public.numo_turn_events TO service_role;

CREATE TABLE public.numo_tool_operations (
  turn_id uuid NOT NULL REFERENCES public.numo_assistant_turns(id) ON DELETE CASCADE,
  tool_call_id text NOT NULL,
  tool_name text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  replay_policy text NOT NULL,
  status text NOT NULL DEFAULT 'started',
  claim_token uuid NOT NULL,
  success boolean,
  pause boolean NOT NULL DEFAULT false,
  result jsonb,
  model_result jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (turn_id, tool_call_id),
  CONSTRAINT numo_tool_operations_policy_check CHECK (replay_policy IN ('retry', 'reconcile')),
  CONSTRAINT numo_tool_operations_status_check CHECK (status IN ('started', 'completed', 'ambiguous')),
  CONSTRAINT numo_tool_operations_completed_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL AND success IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  )
);
ALTER TABLE public.numo_tool_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.numo_tool_operations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.numo_tool_operations TO service_role;

-- Append under the turn row lock so sequence allocation and event identity are
-- both atomic. A repeated event ID returns the original row without advancing.
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
  SELECT * INTO v_turn FROM public.numo_assistant_turns WHERE id = p_turn_id FOR UPDATE;
  IF v_turn.id IS NULL THEN RAISE EXCEPTION 'turn_not_found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.numo_turn_events (id, turn_id, seq, type, payload)
  VALUES (p_event_id, p_turn_id, v_turn.last_event_seq + 1, p_type, COALESCE(p_payload, '{}'::jsonb))
  RETURNING * INTO v_event;
  UPDATE public.numo_assistant_turns
  SET last_event_seq = v_event.seq, updated_at = now()
  WHERE id = p_turn_id;
  RETURN v_event;
END;
$$;
REVOKE ALL ON FUNCTION public.append_numo_turn_event(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_numo_turn_event(uuid, uuid, text, jsonb)
  TO service_role;

-- The request id makes browser retries idempotent. The user message and queued
-- turn commit together, so recovery never sees one without the other.
CREATE OR REPLACE FUNCTION public.begin_numo_turn(
  p_conversation_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_run_id uuid,
  p_intent jsonb,
  p_model text,
  p_reasoning_level text,
  p_content text,
  p_context jsonb,
  p_metadata jsonb
) RETURNS public.numo_assistant_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || p_conversation_id::text, 516)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND user_id = p_user_id
  ) THEN RAISE EXCEPTION 'conversation_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE conversation_id = p_conversation_id AND request_id = p_request_id;
  IF v_turn.id IS NOT NULL THEN RETURN v_turn; END IF;
  IF EXISTS (
    SELECT 1 FROM public.numo_assistant_turns
    WHERE conversation_id = p_conversation_id
      AND status IN (
        'queued', 'running', 'waiting_work', 'stopping', 'retryable', 'reconciling'
      )
  ) THEN RAISE EXCEPTION 'conversation_busy' USING ERRCODE = '55000'; END IF;

  INSERT INTO public.numo_assistant_turns (
    conversation_id, user_id, request_id, run_id, intent, model, reasoning_level
  ) VALUES (
    p_conversation_id, p_user_id, p_request_id, p_run_id,
    COALESCE(p_intent, '{}'::jsonb), p_model, p_reasoning_level
  ) RETURNING * INTO v_turn;
  INSERT INTO public.assistant_messages (
    conversation_id, turn_id, role, content, context, metadata
  ) VALUES (
    p_conversation_id, v_turn.id, 'user', p_content, p_context,
    COALESCE(p_metadata, '{}'::jsonb)
  );
  UPDATE public.conversations
  SET status = 'generating', error_message = NULL, updated_at = now()
  WHERE id = p_conversation_id;
  RETURN v_turn;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_numo_turn(uuid, uuid, uuid, uuid, jsonb, text, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_numo_turn(uuid, uuid, uuid, uuid, jsonb, text, text, text, jsonb, jsonb)
  TO service_role;

-- Claims are compare-and-swap leases. A six-minute stale lease is beyond the
-- request execution ceiling and is the only running turn a recovery may steal.
CREATE OR REPLACE FUNCTION public.claim_numo_turn(
  p_turn_id uuid,
  p_claim_token uuid,
  p_allow_retryable boolean DEFAULT false
) RETURNS SETOF public.numo_assistant_turns
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.numo_assistant_turns
  SET status = 'running', claim_token = p_claim_token, claimed_at = now(),
      attempts = attempts + 1, started_at = COALESCE(started_at, now()),
      error_message = NULL, updated_at = now()
  WHERE id = p_turn_id
    AND not_before <= now()
    AND (
      status = 'queued'
      OR (p_allow_retryable AND status = 'retryable')
      OR (status = 'running' AND claimed_at < now() - interval '6 minutes')
    )
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_numo_turn(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_numo_turn(uuid, uuid, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.checkpoint_numo_turn(
  p_turn_id uuid,
  p_claim_token uuid,
  p_status text,
  p_checkpoint jsonb DEFAULT '{}'::jsonb,
  p_active_run_id uuid DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_outcome text DEFAULT NULL,
  p_cost_usd numeric DEFAULT NULL
) RETURNS SETOF public.numo_assistant_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  IF p_status NOT IN (
    'running', 'waiting_work', 'waiting_input', 'stopped', 'retryable',
    'reconciling', 'completed', 'failed'
  ) THEN RAISE EXCEPTION 'invalid_turn_status' USING ERRCODE = '22023'; END IF;
  UPDATE public.numo_assistant_turns
  SET status = p_status,
      checkpoint = COALESCE(p_checkpoint, '{}'::jsonb),
      active_run_id = p_active_run_id,
      error_message = p_error_message,
      outcome = COALESCE(p_outcome, outcome),
      cost_usd = COALESCE(p_cost_usd, cost_usd),
      claim_token = CASE WHEN p_status = 'running' THEN claim_token END,
      claimed_at = CASE WHEN p_status = 'running' THEN now() END,
      completed_at = CASE WHEN p_status IN ('completed', 'failed', 'stopped') THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_turn_id
    AND claim_token = p_claim_token
    AND (status = 'running' OR (status = 'stopping' AND p_status = 'stopped'))
  RETURNING * INTO v_turn;
  IF v_turn.id IS NULL THEN RETURN; END IF;
  UPDATE public.conversations
  SET status = CASE
        WHEN p_status IN ('failed', 'retryable', 'reconciling') THEN 'error'
        WHEN p_status IN ('completed', 'waiting_input', 'stopped') THEN 'idle'
        ELSE 'generating'
      END,
      error_message = CASE
        WHEN p_status IN ('failed', 'retryable', 'reconciling') THEN p_error_message
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = v_turn.conversation_id;
  RETURN NEXT v_turn;
END;
$$;
REVOKE ALL ON FUNCTION public.checkpoint_numo_turn(uuid, uuid, text, jsonb, uuid, text, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_numo_turn(uuid, uuid, text, jsonb, uuid, text, text, numeric)
  TO service_role;

CREATE OR REPLACE FUNCTION public.request_numo_turn_stop(
  p_conversation_id uuid,
  p_user_id uuid
) RETURNS SETOF public.numo_assistant_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id
    AND status IN ('queued', 'running', 'waiting_work', 'waiting_input', 'retryable', 'reconciling')
  ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  IF v_turn.id IS NULL THEN RETURN; END IF;
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

CREATE OR REPLACE FUNCTION public.retry_numo_turn(
  p_conversation_id uuid,
  p_user_id uuid
) RETURNS SETOF public.numo_assistant_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  UPDATE public.numo_assistant_turns
  SET status = 'retryable', claim_token = NULL, claimed_at = NULL,
      not_before = now(), completed_at = NULL, error_message = NULL, updated_at = now()
  WHERE id = (
    SELECT id FROM public.numo_assistant_turns
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
      AND status IN ('failed', 'stopped', 'retryable')
    ORDER BY created_at DESC, id DESC LIMIT 1
  )
  RETURNING * INTO v_turn;
  IF v_turn.id IS NULL THEN RETURN; END IF;
  UPDATE public.conversations
  SET status = 'generating', error_message = NULL, updated_at = now()
  WHERE id = v_turn.conversation_id;
  RETURN NEXT v_turn;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_numo_turn(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_numo_turn(uuid, uuid)
  TO service_role;

-- Only the event for the run currently awaited by the parent may wake it. The
-- event insert is idempotent, while the guarded status transition is at-most-once.
CREATE OR REPLACE FUNCTION public.resume_numo_turn_from_worker(
  p_run_id uuid,
  p_event_id uuid,
  p_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  IF p_type NOT IN ('worker_completed', 'worker_failed', 'worker_input') THEN
    RAISE EXCEPTION 'invalid_worker_event' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE active_run_id = p_run_id AND status = 'waiting_work'
  ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  IF v_turn.id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.numo_turn_events WHERE id = p_event_id) THEN RETURN 'duplicate'; END IF;
    RETURN 'ignored';
  END IF;
  PERFORM public.append_numo_turn_event(v_turn.id, p_event_id, p_type, p_payload);
  UPDATE public.numo_assistant_turns
  SET status = 'queued', claim_token = NULL, claimed_at = NULL, not_before = now(),
      checkpoint = jsonb_set(
        jsonb_set(COALESCE(checkpoint, '{}'::jsonb), '{phase}', '"worker_result"'::jsonb, true),
        '{worker_event}', jsonb_build_object('type', p_type, 'payload', COALESCE(p_payload, '{}'::jsonb)), true
      ),
      updated_at = now()
  WHERE id = v_turn.id AND status = 'waiting_work';
  RETURN 'queued';
END;
$$;
REVOKE ALL ON FUNCTION public.resume_numo_turn_from_worker(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_numo_turn_from_worker(uuid, uuid, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_numo_tool_operation(
  p_turn_id uuid,
  p_claim_token uuid,
  p_tool_call_id text,
  p_tool_name text,
  p_arguments jsonb,
  p_replay_policy text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_operation public.numo_tool_operations%ROWTYPE;
  v_inserted integer;
  v_conversation_id uuid;
BEGIN
  IF p_replay_policy NOT IN ('retry', 'reconcile') THEN
    RAISE EXCEPTION 'invalid_replay_policy' USING ERRCODE = '22023';
  END IF;
  SELECT conversation_id INTO v_conversation_id FROM public.numo_assistant_turns
  WHERE id = p_turn_id AND claim_token = p_claim_token AND status = 'running'
  FOR UPDATE;
  IF v_conversation_id IS NULL THEN RETURN jsonb_build_object('action', 'lost_claim'); END IF;
  INSERT INTO public.numo_tool_operations (
    turn_id, tool_call_id, tool_name, arguments, replay_policy, claim_token
  ) VALUES (
    p_turn_id, p_tool_call_id, p_tool_name, COALESCE(p_arguments, '{}'::jsonb),
    p_replay_policy, p_claim_token
  ) ON CONFLICT (turn_id, tool_call_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 1 THEN RETURN jsonb_build_object('action', 'execute'); END IF;
  SELECT * INTO v_operation FROM public.numo_tool_operations
  WHERE turn_id = p_turn_id AND tool_call_id = p_tool_call_id FOR UPDATE;
  IF v_operation.tool_name <> p_tool_name OR v_operation.arguments <> COALESCE(p_arguments, '{}'::jsonb) THEN
    RAISE EXCEPTION 'tool_call_conflict' USING ERRCODE = '23505';
  END IF;
  IF v_operation.status = 'completed' THEN
    RETURN jsonb_build_object(
      'action', 'reuse', 'success', v_operation.success,
      'result', v_operation.result, 'model_result', v_operation.model_result,
      'pause', v_operation.pause
    );
  END IF;
  IF v_operation.replay_policy = 'retry' THEN
    UPDATE public.numo_tool_operations
    SET status = 'started', claim_token = p_claim_token, started_at = now()
    WHERE turn_id = p_turn_id AND tool_call_id = p_tool_call_id;
    RETURN jsonb_build_object('action', 'execute');
  END IF;
  UPDATE public.numo_tool_operations SET status = 'ambiguous'
  WHERE turn_id = p_turn_id AND tool_call_id = p_tool_call_id;
  UPDATE public.numo_assistant_turns
  SET status = 'reconciling', claim_token = NULL, claimed_at = NULL,
      error_message = 'A tool may have completed before its result was recorded. Review the external state before retrying.',
      updated_at = now()
  WHERE id = p_turn_id AND claim_token = p_claim_token;
  UPDATE public.conversations
  SET status = 'error',
      error_message = 'A tool may have completed before its result was recorded. Review the external state before retrying.',
      updated_at = now()
  WHERE id = v_conversation_id;
  RETURN jsonb_build_object('action', 'reconcile');
END;
$$;
REVOKE ALL ON FUNCTION public.claim_numo_tool_operation(uuid, uuid, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_numo_tool_operation(uuid, uuid, text, text, jsonb, text)
  TO service_role;

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
  UPDATE public.numo_tool_operations
  SET status = 'completed', success = p_success, pause = COALESCE(p_pause, false), result = p_result,
      model_result = p_model_result, completed_at = now()
  WHERE turn_id = p_turn_id AND tool_call_id = p_tool_call_id
    AND status = 'started' AND claim_token = p_claim_token
    AND EXISTS (
      SELECT 1 FROM public.numo_assistant_turns
      WHERE id = p_turn_id AND claim_token = p_claim_token AND status = 'running'
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_numo_tool_operation(uuid, uuid, text, boolean, jsonb, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_numo_tool_operation(uuid, uuid, text, boolean, jsonb, jsonb, boolean)
  TO service_role;

-- A request process cannot outlive the execution ceiling. Recovery turns a
-- stale running lease into an explicit retry and finishes a stale stop request.
CREATE OR REPLACE FUNCTION public.recover_stale_numo_turns()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count integer := 0;
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
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

-- Replace the compatibility view with assistant orchestration turns plus the
-- existing code-worker turns. The stable public columns remain unchanged.
CREATE OR REPLACE VIEW public.numo_messages WITH (security_invoker = true) AS
SELECT m.id, i.id AS conversation_id, 'assistant'::text AS source,
  CASE WHEN m.role = 'tool' THEN 'action' ELSE 'message' END AS kind,
  m.role, m.content, m.tool_calls, m.tool_call_id, m.tool_name,
  m.metadata, m.context, m.turn_id, NULL::uuid AS run_id,
  NULL::text AS worker_source, NULL::uuid AS legacy_queue_message_id,
  NULL::uuid AS legacy_event_id, m.created_at
FROM public.assistant_messages m
JOIN public.numo_conversation_ids i ON i.assistant_id = m.conversation_id
UNION ALL
SELECT m.id, COALESCE(o.conversation_id, i.id), 'agent', 'worker_message',
  m.role, m.content, NULL::jsonb, NULL::text, NULL::text,
  '{}'::jsonb, NULL::jsonb, m.turn_id, m.run_id, m.source,
  m.legacy_queue_message_id, m.legacy_event_id, m.created_at
FROM public.agent_messages m
JOIN public.agent_conversations source_conversation ON source_conversation.id = m.conversation_id
JOIN public.projects source_project ON source_project.id = source_conversation.project_id AND source_project.deleted_at IS NULL
JOIN public.numo_conversation_ids i ON i.agent_id = m.conversation_id
LEFT JOIN public.numo_work_origins o ON o.agent_id = m.conversation_id;
CREATE OR REPLACE VIEW public.numo_actions WITH (security_invoker = true) AS
SELECT * FROM public.numo_messages WHERE kind = 'action';
REVOKE ALL ON public.numo_messages, public.numo_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.numo_messages, public.numo_actions TO authenticated, service_role;

CREATE OR REPLACE VIEW public.numo_turns WITH (security_invoker = true) AS
SELECT t.id, t.conversation_id, t.run_id, t.status, t.model,
  t.reasoning_level, t.user_id AS initiated_by, t.cost_usd, t.outcome,
  t.error_message, t.started_at, t.completed_at, t.created_at, t.updated_at
FROM public.numo_assistant_turns t
UNION ALL
SELECT t.id, COALESCE(o.conversation_id, i.id) AS conversation_id,
  t.run_id, t.status, t.model, t.reasoning_level, t.initiated_by, t.cost_usd,
  t.outcome, t.error_message, t.started_at, t.completed_at, t.created_at, t.updated_at
FROM public.agent_turns t
JOIN public.agent_conversations source_conversation ON source_conversation.id = t.conversation_id
JOIN public.projects source_project ON source_project.id = source_conversation.project_id AND source_project.deleted_at IS NULL
JOIN public.numo_conversation_ids i ON i.agent_id = t.conversation_id
LEFT JOIN public.numo_work_origins o ON o.agent_id = t.conversation_id;
REVOKE ALL ON public.numo_turns FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.numo_turns TO authenticated, service_role;

COMMIT;
