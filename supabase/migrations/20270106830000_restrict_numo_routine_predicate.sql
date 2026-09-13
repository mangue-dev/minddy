-- The helper is callable by authenticated clients through the invoker view.
-- Do not let a direct call reveal routine provenance for another user's chat.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_numo_routine_conversation(
  p_conversation_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.numo_routine_occurrences AS occurrence
    WHERE occurrence.conversation_id = p_conversation_id
      AND (
        auth.role() = 'service_role'
        OR EXISTS (
          SELECT 1
          FROM public.conversations AS conversation
          WHERE conversation.id = occurrence.conversation_id
            AND conversation.user_id = auth.uid()
        )
      )
  );
$$;

ALTER FUNCTION public.is_numo_routine_conversation(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_numo_routine_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_numo_routine_conversation(uuid)
  TO authenticated, service_role;

COMMIT;
