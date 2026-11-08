-- MIN-929, after review: every background wake gets a conversation of its
-- own, like a routine occurrence, instead of one conversation per user.
--
-- A conversation accepts one active turn at a time (`begin_numo_turn` raises
-- `conversation_busy`), so a shared one made a wake fail whenever the
-- previous wake was still running, and a turn stuck in `reconciling` in a
-- conversation the user cannot open stopped background Numo for good. A
-- conversation per wake also keeps earlier wakes out of the next one's
-- history.
--
-- * `numo_wakes.conversation_id` now identifies the background conversations:
--   unique, and read by `is_numo_background_conversation`. The per-user table
--   of 20270109200108 goes; nothing reads it any more.
-- * `numo_urgent_note_claims` records each urgent note a background turn was
--   allowed to send. The cap of two a day counts these rows, which survive
--   the user clearing the note from the inbox (that deletes the note).
--   `claim_numo_urgent_note` counts and inserts under a per-user lock, so two
--   turns running at once cannot both take the last slot.
--
-- Both tables are service-only. The previous release reads neither.

BEGIN;

DROP TABLE public.numo_background_conversations;

CREATE UNIQUE INDEX idx_numo_wakes_conversation ON public.numo_wakes (conversation_id);

CREATE OR REPLACE FUNCTION public.is_numo_background_conversation(
  p_conversation_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.numo_wakes AS wake
    WHERE wake.conversation_id = p_conversation_id
      AND (auth.role() = 'service_role' OR wake.user_id = auth.uid())
  );
$$;

CREATE TABLE public.numo_urgent_note_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numo_turn_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_numo_urgent_note_claims_user_recent
  ON public.numo_urgent_note_claims (user_id, created_at DESC);

ALTER TABLE public.numo_urgent_note_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.numo_urgent_note_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.numo_urgent_note_claims TO service_role;

CREATE FUNCTION public.claim_numo_urgent_note(
  p_user_id uuid,
  p_turn_id uuid,
  p_limit integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('numo_urgent_note:' || p_user_id::text, 0));
  SELECT count(*) INTO v_count
  FROM public.numo_urgent_note_claims
  WHERE user_id = p_user_id AND created_at > now() - interval '24 hours';
  IF v_count >= p_limit THEN
    RETURN false;
  END IF;
  INSERT INTO public.numo_urgent_note_claims (user_id, numo_turn_id) VALUES (p_user_id, p_turn_id);
  RETURN true;
END;
$$;

ALTER FUNCTION public.claim_numo_urgent_note(uuid, uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_numo_urgent_note(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_numo_urgent_note(uuid, uuid, integer) TO service_role;

COMMIT;
