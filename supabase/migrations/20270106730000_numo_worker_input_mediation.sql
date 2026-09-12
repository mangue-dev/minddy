-- Durable, parent-owned mediation for questions raised by code workers.
BEGIN;

-- A mediated turn can contain the initiating user message plus later steering
-- and decision answers. Tool and final-response idempotency remain unchanged.
DROP INDEX public.assistant_messages_turn_user_unique;

ALTER TABLE public.agent_run_events
  DROP CONSTRAINT agent_run_events_type_check,
  ADD CONSTRAINT agent_run_events_type_check CHECK (type = ANY (ARRAY[
    'status'::text, 'thinking'::text, 'tool_call'::text, 'tool_result'::text,
    'commit'::text, 'pr_opened'::text, 'error'::text, 'summary'::text,
    'user_message'::text, 'plan_update'::text, 'files_changed'::text,
    'question'::text, 'needs_input'::text, 'quota_exhausted'::text
  ]));

CREATE TABLE public.agent_run_input_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  parent_numo_turn_id uuid REFERENCES public.numo_assistant_turns(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  call_id text NOT NULL,
  questions jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  answer text,
  answer_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  CONSTRAINT agent_run_input_requests_identity_unique UNIQUE (run_id, question_id),
  CONSTRAINT agent_run_input_requests_questions_check CHECK (
    jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) > 0
  ),
  CONSTRAINT agent_run_input_requests_status_check CHECK (
    status IN ('pending', 'answered', 'canceled')
  ),
  CONSTRAINT agent_run_input_requests_answer_check CHECK (
    (status = 'answered' AND answer IS NOT NULL AND answer_message_id IS NOT NULL
      AND answered_at IS NOT NULL)
    OR (status <> 'answered' AND answer IS NULL AND answer_message_id IS NULL
      AND answered_at IS NULL)
  )
);

CREATE INDEX agent_run_input_requests_parent_pending_idx
  ON public.agent_run_input_requests (parent_numo_turn_id, created_at, id)
  WHERE status = 'pending';

ALTER TABLE public.agent_run_input_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_run_input_requests_select ON public.agent_run_input_requests
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.agent_runs r
    WHERE r.id = agent_run_input_requests.run_id AND r.created_by = auth.uid()
  ));
REVOKE ALL ON public.agent_run_input_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_run_input_requests TO authenticated;
GRANT ALL ON public.agent_run_input_requests TO service_role;

