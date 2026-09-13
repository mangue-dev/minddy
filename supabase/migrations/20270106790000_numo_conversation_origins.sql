-- Keep routine-owned conversations addressable by their durable Numo identity
-- while excluding them from the user-initiated chat history. The occurrence
-- relation is immutable provenance: follow-up messages never turn a routine
-- conversation into a regular Numo conversation.
BEGIN;

CREATE OR REPLACE VIEW public.numo_user_conversation_history
WITH (security_invoker = true) AS
SELECT history.*
FROM public.numo_conversation_history AS history
WHERE NOT EXISTS (
  SELECT 1
  FROM public.numo_routine_occurrences AS occurrence
  WHERE occurrence.conversation_id = history.legacy_id
    AND history.source = 'assistant'
);

REVOKE ALL ON public.numo_user_conversation_history FROM PUBLIC, anon;
GRANT SELECT ON public.numo_user_conversation_history
  TO authenticated, service_role;

COMMIT;
