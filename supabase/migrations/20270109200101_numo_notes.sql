-- MIN-914: Numo can leave a note in the inbox of the user it works for.
--
-- A note is free text written by a model: a short title and a body of one or
-- two sentences. It lives in its own service-only table rather than on
-- `notifications`, so the notification row keeps its clear, classified
-- columns and only the note carries content. The note is sealed under the
-- project's key once project content encryption is active, like the rest of
-- the project's content; `notifications.numo_note_id` points at it.
--
-- Recipient: always the user Numo acts for (the conversation's user, or the
-- routine's owner). Notifying other members would duplicate what their own
-- Numo tells them, so the table pins the note's user to the notification's.
--
-- Additive only: the previous release neither writes nor reads a note, and
-- ignores the new notification type it never produces.

BEGIN;

CREATE TABLE public.numo_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The Numo turn that wrote the note: the per-turn cap counts on it. Not a
  -- foreign key, so purging a conversation's turns never removes a note.
  numo_turn_id uuid,
  title text,
  body text,
  encrypted_content text,
  encryption_version integer NOT NULL DEFAULT 0,
  encryption_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT numo_notes_content_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL
      AND title IS NOT NULL AND body IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL
      AND title IS NULL AND body IS NULL)
  ),
  CONSTRAINT numo_notes_clear_length CHECK (
    char_length(COALESCE(title, '')) <= 200 AND char_length(COALESCE(body, '')) <= 1000
  )
);

CREATE INDEX idx_numo_notes_user_recent
  ON public.numo_notes (user_id, project_id, created_at DESC);
CREATE INDEX idx_numo_notes_turn
  ON public.numo_notes (numo_turn_id) WHERE numo_turn_id IS NOT NULL;

ALTER TABLE public.numo_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.numo_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.numo_notes TO service_role;

-- A note never moves to another user or project and never goes back to clear
-- text; an update can only reseal it. It is written in clear only while
-- project content encryption is inactive. The shared fence waits for an
-- activation in flight, exactly like the project content writers
-- (20270109200055).
CREATE FUNCTION public.guard_numo_note_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.project_id IS DISTINCT FROM OLD.project_id
      OR (OLD.encryption_version > 0 AND NEW.encryption_version = 0)) THEN
    RAISE EXCEPTION 'numo_note_scope_immutable' USING ERRCODE = '23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('project-content-activation', 591));
  IF NEW.encryption_version > 0 THEN
    IF COALESCE((NEW.encrypted_content::jsonb->>'keyVersion')::integer
        <> NEW.encryption_version, true) THEN
      RAISE EXCEPTION 'numo_note_content_state_invalid' USING ERRCODE = '23514';
    END IF;
    NEW.encryption_checked_at := clock_timestamp();
  ELSIF EXISTS (SELECT 1 FROM public.project_content_encryption_scope) THEN
    RAISE EXCEPTION 'numo_note_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_numo_note_content() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER numo_notes_guard_content
  BEFORE INSERT OR UPDATE ON public.numo_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_numo_note_content();

ALTER TABLE public.notifications
  ADD COLUMN numo_note_id uuid REFERENCES public.numo_notes(id) ON DELETE CASCADE;
CREATE INDEX idx_notifications_numo_note
  ON public.notifications (numo_note_id) WHERE numo_note_id IS NOT NULL;

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'assigned', 'mention', 'comment', 'agent_done', 'agent_question', 'agent_failed',
  'feedback_new', 'pr_reviewed', 'pr_merged', 'pr_opened', 'automation_paused',
  'automation_stopped', 'routine_done', 'page_mention', 'page_agent_edit', 'page_comment',
  'instance_config_changed', 'numo_message'
]::text[]));
-- A Numo note has exactly one notification row, and that row is a Numo note.
ALTER TABLE public.notifications ADD CONSTRAINT notifications_numo_note_check CHECK (
  (type = 'numo_message') = (numo_note_id IS NOT NULL)
);

-- The note belongs to the notification's recipient and project: a row can
-- never show one user's note in another user's inbox.
CREATE FUNCTION public.validate_notification_numo_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.numo_note_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.numo_notes AS note
    WHERE note.id = NEW.numo_note_id
      AND note.user_id = NEW.user_id
      AND note.project_id IS NOT DISTINCT FROM NEW.project_id
  ) THEN
    RAISE check_violation USING MESSAGE = 'notification_numo_note_scope_mismatch';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_notification_numo_note()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER notifications_validate_numo_note
  BEFORE INSERT OR UPDATE OF user_id, project_id, numo_note_id
  ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.validate_notification_numo_note();

-- Deleting the notification (the user clears it) removes its note: the note
-- has no other reader.
CREATE FUNCTION public.delete_notification_numo_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.numo_note_id IS NOT NULL THEN
    DELETE FROM public.numo_notes WHERE id = OLD.numo_note_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_notification_numo_note()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER notifications_delete_numo_note
  AFTER DELETE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.delete_notification_numo_note();

COMMIT;
