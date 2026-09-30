BEGIN;

ALTER TABLE public.feedback_boards
  ADD COLUMN sso_encryption_checked_at timestamptz;
CREATE INDEX feedback_sso_content_queue ON public.feedback_boards
  (sso_encryption_checked_at NULLS FIRST,id) WHERE sso_secret IS NOT NULL;

CREATE TABLE public.feedback_sso_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback_sso_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_sso_encryption_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.feedback_sso_encryption_scope TO service_role;

CREATE FUNCTION public.guard_feedback_sso_secret()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE active boolean; old_version integer; new_version integer;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR
      NEW.project_id IS DISTINCT FROM OLD.project_id) THEN
    RAISE EXCEPTION 'board_sso_binding_immutable' USING ERRCODE='23514';
  END IF;
  active := EXISTS (SELECT 1 FROM public.feedback_sso_encryption_scope)
    OR NEW.sso_secret LIKE 'mdyb3:%';
  IF NEW.sso_secret LIKE 'mdyb3:%' THEN
    IF NEW.sso_secret !~ '^mdyb3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
      RAISE EXCEPTION 'board_sso_ciphertext_invalid' USING ERRCODE='23514';
    END IF;
    new_version := split_part(NEW.sso_secret,':',2)::integer;
    IF TG_OP='UPDATE' AND OLD.sso_secret LIKE 'mdyb3:%' THEN
      old_version := split_part(OLD.sso_secret,':',2)::integer;
      IF new_version < old_version THEN
        RAISE EXCEPTION 'board_sso_key_rollback' USING ERRCODE='23514';
      END IF;
    END IF;
    INSERT INTO public.feedback_sso_encryption_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
  ELSIF NEW.sso_secret IS NOT NULL AND active AND
      (TG_OP='INSERT' OR NEW.sso_secret IS DISTINCT FROM OLD.sso_secret) THEN
    RAISE EXCEPTION 'board_sso_requires_encryption' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER feedback_sso_root_guard
  BEFORE INSERT OR UPDATE ON public.feedback_boards FOR EACH ROW
  EXECUTE FUNCTION public.guard_feedback_sso_secret();
REVOKE ALL ON FUNCTION public.guard_feedback_sso_secret()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_feedback_sso_secret(
  p_id uuid,p_old text,p_new text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.feedback_boards;
BEGIN
  SELECT * INTO row FROM public.feedback_boards WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row.sso_secret IS DISTINCT FROM p_old THEN RETURN false; END IF;
  UPDATE public.feedback_boards SET sso_secret=p_new,
    sso_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_feedback_sso_secret(uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_feedback_sso_secret(uuid,text,text)
  TO service_role;

-- Preserve the only-if-absent row lock while binding ciphertext to the board.
CREATE FUNCTION public.write_feedback_sso_secret_protected(
  p_project_id uuid,p_board_id uuid,p_sso_secret text,
  p_only_if_absent boolean DEFAULT false
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.feedback_boards;
BEGIN
  SELECT * INTO row FROM public.feedback_boards WHERE project_id=p_project_id
    FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF row.id<>p_board_id THEN
    RAISE EXCEPTION 'board_sso_binding_changed' USING ERRCODE='40001';
  END IF;
  IF p_only_if_absent AND row.sso_secret IS NOT NULL THEN
    RETURN row.sso_secret;
  END IF;
  IF p_sso_secret !~ '^mdyb3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'board_sso_ciphertext_invalid' USING ERRCODE='23514';
  END IF;
  UPDATE public.feedback_boards SET sso_secret=p_sso_secret WHERE id=row.id;
  RETURN p_sso_secret;
END;
$$;
REVOKE ALL ON FUNCTION public.write_feedback_sso_secret_protected(
  uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.write_feedback_sso_secret_protected(
  uuid,uuid,text,boolean) TO service_role;

COMMIT;
