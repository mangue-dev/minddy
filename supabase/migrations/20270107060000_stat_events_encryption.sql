-- MIN-591: keep statistics snapshots protected after their source is deleted.
BEGIN;

ALTER TABLE public.stat_events
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_revision bigint NOT NULL DEFAULT 0 CHECK (encryption_revision >= 0),
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT stat_events_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL
      AND project_name IS NULL AND issue_title IS NULL AND task_text IS NULL
      AND COALESCE((encrypted_content::jsonb ->> 'keyVersion')::integer = encryption_version, false))
  );

CREATE INDEX stat_events_encryption_queue
  ON public.stat_events (encryption_checked_at NULLS FIRST, id);

CREATE FUNCTION public.guard_stat_events_encryption()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'statistics_identity_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.encryption_version < OLD.encryption_version
      OR NEW.encryption_revision < OLD.encryption_revision THEN
    RAISE EXCEPTION 'statistics_encryption_downgrade' USING ERRCODE = '23514';
  END IF;
  IF (NEW.project_name IS DISTINCT FROM OLD.project_name
      OR NEW.issue_title IS DISTINCT FROM OLD.issue_title
      OR NEW.task_text IS DISTINCT FROM OLD.task_text
      OR NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content
      OR NEW.encryption_version IS DISTINCT FROM OLD.encryption_version)
      AND NEW.encryption_revision <= OLD.encryption_revision THEN
    RAISE EXCEPTION 'statistics_revision_must_advance' USING ERRCODE = '23514';
  END IF;
  -- Project/issue FKs may become NULL after deletion; the snapshot is user-owned.
  RETURN NEW;
END;
$function$;

CREATE TRIGGER stat_events_encryption_guard BEFORE UPDATE ON public.stat_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_stat_events_encryption();
REVOKE ALL ON FUNCTION public.guard_stat_events_encryption() FROM PUBLIC, anon, authenticated;
COMMIT;
