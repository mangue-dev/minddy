-- MIN-591: protect project creation drafts under their owner's content key.
BEGIN;

ALTER TABLE public.project_drafts
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN data DROP NOT NULL,
  ALTER COLUMN data DROP DEFAULT,
  ADD COLUMN encryption_version integer NOT NULL DEFAULT 0,
  ADD COLUMN encrypted_content text,
  ADD COLUMN encryption_revision bigint NOT NULL DEFAULT 0 CHECK (encryption_revision >= 0),
  ADD COLUMN encryption_checked_at timestamptz,
  ADD CONSTRAINT project_drafts_encryption_state CHECK (
    (encryption_version = 0 AND encrypted_content IS NULL AND name IS NOT NULL AND data IS NOT NULL)
    OR (encryption_version > 0 AND encrypted_content IS NOT NULL AND name IS NULL AND data IS NULL
      AND COALESCE((encrypted_content::jsonb ->> 'keyVersion')::integer = encryption_version, false)));
CREATE INDEX project_drafts_encryption_queue
  ON public.project_drafts(encryption_checked_at NULLS FIRST, id);
REVOKE INSERT, UPDATE ON public.project_drafts FROM anon, authenticated;

CREATE FUNCTION public.guard_project_draft_encryption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.encryption_version = 0 AND
    (TG_OP = 'INSERT' OR NEW.name IS DISTINCT FROM OLD.name OR NEW.data IS DISTINCT FROM OLD.data) AND
    EXISTS (SELECT 1 FROM public.envelope_data_keys WHERE scope_kind = 'user'
      AND scope_id = NEW.user_id AND purpose = 'content') THEN
    RAISE EXCEPTION 'project_draft_requires_encryption' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'project_draft_identity_is_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.encryption_version < OLD.encryption_version THEN
      RAISE EXCEPTION 'project_draft_encryption_downgrade' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['encryption_checked_at','encryption_revision','updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['encryption_checked_at','encryption_revision','updated_at']) THEN
      NEW.encryption_revision := OLD.encryption_revision + 1;
    ELSE NEW.encryption_revision := OLD.encryption_revision;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_drafts_encryption_guard BEFORE INSERT OR UPDATE ON public.project_drafts
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_draft_encryption();
REVOKE ALL ON FUNCTION public.guard_project_draft_encryption() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.set_project_draft_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_setting('minddy.encryption_maintenance', true) = 'on' THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER project_drafts_set_updated_at ON public.project_drafts;
CREATE TRIGGER project_drafts_set_updated_at BEFORE UPDATE ON public.project_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_project_draft_updated_at();
REVOKE ALL ON FUNCTION public.set_project_draft_updated_at() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.save_project_draft_guarded(
  p_id uuid, p_actor_id uuid, p_name text, p_step text, p_data jsonb,
  p_encryption_version integer, p_encrypted_content text, p_expected_revision bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before public.project_drafts%ROWTYPE; v_after public.project_drafts%ROWTYPE;
BEGIN
  IF p_id IS NULL OR p_actor_id IS NULL OR p_step IS NULL OR p_step = '' OR
    p_encryption_version IS NULL OR p_encryption_version < 0 THEN
    RAISE EXCEPTION 'project_draft_values_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_before FROM public.project_drafts WHERE id = p_id FOR UPDATE;
  IF FOUND THEN
    IF v_before.user_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'project_draft_owner_mismatch' USING ERRCODE = '42501';
    END IF;
    IF p_expected_revision IS NULL OR p_expected_revision <> v_before.encryption_revision THEN
      RAISE EXCEPTION 'project_draft_revision_conflict' USING ERRCODE = '40001';
    END IF;
    UPDATE public.project_drafts SET name = p_name, step = p_step, data = p_data,
      encryption_version = p_encryption_version, encrypted_content = p_encrypted_content
      WHERE id = p_id RETURNING * INTO v_after;
  ELSE
    IF p_expected_revision IS NOT NULL THEN
      RAISE EXCEPTION 'project_draft_revision_conflict' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.project_drafts(id,user_id,name,step,data,encryption_version,encrypted_content)
      VALUES (p_id,p_actor_id,p_name,p_step,p_data,p_encryption_version,p_encrypted_content)
      RETURNING * INTO v_after;
  END IF;
  RETURN to_jsonb(v_after);
END;
$$;
REVOKE ALL ON FUNCTION public.save_project_draft_guarded(uuid,uuid,text,text,jsonb,integer,text,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_project_draft_guarded(uuid,uuid,text,text,jsonb,integer,text,bigint)
  TO service_role;

CREATE FUNCTION public.migrate_project_draft_ciphertext(
  p_id uuid, p_user_id uuid, p_revision bigint, p_previous_version integer,
  p_encryption_version integer DEFAULT NULL, p_encrypted_content text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected integer; previous_setting text := current_setting('minddy.encryption_maintenance', true);
BEGIN
  PERFORM set_config('minddy.encryption_maintenance', 'on', true);
  IF p_encryption_version IS NULL AND p_encrypted_content IS NULL THEN
    UPDATE public.project_drafts SET encryption_checked_at = clock_timestamp()
      WHERE id = p_id AND user_id = p_user_id AND encryption_revision = p_revision
        AND encryption_version = p_previous_version;
  ELSE
    UPDATE public.project_drafts SET name = NULL, data = NULL,
      encrypted_content = p_encrypted_content, encryption_version = p_encryption_version
      WHERE id = p_id AND user_id = p_user_id AND encryption_revision = p_revision
        AND encryption_version = p_previous_version;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM set_config('minddy.encryption_maintenance', COALESCE(previous_setting, ''), true);
  RETURN affected = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_project_draft_ciphertext(uuid,uuid,bigint,integer,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_project_draft_ciphertext(uuid,uuid,bigint,integer,integer,text)
  TO service_role;

COMMIT;
