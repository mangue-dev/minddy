-- MIN-1011: no Numo turn stays in a non-terminal status with nothing working
-- on it.
--
-- 1. A tool call interrupted with its job no longer parks the turn in
--    `reconciling`. With `p_resolve_ambiguous`, the claim reopens the
--    interrupted operation under the resuming job's claim and answers
--    `resolve`: the turn stays `running`, and the loop either runs a read
--    again or tells the model the call's outcome is unknown. A write is never
--    replayed. Without the flag (the previous release), the claim behaves as
--    before.
-- 2. `recover_stale_numo_turns` gives a `reconciling` turn back to the queue,
--    where the claim above resolves its call. It also ends the questions
--    nobody will answer: a `waiting_input` turn superseded by a later turn of
--    its conversation is `completed`, and a routine run still waiting after
--    seven days is `stopped`. It now returns
--    the turns it finished, so the drain runs the same after-turn hooks as a
--    turn that ended in its job (surface projection, routine and reminder
--    notifications).
-- 3. `retry_numo_turn` starts a fresh attempt count: the job that claims a
--    turn whose attempts are spent ends it `failed` with a readable message,
--    so a manual retry must not inherit the spent count.
--
-- Compatible with the previous release: the new claim parameter has a
-- default, and the previous release ignores the result of the recovery.

BEGIN;