-- The event and the pending decision commit together. Delegated workers publish
-- needs_input instead of a user-facing question; routine questions retain their
-- existing event so their owner can answer from the routine execution detail.
CREATE OR REPLACE FUNCTION public.capture_agent_run_input_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_parent_turn_id uuid;
BEGIN
  IF new.type NOT IN ('needs_input', 'question')
     OR nullif(new.payload ->> 'question_id', '') IS NULL
     OR jsonb_typeof(new.payload -> 'questions') IS DISTINCT FROM 'array'
     OR jsonb_array_length(new.payload -> 'questions') = 0 THEN
    RETURN new;
  END IF;

  SELECT parent_numo_turn_id INTO v_parent_turn_id
  FROM public.agent_runs
  WHERE id = new.run_id;

  INSERT INTO public.agent_run_input_requests (
    run_id, parent_numo_turn_id, question_id, call_id, questions
  ) VALUES (
    new.run_id,
    v_parent_turn_id,
    new.payload ->> 'question_id',
    COALESCE(nullif(new.payload ->> 'call_id', ''), new.payload ->> 'question_id'),
    new.payload -> 'questions'
  )
  ON CONFLICT (run_id, question_id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE TRIGGER agent_run_events_capture_input
AFTER INSERT ON public.agent_run_events
FOR EACH ROW EXECUTE FUNCTION public.capture_agent_run_input_request();

-- Workers already suspended when this migration runs emitted a legacy
-- `question` event whose call id was its only stable identity. Preserve those
-- decisions so the parent can render and resume the exact worker after deploy.
INSERT INTO public.agent_run_input_requests (
  run_id, parent_numo_turn_id, question_id, call_id, questions
)
SELECT
  r.id,
  r.parent_numo_turn_id,
  COALESCE(NULLIF(e.payload ->> 'question_id', ''), NULLIF(e.payload ->> 'id', '')),
  COALESCE(
    NULLIF(e.payload ->> 'call_id', ''),
    NULLIF(e.payload ->> 'id', ''),
    NULLIF(e.payload ->> 'question_id', '')
  ),
  e.payload -> 'questions'
FROM public.agent_runs AS r
JOIN LATERAL (
  SELECT event.payload
  FROM public.agent_run_events AS event
  WHERE event.run_id = r.id
    AND event.type IN ('needs_input', 'question')
    AND COALESCE(
      NULLIF(event.payload ->> 'question_id', ''),
      NULLIF(event.payload ->> 'id', '')
    ) IS NOT NULL
    AND jsonb_typeof(event.payload -> 'questions') = 'array'
    AND jsonb_array_length(event.payload -> 'questions') > 0
  ORDER BY event.seq DESC
  LIMIT 1
) AS e ON TRUE
WHERE r.parent_numo_turn_id IS NOT NULL
  AND r.status = 'completed'
  AND r.awaiting_input
ON CONFLICT (run_id, question_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cancel_agent_run_input_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF new.status IN ('failed', 'canceled')
     OR (new.status = 'completed' AND NOT new.awaiting_input) THEN
    UPDATE public.agent_run_input_requests
    SET status = 'canceled'
    WHERE run_id = new.id AND status = 'pending';
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER agent_runs_cancel_pending_input
AFTER UPDATE OF status, awaiting_input ON public.agent_runs
FOR EACH ROW EXECUTE FUNCTION public.cancel_agent_run_input_request();

-- Resume exactly the worker/question pair selected by Numo. The question lock,
-- answer journal, warm worker resume, and parent state transition are one commit,
-- so duplicate delivery cannot wake a second task and a canceled task cannot be
-- revived by a late answer.
CREATE OR REPLACE FUNCTION public.resume_numo_worker_input(
  p_conversation_id uuid,
  p_parent_turn_id uuid,
  p_run_id uuid,
  p_question_id text,
  p_user_id uuid,
  p_message_id uuid,
  p_answer text,
  p_persist_parent_message boolean,
  p_not_before timestamptz,
  p_usage_since timestamptz DEFAULT NULL,
  p_budget_cap numeric DEFAULT NULL,
  p_requested_budget numeric DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
  v_run public.agent_runs%ROWTYPE;
  v_input public.agent_run_input_requests%ROWTYPE;
  v_result text;
BEGIN
  IF p_conversation_id IS NULL OR p_parent_turn_id IS NULL OR p_run_id IS NULL
     OR nullif(btrim(p_question_id), '') IS NULL OR p_user_id IS NULL
     OR p_message_id IS NULL OR nullif(btrim(p_answer), '') IS NULL
     OR p_not_before IS NULL THEN
    RAISE EXCEPTION 'numo_worker_input_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || p_conversation_id::text, 516)
  );

  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE id = p_parent_turn_id AND conversation_id = p_conversation_id
    AND user_id = p_user_id
  FOR UPDATE;
  IF v_turn.id IS NULL OR v_turn.active_run_id IS DISTINCT FROM p_run_id
     OR v_turn.status NOT IN ('running', 'waiting_input') THEN
    RETURN 'ignored';
  END IF;

  SELECT * INTO v_input FROM public.agent_run_input_requests
  WHERE run_id = p_run_id AND parent_numo_turn_id = p_parent_turn_id
    AND question_id = p_question_id
  FOR UPDATE;
  IF v_input.id IS NULL THEN RETURN 'ignored'; END IF;
  IF v_input.status = 'answered' THEN RETURN 'already'; END IF;
  IF v_input.status <> 'pending' THEN RETURN 'ignored'; END IF;

  SELECT * INTO v_run FROM public.agent_runs WHERE id = p_run_id FOR UPDATE;
  IF v_run.id IS NULL OR v_run.parent_numo_turn_id IS DISTINCT FROM p_parent_turn_id
     OR v_run.status <> 'completed' OR NOT v_run.awaiting_input THEN
    UPDATE public.agent_run_input_requests
    SET status = 'canceled'
    WHERE id = v_input.id AND status = 'pending';
    RETURN 'ignored';
  END IF;

  SELECT public.resume_latest_agent_run_with_message(
    p_run_id, p_user_id, p_user_id, p_message_id, btrim(p_answer), null,
    p_not_before, p_usage_since, p_budget_cap, p_requested_budget
  ) INTO v_result;
  IF v_result NOT IN ('queued', 'already') THEN RETURN v_result; END IF;

  UPDATE public.agent_runs
  SET awaiting_input = false, delegation_result = null
  WHERE id = p_run_id AND status IN ('queued', 'running');
  UPDATE public.agent_run_input_requests
  SET status = 'answered', answer = btrim(p_answer),
      answer_message_id = p_message_id, answered_at = now()
  WHERE id = v_input.id AND status = 'pending';

  IF p_persist_parent_message THEN
    INSERT INTO public.assistant_messages (
      id, conversation_id, turn_id, role, content,
      metadata
    ) VALUES (
      p_message_id, p_conversation_id, p_parent_turn_id, 'user', btrim(p_answer),
      jsonb_build_object(
        'worker_input', jsonb_build_object(
          'run_id', p_run_id, 'question_id', p_question_id
        )
      )
    ) ON CONFLICT (id) DO NOTHING;
    UPDATE public.numo_assistant_turns
    SET status = 'waiting_work', checkpoint = jsonb_build_object(
          'phase', 'worker_wait', 'active_run_id', p_run_id
        ),
        claim_token = NULL, claimed_at = NULL, active_run_id = p_run_id,
        error_message = NULL, updated_at = now()
    WHERE id = p_parent_turn_id AND status = 'waiting_input';
    UPDATE public.conversations
    SET status = 'generating', error_message = NULL, updated_at = now()
    WHERE id = p_conversation_id AND user_id = p_user_id;
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.resume_numo_worker_input(
  uuid, uuid, uuid, text, uuid, uuid, text, boolean, timestamptz,
  timestamptz, numeric, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_numo_worker_input(
  uuid, uuid, uuid, text, uuid, uuid, text, boolean, timestamptz,
  timestamptz, numeric, numeric
) TO service_role;

-- A message sent while Numo is waiting on a worker is parent-conversation
-- steering. It is journaled in both conversations under one idempotency key and
-- interrupts only the worker currently correlated with that parent turn.
CREATE OR REPLACE FUNCTION public.steer_numo_worker(
  p_conversation_id uuid,
  p_user_id uuid,
  p_message_id uuid,
  p_content text,
  p_parent_content text DEFAULT NULL,
  p_mentions jsonb DEFAULT NULL,
  p_context jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
  v_run public.agent_runs%ROWTYPE;
  v_result text;
BEGIN
  IF p_conversation_id IS NULL OR p_user_id IS NULL OR p_message_id IS NULL
     OR nullif(btrim(p_content), '') IS NULL THEN
    RAISE EXCEPTION 'numo_worker_steering_invalid' USING ERRCODE = '22023';
  END IF;
  IF (p_mentions IS NOT NULL AND jsonb_typeof(p_mentions) <> 'array')
     OR (p_context IS NOT NULL AND jsonb_typeof(p_context) <> 'object')
     OR jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'numo_worker_steering_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('numo-conversation:' || p_conversation_id::text, 516)
  );
  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id
    AND status IN ('waiting_work', 'waiting_input')
  ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  IF v_turn.id IS NULL OR v_turn.active_run_id IS NULL THEN
    RETURN jsonb_build_object('action', 'none');
  END IF;
  IF v_turn.status = 'waiting_input' THEN
    IF EXISTS (
      SELECT 1 FROM public.agent_run_input_requests
      WHERE parent_numo_turn_id = v_turn.id
        AND run_id = v_turn.active_run_id AND status = 'pending'
    ) THEN
      RETURN jsonb_build_object(
        'action', 'refused', 'result', 'worker_input_pending',
        'turn_id', v_turn.id, 'run_id', v_turn.active_run_id
      );
    END IF;
    RETURN jsonb_build_object('action', 'none');
  END IF;
  SELECT * INTO v_run FROM public.agent_runs
  WHERE id = v_turn.active_run_id AND parent_numo_turn_id = v_turn.id
    AND status IN ('queued', 'running')
  FOR UPDATE;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('action', 'none'); END IF;

  SELECT public.insert_latest_agent_run_message(
    v_run.id, p_message_id, p_user_id, btrim(p_content), p_mentions
  ) INTO v_result;
  IF v_result NOT IN ('inserted', 'already') THEN
    RETURN jsonb_build_object('action', 'refused', 'result', v_result);
  END IF;
  INSERT INTO public.assistant_messages (
    id, conversation_id, turn_id, role, content, context, metadata
  ) VALUES (
    p_message_id, p_conversation_id, v_turn.id, 'user',
    btrim(COALESCE(NULLIF(p_parent_content, ''), p_content)), p_context,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'worker_steering', jsonb_build_object('run_id', v_run.id)
    )
  ) ON CONFLICT (id) DO NOTHING;
  UPDATE public.agent_runs
  SET interrupt_requested = true, last_activity_at = now()
  WHERE id = v_run.id AND status = 'running';
  RETURN jsonb_build_object(
    'action', 'steered', 'turn_id', v_turn.id, 'run_id', v_run.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.steer_numo_worker(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.steer_numo_worker(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb
)
  TO service_role;

-- Stopping a parent also closes its unanswered decisions. This replaces the
-- prior function without changing its signature or its worker interrupt guard.
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

COMMIT;
