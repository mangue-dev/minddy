-- Keep the routine-origin filter out of the invoker view's RLS plan. The
-- history view only invokes this helper for conversations the caller already
-- owns, so the boolean result cannot disclose another user's conversation.
BEGIN;

CREATE INDEX IF NOT EXISTS numo_routine_occurrences_conversation_id_idx
  ON public.numo_routine_occurrences (conversation_id);

CREATE OR REPLACE FUNCTION public.is_numo_routine_conversation(
  p_conversation_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.numo_routine_occurrences
    WHERE conversation_id = p_conversation_id
  );
$$;

ALTER FUNCTION public.is_numo_routine_conversation(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_numo_routine_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_numo_routine_conversation(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE VIEW public.numo_user_conversation_history
WITH (security_invoker = true) AS
SELECT history.*
FROM public.numo_conversation_history AS history
WHERE history.source <> 'assistant'
   OR NOT public.is_numo_routine_conversation(history.legacy_id);

COMMIT;
