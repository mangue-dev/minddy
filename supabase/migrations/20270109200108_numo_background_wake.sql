-- MIN-929: background Numo wakes up (fourth brick of MIN-925). When the wake
-- decision (MIN-928) keeps events of a batch, Numo runs one ordinary turn in
-- a conversation of its own, then reports in its journal (MIN-927).
--
-- * `numo_background_conversations`: the one conversation per user that
--   background turns continue. It is left out of the conversation list, like
--   routine occurrences; the user reads it from Numo's word on the home page.
--   Deleting the conversation deletes the row, and the next wake opens a new
--   one.
-- * `numo_wakes`: one row per woken batch. It makes the wake idempotent (a
--   batch never wakes Numo twice) and is what the daily cap per user counts.
--   No foreign key to the conversation: the conversation starts over every
--   few dozen turns, and the cap must keep counting the turns of the day.
-- * `numo_notes.urgent`: a background turn may send a note outside the user's
--   instructions only when it is urgent, and at most two a day. The flag is
--   what that cap counts.
--
-- Both new tables are service-only, read and written by
-- `lib/server/numo/wake.ts`. The history view reads the conversation table
-- through a definer predicate that answers only for the caller's own
-- conversations, the way `is_numo_routine_conversation` does.
--
-- Additive: the previous release neither reads nor writes the new tables or
-- the new column, and the view keeps its columns.

BEGIN;

CREATE TABLE public.numo_background_conversations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.numo_background_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.numo_background_conversations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.numo_background_conversations TO service_role;

CREATE TABLE public.numo_wakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL UNIQUE,
  conversation_id uuid NOT NULL,
  turn_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The daily cap.
CREATE INDEX idx_numo_wakes_user_recent ON public.numo_wakes (user_id, created_at DESC);

ALTER TABLE public.numo_wakes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.numo_wakes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.numo_wakes TO service_role;

ALTER TABLE public.numo_notes ADD COLUMN urgent boolean NOT NULL DEFAULT false;

-- The urgent-note cap.
CREATE INDEX idx_numo_notes_urgent_recent
  ON public.numo_notes (user_id, created_at DESC) WHERE urgent;

CREATE FUNCTION public.is_numo_background_conversation(
  p_conversation_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.numo_background_conversations AS background
    WHERE background.conversation_id = p_conversation_id
      AND (auth.role() = 'service_role' OR background.user_id = auth.uid())
  );
$$;

ALTER FUNCTION public.is_numo_background_conversation(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_numo_background_conversation(uuid) FROM PUBLIC, anon;
-- The invoker view calls it as the reader: without this grant the view fails
-- for every authenticated user.
GRANT EXECUTE ON FUNCTION public.is_numo_background_conversation(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE VIEW public.numo_user_conversation_history WITH (security_invoker = true) AS
SELECT history.*
FROM public.numo_conversation_history history
WHERE NOT public.is_numo_routine_conversation(history.legacy_id)
  AND NOT public.is_numo_background_conversation(history.legacy_id);

REVOKE ALL ON public.numo_user_conversation_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.numo_user_conversation_history TO authenticated;
GRANT ALL ON public.numo_user_conversation_history TO service_role;

COMMIT;
