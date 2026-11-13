-- MIN-982: personal reminders. A date reminder no longer needs a project:
-- "every day at 09:00, check the web for a concert by X" belongs to the user
-- alone, like their account settings. Its turn runs with the user's rights and
-- no project context, writes its result to the journal (whose entries already
-- take no project) and may leave the user a note, which now takes no project
-- either.
--
-- - `numo_watches.project_id` is nullable. Only a date reminder can be
--   personal: an issue or an objective always belongs to a project.
-- - `numo_notes.project_id` is nullable. A note without a project is sealed
--   under the user's key, like the reminder's instruction, instead of a
--   project's: the policy scope becomes "project, otherwise user", as for
--   saved views and rich documents. Its notification row has no project
--   either, which `validate_notification_numo_note` already matches with
--   `IS NOT DISTINCT FROM`.
-- - `guard_numo_note_content` requires project encryption only for a note
--   that has a project. A personal note follows the user-content setting,
--   enforced by its codec, as for every user-scoped table.
--
-- Compatible with the previous release: it never writes a row without a
-- project, and only the new code writes one.

BEGIN;

ALTER TABLE public.numo_watches ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE public.numo_watches ADD CONSTRAINT numo_watches_personal_date CHECK (
  project_id IS NOT NULL OR target_type = 'date'
);

ALTER TABLE public.numo_notes ALTER COLUMN project_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_numo_note_content()
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
  ELSIF NEW.project_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.project_content_encryption_scope) THEN
    RAISE EXCEPTION 'numo_note_requires_encryption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_numo_note_content() FROM PUBLIC, anon, authenticated;

COMMIT;
