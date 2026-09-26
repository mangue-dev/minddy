-- MIN-591: personal notes retain their existing optimistic concurrency contract.
BEGIN;

ALTER TABLE public.user_scratchpad
  ALTER COLUMN content DROP NOT NULL,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT scratchpad_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND content IS NOT NULL)
    OR (encryption_version > 0 AND content IS NULL AND encrypted_content IS NOT NULL
      AND COALESCE((encrypted_content::jsonb ->> 'keyVersion')::integer = encryption_version, false))
  );

CREATE INDEX user_scratchpad_encryption_queue
  ON public.user_scratchpad (encryption_checked_at NULLS FIRST, user_id);

CREATE FUNCTION public.guard_scratchpad_encryption()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'scratchpad_owner_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.encryption_version < OLD.encryption_version THEN
    RAISE EXCEPTION 'scratchpad_encryption_downgrade' USING ERRCODE = '23514';
  END IF;
  IF NEW.rev < OLD.rev THEN
    RAISE EXCEPTION 'scratchpad_revision_downgrade' USING ERRCODE = '23514';
  END IF;
  IF (NEW.content IS DISTINCT FROM OLD.content
      OR NEW.encrypted_content IS DISTINCT FROM OLD.encrypted_content
      OR NEW.encryption_version IS DISTINCT FROM OLD.encryption_version)
      AND NEW.rev <= OLD.rev THEN
    RAISE EXCEPTION 'scratchpad_revision_must_advance' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER user_scratchpad_encryption_guard
  BEFORE UPDATE ON public.user_scratchpad
  FOR EACH ROW EXECUTE FUNCTION public.guard_scratchpad_encryption();

-- Queue attempts must not look like user edits or disturb concurrency tokens.
CREATE FUNCTION public.set_scratchpad_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF NEW.rev IS DISTINCT FROM OLD.rev THEN NEW.updated_at := now();
  ELSE NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER user_scratchpad_set_updated_at ON public.user_scratchpad;
CREATE TRIGGER user_scratchpad_set_updated_at BEFORE UPDATE ON public.user_scratchpad
  FOR EACH ROW EXECUTE FUNCTION public.set_scratchpad_updated_at();

-- Realtime only invalidates the authorized API cache; it never carries note content.
CREATE OR REPLACE FUNCTION public.broadcast_scratchpad_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_new public.user_scratchpad%ROWTYPE;
  v_old public.user_scratchpad%ROWTYPE;
  v_user uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.rev = OLD.rev THEN RETURN NULL; END IF;
  IF TG_OP <> 'DELETE' THEN v_new := NEW; v_user := NEW.user_id; END IF;
  IF TG_OP <> 'INSERT' THEN v_old := OLD; v_user := OLD.user_id; END IF;
  v_new.content := NULL;
  v_new.encrypted_content := NULL;
  v_old.content := NULL;
  v_old.encrypted_content := NULL;
  PERFORM realtime.broadcast_changes(
    'user:' || v_user, TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, v_new, v_old);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_scratchpad_encryption() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_scratchpad_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_scratchpad_row() FROM PUBLIC, anon, authenticated;
COMMIT;
