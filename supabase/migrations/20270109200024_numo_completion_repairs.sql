-- Preserve the bounded completion repair count when native tools start.
-- The message and checkpoint remain atomic; pending repair flags are cleared.
BEGIN;

CREATE OR REPLACE FUNCTION public.checkpoint_numo_tool_round(
  p_turn_id uuid,
  p_claim_token uuid,
  p_content text,
  p_tool_calls jsonb,
  p_reasoning jsonb,
  p_round_count integer
) RETURNS SETOF public.numo_assistant_turns
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_turn public.numo_assistant_turns%ROWTYPE;
  v_message_id uuid;
BEGIN
  IF jsonb_typeof(p_tool_calls) IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_tool_calls) = 0
      OR p_round_count IS NULL OR p_round_count < 1 THEN
    RAISE EXCEPTION 'invalid_tool_round' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_turn FROM public.numo_assistant_turns
  WHERE id = p_turn_id AND claim_token = p_claim_token AND status = 'running'
  FOR UPDATE;
  IF v_turn.id IS NULL THEN RETURN; END IF;
  INSERT INTO public.assistant_messages (
    conversation_id, turn_id, role, content, tool_calls, metadata
  ) VALUES (
    v_turn.conversation_id, v_turn.id, 'assistant', p_content, p_tool_calls,
    CASE WHEN p_reasoning IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object('reasoning', p_reasoning) END
  ) RETURNING id INTO v_message_id;
  UPDATE public.numo_assistant_turns
  SET checkpoint = jsonb_build_object(
        'phase', 'tools',
        'assistantContent', p_content,
        'assistantReasoning', p_reasoning,
        'assistantMessageId', v_message_id,
        'pendingToolCalls', p_tool_calls,
        'completedToolCallIds', '[]'::jsonb,
        'roundCount', p_round_count,
        'completionRepairs', coalesce(v_turn.checkpoint -> 'completionRepairs', '0'::jsonb)
      ),
      claimed_at = now(), updated_at = now()
  WHERE id = v_turn.id AND claim_token = p_claim_token AND status = 'running'
  RETURNING * INTO v_turn;
  IF v_turn.id IS NOT NULL THEN RETURN NEXT v_turn; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.checkpoint_numo_tool_round(uuid, uuid, text, jsonb, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_numo_tool_round(uuid, uuid, text, jsonb, jsonb, integer)
  TO service_role;

COMMIT;
