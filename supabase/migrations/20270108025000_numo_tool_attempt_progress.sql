-- Move failed rows behind later candidates without modifying content or CAS state.
CREATE FUNCTION public.mark_numo_tool_content_attempt(
  p_kind text, p_id uuid, p_call_id text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_kind = 'message' AND p_call_id IS NULL THEN
    UPDATE public.assistant_messages SET tool_payload_checked_at = clock_timestamp()
      WHERE id = p_id;
  ELSIF p_kind = 'checkpoint' AND p_call_id IS NULL THEN
    UPDATE public.numo_assistant_turns SET tool_checkpoint_checked_at = clock_timestamp()
      WHERE id = p_id;
  ELSIF p_kind = 'operation' AND p_call_id IS NOT NULL THEN
    UPDATE public.numo_tool_operations SET encryption_checked_at = clock_timestamp()
      WHERE turn_id = p_id AND tool_call_id = p_call_id;
  ELSE
    RAISE invalid_parameter_value USING MESSAGE = 'Invalid Numo tool attempt kind';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_numo_tool_content_attempt(text,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_numo_tool_content_attempt(text,uuid,text)
  TO service_role;