DROP FUNCTION public.claim_numo_tool_operation(uuid, uuid, text, text, jsonb, text);
CREATE FUNCTION public.claim_numo_tool_operation(
  p_turn_id uuid,
  p_claim_token uuid,
  p_tool_call_id text,
  p_tool_name text,
  p_arguments jsonb,
  p_replay_policy text,
  p_resolve_ambiguous boolean DEFAULT false
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
  IF p_resolve_ambiguous THEN
    -- The caller now holds the call and records how it settles it.
    UPDATE public.numo_tool_operations
    SET status = 'started', claim_token = p_claim_token, started_at = now()
    WHERE turn_id = p_turn_id AND tool_call_id = p_tool_call_id;
    RETURN jsonb_build_object('action', 'resolve');
  END IF;
  UPDATE public.numo_tool_operations SET status = 'ambiguous'
  WHERE turn_id = p_turn_id AND tool_call_id = p_tool_call_id;
  UPDATE public.numo_assistant_turns
  SET status = 'reconciling', claim_token = NULL, claimed_at = NULL,
      error_message = NULL,
      updated_at = now()
  WHERE id = p_turn_id AND claim_token = p_claim_token;
  UPDATE public.conversations
  SET status = 'error',
      error_message = NULL,
      updated_at = now()
  WHERE id = v_conversation_id;
  RETURN jsonb_build_object('action', 'reconcile');
END;
$$;
REVOKE ALL ON FUNCTION public.claim_numo_tool_operation(uuid, uuid, text, text, jsonb, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_numo_tool_operation(uuid, uuid, text, text, jsonb, text, boolean)
  TO service_role;

DROP FUNCTION public.claim_numo_tool_operation_protected(uuid, uuid, text, text, jsonb, integer, text, text);
CREATE FUNCTION public.claim_numo_tool_operation_protected(
  p_turn_id uuid,p_claim_token uuid,p_tool_call_id text,p_tool_name text,
  p_arguments jsonb,p_arguments_version integer,p_arguments_digest text,
  p_replay_policy text,p_resolve_ambiguous boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation public.numo_tool_operations%ROWTYPE; inserted integer;
  conversation_id uuid;
BEGIN
  IF p_replay_policy NOT IN ('retry','reconcile') THEN
    RAISE EXCEPTION 'invalid_replay_policy' USING ERRCODE='22023';
  END IF;
  SELECT t.conversation_id INTO conversation_id FROM public.numo_assistant_turns t
    WHERE t.id=p_turn_id AND t.claim_token=p_claim_token AND t.status='running'
    FOR UPDATE;
  IF conversation_id IS NULL THEN RETURN jsonb_build_object('action','lost_claim'); END IF;
  INSERT INTO public.numo_tool_operations(turn_id,tool_call_id,tool_name,
    arguments,arguments_version,arguments_digest,replay_policy,claim_token)
  VALUES(p_turn_id,p_tool_call_id,p_tool_name,p_arguments,p_arguments_version,
    p_arguments_digest,p_replay_policy,p_claim_token)
  ON CONFLICT(turn_id,tool_call_id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=1 THEN RETURN jsonb_build_object('action','execute'); END IF;
  SELECT * INTO operation FROM public.numo_tool_operations
    WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id FOR UPDATE;
  IF operation.tool_name<>p_tool_name OR
      operation.arguments_digest IS DISTINCT FROM p_arguments_digest OR
      operation.replay_policy<>p_replay_policy THEN
    RAISE EXCEPTION 'tool_call_conflict' USING ERRCODE='23505';
  END IF;
  IF operation.status='completed' THEN
    RETURN jsonb_build_object('action','reuse','success',operation.success,
      'result',operation.result,'result_version',operation.result_version,
      'model_result',operation.model_result,
      'model_result_version',operation.model_result_version,
      'pause',operation.pause);
  END IF;
  IF operation.replay_policy='retry' THEN
    UPDATE public.numo_tool_operations SET status='started',
      claim_token=p_claim_token,started_at=now()
      WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id;
    RETURN jsonb_build_object('action','execute');
  END IF;
  IF p_resolve_ambiguous THEN
    -- The caller now holds the call and records how it settles it.
    UPDATE public.numo_tool_operations SET status='started',
      claim_token=p_claim_token,started_at=now()
      WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id;
    RETURN jsonb_build_object('action','resolve');
  END IF;
  UPDATE public.numo_tool_operations SET status='ambiguous'
    WHERE turn_id=p_turn_id AND tool_call_id=p_tool_call_id;
  UPDATE public.numo_assistant_turns SET status='reconciling',
    claim_token=NULL,claimed_at=NULL,error_message=NULL,updated_at=now()
    WHERE id=p_turn_id AND claim_token=p_claim_token;
  UPDATE public.conversations SET status='error',error_message=NULL,
    updated_at=now() WHERE id=conversation_id;
  RETURN jsonb_build_object('action','reconcile');
END;
$$;
REVOKE ALL ON FUNCTION public.claim_numo_tool_operation_protected(uuid,uuid,text,text,jsonb,integer,text,text,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_numo_tool_operation_protected(uuid,uuid,text,text,jsonb,integer,text,text,boolean)
  TO service_role;

DROP FUNCTION public.recover_stale_numo_turns();
CREATE FUNCTION public.recover_stale_numo_turns()
RETURNS SETOF public.numo_assistant_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  -- A lease older than the job ceiling has no job left: a stop finishes, a
  -- running turn goes back to the queue. The job that claims it ends it
  -- `failed` once its attempts are spent.
  FOR v_turn IN
    SELECT * FROM public.numo_assistant_turns
    WHERE status IN ('running', 'stopping')
      AND claimed_at < now() - interval '6 minutes'
    ORDER BY claimed_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.numo_assistant_turns
    SET status = CASE WHEN v_turn.status = 'stopping' THEN 'stopped' ELSE 'retryable' END,
        claim_token = NULL,
        claimed_at = NULL,
        completed_at = CASE WHEN v_turn.status = 'stopping' THEN now() END,
        error_message = NULL,
        updated_at = now()
    WHERE id = v_turn.id
    RETURNING * INTO v_turn;
    UPDATE public.conversations
    SET status = CASE WHEN v_turn.status = 'stopped' THEN 'idle' ELSE 'error' END,
        error_message = NULL,
        updated_at = now()
    WHERE id = v_turn.conversation_id;
    IF v_turn.status = 'stopped' THEN RETURN NEXT v_turn; END IF;
  END LOOP;

  -- A turn the previous release parked on an interrupted tool call: the next
  -- claim resolves that call (`p_resolve_ambiguous`), so it resumes.
  FOR v_turn IN
    SELECT * FROM public.numo_assistant_turns
    WHERE status = 'reconciling'
    ORDER BY updated_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.numo_assistant_turns
    SET status = 'retryable', not_before = now(), error_message = NULL,
        updated_at = now()
    WHERE id = v_turn.id;
    UPDATE public.conversations
    SET status = 'generating', error_message = NULL, updated_at = now()
    WHERE id = v_turn.conversation_id;
  END LOOP;

  -- A question the conversation moved past: the later turn carries the
  -- answer. The conversation's status belongs to that later turn.
  FOR v_turn IN
    UPDATE public.numo_assistant_turns AS waiting
    SET status = 'completed', checkpoint = '{}'::jsonb,
        completed_at = now(), updated_at = now()
    WHERE waiting.status = 'waiting_input'
      AND EXISTS (
        SELECT 1 FROM public.numo_assistant_turns AS later
        WHERE later.conversation_id = waiting.conversation_id
          AND (later.created_at, later.id) > (waiting.created_at, waiting.id)
      )
    RETURNING waiting.*
  LOOP
    RETURN NEXT v_turn;
  END LOOP;

  -- A routine run has nobody in front of it: its question expires. Routines,
  -- wakes and reminders can no longer ask (ask_user is refused to an
  -- unattended turn), so only runs that asked before that change wait here.
  -- The turn intent is encrypted, hence the occurrence lookup.
  FOR v_turn IN
    UPDATE public.numo_assistant_turns AS waiting
    SET status = 'stopped', checkpoint = '{}'::jsonb,
        completed_at = now(), updated_at = now()
    WHERE waiting.status = 'waiting_input'
      AND waiting.updated_at < now() - interval '7 days'
      AND EXISTS (
        SELECT 1 FROM public.numo_routine_occurrences AS occurrence
        WHERE occurrence.conversation_id = waiting.conversation_id
      )
    RETURNING waiting.*
  LOOP
    RETURN NEXT v_turn;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.recover_stale_numo_turns()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_numo_turns() TO service_role;

CREATE OR REPLACE FUNCTION public.retry_numo_turn(p_conversation_id uuid, p_user_id uuid)
RETURNS SETOF public.numo_assistant_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
BEGIN
  UPDATE public.numo_assistant_turns
  SET status = 'retryable', claim_token = NULL, claimed_at = NULL,
      not_before = now(), completed_at = NULL, error_message = NULL,
      attempts = 0, updated_at = now()
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

COMMIT;
